// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { game } from '../src/game';

describe('Mysterious Room UI', () => {
  let root: HTMLElement;

  beforeAll(async () => {
    localStorage.clear();
    localStorage.setItem('blacklist.meta.v1', JSON.stringify({
      runs: 3,
      wins: 1,
      mysteriousCounts: {
        'red-amulet': 5,
        'silver-key': 2,
        'nonsensical-map': 0,
      },
    }));
    const { state } = game.newRun({ seed: 'mysterious-ui', character: 'runner' });
    const roomIndex = state.nodes.findIndex((node) => node.kind === 'mysteriousRoom');
    state.nodeIndex = roomIndex;
    state.level = 40;
    state.phase = 'mysteriousRoom';
    state.mysteriousCounted = true;
    state.mysteriousBrought = ['red-amulet', 'silver-key'];
    localStorage.setItem('blacklist.run.v1', game.serialize(state));

    document.body.innerHTML = '<div id="app"></div>';
    await import('../src/ui/app');
    root = document.getElementById('app') as HTMLElement;
    root.querySelector<HTMLElement>('[data-action="resume"]')!.click();
  });

  it('shows exactly three emoji with their lifetime counters', () => {
    const items = [...root.querySelectorAll<HTMLElement>('.mysterious-room .mysterious-item')];
    expect(items).toHaveLength(3);
    expect(items.map((item) => item.querySelector('.mysterious-emoji')?.textContent))
      .toEqual(['📿', '🗝️', '🗺️']);
    expect(items.map((item) => item.querySelector('.mysterious-count')?.textContent))
      .toEqual(['×5', '×2', '×0']);
    expect(root.querySelector('.mysterious-room')?.textContent).not.toMatch(/relic/i);
  });

  it('claim victory ends the run as a win exactly once', () => {
    const claim = root.querySelector<HTMLElement>('[data-action="claim-victory"]');
    expect(claim).not.toBeNull();
    claim!.click();

    expect(root.querySelector('.over-screen.victory')).not.toBeNull();
    expect(localStorage.getItem('blacklist.run.v1')).toBeNull();
    expect(root.querySelector('[data-action="claim-victory"]')).toBeNull();
    const meta = JSON.parse(localStorage.getItem('blacklist.meta.v1')!) as { wins: number };
    expect(meta.wins).toBe(2);
  });
});
