// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { game } from '../src/game';

describe('Necronomicon use state', () => {
  let root: HTMLElement;

  beforeAll(async () => {
    localStorage.clear();
    const { state } = game.newRun({ seed: 'necronomicon-ui', character: 'runner' });
    state.items.push({
      instance: 'i-nec-ui',
      id: 'necronomicon',
      data: { fed: 0, _uses: 0 },
      equipped: true,
    });
    state.round!.answer = 'crane';
    state.maxHp = 100;
    state.hp = 100;
    localStorage.setItem('blacklist.run.v1', game.serialize(state));
    document.body.innerHTML = '<div id="app"></div>';
    await import('../src/ui/app');
    root = document.getElementById('app') as HTMLElement;
    root.querySelector<HTMLElement>('[data-action="resume"]')!.click();
  });

  it('shows USE, then USED and a proc pop after the book is fed', () => {
    const findCard = (): HTMLElement | undefined => (
      [...root.querySelectorAll<HTMLElement>('.item-card')]
        .find((card) => card.textContent?.includes('Necronomicon'))
    );
    const button = findCard()?.querySelector<HTMLButtonElement>('[data-action="use"]');
    expect(button).not.toBeNull();
    expect(button?.disabled).toBe(false);

    button!.click();

    const card = findCard();
    expect(card?.textContent).toContain('USED');
    const usedButton = card?.querySelector<HTMLButtonElement>('[data-action="use"]');
    expect(usedButton?.disabled).toBe(true);
    expect(document.querySelector<HTMLElement>('.proc-pop')?.textContent)
      .toContain('Necronomicon');
  });
});
