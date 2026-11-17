// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { game } from '../src/game';

describe('sell menu item tooltips', () => {
  let root: HTMLElement;

  beforeAll(async () => {
    localStorage.clear();
    const { state } = game.newRun({ seed: 'sell-hover' });
    state.items.push({ instance: 'i-hour', id: 'hourglass', data: {}, equipped: true });
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

  it('makes each sell row hoverable', () => {
    const name = root.querySelector<HTMLElement>('.sell-name');
    expect(name).not.toBeNull();
    expect(name?.getAttribute('tabindex')).toBe('0');
    expect(name?.dataset.tip).toContain('+15s per round');

    name!.dispatchEvent(new Event('pointermove', { bubbles: true }));
    const tip = document.querySelector<HTMLElement>('.kw-tooltip');
    expect(tip?.classList.contains('visible')).toBe(true);
    expect(tip?.textContent).toContain('+15s per round');
  });
});
