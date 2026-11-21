// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { game } from '../src/game';
import { readMeta } from '../src/ui/store';

describe('Purgamist unlock purchases', () => {
  let root: HTMLElement;

  beforeAll(async () => {
    localStorage.clear();
    localStorage.setItem('blacklist.meta.v1', JSON.stringify({
      characters: ['runner'],
      purchases: { inkcap: 1, 'poppy-seeds': 2 },
    }));
    const { state } = game.newRun({ seed: 'purgamist-purchase', character: 'runner' });
    state.phase = 'shop';
    state.gold = 50;
    state.shop = {
      offers: [
        { id: 'o0', kind: 'eat', def: 'poppy-seeds', price: 6 },
        { id: 'o1', kind: 'eat', def: 'inkcap', price: 12 },
      ],
      rerollCost: 2,
      rerolls: 0,
      purchases: 0,
      visit: 0,
      foodOffers: 2,
      foodsBought: 0,
    };
    localStorage.setItem('blacklist.run.v1', game.serialize(state));
    document.body.innerHTML = '<div id="app"></div>';
    await import('../src/ui/app');
    root = document.getElementById('app') as HTMLElement;
    root.querySelector<HTMLElement>('[data-action="resume"]')!.click();
  });

  it('requires two Inkcap purchases and ignores Poppy Seeds', () => {
    root.querySelector<HTMLElement>('[data-action="buy"][data-id="o0"]')!.click();
    expect(readMeta().purchases['poppy-seeds']).toBe(3);
    expect(readMeta().characters).not.toContain('purgamist');

    root.querySelector<HTMLElement>('[data-action="buy"][data-id="o1"]')!.click();
    expect(readMeta().purchases.inkcap).toBe(2);
    expect(readMeta().characters).toContain('purgamist');

    const overlay = root.querySelector<HTMLElement>('.unlock-overlay');
    expect(overlay?.textContent).toContain('The Purgamist');
  });
});
