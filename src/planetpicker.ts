/* =============================================================================
 * SimEarth 2.0 — planet picker
 * -----------------------------------------------------------------------------
 * Which planet a new game starts on, on the title screen and in the "Neuer
 * Planet" dialog: a random one, or the Earth — and then in which epoch.
 * ========================================================================== */

namespace SE {
  export interface PlanetPicker {
    readonly el: HTMLElement;
    readonly value: EpochId;
  }

  /** The epoch "Erde" opens on until the player has picked one. */
  const EARTH_FIRST: EpochId = 'today';

  /** `onChange` fires with every new choice. */
  export function buildPlanetPicker(initial: EpochId, onChange?: (id: EpochId) => void): PlanetPicker {
    let value = initial;
    let lastEarth = initial === 'random' ? EARTH_FIRST : initial;

    const host = make('div', 'planet-picker');
    const kinds = make('div', 'seg planet-kind');
    kinds.setAttribute('role', 'group');
    kinds.setAttribute('aria-label', 'Planet');
    const random = button({ label: epochOf('random').name, icon: uiIcon('dice'), cls: 'seg-btn', onClick: () => pick('random') });
    const earth = button({ label: 'Erde', icon: uiIcon('globe'), cls: 'seg-btn', onClick: () => pick(lastEarth) });
    kinds.append(random, earth);

    const epochs = make('div', 'planet-epochs');
    epochs.setAttribute('role', 'group');
    epochs.setAttribute('aria-label', 'Epoche');
    const cards = new Map<EpochId, HTMLButtonElement>();
    for (const e of EPOCHS) {
      if (e.id === 'random') continue;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'planet-epoch';
      b.append(make('span', 'planet-epoch-name', e.name), make('span', 'planet-epoch-when', e.when));
      b.addEventListener('click', () => pick(e.id));
      cards.set(e.id, b);
      epochs.appendChild(b);
    }
    const blurb = make('p', 'planet-blurb');
    blurb.setAttribute('aria-live', 'polite');
    host.append(kinds, epochs, blurb);

    const paint = (): void => {
      const onEarth = value !== 'random';
      setPressed(random, !onEarth);
      setPressed(earth, onEarth);
      epochs.hidden = !onEarth;
      for (const [id, b] of cards) setPressed(b, id === value);
      blurb.textContent = epochOf(value).blurb;
    };
    const pick = (id: EpochId): void => {
      if (id === value) return;
      value = id;
      if (id !== 'random') lastEarth = id;
      paint();
      onChange?.(id);
    };
    paint();

    return {
      el: host,
      get value() { return value; },
    };
  }
}
