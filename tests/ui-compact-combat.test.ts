// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { game } from '../src/game';

function row(root: HTMLElement, name: string): HTMLElement | null {
  return [...root.querySelectorAll<HTMLElement>('.loadout-row')]
    .find((entry) => entry.textContent?.includes(name)) ?? null;
}

describe('compact combat item panel', () => {
  let root: HTMLElement;

  beforeAll(async () => {
    localStorage.clear();
    const { state } = game.newRun({ seed: 'compact-combat', character: 'runner' });
    state.items.push(
      { instance: 'i-hour', id: 'turtle-shell', data: {}, equipped: true },
      { instance: 'i-book', id: 'necronomicon', data: {}, equipped: true },
      { instance: 'i-piggy', id: 'piggy-bank', data: {}, equipped: true },
      { instance: 'i-brace', id: 'brace', data: {}, equipped: true },
    );
    state.slots = 8;
    localStorage.setItem('blacklist.run.v1', game.serialize(state));

    document.body.innerHTML = '<div id="app"></div>';
    await import('../src/ui/app');
    root = document.getElementById('app') as HTMLElement;
    root.querySelector<HTMLElement>('[data-action="resume"]')!.click();
  });

  it('uses compact rows once more than four items are equipped', () => {
    expect(root.querySelectorAll('.item-card')).toHaveLength(0);
    const rows = [...root.querySelectorAll<HTMLElement>('.loadout-row')];
    expect(rows).toHaveLength(5);
    for (const entry of rows) {
      expect(entry.querySelector('.item-emoji')?.textContent).toBeTruthy();
    }
  });

  it('keeps combat abilities usable from the compact rows', () => {
    const book = row(root, 'Necronomicon')
      ?.querySelector<HTMLElement>('[data-action="use"]');
    expect(book).not.toBeNull();
    expect(book?.hasAttribute('disabled')).toBe(false);

    const parrot = row(root, 'Evil Parrot')
      ?.querySelector<HTMLElement>('[data-action="use"]');
    expect(parrot).not.toBeNull();
    expect(parrot?.hasAttribute('disabled')).toBe(false);
  });
});
