// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { CONTENT } from '../src/content';
import { game, type RunState } from '../src/game';

function savedRun(): RunState | null {
  const json = localStorage.getItem('blacklist.run.v1');
  return json ? game.deserialize(json) : null;
}

function submit(word: string): void {
  for (const letter of word) {
    window.dispatchEvent(new KeyboardEvent('keydown', {
      key: letter,
      code: `Key${letter.toUpperCase()}`,
    }));
  }
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter' }));
}

describe('new run keeps the played character', () => {
  let root: HTMLElement;

  beforeAll(async () => {
    localStorage.clear();
    localStorage.setItem('blacklist.meta.v1', JSON.stringify({
      characters: ['runner', 'necromancer'],
    }));
    // Resume a Necromancer run while the picker still defaults to the Soldier.
    const { state } = game.newRun({ seed: 'new-run-character', character: 'necromancer' });
    localStorage.setItem('blacklist.run.v1', game.serialize(state));

    document.body.innerHTML = '<div id="app"></div>';
    await import('../src/ui/app');
    root = document.getElementById('app') as HTMLElement;
    root.querySelector<HTMLElement>('[data-action="resume"]')!.click();
  });

  it('restarts with the character from the finished run', () => {
    const words = [...CONTENT.valid];
    let cursor = 0;
    for (let attempt = 0; attempt < 40 && !root.querySelector('.over-screen'); attempt++) {
      const state = savedRun();
      if (state?.phase === 'round' && state.round) {
        const index = words.slice(cursor).findIndex((word) =>
          word !== state.round!.answer
          && !state.blacklist.includes(word)
          && !word.split('').some((letter) => state.purged.includes(letter)));
        const word = words[cursor + Math.max(0, index)];
        cursor += Math.max(0, index) + 1;
        submit(word);
        continue;
      }
      const next = root.querySelector<HTMLElement>('[data-action="continue"]');
      const reward = root.querySelector<HTMLElement>('[data-action="reward"]');
      if (next) next.click();
      else if (reward) reward.click();
      else break;
    }

    expect(root.querySelector('.over-screen')).not.toBeNull();
    const newRun = root.querySelector<HTMLElement>('[data-action="new-run"]');
    expect(newRun?.dataset.character).toBe('necromancer');
    newRun!.click();

    expect(savedRun()?.character).toBe('necromancer');
  });
});
