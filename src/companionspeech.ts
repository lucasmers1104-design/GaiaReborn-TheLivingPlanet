/* =============================================================================
 * Gaia Reborn — what Gaia says
 * -----------------------------------------------------------------------------
 * The short lines of Gaia in the corner (gaiacompanion.ts), in a parchment
 * bubble above her head: one pool per moment, never the same line twice in a
 * row, shown a little longer for longer lines, unprompted at most every
 * LINE_GAP_MS and never while a card holds the screen; replies to a poke
 * always come. While her magic runs she keeps quiet: the last moment's line
 * it held back (or cut short) follows once the magic and the card after it
 * are over.
 * ========================================================================== */

namespace SE {
  /** What she says (in the spirit of the Gaia window's lines, gaia.ts). */
  const LINES = {
    woke: ['Oh! Da regt sich was!', 'Huch – Leben? Hallo, ihr Kleinen!'],
    green: ['Oh, das erste Grün!', 'Pflanzen! Endlich wird es grün.'],
    worried: ['Oh nein …', 'Hey! Was war das denn?!', 'Das gefällt mir gar nicht …'],
    sad: ['Das tut weh …', 'So viel Leben – einfach fort …'],
    hot: ['Puh! Ich schwitze wie ein Vulkan.', 'Ist das heiß hier – oder liegt das an mir?'],
    cold: ['B-b-bitterkalt hier …', 'Kann mal jemand die Sonne aufdrehen?'],
    clean: ['*hust* Wer hat hier so gequalmt?', 'Ich krieg kaum Luft!'],
    better: ['Oh! Schon besser!', 'Es wird wieder …', 'Jaa, weiter so!'],
    poked: ['Hihi, das kitzelt!', 'Huch! Hallo du.', 'Nicht so fest – ich pass ja schon auf.'],
    pokedSad: ['Autsch! Hilf mir lieber.', 'Lass das. Ich hab gerade andere Sorgen.', 'Nicht jetzt …'],
    annoyed: ['Jetzt reicht’s aber!', 'Ich bin eine Göttin, kein Knopf!'],
    dozing: ['Hm? Ich hab nur kurz die Augen zugemacht …', 'Nur noch fünf Minuten …'],
    dormant: ['Mmh … noch nichts los hier …', 'Zzz … weckt mich, wenn sich das erste Leben regt …'],
  } satisfies Record<string, readonly string[]>;
  export type CompanionLine = keyof typeof LINES;

  /** The bubble shows this long (longer lines a little longer), then fades; unprompted lines at most this often. */
  const SAY_MS = 2600;
  const SAY_PER_CHAR_MS = 55;
  const FADE_MS = 320;
  const LINE_GAP_MS = 25000;
  /** CSS px the bubble's tail (css/companion.css) hangs below its box. */
  const TAIL_PX = 6;

  export class CompanionSpeech {
    readonly el: HTMLElement;
    /** A card holds the screen: unprompted lines are dropped. */
    held = false;
    private quiet = false;
    private lineAt = -Infinity;
    private last = '';
    private until = 0;
    /** The unprompted line on show (a reply to a poke is not), and the one the magic kept back. */
    private showing: CompanionLine | null = null;
    private due: CompanionLine | null = null;

    constructor() {
      // Layout inline: with an old stylesheet the bubble must still sit above her and take no clicks.
      // In the stage: above her, the tool card (the dock, 50) and the front vines (51), below the windows (100).
      this.el = make('div', 'companion-say');
      this.el.setAttribute('aria-live', 'polite');
      Object.assign(this.el.style, {
        position: 'absolute', zIndex: '52', margin: '0', width: 'max-content', pointerEvents: 'none', opacity: '0', transition: `opacity ${FADE_MS}ms`,
      });
    }

    /** u CSS px per art px; `left` the bubble's left edge, `tip` where its tail ends: art px from the stage's left and bottom. */
    place(u: number, left: number, tip: number): void {
      const font = Math.max(11, Math.round(4 + 4 * u));
      Object.assign(this.el.style, {
        left: `${Math.round(left * u)}px`, bottom: `${Math.round(tip * u) + TAIL_PX}px`, fontSize: `${font}px`, maxWidth: `${16 * font}px`,
      });
    }

    /** Silent from the magic's start until it is over; what it cuts short or holds back comes after. */
    setQuiet(quiet: boolean, now: number): void {
      this.quiet = quiet;
      if (!quiet) return;
      if (this.showing) this.due = this.showing;
      this.showing = null;
      if (this.until > now) this.until = now;
    }

    say(key: CompanionLine, now: number, prompted = false): void {
      if (this.quiet) {
        if (!prompted) this.due = key;
        return;
      }
      if (!prompted && (this.held || now - this.lineAt < LINE_GAP_MS)) return;
      this.show(key, now, prompted);
    }

    /** Her feeling changed (gaiacompanion.ts): a crisis begins or passes. */
    react(from: string, to: string, trouble: LivingState['trouble'], now: number): void {
      if (to === 'sad' || (to === 'worried' && from !== 'sad')) {
        this.say(trouble === 'hot' || trouble === 'cold' || trouble === 'clean' ? trouble : to, now);
      } else if (to === 'hopeful' && (from === 'sad' || from === 'worried')) this.say('better', now);
    }

    /** A new planet or a load: nothing from before is said. */
    reset(now: number): void {
      this.due = null;
      this.showing = null;
      if (this.until > now) this.until = now;
    }

    /** Every frame: fades the bubble out when its time is up, says a line the magic kept back. */
    render(now: number): void {
      if (this.due && !this.quiet && !this.held) {
        const key = this.due;
        this.due = null;
        this.show(key, now, false);
      }
      if (!this.until || now < this.until) return;
      this.el.style.opacity = '0';
      this.showing = null;
      if (now < this.until + FADE_MS) return;
      this.el.textContent = '';
      this.until = 0;
    }

    private show(key: CompanionLine, now: number, prompted: boolean): void {
      if (!prompted) this.lineAt = now;
      const pool: readonly string[] = LINES[key];
      let text = pool[Math.floor(Math.random() * pool.length)];
      if (text === this.last && pool.length > 1) text = pool[(pool.indexOf(text) + 1) % pool.length];
      this.last = text;
      this.showing = prompted ? null : key;
      this.el.textContent = text;
      this.el.style.opacity = '1';
      this.until = now + Math.max(SAY_MS, text.length * SAY_PER_CHAR_MS);
    }
  }
}
