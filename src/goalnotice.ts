namespace SE {
  const GOAL_VISIBLE_MS = 5000;
  const GOAL_COOLDOWN_MS = 30000;

  export class GoalNotice {
    private readonly el = make('div', 'goal glass');
    private readonly announce = make('div', 'sr-only');
    private previous = new Set<string>();
    private readonly pending = new Set<string>();
    private current: string | null = null;
    private visibleUntil = 0;
    private nextAllowedAt = 0;

    constructor(host: HTMLElement, private readonly open: (id: string) => void) {
      this.announce.setAttribute('aria-live', 'polite');
      this.hide();
      host.append(this.el, this.announce);
    }

    reset(): void {
      this.previous.clear();
      this.pending.clear();
      this.nextAllowedAt = 0;
      this.hide();
    }

    update(ids: readonly string[], now: number, held: boolean, reduceEffects: boolean): void {
      this.el.classList.toggle('is-still', reduceEffects);
      const available = new Set(ids);
      for (const id of available) if (!this.previous.has(id)) this.pending.add(id);
      this.previous = available;
      for (const id of this.pending) if (!available.has(id)) this.pending.delete(id);

      if (this.current && held) {
        // A title or film must not consume a notice's reading time.
        if (available.has(this.current)) this.pending.add(this.current);
        this.hide();
      }
      if (this.current && (!available.has(this.current) || now >= this.visibleUntil)) this.hide();
      if (held || this.current || now < this.nextAllowedAt || this.pending.size === 0) return;

      const id = [...this.pending].sort((a, b) => evoNode(a).cost - evoNode(b).cost)[0];
      this.pending.clear();
      const node = evoNode(id);
      const title = `${node.name} entwickeln`;
      const more = available.size > 1 ? ` (${available.size} Schritte verfügbar)` : '';
      const text = make('div', 'goal-text');
      text.append(
        make('div', 'goal-kicker', 'Nächster Schritt'),
        make('div', 'goal-title', title),
        make('div', 'goal-sub', `Jetzt im Evolutionsbaum möglich${node.cost > 0 ? ` für ${node.cost} EP` : ''}${more}.`),
      );
      this.el.replaceChildren(img(evoIcon(id), 'goal-art'), text, button({
        label: 'Evolutionsbaum', icon: uiIcon('evolution'), cls: 'btn btn-small',
        onClick: () => { this.hide(); this.open(id); },
      }));
      this.current = id;
      this.visibleUntil = now + GOAL_VISIBLE_MS;
      this.nextAllowedAt = now + GOAL_COOLDOWN_MS;
      this.el.inert = false;
      this.el.removeAttribute('aria-hidden');
      this.el.classList.add('is-visible');
      this.announce.textContent = `Nächster Schritt: ${title}`;
    }

    private hide(): void {
      if (this.el.contains(document.activeElement)) {
        document.querySelector<HTMLElement>('.world-canvas')?.focus({ preventScroll: true });
      }
      this.current = null;
      this.el.inert = true;
      this.el.setAttribute('aria-hidden', 'true');
      this.el.classList.remove('is-visible');
      this.announce.textContent = '';
    }
  }
}
