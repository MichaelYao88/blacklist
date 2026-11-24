// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { game } from '../src/game';

function row(root: HTMLElement, name: string): HTMLElement | null {
  return [...root.querySelectorAll<HTMLElement>('.loadout-row')]
    .find((entry) => entry.textContent?.includes(name)) ?? null;
}

function rows(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('.loadout-row')];
}

describe('compact shop loadout', () => {
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

  it('renders a compact ranked list with sell buttons', () => {
    expect(root.querySelector('.sell-box')).toBeNull();
    expect(root.querySelector('.phase-card.shop .loadout')).toBeNull();

    const list = rows(root);
    expect(list).toHaveLength(8);
    expect(list.slice(0, 6).every((entry) => entry.classList.contains('equipped')))
      .toBe(true);
    expect(list.slice(6).every((entry) => entry.classList.contains('bagged')))
      .toBe(true);
    for (const entry of list) {
      expect(entry.querySelector('[data-action="sell"]')).not.toBeNull();
      expect(entry.getAttribute('draggable')).toBe('true');
      expect(entry.dataset.item).toBeTruthy();
    }
    expect(row(root, 'Turtle Shell')
      ?.querySelector<HTMLElement>('[data-action="sell"]')?.dataset.id)
      .toBe('i-hour');
  });

  it('keeps item tooltips on the compact rows', () => {
    const turtle = row(root, 'Turtle Shell');
    expect(turtle?.dataset.tip).toContain('reduced by 50%');

    turtle!.dispatchEvent(new Event('pointermove', { bubbles: true }));
    const tip = document.querySelector<HTMLElement>('.kw-tooltip');
    expect(tip?.classList.contains('visible')).toBe(true);
    expect(tip?.textContent).toContain('reduced by 50%');
  });

  it('scrolls the loadout list when it holds more than five items', () => {
    expect(root.querySelector('.loadout-list')?.classList.contains('scrollable'))
      .toBe(true);
  });

  it('equips a bagged row by clicking it and keeps ranks ordered', () => {
    const bird = row(root, 'Early Bird');
    expect(bird?.dataset.action).toBe('equip');
    bird!.click();

    const refreshed = row(root, 'Early Bird');
    expect(refreshed?.dataset.action).toBe('unequip');
    expect(refreshed?.classList.contains('equipped')).toBe(true);
    const list = rows(root);
    const firstBag = list.findIndex((entry) => entry.classList.contains('bagged'));
    expect(firstBag).toBeGreaterThan(0);
    expect(list.slice(firstBag).every((entry) => entry.classList.contains('bagged')))
      .toBe(true);
  });

  it('sells from a loadout row', () => {
    row(root, 'Turtle Shell')
      ?.querySelector<HTMLElement>('[data-action="sell"]')!.click();
    expect(row(root, 'Turtle Shell')).toBeNull();
  });
});
