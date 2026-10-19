/* =============================================================================
 * SimEarth 2.0 — terraforming brush (sound): "Sanfter Sand und Stein"
 * -----------------------------------------------------------------------------
 * The most discreet brush: almost no pitch at all. While the brush works, a
 * soft hiss of trickling sand and soil and a low, dark murmur of stone, both
 * shaped every dab by how hard the brush works and the height under it (sand
 * at the coast, soil in the lowlands, stone in the mountains, muffled and
 * gently swelling under water). Stage changes are marked by one very soft,
 * low wooden tick tuned to the E-flat major pentatonic of the in-game music
 * (deep sea G2 … coast Eb3 … summit Eb4); going down, a short filtered breath
 * on the same note. Land breaking the surface and water flooding in are soft
 * unpitched puffs. Follows the effects volume (SFX.volume()).
 *
 * One voice per stroke (9 nodes): two looped noise buffers (sand grains,
 * brown noise) through gentle filters. Levels measured offline: the bed sits
 * ~10 dB under the music, the ticks peak around -26 dBFS.
 * ========================================================================== */

namespace SE {
  /** Overall level (times SFX.volume()). */
  const TF_LEVEL = 0.1;
  const TF_RUMBLE_LEVEL = 1;
  /** Time constant of every parameter glide, s. */
  const TF_GLIDE = 0.07;
  const TF_ATTACK = 0.05;
  const TF_RELEASE = 0.09;
  /** Long strokes settle this much quieter (over TF_FATIGUE_S after the first 1.5 s). */
  const TF_FATIGUE = 0.4;
  const TF_FATIGUE_S = 8;
  /** Minimum gaps between one-shots, s; tiles in between are pooled. */
  const TF_EMERGE_GAP = 0.3;
  const TF_FLOOD_GAP = 0.4;
  /** Stage cues: no two closer than this, s; a step back the other way waits until the brush has stayed TF_STAGE_SETTLE in the band. */
  const TF_STAGE_GAP = 0.2;
  const TF_STAGE_SETTLE = 0.5;
  /**
   * One note per TERRAFORM_STAGES band, MIDI, E-flat major pentatonic (A = 440):
   * Tiefsee G2, Meer Bb2, Flachwasser C3, Küste Eb3, Tiefland F3, Hügel G3,
   * Bergland Bb3, Hochgebirge C4, Gipfel Eb4 — the coast and the summit on the tonic.
   */
  const TF_STAGE_MIDI = [43, 46, 48, 51, 53, 55, 58, 60, 63];
  const tfHz = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);
  const tfStageHz = (s: number): number => tfHz(TF_STAGE_MIDI[Math.max(0, Math.min(TF_STAGE_MIDI.length - 1, s))]);

  interface TfBuffers { brown: AudioBuffer; sand: AudioBuffer; white: AudioBuffer }

  interface TfVoice {
    sign: 1 | -1;
    out: GainNode;
    sand: AudioBufferSourceNode; sandLow: BiquadFilterNode; sandGain: GainNode; swellDepth: GainNode;
    stoneLow: BiquadFilterNode; stoneGain: GainNode;
    sources: AudioScheduledSourceNode[];
    born: number;
    last: number;
  }

  const tfBuffers = new WeakMap<BaseAudioContext, TfBuffers>();

  /** Noise loops, rendered once per context; the seams join without a step. */
  function tfBuffersFor(ac: BaseAudioContext): TfBuffers {
    let b = tfBuffers.get(ac);
    if (b) return b;
    const sr = ac.sampleRate;
    const normalize = (d: Float32Array): void => {
      let peak = 1e-9;
      for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
      for (let i = 0; i < d.length; i++) d[i] /= peak;
    };

    const brown = ac.createBuffer(1, sr * 5, sr);
    const bd = brown.getChannelData(0);
    let v = 0;
    for (let i = 0; i < bd.length; i++) { v = v * 0.985 + (Math.random() * 2 - 1) * 0.1; bd[i] = v; }
    const drift = bd[bd.length - 1] - bd[0];
    for (let i = 0; i < bd.length; i++) bd[i] -= drift * i / bd.length;
    normalize(bd);

    // Sand: a dense rain of tiny soft grains (Hann-windowed noise, 2–10 ms),
    // even in size, so the hiss is smooth rather than crackly; never crossing the loop seam.
    const sand = ac.createBuffer(1, sr * 6, sr);
    const sd = sand.getChannelData(0);
    for (let t = 0.002; t < 5.98; t += -Math.log(1 - Math.random()) / 1100) {
      const at = Math.floor(t * sr);
      const len = Math.floor(sr * (0.002 + 0.008 * Math.random()));
      if (at + len >= sd.length) break;
      const amp = 0.5 + 0.5 * Math.random();
      for (let k = 0; k < len; k++) sd[at + k] += amp * (0.5 - 0.5 * Math.cos(2 * Math.PI * k / len)) * (Math.random() * 2 - 1);
    }
    normalize(sd);

    const white = ac.createBuffer(1, sr * 2, sr);
    const wd = white.getChannelData(0);
    for (let i = 0; i < wd.length; i++) wd[i] = Math.random() * 2 - 1;
    b = { brown, sand, white };
    tfBuffers.set(ac, b);
    return b;
  }

  const tfClamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
  const tfHidden = (): boolean => typeof document !== 'undefined' && document.hidden;

  let tfRealtime: AudioContext | null = null;

  export class TerraformSound {
    private rumble: HTMLAudioElement | null = null;
    private ac: BaseAudioContext | null;
    private bus: GainNode | null = null;
    private voice: TfVoice | null = null;
    /** Random walk -1..1, nudging filters so a long stroke never loops audibly. */
    private wander = 0;
    private emergePending = 0;
    private nextEmerge = 0;
    private floodPending = 0;
    private nextFlood = 0;
    private idleTimer = 0;
    private heardStage = -1;
    private wantStage = -1;
    private wantSince = 0;
    private heardDir = 0;
    private nextStage = 0;

    /**
     * Without arguments the sound makes its own AudioContext on the first
     * stroke with sound on. A given context (an OfflineAudioContext for
     * tests and recordings) is used as is, playing into `dest` or its destination.
     */
    constructor(ac?: BaseAudioContext, private readonly dest?: AudioNode) {
      this.ac = ac ?? null;
      if (!ac && typeof document !== 'undefined') {
        // Media elements preload local MP3s over file:// without fetch/decodeAudioData.
        this.rumble = new Audio('assets/audio/sfx/rumble-bass.mp3');
        this.rumble.preload = 'auto';
        this.rumble.loop = true;
        this.rumble.volume = 0;
        document.addEventListener('visibilitychange', () => { if (document.hidden) this.stop(); });
        window.addEventListener('blur', () => this.stop());
      }
    }

    /** Pointer down with the brush. */
    start(sign: 1 | -1): void {
      this.rumble?.pause();
      if (this.voice) this.release();
      if (SFX.volume() <= 0 || tfHidden()) return;
      if (this.rumble) {
        this.rumble.volume = tfClamp01(TF_RUMBLE_LEVEL * SFX.volume());
        this.rumble.currentTime = 0;
        this.rumble.play().catch(() => undefined);
      }
      const ac = this.context();
      if (!ac) return;
      try {
        this.voice = this.build(ac, sign);
        this.heardStage = -1;
        this.wantStage = -1;
        this.heardDir = 0;
        this.emergePending = 0;
        this.floodPending = 0;
      } catch {
        // No audio device or a blocked context: the brush works silently.
        this.voice = null;
      }
    }

    /** Every dab: `dab` as terraformDab returned it, `work` 0..1 how hard the brush pushes this frame. */
    update(dab: TerraformDab, work: number): void {
      if (this.rumble) this.rumble.volume = tfHidden() ? 0 : tfClamp01(TF_RUMBLE_LEVEL * SFX.volume());
      const v = this.voice;
      const ac = this.ac;
      if (!v || !ac) return;
      const t = ac.currentTime;
      const dt = Math.min(0.1, Math.max(0, t - v.last));
      v.last = t;
      this.setBus(t);

      const w = Math.pow(tfClamp01(work), 0.8);
      const h = Math.max(-1, Math.min(1, dab.height));
      const wet = tfClamp01(-h * 5);
      const rock = tfClamp01((h - 0.25) / 0.45);
      const sandy = tfClamp01(1 - Math.abs(h - 0.03) / 0.15);
      const raise = v.sign > 0;
      this.wander = Math.max(-1, Math.min(1, this.wander * (1 - dt * 0.4) + (Math.random() - 0.5) * dt * 5));
      const wob = 1 + this.wander * 0.1;

      const set = (p: AudioParam, value: number, glide = TF_GLIDE): void => { p.setTargetAtTime(value, t, glide); };
      const held = t - v.born;
      set(v.out.gain, 1 - TF_FATIGUE * tfClamp01((held - 1.5) / TF_FATIGUE_S), held < 0.4 ? TF_ATTACK : 0.5);

      // Sand / soil hiss: brightest on the beach, duller soil inland, darker
      // while digging, muffled under water where it swells like a slow wave.
      const sandHz = (raise ? 1500 : 1000) * (1 + 0.5 * sandy - 0.3 * rock) * (1 - 0.65 * wet) * wob;
      set(v.sandLow.frequency, sandHz);
      const sandLevel = 2.2 * w * (raise ? 1 : 0.8) * (0.7 + 0.3 * sandy - 0.35 * rock) * (1 - 0.35 * wet);
      set(v.sandGain.gain, sandLevel);
      set(v.swellDepth.gain, sandLevel * 0.45 * wet, 0.2);
      set(v.sand.playbackRate, (0.85 + 0.25 * w) * (1 + this.wander * 0.05), 0.2);

      // Stone murmur: low and dark, grows with the mountains and when digging.
      set(v.stoneLow.frequency, (raise ? 150 + 110 * rock : 120 + 60 * rock) * (1 - 0.2 * wet) * (1 + this.wander * 0.06));
      set(v.stoneGain.gain, w * (raise ? 0.4 + 0.35 * rock : 0.6 + 0.25 * rock) * (1 - 0.3 * wet));

      this.flushStage(t);

      this.emergePending += dab.emerged;
      if (this.emergePending > 0 && t >= this.nextEmerge) {
        this.emerge(t, this.emergePending);
        this.emergePending = 0;
        this.nextEmerge = t + TF_EMERGE_GAP * (0.85 + Math.random() * 0.3);
      }
      this.floodPending += dab.flooded;
      if (this.floodPending > 0 && t >= this.nextFlood) {
        this.flood(t, this.floodPending);
        this.floodPending = 0;
        this.nextFlood = t + TF_FLOOD_GAP * (0.85 + Math.random() * 0.3);
      }
    }

    /** Pointer up, or the tool changed. */
    stop(): void {
      this.rumble?.pause();
      this.release();
    }

    /**
     * The brush centre crossed from one TERRAFORM_STAGES band into another.
     * Rate-limited: hovering on a band edge announces the new band once; a
     * fast sweep over several bands steps straight to the last.
     */
    stage(from: number, to: number): void {
      if (!this.voice || !this.ac || from === to) return;
      if (this.heardStage < 0) this.heardStage = from;
      if (to !== this.wantStage) this.wantSince = this.ac.currentTime;
      this.wantStage = to;
      this.flushStage(this.ac.currentTime);
    }

    private flushStage(t: number): void {
      const want = this.wantStage;
      const heard = this.heardStage;
      if (want < 0 || heard < 0) return;
      if (want === heard) { this.wantStage = -1; return; }
      if (t < this.nextStage) return;
      const dir = Math.sign(want - heard);
      if (this.heardDir !== 0 && dir !== this.heardDir && t < this.wantSince + TF_STAGE_SETTLE) return;
      this.stageCue(t, heard, want);
      this.heardStage = want;
      this.wantStage = -1;
      this.heardDir = dir;
      this.nextStage = t + TF_STAGE_GAP;
    }

    /** Going up: a soft low wooden tick on the new band's note. Going down: a short breath on it, with a fainter tick. */
    private stageCue(t: number, from: number, to: number): void {
      const f = tfStageHz(to);
      if (to > from) {
        this.tick(t, f, 1);
      } else {
        this.breath(t, f * 2, 0.5);
        this.tick(t + 0.02, f, 0.45);
      }
    }

    /** A muted wooden knock: the note with a soft octave, a fast decay and a whisper of wood. */
    private tick(t: number, f: number, level: number): void {
      const ac = this.ac;
      if (!ac || !this.bus) return;
      for (const [mul, amp, len] of [[1, 1, 0.22], [2, 0.35, 0.09]]) {
        const osc = ac.createOscillator();
        const g = ac.createGain();
        osc.frequency.value = f * mul;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.65 * level * amp, t + 0.006);
        g.gain.setTargetAtTime(0, t + 0.006, len / 5);
        osc.connect(g).connect(this.bus);
        osc.start(t);
        osc.stop(t + len + 0.05);
      }
      this.noiseBurst(t, 'bandpass', 900, 700, 2, 0.1 * level, 0.003, 0.04);
    }

    /** Filtered breath on a note: noise through a narrow band, swelling in and out. */
    private breath(t: number, f: number, level: number): void {
      this.noiseBurst(t, 'bandpass', f * 1.03, f, 7, level, 0.05, 0.3);
    }

    private release(): void {
      const v = this.voice;
      const ac = this.ac;
      this.voice = null;
      if (!v || !ac) return;
      const t = ac.currentTime;
      v.out.gain.setTargetAtTime(0, t, TF_RELEASE);
      for (const s of v.sources) s.stop(t + TF_RELEASE * 10);
      v.sources[0].onended = () => v.out.disconnect();
      // An idle realtime context still runs its audio thread: let it sleep.
      if (ac === tfRealtime) {
        window.clearTimeout(this.idleTimer);
        this.idleTimer = window.setTimeout(() => { if (!this.voice) void tfRealtime?.suspend(); }, 2000);
      }
    }

    private context(): BaseAudioContext | null {
      if (this.ac) {
        if (this.ac === tfRealtime && tfRealtime.state === 'suspended') void tfRealtime.resume();
        return this.ac;
      }
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      try {
        tfRealtime ??= new Ctor();
        const rt = tfRealtime;
        if (rt.state === 'suspended') void rt.resume();
        document.addEventListener('visibilitychange', () => {
          if (document.hidden) void rt.suspend();
          else if (this.voice) void rt.resume();
        });
        this.ac = rt;
        return rt;
      } catch {
        return null;
      }
    }

    private setBus(t: number): void {
      const ac = this.ac;
      if (!ac) return;
      const level = tfHidden() ? 0 : SFX.volume() * TF_LEVEL;
      if (!this.bus) {
        this.bus = ac.createGain();
        this.bus.gain.value = level;
        this.bus.connect(this.dest ?? ac.destination);
      }
      this.bus.gain.setTargetAtTime(level, t, 0.05);
    }

    private build(ac: BaseAudioContext, sign: 1 | -1): TfVoice {
      const bufs = tfBuffersFor(ac);
      const t = ac.currentTime;
      this.setBus(t);
      const out = ac.createGain();
      out.gain.value = 0;
      out.gain.setTargetAtTime(1, t, TF_ATTACK);
      out.connect(this.bus as GainNode);
      const filter = (type: BiquadFilterType, f: number, q: number, to: AudioNode): BiquadFilterNode => {
        const n = ac.createBiquadFilter();
        n.type = type; n.frequency.value = f; n.Q.value = q;
        n.connect(to);
        return n;
      };
      const gain = (): GainNode => { const g = ac.createGain(); g.gain.value = 0; g.connect(out); return g; };
      const loop = (buffer: AudioBuffer): AudioBufferSourceNode => {
        const s = ac.createBufferSource();
        s.buffer = buffer;
        s.loop = true;
        return s;
      };

      // Sand: grains → high-pass 350 Hz (no boom) → gentle low-pass (no bite).
      const sandGain = gain();
      const sandLow = filter('lowpass', 1200, 0.5, sandGain);
      const sand = loop(bufs.sand);
      sand.connect(filter('highpass', 350, 0.5, sandLow));
      // Under water the sand swells slowly, like a wave over it.
      const swellDepth = ac.createGain();
      swellDepth.gain.value = 0;
      swellDepth.connect(sandGain.gain);
      const swell = ac.createOscillator();
      swell.frequency.value = 0.35 + Math.random() * 0.2;
      swell.connect(swellDepth);

      // Stone: brown noise, dark low-pass, high-pass at 50 Hz (no rumble).
      const stoneGain = gain();
      const stoneLow = filter('lowpass', 160, 0.6, filter('highpass', 60, 0.6, stoneGain));
      const brown = loop(bufs.brown);
      brown.connect(stoneLow);

      const sources: AudioScheduledSourceNode[] = [sand, brown, swell];
      sand.start(t, Math.random() * 6);
      brown.start(t, Math.random() * 5);
      swell.start(t);
      return { sign, out, sand, sandLow, sandGain, swellDepth, stoneLow, stoneGain, sources, born: t, last: t };
    }

    /** Land breaks the surface: a soft puff of settling sand. */
    private emerge(t: number, count: number): void {
      const size = Math.min(1, 0.5 + 0.2 * Math.log2(1 + count));
      this.noiseBurst(t, 'lowpass', 1600, 500, 0.6, 0.8 * size, 0.025, 0.25);
    }

    /** Water floods in: a low, soft wash sinking away. */
    private flood(t: number, count: number): void {
      const size = Math.min(1, 0.5 + 0.2 * Math.log2(1 + count));
      this.noiseBurst(t, 'lowpass', 1000, 220, 0.6, 1.1 * size, 0.06, 0.5);
    }

    /** White noise through a filter gliding from f0 to f1, with a soft attack and a smooth decay. */
    private noiseBurst(t: number, type: BiquadFilterType, f0: number, f1: number, q: number, peak: number, attack: number, len: number): void {
      const ac = this.ac;
      if (!ac || !this.bus) return;
      const src = ac.createBufferSource();
      src.buffer = tfBuffersFor(ac).white;
      const flt = ac.createBiquadFilter();
      flt.type = type;
      flt.Q.value = q;
      flt.frequency.setValueAtTime(f0, t);
      flt.frequency.exponentialRampToValueAtTime(f1, t + len);
      const g = ac.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak, t + attack);
      g.gain.setTargetAtTime(0, t + attack, (len - attack) / 4);
      src.connect(flt).connect(g).connect(this.bus);
      src.start(t, Math.random() * 1.2);
      src.stop(t + len + 0.1);
    }
  }
}
