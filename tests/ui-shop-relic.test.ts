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
        { id: 'o0', kind: 'item', def: 'mending-plate', price: 26 },
        { id: 'o1', kind: 'item', def: 'bloom', price: 7 },
        { id: 'o2', kind: 'eat', def: 'satchel', price: 19 },
        { id: 'o3', kind: 'eat', def: 'plating', price: 4 },
        { id: 'o4', kind: 'eat', def: 'poppy-seeds', price: 6 },
        { id: 'o5', kind: 'item', def: 'tally-lens', price: 12 },
        { id: 'o6', kind: 'eat', def: 'a-steak', price: 13 },
        { id: 'o7', kind: 'eat', def: 'without-u', price: 3 },
        { id: 'o8', kind: 'eat', def: 'purge-the-d', price: 12 },
        { id: 'o9', kind: 'eat', def: 'pay-respects-f', price: 8 },
        { id: 'o10', kind: 'eat', def: 'reveal-the-d', price: 18 },
        { id: 'o11', kind: 'item', def: 'scattershot', price: 10 },
        { id: 'o12', kind: 'spell', def: 'heal', price: 6 },
        { id: 'o13', kind: 'eat', def: 'hearty-meal', price: 8 },
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
      .find((card) => card.textContent?.includes('Mending Plate'));
    expect(relic).not.toBeNull();
    expect(relic?.classList.contains('rare')).toBe(true);
    expect(relic?.querySelector('.tag')?.textContent?.trim()).toBe('RELIC');

    const uncommon = [...root.querySelectorAll<HTMLElement>('.offer-card')]
      .find((card) => card.textContent?.includes('Scattershot'));
    expect(uncommon?.classList.contains('uncommon')).toBe(true);
    expect(uncommon?.querySelector('.tag')?.textContent?.trim()).toBe('UNCOMMON');

    const common = [...root.querySelectorAll<HTMLElement>('.offer-card')]
      .find((card) => card.textContent?.includes('Bloom'));
    expect(common?.classList.contains('rare')).toBe(false);
    expect(common?.querySelector('.tag')?.textContent?.trim()).toBe('ITEM');
  });

  it('styles rare and uncommon foods like items', () => {
    const rareFood = [...root.querySelectorAll<HTMLElement>('.offer-card')]
      .find((card) => card.textContent?.includes('Reveal the D'));
    expect(rareFood?.classList.contains('rare')).toBe(true);
    expect(rareFood?.classList.contains('food')).toBe(true);
    expect(rareFood?.querySelector('.tag')?.textContent?.trim()).toBe('RARE FOOD');

    const uncommonFood = [...root.querySelectorAll<HTMLElement>('.offer-card')]
      .find((card) => card.textContent?.includes('Satchel'));
    expect(uncommonFood?.classList.contains('uncommon')).toBe(true);
    expect(uncommonFood?.classList.contains('food')).toBe(true);
    expect(uncommonFood?.querySelector('.tag')?.textContent?.trim()).toBe('UNCOMMON');

    const commonFood = [...root.querySelectorAll<HTMLElement>('.offer-card')]
      .find((card) => card.textContent?.includes('Hearty Meal'));
    expect(commonFood?.classList.contains('food')).toBe(true);
    expect(commonFood?.classList.contains('rare')).toBe(false);
    expect(commonFood?.classList.contains('uncommon')).toBe(false);
    expect(commonFood?.querySelector('.tag')?.textContent?.trim()).toBe('FOOD');
  });

  it('moves "No slot." into the food hover text', () => {
    for (const card of root.querySelectorAll<HTMLElement>('.offer-card.food')) {
      expect(card.querySelector('p')?.textContent).not.toContain('No slot');
      const tag = card.querySelector<HTMLElement>('.tag');
      expect(tag?.dataset.tip).toBe("Food doesn't take inventory space.");
      expect(tag?.getAttribute('tabindex')).toBe('0');
    }
  });

  it('tags spell offers and leaves their purple squiggle to the stylesheet', () => {
    const spell = [...root.querySelectorAll<HTMLElement>('.offer-card')]
      .find((card) => card.textContent?.includes('Heal'));
    expect(spell?.classList.contains('spell')).toBe(true);
    expect(spell?.classList.contains('food')).toBe(false);
    expect(spell?.querySelector('.tag')?.textContent?.trim()).toBe('SPELL');
  });

  it('keeps the inventory in the rail column directly under the shop rail', () => {
    const railColumn = root.querySelector('.rail-column');
    expect(railColumn?.querySelector('.shop-rail')).not.toBeNull();
    expect(railColumn?.querySelector('.items-panel')).not.toBeNull();
  });

  it('uses shop banner overrides for common-rarity specials', () => {
    for (const name of ['Poppy Seeds', 'Counter-Intelligence', 'Without U', 'Purge the D', 'Pay Respects to F']) {
      const card = [...root.querySelectorAll<HTMLElement>('.offer-card')]
        .find((entry) => entry.textContent?.includes(name));
      expect(card?.classList.contains('uncommon')).toBe(true);
      expect(card?.querySelector('.tag')?.textContent?.trim()).toBe('UNCOMMON');
    }

    for (const name of ['A-Steak', 'Reveal the D']) {
      const card = [...root.querySelectorAll<HTMLElement>('.offer-card')]
        .find((entry) => entry.textContent?.includes(name));
      expect(card?.classList.contains('rare')).toBe(true);
      expect(card?.querySelector('.tag')?.textContent?.trim()).toBe('RARE FOOD');
    }
  });
});
