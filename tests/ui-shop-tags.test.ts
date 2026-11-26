// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { game } from '../src/game';

describe('shop offers and loadout rows show slot info without item tags', () => {
  let root: HTMLElement;

  beforeAll(async () => {
    localStorage.clear();
    const { state } = game.newRun({ seed: 'item-tags-shop', character: 'runner' });
    state.phase = 'shop';
    state.gold = 100;
    state.items.push(
      { instance: 'i-x', id: 'x-marks', data: {}, equipped: true },
      { instance: 'i-b', id: 'bloom', data: {}, equipped: false },
    );
    state.slots = 8;
    state.shop = {
      offers: [{ id: 'o0', kind: 'item', def: 'x-marks', price: 12 }],
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

  it('shows only the slot note on the offer card', () => {
    const offer = [...root.querySelectorAll<HTMLElement>('.offer-card')]
      .find((card) => card.textContent?.includes('X Marks'));
    expect(offer).not.toBeNull();
    expect(offer?.querySelectorAll('.item-tag').length).toBe(0);
    expect(offer?.querySelector('.tag')).toBeNull();
    expect(offer?.querySelector('.offer-top .slot-note')?.textContent?.trim())
      .toBe('1 ITEM SLOT');
  });

  it('removes tag chips from loadout and bag rows', () => {
    const row = [...root.querySelectorAll<HTMLElement>('.loadout-row[data-item]')]
      .find((entry) => entry.textContent?.includes('X Marks'));
    expect(row).not.toBeNull();
    expect(row?.querySelectorAll('.item-tag').length).toBe(0);
    expect(row?.querySelector('.slot-note')?.textContent?.trim()).toBe('1 ITEM SLOT');

    const bag = [...root.querySelectorAll<HTMLElement>('.loadout-row.bagged')]
      .find((entry) => entry.textContent?.includes('Bloom'));
    expect(bag).not.toBeNull();
    expect(bag?.querySelectorAll('.item-tag').length).toBe(0);
    expect(bag?.querySelector('.slot-note')?.textContent?.trim()).toBe('1 ITEM SLOT');
  });
});
