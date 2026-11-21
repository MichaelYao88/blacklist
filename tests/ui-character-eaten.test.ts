// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { game } from '../src/game';
import { readMeta } from '../src/ui/store';

describe('food unlocks from eating', () => {
  let root: HTMLElement;

  beforeAll(async () => {
    localStorage.clear();
    localStorage.setItem('blacklist.meta.v1', JSON.stringify({
      characters: ['runner'],
      purchases: { 'double-cheeseburger': 2 },
    }));
    const { state } = game.newRun({ seed: 'eaten-food-unlock', character: 'runner' });
    state.phase = 'reward';
    state.reward = {
      options: [{
        id: 'eat:double-cheeseburger',
        kind: 'eat',
        def: 'double-cheeseburger',
        label: 'Double Cheeseburger',
        description: '+6 max HP, lose 2 HP. No slot.',
      }],
      boss: false,
    };
    localStorage.setItem('blacklist.run.v1', game.serialize(state));
    document.body.innerHTML = '<div id="app"></div>';
    await import('../src/ui/app');
    root = document.getElementById('app') as HTMLElement;
    root.querySelector<HTMLElement>('[data-action="resume"]')!.click();
  });

  it('counts a reward food and unlocks The Gourmand', () => {
    root.querySelector<HTMLElement>(
      '[data-action="reward"][data-id="eat:double-cheeseburger"]',
    )!.click();
    expect(readMeta().foodCounts['double-cheeseburger']).toBe(3);
    expect(readMeta().characters).toContain('gourmand');
    expect(root.querySelector<HTMLElement>('.unlock-overlay')?.textContent)
      .toContain('The Gourmand');
  });
});
