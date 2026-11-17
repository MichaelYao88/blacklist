// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { game } from '../src/game';

describe('centred damage overlay', () => {
  let root: HTMLElement;

  beforeAll(async () => {
    localStorage.clear();
    const { state } = game.newRun({ seed: 'ui-damage' });
    if (!state.round) throw new Error('expected a round');
    state.round.answer = 'crane';
    state.round.guesses = [];
    state.round.freeLeft = 0;
    state.round.paidGuesses = 0;
    state.round.baseDamage = 5;
    state.round.remainingMs = 60_000;
    state.round.timerStartMs = 0;
    state.armor = 0;
    state.maxArmor = 0;
    localStorage.setItem('blacklist.run.v1', game.serialize(state));

    document.body.innerHTML = '<div id="app"></div>';
    await import('../src/ui/app');
    root = document.getElementById('app') as HTMLElement;
  });

  it('renders the hit outside the re-rendered run tree', () => {
    root.querySelector<HTMLElement>('[data-action="resume"]')!.click();
    for (const letter of 'slate') {
      root.querySelector<HTMLElement>(`[data-action="key"][data-letter="${letter}"]`)!.click();
    }
    root.querySelector<HTMLElement>('[data-action="submit"]')!.click();

    const overlay = document.querySelector<HTMLElement>('#fx-root .damage-overlay');
    expect(overlay).not.toBeNull();
    expect(overlay!.textContent).toContain('5 damage');
    expect(root.querySelector('.damage-overlay')).toBeNull();
  });
});
