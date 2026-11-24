import { describe, expect, it } from 'vitest';
import { game } from '../src/game';
import type { Command, GameEvent, RunState, StepResult } from '../src/game';
import { groupProcChanges } from '../src/ui/procRewards';

function start(seed: string): StepResult {
  return game.newRun({ seed });
}

function act(state: RunState, cmd: Command): StepResult {
  return game.step(state, cmd);
}

function setAnswer(state: RunState, word: string): void {
  if (!state.round) throw new Error('not in a round');
  state.round.answer = word;
  state.round.guesses = [];
}

type ItemProcEvent = Extract<GameEvent, { type: 'itemProc' }>;

function procs(events: GameEvent[], item: string): ItemProcEvent[] {
  return events.filter(
    (event): event is ItemProcEvent => event.type === 'itemProc' && event.item === item,
  );
}

describe('item proc reward metadata', () => {
  it('reports gold gained by a proc', () => {
    const { state } = start('proc-change-gold');
    state.items.push({ instance: 'i-grey', id: 'grey-market', data: {}, equipped: true });
    state.round!.freeLeft = 0;
    setAnswer(state, 'crane');

    const miss = act(state, { type: 'guess', word: 'sloth' });
    const proc = procs(miss.events, 'grey-market')[0];
    expect(proc?.text).toContain('+2 gold');
    expect(proc?.changes).toContainEqual({ kind: 'gold', amount: 2 });
  });

  it('reports max HP and max armor gained by a proc', () => {
    const { state } = start('proc-change-defense');
    state.items.push({ instance: 'i-bloom', id: 'bloom', data: { hp: 3 }, equipped: true });
    state.items.push({ instance: 'i-brace', id: 'brace', data: {}, equipped: true });
    setAnswer(state, 'crane');

    const solved = act(state, { type: 'guess', word: 'crane' });
    expect(procs(solved.events, 'bloom')[0]?.changes)
      .toContainEqual({ kind: 'maxHp', amount: 3 });
    expect(procs(solved.events, 'brace')[0]?.changes)
      .toContainEqual({ kind: 'maxArmor', amount: 1 });
  });

  it('reports spells gained by a proc', () => {
    const { state } = start('proc-change-spell');
    state.items.push({ instance: 'i-fast', id: 'fast-learner', data: {}, equipped: true });
    state.spells = [];
    setAnswer(state, 'crane');
    state.round!.elapsedMs = 59_999;

    const solved = act(state, { type: 'guess', word: 'crane' });
    expect(procs(solved.events, 'fast-learner')[0]?.changes)
      .toContainEqual({ kind: 'spell', id: 'time-freeze', count: 1 });
  });
});

describe('proc reward fly grouping', () => {
  it('folds HP and max HP into one heart and armor into one shield', () => {
    expect(groupProcChanges([
      { kind: 'hp', amount: 2 },
      { kind: 'maxHp', amount: 3 },
      { kind: 'armor', amount: 1 },
      { kind: 'maxArmor', amount: 4 },
    ])).toEqual([
      { kind: 'hp', icon: '❤️', amount: 5 },
      { kind: 'armor', icon: '🛡️', amount: 5 },
    ]);
  });

  it('keeps gold and each gained spell as separate flights', () => {
    expect(groupProcChanges([
      { kind: 'gold', amount: 2 },
      { kind: 'spell', id: 'heal', count: 1 },
      { kind: 'spell', id: 'omen', count: 2 },
    ])).toEqual([
      { kind: 'gold', icon: '🪙', amount: 2 },
      { kind: 'spell', icon: '✦', amount: 1 },
      { kind: 'spell', icon: '✦', amount: 2 },
    ]);
  });

  it('ignores zero and negative resource deltas', () => {
    expect(groupProcChanges([
      { kind: 'hp', amount: 0 },
      { kind: 'gold', amount: -1 },
      { kind: 'spell', id: 'heal', count: 0 },
    ])).toEqual([]);
  });
});
