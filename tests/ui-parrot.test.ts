// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { game } from '../src/game';

describe('Evil Parrot item card', () => {
  let root: HTMLElement;

  beforeAll(async () => {
    localStorage.clear();
    const { state } = game.newRun({ seed: 'parrot-ui', character: 'runner' });
    const parrot = state.items.find((item) => item.id === 'evil-parrot');
    parrot!.data.readyAt = 45_000;
    parrot!.data._suggestions = 3;
    localStorage.setItem('blacklist.run.v1', game.serialize(state));

    document.body.innerHTML = '<div id="app"></div>';
    await import('../src/ui/app');
    root = document.getElementById('app') as HTMLElement;
    root.querySelector<HTMLElement>('[data-action="resume"]')!.click();
  });

  it('hides the internal readyAt and suggestion counters', () => {
    const card = [...root.querySelectorAll<HTMLElement>('.item-card')]
      .find((entry) => entry.textContent?.includes('Evil Parrot')) ?? null;
    expect(card).not.toBeNull();
    expect(card?.textContent).not.toContain('readyAt');
    expect(card?.textContent).not.toContain('45000');
    expect(card?.textContent).not.toContain('suggestions');
  });

  it('describes the cracker bribe and shows the coin button', () => {
    const card = [...root.querySelectorAll<HTMLElement>('.item-card')]
      .find((entry) => entry.textContent?.includes('Evil Parrot')) ?? null;
    expect(card?.textContent).toContain('Suggests a possible word once per round');
    expect(card?.textContent).toContain('Bribe it for more with a cracker costing 🪙');
    const button = card?.querySelector<HTMLElement>('[data-action="use"]') ?? null;
    expect(button?.textContent?.trim()).toBe('🪙');
  });
});
