/* =============================================================================
 * Gaia Reborn — trailer: what runs in the game's page
 * -----------------------------------------------------------------------------
 * The virtual clock (with the sound log) that tools/trailer-record.js installs
 * before the page's scripts, and the stylesheets that keep the German interface
 * out of the English trailer. Used by the recorder and the shot list (shots.js).
 * ========================================================================== */
'use strict';

/** Installed before the page's scripts; inert until __vt.start(), so the page boots on the real clock. */
const VIRTUAL_CLOCK = `(() => {
  const W = window;
  const P = W.performance;
  const real = {
    now: P.now.bind(P), date: Date.now, raf: W.requestAnimationFrame.bind(W), caf: W.cancelAnimationFrame.bind(W),
    st: W.setTimeout.bind(W), ct: W.clearTimeout.bind(W), si: W.setInterval.bind(W), ci: W.clearInterval.bind(W),
  };
  let on = false;
  let t = 0;
  let dateOffset = 0;
  let nextId = 1e7;
  let rafs = new Map();
  const timers = new Map();
  // Asked for before start(): they run on the real clock until start() takes them over.
  const pendingRaf = new Map();
  const pendingTimers = new Map();
  // Web Animations (the R.I.P. stamp, window motion) run on the browser's own clock: started while the virtual one runs,
  // they are paused and moved on with it. CSS keyframe animations are not covered.
  const anims = new Set();
  const animate = Element.prototype.animate;
  Element.prototype.animate = function (...a) {
    const an = animate.apply(this, a);
    if (on) { an.pause(); an.t0 = t; anims.add(an); }
    return an;
  };
  P.now = () => (on ? t : real.now());
  Date.now = () => (on ? t + dateOffset : real.date());
  W.requestAnimationFrame = (cb) => {
    if (on) { const id = nextId++; rafs.set(id, cb); return id; }
    const id = real.raf((ts) => { pendingRaf.delete(id); cb(ts); });
    pendingRaf.set(id, cb);
    return id;
  };
  W.cancelAnimationFrame = (id) => { rafs.delete(id); pendingRaf.delete(id); real.caf(id); };
  const timer = (every) => (cb, ms, ...args) => {
    const d = Math.max(every ? 1 : 0, Number(ms) || 0);
    if (typeof cb !== 'function') return (every ? real.si : real.st)(cb, ms, ...args);
    if (on) { const id = nextId++; timers.set(id, { at: t + d, every: every ? d : 0, cb, args }); return id; }
    const id = (every ? real.si : real.st)((...a) => { if (!every) pendingTimers.delete(id); cb(...a); }, ms, ...args);
    pendingTimers.set(id, { at: real.now() + d, every: every ? d : 0, cb, args });
    return id;
  };
  W.setTimeout = timer(false);
  W.setInterval = timer(true);
  W.clearTimeout = W.clearInterval = (id) => { timers.delete(id); pendingTimers.delete(id); real.ct(id); real.ci(id); };
  W.__vt = {
    start() {
      if (on) return;
      t = real.now();
      dateOffset = real.date() - t;
      on = true;
      for (const [id, cb] of pendingRaf) { real.caf(id); rafs.set(id, cb); }
      pendingRaf.clear();
      for (const [id, x] of pendingTimers) { real.ct(id); real.ci(id); timers.set(id, x); }
      pendingTimers.clear();
    },
    /** Due timers in order, then one animation frame. */
    step(ms) {
      const end = t + ms;
      for (;;) {
        let id = -1;
        let next = null;
        for (const [k, x] of timers) if (x.at <= end && (!next || x.at < next.at)) { id = k; next = x; }
        if (!next) break;
        t = Math.max(t, next.at);
        if (next.every) next.at += next.every; else timers.delete(id);
        try { next.cb(...next.args); } catch (e) { console.error(e); }
      }
      t = end;
      for (const an of anims) {
        const at = t - an.t0;
        if (an.playState === 'idle') anims.delete(an);
        else if (at >= an.effect.getComputedTiming().endTime) { an.finish(); anims.delete(an); } else an.currentTime = at;
      }
      const due = rafs;
      rafs = new Map();
      for (const cb of due.values()) try { cb(t); } catch (e) { console.error(e); }
    },
  };
  // Every sound the game starts while the clock runs (src/music.ts playSfx makes an Audio per effect), with the frame
  // (window.__f): tools/trailer-cut.js lays the same file at the same moment.
  W.__sfx = [];
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (...a) {
    if (on && !/[/\\\\]music[/\\\\]/.test(this.src)) {
      W.__sfx.push([W.__f, decodeURIComponent(this.src).replace(/^.*[/\\\\]assets[/\\\\]audio[/\\\\]/, ''), this.volume, this.playbackRate, this.currentTime, this.loop]);
    }
    return play.apply(this, a);
  };
})();`;

/** The living interface as players see it, without windows, notes and tooltips: German, and they cover the map. */
const CSS_UI = `.world-canvas { outline: none !important; }
.win, .goal, .companion-say, .toasts, .toast, .milestones, .showcase, .showcase-backdrop, .fauna-toast,
.dock-panel, .dock-collapse, .map-zoom, .hover-tip, .rip-stamp { display: none !important; }
.lt-date, .lt-scale { visibility: hidden !important; }`;
/** The map fills the window below Gaia's rail; the top bar goes. */
const CSS_MAP = `${CSS_UI}
:root { --topbar-h: 0px !important; }
#topbar { visibility: hidden !important; }`;
/** Map shots: Gaia, her rail and vines go too. */
const CSS_CLEAN = `${CSS_MAP}
.rail, .companion, .vines-back, .vines-front, .vines-top, .vines-hang, .magic-layer, .magic-glow { display: none !important; }`;

module.exports = { VIRTUAL_CLOCK, CSS_UI, CSS_MAP, CSS_CLEAN };
