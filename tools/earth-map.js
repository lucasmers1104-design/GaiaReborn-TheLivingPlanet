/* =============================================================================
 * SimEarth 2.0 — today's Earth on the map grid
 * -----------------------------------------------------------------------------
 * Averages NOAA's ETOPO1 relief model (Ice Surface, public domain) onto the
 * 256 × 128 tile grid and writes src/earthmap.ts, the data behind the epoch
 * "Heute". Each tile stores its mean height (land) or depth (sea) and the
 * spread of the heights inside it, the relief the uplift belts are read from.
 *
 *   node tools/earth-map.js [etopo.asc] [--fetch] [--png file] [--write]
 *
 *     etopo.asc  ETOPO1 in ESRI ASCII, every 10 arc-minutes (12 MB), as served by
 *                ERDDAP_URL below; default: <OS temp>/simearth-etopo10.asc
 *     --fetch    download it first
 *     --png      write a preview of the result (one pixel per tile)
 *     --write    write src/earthmap.ts
 *
 * Rules, all per tile (≈ 156 km at the equator):
 *   - land where at least half of the samples are above sea level, and also
 *     where an isolated island holds a fifth, so archipelagos do not vanish;
 *   - land that hangs together in the samples but would fall apart on the
 *     grid (Panama, Baja California, Cuba) is joined through the sea tiles it
 *     runs through, never cutting off a sea;
 *   - lakes and inland water smaller than MIN_SEA_TILES become land (ETOPO
 *     carries lake-bed bathymetry: the Great Lakes would turn into sea);
 *   - height = mean of the land samples, depth = mean of the sea samples, so a
 *     coastal tile is neither dragged under water nor lifted out of it.
 * ========================================================================== */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { encodeRGBA } = require('./terrain/png');

const ERDDAP_URL = 'https://coastwatch.pfeg.noaa.gov/erddap/griddap/etopo180.esriAscii?altitude%5B(-90.0):10:(90.0)%5D%5B(-180.0):10:(180.0)%5D';
const W = 256;
const H = 128;
const MIN_SEA_TILES = 6;
const ISLAND_SHARE = 0.2;
/**
 * Bridging: only masses of at least this many samples (≈ 30 000 km² at the
 * equator), and only through tiles they fill to this share, so a strait a few
 * kilometres wide (Messina) stays open.
 */
const BRIDGE_MASS = 100;
const BRIDGE_SHARE = 0.15;
/** Heights and depths the byte encoding spans, in metres. */
const MAX_HEIGHT = 6000;
const MAX_DEPTH = 11000;
const RELIEF_STEP = 10;
const PREVIEW_SCALE = 4;
const OUT_TS = path.join(__dirname, '..', 'src', 'earthmap.ts');

function parseArgs(argv) {
  const a = { file: path.join(os.tmpdir(), 'simearth-etopo10.asc'), fetch: false, png: null, write: false };
  for (let k = 0; k < argv.length; k++) {
    const v = argv[k];
    if (v === '--fetch') a.fetch = true;
    else if (v === '--write') a.write = true;
    else if (v === '--png') a.png = argv[++k];
    else if (!v.startsWith('--')) a.file = v;
    else throw new Error(`unknown option ${v}`);
  }
  return a;
}

async function fetchEtopo(file) {
  const res = await fetch(ERDDAP_URL);
  if (!res.ok) throw new Error(`ERDDAP answered ${res.status}`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

/** ESRI ASCII grid: a header, then rows from the north. */
function readGrid(file) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split('\n');
  const head = {};
  let k = 0;
  for (; k < lines.length; k++) {
    const m = /^([a-z_]+)\s+(\S+)/i.exec(lines[k]);
    if (!m || !/^(ncols|nrows|xllcenter|yllcenter|cellsize|nodata_value)$/i.test(m[1])) break;
    head[m[1].toLowerCase()] = Number(m[2]);
  }
  const cols = head.ncols;
  const rows = head.nrows;
  if (!(cols > 0 && rows > 0 && head.cellsize > 0)) throw new Error(`${file}: not an ESRI ASCII grid`);
  const data = new Int16Array(cols * rows);
  let n = 0;
  for (; k < lines.length && n < data.length; k++) {
    for (const t of lines[k].trim().split(/\s+/)) if (t) data[n++] = Number(t);
  }
  if (n !== data.length) throw new Error(`${file}: ${n} values, expected ${data.length}`);
  return { cols, rows, x0: head.xllcenter, y0: head.yllcenter, step: head.cellsize, data };
}

/** Per-tile sums over every sample whose centre falls inside the tile. */
function bin(grid) {
  const t = {
    n: new Uint32Array(W * H), land: new Uint32Array(W * H),
    landSum: new Float64Array(W * H), landSq: new Float64Array(W * H), seaSum: new Float64Array(W * H),
  };
  /** Tile of each sample, -1 for the -180° column repeated at 180°. */
  t.tileOf = new Int32Array(grid.rows * grid.cols).fill(-1);
  /** Sample columns west of 180°: the ones a row wraps around. */
  t.span = 0;
  const tile = 360 / W;
  for (let r = 0; r < grid.rows; r++) {
    const lat = grid.y0 + (grid.rows - 1 - r) * grid.step;
    const y = Math.min(H - 1, Math.max(0, Math.floor((90 - lat) / tile)));
    for (let c = 0; c < grid.cols; c++) {
      const lon = grid.x0 + c * grid.step;
      if (lon >= 180) continue; // the -180° column again
      t.span = Math.max(t.span, c + 1);
      const x = Math.min(W - 1, Math.floor((lon + 180) / tile));
      const i = y * W + x;
      t.tileOf[r * grid.cols + c] = i;
      const h = grid.data[r * grid.cols + c];
      t.n[i]++;
      if (h > 0) { t.land[i]++; t.landSum[i] += h; t.landSq[i] += h * h; } else t.seaSum[i] += h;
    }
  }
  return t;
}

function neighbours(i, diagonal) {
  const x = i % W;
  const y = (i - x) / W;
  const out = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if ((dx === 0 && dy === 0) || (!diagonal && dx !== 0 && dy !== 0)) continue;
      const yy = y + dy;
      if (yy < 0 || yy >= H) continue;
      out.push(yy * W + ((x + dx + W) % W));
    }
  }
  return out;
}

/**
 * Land that hangs together in ETOPO but falls apart on the grid (Panama, Baja
 * California, Cuba, the Malay Peninsula) is joined again through sea tiles it
 * runs through. Returns the tiles added.
 */
function bridge(grid, t, land) {
  const { rows, cols, data } = grid;
  const span = t.span;
  const around = (p) => {
    const c = p % cols;
    const r = (p - c) / cols;
    return [r > 0 ? p - cols : -1, r < rows - 1 ? p + cols : -1, r * cols + (c + 1) % span, r * cols + (c - 1 + span) % span];
  };
  const isLand = (p) => p >= 0 && data[p] > 0 && t.tileOf[p] >= 0;
  const seen = new Uint8Array(rows * cols);
  const node = new Int32Array(rows * cols).fill(-1);
  let added = 0;
  for (let s = 0; s < rows * cols; s++) {
    if (seen[s] || !isLand(s)) continue;
    const mass = [s];
    seen[s] = 1;
    for (let k = 0; k < mass.length; k++) for (const q of around(mass[k])) if (isLand(q) && !seen[q]) { seen[q] = 1; mass.push(q); }
    if (mass.length < BRIDGE_MASS) continue;
    // Nodes: each land tile whole (it is drawn as one), and in a sea tile each
    // piece of the mass inside it on its own, so a gulf tile holding both shores
    // does not pass for a land link between them.
    const tileOfNode = [];
    const share = [];
    const landNode = new Map();
    for (const p of mass) {
      if (node[p] >= 0) continue;
      const i = t.tileOf[p];
      if (land[i]) {
        if (!landNode.has(i)) { landNode.set(i, tileOfNode.length); tileOfNode.push(i); share.push(1); }
        node[p] = landNode.get(i);
        continue;
      }
      const id = tileOfNode.length;
      tileOfNode.push(i);
      const piece = [p];
      node[p] = id;
      for (let k = 0; k < piece.length; k++) {
        for (const q of around(piece[k])) if (isLand(q) && node[q] < 0 && t.tileOf[q] === i) { node[q] = id; piece.push(q); }
      }
      share.push(piece.length / t.n[i]);
    }
    const links = tileOfNode.map(() => new Set());
    for (const p of mass) for (const q of around(p)) if (isLand(q) && node[q] !== node[p]) links[node[p]].add(node[q]);
    // Neighbouring land tiles touch on the map whether or not land crosses their border.
    for (const [i, a] of landNode) for (const j of neighbours(i, false)) if (landNode.has(j)) links[a].add(landNode.get(j));
    added += join(tileOfNode, share, links, landNode, land);
    for (const p of mass) node[p] = -1;
  }
  return added;
}

/** Sea areas, 4-connected as the lake rule counts them. */
function seaParts(land) {
  const seen = new Uint8Array(W * H);
  let n = 0;
  for (let s = 0; s < W * H; s++) {
    if (land[s] || seen[s]) continue;
    n++;
    const stack = [s];
    seen[s] = 1;
    while (stack.length) for (const j of neighbours(stack.pop(), false)) if (!land[j] && !seen[j]) { seen[j] = 1; stack.push(j); }
  }
  return n;
}

/**
 * Join the land parts of one mass to its biggest, one at a time along the
 * cheapest chain of nodes (see bridge): land is free, a piece in a sea tile
 * costs the share of the tile it leaves to the sea, and pieces under
 * BRIDGE_SHARE are no way at all. A chain that would cut off a sea (the Gulf
 * of California behind Baja) is refused and the next cheapest one tried.
 */
function join(tileOfNode, share, links, landNode, land) {
  const part = new Map();
  const sizes = [];
  for (const a of landNode.values()) {
    if (part.has(a)) continue;
    const stack = [a];
    part.set(a, sizes.length);
    for (let k = 0; k < stack.length; k++) {
      for (const b of links[stack[k]]) if (land[tileOfNode[b]] && !part.has(b)) { part.set(b, sizes.length); stack.push(b); }
    }
    sizes.push(stack.length);
  }
  if (sizes.length < 2) return 0;
  const joined = new Set([sizes.indexOf(Math.max(...sizes))]);
  const blocked = new Set();
  let added = 0;
  for (;;) {
    const seas = seaParts(land);
    const dist = new Map();
    const prev = new Map();
    const open = [];
    for (const [a, p] of part) if (joined.has(p)) { dist.set(a, 0); open.push(a); }
    let hit = -1;
    while (open.length) {
      let k = 0;
      for (let m = 1; m < open.length; m++) if (dist.get(open[m]) < dist.get(open[k])) k = m;
      const a = open[k];
      open[k] = open[open.length - 1];
      open.pop();
      if (part.has(a) && !joined.has(part.get(a))) { hit = a; break; }
      for (const b of links[a]) {
        const onLand = land[tileOfNode[b]] > 0;
        if (!onLand && (share[b] < BRIDGE_SHARE || blocked.has(b))) continue;
        // A small step cost keeps the path short across land.
        const d = dist.get(a) + (onLand ? 0 : 1 - share[b]) + 1e-3;
        if (d >= (dist.get(b) ?? Infinity)) continue;
        if (!dist.has(b)) open.push(b);
        dist.set(b, d);
        prev.set(b, a);
      }
    }
    if (hit < 0) return added;
    const path = [];
    for (let a = prev.get(hit); dist.get(a) > 0; a = prev.get(a)) if (!land[tileOfNode[a]]) path.push(a);
    const cuts = (nodes) => {
      for (const a of nodes) land[tileOfNode[a]] = 4;
      const cut = seaParts(land) > seas;
      for (const a of nodes) land[tileOfNode[a]] = 0;
      return cut;
    };
    if (cuts(path)) {
      const alone = path.filter((a) => cuts([a]));
      // Several tiles may cut only together: then refuse the first.
      for (const a of alone.length ? alone : path.slice(0, 1)) blocked.add(a);
      continue;
    }
    for (const a of path) land[tileOfNode[a]] = 4;
    added += new Set(path.map((a) => tileOfNode[a])).size;
    joined.add(part.get(hit));
  }
}

function landMask(grid, t) {
  const share = (i) => t.land[i] / Math.max(1, t.n[i]);
  const land = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) land[i] = share(i) >= 0.5 ? 1 : 0;
  // Islands below half a tile: kept where nothing else nearby is land.
  for (let i = 0; i < W * H; i++) {
    if (land[i] || share(i) < ISLAND_SHARE) continue;
    if (neighbours(i, true).every((j) => share(j) < 0.5)) land[i] = 2;
  }
  const bridged = bridge(grid, t, land);
  // Small water bodies (lake beds, fragments) become land.
  const seen = new Uint8Array(W * H);
  let filled = 0;
  for (let s = 0; s < W * H; s++) {
    if (land[s] || seen[s]) continue;
    const comp = [s];
    seen[s] = 1;
    for (let k = 0; k < comp.length; k++) {
      for (const j of neighbours(comp[k], false)) if (!land[j] && !seen[j]) { seen[j] = 1; comp.push(j); }
    }
    if (comp.length < MIN_SEA_TILES) { for (const i of comp) land[i] = 3; filled += comp.length; }
  }
  return { land, filled, bridged };
}

/** Heights and relief in metres; land tiles > 0, sea tiles < 0. */
function heights(t, land) {
  const h = new Float32Array(W * H);
  const relief = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    if (land[i]) {
      if (t.land[i] > 0) {
        const mean = t.landSum[i] / t.land[i];
        h[i] = Math.max(1, mean);
        relief[i] = Math.sqrt(Math.max(0, t.landSq[i] / t.land[i] - mean * mean));
      } else h[i] = -1; // a filled lake without dry samples: set from its shores below
    } else {
      const sea = t.n[i] - t.land[i];
      h[i] = Math.min(-1, sea > 0 ? t.seaSum[i] / sea : -1);
    }
  }
  for (let i = 0; i < W * H; i++) {
    if (!land[i] || h[i] > 0) continue;
    const shore = neighbours(i, true).filter((j) => land[j] && h[j] > 0);
    h[i] = shore.length ? shore.reduce((s, j) => s + h[j], 0) / shore.length : 1;
  }
  return { h, relief };
}

/** One byte per tile: square-root steps, fine near sea level where coasts and lowlands are decided. */
function encodeHeight(m) {
  if (m > 0) return Math.max(1, Math.min(127, Math.round(127 * Math.sqrt(Math.min(m, MAX_HEIGHT) / MAX_HEIGHT))));
  return (256 - Math.max(1, Math.min(128, Math.round(128 * Math.sqrt(Math.min(-m, MAX_DEPTH) / MAX_DEPTH))))) & 0xff;
}

function decodeHeight(b) {
  return b < 128 ? MAX_HEIGHT * (b / 127) ** 2 : -MAX_DEPTH * ((256 - b) / 128) ** 2;
}

function renderTs(heightBytes, reliefBytes, stats) {
  const b64 = (bytes) => Buffer.from(bytes).toString('base64');
  return `/* =============================================================================
 * SimEarth 2.0 — today's Earth (GENERATED by tools/earth-map.js, do not edit)
 * -----------------------------------------------------------------------------
 * NOAA ETOPO1 Ice Surface (public domain), sampled every 10 arc-minutes and
 * averaged per tile. Row 0 is the northernmost, column 0 starts at 180° W.
 * ${stats}
 * ========================================================================== */

namespace SE {
  export const EARTH_MAP = {
    width: ${W},
    height: ${H},
    /** Metres a height byte spans: land 1..127 = ${MAX_HEIGHT}·(b/127)², sea 128..255 = −${MAX_DEPTH}·((256−b)/128)². */
    maxHeight: ${MAX_HEIGHT},
    maxDepth: ${MAX_DEPTH},
    /** Metres of relief (spread of the heights inside a land tile) per step. */
    reliefStep: ${RELIEF_STEP},
    heights: '${b64(heightBytes)}',
    relief: '${b64(reliefBytes)}',
  };
}
`;
}

/** Hypsometric colours, PREVIEW_SCALE pixels per tile. */
function preview(file, h) {
  const s = PREVIEW_SCALE;
  const rgba = new Uint8Array(W * H * s * s * 4);
  for (let i = 0; i < W * H; i++) {
    const m = h[i];
    let c;
    if (m < 0) { const d = Math.min(1, -m / 6000); c = [20 + 40 * (1 - d), 60 + 80 * (1 - d), 120 + 100 * (1 - d)]; }
    else if (m < 500) c = [70 + m / 10, 140, 70];
    else if (m < 2000) c = [150, 130 - (m - 500) / 30, 80];
    else { const g = Math.min(255, 150 + (m - 2000) / 20); c = [g, g, g]; }
    const x = i % W;
    const y = (i - x) / W;
    for (let dy = 0; dy < s; dy++) {
      for (let dx = 0; dx < s; dx++) rgba.set([c[0] | 0, c[1] | 0, c[2] | 0, 255], (((y * s + dy) * W * s) + x * s + dx) * 4);
    }
  }
  fs.writeFileSync(file, encodeRGBA(W * s, H * s, rgba));
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  if (a.fetch) await fetchEtopo(a.file);
  if (!fs.existsSync(a.file)) throw new Error(`${a.file} missing: run with --fetch (downloads ${ERDDAP_URL})`);

  const grid = readGrid(a.file);
  const t = bin(grid);
  const { land, filled, bridged } = landMask(grid, t);
  const { h, relief } = heights(t, land);

  const heightBytes = new Uint8Array(W * H);
  const reliefBytes = new Uint8Array(W * H);
  let landTiles = 0;
  let islands = 0;
  for (let i = 0; i < W * H; i++) {
    heightBytes[i] = encodeHeight(h[i]);
    reliefBytes[i] = Math.min(255, Math.round(relief[i] / RELIEF_STEP));
    if (land[i]) landTiles++;
    if (land[i] === 2) islands++;
    // The encoding must never flip a tile between land and sea.
    if ((decodeHeight(heightBytes[i]) > 0) !== (land[i] > 0)) throw new Error(`tile ${i}: height ${h[i]} changed sides`);
  }
  const stats = `${landTiles} land tiles (${(landTiles / (W * H) * 100).toFixed(1)} % of the grid), ${islands} kept as islands, ${bridged} bridging land, ${filled} lake tiles filled.`;
  console.log(stats);

  if (a.png) preview(a.png, h);
  if (a.write) {
    fs.writeFileSync(OUT_TS, renderTs(heightBytes, reliefBytes, stats));
    console.log(`wrote ${path.relative(process.cwd(), OUT_TS)}`);
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
