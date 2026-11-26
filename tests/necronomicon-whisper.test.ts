import { describe, expect, it } from 'vitest';
import { game } from '../src/game';
import { ITEM_BY_ID } from '../src/content';
import type { GameEvent, RunState } from '../src/core/types';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz'.split('');

function necroRun(seed: string): RunState {
  const { state } = game.newRun({ seed, character: 'necromancer' });
  state.round!.answer = 'crane';
  state.round!.remainingMs = null;
  state.round!.elapsedMs = 0;
  state.round!.parrotIdleMs = 0;
  const book = state.items.find((item) => item.id === 'necronomicon')!;
  book.data._idleMs = 0;
  book.data._whisperUsed = 0;
  return state;
}

function tickFor(state: RunState, ms: number): { state: RunState; events: GameEvent[] } {
  let current = state;
  const events: GameEvent[] = [];
  for (let elapsed = 0; elapsed < ms; elapsed += 1_000) {
    const result = game.step(current, { type: 'tick', dtMs: 1_000 });
    current = result.state;
    events.push(...result.events);
  }
  return { state: current, events };
}

function whispers(events: GameEvent[]) {
  return events.filter((event) => event.type === 'parrotSuggestion');
}

function book(state: RunState) {
  return state.items.find((item) => item.id === 'necronomicon')!;
}

describe('Necronomicon whisper', () => {
  it('keeps the Necromancer kit free of the parrot', () => {
    const { state } = game.newRun({ seed: 'necro-kit', character: 'necromancer' });
    expect(state.items.some((item) => item.id === 'necronomicon')).toBe(true);
    expect(state.items.some((item) => item.id === 'evil-parrot')).toBe(false);
  });

  it('describes the idle whisper', () => {
    expect(ITEM_BY_ID.get('necronomicon')?.description).toBe(
      'Use during a fight: lose 13% max HP for a random gift. The book grows stronger as you feed it. Once per round. After 66 idle seconds it whispers, taking 13% max HP.',
    );
  });

  it('does not whisper at 65 seconds but fires at 66', () => {
    const early = tickFor(necroRun('necro-65'), 65_000);
    expect(whispers(early.events)).toHaveLength(0);

    const onTime = tickFor(early.state, 1_000);
    expect(whispers(onTime.events)).toHaveLength(1);
    expect(whispers(onTime.events)[0]).toMatchObject({ source: 'necronomicon' });
  });

  it('takes ceil(13% max HP) and caps at 1 max HP', () => {
    const state = necroRun('necro-cost');
    state.maxHp = 31;
    state.hp = 31;
    const result = tickFor(state, 66_000);
    expect(whispers(result.events)).toHaveLength(1);
    expect(result.state.maxHp).toBe(26);
    expect(result.state.hp).toBe(26);
    expect(book(result.state).data.fed).toBe(5);
    expect(result.events.some((event) => (
      event.type === 'message' && event.text === 'The book takes something from you...'
    ))).toBe(true);

    const tiny = necroRun('necro-cost-tiny');
    tiny.maxHp = 1;
    tiny.hp = 1;
    const capped = tickFor(tiny, 66_000);
    expect(capped.state.maxHp).toBe(1);
    expect(capped.state.hp).toBe(1);
    expect(whispers(capped.events)).toHaveLength(1);
  });

  it('takes no HP when there is no possible clue word', () => {
    const state = necroRun('necro-no-word');
    state.maxHp = 31;
    state.hp = 31;
    state.purged = ALPHABET.slice();
    const result = tickFor(state, 66_000);
    expect(whispers(result.events)).toHaveLength(0);
    expect(result.state.maxHp).toBe(31);
    expect(result.state.hp).toBe(31);
  });

  it('fires once per idle stretch and waits for a player guess', () => {
    const first = tickFor(necroRun('necro-once'), 66_000);
    expect(whispers(first.events)).toHaveLength(1);

    const waiting = tickFor(first.state, 120_000);
    expect(whispers(waiting.events)).toHaveLength(0);

    const guessed = game.step(waiting.state, { type: 'guess', word: 'aback' });
    expect(game.step(guessed.state, { type: 'tick', dtMs: 1_000 }).events
      .some((event) => event.type === 'parrotSuggestion')).toBe(false);

    const again = tickFor(guessed.state, 66_000);
    expect(whispers(again.events)).toHaveLength(1);
  });

  it('resets idle on a player guess and not on a friend guess', () => {
    const state = necroRun('necro-guess-reset');
    book(state).data._idleMs = 65_000;
    const guessed = game.step(state, { type: 'guess', word: 'aback' });
    expect(book(guessed.state).data._idleMs).toBe(0);
    expect(whispers(tickFor(guessed.state, 65_000).events)).toHaveLength(0);

    const friend = necroRun('necro-friend-reset');
    book(friend).data._idleMs = 30_000;
    friend.spells = [{ instance: 's-phone', id: 'phone-friend' }];
    const cast = game.step(friend, { type: 'castSpell', instance: 's-phone' });
    expect(book(cast.state).data._idleMs).toBeGreaterThanOrEqual(30_000);
    const result = tickFor(cast.state, 36_000);
    expect(whispers(result.events)).toHaveLength(1);
  });

  it('does not count frozen time', () => {
    const state = necroRun('necro-frozen');
    state.round!.frozenUntilGuess = true;
    const frozen = tickFor(state, 80_000);
    expect(whispers(frozen.events)).toHaveLength(0);
    expect(book(frozen.state).data._idleMs).toBe(0);
  });

  it('never asks for gold when using the book itself', () => {
    const state = necroRun('necro-broke');
    state.gold = 0;
    const used = game.step(state, {
      type: 'useItem',
      instance: book(state).instance,
    });
    expect(used.state.gold).toBe(0);
    expect(used.events.some((event) => event.type === 'parrotSays')).toBe(false);
    expect(used.events.some((event) => (
      event.type === 'message' && event.text.includes('gold')
    ))).toBe(false);
  });
});
