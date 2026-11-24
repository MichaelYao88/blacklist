import { describe, expect, it } from 'vitest';
import { game } from '../src/game';
import { CHARACTERS, ITEM_BY_ID } from '../src/content';

function parrot(state: ReturnType<typeof game.newRun>['state']) {
  return state.items.find((item) => item.id === 'evil-parrot');
}

function suggestionOf(events: Array<{ type: string; word?: string }>): string | null {
  const event = events.find((entry) => entry.type === 'parrotSuggestion');
  return event?.word ?? null;
}

function sayingOf(events: Array<{ type: string; text?: string }>): string | null {
  const event = events.find((entry) => entry.type === 'parrotSays');
  return event?.text ?? null;
}

describe('Evil Parrot', () => {
  it('is a no-spawn 16g item that uses one slot and sells for 8', () => {
    const def = ITEM_BY_ID.get('evil-parrot');
    expect(def?.price).toBe(16);
    expect(def?.slots).toBe(1);
    expect(def?.noSpawn).toBe(true);
    expect(def?.unique).toBe(true);

    const { state } = game.newRun({ seed: 'parrot-value', character: 'runner' });
    const item = game.view(state).items.find((entry) => entry.id === 'evil-parrot');
    expect(item?.sellValue).toBe(8);
  });

  it('starts equipped for the four intended characters and nobody else', () => {
    const starts = ['runner', 'purgamist', 'necromancer', 'gourmand'];
    for (const character of starts) {
      const { state } = game.newRun({ seed: `parrot-start-${character}`, character });
      const item = parrot(state);
      expect(item, character).toBeDefined();
      expect(item?.equipped, character).toBe(true);
    }

    const others = CHARACTERS
      .map((character) => character.id)
      .filter((id) => !starts.includes(id));
    for (const character of others) {
      const { state } = game.newRun({ seed: `parrot-no-start-${character}`, character });
      expect(parrot(state), character).toBeUndefined();
    }
  });

  it('suggests on the round timer even when no clock is visible', () => {
    const { state } = game.newRun({ seed: 'parrot-timer', character: 'runner' });
    state.round!.remainingMs = null;
    state.round!.elapsedMs = 0;
    state.round!.answer = 'crane';
    parrot(state)!.data.readyAt = 1;

    const ticked = game.step(state, { type: 'tick', dtMs: 2 });
    expect(suggestionOf(ticked.events)).not.toBeNull();
    expect(ticked.state.round?.remainingMs).toBeNull();
  });

  it('does not suggest before 30 seconds', () => {
    const { state } = game.newRun({ seed: 'parrot-early', character: 'runner' });
    state.round!.remainingMs = null;
    state.round!.elapsedMs = 0;
    state.round!.answer = 'crane';

    const ticked = game.step(state, { type: 'tick', dtMs: 29_000 });
    expect(suggestionOf(ticked.events)).toBeNull();
  });

  it('resets its timer after a player guess, not a distant timer before one', () => {
    const { state } = game.newRun({ seed: 'parrot-reset', character: 'runner' });
    state.round!.answer = 'crane';
    parrot(state)!.data.readyAt = 1;

    const guessed = game.step(state, { type: 'guess', word: 'slate' });
    const after = parrot(guessed.state);
    expect(after?.data.readyAt).toBeGreaterThanOrEqual(30_000);
  });

  it('counts suggestions, losing 1 gold of sale value each until the floor of 0', () => {
    const { state } = game.newRun({ seed: 'parrot-count', character: 'runner' });
    state.round!.remainingMs = null;
    state.round!.elapsedMs = 0;
    state.round!.answer = 'crane';
    parrot(state)!.data.readyAt = 1;

    const ticked = game.step(state, { type: 'tick', dtMs: 2 });
    expect(suggestionOf(ticked.events)).not.toBeNull();
    const item = parrot(ticked.state)!;
    expect(item.data._suggestions).toBe(1);
    expect(game.view(ticked.state).items
      .find((entry) => entry.id === 'evil-parrot')?.sellValue).toBe(7);

    const gap = item.data.readyAt - (ticked.state.round?.elapsedMs ?? 0);
    expect(gap).toBeGreaterThanOrEqual(31_000);
    expect(gap).toBeLessThanOrEqual(61_000);

    item.data._suggestions = 20;
    expect(game.view(ticked.state).items
      .find((entry) => entry.id === 'evil-parrot')?.sellValue).toBe(0);
  });

  it('adds a second to the gap for every suggestion already given', () => {
    const { state } = game.newRun({ seed: 'parrot-gap', character: 'runner' });
    state.round!.answer = 'crane';
    state.round!.elapsedMs = 0;
    parrot(state)!.data._suggestions = 5;

    const guessed = game.step(state, { type: 'guess', word: 'slate' });
    const readyAt = parrot(guessed.state)?.data.readyAt ?? 0;
    expect(readyAt).toBeGreaterThanOrEqual(35_000);
    expect(readyAt).toBeLessThanOrEqual(65_000);
  });

  it('charges 1 gold for a cracker and suggests 60% of the time', () => {
    let suggestions = 0;
    let refusals = 0;
    for (let index = 0; index < 120; index++) {
      const { state } = game.newRun({ seed: `parrot-bribe-${index}`, character: 'runner' });
      state.gold = 5;
      state.round!.elapsedMs = 0;
      const item = parrot(state)!;
      item.data.readyAt = 1;

      const used = game.step(state, { type: 'useItem', instance: item.instance });
      expect(used.state.gold).toBe(4);

      const after = parrot(used.state)!;
      const gap = after.data.readyAt - (used.state.round?.elapsedMs ?? 0);
      if (suggestionOf(used.events)) {
        suggestions++;
        expect(after.data._suggestions).toBe(1);
        expect(gap).toBeGreaterThanOrEqual(31_000);
        expect(gap).toBeLessThanOrEqual(61_000);
      } else {
        refusals++;
        expect(sayingOf(used.events))
          .toBe('buy me another cracker, then maybe I\'ll tell you');
        expect(after.data._suggestions).toBe(0);
        expect(gap).toBeGreaterThanOrEqual(30_000);
        expect(gap).toBeLessThanOrEqual(60_000);
      }
    }
    expect(suggestions).toBeGreaterThan(50);
    expect(refusals).toBeGreaterThan(20);
    expect(suggestions + refusals).toBe(120);
  });

  it('refuses to charge or reset the timer without gold', () => {
    const { state } = game.newRun({ seed: 'parrot-broke', character: 'runner' });
    state.gold = 0;
    state.round!.elapsedMs = 0;
    const item = parrot(state)!;
    item.data.readyAt = 1;

    const used = game.step(state, { type: 'useItem', instance: item.instance });
    expect(used.state.gold).toBe(0);
    expect(parrot(used.state)?.data.readyAt).toBe(1);
    const messages = used.events
      .filter((event) => event.type === 'message')
      .map((event) => event.text);
    expect(messages.some((text) => text.includes('1 gold'))).toBe(true);
  });

  it('does nothing while in the bag', () => {
    const { state } = game.newRun({ seed: 'parrot-bag', character: 'runner' });
    state.round!.remainingMs = null;
    state.round!.elapsedMs = 0;
    state.round!.answer = 'crane';
    const item = parrot(state)!;
    item.equipped = false;
    item.data.readyAt = 1;

    const ticked = game.step(state, { type: 'tick', dtMs: 2 });
    expect(suggestionOf(ticked.events)).toBeNull();
  });

  it('suggests a wrong word when more than one answer is possible', () => {
    const { state } = game.newRun({ seed: 'parrot-wrong', character: 'runner' });
    state.round!.answer = 'crane';
    state.round!.guesses = [];
    state.round!.hints = {};
    state.round!.remainingMs = null;
    state.round!.elapsedMs = 0;
    parrot(state)!.data.readyAt = 1;

    const ticked = game.step(state, { type: 'tick', dtMs: 2 });
    expect(suggestionOf(ticked.events)).not.toBe('crane');
  });
});
