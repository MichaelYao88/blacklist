// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { game } from '../src/game';

describe('item proc reward effects', () => {
  let root: HTMLElement;

  beforeAll(async () => {
    localStorage.clear();
    const { state } = game.newRun({ seed: 'proc-fx' });
    state.items.push({ instance: 'i-grey', id: 'grey-market', data: {}, equipped: true });
    state.round!.answer = 'crane';
    state.round!.freeLeft = 0;
    localStorage.setItem('blacklist.run.v1', game.serialize(state));

    document.body.innerHTML = '<div id="app"></div>';
    await import('../src/ui/app');
    root = document.getElementById('app') as HTMLElement;
    root.querySelector<HTMLElement>('[data-action="resume"]')!.click();
  });

  it('tags the gold HUD so coins have a destination', () => {
    expect(document.querySelector('[data-hud="gold"]')).not.toBeNull();
  });

  it('flies a coin from a gold proc toward the HUD', () => {
    for (const letter of 'sloth') {
      root.querySelector<HTMLElement>(`[data-action="key"][data-letter="${letter}"]`)!.click();
    }
    root.querySelector<HTMLElement>('[data-action="submit"]')!.click();

    const pop = document.querySelector<HTMLElement>('#proc-root .proc-pop');
    expect(pop).not.toBeNull();
    expect(pop?.dataset.procId).toBeTruthy();
    expect(pop?.textContent).toContain('+2 gold');
    expect(document.querySelector('#proc-fx-root .proc-fly-gold')).not.toBeNull();
  });
});
