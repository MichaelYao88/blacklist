// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { game } from '../src/game';

describe('non-English keyboard fallback', () => {
  let root: HTMLElement;

  beforeAll(async () => {
    localStorage.clear();
    const { state } = game.newRun({ seed: 'keyboard-layout' });
    if (!state.round) throw new Error('expected a round');
    state.round.answer = 'crane';
    state.round.guesses = [];
    state.round.freeLeft = 0;
    state.round.remainingMs = 60_000;
    state.round.timerStartMs = 0;
    localStorage.setItem('blacklist.run.v1', game.serialize(state));

    document.body.innerHTML = '<div id="app"></div>';
    await import('../src/ui/app');
    root = document.getElementById('app') as HTMLElement;
    root.querySelector<HTMLElement>('[data-action="resume"]')!.click();
  });

  it('maps physical key positions when event.key is non-Latin', () => {
    const presses: Array<[string, string]> = [
      ['ф', 'KeyC'],
      ['р', 'KeyR'],
      ['а', 'KeyA'],
      ['т', 'KeyN'],
      ['у', 'KeyE'],
    ];
    for (const [key, code] of presses) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key, code, bubbles: true }));
    }

    expect(root.textContent).toContain('Non-English keyboard detected');
    const typed = [...root.querySelectorAll<HTMLElement>('.tile.input .tile-letter')]
      .map((tile) => tile.textContent ?? '')
      .join('');
    expect(typed).toBe('crane');

    window.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Process',
      code: 'Enter',
      bubbles: true,
    }));
    expect(root.textContent).toContain('SOLVED');
  });
});
