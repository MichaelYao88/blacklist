import { describe, expect, it } from 'vitest';
import { game } from '../src/game';
import type { RunState } from '../src/core/types';

function idleState(character: string, seed: string): RunState {
  const { state } = game.newRun({ seed, character });
  state.gold = 10;
  state.round!.remainingMs = null;
  state.round!.parrotIdleMs = 194_000;
  return state;
}

function swipes(events: Array<{ type: string; text?: string }>): string[] {
  return events
    .filter((event) => event.type === 'message' && event.text?.includes('swipes'))
    .map((event) => event.text ?? '');
}

describe('Evil Parrot idle theft is Soldier-only', () => {
  it('still steals for the Soldier', () => {
    const state = idleState('runner', 'steal-soldier');
    const ticked = game.step(state, { type: 'tick', dtMs: 1_000 });
    expect(ticked.state.gold).toBe(6);
    expect(swipes(ticked.events)).toEqual(['The Evil Parrot swipes 4 gold.']);
    expect(ticked.state.round?.parrotIdleMs).toBe(0);
  });

  it('never steals for the Gourmand even while they own a parrot', () => {
    const state = idleState('gourmand', 'steal-gourmand');
    expect(state.items.some((item) => item.id === 'evil-parrot')).toBe(true);
    const ticked = game.step(state, { type: 'tick', dtMs: 1_000 });
    expect(ticked.state.gold).toBe(10);
    expect(swipes(ticked.events)).toHaveLength(0);
    expect(ticked.state.round?.parrotIdleMs).toBe(194_000);
  });

  it('does not steal for any other class', () => {
    for (const character of ['necromancer', 'gourmand', 'farmer', 'werewolf']) {
      const state = idleState(character, `steal-${character}`);
      const ticked = game.step(state, { type: 'tick', dtMs: 1_000 });
      expect(ticked.state.gold, character).toBe(10);
      expect(swipes(ticked.events), character).toHaveLength(0);
    }
  });
});
