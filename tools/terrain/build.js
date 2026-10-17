/* =============================================================================
 * SimEarth 2.0 — render every catalog entry through its family recipe
 * -----------------------------------------------------------------------------
 * Returns the pixels in memory, plus a PROBLEM list for anything that breaks
 * the format: wrong size, transparent ground, too many colours, a visible
 * seam, an object outside its box or not standing on its foot row, an
 * edge mask that would not join its neighbours.
 * ========================================================================== */
'use strict';

const C = require('./catalog');
const { Tex } = require('./kit');
const { buildMasks, checkMasks } = require('./masks');

/** Colours a texture or sprite may use, accents and shading included. */
const MAX_COLORS = { material: 9, overlay: 4, object: 9 };

function loadFamilies() {
  const fam = {};
  for (const f of C.FAMILIES) fam[f] = require(`./${f}`);
  return fam;
}

function colorCount(t) {
  const seen = new Set();
  for (const v of t.px) if (v !== 0) seen.add(v);
  return seen.size;
}

/**
 * Share of differing neighbour pairs across the wrap seam against the
 * texture's own average; a seam shows when it is clearly higher.
 */
function seamProblems(id, t) {
  const rate = (pairs) => pairs.reduce((a, [p, q]) => a + (p !== q ? 1 : 0), 0) / pairs.length;
  // Each seam against inner pairs of the same direction, so a texture with a
  // horizontal grain is not taken for one with a seam.
  const innerX = [];
  const innerY = [];
  const seamX = [];
  const seamY = [];
  for (let y = 0; y < t.h; y++) {
    for (let x = 0; x < t.w - 1; x++) innerX.push([t.get(x, y), t.get(x + 1, y)]);
    seamX.push([t.get(t.w - 1, y), t.get(0, y)]);
  }
  for (let x = 0; x < t.w; x++) {
    for (let y = 0; y < t.h - 1; y++) innerY.push([t.get(x, y), t.get(x, y + 1)]);
    seamY.push([t.get(x, t.h - 1), t.get(x, 0)]);
  }
  const out = [];
  if (rate(seamX) > rate(innerX) * 1.8 + 0.08) out.push(`${id}: visible seam at the left/right wrap`);
  if (rate(seamY) > rate(innerY) * 1.8 + 0.08) out.push(`${id}: visible seam at the top/bottom wrap`);
  return out;
}

function treeVariants() {
  const out = [];
  for (const size of Object.keys(C.TREE_SIZES)) {
    for (let form = 0; form < C.TREE_FORMS; form++) out.push({ index: out.length, size, form });
  }
  return out;
}

/** `only`: restrict to one family (others are skipped, not reported). */
function build(only = null) {
  const fam = loadFamilies();
  const problems = [];
  const want = (family) => !only || family === only;

  const materials = {};
  for (const mat of C.MATERIALS) {
    if (!want(mat.family)) continue;
    const recipe = fam[mat.family].materials?.[mat.id];
    if (!recipe) { problems.push(`${mat.id}: no recipe in ${mat.family}.js`); continue; }
    materials[mat.id] = [];
    for (let d = 0; d < mat.densities; d++) {
      const t = new Tex(mat.size, mat.size, true);
      recipe(t, d);
      const id = `${mat.id}[${d}]`;
      if (t.w !== mat.size || t.h !== mat.size) problems.push(`${id}: must stay ${mat.size}×${mat.size}`);
      if (t.px.includes(0)) problems.push(`${id}: ground must be opaque (found transparent pixels)`);
      if (colorCount(t) > MAX_COLORS.material) problems.push(`${id}: ${colorCount(t)} colours, at most ${MAX_COLORS.material}`);
      problems.push(...seamProblems(id, t));
      materials[mat.id].push(t);
    }
  }

  const overlays = {};
  for (const ov of C.OVERLAYS) {
    if (!want(ov.family)) continue;
    const recipe = fam[ov.family].overlays?.[ov.id];
    if (!recipe) { problems.push(`${ov.id}: no overlay recipe in ${ov.family}.js`); continue; }
    const t = new Tex(ov.size, ov.size, true);
    recipe(t);
    if (colorCount(t) > MAX_COLORS.overlay) problems.push(`${ov.id}: ${colorCount(t)} colours, at most ${MAX_COLORS.overlay}`);
    overlays[ov.id] = t;
  }

  const objects = {};
  for (const ob of C.OBJECTS) {
    if (!want(ob.family)) continue;
    const recipe = fam[ob.family].objects?.[ob.id];
    if (!recipe) { problems.push(`${ob.id}: no object recipe in ${ob.family}.js`); continue; }
    const variants = ob.kind === 'tree' ? treeVariants() : Array.from({ length: ob.variants ?? 3 }, (_, index) => ({ index }));
    const [maxW, maxH] = C.KIND_BOX[ob.kind];
    objects[ob.id] = variants.map((v) => {
      const t = recipe(v);
      const id = `${ob.id}[${v.size ? `${v.size}${v.form}` : v.index}]`;
      if (t.w > maxW || t.h > maxH) problems.push(`${id}: ${t.w}×${t.h} exceeds the ${ob.kind} box ${maxW}×${maxH}`);
      if (ob.kind === 'tree' && v.size) {
        const [tw, th] = C.TREE_SIZES[v.size];
        if (t.w > tw || t.h > th) problems.push(`${id}: size '${v.size}' must fit ${tw}×${th}`);
      }
      let foot = false;
      for (let x = 0; x < t.w; x++) if (t.get(x, t.h - 1) !== 0) foot = true;
      if (!foot) problems.push(`${id}: the bottom row is empty — objects stand on their last row`);
      if (colorCount(t) > MAX_COLORS.object) problems.push(`${id}: ${colorCount(t)} colours, at most ${MAX_COLORS.object}`);
      return { tex: t, ...v };
    });
  }

  const masks = buildMasks(C.MASKS.variants);
  problems.push(...checkMasks(masks));

  return { materials, overlays, objects, masks, problems };
}

module.exports = { build, MAX_COLORS };
