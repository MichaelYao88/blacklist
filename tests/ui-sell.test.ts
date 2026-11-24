// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { game } from '../src/game';

function itemCard(root: HTMLElement, name: string): HTMLElement | null {
  return [...root.querySelectorAll<HTMLElement>('.item-card')]
    .find((entry) => entry.textContent?.includes(name)) ?? null;
}

function rankedCards(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('.item-list.ranked .item-card')];
}

describe('merged shop loadout', () => {
  let root: HTMLElement;

  beforeAll(async () => {
    localStorage.clear();
    const { state } = game.newRun({ seed: 'sell-hover' });
    state.items.push(
      { instance: 'i-hour', id: 'turtle-shell', data: {}, equipped: true },
      { instance: 'i-book', id: 'necronomicon', data: {}, equipped: true },
      { instance: 'i-piggy', id: 'piggy-bank', data: {}, equipped: true },
      { instance: 'i-brace', id: 'brace', data: {}, equipped: true },
      { instance: 'i-bloom', id: 'bloom', data: {}, equipped: true },
      { instance: 'i-bird', id: 'early-bird', data: {}, equipped: false },
      { instance: 'i-head', id: 'head-start', data: {}, equipped: false },
    );
    state.slots = 8;
    state.phase = 'shop';
    state.shop = {
      offers: [],
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

  it('shows the loadout slots and a ranked item list in the left panel', () => {
    expect(root.querySelector('.sell-box')).toBeNull();
    expect(root.querySelector('.phase-card.shop .loadout')).toBeNull();
    expect(root.querySelector('.items-panel .slot-grid')).not.toBeNull();

    const cards = rankedCards(root);
    expect(cards).toHaveLength(8);
    expect(cards.slice(0, 6).every((card) => !card.classList.contains('in-bag')))
      .toBe(true);
    expect(cards.slice(6).every((card) => card.classList.contains('in-bag')))
      .toBe(true);
    for (const card of cards) {
      expect(card.querySelector('[data-action="sell"]')).not.toBeNull();
      expect(card.getAttribute('draggable')).toBe('true');
      expect(card.dataset.item).toBeTruthy();
    }
  });

  it('keeps item tooltips on the ranked cards', () => {
    const turtle = itemCard(root, 'Turtle Shell');
    expect(turtle?.dataset.tip).toContain('reduced by 50%');

    turtle!.dispatchEvent(new Event('pointermove', { bubbles: true }));
    const tip = document.querySelector<HTMLElement>('.kw-tooltip');
    expect(tip?.classList.contains('visible')).toBe(true);
    expect(tip?.textContent).toContain('reduced by 50%');
  });

  it('scrolls the ranked list when more than five are equipped', () => {
    const list = root.querySelector('.item-list.ranked');
    expect(list?.classList.contains('scrollable')).toBe(true);
  });

  it('disables fight-only abilities outside a round', () => {
    for (const name of ['Evil Parrot', 'Necronomicon']) {
      const button = itemCard(root, name)
        ?.querySelector<HTMLElement>('[data-action="use"]');
      expect(button, name).not.toBeNull();
      expect(button?.hasAttribute('disabled'), name).toBe(true);
    }
  });

  it('equips a bagged card by clicking it and moves it into the ranked group', () => {
    const bird = itemCard(root, 'Early Bird');
    expect(bird?.dataset.action).toBe('equip');
    bird!.click();

    const refreshed = itemCard(root, 'Early Bird');
    expect(refreshed?.dataset.action).toBe('unequip');
    expect(refreshed?.classList.contains('in-bag')).toBe(false);
    expect(rankedCards(root).at(-1)?.textContent).toContain('Head Start');
  });

  it('sells from the ranked item card', () => {
    itemCard(root, 'Turtle Shell')
      ?.querySelector<HTMLElement>('[data-action="sell"]')!.click();
    expect(itemCard(root, 'Turtle Shell')).toBeNull();
  });
});
