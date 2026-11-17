import { describe, expect, it } from 'vitest';
import { game } from '../src/game';
import type {
  Command,
  GameEvent,
  RunNode,
  RunState,
  RunView,
  ShopState,
  StepResult,
} from '../src/game';
import { CONTENT, CURSE_BY_ID, CURSES, FOOD_BY_ID, ITEM_BY_ID, SPELL_BY_ID, SPELLS } from '../src/content';

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

/** Resolve any starting drafts, then open the first curse node of the run. */function firstDraft(
  seed: string,
  ascension = 0,
): Extract<RunView['phase'], { kind: 'curse' }> {
  let current = start(seed, ascension).state;
  while (current.phase === 'curse') {
    const phase = game.view(current).phase;
    if (phase.kind !== 'curse') break;
    current = act(current, { type: 'chooseCurse', curseId: phase.options[0] }).state;
  }
  const curseIndex = nodeAt(current, (node) => node.kind === 'curse');
  current.nodeIndex = curseIndex - 1;
  current.phase = 'shop';
  current.shop = shopState();
  const draft = act(current, { type: 'continue' });
  const phase = game.view(draft.state).phase;
  if (phase.kind !== 'curse') throw new Error('expected curse phase');
  return phase;
}

describe('cursed run setup', () => {
  it('starts at level 1 with no clock, blacklist or curses', () => {
    const { state, events } = start();
    expect(state.phase).toBe('round');
    expect(state.level).toBe(1);
    expect(state.hp).toBe(40);
    expect(state.maxHp).toBe(40);
    expect(state.armor).toBe(2);
    expect(state.gold).toBe(10);
    expect(state.slots).toBe(5);
    expect(state.blacklist).toEqual([]);
    expect(state.curses).toEqual([]);
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

  it('forces a vision/blacklist curse into one side of the first base-run draft', () => {
    const sightIds = new Set(
      CURSES.filter((curse) => curse.tags.includes('vision') || curse.tags.includes('list'))
        .map((curse) => curse.id),
    );
    let clockSecond = 0;
    for (let index = 0; index < 80; index++) {
      const phase = firstDraft(`first-draft-${index}`, 0);
      expect(sightIds.has(phase.options[0]), phase.options.join(',')).toBe(true);
      expect(phase.options[1]).not.toBe(phase.options[0]);
      if (phase.options[1] === 'clock') clockSecond += 1;
    }
    // The Clock has triple weight in the wildcard slot.
    expect(clockSecond).toBeGreaterThan(5);
  });

  it('drops the first-draft rules in Ascension', () => {
    const sightIds = new Set(
      CURSES.filter((curse) => curse.tags.includes('vision') || curse.tags.includes('list'))
        .map((curse) => curse.id),
    );
    let offGroup = 0;
    for (let index = 0; index < 40; index++) {
      const phase = firstDraft(`asc-first-draft-${index}`, 2);
      if (!sightIds.has(phase.options[0])) offGroup += 1;
    }
    expect(offGroup).toBeGreaterThan(0);
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
  it('uses fixed base damage 3 and Heavy Hand doubles per stack', () => {
    const { state } = start();
    expect(state.round?.baseDamage).toBe(3);
    state.curses.push({ id: 'heavy-hand', stacks: 2 });
    const next = nextRound(state);
    expect(next.state.round?.baseDamage).toBe(12);
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
    expect(guess.state.hp).toBe(40);
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

  it('the Curse Broker accepts a percentage when you cannot pay full price', () => {
    const { state } = start();
    state.curses.push({ id: 'censor', stacks: 1 });
    state.phase = 'happening';
    state.happening = { id: 'curse-broker', options: [] };
    state.gold = 20;

    const bought = act(state, { type: 'choose', optionId: 'relic' });
    expect(bought.state.gold).toBe(8);
    expect(bought.state.items.some((item) => ITEM_BY_ID.get(item.id)?.rarity === 'rare')).toBe(true);
  });

  it('the Curse Broker can remove a chosen curse', () => {
    const { state } = start();
    state.curses.push({ id: 'censor', stacks: 1 });
    state.phase = 'happening';
    state.happening = { id: 'curse-broker', options: [] };
    state.gold = 200;

    const bought = act(state, { type: 'choose', optionId: 'remove' });
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
    const curseIndex = nodeAt(state, (node) => node.kind === 'curse');
    state.nodeIndex = curseIndex - 1;
    state.phase = 'shop';
    state.shop = shopState();
    const draft = act(state, { type: 'continue' });
    const phase = game.view(draft.state).phase;
    if (phase.kind !== 'curse') throw new Error('expected curse phase');

    // The first option is always a vision/list curse, so it cannot alter slots.
    const chosen = act(draft.state, { type: 'chooseCurse', curseId: phase.options[0] });
    expect(chosen.state.maxArmor).toBe(7);
    expect(chosen.state.slots).toBe(6);
    expect(chosen.state.spells).toHaveLength(1);
  });

  it('describes all of them as Gain a curse', () => {
    for (const id of ['trophy-hunter', 'boss-trophy', 'boss-aegis', 'trophy-room']) {
      expect(ITEM_BY_ID.get(id)?.description.startsWith('Whenever you gain a curse: Gain ')).toBe(true);
      expect(ITEM_BY_ID.get(id)?.name).not.toMatch(/boss|trophy/i);
    }
  });
});

describe('item and food batch', () => {
  it('Field Kit reveals 4 letters that are not in the word', () => {
    const { state } = start('field-kit');
    state.items.push({ instance: 'i-kit', id: 'field-kit', data: {}, equipped: true });
    const next = nextRound(state);
    const round = next.state.round;
    if (!round) throw new Error('expected round');
    const hints = Object.entries(round.hints);
    expect(hints).toHaveLength(4);
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
    expect(next.state.hp).toBe(40);
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
    expect(first.state.gold).toBe(20);
    expect(first.state.items.find((item) => item.id === 'hat-trick')?.data.gold).toBe(7);

    const second = nextRound(first.state);
    setAnswer(second.state, 'crane');
    const secondSolve = act(second.state, { type: 'guess', word: 'crane' });
    expect(secondSolve.state.gold).toBe(32);
    expect(secondSolve.state.items.find((item) => item.id === 'hat-trick')?.data.gold).toBe(9);
  });

  it('does not pay on the fourth guess', () => {
    const { state } = start('hat-trick-slow');
    state.items.push({ instance: 'i-hat', id: 'hat-trick', data: { gold: 5 }, equipped: true });
    if (!state.round) throw new Error('expected round');
    setAnswer(state, 'crane');
    state.round.totalGuesses = 3;

    const solve = act(state, { type: 'guess', word: 'crane' });
    expect(solve.state.gold).toBe(15);
    expect(solve.state.items.find((item) => item.id === 'hat-trick')?.data.gold).toBe(5);
  });

  it('describes the live payout', () => {
    const def = ITEM_BY_ID.get('hat-trick');
    expect(def?.rarity).toBeUndefined();
    expect(def?.description).toContain('gain 5 gold');
    expect(def?.dynamicDescription?.({ gold: 9 })).toContain('gain 9 gold');
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

  it('prices Pen Club at 15 gold for a +3 payout', () => {
    const pen = ITEM_BY_ID.get('pen-club');
    expect(pen?.price).toBe(15);
    expect(pen?.description).toContain('+3 gold');
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
