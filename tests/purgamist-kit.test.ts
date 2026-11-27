import { describe, expect, it } from 'vitest';
import { CHARACTERS, ITEM_BY_ID } from '../src/content';
import { game } from '../src/game';
import type { Command, RunState, StepResult } from '../src/game';

function start(seed: string): StepResult {
  return game.newRun({ seed, character: 'purgamist' });
}

function act(state: RunState, cmd: Command): StepResult {
  return game.step(state, cmd);
}

function setAnswer(state: RunState, word: string): void {
  if (!state.round) throw new Error('not in a round');
  state.round.answer = word;
  state.round.guesses = [];
}

describe('Purgamist kit', () => {
  it('adds both tools as free, no-spawn, unique items', () => {
    const inkwell = ITEM_BY_ID.get('travel-inkwell');
    expect(inkwell?.name).toBe('Travel Inkwell');
    expect(inkwell?.price).toBe(0);
    expect(inkwell?.kind).toBe('gear');
    expect(inkwell?.slots).toBe(0);
    expect(inkwell?.noSpawn).toBe(true);
    expect(inkwell?.unique).toBe(true);
    expect(inkwell?.on?.onInn).toBeDefined();

    const soapstone = ITEM_BY_ID.get('soapstone');
    expect(soapstone?.name).toBe('Soapstone');
    expect(soapstone?.price).toBe(0);
    expect(soapstone?.kind).toBe('consumable');
    expect(soapstone?.noSpawn).toBe(true);
    expect(soapstone?.unique).toBe(true);
    expect(soapstone?.useLabel).toBe('PURGE');
    expect(soapstone?.onUse).toBeDefined();
  });

  it('starts with both tools, no free purges, and a live round', () => {
    const { state } = start('purgamist-kit-start');
    expect(state.phase).toBe('round');
    expect(state.level).toBe(1);
    expect(state.pendingPurge).toBe(0);
    expect(state.round).toBeDefined();
    expect(state.items.some((item) => item.id === 'travel-inkwell' && item.equipped)).toBe(true);
    expect(state.items.some((item) => item.id === 'soapstone' && item.equipped)).toBe(true);
  });

  it('consumes the soapstone and queues a purge of the chosen letter', () => {
    const { state } = start('purgamist-soapstone');
    setAnswer(state, 'crane');
    const stone = state.items.find((item) => item.id === 'soapstone');
    expect(stone).toBeDefined();

    const used = act(state, { type: 'useItem', instance: stone!.instance });
    expect(used.state.items.some((item) => item.id === 'soapstone')).toBe(false);
    expect(used.state.pendingPurge).toBe(1);

    const purged = act(used.state, { type: 'purgeLetter', letter: 'z' });
    expect(purged.state.pendingPurge).toBe(0);
    expect(purged.state.purged).toContain('z');
  });

  it('purges a random letter when resting at an inn with the Travel Inkwell', () => {
    const { state } = start('purgamist-inn');
    state.nodeIndex = 0;
    state.nodes[1] = { kind: 'shop', level: 1 };
    state.phase = 'shop';
    const arrived = act(state, { type: 'continue' });
    expect(arrived.state.phase).toBe('shopChoice');
    arrived.state.rng = 1; // no shop after resting

    const before = arrived.state.purged.length;
    const rested = act(arrived.state, { type: 'choose', optionId: 'inn' });
    expect(rested.state.purged.length).toBe(before + 1);
    expect(rested.events.some(
      (event) => event.type === 'itemProc'
        && event.item === 'travel-inkwell'
        && event.text.includes('purged'),
    )).toBe(true);
  });

  it('keeps both tools exclusive to the Purgamist', () => {
    for (const character of CHARACTERS) {
      const { state } = game.newRun({ seed: `purgamist-kit-${character.id}`, character: character.id });
      expect(state.items.some((item) => item.id === 'travel-inkwell'), character.id)
        .toBe(character.id === 'purgamist');
      expect(state.items.some((item) => item.id === 'soapstone'), character.id)
        .toBe(character.id === 'purgamist');
    }
  });
});
