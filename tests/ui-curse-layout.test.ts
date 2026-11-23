// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { game } from '../src/game';

describe('curse floor rail', () => {
  let root: HTMLElement;

  beforeAll(async () => {
    localStorage.clear();
    localStorage.setItem('blacklist.meta.v1', JSON.stringify({
      characters: ['runner', 'pathfinder'],
    }));
    const { state } = game.newRun({ seed: 'curse-layout', character: 'runner' });
    const curseIndex = state.nodes.findIndex((node) => node.kind === 'curse');
    state.nodeIndex = curseIndex - 1;
    state.phase = 'shop';
    state.shop = {
      offers: [],
      rerollCost: 2,
      rerolls: 0,
      purchases: 0,
      visit: 0,
      foodOffers: 0,
      foodsBought: 0,
    };
    const drafted = game.step(state, { type: 'continue' });
    localStorage.setItem('blacklist.run.v1', game.serialize(drafted.state));

    document.body.innerHTML = '<div id="app"></div>';
    await import('../src/ui/app');
    root = document.getElementById('app') as HTMLElement;
    root.querySelector<HTMLElement>('[data-action="resume"]')!.click();
  });

  it('swaps the battle rail for the curse rail and keeps the draft in the center', () => {
    expect(root.querySelector('.curse-draft')).not.toBeNull();
    expect(root.querySelector('.battle-rail')).toBeNull();
    expect(root.querySelector('.curse-rail')).not.toBeNull();
    expect(root.querySelector('.curse-rail .rail-level-value')?.textContent).toBe('4/51');
    expect(root.querySelector('.curse-rail .panel-kicker')?.textContent).toBe('CURSE');
    expect(root.querySelector('.curse-rail .mini-player')).not.toBeNull();
    expect(root.querySelector('.curse-rail .big-hp')).not.toBeNull();
    expect(root.querySelector('.curse-rail .armor-line')).not.toBeNull();
    expect(root.querySelector('.curse-rail .mini-vs')).toBeNull();
    expect(root.querySelector('.rail-column .items-panel')).not.toBeNull();
  });
});
