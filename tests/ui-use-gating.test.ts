// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { game } from '../src/game';

function card(root: HTMLElement, name: string): HTMLElement | null {
  return [...root.querySelectorAll<HTMLElement>('.item-card')]
    .find((entry) => entry.textContent?.includes(name)) ?? null;
}

describe('combat-only item abilities', () => {
  let root: HTMLElement;

  beforeAll(async () => {
    localStorage.clear();
    const { state } = game.newRun({ seed: 'ability-gating', character: 'runner' });
    state.items.push({
      instance: 'i-book',
      id: 'necronomicon',
      data: {},
      equipped: true,
    });
    state.phase = 'curse';
    state.curse = { options: ['censor'], starting: false };
    localStorage.setItem('blacklist.run.v1', game.serialize(state));

    document.body.innerHTML = '<div id="app"></div>';
    await import('../src/ui/app');
    root = document.getElementById('app') as HTMLElement;
    root.querySelector<HTMLElement>('[data-action="resume"]')!.click();
  });

  it('disables the Necronomicon and Evil Parrot outside a fight', () => {
    for (const name of ['Necronomicon', 'Evil Parrot']) {
      const button = card(root, name)
        ?.querySelector<HTMLElement>('[data-action="use"]');
      expect(button, name).not.toBeNull();
      expect(button?.hasAttribute('disabled'), name).toBe(true);
      expect(button?.getAttribute('title'), name)
        .toContain('Only usable during a fight');
    }
  });
});
