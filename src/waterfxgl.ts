/* =============================================================================
 * Gaia Reborn — the WebGL2 stage of the water effects (waterfx.ts)
 * -----------------------------------------------------------------------------
 * One small program on a canvas of its own, never in the page: a picture with
 * one pixel (or k × k, see WaterFxFrame.scale) per art pixel of the tiles in view, transparent except where a
 * caustic line or a glint lifts the composed sea's colour to a palette
 * colour. Its inputs are textures that change only when the map does:
 *   - mask:  the composed palette index of the sea per art pixel
 *            (LandMotion.sea), one 256 × 256 slot per chunk in view;
 *   - owner: which chunk each slot holds now (chunk number + 1, 0 for none),
 *            so a slot not yet filled never shows another chunk's sea;
 *   - tiles: per tile in view, bit 1 sheltered water (reef or lagoon),
 *            bit 2 covered (event icon, tidal wave, a dissolving picture),
 *            bit 4 a city;
 *   - lut:   per palette index the caustic colour (row 0), the glint
 *            colour (row 1) and the glint's brighter core (row 2), alpha 0
 *            for none.
 * Everything else follows from world pixel coordinates and the clock, with
 * every lattice wrapping at the world's width, so the pattern runs on over
 * tile, chunk and world seams.
 * ========================================================================== */

namespace SE {
  const CHUNK_PX = LAND_CHUNK * 16;

  const VERTEX = `#version 300 es
void main() {
  vec2 v = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(v * 2.0 - 1.0, 0.0, 1.0);
}`;

  const FRAGMENT = `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;
precision highp sampler2D;
uniform usampler2D uMask;
uniform usampler2D uOwner;
uniform usampler2D uTiles;
uniform sampler2D uLut;
uniform ivec2 uOrigin;
uniform ivec2 uTileOrigin;
uniform ivec2 uTileSize;
uniform ivec2 uSlots;
uniform int uHeight;
uniform int uScale;
uniform float uTime;
uniform float uStrength;
out vec4 outColor;

const int WORLD_PX = ${GRID_W * 16};
const int WORLD_H = ${GRID_H * 16};
const int CHUNK_PX = ${CHUNK_PX};
const int CHUNKS_X = ${GRID_W / LAND_CHUNK};
const float TAU = 6.2831853;

// Every integer handed in is >= 0: x runs from WORLD_PX on, y is offset where it can be negative.
float rnd(ivec2 c, int salt) {
  uvec3 u = uvec3(uint(c.x), uint(c.y), uint(salt));
  uint h = u.x * 0x8da6b343u ^ u.y * 0xd8163841u ^ u.z * 0xcb1ab31fu;
  h ^= h >> 16; h *= 0x7feb352du; h ^= h >> 15; h *= 0x846ca68bu; h ^= h >> 16;
  return float(h >> 8) * (1.0 / 16777216.0);
}

// Value noise on a lattice of cell px, wrapping at the world's width.
float noise(vec2 p, vec2 cell, int salt) {
  vec2 q = p / cell;
  ivec2 c = ivec2(floor(q));
  vec2 f = q - vec2(c);
  f = f * f * (3.0 - 2.0 * f);
  int n = WORLD_PX / int(cell.x);
  int xa = c.x % n;
  int xb = (xa + 1) % n;
  int y = c.y + 4096;
  return mix(mix(rnd(ivec2(xa, y), salt), rnd(ivec2(xb, y), salt), f.x),
             mix(rnd(ivec2(xa, y + 1), salt), rnd(ivec2(xb, y + 1), salt), f.x), f.y);
}

uint seaAt(ivec2 p) {
  if (p.y < 0 || p.y >= WORLD_H) return 0u;
  int x = p.x % WORLD_PX;
  ivec2 c = ivec2(x / CHUNK_PX, p.y / CHUNK_PX);
  ivec2 slot = ivec2(c.x % uSlots.x, c.y % uSlots.y);
  if (texelFetch(uOwner, slot, 0).r != uint(c.y * CHUNKS_X + c.x + 1)) return 0u;
  return texelFetch(uMask, slot * CHUNK_PX + ivec2(x % CHUNK_PX, p.y % CHUNK_PX), 0).r;
}

ivec2 tileOf(ivec2 p) {
  return ivec2(p.x / 16, p.y < 0 ? -1 : p.y / 16);
}

uint tileAt(ivec2 t) {
  return texelFetch(uTiles, clamp(t - uTileOrigin, ivec2(0), uTileSize - 1), 0).r;
}

// Drawn over by the base picture: an event icon, a tidal wave, a dissolving
// chunk on its tile, or a city's picture (its tile, 2 px either side, 8 px above).
bool covered(ivec2 p) {
  ivec2 t = tileOf(p);
  if ((tileAt(t) & 2u) != 0u) return true;
  ivec2 l = p - t * 16;
  for (int dy = 0; dy <= 1; dy++) {
    for (int dx = -1; dx <= 1; dx++) {
      if ((tileAt(t + ivec2(dx, dy)) & 4u) == 0u) continue;
      ivec2 b = l - 16 * ivec2(dx, dy);
      if (b.x >= -2 && b.x < 18 && b.y >= -8 && b.y < 16) return true;
    }
  }
  return false;
}

// Sheltered water between the tile centres, 0..1.
float shelter(vec2 p) {
  vec2 u = p / 16.0 - 0.5;
  ivec2 t = ivec2(floor(u));
  vec2 f = u - vec2(t);
  float a = float(tileAt(t) & 1u);
  float b = float(tileAt(t + ivec2(1, 0)) & 1u);
  float c = float(tileAt(t + ivec2(0, 1)) & 1u);
  float d = float(tileAt(t + ivec2(1, 1)) & 1u);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// 1 where ground touches p, 2 where it lies 2 px off along an axis, else 3.
int dryWithin(ivec2 p) {
  for (int j = -1; j <= 1; j++)
    for (int i = -1; i <= 1; i++)
      if ((i != 0 || j != 0) && seaAt(p + ivec2(i, j)) == 0u) return 1;
  if (seaAt(p + ivec2(2, 0)) == 0u || seaAt(p - ivec2(2, 0)) == 0u ||
      seaAt(p + ivec2(0, 2)) == 0u || seaAt(p - ivec2(0, 2)) == 0u) return 2;
  return 3;
}

// Ground within 5 px: the surf's rings and the swell's foam live there.
bool nearShore(ivec2 p) {
  for (int k = 0; k < 8; k++) {
    float a = float(k) * (TAU / 8.0);
    vec2 d = vec2(cos(a), sin(a));
    if (seaAt(p + ivec2(round(d * 3.0))) == 0u || seaAt(p + ivec2(round(d * 5.0))) == 0u) return true;
  }
  return false;
}

// Of a jittered lattice of cell px whose sites circle slowly: half the gap
// between the nearest and the second nearest site (about the px to a cell's
// edge), and between the nearest and the third (small where three cells meet).
vec2 edge(vec2 p, vec2 cell, float t, int salt) {
  vec2 q = p / cell;
  ivec2 c = ivec2(floor(q));
  vec2 f = q - vec2(c);
  int n = WORLD_PX / int(cell.x);
  float d1 = 1e9;
  float d2 = 1e9;
  float d3 = 1e9;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      ivec2 k = ivec2((c.x + i) % n, c.y + j + 4096);
      float a = TAU * (rnd(k, salt + 2) + t / (11.0 + 6.0 * rnd(k, salt + 3)));
      vec2 s = 0.2 + 0.6 * vec2(rnd(k, salt), rnd(k, salt + 1)) + 0.12 * vec2(cos(a), sin(a));
      vec2 o = (vec2(i, j) + s - f) * cell;
      float d = dot(o, o);
      if (d < d1) { d3 = d2; d2 = d1; d1 = d; } else if (d < d2) { d3 = d2; d2 = d; } else if (d < d3) { d3 = d; }
    }
  }
  float r = sqrt(d1);
  return 0.5 * vec2(sqrt(d2) - r, sqrt(d3) - r);
}

void main() {
  ivec2 frag = ivec2(gl_FragCoord.xy) / uScale;
  ivec2 p = uOrigin + ivec2(frag.x, uHeight - 1 - frag.y);
  outColor = vec4(0.0);
  uint own = seaAt(p);
  if (own == 0u || covered(p)) return;
  vec2 pc = vec2(p) + 0.5;
  float sh = shelter(pc);
  vec4 caustic = texelFetch(uLut, ivec2(int(own), 0), 0);
  if (sh > 0.3 && caustic.a > 0.0) {
    int dry = dryWithin(p);
    if (dry == 1) return;
    // The lattice through a slow warp of a few px bends its edges into the round cells of caustics.
    vec2 warp = vec2(noise(pc + vec2(uTime * 0.9, 0.0), vec2(16.0, 12.0), 60),
                     noise(pc + vec2(0.0, uTime * 0.7), vec2(16.0, 12.0), 61)) - 0.5;
    vec2 e = edge(pc + 5.0 * warp + vec2(0.25, 0.15) * uTime, vec2(16.0, 14.0), uTime, 10);
    float spread = smoothstep(0.15, 0.5, noise(pc + vec2(uTime * 0.8, 0.0), vec2(64.0, 48.0), 40));
    // Thin filaments, thicker where three cells meet.
    float w = uStrength * spread * smoothstep(0.3, 0.9, sh) * (0.5 + 0.9 * exp(-e.y / 2.0));
    if (dry == 2) w *= 0.5;
    if (e.x < w) outColor = vec4(caustic.rgb, 1.0);
    return;
  }
  vec4 glint = texelFetch(uLut, ivec2(int(own), 1), 0);
  if (sh >= 0.5 || glint.a == 0.0 || p.y < 0) return;
  // One short crest per cell of 16 x 6 px at most, now and then, in drifting bright zones.
  ivec2 gc = ivec2(p.x / 16, p.y / 6);
  ivec2 gk = ivec2(gc.x % (WORLD_PX / 16), gc.y);
  float period = 5.0 + 3.0 * rnd(gk, 31);
  float cycle = uTime / period + rnd(gk, 32);
  float ph = fract(cycle);
  if (ph >= 0.4) return;
  // The zone as it was when this crest rose, so it never vanishes half way.
  float born = (floor(cycle) - rnd(gk, 32)) * period;
  vec2 centre = vec2(gc * ivec2(16, 6)) + vec2(8.0, 3.0);
  float zone = smoothstep(0.3, 0.65, noise(centre + vec2(born * 2.0, born * 0.7), vec2(128.0, 64.0), 50));
  if (rnd(gk + ivec2(0, int(floor(cycle)) & 1023), 30) >= 0.8 * zone * uStrength * (1.0 - 2.0 * sh)) return;
  float life = ph / 0.4;
  float rise = sin(3.14159 * life);
  int len = 1 + int(floor((1.0 + 3.0 * rnd(gk, 33)) * rise + 0.5));
  int x0 = 3 + int(rnd(gk, 34) * 7.0) + int(life * 3.0) - len / 2;
  int y0 = 1 + int(rnd(gk, 35) * 4.0);
  ivec2 l = p - gc * ivec2(16, 6);
  if (l.y != y0 || l.x < x0 || l.x >= x0 + len || nearShore(p)) return;
  // The middle of a long crest at its height a step brighter still.
  vec4 core = texelFetch(uLut, ivec2(int(own), 2), 0);
  outColor = vec4(rise > 0.7 && len >= 3 && l.x == x0 + len / 2 && core.a > 0.0 ? core.rgb : glint.rgb, 1.0);
}`;

  export interface WaterFxFrame {
    /** World art px of the picture's top left, x in [WORLD_PX, 2 · WORLD_PX). */
    readonly originX: number;
    readonly originY: number;
    readonly width: number;
    readonly height: number;
    /** Canvas px per art px: k, as landview.ts blits a zoom between whole multiples (nearest ×k, then smoothly down). */
    readonly scale: number;
    /** Tile of the tiles texture's first texel, in the same x frame as originX. */
    readonly tileX: number;
    readonly tileY: number;
    readonly time: number;
    readonly strength: number;
  }

  export type WaterFxFailure = 'nowebgl' | 'shader' | 'lost';

  export class WaterFxGl {
    readonly canvas: HTMLCanvasElement;
    private readonly gl: WebGL2RenderingContext;
    private readonly program: WebGLProgram;
    private readonly uniforms = new Map<string, WebGLUniformLocation | null>();
    private readonly mask: WebGLTexture;
    private readonly owner: WebGLTexture;
    private readonly tiles: WebGLTexture;
    private readonly lut: WebGLTexture;
    slotsX = 0;
    slotsY = 0;
    private tilesW = 0;
    private tilesH = 0;
    lost = false;

    private constructor(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext, program: WebGLProgram) {
      this.canvas = canvas;
      this.gl = gl;
      this.program = program;
      const tex = (): WebGLTexture => {
        const t = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return t;
      };
      this.mask = tex();
      this.owner = tex();
      this.tiles = tex();
      this.lut = tex();
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.useProgram(program);
      for (const [name, unit] of [['uMask', 0], ['uOwner', 1], ['uTiles', 2], ['uLut', 3]] as const) gl.uniform1i(this.at(name), unit);
      canvas.addEventListener('webglcontextlost', () => { this.lost = true; });
    }

    /**
     * The stage on a canvas of its own, or why there is none. Software
     * rendering counts as none (failIfMajorPerformanceCaveat): the map would
     * pay for the water with its frame rate.
     */
    static create(canvas: HTMLCanvasElement): WaterFxGl | WaterFxFailure {
      let gl: WebGL2RenderingContext | null = null;
      try {
        gl = canvas.getContext('webgl2', {
          alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false,
          // Drawn once per picture, copied into the map every frame.
          preserveDrawingBuffer: true, failIfMajorPerformanceCaveat: true,
        }) as WebGL2RenderingContext | null;
      } catch {
        gl = null;
      }
      if (!gl) return 'nowebgl';
      const program = WaterFxGl.link(gl);
      // Slots span the world's width at the widest view; the floor WebGL2 guarantees is 2048.
      const roomy = gl.getParameter(gl.MAX_TEXTURE_SIZE) >= GRID_W * 16;
      if (program && roomy) return new WaterFxGl(canvas, gl, program);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return program ? 'nowebgl' : 'shader';
    }

    private static link(gl: WebGL2RenderingContext): WebGLProgram | null {
      const shader = (type: number, src: string): WebGLShader | null => {
        const s = gl.createShader(type);
        if (!s) return null;
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (gl.getShaderParameter(s, gl.COMPILE_STATUS)) return s;
        console.warn('Wassereffekte: Shader nicht übersetzt', gl.getShaderInfoLog(s));
        return null;
      };
      const vs = shader(gl.VERTEX_SHADER, VERTEX);
      const fs = shader(gl.FRAGMENT_SHADER, FRAGMENT);
      const p = vs && fs ? gl.createProgram() : null;
      if (!p || !vs || !fs) return null;
      gl.attachShader(p, vs);
      gl.attachShader(p, fs);
      gl.linkProgram(p);
      if (gl.getProgramParameter(p, gl.LINK_STATUS)) return p;
      console.warn('Wassereffekte: Shader nicht gebunden', gl.getProgramInfoLog(p));
      return null;
    }

    private at(name: string): WebGLUniformLocation | null {
      if (!this.uniforms.has(name)) this.uniforms.set(name, this.gl.getUniformLocation(this.program, name));
      return this.uniforms.get(name)!;
    }

    /** Room for nx × ny chunks; a new size starts empty (every slot owned by none). */
    slots(nx: number, ny: number): void {
      const gl = this.gl;
      this.slotsX = nx;
      this.slotsY = ny;
      gl.bindTexture(gl.TEXTURE_2D, this.mask);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8UI, nx * CHUNK_PX, ny * CHUNK_PX, 0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, null);
      this.owners(new Uint8Array(nx * ny));
    }

    /** One chunk's sea into slot (sx, sy): CHUNK_PX rows of CHUNK_PX palette indices. */
    chunk(sx: number, sy: number, sea: Uint8Array): void {
      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D, this.mask);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, sx * CHUNK_PX, sy * CHUNK_PX, CHUNK_PX, CHUNK_PX, gl.RED_INTEGER, gl.UNSIGNED_BYTE, sea);
    }

    owners(owner: Uint8Array): void {
      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D, this.owner);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8UI, this.slotsX, this.slotsY, 0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, owner);
    }

    tileBits(bits: Uint8Array, w: number, h: number): void {
      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D, this.tiles);
      if (w !== this.tilesW || h !== this.tilesH) {
        this.tilesW = w;
        this.tilesH = h;
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8UI, w, h, 0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, bits);
      } else {
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, gl.RED_INTEGER, gl.UNSIGNED_BYTE, bits);
      }
    }

    /** 256 × 3 RGBA: caustic colours, glint colours, the glints' cores. */
    colors(rgba: Uint8Array): void {
      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D, this.lut);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 3, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
    }

    /** False when the browser would not give the canvas that size (a view wider than its drawing buffer). */
    render(f: WaterFxFrame): boolean {
      const gl = this.gl;
      const w = f.width * f.scale;
      const h = f.height * f.scale;
      if (this.canvas.width !== w || this.canvas.height !== h) {
        this.canvas.width = w;
        this.canvas.height = h;
      }
      if (gl.drawingBufferWidth !== w || gl.drawingBufferHeight !== h) return false;
      gl.viewport(0, 0, w, h);
      gl.useProgram(this.program);
      const units = [this.mask, this.owner, this.tiles, this.lut];
      for (let u = 0; u < units.length; u++) {
        gl.activeTexture(gl.TEXTURE0 + u);
        gl.bindTexture(gl.TEXTURE_2D, units[u]);
      }
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform2i(this.at('uOrigin'), f.originX, f.originY);
      gl.uniform2i(this.at('uTileOrigin'), f.tileX, f.tileY);
      gl.uniform2i(this.at('uTileSize'), this.tilesW, this.tilesH);
      gl.uniform2i(this.at('uSlots'), this.slotsX, this.slotsY);
      gl.uniform1i(this.at('uHeight'), f.height);
      gl.uniform1i(this.at('uScale'), f.scale);
      gl.uniform1f(this.at('uTime'), f.time);
      gl.uniform1f(this.at('uStrength'), f.strength);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      return true;
    }

    /** Give the textures and the picture back (switched off); `slots` must run again before the next frame. */
    release(): void {
      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D, this.mask);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8UI, 1, 1, 0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, null);
      this.slotsX = this.slotsY = 0;
      this.canvas.width = this.canvas.height = 1;
    }
  }
}
