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

function suggestionEventOf(
  events: Array<{ type: string; word?: string; flavor?: string }>,
): { word?: string; flavor?: string } | undefined {
  return events.find((entry) => entry.type === 'parrotSuggestion');
}

function bribeWithRng(rng: number) {
  const { state } = game.newRun({ seed: 'parrot-bribe-roll', character: 'runner' });
  state.gold = 5;
  state.round!.elapsedMs = 0;
  state.rng = rng;
  const item = parrot(state)!;
  item.data.readyAt = 1;
  return game.step(state, { type: 'useItem', instance: item.instance });
}

function nextRound(state: ReturnType<typeof game.newRun>['state']) {
  const index = state.nodeIndex;
  state.nodes[index + 1] = { kind: 'round', level: state.level + 1 };
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
  return game.step(state, { type: 'continue' });
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

  it('charges 1 gold for a cracker and usually suggests a word', () => {
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

  it('gives the 2% stupid-cracker suggestion', () => {
    const used = bribeWithRng(35);
    expect(used.state.gold).toBe(4);
    const event = suggestionEventOf(used.events);
    expect(event?.word).toBeTruthy();
    expect(event?.flavor).toBe('stupid-cracker');
    expect(parrot(used.state)?.data._suggestions).toBe(1);
    const gap = (parrot(used.state)?.data.readyAt ?? 0)
      - (used.state.round?.elapsedMs ?? 0);
    expect(gap).toBeGreaterThanOrEqual(31_000);
    expect(gap).toBeLessThanOrEqual(61_000);
  });

  it('rolls the exact 49/49/2 bands', () => {
    const stupid = bribeWithRng(7); // roll 1
    expect(suggestionEventOf(stupid.events)?.flavor).toBe('stupid-cracker');

    const firstNormal = bribeWithRng(183); // roll 2
    expect(suggestionEventOf(firstNormal.events)?.flavor).toBeUndefined();

    const lastNormal = bribeWithRng(10); // roll 50
    expect(suggestionEventOf(lastNormal.events)?.flavor).toBeUndefined();

    const refusal = bribeWithRng(11); // roll 51
    expect(suggestionEventOf(refusal.events)).toBeUndefined();
    expect(sayingOf(refusal.events))
      .toBe('buy me another cracker, then maybe I\'ll tell you');
  });

  it('gives a normal suggestion on the 49% band', () => {
    const used = bribeWithRng(200);
    expect(used.state.gold).toBe(4);
    const event = suggestionEventOf(used.events);
    expect(event?.word).toBeTruthy();
    expect(event?.flavor).toBeUndefined();
    expect(parrot(used.state)?.data._suggestions).toBe(1);
  });

  it('asks for another cracker on the 49% band', () => {
    const used = bribeWithRng(315);
    expect(used.state.gold).toBe(4);
    expect(suggestionEventOf(used.events)).toBeUndefined();
    expect(sayingOf(used.events))
      .toBe('buy me another cracker, then maybe I\'ll tell you');
    expect(parrot(used.state)?.data._suggestions).toBe(0);
    const gap = (parrot(used.state)?.data.readyAt ?? 0)
      - (used.state.round?.elapsedMs ?? 0);
    expect(gap).toBeGreaterThanOrEqual(30_000);
    expect(gap).toBeLessThanOrEqual(60_000);
  });

  it('gives one free word per round and only more when bribed', () => {
    const { state } = game.newRun({ seed: 'parrot-once', character: 'runner' });
    state.round!.remainingMs = null;
    state.round!.elapsedMs = 0;
    state.round!.answer = 'crane';
    const item = parrot(state)!;
    item.data.readyAt = 1;

    const first = game.step(state, { type: 'tick', dtMs: 2 });
    expect(suggestionOf(first.events)).not.toBeNull();
    expect(parrot(first.state)?.data._freeUsed).toBe(1);
    expect(parrot(first.state)?.data._suggestions).toBe(1);

    parrot(first.state)!.data.readyAt = 1;
    const second = game.step(first.state, { type: 'tick', dtMs: 2 });
    expect(suggestionOf(second.events)).toBeNull();

    second.state.gold = 5;
    second.state.rng = 200;
    const bribed = game.step(second.state, {
      type: 'useItem',
      instance: parrot(second.state)!.instance,
    });
    expect(suggestionOf(bribed.events)).not.toBeNull();
    expect(parrot(bribed.state)?.data._suggestions).toBe(2);
  });

  it('restores the free word at the start of the next round', () => {
    const { state } = game.newRun({ seed: 'parrot-next-round', character: 'runner' });
    parrot(state)!.data._freeUsed = 1;

    const next = nextRound(state);
    expect(parrot(next.state)?.data._freeUsed).toBe(0);
    const gap = (parrot(next.state)?.data.readyAt ?? 0)
      - (next.state.round?.elapsedMs ?? 0);
    expect(gap).toBeGreaterThanOrEqual(30_000);
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
