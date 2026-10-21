namespace SE {
  const POLAR_WIND: Rgb = [153, 199, 239];
  const WEST_WIND: Rgb = [239, 195, 118];
  const TRADE_WIND: Rgb = [109, 219, 185];

  export const WIND_BELTS = [
    { lat: 75, name: 'Polare Ostwinde', color: POLAR_WIND },
    { lat: 45, name: 'Westwinde', color: WEST_WIND },
    { lat: 15, name: 'Nordostpassat', color: TRADE_WIND },
    { lat: -15, name: 'Südostpassat', color: TRADE_WIND },
    { lat: -45, name: 'Westwinde', color: WEST_WIND },
    { lat: -75, name: 'Polare Ostwinde', color: POLAR_WIND },
  ] as const;

  const WIND_BACKGROUNDS: readonly (readonly [Rgb, Rgb])[] = WIND_BELTS.map(belt => {
    const [r, g, b] = belt.color;
    return [[Math.round(r * 0.13), Math.round(g * 0.13), Math.round(b * 0.13)],
      [Math.round(r * 0.20 + 22), Math.round(g * 0.20 + 22), Math.round(b * 0.20 + 22)]];
  });

  /** Muted continents keep the wind belts readable over both land and sea. */
  export function windMapColor(world: WorldState, i: number): Rgb {
    const belt = Math.min(5, Math.floor((Math.floor(i / GRID_W) + 0.5) * 6 / GRID_H));
    return WIND_BACKGROUNDS[belt][world.isWater(i) ? 0 : 1];
  }

  /** Append a shaft and two open arrowhead strokes to the current path. */
  export function traceFlowArrow(
    ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, head: number,
  ): void {
    const dx = x1 - x0, dy = y1 - y0;
    const length = Math.hypot(dx, dy);
    if (length < 0.5) return;
    const ux = dx / length, uy = dy / length;
    const h = Math.min(head, length * 0.4);
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.moveTo(x1 - ux * h - uy * h * 0.6, y1 - uy * h + ux * h * 0.6);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x1 - ux * h + uy * h * 0.6, y1 - uy * h - ux * h * 0.6);
  }

  function windRow(lat: number): number {
    return (0.5 - lat / 180) * GRID_H - 0.5;
  }

  /** Static flat symbols are rasterized once per size, never once per tile or tick. */
  export class WindMapLayer {
    private flat: HTMLCanvasElement | null = null;
    private flatScale = 0;

    drawFlat(ctx: CanvasRenderingContext2D, w: number, h: number, scale: number): void {
      if (!this.flat || this.flat.width !== w || this.flat.height !== h || this.flatScale !== scale) {
        this.flat = document.createElement('canvas');
        this.flat.width = w;
        this.flat.height = h;
        this.flatScale = scale;
        const c = this.flat.getContext('2d');
        if (c) this.buildFlat(c, w / scale, h / scale, scale);
      }
      ctx.drawImage(this.flat, 0, 0);
    }

    private buildFlat(ctx: CanvasRenderingContext2D, w: number, h: number, scale: number): void {
      ctx.scale(scale, scale);
      ctx.font = '11px sans-serif';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(183,210,222,0.28)';
      ctx.setLineDash([3, 5]);
      ctx.beginPath();
      for (const lat of [60, 30, -30, -60]) {
        const y = (0.5 - lat / 180) * h;
        ctx.moveTo(0, y); ctx.lineTo(w, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      const mid = h / 2;
      ctx.fillStyle = 'rgba(109,219,185,0.10)';
      ctx.fillRect(0, mid - h / 60, w, h / 30);
      ctx.strokeStyle = 'rgba(173,238,215,0.65)';
      ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(w, mid); ctx.stroke();

      const labelWidth = w >= 400 ? 145 : 112;
      for (const belt of WIND_BELTS) {
        const y = (0.5 - belt.lat / 180) * h;
        const v = ClimateSystem.airCurrent(windRow(belt.lat));
        const length = Math.min(12, h / 23);
        const cols = Math.max(2, Math.min(18, Math.floor((w - labelWidth - 35) / 43)));
        ctx.beginPath();
        for (let col = 0; col < cols; col++) {
          const x = labelWidth + (col + 0.5) * (w - labelWidth - 35) / cols;
          traceFlowArrow(ctx, x - v.dx * length, y - v.dy * length * 0.62,
            x + v.dx * length, y + v.dy * length * 0.62, 5);
        }
        ctx.lineWidth = 4; ctx.strokeStyle = '#08121b'; ctx.stroke();
        ctx.lineWidth = 1.6; ctx.strokeStyle = rgbCss(belt.color); ctx.stroke();
        ctx.fillStyle = 'rgba(8,18,27,0.85)';
        ctx.fillRect(5, y - 9, labelWidth - 12, 18);
        ctx.fillStyle = rgbCss(belt.color);
        ctx.fillText(belt.name, 10, y, labelWidth - 22);
      }
      ctx.font = '10px sans-serif';
      for (const lat of [60, 30, 0, -30, -60]) {
        const y = (0.5 - lat / 180) * h;
        const label = lat === 0 ? 'Äquator · ITCZ' : `${Math.abs(lat)}° ${lat > 0 ? 'N' : 'S'}`;
        const width = ctx.measureText(label).width + 10;
        ctx.fillStyle = '#0c1a24'; ctx.fillRect(w - width, y - 7, width, 14);
        ctx.fillStyle = '#c0d4de'; ctx.fillText(label, w - width + 5, y);
      }
    }

    /** Project surface directions, so arrows turn with the globe and its tilt. */
    drawGlobe(ctx: CanvasRenderingContext2D, r: number, cx: number, cy: number, spin: number, tilt: number): void {
      const cosT = Math.cos(tilt), sinT = Math.sin(tilt);
      const project = (lon: number, lat: number): readonly [number, number, number] => {
        const x = Math.cos(lat) * Math.sin(lon - spin);
        const y = Math.sin(lat), z = Math.cos(lat) * Math.cos(lon - spin);
        return [cx + x * r, cy - (y * cosT - z * sinT) * r, y * sinT + z * cosT];
      };
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
      ctx.lineWidth = Math.max(1, r / 160);
      for (const lat of [60, 30, 0, -30, -60]) {
        ctx.strokeStyle = lat === 0 ? 'rgba(173,238,215,0.65)' : 'rgba(183,210,222,0.28)';
        ctx.beginPath();
        let drawing = false;
        for (let deg = -180; deg <= 180; deg += 5) {
          const p = project(deg * Math.PI / 180 + spin, lat * Math.PI / 180);
          if (p[2] < 0) { drawing = false; continue; }
          if (drawing) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]);
          drawing = true;
        }
        ctx.stroke();
      }
      for (const belt of WIND_BELTS) {
        const lat = belt.lat * Math.PI / 180;
        const v = ClimateSystem.airCurrent(windRow(belt.lat));
        const half = 4 * Math.PI / 180;
        ctx.beginPath();
        for (let deg = -180; deg < 180; deg += 30) {
          const lon = deg * Math.PI / 180;
          const a = project(lon - v.dx * half / Math.cos(lat), lat + v.dy * half * 0.62);
          const b = project(lon + v.dx * half / Math.cos(lat), lat - v.dy * half * 0.62);
          if (a[2] < 0.12 || b[2] < 0.12) continue;
          traceFlowArrow(ctx, a[0], a[1], b[0], b[1], Math.max(3, r / 30));
        }
        ctx.strokeStyle = '#08121b'; ctx.lineWidth = Math.max(3, r / 45); ctx.stroke();
        ctx.strokeStyle = rgbCss(belt.color); ctx.lineWidth = Math.max(1.3, r / 110); ctx.stroke();
      }
      ctx.restore();
    }
  }
}
