// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { game } from '../src/game';
import { CONTENT } from '../src/content';

describe('blacklist unpurge popup', () => {
  let root: HTMLElement;

  beforeAll(async () => {
    localStorage.clear();
    const { state } = game.newRun({ seed: 'blacklist-popup', character: 'runner' });
    state.phase = 'summary';
    state.summary = {
      outcome: 'solved',
      answer: 'crane',
      guesses: 1,
      elapsedMs: 1_000,
      rewardPending: false,
      gold: 5,
    };
    state.nodeIndex = 0;
    state.nodes[1] = { kind: 'round', level: 2 };
    state.purged = ['z'];
    state.blacklist = CONTENT.answers.filter((word) => !word.includes('z'));
    state.usedAnswers = [];
    localStorage.setItem('blacklist.run.v1', game.serialize(state));

    document.body.innerHTML = '<div id="app"></div>';
    await import('../src/ui/app');
    root = document.getElementById('app') as HTMLElement;
    root.querySelector<HTMLElement>('[data-action="resume"]')!.click();
  });

  it('shows a floating popup when the blacklist forces an unpurge', () => {
    root.querySelector<HTMLElement>('[data-action="continue"]')!.click();
    const popup = document.querySelector<HTMLElement>('#parrot-root .blacklist-pop');
    expect(popup).not.toBeNull();
    expect(popup?.textContent).toContain('THE BLACKLIST');
    expect(popup?.textContent).toContain('unpurged Z');
  });
});
