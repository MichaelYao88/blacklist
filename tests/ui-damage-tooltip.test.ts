// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { game } from '../src/game';

describe('damage tooltip versus damage animation', () => {
  let root: HTMLElement;

  beforeAll(async () => {
    localStorage.clear();
    const { state } = game.newRun({ seed: 'damage-tooltip-suppress' });
    const round = state.round!;
    round.answer = 'crane';
    round.freeLeft = 0;
    round.paidGuesses = 0;
    round.baseDamage = 5;
    round.remainingMs = 60_000;
    round.timerStartMs = 0;
    state.armor = 0;
    state.maxArmor = 0;
    localStorage.setItem('blacklist.run.v1', game.serialize(state));

    document.body.innerHTML = '<div id="app"></div>';
    await import('../src/ui/app');
    root = document.getElementById('app') as HTMLElement;
    root.querySelector<HTMLElement>('[data-action="resume"]')!.click();
  });

  it('skips the damage slam while the damage tooltip is on screen', () => {
    const hpBefore = root.querySelector<HTMLElement>('.hp-numbers')?.textContent;
    const chip = root.querySelector<HTMLElement>('.guess-damage')!;
    chip.dispatchEvent(new Event('pointermove', { bubbles: true }));
    expect(
      document.querySelector<HTMLElement>('.kw-tooltip')?.classList.contains('visible'),
    ).toBe(true);

    for (const letter of 'slate') {
      root.querySelector<HTMLElement>(`[data-action="key"][data-letter="${letter}"]`)!.click();
    }
    root.querySelector<HTMLElement>('[data-action="submit"]')!.click();

    expect(root.querySelector<HTMLElement>('.hp-numbers')?.textContent).not.toBe(hpBefore);
    expect(document.querySelector('#fx-root .damage-overlay')).toBeNull();
    expect(document.querySelector('.damage-warning')).toBeNull();
    expect(document.querySelector('.shell.shake')).toBeNull();
    expect(document.querySelector('.battle-rail.hit')).toBeNull();
    expect(document.querySelector('.enemy-side.attacking')).toBeNull();
  });
});
