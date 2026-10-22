/* =============================================================================
 * SimEarth 2.0 — intro: studio card and logo
 * -----------------------------------------------------------------------------
 * "DreamStudios präsentiert" in white pixel type on black, gathering softly
 * pixel by pixel with the music and dissolving again. Then the logo lands on
 * the first hit: a small living planet with the Gaia sprout and an orbit
 * ring, rising behind the Gaia Reborn wordmark with its "2" badge, and "The
 * Living Planet" between two waves. The Big Bang behind it lights its rim
 * at INTRO_CUES.bang; it dissolves into sparks as the planets form.
 *
 * Everything is painted at art resolution into an ImageData, one pixel per
 * art pixel, and scaled up by a whole number of device pixels: crisp at any
 * size. A pure function of the clock (see intro.ts).
 * ========================================================================== */

namespace SE {
  const FONT = '"Pixelify Sans"';
  /** Type is drawn this many times larger and averaged down, so the art pixels sit where the glyphs' ink is. */
  const SUPER = 8;
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

  /** Planet radius, orbit ring radii and tilt, in art pixels / radians. */
  const R = 21;
  const RING_X = 50;
  const RING_Y = 8;
  const RING_TILT = -0.16;
  /** The Gaia sprout on the pole: o outline, L leaf, l leaf shade, s stem. */
  const SPROUT = [
    '.oo.....oo.',
    'oLLo...oLLo',
    'oLllo.ollLo',
    '.olllolllo.',
    '..ooosooo..',
    '.....s.....',
    '.....s.....',
  ];

  /** 0xAABBGGRR, as a little-endian Uint32 view of ImageData reads it. */
  function rgb(hex: string): number {
    const n = parseInt(hex.slice(1), 16);
    return (0xff000000 | ((n & 0xff) << 16) | (n & 0xff00) | (n >> 16)) >>> 0;
  }

  /** `c` moved toward `to` by k (0..1); alpha stays opaque. */
  function mix(c: number, to: number, k: number): number {
    if (k <= 0) return c;
    if (k >= 1) return to;
    const ch = (s: number) => {
      const a = (c >> s) & 0xff;
      return Math.round(a + (((to >> s) & 0xff) - a) * k) << s;
    };
    return (0xff000000 | ch(16) | ch(8) | ch(0)) >>> 0;
  }

  function hash(x: number, y: number, seed: number): number {
    let h = Math.imul(x + 0x9e37, 0x85ebca6b) ^ Math.imul(y + 0x7f4a, 0xc2b2ae35) ^ seed;
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
    return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
  }

  const bayer = (x: number, y: number) => BAYER[(y & 3) * 4 + (x & 3)];
  const ease = (t: number) => t * t * (3 - 2 * t);

  const C = {
    white: rgb('#ffffff'),
    studioDim: rgb('#aeb9c4'),
    studioGrey: rgb('#3c4650'),
    rim: rgb('#fff1cc'),
    outline: rgb('#04161c'),
    extrude: [rgb('#0b3a46'), rgb('#072630')],
    bands: ['#fff7da', '#ecf8d4', '#bdf3d4', '#84e9da', '#4fd6e0', '#2db4cf'].map(rgb),
    bandStops: [0.3, 0.44, 0.57, 0.7, 0.84, 1],
    badgeLine: rgb('#63c16f'),
    badgeFill: rgb('#02050b'),
    badgeDigit: rgb('#8fdc9a'),
    tag: rgb('#4fd6e0'),
    waveNear: rgb('#4fd6e0'),
    waveFar: rgb('#174f5c'),
    ringFront: rgb('#4fd6e0'),
    ringBack: rgb('#1a5868'),
    spark: rgb('#dffcff'),
    air: rgb('#9ff6ff'),
    halo: rgb('#16495a'),
    ocean: ['#03101a', '#0c2c47', '#165a7a', '#2a88a2'].map(rgb),
    shelf: ['#05202a', '#14505e', '#2c8a98', '#5cc4c8'].map(rgb),
    land: ['#0c2414', '#2f6b36', '#4f9a4a', '#8ad16f'].map(rgb),
    hill: ['#1d1710', '#6f5438', '#a5874f', '#e0c68e'].map(rgb),
    ice: ['#1d2a36', '#8aa4b4', '#cfe4ec', '#f6f1df'].map(rgb),
    sprout: { o: rgb('#173d22'), L: rgb('#8ad16f'), l: rgb('#4f9a4a'), s: rgb('#6f5438') } as Record<string, number>,
  };

  interface Mask { readonly w: number; readonly h: number; readonly on: Uint8Array }

  /** `text` as a tight 1-bit mask, `size` px type, `track` extra art pixels between letters. */
  function rasterText(text: string, weight: number, size: number, track = 0): Mask {
    const cv = document.createElement('canvas');
    const g = cv.getContext('2d', { willReadFrequently: true });
    if (!g) throw new Error('SimEarth: 2D context unavailable for the intro titles');
    const font = `${weight} ${size * SUPER}px ${FONT}`;
    g.font = font;
    const chars = [...text];
    const advance = chars.map((ch) => g.measureText(ch).width + track * SUPER);
    const total = advance.reduce((a, b) => a + b, 0);
    const pad = 2 * SUPER;
    cv.width = Math.ceil(total + 2 * pad);
    cv.height = Math.ceil(size * SUPER * 1.6 + 2 * pad);
    g.font = font;
    g.fillStyle = '#fff';
    let x = pad;
    for (let k = 0; k < chars.length; k++) {
      g.fillText(chars[k], x, pad + size * SUPER * 1.2);
      x += advance[k];
    }
    const src = g.getImageData(0, 0, cv.width, cv.height).data;
    const w = Math.floor(cv.width / SUPER);
    const h = Math.floor(cv.height / SUPER);
    const full = new Uint8Array(w * h);
    let x0 = w, x1 = -1, y0 = h, y1 = -1;
    for (let y = 0; y < h; y++) {
      for (let cx = 0; cx < w; cx++) {
        let sum = 0;
        for (let dy = 0; dy < SUPER; dy++) {
          let i = ((y * SUPER + dy) * cv.width + cx * SUPER) * 4 + 3;
          for (let dx = 0; dx < SUPER; dx++, i += 4) sum += src[i];
        }
        if (sum < 0.5 * 255 * SUPER * SUPER) continue;
        full[y * w + cx] = 1;
        x0 = Math.min(x0, cx); x1 = Math.max(x1, cx); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
    }
    const tw = Math.max(0, x1 - x0 + 1);
    const th = Math.max(0, y1 - y0 + 1);
    const on = new Uint8Array(tw * th);
    for (let y = 0; y < th; y++) on.set(full.subarray((y + y0) * w + x0, (y + y0) * w + x0 + tw), y * tw);
    return { w: tw, h: th, on };
  }

  /** Paints art pixels: an ImageData and the canvas it is scaled up from. */
  class Pixels {
    readonly img: ImageData;
    readonly px: Uint32Array;
    constructor(readonly w: number, readonly h: number) {
      this.img = new ImageData(w, h);
      this.px = new Uint32Array(this.img.data.buffer);
    }
    set(x: number, y: number, c: number): void {
      if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.px[y * this.w + x] = c;
    }
  }

  /** The logo's still parts, laid out once the font is in. */
  const enum Part { Word = 1, Badge, Digit, Tag }

  interface LogoArt {
    readonly w: number;
    readonly h: number;
    /** Planet centre. */
    readonly cx: number;
    readonly cy: number;
    /** Word, badge and tagline: colour, part, rim (outer outline) flag. */
    readonly col: Uint32Array;
    readonly part: Uint8Array;
    readonly rim: Uint8Array;
    readonly wordX0: number;
    readonly wordX1: number;
    readonly badge: { x: number; y: number; w: number; h: number };
    readonly tag: { x: number; y: number; w: number; h: number };
  }

  function buildLogo(): LogoArt {
    const word = rasterText('Gaia Reborn', 700, 28);
    const digit = rasterText('2', 700, 20);
    const tag = rasterText('THE LIVING PLANET', 400, 10, 2);
    const bw = digit.w + 6;
    const bh = digit.h + 4;
    const rowW = word.w + 4 + bw;
    const waveLen = 14;
    const w = Math.max(rowW, 2 * RING_X + 4, tag.w + 2 * (waveLen + 5)) + 4;
    const cx = Math.floor(w / 2);
    const cy = SPROUT.length + R;
    const wordX = Math.round(cx - rowW / 2);
    const wordY = cy + Math.round(R * 0.42);
    const tagY = wordY + word.h + 9;
    const h = tagY + tag.h + 2;
    const col = new Uint32Array(w * h);
    const part = new Uint8Array(w * h);
    const rim = new Uint8Array(w * h);
    const put = (x: number, y: number, c: number, p: Part) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      col[y * w + x] = c;
      part[y * w + x] = p;
    };

    // The wordmark: a two-pixel extrusion under the banded face.
    for (let y = 0; y < word.h; y++) {
      for (let x = 0; x < word.w; x++) {
        if (!word.on[y * word.w + x]) continue;
        for (let d = 2; d >= 1; d--) put(wordX + x, wordY + y + d, C.extrude[d - 1], Part.Word);
      }
    }
    for (let y = 0; y < word.h; y++) {
      const band = C.bandStops.findIndex((s) => (y + 0.5) / word.h <= s);
      for (let x = 0; x < word.w; x++) if (word.on[y * word.w + x]) put(wordX + x, wordY + y, C.bands[band], Part.Word);
    }
    // The "2" in its box, as on the title screen.
    const bx = wordX + word.w + 4;
    const by = wordY;
    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        const edge = x === 0 || y === 0 || x === bw - 1 || y === bh - 1;
        put(bx + x, by + y, edge ? C.badgeLine : C.badgeFill, Part.Badge);
      }
    }
    for (let y = 0; y < digit.h; y++) {
      for (let x = 0; x < digit.w; x++) if (digit.on[y * digit.w + x]) put(bx + 3 + x, by + 2 + y, C.badgeDigit, Part.Digit);
    }
    // One dark pixel around word and badge, so they part from the planet and from the flash behind.
    const filled = part.slice();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (filled[y * w + x]) continue;
        let near = 0;
        for (let dy = -1; dy <= 1 && !near; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx >= 0 && ny >= 0 && nx < w && ny < h && filled[ny * w + nx]) { near = filled[ny * w + nx]; break; }
          }
        }
        if (!near) continue;
        put(x, y, C.outline, near === Part.Digit ? Part.Badge : near);
        rim[y * w + x] = 1;
      }
    }
    const tagX = Math.round(cx - tag.w / 2);
    for (let y = 0; y < tag.h; y++) {
      for (let x = 0; x < tag.w; x++) if (tag.on[y * tag.w + x]) put(tagX + x, tagY + y, C.tag, Part.Tag);
    }
    return {
      w, h, cx, cy, col, part, rim, wordX0: wordX, wordX1: wordX + word.w,
      badge: { x: bx, y: by, w: bw, h: bh },
      tag: { x: tagX, y: tagY, w: tag.w, h: tag.h },
    };
  }

  interface StudioArt { readonly name: Mask; readonly sub: Mask; readonly w: number; readonly h: number; readonly subY: number }

  function buildStudio(): StudioArt {
    const name = rasterText('DreamStudios', 700, 20);
    const sub = rasterText('präsentiert', 500, 13, 2);
    const w = Math.max(name.w, sub.w) + 2;
    const subY = name.h + 7;
    return { name, sub, w, h: subY + sub.h + 1, subY };
  }

  /** Seconds before the logo cue: the music swells, a faint glow gathers where the logo will land. */
  const SWELL = 0.45;

  /**
   * Draws `p` centred (plus `ox`, `oy` art pixels), scaled by the largest whole device-pixel factor that fits
   * `fit` CSS px per art pixel, `bump` times larger on top while that still fits the width (in whole device pixels too).
   */
  function blit(f: IntroFrame, p: Pixels, buf: HTMLCanvasElement, fit: number, bump: number, ox: number, oy: number, glow: string, blur: number): void {
    const bctx = buf.getContext('2d');
    if (!bctx) return;
    bctx.putImageData(p.img, 0, 0);
    const dpr = f.ctx.getTransform().a || 1;
    const base = Math.max(1, Math.floor(fit * dpr));
    const sd = Math.max(base, Math.min(base + Math.round(base * bump), Math.floor((f.w * dpr * 0.98) / p.w)));
    const x = Math.round((f.w * dpr - p.w * sd) / 2) + ox * base;
    const y = Math.round((f.h * dpr - p.h * sd) / 2) + oy * base;
    const { ctx } = f;
    ctx.imageSmoothingEnabled = false;
    if (blur > 0) {
      ctx.shadowColor = glow;
      ctx.shadowBlur = blur * dpr;
    }
    ctx.drawImage(buf, 0, 0, p.w, p.h, x / dpr, y / dpr, (p.w * sd) / dpr, (p.h * sd) / dpr);
  }

  /** CSS px per art pixel the logo aims for: wide on phones, a strong centre piece on larger screens. */
  function logoFit(f: IntroFrame, art: LogoArt): number {
    return Math.min((f.w * (f.w < 600 ? 0.9 : 0.62)) / art.w, (f.h * 0.56) / art.h);
  }

  export function introTitles(stage: IntroStage): IntroScene {
    const said = make('p', 'sr-only', 'DreamStudios präsentiert: Gaia Reborn – The Living Planet²');
    stage.layer.appendChild(said);
    const buf = document.createElement('canvas');
    let studio: { art: StudioArt; px: Pixels } | null = null;
    let logo: { art: LogoArt; px: Pixels } | null = null;
    void document.fonts.load(`700 16px ${FONT}`);
    void document.fonts.load(`400 16px ${FONT}`);

    const ready = (): boolean => {
      if (studio && logo) return true;
      if (!document.fonts.check(`700 16px ${FONT}`) || !document.fonts.check(`400 16px ${FONT}`)) return false;
      const s = buildStudio();
      const l = buildLogo();
      studio = { art: s, px: new Pixels(s.w, s.h) };
      logo = { art: l, px: new Pixels(l.w, l.h) };
      buf.width = Math.max(s.w, l.w);
      buf.height = Math.max(s.h, l.h);
      return true;
    };

    return {
      draw(f) {
        const c = INTRO_CUES;
        if (f.t < c.studio || f.t >= c.planets || !ready() || !studio || !logo) return;
        if (f.t < c.logo - SWELL) drawStudio(f, studio.art, studio.px, buf);
        else if (f.t < c.logo && !f.still) drawSwell(f, logo.art);
        else drawLogo(f, logo.art, logo.px, buf);
      },
    };
  }

  /* ------------------------------------------------------------ studio card -- */

  /** Soft, with the music fading in: the pixels gather slowly and settle from grey to white; gone before the swell. */
  function drawStudio(f: IntroFrame, art: StudioArt, p: Pixels, buf: HTMLCanvasElement): void {
    const t = f.t - INTRO_CUES.studio;
    const end = INTRO_CUES.logo - SWELL - INTRO_CUES.studio - 0.1;
    const { name, sub } = art;
    const nameIn = introSpan(t, 0, 2.4);
    const subIn = introSpan(t, 1.2, 3.0);
    const gone = introSpan(t, end - 1.1, end);
    const still = f.still;
    p.px.fill(0);

    // A pixel arrives at its rank, grey, and turns white over the next stretch of the build.
    const paint = (mask: Mask, ox: number, oy: number, prog: number, seed: number, top: number) => {
      for (let y = 0; y < mask.h; y++) {
        for (let x = 0; x < mask.w; x++) {
          if (!mask.on[y * mask.w + x]) continue;
          if (still) { p.set(ox + x, oy + y, top); continue; }
          const r = hash(x, y, seed) * 0.6 + bayer(x, y) * 0.4;
          const k = (prog * 1.35 - r) / 0.35;
          if (k <= 0 || hash(x, y, seed + 1) < gone * 1.15 - 0.1) continue;
          p.set(ox + x, oy + y, mix(C.studioGrey, top, k));
        }
      }
    };
    paint(name, Math.floor((art.w - name.w) / 2), 0, ease(nameIn), 11, C.white);
    paint(sub, Math.floor((art.w - sub.w) / 2), art.subY, ease(subIn), 23, C.studioDim);
    f.ctx.globalAlpha = still ? introFade(t, 0, end, 1.6) : Math.min(0.35 + 0.65 * ease(nameIn), 1 - gone * gone);
    const fit = Math.min((f.w * (f.w < 600 ? 0.84 : 0.5)) / art.w, (f.h * 0.3) / art.h);
    blit(f, p, buf, fit, 0, 0, 0, 'rgba(190, 225, 255, 0.4)', 12);
  }

  /** The swell before the hit: black, and a faint cool glow gathering where the planet will be. */
  function drawSwell(f: IntroFrame, art: LogoArt): void {
    const k = introSpan(f.t, INTRO_CUES.logo - SWELL, INTRO_CUES.logo) ** 2;
    const { ctx, w, h } = f;
    const fit = logoFit(f, art);
    const cx = w / 2 + (art.cx - art.w / 2) * fit;
    const cy = h / 2 + (art.cy - art.h / 2) * fit;
    const r = R * fit * (1.2 + 1.3 * k);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgba(120, 220, 235, ${(0.22 * k).toFixed(3)})`);
    g.addColorStop(1, 'rgba(120, 220, 235, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);
  }

  /* ------------------------------------------------------------------- logo -- */

  /** How strongly the Big Bang behind lights the logo: a glimmer as its light gathers, the blast, then a lasting glow. */
  function backlight(t: number, still: boolean): number {
    const b = INTRO_CUES.bang;
    if (still) return 0.5 * ease(introSpan(t, b - 0.3, b + 1.5));
    if (t < b) return 0.3 * introSpan(t, b - 0.35, b) ** 2;
    return 0.5 + 0.5 * (1 - ease(introSpan(t, b, b + 1.6)));
  }

  function drawLogo(f: IntroFrame, art: LogoArt, p: Pixels, buf: HTMLCanvasElement): void {
    const t = f.t;
    const c = INTRO_CUES;
    const still = f.still;
    const s0 = c.logo;
    // The hit: the logo is there at once, white-hot and a size larger, and cools into its colours.
    const hit = still ? 0 : 1 - ease(introSpan(t, s0, s0 + 0.5));
    const slam = still ? 0 : 1 - introSpan(t, s0, s0 + 0.16);
    const pTag = introSpan(t, s0 + 0.35, s0 + 1.1);
    const pWave = ease(introSpan(t, s0 + 0.6, s0 + 1.6));
    const gone = introSpan(t, c.planets - 1.5, c.planets - 0.15);
    const light = backlight(t, still);
    const bangFlash = still || t < c.bang ? 0 : 1 - introSpan(t, c.bang, c.bang + 0.5);
    // Two highlights sweep the word: after the hit and after the bang.
    const gleams = [(t - s0 - 0.25) / 0.9, (t - c.bang - 0.1) / 0.9];
    const px = p.px;
    const w = p.w;
    px.fill(0);

    paintRing(p, art, false);
    paintPlanet(p, art, t, light);
    const top = art.cy - R - SPROUT.length + 1;
    SPROUT.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const k = C.sprout[row[x]];
        if (k) p.set(art.cx - 5 + x, top + y, mix(k, C.rim, row[x] === 'o' ? light * 0.8 : 0));
      }
    });
    paintRing(p, art, true);
    // A light running round the ring.
    const a = Math.PI * 0.75 + (t - s0) * 0.9;
    const [lx, ly] = ringAt(art, a);
    if (!(Math.sin(a) < 0 && (lx - art.cx) ** 2 + (ly - art.cy) ** 2 < (R + 1) ** 2)) {
      p.set(lx, ly, C.white);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) p.set(lx + dx, ly + dy, C.air);
    }

    // Word, badge and tagline over it all.
    const tg = art.tag;
    const span = w + art.h * 0.7;
    for (let i = 0; i < art.col.length; i++) {
      const part = art.part[i];
      if (!part) continue;
      const x = i % w;
      const y = (i - x) / w;
      let col = art.col[i];
      if (part === Part.Tag) {
        // Typed in a few columns at a time.
        if (still ? pTag < 0.5 : Math.floor((x - tg.x) / 4) / Math.ceil(tg.w / 4) >= pTag) continue;
      } else if (art.rim[i]) {
        // Lit from behind, but dark against the flash itself, so the letters keep their edge.
        col = mix(col, C.rim, light * 0.7 * (1 - bangFlash));
      } else {
        if (bangFlash > 0) col = mix(col, C.white, bangFlash * 0.3);
        for (const g of gleams) {
          const d = (x + y * 0.7) / span - g * 1.2 + 0.1;
          if (d > -0.05 && d < 0) col = mix(col, C.white, still ? 0.35 : 0.85);
        }
      }
      px[i] = col;
    }

    // Two waves running out from the tagline.
    if (pWave > 0) {
      const len = Math.round(pWave * 14);
      const y0 = tg.y + Math.floor(tg.h / 2);
      for (let k = 0; k < len; k++) {
        const colour = mix(C.waveNear, C.waveFar, k / 14);
        for (const side of [-1, 1]) {
          const x = side < 0 ? tg.x - 5 - k : tg.x + tg.w + 4 + k;
          p.set(x, y0 + Math.round(Math.sin(x * 0.75 - t * 3) * 1.1), colour);
        }
      }
    }

    for (let i = 0; i < px.length; i++) {
      if (!px[i]) continue;
      if (hit > 0) px[i] = mix(px[i], C.white, hit * 0.95);
      if (gone > 0 && !still) {
        // As the planets form, the logo dissolves into sparks, from the top down.
        const y = Math.floor(i / w);
        const r = hash(i % w, y, 41) * 0.75 + (y / p.h) * 0.25;
        if (r < gone * 1.1 - 0.08) px[i] = 0;
        else if (r < gone * 1.1) px[i] = C.spark;
      }
    }

    let ox = 0, oy = 0;
    for (const [at, amp] of [[s0, 3], [c.bang, 4]] as const) {
      if (still || t < at || t >= at + 0.4) continue;
      const k = 1 - (t - at) / 0.4;
      const n = Math.floor(t * 30);
      ox = Math.round((hash(n, 1, 5) - 0.5) * amp * k);
      oy = Math.round((hash(n, 2, 5) - 0.5) * amp * 0.7 * k);
    }
    // The music breathes in before the bang: the logo settles back a little.
    const settle = 1 - 0.3 * introFade(t, c.bang - 0.55, c.bang + 0.15, 0.3);
    // Reduced: a calm fade over the swell, so it is all there on the hit.
    f.ctx.globalAlpha = (still ? Math.min(introSpan(t, s0 - SWELL, s0), 1 - introSpan(t, c.planets - 1.2, c.planets)) : 1) * settle;
    const glow = Math.max(light, hit);
    const colour = hit > light ? `rgba(200, 245, 255, ${(0.8 * hit).toFixed(3)})` : `rgba(255, 214, 150, ${(0.25 + 0.6 * light).toFixed(3)})`;
    blit(f, p, buf, logoFit(f, art), slam * 0.25, ox, oy, glow > 0.05 ? colour : 'rgba(79, 214, 224, 0.3)', 10 + 34 * glow);
  }

  function ringAt(art: LogoArt, a: number): [number, number] {
    const ex = Math.cos(a) * RING_X;
    const ey = Math.sin(a) * RING_Y;
    return [
      Math.round(art.cx + ex * Math.cos(RING_TILT) - ey * Math.sin(RING_TILT)),
      Math.round(art.cy + ex * Math.sin(RING_TILT) + ey * Math.cos(RING_TILT)),
    ];
  }

  /** The near half of the orbit ring (over the planet) or the far half (only beside it, dimmer toward the back). */
  function paintRing(p: Pixels, art: LogoArt, front: boolean): void {
    const steps = 360;
    for (let k = 0; k < steps; k++) {
      const a = (k / steps) * Math.PI * 2;
      if (Math.sin(a) > 0 !== front) continue;
      const [x, y] = ringAt(art, a);
      if (front) { p.set(x, y, C.ringFront); continue; }
      if ((x - art.cx) ** 2 + (y - art.cy) ** 2 < R * R) continue;
      p.set(x, y, mix(C.ringBack, C.badgeFill, 0.5 - 0.5 * Math.abs(Math.cos(a))));
    }
  }

  /** The planet: turning continents, ordered-dither shading, a lit rim of air, its edge lit by the bang behind. */
  function paintPlanet(p: Pixels, art: LogoArt, t: number, light: number): void {
    const spin = t * 0.22;
    const lx = -0.52, ly = -0.48, lz = 0.71;
    for (let y = -R - 1; y <= R + 1; y++) {
      for (let x = -R - 1; x <= R + 1; x++) {
        const nx = (x + 0.5) / R;
        const ny = (y + 0.5) / R;
        const r2 = nx * nx + ny * ny;
        const px = art.cx + x, py = art.cy + y;
        if (r2 > 1) {
          // A one-pixel haze of air on the lit side.
          if (r2 < (1 + 1.3 / R) ** 2 && nx * lx + ny * ly > 0.25) p.set(px, py, mix(C.halo, C.rim, light * 0.6));
          continue;
        }
        const nz = Math.sqrt(1 - r2);
        const lit = nx * lx + ny * ly + nz * lz;
        const lat = Math.asin(-ny);
        const lon = Math.atan2(nx, nz) + spin;
        const n = Math.sin(lon * 2 + 0.6) * Math.cos(lat * 1.7 - 0.3) + 0.55 * Math.sin(lon * 3.3 - lat * 2.6 + 1.9) + 0.3 * Math.sin(lon * 7.1 + lat * 5.3);
        const pal = Math.abs(lat) > 1.02 ? C.ice : n > 1.1 ? C.hill : n > 0.1 ? C.land : n > -0.04 ? C.shelf : C.ocean;
        const level = lit < 0.04 ? 0 : clamp(Math.floor(lit * 2.7 + bayer(px, py) - 0.6) + 1, 1, 3);
        let col = pal[level];
        if (lit > 0.985 && pal === C.ocean) col = C.air;
        if (r2 > (1 - 1.6 / R) ** 2) col = mix(col, lit > 0.15 ? C.air : C.rim, lit > 0.15 ? 0.45 : light * 0.9);
        p.set(px, py, col);
      }
    }
  }
}
