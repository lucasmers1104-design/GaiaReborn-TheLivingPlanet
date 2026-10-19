/* =============================================================================
 * SimEarth 2.0 — developer mode: endless Ω and EP, every step and group open
 *
 * Remove before release (README "Entwicklermodus vor Release entfernen"):
 * set DEV_MODE_AVAILABLE to false, or delete this file, take it out of
 * tsconfig.json and remove every line marked DEVMODE (grep -rn DEVMODE src css).
 * Never saved with a planet; Node (tests, probes) always runs with it off.
 * ========================================================================== */

namespace SE {
  /** Release switch: false hides the title switch and turns the mode off for good. */
  export const DEV_MODE_AVAILABLE = true;

  export const devMode = { on: false };

  export function isDevMode(): boolean {
    return DEV_MODE_AVAILABLE && devMode.on;
  }

  const DEV_MODE_KEY = 'simearth2.devmode';

  /** The title screen's switch; remembered in this browser only. */
  export function devModeToggle(): HTMLElement {
    try { devMode.on = window.localStorage.getItem(DEV_MODE_KEY) === '1'; } catch { /* storage blocked */ }
    const input = make('input');
    input.type = 'checkbox';
    input.id = 'dev-mode';
    input.checked = devMode.on;
    input.addEventListener('change', () => {
      devMode.on = input.checked;
      try { window.localStorage.setItem(DEV_MODE_KEY, devMode.on ? '1' : '0'); } catch { /* storage blocked */ }
    });
    const label = make('label', 'settings-label', 'Entwicklermodus (∞ Energie, ∞ EP, alles frei)');
    label.htmlFor = input.id;
    const row = make('div', 'settings-row title-dev');
    row.append(input, label);
    return row;
  }
}
