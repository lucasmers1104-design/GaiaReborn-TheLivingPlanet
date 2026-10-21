/* =============================================================================
 * SimEarth 2.0 — the wildfire's sound
 * -----------------------------------------------------------------------------
 * One voice per fire plays forest-fire.mp3 once, from the first frame the fire
 * burns in view. It follows the zoom: silent fully zoomed out, swelling slowly
 * as the camera comes in (squared, as loudness is heard on a log scale), at
 * its level (music.ts) fully zoomed in. It keeps playing, silent, while the
 * fire is out of view. When the fire is out the sound fades away and stops.
 * ========================================================================== */

namespace SE {
  const SOUND = 'forest-fire';
  /** How quickly the voice follows the zoom, and how quickly it dies away once the fire is out (ms to cover most of a change). */
  const EASE_MS = 1500;
  const FADE_OUT_MS = 600;
  /** Below this share of its level a fading voice stops. */
  const STOP_BELOW = 0.01;

  interface FireVoice { readonly audio: HTMLAudioElement; level: number }

  const voices = new Map<number, FireVoice>();
  let hiddenWatch = false;

  /** Stop every voice at once (a new planet, a load). */
  export function fireSoundReset(): void {
    for (const v of voices.values()) v.audio.pause();
    voices.clear();
  }

  /**
   * Every frame: `fires` holds each burning fire by hazard id, true while it is
   * in view. A voice whose fire is not in it any more fades out and stops.
   */
  export function fireSoundUpdate(s: FxScene, fires: ReadonlyMap<number, boolean>): void {
    for (const [id, inView] of fires) {
      if (!inView || voices.has(id) || !s.once(`${id}:fire-sound`)) continue;
      // Started almost silent: playSfx stays mute at gain 0, and the level below takes over.
      const audio = playSfx(SOUND, 0.001);
      if (!audio) continue;
      voices.set(id, { audio, level: 0 });
      if (!hiddenWatch) {
        hiddenWatch = true;
        document.addEventListener('visibilitychange', () => { if (document.hidden) fireSoundReset(); });
      }
    }
    const zoom = clamp((s.tilePx - EditView.MIN_TILE) / (EditView.MAX_TILE - EditView.MIN_TILE), 0, 1);
    for (const [id, v] of voices) {
      const inView = fires.get(id);
      const target = inView ? zoom * zoom : 0;
      v.level += (target - v.level) * Math.min(1, (s.dt * 1000) / (inView === undefined ? FADE_OUT_MS : EASE_MS));
      v.audio.volume = clamp(sfxVolume(SOUND, v.level), 0, 1);
      if (v.audio.ended || (inView === undefined && v.level < STOP_BELOW)) {
        v.audio.pause();
        voices.delete(id);
      }
    }
  }
}
