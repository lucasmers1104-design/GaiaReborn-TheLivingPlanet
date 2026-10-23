/* =============================================================================
 * SimEarth 2.0 — small SVG charts
 * -----------------------------------------------------------------------------
 * The few chart shapes the windows share: a donut, a sparkline and a
 * segmented bar. Each returns SVG markup so
 * a panel can rebuild a chart in one assignment; numbers only, any text that
 * goes into markup passes through esc().
 * ========================================================================== */

namespace SE {
  const TAU = Math.PI * 2;

  /** Escape text for use inside HTML or SVG markup. */
  export function esc(text: string): string {
    return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  }

  /** Point on a circle; `turn` 0 is twelve o'clock, 1 a full turn clockwise. */
  function polarXY(cx: number, cy: number, r: number, turn: number): [number, number] {
    const a = turn * TAU - Math.PI / 2;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  }

  function polar(cx: number, cy: number, r: number, turn: number): string {
    const [x, y] = polarXY(cx, cy, r, turn);
    return `${x.toFixed(2)} ${y.toFixed(2)}`;
  }

  /** An arc path from one turn fraction to another, clockwise. */
  export function arcPath(cx: number, cy: number, r: number, from: number, to: number): string {
    const span = Math.min(to - from, 0.9999);
    if (span <= 0) return '';
    return `M${polar(cx, cy, r, from)}A${r} ${r} 0 ${span > 0.5 ? 1 : 0} 1 ${polar(cx, cy, r, from + span)}`;
  }

  export interface Segment {
    readonly value: number;
    readonly color: string;
  }

  /** A donut, segments clockwise from the top, with a hairline gap between. */
  export function donutSvg(segments: readonly Segment[], size = 160, thickness = 0.22): string {
    const c = size / 2;
    const r = size * (0.5 - thickness / 2) - 2;
    const total = segments.reduce((sum, s) => sum + Math.max(0, s.value), 0) || 1;
    const gap = segments.filter((s) => s.value > 0).length > 1 ? 0.004 : 0;
    let out = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" class="donut" aria-hidden="true">`;
    out += `<circle cx="${c}" cy="${c}" r="${r}" class="donut-track" stroke-width="${size * thickness}"/>`;
    let from = 0;
    for (const s of segments) {
      const f = Math.max(0, s.value) / total;
      if (f <= 0) continue;
      const d = arcPath(c, c, r, from + gap, from + f - gap);
      if (d) out += `<path d="${d}" stroke="${s.color}" stroke-width="${size * thickness}" fill="none"/>`;
      from += f;
    }
    return `${out}</svg>`;
  }

  /** A sparkline with a soft area under it. Empty when there is no history. */
  export function sparklineSvg(data: readonly number[], min: number, max: number, color: string, w = 96, h = 28): string {
    if (data.length < 2) return '';
    const span = max - min || 1;
    const pts: string[] = [];
    for (let k = 0; k < data.length; k++) {
      const x = (k / (data.length - 1)) * w;
      const y = h - 2 - clamp((data[k] - min) / span, 0, 1) * (h - 4);
      pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    const line = pts.join(' ');
    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" class="spark" aria-hidden="true">` +
      `<polygon points="0,${h} ${line} ${w},${h}" fill="${color}" opacity="0.16"/>` +
      `<polyline points="${line}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="miter" stroke-linecap="square"/>` +
      '</svg>';
  }

  /** One horizontal bar split into coloured shares, as HTML. */
  export function segmentBar(segments: readonly (Segment & { readonly title: string })[]): HTMLElement {
    const bar = make('div', 'seg-bar');
    const total = segments.reduce((sum, s) => sum + Math.max(0, s.value), 0) || 1;
    for (const s of segments) {
      if (s.value <= 0) continue;
      const part = make('span', 'seg-bar-part');
      part.style.flexGrow = String(s.value / total);
      part.style.background = s.color;
      part.title = s.title;
      bar.appendChild(part);
    }
    return bar;
  }
}
