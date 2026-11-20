// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { game } from '../src/game';

describe('shop relic labelling', () => {
  let root: HTMLElement;

  beforeAll(async () => {
    localStorage.clear();
    const { state } = game.newRun({ seed: 'shop-relic-label' });
    state.phase = 'shop';
    state.gold = 100;
    state.shop = {
      offers: [
        { id: 'o0', kind: 'item', def: 'quickdraw', price: 24 },
        { id: 'o1', kind: 'item', def: 'bloom', price: 7 },
        { id: 'o2', kind: 'eat', def: 'satchel', price: 9 },
        { id: 'o3', kind: 'eat', def: 'plating', price: 3 },
        { id: 'o4', kind: 'eat', def: 'poppy-seeds', price: 4 },
        { id: 'o5', kind: 'item', def: 'tally-lens', price: 12 },
        { id: 'o6', kind: 'eat', def: 'a-steak', price: 7 },
        { id: 'o7', kind: 'eat', def: 'without-u', price: 2 },
        { id: 'o8', kind: 'eat', def: 'purge-the-d', price: 8 },
      ],
      rerollCost: 2,
      rerolls: 0,
      purchases: 0,
      visit: 1,
      foodOffers: 0,
      foodsBought: 0,
    };
    localStorage.setItem('blacklist.run.v1', game.serialize(state));

    document.body.innerHTML = '<div id="app"></div>';
    await import('../src/ui/app');
    root = document.getElementById('app') as HTMLElement;
    root.querySelector<HTMLElement>('[data-action="resume"]')!.click();
  });

  it('marks rare item offers as RELIC and styles the card', () => {
    const relic = [...root.querySelectorAll<HTMLElement>('.offer-card')]
      .find((card) => card.textContent?.includes('Quickdraw'));
    expect(relic).not.toBeNull();
    expect(relic?.classList.contains('rare')).toBe(true);
    expect(relic?.querySelector('.tag')?.textContent?.trim()).toBe('RELIC');

    const common = [...root.querySelectorAll<HTMLElement>('.offer-card')]
      .find((card) => card.textContent?.includes('Bloom'));
    expect(common?.classList.contains('rare')).toBe(false);
    expect(common?.querySelector('.tag')?.textContent?.trim()).toBe('ITEM');
  });

  it('styles rare and uncommon foods like items', () => {
    const rareFood = [...root.querySelectorAll<HTMLElement>('.offer-card')]
      .find((card) => card.textContent?.includes('Satchel'));
    expect(rareFood?.classList.contains('rare')).toBe(true);
    expect(rareFood?.querySelector('.tag')?.textContent?.trim()).toBe('RARE');

    const uncommonFood = [...root.querySelectorAll<HTMLElement>('.offer-card')]
      .find((card) => card.textContent?.includes('Plating'));
    expect(uncommonFood?.classList.contains('uncommon')).toBe(true);
    expect(uncommonFood?.querySelector('.tag')?.textContent?.trim()).toBe('UNCOMMON');
  });

  it('keeps the inventory in the rail column directly under the battle rail', () => {
    const railColumn = root.querySelector('.rail-column');
    expect(railColumn?.querySelector('.battle-rail')).not.toBeNull();
    expect(railColumn?.querySelector('.items-panel')).not.toBeNull();
  });

  it('uses shop banner overrides for common-rarity specials', () => {
    for (const name of ['Poppy Seeds', 'Tally Lens', 'Without U', 'Purge the D']) {
      const card = [...root.querySelectorAll<HTMLElement>('.offer-card')]
        .find((entry) => entry.textContent?.includes(name));
      expect(card?.classList.contains('uncommon')).toBe(true);
      expect(card?.querySelector('.tag')?.textContent?.trim()).toBe('UNCOMMON');
    }

    const aSteak = [...root.querySelectorAll<HTMLElement>('.offer-card')]
      .find((entry) => entry.textContent?.includes('A-Steak'));
    expect(aSteak?.classList.contains('rare')).toBe(true);
    expect(aSteak?.querySelector('.tag')?.textContent?.trim()).toBe('RARE');
  });
});
