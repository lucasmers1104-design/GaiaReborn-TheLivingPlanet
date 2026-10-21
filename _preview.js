/* Fast-forward a fresh planet to a living one, for screenshots.
 * URL parameters (all optional): ticks=3000, seed=<n>, epoch=<id> (see
 * src/epochs.ts), zoom=<px per tile>, x=<tile> y=<tile> (centre),
 * terrain=legacy (read by the renderer), dino=comet|survive (answer the first
 * birds' question at once, the comet striking without its show), dino=show
 * (answer 'comet' and leave the strike to the app's show); without it play
 * stops at the question, which the app then asks.
 * space=<0..1>|launched and spacewin=1: see below.
 * `previewAdvance(n)` plays n more ticks the same way, for an age series. */
window.addEventListener('load', () => {
  const app = SE.app;
  const q = new URLSearchParams(location.search);
  // Straight to the planet: the title screen would cover the screenshot.
  if (app.title) app.title.close();
  if (q.has('seed')) app.world.seed = Number(q.get('seed')) >>> 0;
  // Not saved: the settings only reach storage when the player changes one.
  if (SE.isEpochId(q.get('epoch'))) app.settings.epoch = q.get('epoch');
  if (q.has('seed') || q.has('epoch')) app.newPlanet({ quiet: true, keepSeed: true });
  // Play the evolution tree the way an eager player would: develop the
  // cheapest available step every few ticks.
  const dino = q.get('dino');
  window.previewAdvance = (n) => {
    for (let t = 0; t < n; t++) {
      const w = app.world;
      if (w.dinoEra.fate === 'deciding') {
        if (dino !== 'comet' && dino !== 'survive' && dino !== 'show') break;
        SE.chooseDinoFate(w, app.evolution, dino === 'survive' ? 'survive' : 'comet');
        if (dino === 'show') break;
        if (dino === 'comet') SE.applyComet(w, app.params, app.life, app.hazards, app.evolution);
      }
      app.tick();
      if (t % 5 !== 0) continue;
      app.evolution.refresh(app.world, app.params, true);
      const ids = app.evolution.availableIds().sort((a, b) => SE.evoNode(a).cost - SE.evoNode(b).cost);
      if (ids.length) app.developNode(ids[0]);
    }
    app.editView.markDirty();
  };
  app.developNode('cells');
  window.previewAdvance(q.has('ticks') ? Number(q.get('ticks')) : 3000);
  if (q.has('zoom')) app.editView.tilePx = Number(q.get('zoom'));
  app.editView.centerOn(q.has('x') ? Number(q.get('x')) : SE.GRID_W * 0.35 | 0, q.has('y') ? Number(q.get('y')) : SE.GRID_H * 0.42 | 0);
  // space=<progress 0..1>|launched: a Nanotech city, its launch site at that progress (src/spaceport.ts) and the
  // map centred on it; spacewin=1 also opens the project window.
  const space = q.get('space');
  if (space !== null) {
    const w = app.world;
    if (w.sentientClass === SE.Life.None) w.sentientClass = SE.Life.Mammal;
    let city = -1;
    let best = -Infinity;
    for (let i = 0; i < SE.TILE_COUNT; i++) {
      if (!SE.citySiteAllowed(w, i)) continue;
      const score = SE.citySiteScore(w, i);
      if (score > best) { best = score; city = i; }
    }
    if (city >= 0) {
      w.tech[city] = SE.Tech.Nanotech;
      w.cityPop[city] = 0.9;
      app.civ.sync(w, app.params);
      w.civ.news.length = 0;
      SE.stepSpaceport(w);
      w.civ.news.length = 0;
      w.space.progress = space === 'launched' ? 1 : Math.min(1, Math.max(0, Number(space) || 0));
      w.space.announced = SE.spacePhase(w.space.progress);
      if (space === 'launched') SE.commitLaunch(w);
      const site = w.space.site;
      if (site >= 0) app.editView.centerOn(site % SE.GRID_W, Math.floor(site / SE.GRID_W) - 1);
      if (q.get('spacewin') === '1') app.openSpaceport();
    }
    app.editView.markDirty();
  }
  document.title = 'ready';
});
