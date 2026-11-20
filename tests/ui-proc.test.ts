// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { game } from '../src/game';

describe('item proc feed', () => {
  let root: HTMLElement;

  beforeAll(async () => {
    localStorage.clear();
    const { state } = game.newRun({ seed: 'proc-feed' });
    state.items.push(
      { instance: 'i-grey', id: 'grey-market', data: {}, equipped: true },
    );
    state.round!.answer = 'crane';
    state.round!.freeLeft = 0;
    localStorage.setItem('blacklist.run.v1', game.serialize(state));

    document.body.innerHTML = '<div id="app"></div>';
    await import('../src/ui/app');
    root = document.getElementById('app') as HTMLElement;
    root.querySelector<HTMLElement>('[data-action="resume"]')!.click();
  });

  it('shows Grey Market when an all-grey guess procs it', () => {
    for (const letter of 'sloth') {
      root.querySelector<HTMLElement>(`[data-action="key"][data-letter="${letter}"]`)!.click();
    }
    root.querySelector<HTMLElement>('[data-action="submit"]')!.click();

    const procs = [...document.querySelectorAll<HTMLElement>('#proc-root .proc-pop')];
    const text = procs.map((proc) => proc.textContent ?? '').join(' | ');
    expect(text).toContain('Grey Market');
    expect(text).toContain('+3 gold');
  });
});
