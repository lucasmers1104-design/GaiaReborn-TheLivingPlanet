/* =============================================================================
 * SimEarth 2.0 — background music
 * -----------------------------------------------------------------------------
 * One looping track per scene (title screen, main game), played through an
 * <audio> element: over file:// browsers refuse fetch() and so WebAudio's
 * decodeAudioData, but a plain media element loads local files fine.
 * ========================================================================== */

namespace SE {
  export type MusicScene = 'title' | 'game';

  /** Track per scene: a file name in assets/audio/music/ without ".mp3". */
  export const MUSIC_TRACKS: Readonly<Record<MusicScene, string>> = {
    title: 'lumiere-du-matin',
    game: 'lumiere-du-matin',
  };

  /** Below the chime and effects, so the music stays in the background. */
  const MUSIC_VOLUME = 0.45;
  const MUSIC_FADE_MS = 1200;

  export class MusicPlayer {
    private readonly audio = new Audio();
    private track = '';
    private enabled: boolean;
    private fadeTimer = 0;
    /** The player's volume slider, 0..1, on top of MUSIC_VOLUME. */
    private level: number;

    constructor(enabled: boolean, level: number) {
      this.enabled = enabled;
      this.level = level;
      this.audio.loop = true;
      this.audio.preload = 'auto';
      this.audio.volume = 0;
      // Autoplay is blocked until the player has touched the page: retry on the first gesture.
      const unlock = (): void => {
        if (!this.audio.paused || !this.wantsSound()) return;
        this.resume();
      };
      for (const type of ['pointerdown', 'keydown']) document.addEventListener(type, unlock, { capture: true });
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) this.audio.pause();
        else if (this.wantsSound()) this.resume();
      });
    }

    /** Switch to a scene's track; the same track simply keeps playing. */
    play(scene: MusicScene): void {
      const track = MUSIC_TRACKS[scene];
      if (track !== this.track) {
        this.track = track;
        this.audio.src = `assets/audio/music/${track}.mp3`;
        this.audio.volume = 0;
      }
      if (this.enabled) this.resume();
    }

    setEnabled(on: boolean): void {
      this.enabled = on;
      if (on) this.resume();
      else this.fadeTo(0, () => this.audio.pause());
    }

    setVolume(level: number): void {
      this.level = level;
      if (this.enabled && !this.audio.paused) {
        window.clearInterval(this.fadeTimer);
        this.audio.volume = MUSIC_VOLUME * level;
      }
    }

    private wantsSound(): boolean {
      return this.enabled && this.track !== '' && !document.hidden;
    }

    private resume(): void {
      const started = this.audio.play();
      // Rejected while autoplay is still blocked or the file is missing: the game runs silent.
      started.then(() => this.fadeTo(MUSIC_VOLUME * this.level), () => undefined);
    }

    private fadeTo(target: number, done?: () => void): void {
      window.clearInterval(this.fadeTimer);
      const from = this.audio.volume;
      const start = performance.now();
      this.fadeTimer = window.setInterval(() => {
        const t = Math.min(1, (performance.now() - start) / MUSIC_FADE_MS);
        this.audio.volume = from + (target - from) * t;
        if (t < 1) return;
        window.clearInterval(this.fadeTimer);
        done?.();
      }, 50);
    }
  }

  /** Loudest the surf ever gets: heard more than listened to. */
  const SURF_VOLUME = 0.16;
  /** How quickly the surf follows the view, ms to cover most of a change. */
  const SURF_EASE_MS = 1500;

  /**
   * The sea's murmur while coasts are in view, louder the closer the camera.
   * Same <audio> route as the music, so it also plays over file://.
   */
  export class SurfSound {
    private readonly audio = new Audio('assets/audio/ambient/ocean-waves.mp3');
    private level = 0;
    /** No play() retries before this time: autoplay may still be blocked. */
    private retryAt = 0;

    constructor() {
      this.audio.loop = true;
      this.audio.preload = 'auto';
      this.audio.volume = 0;
      document.addEventListener('visibilitychange', () => { if (document.hidden) this.audio.pause(); });
    }

    /** Every frame: `target` is 0..1 of SURF_VOLUME, already scaled by the player's slider. */
    update(target: number, dt: number, now: number): void {
      this.level += (target - this.level) * Math.min(1, dt / SURF_EASE_MS);
      this.audio.volume = clamp(this.level * SURF_VOLUME, 0, 1);
      if (this.level < 0.003) {
        if (!this.audio.paused) this.audio.pause();
      } else if (this.audio.paused && !document.hidden && now >= this.retryAt) {
        this.retryAt = now + 1000;
        this.audio.play().catch(() => undefined);
      }
    }
  }

  /** The effect volume 0..1, 0 while sound is off; the app points this at its settings. */
  export const SFX = { volume: (): number => 0 };

  /**
   * Base level per file in assets/audio/sfx/ (without ".mp3"), tuned by ear
   * against the music: a disaster may stand out, but never drown it.
   * At most 1: a media element plays no louder than its file, and above 1 the
   * slider's top end would do nothing.
   */
  const SFX_LEVELS: Readonly<Record<string, number>> = {
    'vulkan-explosion': 1,
    'cracking-earthquake': 1,
    'tornado': 1,
    // Mastered loud (the bang peaks near full scale), so it sits lower.
    'siren-and-nuke': 0.9,
  };

  /** Where the bang sits in siren-and-nuke.mp3, after the siren: measured from the file's loudness. */
  export const NUKE_BOOM_MS = 12150;

  /** One-shot effect sound; false when it stays silent (sound off, tab hidden). */
  export function playSfx(name: string): boolean {
    const volume = (SFX_LEVELS[name] ?? 0.5) * SFX.volume();
    if (volume <= 0 || document.hidden) return false;
    const audio = new Audio(`assets/audio/sfx/${name}.mp3`);
    audio.volume = Math.min(1, volume);
    audio.play().catch(() => undefined);
    return true;
  }
}
