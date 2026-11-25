// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { game } from '../src/game';

function saved(): ReturnType<typeof game.deserialize> {
  const json = localStorage.getItem('blacklist.run.v1');
  return json ? game.deserialize(json) : null;
}

describe('purge and curse removal confirm', () => {
  let root: HTMLElement;

  beforeAll(async () => {
    localStorage.clear();
    const { state } = game.newRun({ seed: 'confirm-purge', character: 'runner' });
    state.phase = 'round';
    state.round!.answer = 'crane';
    state.pendingPurge = 1;
    state.pendingCurseRemoval = 1;
    state.curses = [{ id: 'clock', stacks: 1 }];
    localStorage.setItem('blacklist.run.v1', game.serialize(state));

    document.body.innerHTML = '<div id="app"></div>';
    await import('../src/ui/app');
    root = document.getElementById('app') as HTMLElement;
    root.querySelector<HTMLElement>('[data-action="resume"]')!.click();
  });

  it('marks a purge letter without purging it, then confirms', () => {
    expect(saved()?.pendingPurge).toBe(1);
    root.querySelector<HTMLElement>('[data-action="select-purge"][data-letter="q"]')!.click();
    expect(saved()?.pendingPurge).toBe(1);
    expect(saved()?.purged).not.toContain('q');
    expect(root.querySelector('[data-action="select-purge"][data-letter="q"]')?.classList.contains('selected'))
      .toBe(true);

    root.querySelector<HTMLButtonElement>('[data-action="confirm-purge"]')!.click();
    expect(saved()?.pendingPurge).toBe(0);
    expect(saved()?.purged).toContain('q');
  });

  it('marks a curse without removing it, then confirms', () => {
    expect(saved()?.pendingCurseRemoval).toBe(1);
    root.querySelector<HTMLElement>('[data-action="select-remove-curse"][data-id="clock"]')!.click();
    expect(saved()?.pendingCurseRemoval).toBe(1);
    expect(saved()?.curses.some((curse) => curse.id === 'clock')).toBe(true);

    root.querySelector<HTMLButtonElement>('[data-action="confirm-remove-curse"]')!.click();
    expect(saved()?.pendingCurseRemoval).toBe(0);
    expect(saved()?.curses.some((curse) => curse.id === 'clock')).toBe(false);
  });
});
