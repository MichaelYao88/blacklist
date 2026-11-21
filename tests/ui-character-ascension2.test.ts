// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { game } from '../src/game';
import { readMeta } from '../src/ui/store';

describe('Ascension 2 character unlock', () => {
  let root: HTMLElement;

  beforeAll(async () => {
    localStorage.clear();
    localStorage.setItem('blacklist.meta.v1', JSON.stringify({ characters: ['runner'] }));
    const { state } = game.newRun({ seed: 'ascension-two-unlock', character: 'runner', ascension: 2 });
    state.pendingStartingCurses = 0;
    state.nodes = [{ kind: 'shop', level: 1 }];
    state.nodeIndex = 0;
    state.level = 1;
    state.act = 0;
    state.phase = 'shop';
    state.shop = {
      offers: [],
      rerollCost: 2,
      rerolls: 0,
      purchases: 0,
      visit: 0,
      foodOffers: 0,
      foodsBought: 0,
    };
    localStorage.setItem('blacklist.run.v1', game.serialize(state));
    document.body.innerHTML = '<div id="app"></div>';
    await import('../src/ui/app');
    root = document.getElementById('app') as HTMLElement;
    root.querySelector<HTMLElement>('[data-action="resume"]')!.click();
  });

  it('unlocks The Farmer, The Empty Armor, and The Werewolf', () => {
    root.querySelector<HTMLElement>('[data-action="continue"]')!.click();
    const unlocked = readMeta().characters;
    expect(unlocked).toContain('farmer');
    expect(unlocked).toContain('empty-armor');
    expect(unlocked).toContain('werewolf');
    expect(root.querySelector<HTMLElement>('.unlock-overlay')?.textContent).toContain('The Farmer');

    root.querySelector<HTMLElement>('[data-action="dismiss-unlock"]')!.click();
    expect(root.querySelector<HTMLElement>('.unlock-overlay')?.textContent).toContain('The Empty Armor');

    root.querySelector<HTMLElement>('[data-action="dismiss-unlock"]')!.click();
    expect(root.querySelector<HTMLElement>('.unlock-overlay')?.textContent).toContain('The Werewolf');
  });
});
