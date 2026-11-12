// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';

const RUN_KEY = 'blacklist.run.v1';

function type(word: string): void {
  for (const letter of word) {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: letter, bubbles: true }));
  }
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
}

describe('run-over screen', () => {
  let root: HTMLElement;
  let missed = '';

  beforeAll(async () => {
    localStorage.clear();
    document.body.innerHTML = '<div id="app"></div>';
    await import('../src/ui/app');
    root = document.getElementById('app') as HTMLElement;

    root.querySelector<HTMLElement>('[data-action="new-run"]')!.click();

    const words = [
      'pious', 'tiger', 'mango', 'bumpy', 'fuzzy', 'waltz',
      'joker', 'vexed', 'quick', 'nymph', 'azure', 'glyph',
    ];

    for (const word of words) {
      const raw = localStorage.getItem(RUN_KEY);
      if (!raw) break;
      const state = JSON.parse(raw) as { phase: string; round?: { answer: string } };
      if (state.phase !== 'round' || !state.round) break;
      if (state.round.answer === word) continue;

      type(word);
      const save = localStorage.getItem(RUN_KEY);
      if (!save) {
        missed = state.round.answer;
        break;
      }
    }
  });

  it('shows the word the player missed', () => {
    expect(missed).toHaveLength(5);
    expect(root.querySelector('.over-screen')).not.toBeNull();
    expect(root.textContent).toContain('THE WORD YOU MISSED');
    expect(root.querySelector('.over-answer b')?.textContent).toBe(missed.toUpperCase());
  });
});
