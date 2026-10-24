'use strict';
/*
 * The experimental water effects (src/waterfx.ts, src/waterfxgl.ts): the
 * page-load switch, the zoom fade, the palette they may lift to, and the
 * fallback to the plain water when WebGL2 is missing, the shader fails or
 * the context is lost — once, without trying again. The picture itself is
 * checked in the browser (docs/riffe-2026-10/bericht.md, "Wassereffekte").
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSE } = require('./helpers');

const SE = loadSE();
const M = SE.TERRAIN_MANIFEST;

test('?waterfx=on|off overrides the saved switch for one load, anything else leaves it', () => {
  assert.equal(SE.waterFxQuery('?waterfx=on'), true);
  assert.equal(SE.waterFxQuery('?seed=7&waterfx=off&zoom=32'), false);
  assert.equal(SE.waterFxQuery('?waterfx=1'), null);
  assert.equal(SE.waterFxQuery('?nowaterfx=on'), null);
  assert.equal(SE.waterFxQuery(''), null);
});

test('the effects fade out zooming out and are gone below 16 px per tile', () => {
  assert.equal(SE.waterFxStrength(15.9), 0);
  assert.equal(SE.waterFxStrength(10), 0);
  const s16 = SE.waterFxStrength(16);
  assert.ok(s16 > 0 && s16 < 0.5, `16 px: ${s16}`);
  assert.ok(SE.waterFxStrength(24) > s16);
  assert.equal(SE.waterFxStrength(32), 1);
  assert.equal(SE.waterFxStrength(48), 1);
});

test('caustics and glint lift only to palette colours, never to foam, ice or white', () => {
  const art = SE.LandArt.fromIndices(new Uint8Array(M.width * M.height));
  const lut = SE.waterFxColors(art);
  const glare = new Set([art.water[art.water.length - 1], ...M.ramps.ice, ...(M.ramps.white || [])]);
  const palette = new Map(M.palette.map((c, i) => [c.slice(0, 3).join(','), i]));
  let caustics = 0;
  let glints = 0;
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 256; i++) {
      const o = (row * 256 + i) * 4;
      if (lut[o + 3] === 0) continue;
      const to = palette.get([lut[o], lut[o + 1], lut[o + 2]].join(','));
      assert.ok(to !== undefined, `row ${row} index ${i}: not a palette colour`);
      assert.ok(!glare.has(to), `row ${row} index ${i} lifts to ${to}`);
      if (row === 0) caustics++;
      else {
        if (row === 1) glints++;
        assert.equal(art.isWater[i], 1, `glint on ${i}, not water`);
      }
    }
  }
  // Corals and reef sand under water take the caustics.
  for (const i of M.ramps.coral) assert.ok(lut[i * 4 + 3] === 255 || lut[i * 4 + 3] === 0);
  assert.ok(M.ramps.coral.some((i) => lut[i * 4 + 3] === 255), 'no coral takes a caustic');
  assert.ok(caustics > 10 && glints > 5, `${caustics} caustic, ${glints} glint colours`);
  // Open sea's deep blues glint a step lighter.
  assert.equal(lut[(256 + M.ramps.water[1]) * 4 + 3], 255);
});

/** A canvas whose WebGL2 context is `gl` (or none), counting the tries. */
function fakeCanvas(gl) {
  const c = { tries: 0, listeners: {}, width: 1, height: 1 };
  c.getContext = (kind) => { c.tries++; return kind === 'webgl2' ? gl : null; };
  c.addEventListener = (type, fn) => { c.listeners[type] = fn; };
  return c;
}

/** Just enough of WebGL2 for the stage's set-up; `compiles` false fails every shader, `maxTexture` is MAX_TEXTURE_SIZE. */
function fakeGl(compiles, maxTexture = 16384) {
  const calls = { compiled: 0, lost: 0 };
  return new Proxy({ calls }, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'getShaderParameter' || key === 'getProgramParameter') return () => compiles;
      if (key === 'compileShader') return () => { calls.compiled++; };
      if (key === 'getParameter') return () => maxTexture;
      if (key === 'getExtension') return (name) => (name === 'WEBGL_lose_context' ? { loseContext: () => { calls.lost++; } } : null);
      if (key === 'getShaderInfoLog' || key === 'getProgramInfoLog') return () => 'fake';
      if (typeof key === 'string' && /^[A-Z0-9_]+$/.test(key)) return 1;
      return () => ({});
    },
  });
}

function withCanvas(canvas, fn) {
  const make = SE.WaterFx.makeCanvas;
  const warn = console.warn;
  const warnings = [];
  console.warn = (...a) => warnings.push(a.join(' '));
  SE.WaterFx.makeCanvas = () => canvas;
  try { fn(warnings); } finally { SE.WaterFx.makeCanvas = make; console.warn = warn; }
}

test('off by default: nothing is made, nothing drawn', () => {
  const fx = new SE.WaterFx();
  assert.equal(fx.enabled, false);
  assert.equal(fx.state, 'off');
  assert.equal(SE.waterFxNote(fx.state), '');
  // Off, draw returns before it looks at anything.
  fx.draw(null, null, 0, 0, null, null, null, false, 0);
});

test('without WebGL2 the map keeps its water, and the stage is not tried again', () => {
  const canvas = fakeCanvas(null);
  withCanvas(canvas, (warnings) => {
    const fx = new SE.WaterFx();
    fx.enabled = true;
    assert.equal(fx.state, 'nowebgl');
    assert.match(SE.waterFxNote(fx.state), /Standardwasser/);
    fx.enabled = false;
    assert.equal(fx.state, 'off');
    fx.enabled = true;
    fx.enabled = true;
    assert.equal(canvas.tries, 1);
    assert.equal(warnings.length, 1);
    fx.draw(null, null, 0, 0, null, null, null, false, 0);
  });
});

test('a shader that does not compile falls back once', () => {
  const gl = fakeGl(false);
  const canvas = fakeCanvas(gl);
  withCanvas(canvas, (warnings) => {
    const fx = new SE.WaterFx();
    fx.enabled = true;
    fx.enabled = false;
    fx.enabled = true;
    assert.equal(fx.state, 'shader');
    assert.equal(canvas.tries, 1);
    assert.ok(gl.calls.compiled <= 2, 'compiled again');
    assert.equal(gl.calls.lost, 1, 'the failed context is given back');
    assert.match(SE.waterFxNote(fx.state), /Standardwasser/);
    assert.ok(warnings.length <= 3);
  });
});

test('a GPU whose textures cannot span the world falls back like one without WebGL2', () => {
  const gl = fakeGl(true, 2048);
  const canvas = fakeCanvas(gl);
  withCanvas(canvas, () => {
    const fx = new SE.WaterFx();
    fx.enabled = true;
    assert.equal(fx.state, 'nowebgl');
    assert.equal(gl.calls.lost, 1);
  });
});

test('a lost context falls back for the session', () => {
  const canvas = fakeCanvas(fakeGl(true));
  withCanvas(canvas, (warnings) => {
    const fx = new SE.WaterFx();
    fx.enabled = true;
    assert.equal(fx.state, 'on');
    canvas.listeners.webglcontextlost({ preventDefault() {} });
    fx.draw(null, { tilePx: 32, dpr: 1 }, 0, 0, null, null, { oceans: true, events: true, cities: true }, false, 0);
    assert.equal(fx.state, 'lost');
    fx.enabled = false;
    fx.enabled = true;
    assert.equal(fx.state, 'lost');
    assert.equal(canvas.tries, 1);
    assert.equal(warnings.length, 1);
    assert.equal(SE.waterFxStats.active, false);
  });
});

test('"Effekte reduzieren" holds the effects back while the switch stays on', () => {
  const canvas = fakeCanvas(fakeGl(true));
  withCanvas(canvas, () => {
    const fx = new SE.WaterFx();
    fx.enabled = true;
    fx.still = true;
    assert.equal(fx.enabled, true);
    assert.equal(fx.state, 'reduced');
    assert.match(SE.waterFxNote(fx.state), /Standardwasser/);
    fx.still = false;
    assert.equal(fx.state, 'on');
  });
});

test('a chunk is uploaded again only when its sea changed, and never while off', () => {
  const canvas = fakeCanvas(fakeGl(true));
  withCanvas(canvas, () => {
    const art = SE.LandArt.fromIndices(new Uint8Array(M.width * M.height));
    const field = { key: new Uint8Array(SE.TILE_COUNT), reef: new Uint8Array(SE.TILE_COUNT), lagoon: new Uint8Array(SE.TILE_COUNT) };
    const seaOf = (index) => ({ w: 256, sea: new Uint8Array(256 * 256).fill(index), surf: new Uint32Array(0), surfAt: new Uint32Array(0), river: null });
    let motion = seaOf(M.ramps.water[2]);
    const land = { ready: true, art, field, motion: () => motion, dissolving: () => null };
    const world = { eventTtl: new Uint8Array(SE.TILE_COUNT), tech: new Uint8Array(SE.TILE_COUNT) };
    const ctx = { imageSmoothingEnabled: true, setTransform() {}, drawImage() {} };
    // 10 × 6 tiles from (100, 50): all in chunk (6, 3), plus the tile around it.
    const cam = { scrollX: 100.5, scrollY: 50.5, tilePx: 32, dpr: 1 };
    const layers = { oceans: true, events: true, cities: true };
    const fx = new SE.WaterFx();
    const uploads = () => SE.waterFxStats.chunkUploads;
    const draw = (now) => fx.draw(ctx, cam, 10, 6, world, land, layers, false, now);

    fx.enabled = true;
    const u0 = uploads();
    draw(0);
    assert.equal(uploads() - u0, 1);
    draw(10);
    assert.equal(uploads() - u0, 1, 'same composition');
    motion = seaOf(M.ramps.water[2]);
    draw(20);
    assert.equal(uploads() - u0, 1, 'composed anew, same sea');
    motion = seaOf(M.ramps.water[3]);
    draw(30);
    assert.equal(uploads() - u0, 2, 'the sea changed');
    fx.enabled = false;
    motion = seaOf(M.ramps.water[4]);
    const renders = SE.waterFxStats.renders;
    draw(40);
    assert.equal(uploads() - u0, 2, 'off');
    assert.equal(SE.waterFxStats.renders, renders);
  });
});
