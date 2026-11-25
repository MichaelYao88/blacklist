// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { game } from '../src/game';
import { readMeta } from '../src/ui/store';

describe('Purgamist unlock purges', () => {
  let root: HTMLElement;

  beforeAll(async () => {
    localStorage.clear();
    localStorage.setItem('blacklist.meta.v1', JSON.stringify({
      characters: ['runner'],
      purgedCount: 5,
    }));
    const { state } = game.newRun({ seed: 'purgamist-purge', character: 'runner' });
    state.phase = 'shop';
    state.gold = 50;
    state.shop = {
      offers: [
        { id: 'o0', kind: 'eat', def: 'snack', price: 3 },
        { id: 'o1', kind: 'eat', def: 'without-u', price: 3 },
      ],
      rerollCost: 2,
      rerolls: 0,
      purchases: 0,
      visit: 0,
      foodOffers: 2,
      foodsBought: 0,
    };
    localStorage.setItem('blacklist.run.v1', game.serialize(state));
    document.body.innerHTML = '<div id="app"></div>';
    await import('../src/ui/app');
    root = document.getElementById('app') as HTMLElement;
    root.querySelector<HTMLElement>('[data-action="resume"]')!.click();
  });

  it('requires six lifetime purges and ignores ordinary food', () => {
    root.querySelector<HTMLElement>('[data-action="arm-buy"][data-id="o0"]')!.click();
    root.querySelector<HTMLElement>('[data-action="confirm-buy"][data-id="o0"]')!.click();
    expect(readMeta().purgedCount).toBe(5);
    expect(readMeta().characters).not.toContain('purgamist');

    root.querySelector<HTMLElement>('[data-action="arm-buy"][data-id="o1"]')!.click();
    root.querySelector<HTMLElement>('[data-action="confirm-buy"][data-id="o1"]')!.click();
    expect(readMeta().purgedCount).toBe(6);
    expect(readMeta().characters).toContain('purgamist');

    const overlay = root.querySelector<HTMLElement>('.unlock-overlay');
    expect(overlay?.textContent).toContain('The Purgamist');
    expect(overlay?.textContent).toContain('Pick your favorite vowel.');
  });
});
