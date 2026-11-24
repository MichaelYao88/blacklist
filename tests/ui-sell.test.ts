// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { game } from '../src/game';

function itemCard(root: HTMLElement, name: string): HTMLElement | null {
  return [...root.querySelectorAll<HTMLElement>('.item-card')]
    .find((entry) => entry.textContent?.includes(name)) ?? null;
}

describe('shop item selling', () => {
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

  it('puts a sell button on each loadout item and drops the bottom list', () => {
    expect(root.querySelector('.sell-box')).toBeNull();
    const chips = [...root.querySelectorAll<HTMLElement>('.loadout-chip')];
    expect(chips).toHaveLength(6);
    for (const chip of chips) {
      const sell = chip.querySelector<HTMLElement>('[data-action="sell"]');
      expect(sell).not.toBeNull();
      expect(sell?.textContent).toContain('SELL');
    }
    const turtle = chips.find((chip) => chip.textContent?.includes('Turtle Shell'));
    expect(turtle?.querySelector<HTMLElement>('[data-action="sell"]')?.dataset.id)
      .toBe('i-hour');
  });

  it('keeps item tooltips on the sellable chips', () => {
    const turtle = [...root.querySelectorAll<HTMLElement>('.loadout-chip')]
      .find((entry) => entry.textContent?.includes('Turtle Shell')) ?? null;
    expect(turtle?.dataset.tip).toContain('reduced by 50%');

    turtle!.dispatchEvent(new Event('pointermove', { bubbles: true }));
    const tip = document.querySelector<HTMLElement>('.kw-tooltip');
    expect(tip?.classList.contains('visible')).toBe(true);
    expect(tip?.textContent).toContain('reduced by 50%');
  });

  it('scrolls the items panel when more than five are equipped', () => {
    expect(root.querySelector('.item-list')?.classList.contains('scrollable'))
      .toBe(true);
  });

  it('disables fight-only abilities outside a round', () => {
    for (const name of ['Evil Parrot', 'Necronomicon']) {
      const button = itemCard(root, name)
        ?.querySelector<HTMLElement>('[data-action="use"]');
      expect(button, name).not.toBeNull();
      expect(button?.hasAttribute('disabled'), name).toBe(true);
    }
  });

  it('sells from the item chip', () => {
    const chip = [...root.querySelectorAll<HTMLElement>('.loadout-chip')]
      .find((entry) => entry.textContent?.includes('Turtle Shell')) ?? null;
    chip?.querySelector<HTMLElement>('[data-action="sell"]')!.click();
    const remaining = [...root.querySelectorAll<HTMLElement>('.loadout-chip')]
      .some((entry) => entry.textContent?.includes('Turtle Shell'));
    expect(remaining).toBe(false);
  });
});
