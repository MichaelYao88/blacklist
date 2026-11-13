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

    const raw = localStorage.getItem(RUN_KEY);
    if (raw) {
      const state = JSON.parse(raw) as { round?: { answer: string } };
      const answer = state.round?.answer ?? '';
      const words = [
        'pious', 'tiger', 'mango', 'bumpy', 'fuzzy', 'waltz',
        'joker', 'vexed', 'quick', 'nymph', 'azure', 'glyph',
      ];
      const wrong = words.filter((word) => word !== answer);
      // The first guess is blacklisted, so use a second wrong word for the
      // rest. Fixed encounter damage means the run can take a while to die.
      type(wrong[0]);
      for (let i = 0; i < 40 && localStorage.getItem(RUN_KEY); i++) {
        type(wrong[1]);
      }
      if (!localStorage.getItem(RUN_KEY)) missed = answer;
    }
  });

  it('shows the word the player missed', () => {
    expect(missed).toHaveLength(5);
    expect(root.querySelector('.over-screen')).not.toBeNull();
    expect(root.textContent).toContain('THE WORD YOU MISSED');
    expect(root.querySelector('.over-answer b')?.textContent).toBe(missed.toUpperCase());
  });
});
