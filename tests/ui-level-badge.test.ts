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
    expect(badge?.querySelector('.rail-level-kicker')?.textContent).toBe('LEVEL');
    expect(badge?.querySelector('.rail-level-value')?.textContent).toBe('1/51');
  });

  it('keeps the level visible through summary, reward, and shop phases', () => {
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
  });
});
