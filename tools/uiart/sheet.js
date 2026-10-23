/* =============================================================================
 * Gaia Reborn — contact sheet of the living-interface sprites
 * -----------------------------------------------------------------------------
 * Every built sprite in catalog order, each frame at ×4 on the dark stage
 * ground (#0c1520) and, right below it, on parchment (#f6e2bb), labelled with
 * its id and box; placeholders are labelled in pink with PLACEHOLDER.
 * Returns an RGBA image { w, h, data } and a legend (id → position) for
 * stdout. The terrain sheet's canvas and 3×5 font, with the UI palette.
 * ========================================================================== */
'use strict';

const C = require('./catalog');
const P = require('./palette');
const { Sheet } = require('../terrain/sheet');

const GROUNDS = [[12, 21, 32, 255], [246, 226, 187, 255]];
const BG = [52, 56, 60, 255];
const INK = [232, 238, 228, 255];
const PINK = [255, 120, 190, 255];
const SCALE = 4;
const GAP = 6;
const LABEL = 14;
const MAX_W = 1600;

/** The terrain sheet, blitting UI palette indices. */
class UiSheet extends Sheet {
  blit(t, x, y, scale = 1) {
    for (let sy = 0; sy < t.h; sy++) {
      for (let sx = 0; sx < t.w; sx++) {
        const v = t.px[sy * t.w + sx];
        if (v) this.rect(x + sx * scale, y + sy * scale, scale, scale, P.PALETTE[v]);
      }
    }
  }
}

function sheet(art) {
  const blocks = [];
  for (const s of C.SPRITES) {
    const frames = art.sprites[s.id];
    if (!frames) continue;
    const ph = !!art.placeholder[s.id];
    const label = `${s.id} ${s.w}x${s.h}${ph ? ' placeholder' : ''}`;
    const fw = s.w * SCALE;
    const fh = s.h * SCALE;
    const per = Math.max(1, Math.min(frames.length, Math.floor((MAX_W - 2 * GAP + GAP) / (fw + GAP))));
    const lines = Math.ceil(frames.length / per);
    blocks.push({
      s, frames, ph, label, fw, fh, per,
      w: Math.max(per * (fw + GAP) - GAP, label.length * 8), h: LABEL + lines * (2 * fh + GAP) - GAP,
    });
  }
  let x = GAP;
  let y = GAP;
  let rowH = 0;
  for (const b of blocks) {
    if (x > GAP && x + b.w + GAP > MAX_W) { x = GAP; y += rowH + 2 * GAP; rowH = 0; }
    b.x = x;
    b.y = y;
    x += b.w + 3 * GAP;
    rowH = Math.max(rowH, b.h);
  }
  const w = Math.max(64, ...blocks.map((b) => b.x + b.w + GAP));
  const h = y + rowH + GAP;
  const out = new UiSheet(w, h, BG);
  const legend = [];
  for (const b of blocks) {
    out.text(b.label, b.x, b.y, b.ph ? PINK : INK, 2);
    b.frames.forEach((t, f) => {
      const fx = b.x + (f % b.per) * (b.fw + GAP);
      const fy = b.y + LABEL + Math.floor(f / b.per) * (2 * b.fh + GAP);
      GROUNDS.forEach((g, k) => {
        out.rect(fx, fy + k * b.fh, b.fw, b.fh, g);
        out.blit(t, fx, fy + k * b.fh, SCALE);
      });
    });
    legend.push(`${b.s.id.padEnd(16)} at ${b.x},${b.y}  ${b.frames.length} × ${b.s.w}×${b.s.h} (×${SCALE})${b.ph ? '  PLACEHOLDER' : ''}`);
  }
  return { w: out.w, h: out.h, data: out.data, legend };
}

module.exports = { sheet, UiSheet };
