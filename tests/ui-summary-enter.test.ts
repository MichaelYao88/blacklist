// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { game } from '../src/game';

describe('summary keyboard continue', () => {
  let root: HTMLElement;

  beforeAll(async () => {
    localStorage.clear();
    const { state } = game.newRun({ seed: 'summary-enter', character: 'runner' });
    state.phase = 'summary';
    state.summary = {
      outcome: 'solved',
      answer: 'crane',
      guesses: 1,
      elapsedMs: 1_000,
      rewardPending: true,
      gold: 5,
    };
    localStorage.setItem('blacklist.run.v1', game.serialize(state));
    document.body.innerHTML = '<div id="app"></div>';
    await import('../src/ui/app');
    root = document.getElementById('app') as HTMLElement;
    root.querySelector<HTMLElement>('[data-action="resume"]')!.click();
  });

  it('claims the reward when Enter is pressed', () => {
    expect(root.textContent).toContain('CLAIM REWARD');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(root.querySelector('.reward-grid')).not.toBeNull();
    expect(root.textContent).toContain('Take one');
  });
});
