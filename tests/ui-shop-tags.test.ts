// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { game } from '../src/game';

function tagTexts(element: Element | null): string[] {
  return [...(element?.querySelectorAll('.item-tag') ?? [])]
    .map((tag) => tag.textContent?.trim() ?? '');
}

describe('multi-tag shop offers and loadout rows', () => {
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

  it('shows all tags as separate chips on the offer card', () => {
    const offer = [...root.querySelectorAll<HTMLElement>('.offer-card')]
      .find((card) => card.textContent?.includes('X Marks'));
    expect(tagTexts(offer!)).toEqual(['GUESS', 'GOLD', 'ARMOR']);
    expect(offer?.querySelector('.slot-note')?.textContent).toBe('1 ITEM SLOT');
    expect(offer?.querySelector('.tag')?.textContent).toBe('UNCOMMON');
  });

  it('shows all tags on the loadout and bag rows', () => {
    const row = [...root.querySelectorAll<HTMLElement>('.loadout-row[data-item]')]
      .find((entry) => entry.textContent?.includes('X Marks'));
    expect(row).not.toBeNull();
    expect(tagTexts(row!)).toEqual(['GUESS', 'GOLD', 'ARMOR']);

    const bag = [...root.querySelectorAll<HTMLElement>('.loadout-row.bagged')]
      .find((entry) => entry.textContent?.includes('Bloom'));
    expect(tagTexts(bag!)).toEqual(['GUESS']);
  });
});
