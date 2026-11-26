// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { game } from '../src/game';
import { readMeta } from '../src/ui/store';

describe('character unlock purchases', () => {
  let root: HTMLElement;

  beforeAll(async () => {
    localStorage.clear();
    localStorage.setItem('blacklist.meta.v1', JSON.stringify({
      characters: ['runner'],
      purchases: { 'double-cheeseburger': 2 },
    }));
    const { state } = game.newRun({ seed: 'character-purchase', character: 'runner' });
    state.phase = 'shop';
    state.gold = 20;
    state.shop = {
      offers: [{ id: 'o0', kind: 'eat', def: 'double-cheeseburger', price: 4 }],
      rerollCost: 2,
      rerolls: 0,
      purchases: 0,
      visit: 0,
      foodOffers: 1,
      foodsBought: 0,
    };
    localStorage.setItem('blacklist.run.v1', game.serialize(state));
    document.body.innerHTML = '<div id="app"></div>';
    await import('../src/ui/app');
    root = document.getElementById('app') as HTMLElement;
    root.querySelector<HTMLElement>('[data-action="resume"]')!.click();
  });

  it('unlocks The Gourmand on the third Double Cheeseburger purchase', () => {
    root.querySelector<HTMLElement>('[data-action="buy"][data-id="o0"]')!.click();
    expect(readMeta().purchases['double-cheeseburger']).toBe(3);
    expect(readMeta().characters).toContain('gourmand');

    const overlay = root.querySelector<HTMLElement>('.unlock-overlay');
    expect(overlay).not.toBeNull();
    expect(overlay?.textContent).toContain('The Gourmand');
    expect(overlay?.textContent).toContain('Economaxxing.');
  });
});
