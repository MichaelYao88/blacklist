// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { game } from '../src/game';

function saved(): ReturnType<typeof game.deserialize> {
  const json = localStorage.getItem('blacklist.run.v1');
  return json ? game.deserialize(json) : null;
}

describe('Purgamist setup', () => {
  let root: HTMLElement;

  beforeAll(async () => {
    localStorage.clear();
    localStorage.setItem('blacklist.meta.v1', JSON.stringify({
      characters: ['runner', 'purgamist'],
    }));
    document.body.innerHTML = '<div id="app"></div>';
    await import('../src/ui/app');
    root = document.getElementById('app') as HTMLElement;
    root.querySelector<HTMLElement>('[data-action="character"][data-id="purgamist"]')!.click();
    root.querySelector<HTMLElement>('[data-action="new-run"]')!.click();
  });

  it('starts in a live round with both tools and no purge modal', () => {
    expect(root.querySelector('.modal')).toBeNull();
    expect(document.querySelector('.countdown-overlay')).not.toBeNull();
    expect(root.textContent).toContain('Travel Inkwell');
    expect(root.textContent).toContain('Soapstone');
    expect(root.textContent).not.toContain('purges pending');
    expect(root.querySelector('.rail-level-value')?.textContent).toContain('1/');
    expect(saved()?.pendingPurge).toBe(0);
  });

  it('uses the soapstone to open a purge choice, then consumes it', () => {
    const state = saved();
    if (!state?.round) throw new Error('expected a round');
    const answer = state.round.answer;
    const letter = 'bcdfghjklmnpqrstvwxz'.split('').find((ch) => !answer.includes(ch))!;

    root.querySelector<HTMLButtonElement>('[data-action="use"]')!.click();
    expect(saved()?.pendingPurge).toBe(1);
    expect(saved()?.items.some((item) => item.id === 'soapstone')).toBe(false);
    expect(root.querySelector('.modal')).not.toBeNull();

    root.querySelector<HTMLButtonElement>(
      `[data-action="select-purge"][data-letter="${letter}"]`,
    )!.click();
    root.querySelector<HTMLButtonElement>('[data-action="confirm-purge"]')!.click();

    expect(saved()?.pendingPurge).toBe(0);
    expect(saved()?.purged).toContain(letter);
  });
});
