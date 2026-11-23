// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { game } from '../src/game';

function levelBadge(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.rail-level');
}

describe('persistent level display', () => {
  let root: HTMLElement;

  beforeAll(async () => {
    localStorage.clear();
    const { state } = game.newRun({ seed: 'level-badge-ui', character: 'runner' });
    state.round!.answer = 'crane';
    state.round!.freeLeft = 0;
    state.hp = 200;
    state.maxHp = 200;
    localStorage.setItem('blacklist.run.v1', game.serialize(state));

    document.body.innerHTML = '<div id="app"></div>';
    await import('../src/ui/app');
    root = document.getElementById('app') as HTMLElement;
    root.querySelector<HTMLElement>('[data-action="resume"]')!.click();
  });

  it('shows the level during a round', () => {
    const badge = levelBadge();
    expect(badge).not.toBeNull();
    expect(badge?.querySelector('.rail-level-kicker')?.textContent).toBe('FLOOR');
    expect(badge?.querySelector('.rail-level-value')?.textContent).toBe('1/51');
  });

  it('shows the current floor with one past and three future floors', () => {
    const badge = levelBadge();
    const floors = [...badge!.querySelectorAll<HTMLElement>('.rail-node:not(.is-empty)')];
    expect(floors.map((node) => node.dataset.level)).toEqual(['4', '3', '2', '1']);
    expect(badge?.querySelectorAll('.rail-node.is-empty').length).toBe(1);

    const current = badge?.querySelector<HTMLElement>('.rail-node.current');
    expect(current?.dataset.level).toBe('1');
    expect(current?.getAttribute('aria-current')).toBe('step');
    expect(current?.getAttribute('tabindex')).toBe('0');
    expect(current?.getAttribute('data-tip')?.startsWith('Fight')).toBe(true);

    const shop = badge?.querySelector<HTMLElement>('.rail-node[data-level="2"]');
    expect(shop?.classList.contains('future')).toBe(true);
    expect(shop?.classList.contains('kind-shop')).toBe(true);
    expect(shop?.getAttribute('data-tip')).toBe('Shop');

    const curse = badge?.querySelector<HTMLElement>('.rail-node[data-level="4"]');
    expect(curse?.classList.contains('kind-curse')).toBe(true);
    expect(curse?.getAttribute('data-tip')).toBe('Curse');
    expect(badge?.textContent).not.toContain('Floor');
  });

  it('keeps the level through summary and reward, then swaps to the shop rail', () => {
    for (const letter of 'crane') {
      window.dispatchEvent(new KeyboardEvent('keydown', {
        key: letter,
        code: `Key${letter.toUpperCase()}`,
      }));
    }
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter' }));

    expect(root.querySelector('.summary')).not.toBeNull();
    expect(levelBadge()?.querySelector('.rail-level-value')?.textContent).toBe('1/51');

    root.querySelector<HTMLElement>('[data-action="continue"]')!.click();
    expect(root.querySelector('.reward')).not.toBeNull();
    expect(levelBadge()?.querySelector('.rail-level-value')?.textContent).toBe('1/51');

    root.querySelector<HTMLElement>('[data-action="reward"]')!.click();

    if (root.querySelector('.happening')) {
      expect(levelBadge()?.querySelector('.rail-level-value')?.textContent).toBe('1/51');
      root.querySelector<HTMLElement>('.happening [data-action="choose"]:not([disabled])')!.click();
      root.querySelector<HTMLElement>('[data-action="continue"]')!.click();
    }

    expect(root.querySelector('.shop-choice')).not.toBeNull();
    expect(levelBadge()?.querySelector('.rail-level-value')?.textContent).toBe('2/51');

    root.querySelector<HTMLElement>('[data-action="choose"][data-id="shop"]')!.click();
    expect(root.querySelector('.shop')).not.toBeNull();
    expect(levelBadge()?.querySelector('.rail-level-value')?.textContent).toBe('2/51');
    expect(root.querySelector('.battle-rail')).toBeNull();
    expect(root.querySelector('.shop-rail')).not.toBeNull();
    expect(root.querySelector('.side-panel .floorplan-panel .rail-level')).not.toBeNull();
    const sideSections = [...root.querySelectorAll<HTMLElement>('.side-panel > section')];
    expect(sideSections[0]?.classList.contains('floorplan-panel')).toBe(true);
    expect(sideSections[1]?.textContent).toContain('SPELLS');
    expect(sideSections[2]?.textContent).toContain('CURSES');
    expect(root.querySelector('.shop-rail .panel-kicker')?.textContent).toBe('SHOP');
    expect(root.querySelector('.shop-rail-gold')).not.toBeNull();
    expect(root.querySelector('.shop-rail .mini-player')).not.toBeNull();
    expect(root.querySelector('.shop-rail .big-hp')).not.toBeNull();
    expect(root.querySelector('.shop-rail .armor-line')).not.toBeNull();
    expect(root.querySelector('.shop-rail .mini-vs')).toBeNull();
  });
});
