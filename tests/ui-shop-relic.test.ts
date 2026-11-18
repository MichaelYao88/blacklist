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
        { id: 'o0', kind: 'item', def: 'old-mcdonald', price: 30 },
        { id: 'o1', kind: 'item', def: 'bloom', price: 7 },
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
    const relic = root.querySelector<HTMLElement>('.offer-card.rare');
    expect(relic).not.toBeNull();
    expect(relic?.querySelector('.tag')?.textContent?.trim()).toBe('RELIC');
    expect(relic?.textContent).toContain('Old McDonald');

    const common = [...root.querySelectorAll<HTMLElement>('.offer-card')]
      .find((card) => card.textContent?.includes('Bloom'));
    expect(common?.classList.contains('rare')).toBe(false);
    expect(common?.querySelector('.tag')?.textContent?.trim()).toBe('ITEM');
  });
});
