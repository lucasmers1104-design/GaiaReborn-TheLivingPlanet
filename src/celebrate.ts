/* =============================================================================
 * SimEarth 2.0 — the moment of a new step: light, colour, a little sound
 * -----------------------------------------------------------------------------
 * A short burst from where the step's badge appears: a flash, a ring, and a
 * spray of particles in the kingdom's look — leaves for plants, warm sparks
 * for animals, bubbles for the first cells — falling away in a second and a
 * half. A bright four-note chime goes with it. "Reduce motion" keeps only
 * the flash; the chime follows the sound option.
 * ========================================================================== */

namespace SE {
  interface Particle {
    x: number; y: number; vx: number; vy: number;
    rot: number; spin: number; size: number; life: number; age: number;
    color: string; shape: 'leaf' | 'spark' | 'bubble' | 'star';
  }

  const SHAPES: Readonly<Record<Kingdom, readonly Particle['shape'][]>> = {
    plant: ['leaf', 'leaf', 'spark', 'star'],
    animal: ['spark', 'spark', 'star', 'bubble'],
    origin: ['bubble', 'bubble', 'spark', 'star'],
  };
  const COLORS: Readonly<Record<Kingdom, readonly string[]>> = {
    plant: ['#8ad16f', '#b6e388', '#f6c453', '#5fa552', '#fff4c4'],
    animal: ['#f2a35c', '#ffc785', '#f6c453', '#ff7a6b', '#fff4c4'],
    origin: ['#5ccfd0', '#a6f0ec', '#b48cff', '#f6c453', '#ffffff'],
  };
  const GRAVITY = 620;
  const DRAG = 1.6;

  let canvas: HTMLCanvasElement | null = null;
  let particles: Particle[] = [];
  let flash: { x: number; y: number; age: number; color: string } | null = null;
  let last = 0;
  let running = false;

  const still = (): boolean => typeof window !== 'undefined' && !!window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** Burst from (x, y) in page coordinates. */
  export function celebrate(x: number, y: number, kingdom: Kingdom): void {
    if (!canvas) {
      canvas = make('canvas', 'fx-layer');
      canvas.setAttribute('aria-hidden', 'true');
      document.body.appendChild(canvas);
    }
    flash = { x, y, age: 0, color: COLORS[kingdom][0] };
    if (!still()) {
      const shapes = SHAPES[kingdom];
      const colors = COLORS[kingdom];
      for (let k = 0; k < 110; k++) {
        const a = Math.random() * Math.PI * 2;
        const speed = 220 + Math.random() * 520;
        particles.push({
          x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - 180,
          rot: Math.random() * Math.PI * 2, spin: (Math.random() - 0.5) * 12,
          size: 4 + Math.random() * 7, life: 1.1 + Math.random() * 0.9, age: 0,
          color: colors[k % colors.length], shape: shapes[k % shapes.length],
        });
      }
    }
    if (!running) {
      running = true;
      last = performance.now();
      window.requestAnimationFrame(frame);
    }
  }

  function frame(now: number): void {
    const c = canvas;
    if (!c) { running = false; return; }
    // The first frame can be stamped before the burst started: never step back.
    // Motion steps at most 50 ms, but age follows the clock, so a burst ends
    // on time even when frames are dropped (a busy tab, a headless capture).
    const elapsed = Math.max(0, (now - last) / 1000);
    const dt = Math.min(elapsed, 0.05);
    last = now;
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    const ctx = c.getContext('2d');
    if (!ctx) { running = false; return; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    if (flash) {
      flash.age += elapsed;
      const t = flash.age / 0.9;
      if (t >= 1) flash = null;
      else {
        const r = 40 + t * 260;
        const g = ctx.createRadialGradient(flash.x, flash.y, 0, flash.x, flash.y, r);
        g.addColorStop(0, `rgba(255,255,240,${0.55 * (1 - t)})`);
        g.addColorStop(1, 'rgba(255,255,240,0)');
        ctx.fillStyle = g;
        ctx.fillRect(flash.x - r, flash.y - r, r * 2, r * 2);
        ctx.strokeStyle = flash.color;
        ctx.globalAlpha = 1 - t;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(flash.x, flash.y, 20 + t * 180, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    particles = particles.filter((p) => (p.age += elapsed) < p.life);
    for (const p of particles) {
      p.vx -= p.vx * DRAG * dt;
      p.vy += (GRAVITY - p.vy * DRAG) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
      draw(ctx, p);
    }
    if (particles.length > 0 || flash) window.requestAnimationFrame(frame);
    else {
      ctx.clearRect(0, 0, w, h);
      running = false;
    }
  }

  function draw(ctx: CanvasRenderingContext2D, p: Particle): void {
    const fade = 1 - Math.max(0, (p.age - p.life * 0.6) / (p.life * 0.4));
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillStyle = p.color;
    ctx.strokeStyle = p.color;
    const s = p.size;
    switch (p.shape) {
      case 'leaf':
        ctx.beginPath();
        ctx.ellipse(0, 0, s, s * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'bubble':
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.6, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case 'star':
        ctx.beginPath();
        for (let k = 0; k < 8; k++) {
          const r = k % 2 ? s * 0.35 : s;
          ctx.lineTo(Math.cos((k / 8) * Math.PI * 2) * r, Math.sin((k / 8) * Math.PI * 2) * r);
        }
        ctx.closePath();
        ctx.fill();
        break;
      default:
        ctx.fillRect(-s * 0.5, -s * 0.18, s, s * 0.36);
    }
    ctx.restore();
  }

  /* ----------------------------------------------------------------- chime -- */

  let audio: AudioContext | null = null;

  /**
   * The shared audio context, resumed. Browsers only allow sound after the
   * player has interacted with the page; until then the chimes stay silent
   * rather than fail. Null without Web Audio.
   */
  function audioContext(): AudioContext | null {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    audio ??= new Ctor();
    if (audio.state === 'suspended') void audio.resume();
    return audio;
  }

  /** A short, bright arpeggio. */
  export function playChime(spontaneous: boolean, volume = 1): void {
    try {
      const ac = audioContext();
      if (!ac) return;
      const start = ac.currentTime + 0.03;
      // A major arpeggio; a step that arose on its own rings a third higher.
      const notes = spontaneous ? [659.25, 830.61, 987.77, 1318.51] : [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, k) => {
        const t = start + k * 0.085;
        for (const [type, gainPeak, detune] of [['triangle', 0.09, 0], ['sine', 0.05, 7]] as const) {
          const osc = ac.createOscillator();
          const gain = ac.createGain();
          osc.type = type;
          osc.frequency.value = freq;
          osc.detune.value = detune;
          gain.gain.setValueAtTime(0, t);
          gain.gain.linearRampToValueAtTime(gainPeak * volume, t + 0.012);
          gain.gain.exponentialRampToValueAtTime(0.0005, t + (k === notes.length - 1 ? 1.4 : 0.7));
          osc.connect(gain).connect(ac.destination);
          osc.start(t);
          osc.stop(t + 1.5);
        }
      });
    } catch {
      // No audio device or a blocked context: the moment works without sound.
    }
  }

  /**
   * A new species: two soft mallet notes rising a fourth (G5, C6) and a quiet
   * sparkle of the C major triad two octaves up, in a small filtered echo.
   * Gentler than a step's chime, so frequent discoveries never nag. Sine
   * tones only, with a short bright overtone for the strike (a marimba's
   * fourth partial), so nothing sounds harsh at any volume.
   */
  export function playDiscoveryChime(volume: number): void {
    if (volume <= 0 || document.hidden) return;
    try {
      const ac = audioContext();
      if (!ac) return;
      const t0 = ac.currentTime + 0.02;
      const out = ac.createGain();
      out.gain.value = volume;
      out.connect(ac.destination);
      // The room: an echo after 190 ms, darker and softer each time.
      const delay = ac.createDelay(1);
      delay.delayTime.value = 0.19;
      const damp = ac.createBiquadFilter();
      damp.type = 'lowpass';
      damp.frequency.value = 2600;
      const feedback = ac.createGain();
      feedback.gain.value = 0.3;
      const wet = ac.createGain();
      wet.gain.value = 0.32;
      out.connect(delay);
      delay.connect(damp);
      damp.connect(feedback).connect(delay);
      damp.connect(wet).connect(ac.destination);
      const tone = (freq: number, t: number, peak: number, attack: number, decay: number): void => {
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(peak, t + attack);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
        osc.connect(gain).connect(out);
        osc.start(t);
        osc.stop(t + attack + decay + 0.05);
      };
      const mallet = (freq: number, t: number, peak: number, decay: number): void => {
        tone(freq, t, peak, 0.005, decay);
        tone(freq * 2, t, peak * 0.12, 0.005, decay * 0.45);
        tone(freq * 4, t, peak * 0.22, 0.003, 0.07);
      };
      mallet(783.99, t0, 0.15, 0.9);
      mallet(1046.5, t0 + 0.11, 0.14, 1.3);
      [2093, 2637.02, 3135.96].forEach((freq, k) => tone(freq, t0 + 0.2 + k * 0.07, 0.022, 0.03, 0.55));
    } catch {
      // No audio device or a blocked context: the notice works without sound.
    }
  }
}
