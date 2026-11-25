// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { game } from '../src/game';
import { readMeta } from '../src/ui/store';

describe('Necromancer unlock purchases', () => {
  let root: HTMLElement;

  beforeAll(async () => {
    localStorage.clear();
    localStorage.setItem('blacklist.meta.v1', JSON.stringify({
      characters: ['runner'],
    }));
    const { state } = game.newRun({ seed: 'necromancer-purchase', character: 'runner' });
    state.phase = 'shop';
    state.gold = 50;
    state.shop = {
      offers: [
        { id: 'o0', kind: 'item', def: 'necronomicon', price: 13 },
      ],
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

  it('unlocks The Necromancer on the first Necronomicon purchase', () => {
    root.querySelector<HTMLElement>('[data-action="arm-buy"][data-id="o0"]')!.click();
    root.querySelector<HTMLElement>('[data-action="confirm-buy"][data-id="o0"]')!.click();
    expect(readMeta().purchases.necronomicon).toBe(1);
    expect(readMeta().characters).toContain('necromancer');

    const overlay = root.querySelector<HTMLElement>('.unlock-overlay');
    expect(overlay?.textContent).toContain('The Necromancer');
    expect(overlay?.textContent).toContain('Keep feeding the book.');
  });
});
