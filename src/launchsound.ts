/* =============================================================================
 * SimEarth 2.0 — launch film: the sound
 * -----------------------------------------------------------------------------
 * Procedural WebAudio, no files (works over file://). Venting hiss and a low
 * rumble swelling under the countdown; at ignition a thump and a crack, then
 * the roar: brown and white noise through filters that open with the thrust,
 * the crackle of the exhaust while the rocket is near, muffled inside the
 * cloud deck, a whoosh out into the open, a soft two-note glint on the
 * sparkle, the roar thinning away as the air does; in space only a quiet pad
 * on the in-game music's E-flat pentatonic, gone by 12 s.
 *
 * Every frame sets each voice's level from the film clock (so a stall or a
 * late start keeps it in step) and the effect volume, read live; at 0 no
 * context is made at all. A compressor on the bus keeps the peaks in check.
 * ========================================================================== */

namespace SE {
  /** Bus level at full effect volume. */
  const LS_LEVEL = 0.26;
  /** Time constant of the per-frame glides, s. */
  const LS_GLIDE = 0.035;

  interface LsVoices {
    out: GainNode;
    rumble: GainNode; roar: GainNode; roarLow: BiquadFilterNode; hiss: GainNode; hissBand: BiquadFilterNode;
    crackle: GainNode; vent: GainNode; pad: GainNode;
    sources: AudioScheduledSourceNode[];
    white: AudioBuffer;
  }

  const lsSpan = (t: number, a: number, b: number): number => clamp((t - a) / (b - a), 0, 1);

  export class LaunchSound {
    private ac: BaseAudioContext | null;
    private v: LsVoices | null = null;
    private last = -1;
    private stopped = false;
    private readonly onHide = (): void => {
      const ac = this.ac;
      if (!(ac instanceof AudioContext)) return;
      if (document.hidden) void ac.suspend(); else void ac.resume();
    };

    /** Without a context it makes its own on the first frame with sound on; a given one (offline) plays into its destination. */
    constructor(private readonly given?: BaseAudioContext) {
      this.ac = given ?? null;
    }

    /** Every frame: film time t, effect volume 0..1; `at` the context time to schedule at (offline renders pass t). */
    update(t: number, volume: number, still: boolean, at?: number): void {
      if (this.stopped) return;
      if (!this.v) {
        if (volume <= 0) { this.last = t; return; }
        if (!this.build()) { this.stopped = true; return; }
      }
      const v = this.v!, ac = this.ac!;
      const now = at ?? ac.currentTime;
      const set = (p: AudioParam, x: number, glide = LS_GLIDE): void => { p.setTargetAtTime(x, now, glide); };
      const T = LAUNCH_T;
      const hidden = typeof document !== 'undefined' && !this.given && document.hidden;
      set(v.out.gain, hidden ? 0 : volume * LS_LEVEL * (1 - lsSpan(t, 11.2, FILM_SECONDS - 0.05)), 0.05);

      const thrust = launchThrust(t, still);
      const inCloud = lsSpan(t, T.deck, T.deck + 0.3) * (1 - lsSpan(t, T.breach, T.breach + 0.25));
      const thin = lsSpan(t, T.breach + 0.2, 9.3);
      // The rumble: swelling through the countdown, full at ignition, thinning out above the clouds.
      const swell = 0.45 * lsSpan(t, 0, T.ignite) ** 2;
      set(v.rumble.gain, Math.max(swell, 1.3 * thrust) * (1 - thin) ** 1.5);
      // The roar opens with the thrust, closes inside the cloud and as the air thins.
      const open = thrust * (1 - 0.25 * lsSpan(t, 4.5, 6.2));
      set(v.roar.gain, 0.95 * open * (1 - 0.35 * inCloud) * (1 - thin) ** 1.3);
      set(v.roarLow.frequency, Math.max(120, (260 + 900 * open) * (1 - 0.6 * inCloud) * (1 - 0.75 * thin)));
      set(v.hiss.gain, 0.32 * thrust * (1 - 0.7 * inCloud) * (1 - thin) ** 2);
      set(v.hissBand.frequency, 900 + 1400 * thrust * (1 - inCloud));
      // The crackle while the rocket is close and loud.
      set(v.crackle.gain, (still ? 0.3 : 0.5) * lsSpan(t, T.lift, T.lift + 0.7) * (1 - lsSpan(t, 5.6, 7.2)));
      set(v.vent.gain, 0.12 * (1 - lsSpan(t, T.ignite - 0.05, T.ignite + 0.25)) * (0.8 + 0.2 * Math.sin(t * 3.1)));
      set(v.pad.gain, 0.16 * lsSpan(t, 8.9, 10.2) * (1 - lsSpan(t, 11, FILM_SECONDS - 0.1)), 0.15);

      const crossed = (cue: number): boolean => this.last < cue && t >= cue && t < cue + 0.3;
      if (crossed(T.ignite)) this.ignition(now, still);
      if (crossed(T.breach)) this.whoosh(now);
      if (crossed(T.breach + 0.1)) this.glint(now);
      this.last = t;
    }

    /** All sound off at once: the bus drops in 30 ms, then the context closes. */
    stop(): void {
      if (this.stopped) return;
      this.stopped = true;
      const v = this.v, ac = this.ac;
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onHide);
      if (!v || !ac) return;
      const now = ac.currentTime;
      v.out.gain.cancelScheduledValues(now);
      v.out.gain.setValueAtTime(v.out.gain.value, now);
      v.out.gain.linearRampToValueAtTime(0, now + 0.03);
      for (const s of v.sources) { try { s.stop(now + 0.05); } catch { /* already stopped */ } }
      if (ac instanceof AudioContext) window.setTimeout(() => void ac.close().catch(() => undefined), 80);
    }

    private build(): boolean {
      try {
        if (!this.ac) {
          const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
          if (!Ctor) return false;
          const ac = new Ctor();
          if (ac.state === 'suspended') void ac.resume();
          this.ac = ac;
          document.addEventListener('visibilitychange', this.onHide);
        }
        this.v = this.voices(this.ac);
        return true;
      } catch {
        // No audio device or a blocked context: the film plays silently.
        return false;
      }
    }

    private voices(ac: BaseAudioContext): LsVoices {
      const sr = ac.sampleRate;
      const noise = (secs: number, fill: (d: Float32Array) => void): AudioBuffer => {
        const b = ac.createBuffer(1, Math.floor(sr * secs), sr);
        const d = b.getChannelData(0);
        fill(d);
        let peak = 1e-9;
        for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
        for (let i = 0; i < d.length; i++) d[i] /= peak;
        return b;
      };
      const white = noise(2, (d) => { for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; });
      const brown = noise(5, (d) => {
        let x = 0;
        for (let i = 0; i < d.length; i++) { x = x * 0.985 + (Math.random() * 2 - 1) * 0.1; d[i] = x; }
        const drift = d[d.length - 1] - d[0];
        for (let i = 0; i < d.length; i++) d[i] -= (drift * i) / d.length;
      });
      // Crackle: sparse sharp snaps of random strength, the sound of a big rocket's shock waves.
      const crackle = noise(3, (d) => {
        for (let s = 0; s < d.length;) {
          s += Math.floor(-Math.log(1 - Math.random()) * sr / 140) + 1;
          const amp = Math.random() ** 2 * (Math.random() < 0.5 ? -1 : 1);
          for (let k = 0; k < 90 && s + k < d.length; k++) d[s + k] += amp * Math.exp(-k / 14) * (Math.random() * 2 - 1);
        }
      });

      const comp = ac.createDynamicsCompressor();
      comp.threshold.value = -20; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.01; comp.release.value = 0.25;
      comp.connect(ac.destination);
      const out = ac.createGain();
      out.gain.value = 0;
      out.connect(comp);
      const gain = (to: AudioNode = out): GainNode => { const g = ac.createGain(); g.gain.value = 0; g.connect(to); return g; };
      const filter = (type: BiquadFilterType, f: number, q: number, to: AudioNode): BiquadFilterNode => {
        const n = ac.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; n.connect(to); return n;
      };
      const sources: AudioScheduledSourceNode[] = [];
      const loop = (buf: AudioBuffer, to: AudioNode, rate = 1): void => {
        const s = ac.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = rate; s.connect(to);
        s.start(ac.currentTime, Math.random() * buf.duration); sources.push(s);
      };

      const rumble = gain();
      loop(brown, filter('lowpass', 110, 0.8, filter('highpass', 28, 0.7, rumble)), 0.7);
      const roar = gain();
      const roarLow = filter('lowpass', 400, 0.6, roar);
      loop(brown, roarLow, 1.6);
      const hiss = gain();
      const hissBand = filter('bandpass', 1500, 0.55, hiss);
      loop(white, hissBand);
      const crackleG = gain();
      loop(crackle, filter('highpass', 600, 0.7, crackleG));
      const vent = gain();
      loop(white, filter('highpass', 3500, 0.5, vent), 0.8);
      // The pad: Eb3, Bb3, G4, Eb5, each with its own slow swell.
      const pad = gain();
      for (const [hz, amp] of [[155.56, 0.32], [233.08, 0.24], [392, 0.16], [622.25, 0.08]]) {
        const o = ac.createOscillator(), g = ac.createGain(), lfo = ac.createOscillator(), depth = ac.createGain();
        o.type = 'sine'; o.frequency.value = hz;
        g.gain.value = amp;
        lfo.frequency.value = 0.15 + Math.random() * 0.2; depth.gain.value = amp * 0.4;
        lfo.connect(depth).connect(g.gain);
        o.connect(g).connect(pad);
        o.start(); lfo.start(); sources.push(o, lfo);
      }
      return { out, rumble, roar, roarLow, hiss, hissBand, crackle: crackleG, vent, pad, sources, white };
    }

    /** Ignition: a deep falling thump under a broadband crack (softer in its attack when still). */
    private ignition(at: number, still: boolean): void {
      const ac = this.ac!, v = this.v!;
      const o = ac.createOscillator(), g = ac.createGain();
      o.frequency.setValueAtTime(95, at);
      o.frequency.exponentialRampToValueAtTime(32, at + 0.7);
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(1.1, at + (still ? 0.12 : 0.01));
      g.gain.setTargetAtTime(0, at + 0.08, 0.22);
      o.connect(g).connect(v.out);
      o.start(at); o.stop(at + 1.6);
      this.burst(at, 'bandpass', 2400, 260, 0.8, still ? 0.35 : 0.7, still ? 0.1 : 0.004, 0.5);
    }

    /** Out of the cloud: a rising breath of air. */
    private whoosh(at: number): void {
      this.burst(at, 'bandpass', 380, 2600, 1.2, 0.35, 0.18, 0.75);
    }

    /** The sparkle: two soft bell tones, Bb5 and Eb6. */
    private glint(at: number): void {
      const ac = this.ac!, v = this.v!;
      [[932.33, 0.09, 0], [1244.51, 0.07, 0.09]].forEach(([hz, amp, delay]) => {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = 'sine'; o.frequency.value = hz;
        g.gain.setValueAtTime(0, at + delay);
        g.gain.linearRampToValueAtTime(amp, at + delay + 0.01);
        g.gain.setTargetAtTime(0, at + delay + 0.01, 0.4);
        o.connect(g).connect(v.out);
        o.start(at + delay); o.stop(at + delay + 2.5);
      });
    }

    /** White noise through a filter gliding f0 → f1, with an attack and a smooth decay. */
    private burst(at: number, type: BiquadFilterType, f0: number, f1: number, q: number, peak: number, attack: number, len: number): void {
      const ac = this.ac!, v = this.v!;
      const src = ac.createBufferSource();
      src.buffer = v.white;
      const flt = ac.createBiquadFilter();
      flt.type = type; flt.Q.value = q;
      flt.frequency.setValueAtTime(f0, at);
      flt.frequency.exponentialRampToValueAtTime(f1, at + len);
      const g = ac.createGain();
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(peak, at + attack);
      g.gain.setTargetAtTime(0, at + attack, (len - attack) / 4);
      src.connect(flt).connect(g).connect(v.out);
      src.start(at, Math.random()); src.stop(at + len + 0.2);
    }
  }
}
