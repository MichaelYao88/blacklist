// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { game } from '../src/game';

describe('Old McDonald round start', () => {
  let root: HTMLElement;

  beforeAll(async () => {
    localStorage.clear();
    const { state } = game.newRun({ seed: 'mcdonald-ui' });
    state.items.push({ instance: 'i-mac', id: 'old-mcdonald', data: {}, equipped: true });
    state.nodes[1] = { kind: 'round', level: 2 };
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
    root.querySelector<HTMLElement>('[data-action="continue"]')!.click();
  });

  it('guesses EIEIO for free without the Phone a Friend word spam', () => {
    const firstRow = root.querySelector<HTMLElement>('.board-row');
    const letters = [...(firstRow?.querySelectorAll('.tile-letter') ?? [])]
      .map((tile) => tile.textContent?.toLowerCase())
      .join('');
    expect(letters).toBe('eieio');
    expect(document.querySelectorAll('#phrase-root span')).toHaveLength(0);
  });
});
