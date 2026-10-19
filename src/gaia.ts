/* =============================================================================
 * SimEarth 2.0 — Gaia
 * -----------------------------------------------------------------------------
 * The planet's face, as in the original: her expression tracks the health of
 * the biosphere and her eyes follow the pointer. Her body is the player's own
 * planet, the pixel globe of the title screen turning slowly; on it a face
 * pixelled by hand, one for each of her six moods, and around it what weighs
 * on her: sweat when she is hot, snow when cold, smog when the air is foul.
 * She sleeps until the first life stirs on her. Awake, she talks about each
 * of her troubles in turn, worst first, cheers or gasps when her mood changes,
 * dozes off while the game is paused, and she can be poked — up to a point.
 * Below, her mood as a word and on a scale.
 * ========================================================================== */

namespace SE {
  /** The four things her mood is made of (WorldState.gaiaFactors), in the order she mentions ties. */
  const FACTORS = ['climate', 'life', 'diversity', 'clean'] as const;

  /** Her six moods, worst first; `moodLevel` picks one. */
  const LABELS = ['Entsetzt', 'Besorgt', 'Unruhig', 'Ruhig', 'Zufrieden', 'Glückselig'];
  const moodLevel = (mood: number): number => [0.18, 0.34, 0.5, 0.68, 0.85].filter((t) => mood > t).length;

  /** What she says: about her troubles while any weighs on her, else about her mood. */
  const LINES: Readonly<Record<string, readonly string[]>> = {
    hot: ['Puh! Ich schwitze wie ein Vulkan.', 'Ist das heiß hier – oder liegt das an mir?'],
    cold: ['B-b-bitterkalt hier …', 'Kann mal jemand die Sonne aufdrehen?'],
    life: ['Hallo? Ist da jemand?', 'So leer hier. Ein bisschen Leben wär nett.'],
    diversity: ['Immer dieselben Gesichter …', 'Ein paar neue Arten, bitte!'],
    clean: ['*hust* Wer hat hier so gequalmt?', 'Ich krieg kaum Luft!'],
    calm: ['Alles im grünen Bereich … fast.', 'Ich dreh mich einfach weiter.'],
    content: ['Läuft bei mir.', 'Ein schöner Tag zum Rotieren.'],
    blissful: ['Ich könnte die ganze Galaxis umarmen!', 'So viel Leben – ich bin so stolz!'],
    better: ['Oh! Schon besser!', 'Jaa, weiter so!'],
    worse: ['Oh nein …', 'Hey! Was war das denn?!'],
    poked: ['Hihi, das kitzelt!', 'Huch! Hallo du.', 'Nicht so fest – ich dreh mich doch schon.'],
    pokedSad: ['Autsch! Hilf mir lieber.', 'Lass das. Ich hab gerade andere Sorgen.', 'Nicht jetzt …'],
    annoyed: ['Jetzt reicht’s aber!', 'Ich bin ein Planet, kein Knopf!'],
    asleep: ['Zzz …', 'Nur noch fünf Minuten …'],
    dormant: ['Zzz …', 'Zzz … weckt mich, wenn sich das erste Leben regt …'],
    pokedDormant: ['Mmh … noch nichts los hier …', 'Zzz … erst, wenn was lebt …'],
    woke: ['Oh! Da regt sich was!', 'Huch – Leben? Hallo, ihr Kleinen!'],
  };
  const MOOD_LINES = ['calm', 'calm', 'calm', 'calm', 'content', 'blissful'];

  /** Stage pixels wanted along its short side; each is drawn as a whole number of device pixels. */
  const STAGE_PX = 96;
  /** Fewer stage pixels than this and her face would not fit her: the pixels get finer instead. */
  const STAGE_MIN = 80;
  /** Her radius as a share of the stage's short side, and at most, in stage pixels: her face is drawn for this size. */
  const BODY = 0.41;
  const BODY_MAX = 42;
  /** Pixel art moves in steps: one frame this long. */
  const FRAME_MS = 90;
  /** A poke squeezes her eyes this long; a poke or a change of mood is talked about this long. */
  const POKE_MS = 700;
  const SAY_MS = 2600;
  /** Pokes in a row, each within this of the last, until she has had enough. */
  const POKE_CHAIN_MS = 2500;
  const POKES_TOO_MANY = 5;
  /** She moves on to her next trouble, or her next line, this often. */
  const LINE_MS = 10000;
  /** She dozes off when the game has been paused this long, untouched. */
  const SLEEP_MS = 8000;
  /** Her surface follows the planet's changes this often at most. */
  const RETEXTURE_MS = 8000;
  /** Her turn, in radians per ms: once round in about 90 s. */
  const SPIN = 0.00007;

  /** Sprite colours from the game's palettes: ink, eye white, mouth, pink, white, water, red, gold, orange, smog dark and light. */
  const COLOURS: Readonly<Record<string, string>> = {
    k: '#0c1a14', w: '#f6f1df', m: '#8e2f33', p: '#e98fb0', t: '#f2efe2',
    b: '#80c8cc', r: '#c4453f', y: '#f0c64a', o: '#df8a3a', g: '#807b7c', G: '#a59f97',
  };

  type Sprite = readonly string[];

  // Eyes, 11 × 13, drawn with their top left at (centre − 5, centre − 6). The pupil shows only on the eye white.
  const EYE: Sprite = [
    '...kkkkk...', '..kwwwwwk..', '.kwwwwwwwk.', '.kwwwwwwwk.', 'kwwwwwwwwwk', 'kwwwwwwwwwk', 'kwwwwwwwwwk',
    'kwwwwwwwwwk', 'kwwwwwwwwwk', '.kwwwwwwwk.', '.kwwwwwwwk.', '..kwwwwwk..', '...kkkkk...',
  ];
  /** Lid half down: blinking, or unimpressed. */
  const EYE_HALF: Sprite = [
    '', '', '', '', '', 'kkkkkkkkkkk', 'kwwwwwwwwwk', 'kwwwwwwwwwk', 'kwwwwwwwwwk', '.kwwwwwwwk.', '.kwwwwwwwk.', '..kwwwwwk..', '...kkkkk...',
  ];
  const EYE_SHUT: Sprite = ['', '', '', '', '', '', '', 'kk.......kk', '.kkkkkkkkk.'];
  const EYE_HAPPY: Sprite = ['', '', '', '', '....kkk....', '..kkkkkkk..', '.kkk...kkk.', 'kk.......kk', 'k.........k'];
  /** The left eye's ">"; mirrored it is the right eye's "<". */
  const EYE_SQUEEZE: Sprite = ['', '', 'kk.........', '.kkk.......', '...kkk.....', '.....kkk...', '.......kkk.', '.....kkk...', '...kkk.....', '.kkk.......', 'kk.........'];
  /** 5 × 6 with a glint, its top left at eye column 3, row 4 when she looks straight ahead. */
  const PUPIL: Sprite = ['.kkk.', 'ktkkk', 'kkkkk', 'kkkkk', 'kkkkk', '.kkk.'];

  // Mouths, centred, their top row on the mouth line.
  const GRIN: Sprite = [
    'kkkkkkkkkkkkkkkkkkk', 'ktttttttttttttttttk', '.kmmmmmmmmmmmmmmmk.', '..kmmmmmmmmmmmmmk..',
    '...kmmmmpppmmmmk...', '....kkmpppppmkk....', '......kkkkkkk......',
  ];
  const SMILE: Sprite = ['kk...............kk', '.kk.............kk.', '..kkk.........kkk..', '....kkkkkkkkkkk....', '......kkkkkkk......'];
  const SLIGHT: Sprite = ['kk...........kk', '.kkk.......kkk.', '...kkkkkkkkk...'];
  const WAVY: Sprite = ['.....kkk.....kkk.', 'k...kkkkk...kkkkk', 'kkkkk...kkkkk...k', '.kkk.....kkk.....'];
  const FROWN: Sprite = ['.....kkkkkkk.....', '...kkkkkkkkkkk...', '.kkkk.......kkkk.', 'kk.............kk'];
  const SCREAM: Sprite = [
    '...kkkkk...', '..kmmmmmk..', '.kmmmmmmmk.', '.kmmmmmmmk.', 'kmmmmmmmmmk', 'kmmmmmmmmmk',
    'kmmmmmmmmmk', 'kmmmpppmmmk', '.kmpppppmk.', '.kpppppppk.', '..kkkkkkk..',
  ];
  const CHATTER: Sprite = ['kkkkkkkkkkkkkkk', 'ktktktktktktktk', 'ktktktktktktktk', 'kkkkkkkkkkkkkkk'];
  const OOH: Sprite = ['..kkk..', '.kmmmk.', 'kmmmmmk', 'kmmmmmk', 'kmmmmmk', '.kmmmk.', '..kkk..'];
  const SNORE: Sprite = ['.kkk.', 'kmmmk', 'kmmmk', '.kkk.'];
  /** Mouth by mood, worst first. */
  const MOUTHS = [SCREAM, FROWN, WAVY, SLIGHT, SMILE, GRIN];
  /** Brows by mood: [lift, how much higher the inner end, extra lift of the left brow]. */
  const BROWS: readonly (readonly [number, number, number])[] = [[3, 2, 0], [1, 3, 0], [0, 1, 2], [0, 0, 0], [1, 0, 0], [2, 0, 0]];

  // What floats around her.
  const BLUSH: Sprite = ['.pppp.', 'pppppp'];
  const FLUSH: Sprite = ['.rrrr.', 'rrrrrr'];
  /** Heat rising off her, 2 px thick; mirrored every few frames it wavers. */
  const HEAT: Sprite = ['.oo.', 'oo..', 'oo..', '.oo.', '..oo', '..oo', '.oo.'];
  const ZED: Sprite = ['ttttt', '...tt', '..tt.', '.tt..', 'ttttt'];
  const ZED_SMALL: Sprite = ['tttt', '..t.', '.t..', 'tttt'];
  const HEART: Sprite = ['.rr.rr.', 'rtrrrrr', 'rrrrrrr', '.rrrrr.', '..rrr..', '...r...'];
  const SPARK: Sprite = ['..y..', '..y..', 'yytyy', '..y..', '..y..'];
  const TWINKLE: Sprite = ['.y.', 'yty', '.y.'];
  const NOTE: Sprite = ['.tt.', '.t.t', '.t..', '.t..', 'tt..', 'tt..'];
  const DROP: Sprite = ['..k..', '.kbk.', '.kbk.', 'kbbbk', 'kbtbk', 'kbbbk', '.kkk.'];
  const FLAKE: Sprite = ['.t.', 'ttt', '.t.'];
  const PUFF: Sprite = ['..gGg...', '.gGGGgg.', 'gGGGGGGg', '.gggggg.'];
  const BANG: Sprite = ['rr', 'rr', 'rr', 'rr', '', 'rr'];
  const ANGER: Sprite = ['rr.....rr', 'rrr...rrr', '.rr...rr.', '', '.rr...rr.', 'rrr...rrr', 'rr.....rr'];

  /** A bounce, one frame each; a poke or good news plays it once, bliss over and over. */
  const HOP = [0, -1, -2, -3, -3, -2, -1, 0];
  /** Where an uneasy Gaia looks, in turns. */
  const DART = [0, -2, -2, 0, 2, 2, 0, 0];

  function blit(ctx: CanvasRenderingContext2D, s: Sprite, x: number, y: number, mirror = false): void {
    for (let j = 0; j < s.length; j++) {
      const row = s[j];
      for (let i = 0; i < row.length; i++) {
        const c = row[mirror ? row.length - 1 - i : i];
        if (c === '.') continue;
        ctx.fillStyle = COLOURS[c];
        ctx.fillRect(x + i, y + j, 1, 1);
      }
    }
  }

  /** The pupil at eye column `px`, row `py`, drawn only where the eye `eye` (top left at x, y) shows white. */
  function pupil(ctx: CanvasRenderingContext2D, eye: Sprite, x: number, y: number, s: Sprite, px: number, py: number): void {
    for (let j = 0; j < s.length; j++) {
      for (let i = 0; i < s[j].length; i++) {
        const c = s[j][i];
        if (c === '.' || eye[py + j]?.[px + i] !== 'w') continue;
        ctx.fillStyle = COLOURS[c];
        ctx.fillRect(x + px + i, y + py + j, 1, 1);
      }
    }
  }

  export class GaiaPanel {
    private readonly stage: HTMLElement;
    private readonly canvas: HTMLCanvasElement;
    private readonly ctx: CanvasRenderingContext2D;
    private readonly globe: TitleGlobe;
    private readonly say: HTMLElement;
    private readonly sayTyped: HTMLElement;
    private readonly sayRest: HTMLElement;
    private readonly moodLabel: HTMLElement;
    private readonly moodValue: HTMLElement;
    private readonly moodMark: HTMLElement;
    private pointer = { x: 0.5, y: 0.5 };
    private sig = '';
    private frame = -1;
    /** Her mood as shown, with a little hysteresis; −1 before the first look. */
    private level = -1;
    private reactAt = -Infinity;
    private reactUp = false;
    private pokedAt = -Infinity;
    private pokes = 0;
    /** No life on her yet: she sleeps until it comes. */
    private lifeless = false;
    /** The last reaction was her waking to the first life. */
    private woke = false;
    /** When the game was paused; −1 while it runs. */
    private pausedAt = -1;
    /** Which of a few lines a poke or a reaction gets. */
    private pick = 0;
    private textureAt = -Infinity;
    private textureKey = '';
    private line = '';
    private lineAt = 0;
    private typed = -1;
    /** The canvas size and place last set, to touch its style only on a change. */
    private placed = '';

    constructor(host: HTMLElement) {
      this.stage = make('div', 'gaia-stage');
      this.canvas = make('canvas', 'gaia-face');
      // The canvas sizes itself to the stage, so it must never size the stage: it floats over it, and the
      // stage takes what the column leaves. Set here rather than in the stylesheet: with an outdated
      // stylesheet the two grew each other every frame and the window scrolled away without end.
      this.stage.style.cssText = 'position: relative; flex: 1 1 0; min-height: 0; overflow: hidden';
      this.canvas.style.cssText = 'position: absolute; min-height: 0; image-rendering: pixelated';
      this.canvas.setAttribute('role', 'img');
      this.canvas.title = 'Gaia anstupsen';
      const ctx = this.canvas.getContext('2d');
      if (!ctx) throw new Error('SimEarth: 2D context unavailable for Gaia');
      this.ctx = ctx;
      // Her globe is painted off-screen at exactly her size and copied onto the stage pixel for pixel.
      this.globe = new TitleGlobe(make('canvas'), true);
      this.stage.appendChild(this.canvas);
      // Typed out letter by letter; the rest is already there, invisible, so nothing reflows and screen readers get it all.
      this.say = make('p', 'gaia-say');
      this.sayTyped = make('span');
      this.sayRest = make('span', 'gaia-say-rest');
      this.say.append(this.sayTyped, this.sayRest);
      const head = make('div', 'gaia-mood');
      this.moodLabel = make('span', 'gaia-mood-label');
      this.moodValue = make('span', 'gaia-mood-value');
      const bar = make('div', 'gaia-mood-bar');
      this.moodMark = make('span', 'gaia-mood-mark');
      bar.appendChild(this.moodMark);
      head.append(this.moodLabel, this.moodValue, bar);
      host.append(this.stage, this.say, head);
      this.canvas.addEventListener('pointerdown', () => {
        const now = performance.now();
        this.pokes = now - this.pokedAt < POKE_CHAIN_MS ? this.pokes + 1 : 1;
        this.pokedAt = now;
        this.pick = Math.floor(Math.random() * 1000);
      });
      window.addEventListener('pointermove', (e) => {
        const rect = this.canvas.getBoundingClientRect();
        if (rect.width <= 0) return;
        this.pointer.x = clamp((e.clientX - rect.left) / rect.width, -1, 2);
        this.pointer.y = clamp((e.clientY - rect.top) / rect.height, -1, 2);
      });
    }

    static moodLabel(mood: number): string {
      return LABELS[moodLevel(mood)];
    }

    /** `still`: no hopping or shaking (the player's reduce-effects setting); `paused`: the game stands still. */
    render(world: WorldState, now: number, still = false, paused = false): void {
      const mood = world.gaiaMood;
      if (!paused) this.pausedAt = -1;
      else if (this.pausedAt < 0) this.pausedAt = now;
      // The first life wakes her, with a cheer.
      const lifeless = world.lifeCover <= 0;
      if (this.lifeless && !lifeless && this.level >= 0) {
        this.reactUp = true;
        this.reactAt = now;
        this.woke = true;
        this.pick = Math.floor(Math.random() * 1000);
      }
      this.lifeless = lifeless;
      // She keeps her mood until it is clearly past a border, so she does not flicker on one; a change she reacts to,
      // unless she sleeps through it.
      if (this.level < 0) this.level = moodLevel(mood);
      else if (this.level < moodLevel(mood - 0.015) || this.level > moodLevel(mood + 0.015)) {
        const next = moodLevel(mood);
        if (!lifeless) {
          this.reactUp = next > this.level;
          this.reactAt = now;
          this.woke = false;
          this.pick = Math.floor(Math.random() * 1000);
        }
        this.level = next;
      }
      const level = this.level;
      const f = world.gaiaFactors();
      const hot = world.globalTemp > 15;
      // A lifeless world keeps her asleep, a poke only stirs her; a paused one sends her to sleep unless she is
      // too worried, and a poke or a change of mood wakes her.
      const asleep = lifeless
        ? now - this.pokedAt > POKE_MS
        : this.pausedAt >= 0 && level >= 2 && now - Math.max(this.pausedAt, this.pokedAt, this.reactAt) > SLEEP_MS;
      // What troubles her, worst first; she talks about one after the other.
      const troubles = FACTORS.filter((k) => f[k] < 0.5).sort((a, b) => f[a] - f[b]);
      const turn = Math.floor(now / LINE_MS);
      const about = asleep || !troubles.length ? '' : troubles[turn % troubles.length];
      const frame = Math.floor(now / FRAME_MS);
      if (frame !== this.frame) {
        this.frame = frame;
        this.draw(world, now, level, f, hot, still, asleep);
      }
      const topic = asleep ? (lifeless ? 'dormant' : 'asleep') : about === 'climate' ? (hot ? 'hot' : 'cold') : about;
      this.speak(topic, level, now, Math.floor(turn / Math.max(1, troubles.length)));

      const sig = `${Math.round(mood * 100)}|${level}`;
      if (sig === this.sig) return;
      this.sig = sig;
      this.moodLabel.textContent = LABELS[level];
      this.canvas.setAttribute('aria-label', `Gaia: ${LABELS[level]}`);
      this.moodValue.textContent = `${Math.round(mood * 100)} %`;
      this.moodMark.style.left = `${Math.round(mood * 1000) / 10}%`;
    }

    /** `topic`: her sleep or the trouble she is on, '' for none; `turn` picks which of its lines. */
    private speak(topic: string, level: number, now: number, turn: number): void {
      // Her topic or her mood; a poke or a change of mood for a moment instead.
      let key = topic || MOOD_LINES[level];
      if (now - this.pokedAt < SAY_MS) {
        key = this.pokes >= POKES_TOO_MANY ? 'annoyed' : this.lifeless ? 'pokedDormant' : level >= 3 ? 'poked' : 'pokedSad';
        turn = this.pick;
      } else if (now - this.reactAt < SAY_MS) {
        key = this.woke ? 'woke' : this.reactUp ? 'better' : 'worse';
        turn = this.pick;
      }
      const pool = LINES[key];
      const text = pool[turn % pool.length];
      if (text !== this.line) {
        this.line = text;
        this.lineAt = now;
        this.typed = -1;
      }
      const n = Math.min(text.length, Math.floor((now - this.lineAt) / 30));
      if (n === this.typed) return;
      this.typed = n;
      this.sayTyped.textContent = text.slice(0, n);
      this.sayRest.textContent = text.slice(n);
      this.say.classList.toggle('done', n === text.length);
    }

    /** Size the canvas to the stage, whole device pixels per stage pixel, centred; false while it has no room. */
    private fit(): boolean {
      const box = this.stage.getBoundingClientRect();
      if (box.width <= 0 || box.height <= 0) return false;
      const dpr = window.devicePixelRatio || 1;
      const d = Math.min(box.width, box.height) * dpr;
      const scale = Math.max(1, Math.min(Math.round(d / STAGE_PX), Math.floor(d / STAGE_MIN)));
      const w = Math.floor((box.width * dpr) / scale);
      const h = Math.floor((box.height * dpr) / scale);
      const left = Math.floor((box.width * dpr - w * scale) / 2);
      const top = Math.floor((box.height * dpr - h * scale) / 2);
      const placed = `${w}|${h}|${scale}|${left}|${top}|${dpr}`;
      if (placed === this.placed) return true;
      this.placed = placed;
      this.canvas.width = w;
      this.canvas.height = h;
      const s = this.canvas.style;
      s.width = `${(w * scale) / dpr}px`;
      s.height = `${(h * scale) / dpr}px`;
      s.left = `${left / dpr}px`;
      s.top = `${top / dpr}px`;
      return true;
    }

    private draw(world: WorldState, now: number, level: number, f: ReturnType<WorldState['gaiaFactors']>, hot: boolean, still: boolean, asleep: boolean): void {
      if (!this.fit()) return;
      const ctx = this.ctx;
      const { width: w, height: h } = this.canvas;
      const frame = this.frame;
      ctx.clearRect(0, 0, w, h);
      const sincePoke = now - this.pokedAt;
      const annoyed = sincePoke < SAY_MS && this.pokes >= POKES_TOO_MANY;
      const poke = !annoyed && sincePoke < POKE_MS ? Math.floor(sincePoke / FRAME_MS) : -1;
      const react = now - this.reactAt < 1200 ? Math.floor((now - this.reactAt) / FRAME_MS) : -1;
      const cheer = react >= 0 && this.reactUp;
      const gasp = react >= 0 && !this.reactUp;
      const cold = f.climate < 0.6 && !hot;
      const sweltering = f.climate < 0.6 && hot;

      // An even number of globe pixels, so she sits on whole pixels.
      const g = 2 * Math.round(Math.min(Math.min(w, h) * BODY, BODY_MAX) / GLOBE_DISC / 2);
      const r = g * GLOBE_DISC;
      const R = Math.round(r);
      let bob = 0;
      let dx = 0;
      let dy = 0;
      if (!still && asleep) bob = Math.floor(now / 1500) % 2 ? -1 : 0;
      else if (!still) {
        if (poke >= 0) bob = HOP[Math.min(poke, HOP.length - 1)];
        else if (cheer) bob = HOP[Math.min(react, HOP.length - 1)];
        else if (level === 5) bob = HOP[frame % 16] ?? 0;
        else if (level >= 3) bob = Math.floor(now / (level === 4 ? 800 : 1200)) % 2 ? -1 : 0;
        // Horror and bad news shake her, worry and anger make her tremble, cold makes her shiver.
        if (level === 0 || gasp) { dx = (frame % 3) - 1; dy = ((frame >> 1) % 3) - 1; }
        else if (level === 1 || annoyed) dx = frame % 4 < 2 ? 0 : 1;
        else if (cold) dx = frame % 2;
      }
      const cx = (w >> 1) + dx;
      const cy = (h >> 1) + 2 + bob + dy;

      // Her body: the player's planet, turning.
      this.globe.size = g;
      // ponytail: a whole repaint of her surface costs ~16 ms, so at most every RETEXTURE_MS; paint it in slices if that hitch shows.
      if (now - this.textureAt > RETEXTURE_MS) {
        this.textureAt = now;
        this.textureKey = `${world.revision}|${world.seed}`;
      }
      this.globe.spin = 2.4 + now * SPIN;
      this.globe.render(world, this.textureKey);
      this.globe.drawTo(ctx, cx, cy, r);

      // Her face.
      const ex = Math.round(r * 0.35);
      const ey = cy - Math.round(r * 0.14);
      const blinkAt = frame % 47;
      const blink = blinkAt === 0 || blinkAt === 3 ? EYE_HALF : blinkAt < 3 ? EYE_SHUT : null;
      let eye = level === 5 ? EYE_HAPPY : EYE;
      if (poke >= 0) eye = EYE_SQUEEZE;
      else if (asleep) eye = EYE_SHUT;
      else if (annoyed) eye = EYE_HALF;
      else if (blink && level >= 1 && level <= 4) eye = blink;
      const [lift, worry, skew] = annoyed ? [0, -3, 0] : asleep ? [0, 0, 0] : BROWS[level];
      const gx = level === 2 ? DART[Math.floor(now / 600) % DART.length] : Math.round(clamp((this.pointer.x - 0.5) * 2, -1, 1) * 2);
      const gy = level === 2 ? 0 : Math.round(clamp((this.pointer.y - 0.45) * 2, -1, 1) * 2.5);
      for (const side of [-1, 1]) {
        const x = cx + side * ex;
        const top = ey - 6;
        blit(ctx, eye, x - 5, top, side > 0 && eye === EYE_SQUEEZE);
        // Pinpoint pupils that tremble in horror; else they follow the pointer.
        if (level === 0 && eye === EYE) pupil(ctx, eye, x - 5, top, ['kk', 'kk'], 4 + (frame % 3) - 1, 5);
        else if (eye === EYE || eye === EYE_HALF) pupil(ctx, eye, x - 5, top, PUPIL, 3 + gx, 4 + gy);
        // Brows, outer end to inner end; worry lifts the inner end, anger drops it. Closed arcs need none.
        if (eye !== EYE_HAPPY && eye !== EYE_SQUEEZE) {
          ctx.fillStyle = COLOURS.k;
          const up = lift + (side < 0 ? skew : 0);
          for (let i = 0; i < 9; i++) ctx.fillRect(x + side * (4 - i), Math.round(top - 3 - up - (worry * i) / 8), 1, 2);
        }
        // Flushed in the heat, rosy when happy.
        if (sweltering && !asleep) blit(ctx, FLUSH, x - 3 + side * 3, ey + 8);
        else if (!annoyed && (level >= 4 || ((poke >= 0 || cheer) && level >= 3))) blit(ctx, BLUSH, x - 3 + side * 3, ey + 8);
        // Tears run when she is horrified.
        if (level === 0) blit(ctx, DROP, x - 2 + side * 2, ey + 5 + ((frame * 2 + (side > 0 ? 7 : 0)) % 14));
      }
      let mouth = MOUTHS[level];
      if (poke >= 0) mouth = level >= 3 ? GRIN : OOH;
      else if (asleep) mouth = SNORE;
      else if (annoyed) mouth = FROWN;
      else if (react >= 0 && react < 9) mouth = cheer ? GRIN : OOH;
      else if (cold && level >= 1 && level <= 3) mouth = CHATTER;
      blit(ctx, mouth, cx - (mouth[0].length >> 1) + (mouth === CHATTER ? frame % 2 : 0), cy + Math.round(r * 0.27));

      // Around her; sleep and anger put an end to hearts, sparkles and whistling.
      const glad = !asleep && !annoyed;
      if (level === 5 && glad) {
        for (let k = 0; k < 3; k++) {
          const t = ((now + k * 900) % 2700) / 2700;
          if (t > 0.8 && frame % 2) continue;
          const far = R + 3 + (k === 2 ? 9 : 0);
          const x = k === 1 ? cx + far : cx - far - 7;
          blit(ctx, HEART, x + Math.round(Math.sin(t * 9) * 1.5), cy + 4 - Math.round(t * R * 1.1));
        }
      }
      if (level >= 4 && glad) {
        for (let k = 0; k < 4; k++) {
          const p = (frame + k * 6) % 24;
          if (p > 4) continue;
          const a = 0.5 + k * 1.6;
          const s = p === 2 ? SPARK : TWINKLE;
          blit(ctx, s, cx + Math.round(Math.cos(a) * (R + 8)) - (s.length >> 1), cy + Math.round(Math.sin(a) * (R + 4)) - (s.length >> 1));
        }
      }
      if (cheer && react < 9) {
        // Good news: a ring of sparks flying out.
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2 + 0.3;
          const d = R + 4 + react * 2;
          blit(ctx, react < 6 ? SPARK : TWINKLE, cx + Math.round(Math.cos(a) * d) - 2, cy + Math.round(Math.sin(a) * d) - 2);
        }
      }
      if (level === 3 && glad && poke < 0 && !cold && f.clean >= 0.5) {
        // She whistles.
        for (let k = 0; k < 2; k++) {
          const t = ((now + k * 1600) % 3200) / 3200;
          if (t < 0.75) blit(ctx, NOTE, cx + R + Math.round(t * 12), cy - 4 - Math.round(t * R * 0.9));
        }
      }
      if (!asleep && (sweltering || level === 1 || level === 2)) {
        const slide = Math.round(((now % 1600) / 1600) * 8);
        blit(ctx, DROP, cx + Math.round(r * 0.55), ey - 12 + slide);
        if (sweltering) blit(ctx, DROP, cx - Math.round(r * 0.55) - 4, ey - 8 + ((slide + 4) % 8));
      }
      if (sweltering) {
        // Heat wavering up off her.
        for (let k = 0; k < 3; k++) {
          const t = ((now + k * 700) % 2100) / 2100;
          if (t > 0.8 && frame % 2) continue;
          blit(ctx, HEAT, cx - 16 + k * 14, cy - R + 3 - Math.round(t * 9), (frame >> 2) % 2 === 1);
        }
      }
      if (asleep) {
        // Zs drifting up, growing as they go.
        for (let k = 0; k < 2; k++) {
          const t = ((now + k * 1500) % 3000) / 3000;
          blit(ctx, t < 0.45 ? ZED_SMALL : ZED, cx + Math.round(r * 0.45 + t * 14), cy - Math.round(r * 0.5 + t * 18));
        }
      }
      if (cold) {
        for (let k = 0; k < 5; k++) {
          const x = cx + (k % 2 ? 1 : -1) * (R + 5 + ((k * 7) % 12)) - 1;
          blit(ctx, FLAKE, x + (Math.floor(now / 400 + k) % 2), ((Math.floor(now / 60) + k * 17) % (h + 4)) - 3);
        }
      }
      if (f.clean < 0.5) {
        for (let k = 0, n = f.clean < 0.25 ? 5 : 3; k < n; k++) {
          const a = now / 2600 + (k * Math.PI * 2) / n;
          blit(ctx, PUFF, cx + Math.round(Math.cos(a) * (R + 3)) - 4, cy + Math.round(Math.sin(a) * R * 0.7) - 2);
        }
      }
      if ((level === 0 || (gasp && react < 12)) && frame % 6 < 4) blit(ctx, BANG, cx + R - 3, cy - R - 5);
      if (annoyed && frame % 8 < 6) blit(ctx, ANGER, cx + Math.round(r * 0.4), cy - Math.round(r * 0.85));
    }
  }
}
