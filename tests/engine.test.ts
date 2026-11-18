import { describe, expect, it } from 'vitest';
import { game } from '../src/game';
import type {
  Command,
  GameEvent,
  RunNode,
  RunState,
  ShopState,
  StepResult,
} from '../src/game';
import {
  CONTENT,
  CURSE_BY_ID,
  FOOD_BY_ID,
  HAPPENING_BY_ID,
  ITEM_BY_ID,
  SPELL_BY_ID,
  SPELLS,
} from '../src/content';

function start(seed = 'test-seed', ascension = 0): StepResult {
  return game.newRun({ seed, ascension });
}

function act(state: RunState, cmd: Command): StepResult {
  return game.step(state, cmd);
}

function setAnswer(state: RunState, word: string): void {
  if (!state.round) throw new Error('not in a round');
  state.round.answer = word;
  state.round.guesses = [];
}

function eventTypes(events: GameEvent[]): string[] {
  return events.map((event) => event.type);
}

function shopState(offers: ShopState['offers'] = []): ShopState {
  return {
    offers,
    rerollCost: 2,
    rerolls: 0,
    purchases: 0,
    visit: 0,
    foodOffers: offers.filter((offer) => offer.kind === 'eat').length,
    foodsBought: 0,
  };
}

function nodeAt(state: RunState, predicate: (node: RunNode) => boolean): number {
  return state.nodes.findIndex(predicate);
}

function nextRound(state: RunState): StepResult {
  const index = state.nodeIndex;
  state.nodeIndex = index;
  state.nodes[index + 1] = { kind: 'round', level: state.level + 1 };
  state.phase = 'shop';
  state.shop = shopState();
  return act(state, { type: 'continue' });
}

/** Force the next node to be a happening and resolve it. */
function nextHappening(state: RunState): StepResult {
  state.nodeIndex = 0;
  state.nodes[1] = { kind: 'happening', level: 1 };
  state.phase = 'shop';
  state.shop = shopState();
  return act(state, { type: 'continue' });
}

describe('cursed run setup', () => {
  it('starts at level 1 with no clock, blacklist or curses', () => {
    const { state, events } = start();
    expect(state.phase).toBe('round');
    expect(state.level).toBe(1);
    expect(state.hp).toBe(16);
    expect(state.maxHp).toBe(16);
    expect(state.armor).toBe(2);
    expect(state.gold).toBe(10);
    expect(state.slots).toBe(5);
    expect(state.blacklist).toEqual([]);
    expect(state.curses).toEqual([]);
    expect(state.spells).toHaveLength(1);
    expect(SPELLS.some((spell) => spell.id === state.spells[0].id)).toBe(true);
    expect(state.round?.remainingMs).toBeNull();
    expect(state.round?.baseDamage).toBe(3);
    expect(eventTypes(events)).toContain('runStarted');
  });

  it('builds a 50-level map with 25 curse drafts and one final boss', () => {
    const { state } = start();
    expect(nodeAt(state, (node) => node.kind === 'boss')).toBeGreaterThan(0);
    expect(state.nodes.filter((node) => node.kind === 'boss')).toHaveLength(1);
    expect(state.nodes.filter((node) => node.kind === 'curse')).toHaveLength(25);
    expect(state.nodes.find((node) => node.kind === 'boss')?.level).toBe(50);
    expect(state.nodes.some((node) => node.kind === 'curse' && node.level === 47)).toBe(true);
    expect(state.nodes.some((node) => node.kind === 'curse' && node.level === 49)).toBe(true);
  });

  it('opens a starting curse draft for Ascension 1 and 2', () => {
    const one = start('asc1', 1);
    expect(one.state.phase).toBe('curse');
    expect(one.state.pendingStartingCurses).toBe(1);
    expect(game.view(one.state).phase.kind).toBe('curse');

    const two = start('asc2', 2);
    expect(two.state.pendingStartingCurses).toBe(2);
    const view = game.view(two.state);
    if (view.phase.kind === 'curse') {
      expect(view.phase.options).toHaveLength(2);
    }
  });
});

describe('curse drafting', () => {
  it('offers two curses on a curse node and applies the chosen one', () => {
    const { state } = start();
    const curseIndex = nodeAt(state, (node) => node.kind === 'curse');
    state.nodeIndex = curseIndex - 1;
    state.phase = 'shop';
    state.shop = shopState();

    const draft = act(state, { type: 'continue' });
    expect(draft.state.phase).toBe('curse');
    const phase = game.view(draft.state).phase;
    if (phase.kind !== 'curse') throw new Error('expected curse phase');
    expect(phase.options).toHaveLength(2);

    const chosen = act(draft.state, { type: 'chooseCurse', curseId: phase.options[0] });
    expect(chosen.state.curses).toHaveLength(1);
    expect(chosen.state.phase).not.toBe('curse');
  });

  it('can draft starting curses until Ascension is paid', () => {
    const first = start('starting-curses', 2);
    const phase = game.view(first.state).phase;
    if (phase.kind !== 'curse') throw new Error('expected curse phase');
    const second = act(first.state, { type: 'chooseCurse', curseId: phase.options[0] });
    expect(second.state.pendingStartingCurses).toBe(1);
    const next = game.view(second.state).phase;
    if (next.kind !== 'curse') throw new Error('expected second curse phase');
    const third = act(second.state, { type: 'chooseCurse', curseId: next.options[0] });
    expect(third.state.pendingStartingCurses).toBe(0);
    expect(third.state.phase).toBe('round');
  });
});

describe('vision curses and Tally Lens', () => {
  it('hides the first tile with Censor and shows counts with Tally Lens', () => {
    const { state } = start();
    setAnswer(state, 'crane');
    state.curses.push({ id: 'censor', stacks: 1 });
    state.items.push({ instance: 'i-tally', id: 'tally-lens', data: {}, equipped: true });

    const guess = act(state, { type: 'guess', word: 'slate' });
    const view = game.view(guess.state);
    if (view.phase.kind !== 'round') throw new Error('expected round');
    expect(view.phase.board.guesses[0].tiles[0]).toBe('hidden');
    expect(view.phase.board.guesses[0].counts).toBeDefined();
  });

  it('hides letters from LA, TS, RIP, D and E curses', () => {
    const { state } = start();
    setAnswer(state, 'crane');
    state.curses.push({ id: 'la-curse', stacks: 1 });
    state.curses.push({ id: 'ts-curse', stacks: 1 });
    state.curses.push({ id: 'rip-curse', stacks: 1 });
    state.curses.push({ id: 'without-d', stacks: 1 });
    state.curses.push({ id: 'e-curse', stacks: 1 });

    const guess = act(state, { type: 'guess', word: 'trade' });
    const view = game.view(guess.state);
    if (view.phase.kind !== 'round') throw new Error('expected round');
    const tiles = view.phase.board.guesses[0].tiles;
    expect(tiles[0]).toBe('hidden');
    expect(tiles[1]).toBe('hidden');
    expect(tiles[2]).toBe('hidden');
    expect(tiles[3]).toBe('hidden');
    expect(tiles[4]).toBe('hidden');
  });
});

describe('blacklist curse', () => {
  it('does nothing until The List is taken', () => {
    const control = start();
    setAnswer(control.state, 'crane');
    const guess = act(control.state, { type: 'guess', word: 'slate' });
    expect(guess.state.blacklist).toEqual([]);

    const listed = start('listed');
    setAnswer(listed.state, 'crane');
    listed.state.curses.push({ id: 'the-list', stacks: 1 });
    const first = act(listed.state, { type: 'guess', word: 'pious' });
    expect(first.state.blacklist).toContain('pious');
  });

  it('comes with every earlier first guess when taken', () => {
    const { state } = start();
    setAnswer(state, 'crane');
    const first = act(state, { type: 'guess', word: 'slate' });
    expect(first.state.firstGuesses).toContain('slate');
    first.state.firstGuesses.push('pious');
    first.state.curse = { options: ['the-list'], starting: false };
    first.state.phase = 'curse';
    const chosen = act(first.state, { type: 'chooseCurse', curseId: 'the-list' });
    expect(chosen.state.blacklist).toEqual(['slate', 'pious']);
  });

  it('does not stack and only lists the first guess', () => {
    expect(CURSE_BY_ID.get('the-list')?.maxStacks).toBe(1);
    expect(CURSE_BY_ID.get('the-list')?.description).not.toContain('stack');
    expect(CURSE_BY_ID.get('the-list')?.rules.join(' ')).not.toContain('stack');
    const { state } = start();
    setAnswer(state, 'crane');
    // Simulate an old save that still carries extra stacks.
    state.curses.push({ id: 'the-list', stacks: 2 });
    const first = act(state, { type: 'guess', word: 'slate' });
    const second = act(first.state, { type: 'guess', word: 'pious' });
    expect(second.state.blacklist).toEqual(['slate']);
  });
});

describe('damage and curses', () => {
  it('base damage is 3 plus curse stacks, and Heavy Hand doubles per stack', () => {
    const { state } = start();
    expect(state.round?.baseDamage).toBe(3);
    state.curses.push({ id: 'heavy-hand', stacks: 2 });
    const next = nextRound(state);
    expect(next.state.round?.baseDamage).toBe(20);
  });

  it('raises base damage by 1 for every curse stack', () => {
    const { state } = start('curse-damage');
    state.curses.push({ id: 'censor', stacks: 1 });
    state.curses.push({ id: 'clock', stacks: 1 });
    expect(nextRound(state).state.round?.baseDamage).toBe(5);
  });

  it('Porcupine counts greens in the latest guess', () => {
    const { state } = start('porcupine');
    state.curses.push({ id: 'porcupine', stacks: 1 });
    const next = nextRound(state);
    setAnswer(next.state, 'crane');
    next.state.round!.freeLeft = 0;
    next.state.armor = 0;
    const guess = act(next.state, { type: 'guess', word: 'slate' });
    expect(guess.state.hp).toBe(8);
  });

  it('Clumsy does not stack', () => {
    expect(CURSE_BY_ID.get('clumsy')?.maxStacks).toBe(1);
    expect(CURSE_BY_ID.get('clumsy')?.description).not.toContain('stack');
    expect(CURSE_BY_ID.get('clumsy')?.rules.join(' ')).not.toContain('stack');
  });

  it('sleeper tiers add green and yellow damage', () => {
    expect(CURSE_BY_ID.get('sleeper')?.damageTiers).toHaveLength(3);
  });
});

describe('timer curses', () => {
  it('starts at 5:00 and loses 20% per extra Clock stack', () => {
    const { state } = start();
    state.curses.push({ id: 'clock', stacks: 1 });
    const first = nextRound(state);
    expect(first.state.round?.remainingMs).toBe(300_000);

    first.state.curses[0].stacks = 2;
    const second = nextRound(first.state);
    expect(second.state.round?.remainingMs).toBe(240_000);
  });

  it('shows count-up time when a timer-interest item is equipped', () => {
    const { state } = start();
    state.items.push({ instance: 'i-early', id: 'early-bird', data: {}, equipped: true });
    const view = game.view(state);
    if (view.phase.kind !== 'round') throw new Error('expected round');
    expect(view.phase.board.timerMode).toBe('countup');
  });

  it('turns Time Freeze into a free guess when there is no clock', () => {
    const { state } = start();
    setAnswer(state, 'crane');
    state.round!.freeLeft = 0;
    state.armor = 0;
    state.spells.push({ instance: 's-freeze', id: 'time-freeze' });
    const cast = act(state, { type: 'castSpell', instance: 's-freeze' });
    expect(cast.state.round?.frozenUntilGuess).toBe(false);
    const guess = act(cast.state, { type: 'guess', word: 'tiger' });
    expect(guess.state.hp).toBe(16);
    expect(guess.state.round?.guesses.at(-1)?.free).toBe(true);
  });

  it('makes Phone a Friend add five seconds instead of freezing the clock', () => {
    const { state } = start();
    state.curses.push({ id: 'clock', stacks: 1 });
    const next = nextRound(state);
    next.state.spells.push({ instance: 's-phone', id: 'phone-friend' });
    if (!next.state.round) throw new Error('expected round');
    next.state.round.answer = 'zzzzz';
    const cast = act(next.state, { type: 'castSpell', instance: 's-phone' });
    expect(cast.state.round?.frozenMs).toBe(0);
    expect(cast.state.round?.frozenUntilGuess).toBe(false);
    expect(cast.state.round?.remainingMs).toBe(305_000);
  });
});

describe('shop curses', () => {
  it('Sparse Shelves removes one item and one food', () => {
    const { state } = start('sparse-seed');
    state.nodeIndex = 0;
    state.nodes[1] = { kind: 'shop', level: 1 };
    state.phase = 'shop';
    const control = act(state, { type: 'continue' });
    const controlOffers = control.state.shop?.offers ?? [];

    const cursed = start('sparse-seed');
    cursed.state.curses.push({ id: 'sparse-shelves', stacks: 2 });
    cursed.state.nodeIndex = 0;
    cursed.state.nodes[1] = { kind: 'shop', level: 1 };
    cursed.state.phase = 'shop';
    const sparse = act(cursed.state, { type: 'continue' });
    const sparseOffers = sparse.state.shop?.offers ?? [];

    expect(sparseOffers.filter((offer) => offer.kind === 'item').length)
      .toBeLessThan(controlOffers.filter((offer) => offer.kind === 'item').length);
    expect(sparseOffers.filter((offer) => offer.kind === 'eat').length)
      .toBeLessThan(controlOffers.filter((offer) => offer.kind === 'eat').length);
  });

  it('never offers clock-gated items or foods without The Clock', () => {
    const gatedItems = new Set(
      [...ITEM_BY_ID.values()]
        .filter((item) => item.requiresClock)
        .map((item) => item.id),
    );
    expect(gatedItems.size).toBeGreaterThan(0);
    expect(gatedItems.has('ticking-fee')).toBe(true);

    let sawGatedItem = false;
    let sawGatedFood = false;
    for (let index = 0; index < 40; index++) {
      const { state } = start(`clock-gate-${index}`);
      state.nodeIndex = 0;
      state.nodes[1] = { kind: 'shop', level: 1 };
      state.phase = 'shop';
      const result = act(state, { type: 'continue' });
      for (const offer of result.state.shop?.offers ?? []) {
        if (offer.kind === 'item' && gatedItems.has(offer.def)) sawGatedItem = true;
        if (offer.kind === 'eat' && FOOD_BY_ID.get(offer.def)?.requiresClock) sawGatedFood = true;
      }
    }
    expect(sawGatedItem).toBe(false);
    expect(sawGatedFood).toBe(false);

    let sawUnlocked = false;
    for (let index = 0; index < 40 && !sawUnlocked; index++) {
      const { state } = start(`clock-open-${index}`);
      state.curses.push({ id: 'clock', stacks: 1 });
      state.nodeIndex = 0;
      state.nodes[1] = { kind: 'shop', level: 1 };
      state.phase = 'shop';
      const result = act(state, { type: 'continue' });
      if ((result.state.shop?.offers ?? []).some(
        (offer) => offer.kind === 'item' && gatedItems.has(offer.def),
      )) {
        sawUnlocked = true;
      }
    }
    expect(sawUnlocked).toBe(true);
  });

  it('the Curse Broker charges 12 gold for a relic', () => {
    const { state } = start();
    state.curses.push({ id: 'censor', stacks: 1 });
    state.phase = 'happening';
    state.happening = { id: 'curse-broker', options: [] };
    state.gold = 20;

    const bought = act(state, { type: 'choose', optionId: 'relic' });
    expect(bought.state.gold).toBe(8);
    expect(bought.state.items.some((item) => ITEM_BY_ID.get(item.id)?.rarity === 'rare')).toBe(true);
  });

  it('the Curse Broker refuses when you cannot pay', () => {
    const { state } = start();
    state.curses.push({ id: 'censor', stacks: 1 });
    state.phase = 'happening';
    state.happening = { id: 'curse-broker', options: [] };
    state.gold = 5;

    const bought = act(state, { type: 'choose', optionId: 'relic' });
    expect(bought.state.gold).toBe(5);
    expect(bought.state.maxArmor).toBe(2);
    expect(bought.state.items.some((item) => ITEM_BY_ID.get(item.id)?.rarity === 'rare')).toBe(false);
    expect(eventTypes(bought.events)).toContain('message');
  });

  it('the Curse Broker can remove a chosen curse', () => {
    const { state } = start();
    state.curses.push({ id: 'censor', stacks: 1 });
    state.phase = 'happening';
    state.happening = { id: 'curse-broker', options: [] };
    state.gold = 200;

    const bought = act(state, { type: 'choose', optionId: 'remove' });
    expect(bought.state.gold).toBe(185);
    expect(bought.state.pendingCurseRemoval).toBe(1);
    const removed = act(bought.state, { type: 'removeCurse', curseId: 'censor' });
    expect(removed.state.curses).toEqual([]);
    expect(removed.state.pendingCurseRemoval).toBe(0);
  });

  it('The Chained blocks selling', () => {
    const { state } = start();
    state.phase = 'shop';
    state.shop = shopState();
    state.curses.push({ id: 'chained', stacks: 1 });
    state.items.push({ instance: 'i-hour', id: 'hourglass', data: {}, equipped: true });
    const sold = act(state, { type: 'sell', instance: 'i-hour' });
    expect(sold.state.items).toHaveLength(1);
    expect(eventTypes(sold.events)).toContain('message');
  });
});

describe('clock-gated happenings', () => {
  it('never offers The Clockmaker without The Clock', () => {
    for (let index = 0; index < 80; index++) {
      const result = nextHappening(start(`no-clockmaker-${index}`).state);
      expect(result.state.happening?.id).not.toBe('clockmaker');
    }
  });

  it('offers The Clockmaker once a clock exists', () => {
    let seen = false;
    for (let index = 0; index < 80 && !seen; index++) {
      const { state } = start(`clockmaker-${index}`);
      state.curses.push({ id: 'clock', stacks: 1 });
      const result = nextHappening(state);
      if (result.state.happening?.id === 'clockmaker') seen = true;
    }
    expect(seen).toBe(true);
  });
});

describe('curse-triggered items', () => {
  it('fires the former boss items when a curse is gained', () => {
    const { state } = start();
    state.items.push(
      { instance: 'i-trophy-hunter', id: 'trophy-hunter', data: {}, equipped: true },
      { instance: 'i-boss-trophy', id: 'boss-trophy', data: {}, equipped: true },
      { instance: 'i-boss-aegis', id: 'boss-aegis', data: {}, equipped: true },
      { instance: 'i-trophy-room', id: 'trophy-room', data: {}, equipped: true },
    );
    state.curse = { options: ['censor'], starting: false };
    state.phase = 'curse';
    const chosen = act(state, { type: 'chooseCurse', curseId: 'censor' });
    expect(chosen.state.maxHp).toBe(20);
    expect(chosen.state.maxArmor).toBe(4);
    expect(chosen.state.slots).toBe(6);
    expect(chosen.state.spells).toHaveLength(2);
  });

  it('describes all of them as Gain a curse', () => {
    for (const id of ['trophy-hunter', 'boss-trophy', 'boss-aegis', 'trophy-room']) {
      expect(ITEM_BY_ID.get(id)?.description.startsWith('Whenever you gain a curse: Gain ')).toBe(true);
      expect(ITEM_BY_ID.get(id)?.name).not.toMatch(/boss|trophy/i);
    }
  });
});

describe('item and food batch', () => {
  it('Field Kit reveals 2 letters that are not in the word', () => {
    const { state } = start('field-kit');
    state.items.push({ instance: 'i-kit', id: 'field-kit', data: {}, equipped: true });
    const next = nextRound(state);
    const round = next.state.round;
    if (!round) throw new Error('expected round');
    const hints = Object.entries(round.hints);
    expect(hints).toHaveLength(2);
    for (const [letter, status] of hints) {
      expect(status).toBe('absent');
      expect(round.answer).not.toContain(letter);
    }
  });

  it('Old McDonald makes a free EIEIO guess at round start', () => {
    const { state } = start('old-mcdonald');
    state.items.push({ instance: 'i-mac', id: 'old-mcdonald', data: {}, equipped: true });
    const next = nextRound(state);
    const guess = next.state.round?.guesses.find((entry) => entry.word === 'eieio');
    expect(guess).toBeDefined();
    expect(guess?.free).toBe(true);
    expect(next.state.hp).toBe(16);
    expect(ITEM_BY_ID.get('old-mcdonald')?.rarity).toBe('rare');
    expect(ITEM_BY_ID.get('old-mcdonald')?.price).toBe(24);
  });

  it('removes the damage cap and prices letter foods by rarity', () => {
    expect(ITEM_BY_ID.get('hard-hat')).toBeUndefined();
    expect(FOOD_BY_ID.get('x-ray')?.price).toBe(8);
    expect(FOOD_BY_ID.get('q-tip')?.price).toBe(8);
    expect(FOOD_BY_ID.get('i-spy')?.effects)
      .toContainEqual({ type: 'revealLetter', letter: 'i' });
    expect(FOOD_BY_ID.get('reveal-the-d')?.effects)
      .toContainEqual({ type: 'revealLetter', letter: 'd' });
    expect(FOOD_BY_ID.get('yin-yang')?.effects).toEqual([
      { type: 'revealLetter', letter: 'y' },
      { type: 'revealLetter', letter: 'n' },
    ]);
  });
});

describe('scaling gold items', () => {
  it('pays 5 gold, then 7, then 9 for solves within 3 guesses', () => {
    const { state } = start('hat-trick');
    state.items.push({ instance: 'i-hat', id: 'hat-trick', data: { gold: 5 }, equipped: true });
    setAnswer(state, 'crane');

    const first = act(state, { type: 'guess', word: 'crane' });
    expect(first.state.gold).toBe(23);
    expect(first.state.items.find((item) => item.id === 'hat-trick')?.data.gold).toBe(7);

    const second = nextRound(first.state);
    setAnswer(second.state, 'crane');
    const secondSolve = act(second.state, { type: 'guess', word: 'crane' });
    expect(secondSolve.state.gold).toBe(38);
    expect(secondSolve.state.items.find((item) => item.id === 'hat-trick')?.data.gold).toBe(9);
  });

  it('does not pay on the fourth guess', () => {
    const { state } = start('hat-trick-slow');
    state.items.push({ instance: 'i-hat', id: 'hat-trick', data: { gold: 5 }, equipped: true });
    if (!state.round) throw new Error('expected round');
    setAnswer(state, 'crane');
    state.round.totalGuesses = 3;

    const solve = act(state, { type: 'guess', word: 'crane' });
    expect(solve.state.gold).toBeGreaterThanOrEqual(15);
    expect(solve.state.gold).toBeLessThanOrEqual(18);
    expect(solve.state.items.find((item) => item.id === 'hat-trick')?.data.gold).toBe(5);
  });

  it('describes the live payout', () => {
    const def = ITEM_BY_ID.get('hat-trick');
    expect(def?.rarity).toBeUndefined();
    expect(def?.description).toContain('gain 1 gold');
    expect(def?.dynamicDescription?.({ gold: 9 })).toContain('gain 9 gold');
  });
});

describe('new item and event batch', () => {
  it('pays 8 on a quick solve and 5-8 otherwise', () => {
    const fast = start('gold-fast');
    setAnswer(fast.state, 'crane');
    const quick = act(fast.state, { type: 'guess', word: 'crane' });
    expect(quick.state.gold).toBe(18);

    for (let index = 0; index < 20; index++) {
      const { state } = start(`gold-slow-${index}`);
      if (!state.round) throw new Error('expected round');
      setAnswer(state, 'crane');
      state.round.totalGuesses = 3;
      const slow = act(state, { type: 'guess', word: 'crane' });
      expect(slow.state.gold).toBeGreaterThanOrEqual(15);
      expect(slow.state.gold).toBeLessThanOrEqual(18);
    }
  });

  it('Brace pays 2 max armor, Bloom grows max HP, Patch Kit heals 30% +1', () => {
    const brace = start('brace');
    brace.state.items.push({ instance: 'i-brace', id: 'brace', data: {}, equipped: true });
    setAnswer(brace.state, 'crane');
    const braced = act(brace.state, { type: 'guess', word: 'crane' });
    expect(braced.state.maxArmor).toBe(4);

    const bloom = start('bloom');
    bloom.state.items.push({ instance: 'i-bloom', id: 'bloom', data: { hp: 5 }, equipped: true });
    setAnswer(bloom.state, 'crane');
    const grown = act(bloom.state, { type: 'guess', word: 'crane' });
    expect(grown.state.maxHp).toBe(21);
    expect(grown.state.items.find((item) => item.id === 'bloom')?.data.hp).toBe(6);
    const bloomNext = nextRound(grown.state);
    setAnswer(bloomNext.state, 'crane');
    const grownAgain = act(bloomNext.state, { type: 'guess', word: 'crane' });
    expect(grownAgain.state.maxHp).toBe(27);

    const patch = start('patch-kit');
    patch.state.items.push({ instance: 'i-patch', id: 'patch-kit', data: {}, equipped: true });
    patch.state.hp = 10;
    setAnswer(patch.state, 'crane');
    const patched = act(patch.state, { type: 'guess', word: 'crane' });
    expect(patched.state.hp).toBe(16);
  });

  it('Doggy Bag reveals 2 absent letters and queues 1 after eating', () => {
    const { state } = start('doggy-bag');
    state.items.push({ instance: 'i-dog', id: 'doggy-bag', data: {}, equipped: true });
    state.phase = 'shop';
    state.gold = 50;
    state.shop = shopState([{ id: 'o0', kind: 'eat', def: 'snack', price: 3 }]);
    const eaten = act(state, { type: 'buy', offerId: 'o0' });
    expect(eaten.state.pendingAbsent).toBe(1);

    const next = nextRound(eaten.state);
    const round = next.state.round;
    if (!round) throw new Error('expected round');
    const hints = Object.entries(round.hints);
    expect(hints).toHaveLength(3);
    for (const [letter, status] of hints) {
      expect(status).toBe('absent');
      expect(round.answer).not.toContain(letter);
    }
  });

  it('Bottomless starts at +4 max armor and has a 20% eat chance', () => {
    const { state } = start('bottomless');
    state.phase = 'shop';
    state.gold = 100;
    state.shop = shopState([{ id: 'o0', kind: 'item', def: 'bottomless', price: 12 }]);
    const bought = act(state, { type: 'buy', offerId: 'o0' });
    expect(bought.state.maxArmor).toBe(6);
    expect(ITEM_BY_ID.get('bottomless')?.description)
      .toContain('20% chance of +1 max armor');
  });

  it('stops offering food that permanently revealed its letter', () => {
    const { state } = start('gg-repeat');
    state.permanentReveals.push('g');
    for (let index = 0; index < 50; index++) {
      state.nodeIndex = 0;
      state.nodes[1] = { kind: 'shop', level: 1 };
      state.phase = 'shop';
      const shop = act(state, { type: 'continue' }).state.shop;
      expect(shop?.offers.some((offer) => offer.def === 'gg-gum')).toBe(false);
    }
  });

  it('Tight Slots removes 2 slots and bags the overflow', () => {
    const { state } = start('tight-slots');
    for (let index = 0; index < 5; index++) {
      state.items.push({
        instance: `i-hour-${index}`,
        id: 'hourglass',
        data: {},
        equipped: true,
      });
    }
    state.curse = { options: ['tight-slots'], starting: false };
    state.phase = 'curse';
    const cursed = act(state, { type: 'chooseCurse', curseId: 'tight-slots' });
    expect(cursed.state.slots).toBe(3);
    expect(cursed.state.items.filter((item) => item.equipped)).toHaveLength(3);
    expect(cursed.state.items.filter((item) => !item.equipped)).toHaveLength(2);
  });

  it('never offers more than 2 copies of a shop entry, and does offer duplicates', () => {
    let sawDuplicate = false;
    for (let index = 0; index < 300; index++) {
      const { state } = start(`shop-dupes-${index}`);
      state.nodeIndex = 0;
      state.nodes[1] = { kind: 'shop', level: 1 };
      state.phase = 'shop';
      const shop = act(state, { type: 'continue' }).state.shop;
      const counts = new Map<string, number>();
      for (const offer of shop?.offers ?? []) {
        const key = `${offer.kind}:${offer.def}`;
        const count = (counts.get(key) ?? 0) + 1;
        counts.set(key, count);
        expect(count).toBeLessThanOrEqual(2);
        if (count === 2) sawDuplicate = true;
      }
    }
    expect(sawDuplicate).toBe(true);
  });

  it('The Endless Table fires on-eat effects 7 times', () => {
    const { state } = start('endless-table');
    state.items.push({ instance: 'i-gour', id: 'gourmand', data: {}, equipped: true });
    state.phase = 'happening';
    state.happening = { id: 'endless-table', options: [] };
    const eaten = act(state, { type: 'choose', optionId: 'eat' });
    expect(eaten.state.maxHp).toBe(23);
  });

  it('Pen Club pays a random 1-5 gold', () => {
    const { state } = start('pen-club');
    state.items.push({ instance: 'i-pen', id: 'pen-club', data: {}, equipped: true });
    setAnswer(state, 'crane');
    const guess = act(state, { type: 'guess', word: 'penal' });
    expect(guess.state.gold).toBeGreaterThanOrEqual(11);
    expect(guess.state.gold).toBeLessThanOrEqual(15);
  });

  it('Gourmand gains 1 max HP on eat or spell cast', () => {
    const eater = start('gourmand-eat');
    eater.state.items.push({ instance: 'i-gour', id: 'gourmand', data: {}, equipped: true });
    eater.state.phase = 'shop';
    eater.state.gold = 50;
    eater.state.shop = shopState([{ id: 'o0', kind: 'eat', def: 'snack', price: 3 }]);
    const eaten = act(eater.state, { type: 'buy', offerId: 'o0' });
    expect(eaten.state.maxHp).toBe(17);

    const caster = start('gourmand-cast');
    caster.state.items.push({ instance: 'i-gour', id: 'gourmand', data: {}, equipped: true });
    caster.state.spells.push({ instance: 's-omen', id: 'omen' });
    const cast = act(caster.state, { type: 'castSpell', instance: 's-omen' });
    expect(cast.state.maxHp).toBe(17);
  });

  it('Big Belt gains a slot every 5 eats or solves', () => {
    const { state } = start('big-belt');
    state.items.push({ instance: 'i-belt', id: 'big-belt', data: { progress: 0 }, equipped: true });
    state.phase = 'shop';
    state.gold = 100;
    state.shop = shopState([
      { id: 'f0', kind: 'eat', def: 'snack', price: 3 },
      { id: 'f1', kind: 'eat', def: 'snack', price: 3 },
      { id: 'f2', kind: 'eat', def: 'snack', price: 3 },
      { id: 'f3', kind: 'eat', def: 'snack', price: 3 },
      { id: 'f4', kind: 'eat', def: 'snack', price: 3 },
    ]);
    let current = state;
    for (const id of ['f0', 'f1', 'f2', 'f3']) {
      current = act(current, { type: 'buy', offerId: id }).state;
      expect(current.slots).toBe(5);
    }
    current = act(current, { type: 'buy', offerId: 'f4' }).state;
    expect(current.slots).toBe(6);

    const solver = start('big-belt-solve');
    solver.state.items.push({
      instance: 'i-belt-solve',
      id: 'big-belt',
      data: { progress: 4 },
      equipped: true,
    });
    setAnswer(solver.state, 'crane');
    const solved = act(solver.state, { type: 'guess', word: 'crane' });
    expect(solved.state.slots).toBe(6);
  });

  it('Bulk Order converts its +1 armor into max armor', () => {
    const { state } = start('bulk-order');
    state.items.push({ instance: 'i-bulk', id: 'bulk-order', data: { _visit: -1 }, equipped: true });
    state.phase = 'shop';
    state.gold = 100;
    state.shop = shopState([
      { id: 'f0', kind: 'eat', def: 'snack', price: 3 },
      { id: 'f1', kind: 'eat', def: 'feast', price: 5 },
    ]);
    let current = state;
    current = act(current, { type: 'buy', offerId: 'f0' }).state;
    current = act(current, { type: 'buy', offerId: 'f1' }).state;
    expect(current.maxHp).toBe(23);
    expect(current.maxArmor).toBe(3);
  });

  it('applies the tuned content text and values', () => {
    expect(FOOD_BY_ID.get('gg-gum')?.effects)
      .toContainEqual({ type: 'revealLetter', letter: 'g' });
    expect(FOOD_BY_ID.get('gumdrop')?.price).toBe(3);
    expect(FOOD_BY_ID.get('bitter-root')?.effects)
      .toContainEqual({ type: 'maxArmor', delta: 1 });
    expect(FOOD_BY_ID.get('bitter-root')?.effects)
      .not.toContainEqual({ type: 'armor', delta: 1 });
    expect(ITEM_BY_ID.get('growth-spurt')?.description).toContain('+2 max HP');
    expect(ITEM_BY_ID.get('bulk-order')?.description).toContain('+1 max armor');
    expect(CURSE_BY_ID.get('porcupine')?.damagePerGreen).toBe(2);
    expect(CURSE_BY_ID.get('tight-slots')?.slotDelta).toBe(-2);
    expect(SPELL_BY_ID.get('restore')?.description)
      .toBe('Refill armor and clear the blacklist.');
    expect(ITEM_BY_ID.get('siphon')?.description).toContain('4 HP');
    expect(ITEM_BY_ID.get('gourmand')?.description).toContain('On spell cast or food eaten');
    expect(ITEM_BY_ID.get('pen-club')?.description).toContain('1-5 gold');
    expect(ITEM_BY_ID.get('big-belt')?.description).toContain('Every 5 eats or solves');
    expect(ITEM_BY_ID.get('miser')).toBeUndefined();
    expect(ITEM_BY_ID.get('plate-timer')?.requiresClock).toBe(true);
    expect(ITEM_BY_ID.get('solo-note')?.description)
      .toContain('one yellow and no green');
    expect(ITEM_BY_ID.get('four-leaf-clover')?.description).toContain('20%');

    const table = HAPPENING_BY_ID.get('endless-table');
    expect(table?.options).toHaveLength(2);
    expect(table?.options[0].outcomes[0].effects)
      .toContainEqual({ type: 'eatBurst', count: 7 });
    expect(table?.options[1].outcomes[0].effects)
      .toContainEqual({ type: 'gold', amount: 7 });
  });
});

describe('latest balance pass', () => {
  it('removes Lucky Charm, Second Stomach and Preserves', () => {
    expect(ITEM_BY_ID.get('lucky-charm')).toBeUndefined();
    expect(ITEM_BY_ID.get('second-stomach')).toBeUndefined();
    expect(ITEM_BY_ID.get('preserves')).toBeUndefined();
    expect(ITEM_BY_ID.get('piggy-bank')).toBeUndefined();
    expect(ITEM_BY_ID.get('blacklist-scholar')).toBeUndefined();
    expect(ITEM_BY_ID.get('gilded-fork')).toBeUndefined();
    expect(ITEM_BY_ID.get('rabbit-foot')).toBeUndefined();
    expect(FOOD_BY_ID.get('iron-ration')).toBeDefined();
    expect(CURSE_BY_ID.get('monochrome')?.name).toBe('Silver SLT');
  });

  it('The Tax halves gold and does not stack', () => {
    expect(CURSE_BY_ID.get('tax')?.maxStacks).toBe(1);
    expect(CURSE_BY_ID.get('tax')?.goldMult).toBe(0.5);
    const { state } = start('tax');
    state.curses.push({ id: 'tax', stacks: 1 });
    setAnswer(state, 'crane');
    const solved = act(state, { type: 'guess', word: 'crane' });
    expect(solved.state.gold).toBe(14);
  });

  it('Mimic Mouth only triggers once per round', () => {
    const { state } = start('mimic');
    state.items.push({ instance: 'i-mimic', id: 'mimic-mouth', data: { used: 0 }, equipped: true });
    setAnswer(state, 'crane');
    const first = act(state, { type: 'guess', word: 'crate' });
    expect(first.state.spells).toHaveLength(2);
    const second = act(first.state, { type: 'guess', word: 'crave' });
    expect(second.state.spells).toHaveLength(2);
  });

  it('Tally Lens is guaranteed in a shop once a vision curse is active', () => {
    const { state } = start('tally-shop');
    state.curses.push({ id: 'censor', stacks: 1 });
    state.nodeIndex = 0;
    state.nodes[1] = { kind: 'shop', level: 1 };
    state.phase = 'shop';
    const shop = act(state, { type: 'continue' }).state.shop;
    expect(shop?.offers.some((offer) => offer.kind === 'item' && offer.def === 'tally-lens'))
      .toBe(true);
  });

  it('Purge the D never returns after D is purged', () => {
    const { state } = start('purge-d');
    state.purged.push('d');
    for (let index = 0; index < 60; index++) {
      state.nodeIndex = 0;
      state.nodes[1] = { kind: 'shop', level: 1 };
      state.phase = 'shop';
      const shop = act(state, { type: 'continue' }).state.shop;
      expect(shop?.offers.some((offer) => offer.def === 'purge-the-d')).toBe(false);
    }
  });

  it('Ritual Circle gives max armor and Heal restores half max HP', () => {
    const ritual = start('ritual');
    ritual.state.items.push({
      instance: 'i-ritual',
      id: 'ritual-circle',
      data: { _mask: 0, types: 0, used: 0 },
      equipped: true,
    });
    ritual.state.spells.push(
      { instance: 's-omen', id: 'omen' },
      { instance: 's-heal', id: 'heal' },
      { instance: 's-immunity', id: 'immunity' },
    );
    let current = ritual.state;
    for (const instance of ['s-omen', 's-heal', 's-immunity']) {
      current = act(current, { type: 'castSpell', instance }).state;
    }
    expect(current.maxArmor).toBe(4);

    const heal = start('heal-half');
    heal.state.hp = 4;
    heal.state.spells.push({ instance: 's-heal', id: 'heal' });
    const cast = act(heal.state, { type: 'castSpell', instance: 's-heal' });
    expect(cast.state.hp).toBe(12);
  });

  it('Second Skin restores half of max armor', () => {
    const { state } = start('second-skin');
    state.items.push({ instance: 'i-skin', id: 'second-skin', data: { used: 0 }, equipped: true });
    state.maxArmor = 6;
    state.armor = 1;
    setAnswer(state, 'crane');
    state.round!.freeLeft = 0;
    const guess = act(state, { type: 'guess', word: 'slate' });
    expect(guess.state.armor).toBe(3);
    expect(guess.state.hp).toBe(14);
  });

  it('uses the normal curse pool for the first draft', () => {
    const firstOptions: string[] = [];
    for (let index = 0; index < 40; index++) {
      const { state } = start(`normal-pool-${index}`);
      const curseIndex = nodeAt(state, (node) => node.kind === 'curse');
      state.nodeIndex = curseIndex - 1;
      state.phase = 'shop';
      state.shop = shopState();
      const phase = game.view(act(state, { type: 'continue' }).state).phase;
      if (phase.kind === 'curse') firstOptions.push(phase.options[0]);
    }
    expect(firstOptions.some((id) => !['censor', 'second-sight', 'third-eye', 'fourth-wall', 'editor', 'vowel-fog', 'monochrome', 'la-curse', 'ts-curse', 'rip-curse', 'without-d', 'e-curse', 'the-list'].includes(id)))
      .toBe(true);
  });

  it('Spellbook pays 1, then 2, then 3 gold per cast', () => {
    const { state } = start('spellbook');
    state.items.push({ instance: 'i-book', id: 'spellbook', data: { gold: 1 }, equipped: true });
    state.spells = [
      { instance: 's-omen', id: 'omen' },
      { instance: 's-heal', id: 'heal' },
      { instance: 's-immunity', id: 'immunity' },
    ];
    let current = state;
    current = act(current, { type: 'castSpell', instance: 's-omen' }).state;
    expect(current.gold).toBe(11);
    current = act(current, { type: 'castSpell', instance: 's-heal' }).state;
    expect(current.gold).toBe(13);
    current = act(current, { type: 'castSpell', instance: 's-immunity' }).state;
    expect(current.gold).toBe(16);
    expect(ITEM_BY_ID.get('spellbook')?.dynamicDescription?.({ gold: 3 }))
      .toContain('+3 gold');
  });

  it('adds 2g Leftovers and 9g Iron Ration', () => {
    expect(ITEM_BY_ID.get('rabbit-foot')).toBeUndefined();
    expect(FOOD_BY_ID.get('leftovers')?.price).toBe(2);
    expect(FOOD_BY_ID.get('leftovers')?.effects)
      .toContainEqual({ type: 'healMissingPercent', percent: 50 });
    expect(FOOD_BY_ID.get('iron-ration')?.price).toBe(9);
  });

  it('Pawn Ticket pays a spell every 2 sales and costs 4', () => {
    const { state } = start('pawn-ticket');
    state.items.push(
      { instance: 'i-pawn', id: 'pawn-ticket', data: { sold: 0 }, equipped: true },
      { instance: 'i-sell-1', id: 'hourglass', data: {}, equipped: true },
      { instance: 'i-sell-2', id: 'hourglass', data: {}, equipped: true },
    );
    state.phase = 'shop';
    state.shop = shopState();
    const first = act(state, { type: 'sell', instance: 'i-sell-1' });
    expect(first.state.spells).toHaveLength(1);
    const second = act(first.state, { type: 'sell', instance: 'i-sell-2' });
    expect(second.state.spells).toHaveLength(2);
    expect(ITEM_BY_ID.get('pawn-ticket')?.price).toBe(4);
    expect(ITEM_BY_ID.get('pawn-ticket')?.description).toContain('Every 2 items sold');
  });

  it('Counterweight pays 2 gold for every fully blocked hit', () => {
    const { state } = start('counterweight');
    state.items.push({
      instance: 'i-counter',
      id: 'counterweight',
      data: {},
      equipped: true,
    });
    state.maxArmor = 10;
    state.armor = 10;
    setAnswer(state, 'crane');
    state.round!.freeLeft = 0;
    const first = act(state, { type: 'guess', word: 'slate' });
    expect(first.state.gold).toBe(12);
    const second = act(first.state, { type: 'guess', word: 'pious' });
    expect(second.state.gold).toBe(14);
  });

  it('Encore auto-guesses the last solved answer', () => {
    const { state } = start('encore');
    state.lastAnswer = 'crane';
    state.items.push({ instance: 'i-encore', id: 'encore', data: {}, equipped: true });
    const next = nextRound(state);
    const guess = next.state.round?.guesses[0];
    expect(guess?.word).toBe('crane');
    expect(guess?.free).toBe(true);
  });

  it('Leftovers heals half of missing HP', () => {
    const { state } = start('leftovers');
    state.hp = 6;
    state.phase = 'shop';
    state.gold = 20;
    state.shop = shopState([{ id: 'o0', kind: 'eat', def: 'leftovers', price: 2 }]);
    const eaten = act(state, { type: 'buy', offerId: 'o0' });
    expect(eaten.state.hp).toBe(11);
  });

  it('Shortcut only pays for solves in 2 guesses or fewer', () => {
    const quick = start('shortcut-quick');
    quick.state.items.push({ instance: 'i-short', id: 'shortcut', data: {}, equipped: true });
    if (!quick.state.round) throw new Error('expected round');
    setAnswer(quick.state, 'crane');
    quick.state.round.totalGuesses = 1;
    const two = act(quick.state, { type: 'guess', word: 'crane' });
    expect(two.state.slots).toBe(6);

    const slow = start('shortcut-slow');
    slow.state.items.push({ instance: 'i-short', id: 'shortcut', data: {}, equipped: true });
    if (!slow.state.round) throw new Error('expected round');
    setAnswer(slow.state, 'crane');
    slow.state.round.totalGuesses = 2;
    const three = act(slow.state, { type: 'guess', word: 'crane' });
    expect(three.state.slots).toBe(5);
  });

  it('Necronomicon procs at 13 reveals for an Omen and -3 max HP', () => {
    const { state } = start('necronomicon');
    state.items.push({
      instance: 'i-nec',
      id: 'necronomicon',
      data: { reveals: 12 },
      equipped: true,
    });
    state.spells = [{ instance: 's-omen', id: 'omen' }];
    setAnswer(state, 'crane');
    const cast = act(state, { type: 'castSpell', instance: 's-omen' });
    expect(cast.state.maxHp).toBe(13);
    expect(cast.state.spells.some((spell) => spell.id === 'omen')).toBe(true);
  });

  it('Hearty Meal gives 5 max HP and heals 5', () => {
    const meal = FOOD_BY_ID.get('hearty-meal');
    expect(meal?.effects).toEqual([
      { type: 'maxHp', delta: 5 },
      { type: 'heal', amount: 5 },
    ]);
  });

  it('adds the new food batch and prices', () => {
    expect(FOOD_BY_ID.get('only-u')?.name).toBe('U-nagi');
    expect(FOOD_BY_ID.get('only-u')?.effects).toContainEqual({ type: 'revealLetter', letter: 'u' });
    expect(FOOD_BY_ID.get('empty-calories')?.price).toBe(6);
    expect(FOOD_BY_ID.get('empty-calories')?.effects).toContainEqual({ type: 'maxHp', delta: 9 });
    expect(FOOD_BY_ID.get('one-bo-hue')?.price).toBe(4);
    expect(FOOD_BY_ID.get('warm-bowl')?.price).toBe(4);
    expect(FOOD_BY_ID.get('die-coke')?.price).toBe(1);
    expect(FOOD_BY_ID.get('die-coke')?.effects)
      .toContainEqual({ type: 'healDiceGold', min: 1, max: 6 });
    expect(FOOD_BY_ID.get('overhealers-delight')?.price).toBe(2);
    expect(FOOD_BY_ID.get('overhealers-delight')?.effects)
      .toContainEqual({ type: 'healOverflowMaxHp', amount: 8 });
    expect(FOOD_BY_ID.get('overhealers-delicacy')?.price).toBe(5);
    expect(FOOD_BY_ID.get('overhealers-delicacy')?.effects)
      .toContainEqual({ type: 'healOverflowMaxHp', amount: 12 });
    expect(FOOD_BY_ID.get('rusty-plate')?.price).toBe(2);
    expect(FOOD_BY_ID.get('spring-tonic')?.price).toBe(1);
    expect(FOOD_BY_ID.get('packed-lunch')?.price).toBe(3);
    expect(FOOD_BY_ID.get('packed-lunch')?.effects).toContainEqual({ type: 'slots', delta: -1 });
    expect(ITEM_BY_ID.get('bookend')?.price).toBe(7);
    expect(FOOD_BY_ID.get('gg-gum')?.price).toBe(9);
    expect(ITEM_BY_ID.get('overachiever')).toBeUndefined();
    expect(ITEM_BY_ID.get('miser')).toBeUndefined();
    expect(ITEM_BY_ID.get('old-mcdonald')).toBeDefined();
  });

  it('Die Coke turns excess healing into gold', () => {
    const { state } = start('die-coke');
    state.phase = 'shop';
    state.gold = 10;
    state.shop = shopState([{ id: 'o0', kind: 'eat', def: 'die-coke', price: 1 }]);
    const eaten = act(state, { type: 'buy', offerId: 'o0' });
    expect(eaten.state.hp).toBe(16);
    expect(eaten.state.gold).toBeGreaterThanOrEqual(10);
    expect(eaten.state.gold).toBeLessThanOrEqual(15);
  });

  it('Overhealer foods turn excess healing into max HP', () => {
    const delight = start('overhealers-delight');
    delight.state.phase = 'shop';
    delight.state.gold = 20;
    delight.state.shop = shopState([
      { id: 'o0', kind: 'eat', def: 'overhealers-delight', price: 6 },
    ]);
    const eaten = act(delight.state, { type: 'buy', offerId: 'o0' });
    expect(eaten.state.maxHp).toBe(24);
    expect(eaten.state.hp).toBe(24);

    const delicacy = start('overhealers-delicacy');
    delicacy.state.phase = 'shop';
    delicacy.state.gold = 20;
    delicacy.state.shop = shopState([
      { id: 'o0', kind: 'eat', def: 'overhealers-delicacy', price: 12 },
    ]);
    const feasted = act(delicacy.state, { type: 'buy', offerId: 'o0' });
    expect(feasted.state.maxHp).toBe(28);
    expect(feasted.state.hp).toBe(28);
  });

  it('Packed Lunch removes a slot and bags the overflow', () => {
    const { state } = start('packed-lunch');
    for (let index = 0; index < 5; index++) {
      state.items.push({
        instance: `i-hour-${index}`,
        id: 'hourglass',
        data: {},
        equipped: true,
      });
    }
    state.phase = 'shop';
    state.gold = 10;
    state.shop = shopState([{ id: 'o0', kind: 'eat', def: 'packed-lunch', price: 3 }]);
    const eaten = act(state, { type: 'buy', offerId: 'o0' });
    expect(eaten.state.slots).toBe(4);
    expect(eaten.state.items.filter((item) => item.equipped)).toHaveLength(4);
  });

  it('The Scales doubles max HP and halves current HP, or grants max armor', () => {
    const grow = start('scales-grow');
    grow.state.phase = 'happening';
    grow.state.happening = { id: 'the-scales', options: [] };
    const grown = act(grow.state, { type: 'choose', optionId: 'grow' });
    expect(grown.state.maxHp).toBe(32);
    expect(grown.state.hp).toBe(8);

    const plate = start('scales-plate');
    plate.state.phase = 'happening';
    plate.state.happening = { id: 'the-scales', options: [] };
    const plated = act(plate.state, { type: 'choose', optionId: 'plate' });
    expect(plated.state.maxArmor).toBe(3);
  });

  it('removes the retired item batch', () => {
    expect(ITEM_BY_ID.get('dead-letter')).toBeUndefined();
    expect(ITEM_BY_ID.get('feast-of-ideas')).toBeUndefined();
    expect(ITEM_BY_ID.get('field-dressing')).toBeUndefined();
    expect(ITEM_BY_ID.get('time-dilation')).toBeUndefined();
    expect(ITEM_BY_ID.get('deja-vu')).toBeUndefined();
    expect(ITEM_BY_ID.get('sundial')).toBeUndefined();
    expect(FOOD_BY_ID.get('sundial')).toBeDefined();
  });

  it('applies the new prices and text', () => {
    expect(ITEM_BY_ID.get('bloom')?.price).toBe(7);
    expect(ITEM_BY_ID.get('bloom')?.initial).toMatchObject({ hp: 3 });
    expect(ITEM_BY_ID.get('contrapuntal')?.price).toBe(7);
    expect(ITEM_BY_ID.get('growth-chart')?.price).toBe(6);
    expect(ITEM_BY_ID.get('growth-spurt')?.price).toBe(6);
    expect(ITEM_BY_ID.get('growth-spurt')?.description).toContain('+2 max HP');
    expect(ITEM_BY_ID.get('hat-trick')?.initial).toMatchObject({ gold: 1 });
    expect(ITEM_BY_ID.get('necronomicon')?.price).toBe(13);
    expect(ITEM_BY_ID.get('necronomicon')?.description).toContain('not in the word');
    expect(ITEM_BY_ID.get('nest-egg')?.price).toBe(4);
    expect(ITEM_BY_ID.get('nest-egg')?.description).toContain('+1 gold');
    expect(ITEM_BY_ID.get('plate-timer')?.price).toBe(7);
    expect(ITEM_BY_ID.get('plate-timer')?.description).toContain('15s');
    expect(ITEM_BY_ID.get('second-skin')?.price).toBe(6);
    expect(ITEM_BY_ID.get('second-skin')?.description).not.toContain('heal');
    expect(ITEM_BY_ID.get('solo-note')?.price).toBe(7);
    expect(ITEM_BY_ID.get('ticking-fee')?.description).toContain('40s');
    expect(ITEM_BY_ID.get('trailblazer')?.price).toBe(7);
    expect(ITEM_BY_ID.get('trailblazer')?.description).toContain('15+');
    expect(ITEM_BY_ID.get('double-blind')?.name).toBe('Yellow1');
    expect(ITEM_BY_ID.get('empty-armor')?.price).toBe(8);
  });

  it('Head Start makes early guesses free and late guesses paid', () => {
    const early = start('head-start-early');
    early.state.items.push({ instance: 'i-hs', id: 'head-start', data: {}, equipped: true });
    const first = nextRound(early.state);
    setAnswer(first.state, 'crane');
    first.state.round!.freeLeft = 0;
    first.state.round!.elapsedMs = 5_000;
    const shielded = act(first.state, { type: 'guess', word: 'slate' });
    expect(shielded.state.round?.guesses[0].free).toBe(true);
    expect(shielded.state.hp).toBe(16);

    const late = start('head-start-late');
    late.state.items.push({ instance: 'i-hs', id: 'head-start', data: {}, equipped: true });
    const second = nextRound(late.state);
    setAnswer(second.state, 'crane');
    second.state.round!.freeLeft = 0;
    second.state.round!.elapsedMs = 13_000;
    second.state.armor = 0;
    const unshielded = act(second.state, { type: 'guess', word: 'slate' });
    expect(unshielded.state.round?.guesses[0].free).toBe(false);
    expect(unshielded.state.hp).toBe(13);
  });

  it('Ward Engine grants max armor', () => {
    const { state } = start('ward-engine');
    state.items.push({ instance: 'i-ward', id: 'ward-engine', data: { used: 0 }, equipped: true });
    state.spells = [{ instance: 's-imm', id: 'immunity' }];
    const cast = act(state, { type: 'castSpell', instance: 's-imm' });
    expect(cast.state.maxArmor).toBe(4);
  });

  it('Clean Slate only pays once per round', () => {
    const { state } = start('clean-slate');
    state.items.push({ instance: 'i-clean', id: 'clean-slate', data: { used: 0 }, equipped: true });
    setAnswer(state, 'crane');
    const first = act(state, { type: 'guess', word: 'brick' });
    const trigger = act(first.state, { type: 'guess', word: 'vamps' });
    expect(trigger.state.maxArmor).toBe(3);
    const third = act(trigger.state, { type: 'guess', word: 'fizzy' });
    expect(third.state.maxArmor).toBe(3);
  });

  it('Empty Armor grants Restore when the round starts with no spells', () => {
    const { state } = start('empty-armor');
    state.items.push({ instance: 'i-empty', id: 'empty-armor', data: {}, equipped: true });
    state.spells = [];
    const next = nextRound(state);
    expect(next.state.spells.some((spell) => spell.id === 'restore')).toBe(true);
  });

  it('Sundial is food that adds time and removes a free guess', () => {
    const { state } = start('sundial');
    state.curses.push({ id: 'clock', stacks: 1 });
    state.phase = 'shop';
    state.gold = 20;
    state.shop = shopState([{ id: 'o0', kind: 'eat', def: 'sundial', price: 9 }]);
    const eaten = act(state, { type: 'buy', offerId: 'o0' });
    expect(eaten.state.bonusTimeMs).toBe(120_000);
    expect(eaten.state.freeGuessBonus).toBe(-1);
    const next = nextRound(eaten.state);
    expect(next.state.round?.freeLeft).toBe(0);
  });

  it('applies the latest prices and text', () => {
    expect(FOOD_BY_ID.get('plating')?.price).toBe(8);
    expect(ITEM_BY_ID.get('compound-interest')?.price).toBe(6);
    expect(FOOD_BY_ID.get('yin-yang')?.price).toBe(10);
    expect(FOOD_BY_ID.get('bounty')?.price).toBe(4);
    expect(FOOD_BY_ID.get('bounty')?.effects).toContainEqual({ type: 'solveGold', amount: 1 });
    expect(ITEM_BY_ID.get('counterweight')?.description).toContain('Completely blocked hit');
    expect(ITEM_BY_ID.get('encore')?.description).toContain('last solved answer');
    expect(ITEM_BY_ID.get('shortcut')?.description).toContain('2 guesses or fewer');
    expect(ITEM_BY_ID.get('necronomicon')?.description).toContain('Every 13 reveals');
    expect(ITEM_BY_ID.get('necronomicon')?.description).toContain('-3 max HP');
    expect(FOOD_BY_ID.get('hearty-meal')?.description).toBe('+5 max HP, heal 5. No slot.');
    expect(ITEM_BY_ID.get('loyalty-card')?.description).toContain('Every 7 shop purchases');
    expect(ITEM_BY_ID.get('tithe-box')?.description).toContain('10% chance');
    expect(ITEM_BY_ID.get('mimic-mouth')?.description).toContain('Once per round');
    expect(ITEM_BY_ID.get('second-skin')?.description).toContain('half your max armor');
    expect(ITEM_BY_ID.get('ritual-circle')?.description).toContain('+2 max armor');
    expect(SPELL_BY_ID.get('heal')?.description).toBe('Heal half of your max HP.');
    expect(CURSE_BY_ID.get('tax')?.description).toBe('Encounter gold is halved.');
  });
});

describe('spells and foods', () => {
  it('has six spells and no Time Warp', () => {
    expect(SPELLS).toHaveLength(6);
    expect(SPELL_BY_ID.get('time-warp')).toBeUndefined();
  });

  it('uses the new Time Freeze text', () => {
    expect(SPELL_BY_ID.get('time-freeze')?.description)
      .toBe('The next guess is free. Freeze any timers until you make the guess.');
  });

  it('prices Pen Club at 15 gold for a 1-5 gold payout', () => {
    const pen = ITEM_BY_ID.get('pen-club');
    expect(pen?.price).toBe(15);
    expect(pen?.description).toContain('1-5 gold');
  });

  it('has rare purge foods', () => {
    expect(FOOD_BY_ID.get('inkcap')).toBeDefined();
    expect(FOOD_BY_ID.get('purge-the-d')).toBeDefined();
    expect(FOOD_BY_ID.get('purge-the-d')?.rarity).toBe('rare');
  });

  it('accepts penis in the dictionary', () => {
    expect(CONTENT.valid.has('penis')).toBe(true);
  });
});

describe('full cursed loop', () => {
  it('auto-plays until the run ends without stalling', () => {
    let result = start('auto-cursed');
    let steps = 0;
    while (result.state.phase !== 'over' && steps < 2000) {
      steps++;
      const state = result.state;
      if (state.pendingPurge > 0) {
        const letter = 'abcdefghijklmnopqrstuvwxyz'.split('').find((ch) => !state.purged.includes(ch)) ?? 'q';
        result = act(state, { type: 'purgeLetter', letter });
      } else if (state.pendingCurseRemoval > 0) {
        result = act(state, { type: 'removeCurse', curseId: state.curses[0]?.id ?? '' });
      } else if (state.phase === 'curse') {
        const phase = game.view(state).phase;
        if (phase.kind !== 'curse') throw new Error('expected curse');
        result = act(state, { type: 'chooseCurse', curseId: phase.options[0] });
      } else if (state.phase === 'round' && state.round) {
        result = act(state, { type: 'guess', word: state.round.answer });
      } else if (state.phase === 'summary') {
        result = act(state, { type: 'continue' });
      } else if (state.phase === 'reward') {
        result = act(state, { type: 'chooseReward', optionId: state.reward?.options[0]?.id ?? 'gold' });
      } else if (state.phase === 'shop') {
        result = act(state, { type: 'continue' });
      } else if (state.phase === 'happening') {
        if (state.happening?.resolved) {
          result = act(state, { type: 'continue' });
        } else {
          const options = state.happening?.options ?? [];
          const choice = options.find((option) => !option.costGold || option.costGold <= state.gold) ?? options.at(-1);
          result = act(state, { type: 'choose', optionId: choice?.id ?? '' });
        }
      } else if (state.phase === 'bossIntro') {
        result = act(state, { type: 'continue' });
      } else {
        break;
      }
    }
    expect(steps).toBeLessThan(2000);
    expect(result.state.phase).toBe('over');
  });
});

describe('final boss', () => {
  it('is a three-round gauntlet and ends in victory', () => {
    const { state } = start();
    const bossIndex = nodeAt(state, (node) => node.kind === 'boss');
    state.nodeIndex = bossIndex - 1;
    state.phase = 'shop';
    state.shop = shopState();
    const intro = act(state, { type: 'continue' });
    expect(intro.state.phase).toBe('bossIntro');

    let result = act(intro.state, { type: 'continue' });
    expect(result.state.round?.gauntletTotal).toBe(3);

    for (let i = 0; i < 3; i++) {
      if (result.state.phase !== 'round' || !result.state.round) break;
      result = act(result.state, { type: 'guess', word: result.state.round.answer });
    }

    expect(result.state.phase).toBe('summary');
    expect(result.state.summary?.rewardPending).toBe(false);
    const won = act(result.state, { type: 'continue' });
    expect(won.state.phase).toBe('over');
    expect(won.state.over?.result).toBe('victory');
  });
});

describe('serialization', () => {
  it('round-trips the current version', () => {
    const { state } = start('serialize');
    const restored = game.deserialize(game.serialize(state));
    expect(restored).not.toBeNull();
    expect(restored?.level).toBe(1);
    expect(restored?.curses).toEqual([]);
  });

  it('rejects old save versions', () => {
    expect(game.deserialize(JSON.stringify({ version: 5 }))).toBeNull();
  });
});

describe('core purity', () => {
  it('never touches browser globals or ambient randomness', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const files = await fs.readdir('src/core');
    const banned = [
      'Math.random', 'Date.now', 'structuredClone', 'window',
      'document', 'localStorage', 'performance.now', 'fetch',
    ];
    for (const file of files.filter((name) => name.endsWith('.ts') && name !== 'host.ts')) {
      const source = await fs.readFile(path.join('src/core', file), 'utf8');
      for (const token of banned) {
        expect(source.includes(token), `${file} contains ${token}`).toBe(false);
      }
    }
  });
});
