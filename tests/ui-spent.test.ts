// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { game } from '../src/game';

describe('once-per-round item state', () => {
  let root: HTMLElement;

  beforeAll(async () => {
    localStorage.clear();
    const { state } = game.newRun({ seed: 'spent-item' });
    state.items.push({
      instance: 'i-scatter',
      id: 'scattershot',
      data: { used: 1 },
      equipped: true,
    });
    localStorage.setItem('blacklist.run.v1', game.serialize(state));

    document.body.innerHTML = '<div id="app"></div>';
    await import('../src/ui/app');
    root = document.getElementById('app') as HTMLElement;
    root.querySelector<HTMLElement>('[data-action="resume"]')!.click();
  });

  it('shows SPENT on a once-per-round item that has fired', () => {
    const card = root.querySelector<HTMLElement>('.item-card');
    expect(card?.classList.contains('spent')).toBe(true);
    expect(card?.querySelector('.item-state')?.textContent).toBe('SPENT');
    expect(card?.textContent).not.toContain('used 1');
  });
});
