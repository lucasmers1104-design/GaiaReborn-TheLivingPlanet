/* =============================================================================
 * Gaia Reborn — difficulty picker
 * -----------------------------------------------------------------------------
 * Easy, normal or hard for the next planet, on the title screen (`title`
 * classes) and in the "Neuer Planet" dialog (`planet` classes, beside the
 * planet picker). Three cards like the epochs, and the chosen level's text.
 * ========================================================================== */

namespace SE {
  export interface DifficultyPicker {
    readonly el: HTMLElement;
    readonly value: Difficulty;
  }

  export function buildDifficultyPicker(initial: Difficulty, look: 'planet' | 'title', onChange?: (d: Difficulty) => void): DifficultyPicker {
    let value = initial;
    const host = make('div', `${look}-picker difficulty-picker`);
    const cards = make('div', `${look}-epochs difficulty-cards`);
    cards.setAttribute('role', 'radiogroup');
    cards.setAttribute('aria-label', 'Schwierigkeit');
    const buttons = new Map<Difficulty, HTMLButtonElement>();
    for (const d of DIFFICULTIES) {
      const c = DIFFICULTY_CONFIG[d];
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `${look}-epoch`;
      b.setAttribute('role', 'radio');
      b.title = c.blurb;
      b.append(make('span', `${look}-epoch-name`, c.name), make('span', `${look}-epoch-when`, c.title));
      b.addEventListener('click', () => pick(d));
      buttons.set(d, b);
      cards.appendChild(b);
    }
    const blurb = make('p', 'planet-blurb difficulty-blurb');
    blurb.setAttribute('aria-live', 'polite');
    host.append(cards, blurb);

    const paint = (): void => {
      for (const [d, b] of buttons) {
        setPressed(b, d === value);
        b.setAttribute('aria-checked', String(d === value));
        b.removeAttribute('aria-pressed');
      }
      blurb.textContent = DIFFICULTY_CONFIG[value].blurb;
    };
    const pick = (d: Difficulty): void => {
      if (d === value) return;
      value = d;
      paint();
      onChange?.(d);
    };
    paint();

    return {
      el: host,
      get value() { return value; },
    };
  }
}
