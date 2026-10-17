/* =============================================================================
 * SimEarth 2.0 — settings
 * -----------------------------------------------------------------------------
 * The player's lasting preferences, defined once and shown as the
 * "Einstellungen" dialog, opened from the menu "Spiel" and the title screen.
 * ========================================================================== */

namespace SE {
  export interface SettingOption {
    readonly label: string;
    readonly icon: string;
    readonly on: () => boolean;
    readonly choose: () => void;
  }

  /** A yes/no preference, or one choice among options. `group` starts a new block. */
  export type SettingDef = { readonly group?: boolean } & (
    | { readonly kind: 'toggle'; readonly label: string; readonly icon: string; readonly iconOff?: string; readonly on: () => boolean; readonly toggle: () => void; readonly volume?: VolumeControl }
    | { readonly kind: 'choice'; readonly label: string; readonly options: readonly SettingOption[] }
  );

  let settingSeq = 0;

  /** The "Einstellungen" dialog: every change applies at once, "Fertig" only closes it. */
  export async function openSettings(defs: readonly SettingDef[]): Promise<void> {
    const body = make('div', 'settings');
    const inputs: { input: HTMLInputElement; on: () => boolean }[] = [];
    const icons: { el: HTMLImageElement; on: () => boolean; src: string; off: string }[] = [];
    const sliders: { input: HTMLInputElement; on: () => boolean }[] = [];
    const sync = (): void => {
      for (const i of inputs) i.input.checked = i.on();
      for (const s of sliders) s.input.disabled = !s.on();
      for (const i of icons) i.el.src = i.on() ? i.src : i.off;
    };

    const row = (type: 'checkbox' | 'radio', label: string, icon: string, on: () => boolean, change: () => void, name?: string, iconOff?: string): HTMLElement => {
      const id = `setting-${++settingSeq}`;
      const input = document.createElement('input');
      input.type = type;
      input.id = id;
      if (name) input.name = name;
      input.addEventListener('change', () => { change(); sync(); });
      inputs.push({ input, on });
      const text = make('label', 'settings-label', label);
      text.htmlFor = id;
      const line = make('div', 'settings-row');
      const pic = img(icon);
      if (iconOff) icons.push({ el: pic, on, src: icon, off: iconOff });
      line.append(input, pic, text);
      return line;
    };

    for (const d of defs) {
      if (d.kind === 'toggle') {
        const line = row('checkbox', d.label, d.icon, d.on, d.toggle, undefined, d.iconOff);
        line.classList.toggle('settings-group', !!d.group);
        body.appendChild(line);
        if (d.volume) {
          const { input, percent } = volumeSlider(`${d.label}: Lautstärke`, d.volume);
          sliders.push({ input, on: d.on });
          const slide = make('div', 'settings-row settings-slider');
          slide.append(make('span'), input, percent);
          body.appendChild(slide);
        }
        continue;
      }
      const set = make('fieldset', `settings-choice${d.group ? ' settings-group' : ''}`);
      set.appendChild(make('legend', 'settings-legend', d.label));
      const name = `setting-choice-${++settingSeq}`;
      for (const o of d.options) set.appendChild(row('radio', o.label, o.icon, o.on, o.choose, name));
      body.appendChild(set);
    }
    sync();
    await Modal.show({ title: 'Einstellungen', icon: uiIcon('menu-options'), body, actions: [{ label: 'Fertig', value: 'ok', kind: 'primary' }] });
  }
}
