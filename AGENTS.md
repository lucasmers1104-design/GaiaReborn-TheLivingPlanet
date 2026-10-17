## Project
- Genre: nature and evolution sandbox, a modern successor to SimEarth: The Living Planet (Maxis, 1990)
 
- Stack: TypeScript 5.9 (`strict`, target ES2020), no runtime dependencies, no framework, no bundler; Canvas 2D for the pixel map (landscape: a generated 16×16 pixel-art PNG atlas), hand-written SVG for assets and films; tests with `node:test` on Node 22. Use only APIs of these versions.
- Target: desktop and mobile browsers. `index.html` must keep running straight from disk over `file://`, with no server. Input: mouse and touch. Only headless Chrome has been verified so far.

## Commands
- Build: `npm run build` (tsc → `simulation.js`, then `tools/stamp-version.js` writes the `package.json` version into it; `npm version` rebuilds) · `npm run watch` while working (version shows as `dev`)
- Run the game for the user: build, then open `index.html` in the browser
- Typecheck: `npm run typecheck`
- Test:
  - `npm run test:quick`: core tests with short simulations (incl. coal and giant clubmosses), ~30 s; needs a current build.
  - `npm run test:full` (= `npm test`): builds, then runs every test file (~230 tests, ~9 min; founding and evolution take most of it).
  - Single file: `npm run build`, then `node --test --test-reporter=dot tests/<name>.test.js`.
  - Map look on one seed in seconds: `node tools/green-probe.js [seed]` (young rock, greening, plants drawn) and `node tools/relief-probe.js` (mountains, rock rule, tree line, rain shadow).
  - Parallel work: build to your own file (`npx tsc -p tsconfig.json --outFile <scratch>/simulation.js`) and set `SE_BUNDLE=<that file>` for tests and the probe, so the shared `simulation.js` stays untouched
- Headless probe: `npm run probe` or `node tools/headless.js [ticks] [seed …] [--life] [--timeline] [--map] [--track] [--epoch=<id>]`. Use it for tuning results that unit tests can't show (deserts, rivers, erosion, how the biosphere grows, when each step lands on the Earth calendar).
- Landscape art: `node tools/terrain-atlas.js [--check] [--sheet [dir]] [--part a,b] [--family cold|temperate|warm|wet|mountain|coast] [--write]` builds every terrain texture, edge mask and plant object from the recipes in `tools/terrain/`, checks them and renders contact sheets; `--write` regenerates `assets/terrain/` and `src/terrainatlas.ts` (one writer at a time). `tests/terrain.test.js` fails while the committed atlas is stale.
- Disaster effects: `node tools/fx-atlas.js [--check] [--sheet [file]] [--write]` builds the effect sprites and animated ground textures from `tools/fx/`; `--write` (lead only) regenerates `assets/fx/` and `src/fxatlas.ts`, which `tests/fxatlas.test.js` checks. `node tools/fx-record.js --kind <id> [--x N --y N] [--zoom px] [--reduce]` records a disaster on the map (animated PNG, contact sheet, frames; headless Chrome, honours `SE_BUNDLE`). `node tools/hazard-probe.js [--kind id] [seed …]` prints reach, spread and healing times.
- Earth map: `node tools/earth-map.js [etopo.asc] [--fetch] [--png <file>] [--write]` averages NOAA ETOPO1 onto the grid and regenerates `src/earthmap.ts` (the epoch "Heute").
- Civilization: `node tools/civ-probe.js [civTicks] [seed …] [--epoch=<id>]` plays a planet to sentience and checks spacing, sites, settlers, peoples, epidemics, conflicts, land share and CO₂ against `docs/zivilisation-spec.md` §6 (standard set: `2500 12345 2024 99` and `2500 12345 --epoch=today`). City art: `node tools/civ-atlas.js [--check] [--sheet [dir]] [--part blocks,cities] [--era <id>] [--write]` builds city blocks, yards, bridges and banners from `tools/civ/`; `--write` (one writer at a time) regenerates `assets/civ/` and `src/civatlas.ts`, which `tests/civart.test.js` checks.
- Species art: `node tools/species-sheet.js <id> [--file <draft.ts>] [--out <png>]` renders a class's or plant group's icons at map size on real ground colours (headless Chrome, serialized by a lock) and prints every `PROBLEM` the art test would report.
- Screenshots: `_preview.html` closes the title screen, fast-forwards a planet with a greedy evolution tree and sets `document.title = 'ready'`. Capture it with headless Chrome over the DevTools protocol. Window width is clamped to ≥ 500 px, so phone views (390 × 844) need CDP device emulation. Run browser checks one at a time.

## Layout
- `src/` holds all TypeScript. Every file is one `namespace SE { … }`. `tsc` concatenates the files into one classic script, `simulation.js`, in the order of `files` in `tsconfig.json`. There are no ES modules: cross-file references go through `SE`, and a file may only use at load time what earlier files define.
  - `util` — shared helpers (`Rng`, grid math, DOM helpers)
  - simulation: `constants`, `params`, `calendar`, `world`, `epochs` (start planets: random or the Earth in an epoch; `youngearth`, `earthtoday`, `earthmap` GENERATED), `river`, `geo`, `climate`, `oceanchem`, `flora`, `lycopsids` (giant clubmosses: spores, displacement, their end), `landscape` (landscape/substrate enums and succession tables), `succession` (landscape, soil, density per tile), `biome` (habitat derived from the landscape), `coal` + `coalsave` (planet-wide coal reserve, optional save field), `life`, `evolution`, `spontaneous`, civilization (`civstate` records beside the `tech`/`cityPop` grid, `civsite` the only terrain reader for city sites, `cities`, `tribes`, `migration`, `epidemic`, `conflict`, `civsave` optional save field, `civ` the tick), `hazardstate` + `hazards` + `scars` + `hazard<kind>` + `hazardchain` (disasters on one tile, their spread, scars and chain reactions; `hazardadapter` holds the height task's stand-ins until it is merged), `save`. These never touch the DOM, `app` or render/UI code, because tests and the headless probe run them in Node.
  - species art (pure data, Node-safe): `species/types.ts` (format, palette, registry), `species/<class-id>.ts` (8 sub-species + biome specialists per animal class), `floraart/<group-id>.ts` (sparse/dense cover + specialists per plant group)
  - map rendering: `sprites`, `terrainatlas` (GENERATED pixel-art atlas + manifest), `artdraw` (vector icons: Path2D on canvas, inline SVG in windows), `artvariants` (biome specialists), `terrainart`, `tilecache`, `land*` (pixel-landscape compositor: `landatlas`, `landtables`, `landfield`, `landobjects`, `landwater`, `landrivers`, `landriverdraw`, `landsurf` (surf and river pixels read off each composed chunk), `landcompose`, `landview`), `examineview` (Examine window crop), `ambient`, `watermotion` (surf and river current drawn per frame), `waterspray` (spray where big waves break), `herds` (wandering animal icons), city layer (`civatlas` GENERATED, `citylayout`, `citycompose`, `citylayer`, `citynames`, `civart/*` SVG settlers, boats, markers and battle symbol, `civfigures`), `fx*` (disaster effect layer: `fxatlas` GENERATED, `fxart`, `fxparticles`, `fxrings`, `fxground`, `fxshow`, `fx<kind>` scripts, `fxscars`, `fxmarker` (beacons when zoomed out), `fxlayer`), `render`, `maplegend`
  - UI and windows: `ui`, `charts`, `sliders`, `oceanslider`, `planetpicker`, `windows`, `panels`, `historyview`, `report`, `graphs`, `gaia`, `modelscenes`, `modelhero`, `speciesstrip`, `tree`, `savesview`, `settingsview`, `title` + `titleplanet` + `titledecor` (title screen), `notify`
  - evolution moments: `stories-*` (German texts), `scenekit`, `films/<step-id>.ts` (one film per step; shared parts in `films/parts-*.ts`), `celebrate`, `showcase`
  - `app.ts` — wiring, player actions, game loop and bootstrap; last in the build order
- `styles.css` — design system; feature styles live in `css/*.css`, each imported at the top of `styles.css`
- `assets/` — hand-written SVGs in `evolution/`, `ui/`, `resources/`, `habitats/`, `events/`; filename = id. `assets/terrain/` holds the generated landscape atlas (`atlas.png`, `manifest.json`)
- `tests/*.test.js` — `node:test` against the built `simulation.js`; `tests/helpers.js` wires a UI-free simulation (`makeSim(seed, epoch)`)
- `tools/fx-atlas.js` + `tools/fx/` — disaster effect generator: `catalog.js` (the contract), `kit.js`, family recipes (`smoke.js`, `volcano.js`, …), `sheet.js`
- `tools/terrain-atlas.js` + `tools/terrain/` — landscape art generator: `catalog.js` (the contract: material, landscape, object and plant-group ids), `palette.js`, `kit.js`, `masks.js`, family recipes `cold|temperate|warm|wet|mountain|coast.js`, `preview.js`/`sheet.js` (contact sheets)
- `tools/earth-map.js` — today's Earth from NOAA ETOPO1 onto the grid
- `tools/headless.js` — headless probe (`--biomes`: zone coherence, latitude profile, natural neighbours); `tools/species-sheet.js` + `tools/artcheck.js` — species art contact sheet and format check
- `scripts/ship.mjs` — checks, commit and push (see Git)
- `docs/<topic>-<yyyy>-<mm>/` — German reports per overhaul, with screenshots
- `docs/done.md` — log of shipped changes, written by `scripts/ship.mjs`; don't edit it by hand
- `simulation.js` — generated by `tsc` and committed, so a clone runs straight from disk; never edit it by hand
- `_preview.*` — screenshot preview page; `_shot*.png`, `_sprite*` — local scratch files, ignored by git

## Communication
- Talk to the user in German. Code, identifiers and comments in English; player-facing text and the docs in `docs/` in German.

## Context
- Open known files/symbols directly; otherwise search names/symbols first. Read only the ranges you need; never scan the whole repo. `app.ts`, `sprites.ts`, `evolution.ts`, `render.ts` and `tree.ts` are large, so read them in ranges.
- Read docs only when their trigger applies:
  - `docs/ueberarbeitung-2026-10/evolution.md` — changing the evolution tree, flora, life or their rules
  - `docs/ueberarbeitung-2026-10/quellenpruefung.md` — changing scientific content (lineages, dates, stories, facts)
  - `docs/grafik-2026-10/bericht.md` — changing the map look, windows, charts or title screen
  - `docs/grafik-2026-10/evolutionsmomente.md`, `drehbuecher.md` — changing spontaneous evolution, the showcase or a film
  - section "Einschränkungen" in both `bericht.md` files — before claiming what has been tested
  - `assets/README.md` — adding or renaming assets
  - `docs/oekosystem-2026-10/grafikstil.md` — drawing or changing animal/plant icons in `src/species/` or `src/floraart/`
  - `docs/oekosystem-2026-10/bericht.md` — changing the calendar, ocean oxygen, spawning, sub-species, herds or the ocean slider
  - `docs/zivilisation-spec.md` — changing cities, settlers, peoples, epidemics, conflicts or the city graphics
  - `docs/biomes-spec.md` — changing landscapes, succession, soil, the latitude climate or the pixel-landscape renderer
  - `docs/landschaft-2026-10/stil.md` — drawing or changing landscape textures and plant objects in `tools/terrain/`
  - `docs/ereignisse-spec.md` — changing disasters, their spread, scars or the effect layer; `docs/ereignisse-2026-10/stil.md` — drawing effects in `tools/fx/`
  - `docs/epochen-2026-10/bericht.md` — changing epochs, the planet picker or how a new planet's crust is made
- Don't read or hand-edit these unless the task targets them: `simulation.js` (generated, > 1 MB), `src/terrainatlas.ts` (generated; read only its interface header), `src/earthmap.ts` (generated data), `assets/terrain/` (generated), `node_modules/`, the SVGs in `assets/`, PNG screenshots, `docs/review-2026-09-08/` (historical).
- Filter long command output for errors (grep); the first error is usually the cause.

## Code
- Smallest coherent change; no unrelated edits, no full-file rewrites.
- Add comments or docstrings only for constraints or rationale the code can't express (e.g. browser quirks, measured tuning); intent goes into names and types.
- No new abstractions, wrappers or dependencies without a concrete need. No runtime dependencies, bundler or ES modules: the `file://` start must keep working.
- One responsibility per file; put new features in new files instead of growing files past ~300 lines. Many files are already larger; keep your edits there to wiring.
- A new `.ts` file goes into `files` in `tsconfig.json`, after everything it uses at load time. A new `.css` file gets an `@import` in `styles.css`.
- Pass randomness and time into game rules so they stay testable. Simulation randomness comes from the seeded `world.rng` or a hash roll (like `spontaneousRoll`), never from `Math.random()` or `Date.now()`. `Math.random()` is fine for purely visual effects.
- Player actions (tools, evolution steps, model panels, disasters) check cost and conditions in `app.ts` before they change the world (`spend()`, `developNode()` returning a reason). Never trust UI state.
- Balancing values (costs, rates, thresholds, tree data) live in `constants.ts`, `params.ts` and the tables in `evolution.ts`, not inline in logic. Sliders run 0..1, with 0.5 as the calibrated default.
- Player-facing text is German and lives in the code tables (`constants.ts`, `evolution.ts`, `stories-*.ts`, UI files). There is no i18n layer; don't add one unasked.
- Save format changes bump `SAVE_FORMAT` in `src/save.ts` and come with a migration from the previous format (see `migrateV4`). Old saves are read, never deleted.
- Assets are SVG, in the style of `assets/README.md`, and included via `evoIcon`, `uiIcon`, `resIcon`, `habitatAsset` and `eventIcon`. Only the map's landscape (ground, transitions, plant objects) the disaster effects and the cities are pixel-art PNG, generated from recipes by `tools/terrain-atlas.js`, `tools/fx-atlas.js` and `tools/civ-atlas.js`; never paint them by hand. Whales surfacing on the open sea at ≥ 16 px per tile are fx-atlas pixel sprites (`tools/fx/fauna.js`); further out, and all other animals and graphics, stay SVG.
- Films run 12 s in 4 beats, with `sparkle()` at 6–8 s. Show change across generations with `morph()` plus `timelapse()`, never an individual transforming. Phrase advantages as selection, never as purpose. No scripts, SMIL, filters or remote resources in SVG.
- Don't drop validation or error handling when simplifying.

## Workflow
1. Ambiguous and costly to redo? Ask first; when running unattended, pick the most reasonable reading and state it.
2. Before changing shared code, types, method names or data formats, find all references. That includes string references in tests, `tools/headless.js`, `_preview.js`, CSS class names and asset filenames (node ids are filenames).
3. Build, then run focused checks: `npm run typecheck`, `npm run test:quick` or the affected test files. Run `npm run test:full` once, before finishing a larger change, and don't rebuild `simulation.js` while it runs.
   - Never pull whole test logs into context. Redirect to a file and show only the summary and the failing tests (`--test-reporter=dot`, `grep`, `tail`).
   - Reproduce a bug with the shortest run that shows it (one seed, few ticks, a probe) before running suites. Check tuning with the headless probe and UI with a headless-Chrome screenshot. Report what ran, what didn't, and what needs manual playtesting (other browsers, real touch devices, sound).
4. Update docs only where facts changed: the matching German report in `docs/`. Never document what code or tooling already shows.

## Git
- Remote: `origin` = https://github.com/DreamstudiosGit/earthsim, default branch `main`.
- Commit or push only when the user asks; then always run `node scripts/ship.mjs "<type>(<scope>): <summary>"`. Never commit or push with plain `git`, which skips the checks.
  - It builds and runs the quick tests (`--full`: the whole suite), releases a new version, logs to `docs/done.md`, commits all changes, tags the version, pushes to `origin` and opens a PR from non-main branches (needs `gh`; otherwise it prints the compare link).
  - Every commit is a new version: `version` in `package.json` (and the lockfile), tag `v<version>`, and the version at the end of the commit subject and in `docs/done.md`. The patch number goes up by one (0.6.0 → 0.6.1); `--minor` → 0.7.0, `--major` → 1.0.0. A version set by hand (`npm version <x.y.z> --no-git-tag-version`) is released as is while it has no tag. Never change versions or tags any other way.
  - `--dry-run` runs the checks and lists what would be committed as which version. Further quoted arguments become body paragraphs of the commit message.
  - type: `feat|fix|perf|refactor|style|test|docs|build|chore`; scope: the area touched, e.g. `evolution`, `flora`, `climate`, `save`, `map`, `ui`, `films`, `assets`, `docs`, `tools`.
- Never discard changes you didn't make.
