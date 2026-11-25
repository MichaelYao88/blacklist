// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { game } from '../src/game';

function saved(): ReturnType<typeof game.deserialize> {
  const json = localStorage.getItem('blacklist.run.v1');
  return json ? game.deserialize(json) : null;
}

describe('shop arm-then-confirm', () => {
  let root: HTMLElement;

  beforeAll(async () => {
    localStorage.clear();
    const { state } = game.newRun({ seed: 'confirm-shop', character: 'runner' });
    state.phase = 'shop';
    state.gold = 50;
    state.items.push(
      { instance: 'i-1', id: 'bloom', data: {}, equipped: false },
      { instance: 'i-2', id: 'early-bird', data: { gold: 2 }, equipped: true },
    );
    state.slots = 8;
    state.shop = {
      offers: [
        { id: 'o0', kind: 'item', def: 'bloom', price: 7 },
        { id: 'o1', kind: 'item', def: 'mending-plate', price: 26 },
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

  it('arms a buy without spending, and a different command cancels it', () => {
    expect(saved()?.gold).toBe(50);
    root.querySelector<HTMLElement>('[data-action="arm-buy"][data-id="o0"]')!.click();
    expect(saved()?.gold).toBe(50);
    expect(root.querySelector('[data-action="confirm-buy"][data-id="o0"]')).not.toBeNull();

    root.querySelector<HTMLElement>('[data-action="equip"][data-id="i-1"]')!.click();
    expect(saved()?.gold).toBe(50);
    expect(root.querySelector('[data-action="confirm-buy"][data-id="o0"]')).toBeNull();

    root.querySelector<HTMLElement>('[data-action="arm-buy"][data-id="o0"]')!.click();
    root.querySelector<HTMLElement>('[data-action="confirm-buy"][data-id="o0"]')!.click();
    expect(saved()?.gold).toBe(43);
  });

  it('arms a sale without selling, then confirms it', () => {
    expect(saved()?.items.some((item) => item.instance === 'i-1')).toBe(true);
    root.querySelector<HTMLElement>('[data-action="arm-sell"][data-id="i-1"]')!.click();
    expect(saved()?.items.some((item) => item.instance === 'i-1')).toBe(true);

    root.querySelector<HTMLElement>('[data-action="confirm-sell"][data-id="i-1"]')!.click();
    expect(saved()?.items.some((item) => item.instance === 'i-1')).toBe(false);
  });

  it('arms a reroll without spending, then confirms it', () => {
    const before = saved()!.gold;
    root.querySelector<HTMLElement>('[data-action="arm-reroll"]')!.click();
    expect(saved()?.gold).toBe(before);
    expect(root.querySelector('[data-action="confirm-reroll"]')).not.toBeNull();

    root.querySelector<HTMLElement>('[data-action="confirm-reroll"]')!.click();
    expect(saved()!.gold).toBe(before - 2);
  });
});
