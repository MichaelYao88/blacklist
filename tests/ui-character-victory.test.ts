// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { game } from '../src/game';
import { readMeta } from '../src/ui/store';

describe('character unlock victory', () => {
  let root: HTMLElement;

  beforeAll(async () => {
    localStorage.clear();
    localStorage.setItem('blacklist.meta.v1', JSON.stringify({
      characters: ['runner'],
    }));
    const { state } = game.newRun({ seed: 'character-victory', character: 'runner' });
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

  it('unlocks The Farmer after winning a run', () => {
    root.querySelector<HTMLElement>('[data-action="continue"]')!.click();
    expect(readMeta().characters).toContain('farmer');

    const overlay = root.querySelector<HTMLElement>('.unlock-overlay');
    expect(overlay).not.toBeNull();
    expect(overlay?.textContent).toContain('The Farmer');
    expect(overlay?.textContent).toContain('Same same but different.');
  });
});
