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

/** Advance into a shop node and take the shop option. */
function enterShop(state: RunState): StepResult {
  const arrived = act(state, { type: 'continue' });
  if (arrived.state.phase !== 'shopChoice') return arrived;
  return act(arrived.state, { type: 'choose', optionId: 'shop' });
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
    expect(state.armor).toBe(4);
    expect(state.gold).toBe(12);
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
      expect(view.phase.options).toHaveLength(3);
    }
  });
});

describe('curse drafting', () => {
  it('offers three curses on a curse node and applies the chosen one', () => {
    const { state } = start();
    const curseIndex = nodeAt(state, (node) => node.kind === 'curse');
    state.nodeIndex = curseIndex - 1;
    state.phase = 'shop';
    state.shop = shopState();

    const draft = act(state, { type: 'continue' });
    expect(draft.state.phase).toBe('curse');
    const phase = game.view(draft.state).phase;
    if (phase.kind !== 'curse') throw new Error('expected curse phase');
    expect(phase.options).toHaveLength(3);

    const chosen = act(draft.state, { type: 'chooseCurse', curseId: phase.options[0] });
    expect(chosen.state.curses).toHaveLength(1);
    expect(chosen.state.phase).not.toBe('curse');
  });

  it('marks curses as seen when they appear in a draft', () => {
    const { state } = start('seen-curses');
    const curseIndex = nodeAt(state, (node) => node.kind === 'curse');
    state.nodeIndex = curseIndex - 1;
    state.phase = 'shop';
    state.shop = shopState();
    const result = act(state, { type: 'continue' }).state;
    const phase = game.view(result).phase;
    if (phase.kind !== 'curse') throw new Error('expected curse phase');
    expect([...result.seenCurses].sort()).toEqual([...phase.options].sort());
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

  it('Silver STD makes S, T and D ambiguous', () => {
    const { state } = start('silver-std');
    setAnswer(state, 'stand');
    state.curses.push({ id: 'monochrome', stacks: 1 });
    const guess = act(state, { type: 'guess', word: 'staid' });
    const view = game.view(guess.state);
    if (view.phase.kind !== 'round') throw new Error('expected round');
    const tiles = view.phase.board.guesses[0].tiles;
    expect(tiles[0]).toBe('hit');
    expect(tiles[1]).toBe('hit');
    expect(tiles[2]).toBe('correct');
    expect(tiles[4]).toBe('hit');
  });

  it('Hard R hides R only', () => {
    const { state } = start('hard-r');
    setAnswer(state, 'crane');
    state.curses.push({ id: 'hard-r', stacks: 1 });
    const guess = act(state, { type: 'guess', word: 'trade' });
    const view = game.view(guess.state);
    if (view.phase.kind !== 'round') throw new Error('expected round');
    const tiles = view.phase.board.guesses[0].tiles;
    expect(tiles[1]).toBe('hidden');
    expect(tiles[2]).toBe('correct');
  });

  it('E Curse hides E only', () => {
    const { state } = start('e-curse');
    setAnswer(state, 'crane');
    state.curses.push({ id: 'e-curse', stacks: 1 });
    const guess = act(state, { type: 'guess', word: 'trade' });
    const view = game.view(guess.state);
    if (view.phase.kind !== 'round') throw new Error('expected round');
    const tiles = view.phase.board.guesses[0].tiles;
    expect(tiles[4]).toBe('hidden');
    expect(tiles[1]).toBe('correct');
  });

  it('Take the L hides L only', () => {
    const { state } = start('take-the-l');
    setAnswer(state, 'crane');
    state.curses.push({ id: 'la-curse', stacks: 1 });
    const guess = act(state, { type: 'guess', word: 'salad' });
    const view = game.view(guess.state);
    if (view.phase.kind !== 'round') throw new Error('expected round');
    const tiles = view.phase.board.guesses[0].tiles;
    expect(tiles[2]).toBe('hidden');
    expect(tiles[1]).toBe('present');
    expect(tiles[3]).toBe('absent');
  });

  it('A-Aron hides A only', () => {
    const { state } = start('a-aron');
    setAnswer(state, 'crane');
    state.curses.push({ id: 'a-curse', stacks: 1 });
    const guess = act(state, { type: 'guess', word: 'salad' });
    const view = game.view(guess.state);
    if (view.phase.kind !== 'round') throw new Error('expected round');
    const tiles = view.phase.board.guesses[0].tiles;
    expect(tiles[1]).toBe('hidden');
    expect(tiles[3]).toBe('hidden');
    expect(tiles[2]).toBe('absent');
  });

  it('IP Theft hides I and P only', () => {
    const { state } = start('ip-theft');
    setAnswer(state, 'crane');
    state.curses.push({ id: 'ip-theft', stacks: 1 });
    const guess = act(state, { type: 'guess', word: 'prize' });
    const view = game.view(guess.state);
    if (view.phase.kind !== 'round') throw new Error('expected round');
    const tiles = view.phase.board.guesses[0].tiles;
    expect(tiles[0]).toBe('hidden');
    expect(tiles[2]).toBe('hidden');
    expect(tiles[1]).toBe('correct');
    expect(tiles[3]).toBe('absent');
    expect(tiles[4]).toBe('correct');
  });

  it('RIP Curse makes R, I and P silver', () => {
    const { state } = start('rip-silver');
    setAnswer(state, 'prize');
    state.curses.push({ id: 'rip-curse', stacks: 1 });
    const guess = act(state, { type: 'guess', word: 'pious' });
    const view = game.view(guess.state);
    if (view.phase.kind !== 'round') throw new Error('expected round');
    const tiles = view.phase.board.guesses[0].tiles;
    expect(tiles[0]).toBe('hit');
    expect(tiles[1]).toBe('hit');
    expect(CURSE_BY_ID.get('rip-curse')?.vision)
      .toContainEqual({ kind: 'ambiguousLetters', letters: 'rip' });
  });

  it('marks vision-hidden letters on the keyboard and lets reveals override it', () => {
    const { state } = start('hidden-keyboard');
    state.curses.push({ id: 'hard-r', stacks: 1 });
    const view = game.view(state).phase;
    if (view.kind !== 'round') throw new Error('expected round');
    expect(view.board.keyboard.r).toBe('hidden');
    expect(view.board.keyboard.s).toBeUndefined();

    const hinted = start('hidden-keyboard-hint');
    hinted.state.curses.push({ id: 'hard-r', stacks: 1 });
    hinted.state.round!.hints.r = 'present';
    const hintedView = game.view(hinted.state).phase;
    if (hintedView.kind !== 'round') throw new Error('expected round');
    expect(hintedView.board.keyboard.r).toBe('present');

    const silver = start('hidden-keyboard-silver');
    silver.state.curses.push({ id: 'monochrome', stacks: 1 });
    const silverView = game.view(silver.state).phase;
    if (silverView.kind !== 'round') throw new Error('expected round');
    expect(silverView.board.keyboard.s).not.toBe('hidden');
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
  it('base damage is 3 plus curse stacks, and Heavy Hand adds 40% per stack', () => {
    const { state } = start();
    expect(state.round?.baseDamage).toBe(3);
    state.curses.push({ id: 'heavy-hand', stacks: 2 });
    const next = nextRound(state);
    expect(next.state.round?.baseDamage).toBe(10); // (3 + 2) × 1.4² = 9.8
    expect(CURSE_BY_ID.get('heavy-hand')?.damageMultiplier).toBe(1.4);
    expect(CURSE_BY_ID.get('heavy-hand')?.description).toContain('40%');
  });

  it('Wasting cuts current max HP by 40%', () => {
    const { state } = start('wasting');
    state.curse = { options: ['wasting'], starting: false };
    state.phase = 'curse';
    state.maxHp = 20;
    state.hp = 20;
    const chosen = act(state, { type: 'chooseCurse', curseId: 'wasting' });
    expect(chosen.state.maxHp).toBe(12);
    expect(chosen.state.hp).toBe(12);
    expect(CURSE_BY_ID.get('wasting')?.maxHpMult).toBe(0.6);
    expect(CURSE_BY_ID.get('wasting')?.description).toContain('40%');
  });

  it('raises base damage by 1 for every curse stack', () => {
    const { state } = start('curse-damage');
    state.curses.push({ id: 'censor', stacks: 1 });
    state.curses.push({ id: 'clock', stacks: 1 });
    expect(nextRound(state).state.round?.baseDamage).toBe(5);
  });

  it('Porcupine damages the next guess based on previous greens', () => {
    const { state } = start('porcupine');
    state.curses.push({ id: 'porcupine', stacks: 1 });
    const next = nextRound(state);
    setAnswer(next.state, 'crane');
    next.state.round!.freeLeft = 0;
    next.state.armor = 0;
    const first = act(next.state, { type: 'guess', word: 'slate' });
    expect(first.state.hp).toBe(12);
    const second = act(first.state, { type: 'guess', word: 'pious' });
    expect(second.state.hp).toBe(4);
  });

  it('Clumsy does not stack', () => {
    expect(CURSE_BY_ID.get('clumsy')?.maxStacks).toBe(1);
    expect(CURSE_BY_ID.get('clumsy')?.description).not.toContain('stack');
    expect(CURSE_BY_ID.get('clumsy')?.rules.join(' ')).not.toContain('stack');
  });

  it('Sleeper adds +2 damage per revealed letter in the first guess, per stack', () => {
    const { state } = start('sleeper');
    state.curses.push({ id: 'sleeper', stacks: 1 });
    const next = nextRound(state);
    setAnswer(next.state, 'crane');
    next.state.round!.freeLeft = 0;
    next.state.armor = 0;
    next.state.hp = 20;
    const first = act(next.state, { type: 'guess', word: 'slate' }); // 2 revealed
    expect(first.state.hp).toBe(12); // 4 base + 4 Sleeper
    const second = act(first.state, { type: 'guess', word: 'brick' });
    expect(second.state.hp).toBe(4); // still keyed to the first guess

    const stacked = start('sleeper-stacked');
    stacked.state.curses.push({ id: 'sleeper', stacks: 2 });
    const stackedNext = nextRound(stacked.state);
    setAnswer(stackedNext.state, 'crane');
    stackedNext.state.round!.freeLeft = 0;
    stackedNext.state.armor = 0;
    stackedNext.state.hp = 20;
    const hit = act(stackedNext.state, { type: 'guess', word: 'slate' });
    expect(hit.state.hp).toBe(7); // 5 base + 8 Sleeper
    expect(CURSE_BY_ID.get('sleeper')?.description).toContain('first player guess');
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

  it('timeout damage is 10 plus 2 per curse stack', () => {
    const { state } = start('timeout-damage');
    state.curses.push({ id: 'clock', stacks: 1 });
    state.curses.push({ id: 'heavy-hand', stacks: 2 });
    const started = nextRound(state);
    const view = game.view(started.state);
    if (view.phase.kind !== 'round') throw new Error('expected round');
    expect(view.phase.board.timeoutDamage).toBe(16);

    started.state.hp = 40;
    started.state.round!.remainingMs = 1;
    const timedOut = act(started.state, { type: 'tick', dtMs: 2_000 });
    expect(timedOut.state.hp).toBe(24);
    expect(timedOut.state.phase).toBe('summary');
  });

  it('shows count-up time when a timer-interest item is equipped', () => {
    const { state } = start();
    state.items.push({ instance: 'i-early', id: 'early-bird', data: {}, equipped: true });
    const view = game.view(state);
    if (view.phase.kind !== 'round') throw new Error('expected round');
    expect(view.phase.board.timerMode).toBe('countup');
  });

  it('Early Bird pays for solves under a minute', () => {
    const quick = start('early-bird-quick');
    quick.state.items.push({ instance: 'i-early', id: 'early-bird', data: { gold: 2 }, equipped: true });
    setAnswer(quick.state, 'crane');
    quick.state.round!.elapsedMs = 59_999;
    const solved = act(quick.state, { type: 'guess', word: 'crane' });

    const late = start('early-bird-late');
    late.state.items.push({ instance: 'i-early-late', id: 'early-bird', data: { gold: 2 }, equipped: true });
    setAnswer(late.state, 'crane');
    late.state.round!.elapsedMs = 60_000;
    const missed = act(late.state, { type: 'guess', word: 'crane' });

    expect(solved.state.gold).toBe(missed.state.gold + 2);
    expect(ITEM_BY_ID.get('early-bird')?.description).toContain('under a minute');
  });

  it('Fast Learner grants Time Freeze for solves under a minute', () => {
    const quick = start('fast-learner');
    quick.state.items.push({ instance: 'i-fast', id: 'fast-learner', data: {}, equipped: true });
    quick.state.spells = [];
    setAnswer(quick.state, 'crane');
    quick.state.round!.elapsedMs = 59_999;
    const solved = act(quick.state, { type: 'guess', word: 'crane' });
    expect(solved.state.spells.some((spell) => spell.id === 'time-freeze')).toBe(true);

    const late = start('fast-learner-late');
    late.state.items.push({ instance: 'i-fast-late', id: 'fast-learner', data: {}, equipped: true });
    late.state.spells = [];
    setAnswer(late.state, 'crane');
    late.state.round!.elapsedMs = 60_000;
    const missed = act(late.state, { type: 'guess', word: 'crane' });
    expect(missed.state.spells.some((spell) => spell.id === 'time-freeze')).toBe(false);
    expect(ITEM_BY_ID.get('fast-learner')?.description).toContain('under a minute');
  });

  it('Photosynthesis grants +2 max HP and heals 20% on solve', () => {
    const { state } = start('photosynthesis');
    state.items.push({ instance: 'i-photo', id: 'photosynthesis', data: {}, equipped: true });
    state.hp = 10;
    setAnswer(state, 'crane');
    const solved = act(state, { type: 'guess', word: 'crane' });
    expect(solved.state.maxHp).toBe(18);
    expect(solved.state.hp).toBe(14);
    expect(ITEM_BY_ID.get('photosynthesis')?.price).toBe(10);
    expect(ITEM_BY_ID.get('photosynthesis')?.description)
      .toContain('+2 max HP');
  });

  it('Adrenaline raises max HP and armor when HP crosses below 50%', () => {
    const { state } = start('adrenaline');
    state.items.push({ instance: 'i-adr', id: 'adrenaline', data: { armed: 1 }, equipped: true });
    state.hp = 9;
    state.armor = 0;
    state.maxArmor = 0;
    state.round!.freeLeft = 0;
    setAnswer(state, 'crane');

    const hit = act(state, { type: 'guess', word: 'slate' }); // 3 damage -> 6 HP
    expect(hit.state.hp).toBe(6);
    expect(hit.state.maxHp).toBe(17);
    expect(hit.state.maxArmor).toBe(1);
    expect(hit.state.items.find((item) => item.id === 'adrenaline')?.data.armed).toBe(0);

    const again = act(hit.state, { type: 'guess', word: 'brick' });
    expect(again.state.maxHp).toBe(17);
    expect(again.state.maxArmor).toBe(1);

    again.state.spells = [{ instance: 's-heal', id: 'heal' }];
    const healed = act(again.state, { type: 'castSpell', instance: 's-heal' });
    expect(healed.state.hp).toBeGreaterThanOrEqual(10.5);
    expect(healed.state.items.find((item) => item.id === 'adrenaline')?.data.armed).toBe(1);

    healed.state.hp = 11;
    healed.state.armor = 0;
    const second = act(healed.state, { type: 'guess', word: 'fizzy' });
    expect(second.state.hp).toBe(8);
    expect(second.state.maxHp).toBe(18);
    expect(second.state.maxArmor).toBe(2);
    expect(ITEM_BY_ID.get('adrenaline')?.price).toBe(10);
  });

  it('Gold Standard adds 1 gold to every gain and costs 8', () => {
    const { state } = start('gold-standard');
    state.items.push({ instance: 'i-gold', id: 'gold-standard', data: {}, equipped: true });
    setAnswer(state, 'crane');
    const solved = act(state, { type: 'guess', word: 'crane' });
    expect(solved.state.gold).toBe(21); // 12 start + 8 solve + 1 bonus

    solved.state.phase = 'shop';
    solved.state.shop = shopState();
    solved.state.items.push({ instance: 'i-glass', id: 'hourglass', data: {}, equipped: true });
    const before = solved.state.gold;
    const base = Math.floor((ITEM_BY_ID.get('hourglass')?.price ?? 2) / 2);
    const sold = act(solved.state, { type: 'sell', instance: 'i-glass' });
    expect(sold.state.gold).toBe(before + base + 1); // sale gold + 1 bonus

    expect(ITEM_BY_ID.get('gold-standard')?.price).toBe(8);
    expect(ITEM_BY_ID.get('gold-standard')?.description).toContain('+1 gold');
  });

  it('turns Time Freeze into an unobscured free guess when there is no clock', () => {
    const { state } = start('time-freeze-unobscured');
    setAnswer(state, 'crane');
    state.curses.push({ id: 'censor', stacks: 1 });
    state.round!.freeLeft = 0;
    state.armor = 0;
    state.spells.push({ instance: 's-freeze', id: 'time-freeze' });
    const cast = act(state, { type: 'castSpell', instance: 's-freeze' });
    expect(cast.state.round?.frozenUntilGuess).toBe(false);
    expect(cast.state.round?.nextFreeUnobscured).toBe(true);

    const guess = act(cast.state, { type: 'guess', word: 'tiger' });
    expect(guess.state.hp).toBe(16);
    expect(guess.state.round?.guesses.at(-1)?.free).toBe(true);
    expect(guess.state.round?.nextFreeUnobscured).toBe(false);
    const view = game.view(guess.state).phase;
    if (view.kind !== 'round') throw new Error('expected round');
    expect(view.board.guesses[0].tiles[0]).not.toBe('hidden');

    const next = act(guess.state, { type: 'guess', word: 'slate' });
    const after = game.view(next.state).phase;
    if (after.kind !== 'round') throw new Error('expected round');
    expect(after.board.guesses[1].tiles[0]).toBe('hidden');
  });

  it('does not count Time Freeze free guesses for solve-count items', () => {
    const { state } = start('time-freeze-count');
    state.items.push({ instance: 'i-short', id: 'shortcut', data: {}, equipped: true });
    state.spells = [
      { instance: 's-tf1', id: 'time-freeze' },
      { instance: 's-tf2', id: 'time-freeze' },
    ];
    state.round!.freeLeft = 0;
    setAnswer(state, 'crane');
    let current = act(state, { type: 'castSpell', instance: 's-tf1' }).state;
    current = act(current, { type: 'guess', word: 'slate' }).state;
    current = act(current, { type: 'castSpell', instance: 's-tf2' }).state;
    current = act(current, { type: 'guess', word: 'brick' }).state;
    const solved = act(current, { type: 'guess', word: 'crane' });
    expect(solved.state.slots).toBe(6);
  });

  it('locks Immunity and Time Freeze until the player guesses', () => {
    const { state } = start('spell-lock');
    state.spells = [
      { instance: 's-imm1', id: 'immunity' },
      { instance: 's-imm2', id: 'immunity' },
      { instance: 's-tf1', id: 'time-freeze' },
      { instance: 's-tf2', id: 'time-freeze' },
    ];
    setAnswer(state, 'crane');

    const first = act(state, { type: 'castSpell', instance: 's-imm1' });
    const blocked = act(first.state, { type: 'castSpell', instance: 's-imm2' });
    expect(blocked.events.some(
      (event) => event.type === 'spellRejected'
        && event.reason === 'Guess First! You already cast Immunity.',
    )).toBe(true);
    expect(blocked.state.spells.some((spell) => spell.instance === 's-imm2')).toBe(true);

    const freeze = act(blocked.state, { type: 'castSpell', instance: 's-tf1' });
    expect(freeze.state.spells.some((spell) => spell.instance === 's-tf1')).toBe(false);
    expect(freeze.state.round?.lockedSpells).toEqual(['immunity', 'time-freeze']);

    const guessed = act(freeze.state, { type: 'guess', word: 'slate' });
    expect(guessed.state.round?.lockedSpells).toEqual([]);
    const recast = act(guessed.state, { type: 'castSpell', instance: 's-imm2' });
    expect(recast.state.spells.some((spell) => spell.instance === 's-imm2')).toBe(false);
  });

  it('marks the winning guess on the guessScored event', () => {
    const { state } = start('solved-event');
    setAnswer(state, 'crane');
    const missed = act(state, { type: 'guess', word: 'slate' });
    const solved = act(missed.state, { type: 'guess', word: 'crane' });
    const scored = solved.events.filter((event) => event.type === 'guessScored');
    expect(scored.at(-1)?.solved).toBe(true);
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

  it('sometimes has the friend say Pizza Pzazz', () => {
    let seen = false;
    for (let index = 0; index < 40 && !seen; index++) {
      const { state } = start(`pizza-pzazz-${index}`);
      state.curses.push({ id: 'clock', stacks: 1 });
      const next = nextRound(state);
      next.state.spells.push({ instance: 's-phone', id: 'phone-friend' });
      if (!next.state.round) throw new Error('expected round');
      next.state.round.answer = 'zzzzz';
      const cast = act(next.state, { type: 'castSpell', instance: 's-phone' });
      const said = cast.events.some(
        (event) => event.type === 'friendSaid' && event.text === 'Pizza Pzazz 🍕✨',
      );
      if (said) {
        const words = cast.events.flatMap((event) =>
          event.type === 'guessScored' && event.by === 'friend' ? [event.word] : [],
        );
        expect(words).toEqual(['pizza', 'pzazz']);
        seen = true;
      }
    }
    expect(seen).toBe(true);
  });
});

describe('shop curses', () => {
  it('Sparse Shelves removes one item and one food', () => {
    const { state } = start('sparse-seed');
    state.nodeIndex = 0;
    state.nodes[1] = { kind: 'shop', level: 1 };
    state.phase = 'shop';
    const control = enterShop(state);
    const controlOffers = control.state.shop?.offers ?? [];

    const cursed = start('sparse-seed');
    cursed.state.curses.push({ id: 'sparse-shelves', stacks: 2 });
    cursed.state.nodeIndex = 0;
    cursed.state.nodes[1] = { kind: 'shop', level: 1 };
    cursed.state.phase = 'shop';
    const sparse = enterShop(cursed.state);
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
      const result = enterShop(state);
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
      const result = enterShop(state);
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
    expect(bought.state.maxArmor).toBe(4);
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

  it('The Redaction costs 5/10 and its rest option triggers an eat', () => {
    const redaction = HAPPENING_BY_ID.get('redaction');
    expect(redaction?.options.find((option) => option.id === 'one')?.costGold).toBe(5);
    expect(redaction?.options.find((option) => option.id === 'two')?.costGold).toBe(10);
    const rest = redaction?.options.find((option) => option.id === 'rest');
    expect(rest?.outcomes[0].effects).toContainEqual({ type: 'eatBurst', count: 1 });
    expect(rest?.outcomes[0].effects)
      .toContainEqual({ type: 'removeRandomCurse', chancePct: 10 });

    const { state } = start('redaction-rest');
    state.items.push({ instance: 'i-gour', id: 'gourmand', data: {}, equipped: true });
    state.phase = 'happening';
    state.happening = { id: 'redaction', options: [] };
    const rested = act(state, { type: 'choose', optionId: 'rest' });
    expect(rested.state.maxHp).toBe(17);
  });

  it('The Confessional sells 45/75/100% curse removal at 5/10/15 gold', () => {
    const event = HAPPENING_BY_ID.get('confessional');
    expect(event?.options.find((option) => option.id === 'small')?.costGold).toBe(5);
    expect(event?.options.find((option) => option.id === 'small')?.outcomes[0].chancePct)
      .toBe(45);
    expect(event?.options.find((option) => option.id === 'large')?.costGold).toBe(10);
    expect(event?.options.find((option) => option.id === 'large')?.outcomes[0].chancePct)
      .toBe(75);
    expect(event?.options.find((option) => option.id === 'everything')?.costGold).toBe(15);
    expect(event?.options.find((option) => option.id === 'everything')?.outcomes[0].chancePct)
      .toBe(100);

    const { state } = start('confessional');
    state.curses.push({ id: 'censor', stacks: 1 });
    state.phase = 'happening';
    state.happening = { id: 'confessional', options: [] };
    state.gold = 20;
    const paid = act(state, { type: 'choose', optionId: 'everything' });
    expect(paid.state.gold).toBe(5);
    expect(paid.state.curses).toEqual([]);
  });

  it('adds the Detour, Crossroads and Trade events', () => {
    const detour = HAPPENING_BY_ID.get('detour');
    const both = detour?.options.find((option) => option.id === 'both');
    expect(both?.outcomes[0].effects).toContainEqual({ type: 'damage', amount: 7, ignoreArmor: true });
    expect(both?.outcomes[0].effects).toContainEqual({ type: 'slots', delta: 1 });
    expect(both?.outcomes[0].effects).toContainEqual({ type: 'openShop' });

    const crossroads = HAPPENING_BY_ID.get('crossroads');
    expect(crossroads?.options.find((option) => option.id === 'rest')?.outcomes[0].effects)
      .toEqual([
        { type: 'giveSpell', spell: 'heal' },
        { type: 'giveSpell', spell: 'time-freeze' },
      ]);

    const trade = HAPPENING_BY_ID.get('trade');
    expect(trade?.options.find((option) => option.id === 'buy-slot')?.costGold).toBe(10);
    expect(trade?.options.find((option) => option.id === 'sell-slot')?.outcomes[0].effects)
      .toContainEqual({ type: 'gold', amount: 20 });
    expect(trade?.options.find((option) => option.id === 'heal')?.outcomes[0].effects)
      .toHaveLength(2);
  });

  it('adds the Sanctuary, Kind Stranger and Stone Door events', () => {
    const sanctuary = HAPPENING_BY_ID.get('sanctuary');
    expect(sanctuary?.options.find((option) => option.id === 'rest')?.outcomes[0].effects)
      .toEqual([{ type: 'healPercent', percent: 100 }]);
    expect(sanctuary?.options.find((option) => option.id === 'shelf')?.outcomes[0].effects)
      .toEqual([{ type: 'slots', delta: 1 }]);

    const stranger = HAPPENING_BY_ID.get('kind-stranger');
    expect(stranger?.options.find((option) => option.id === 'medicine')?.outcomes[0].effects)
      .toEqual([
        { type: 'giveSpell', spell: 'heal' },
        { type: 'giveSpell', spell: 'heal' },
      ]);
    expect(stranger?.options.find((option) => option.id === 'purse')?.outcomes[0].effects)
      .toEqual([{ type: 'gold', amount: 8 }]);

    const door = HAPPENING_BY_ID.get('stone-door');
    expect(door?.options.find((option) => option.id === 'heart')?.outcomes[0].effects)
      .toEqual([{ type: 'maxHp', delta: 6 }]);
    expect(door?.options.find((option) => option.id === 'shop')?.outcomes[0].effects)
      .toEqual([{ type: 'openShop' }]);

    const coin = HAPPENING_BY_ID.get('coin-box');
    expect(coin?.options.find((option) => option.id === 'heal')?.costGold).toBe(1);
    expect(coin?.options.find((option) => option.id === 'heal')?.outcomes[0].effects)
      .toEqual([
        { type: 'giveSpell', spell: 'heal' },
        { type: 'giveSpell', spell: 'heal' },
      ]);
    expect(coin?.options.find((option) => option.id === 'slot')?.costGold).toBe(6);
    expect(coin?.options.find((option) => option.id === 'slot')?.outcomes[0].effects)
      .toEqual([{ type: 'slots', delta: 1 }]);

    const ledger = HAPPENING_BY_ID.get('red-ledger');
    expect(ledger?.options.find((option) => option.id === 'heal')?.outcomes[0].effects)
      .toEqual([{ type: 'giveSpell', spell: 'heal' }]);
    expect(ledger?.options.find((option) => option.id === 'gold')?.outcomes[0].effects)
      .toEqual([
        { type: 'damage', amount: 6, ignoreArmor: true },
        { type: 'gold', amount: 6 },
      ]);
  });

  it('The Red Ledger pays a Heal spell or trades 6 HP for 6 gold', () => {
    const { state } = start('red-ledger');
    state.hp = 15;
    state.phase = 'happening';
    state.happening = { id: 'red-ledger', options: [] };
    const paid = act(state, { type: 'choose', optionId: 'gold' });
    expect(paid.state.hp).toBe(9);
    expect(paid.state.gold).toBe(18);
  });

  it('The Coin Box charges 1 gold for two Heals or 6 gold for a slot', () => {
    const { state } = start('coin-box');
    state.gold = 10;
    state.phase = 'happening';
    state.happening = { id: 'coin-box', options: [] };
    const bought = act(state, { type: 'choose', optionId: 'slot' });
    expect(bought.state.gold).toBe(4);
    expect(bought.state.slots).toBe(6);
  });

  it('resolves the Sanctuary heal and the Stone Door shop', () => {
    const { state } = start('sanctuary-heal');
    state.hp = 3;
    state.phase = 'happening';
    state.happening = { id: 'sanctuary', options: [] };
    const healed = act(state, { type: 'choose', optionId: 'rest' });
    expect(healed.state.hp).toBe(healed.state.maxHp);

    const door = start('stone-door-shop');
    door.state.phase = 'happening';
    door.state.happening = { id: 'stone-door', options: [] };
    const opened = act(door.state, { type: 'choose', optionId: 'shop' });
    expect(opened.state.phase).toBe('shop');
    expect(opened.state.shop?.offers.length).toBeGreaterThan(0);
  });

  it('opens a shop from the Detour and applies its other rewards', () => {
    const { state } = start('detour-both');
    state.phase = 'happening';
    state.happening = { id: 'detour', options: [] };
    const chosen = act(state, { type: 'choose', optionId: 'both' });
    expect(chosen.state.hp).toBe(9);
    expect(chosen.state.slots).toBe(6);
    expect(chosen.state.phase).toBe('shop');
    expect(chosen.state.shop?.offers.length).toBeGreaterThan(0);
  });

  it('offers a shop or an inn when entering a shop node', () => {
    const { state } = start('shop-or-inn');
    state.nodeIndex = 0;
    state.nodes[1] = { kind: 'shop', level: 1 };
    state.phase = 'shop';
    const arrived = act(state, { type: 'continue' });
    expect(arrived.state.phase).toBe('shopChoice');
    expect(arrived.state.shop).toBeUndefined();
  });

  it('heals to full at the inn and skips the shop', () => {
    const { state } = start('inn-heal');
    state.nodeIndex = 0;
    state.nodes[1] = { kind: 'shop', level: 1 };
    state.phase = 'shop';
    state.hp = 3;
    const arrived = act(state, { type: 'continue' });
    const rested = act(arrived.state, { type: 'choose', optionId: 'inn' });
    expect(rested.state.hp).toBe(rested.state.maxHp);
    expect(rested.state.shop).toBeUndefined();
    expect(rested.state.phase).not.toBe('shop');
  });

  it('opens the shop with rerolls starting at 1 gold', () => {
    const { state } = start('reroll-cost');
    state.nodeIndex = 0;
    state.nodes[1] = { kind: 'shop', level: 1 };
    state.phase = 'shop';
    const entered = enterShop(state).state;
    expect(entered.phase).toBe('shop');
    expect(entered.shop?.rerollCost).toBe(1);
    entered.gold = 10;
    const rerolled = act(entered, { type: 'reroll' });
    expect(rerolled.state.shop?.rerollCost).toBe(2);
  });

  it('Nest Egg pays 3 gold when a shop opens', () => {
    const { state } = start('nest-egg');
    state.items.push({ instance: 'i-nest', id: 'nest-egg', data: {}, equipped: true });
    state.nodeIndex = 0;
    state.nodes[1] = { kind: 'shop', level: 1 };
    state.phase = 'shop';
    state.shop = shopState();
    const result = enterShop(state);
    expect(result.state.gold).toBe(15);
  });

  it('The Revisor offers two spells at 70%', () => {
    const accept = HAPPENING_BY_ID.get('revisor')?.options.find(
      (option) => option.id === 'accept',
    );
    expect(accept?.description).toContain('two random spells');
    expect(accept?.outcomes[0].chancePct).toBe(70);
    expect(accept?.outcomes[0].effects).toHaveLength(2);
    expect(accept?.outcomes[1].chancePct).toBe(30);
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
    expect(chosen.state.maxArmor).toBe(6);
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
    expect(ITEM_BY_ID.get('old-mcdonald')?.price).toBe(30);
  });

  it('removes the damage cap and prices letter foods by rarity', () => {
    expect(ITEM_BY_ID.get('hard-hat')).toBeUndefined();
    expect(FOOD_BY_ID.get('x-ray')?.price).toBe(8);
    expect(FOOD_BY_ID.get('x-ray')?.name).toBe('X-Ray Cake');
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
    expect(first.state.gold).toBe(25);
    expect(first.state.items.find((item) => item.id === 'hat-trick')?.data.gold).toBe(7);

    const second = nextRound(first.state);
    setAnswer(second.state, 'crane');
    const secondSolve = act(second.state, { type: 'guess', word: 'crane' });
    expect(secondSolve.state.gold).toBe(40);
    expect(secondSolve.state.items.find((item) => item.id === 'hat-trick')?.data.gold).toBe(9);
  });

  it('does not pay on the fourth guess', () => {
    const { state } = start('hat-trick-slow');
    state.items.push({ instance: 'i-hat', id: 'hat-trick', data: { gold: 5 }, equipped: true });
    if (!state.round) throw new Error('expected round');
    setAnswer(state, 'crane');
    state.round.totalGuesses = 3;
    state.round.playerGuesses = 3;

    const solve = act(state, { type: 'guess', word: 'crane' });
    expect(solve.state.gold).toBeGreaterThanOrEqual(17);
    expect(solve.state.gold).toBeLessThanOrEqual(20);
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
    expect(quick.state.gold).toBe(20);

    for (let index = 0; index < 20; index++) {
      const { state } = start(`gold-slow-${index}`);
      if (!state.round) throw new Error('expected round');
      setAnswer(state, 'crane');
      state.round.totalGuesses = 3;
      const slow = act(state, { type: 'guess', word: 'crane' });
      expect(slow.state.gold).toBeGreaterThanOrEqual(17);
      expect(slow.state.gold).toBeLessThanOrEqual(20);
    }
  });

  it('Brace pays 2 max armor, Bloom grows max HP, Patch Kit heals 30% +1', () => {
    const brace = start('brace');
    brace.state.items.push({ instance: 'i-brace', id: 'brace', data: {}, equipped: true });
    setAnswer(brace.state, 'crane');
    const braced = act(brace.state, { type: 'guess', word: 'crane' });
    expect(braced.state.maxArmor).toBe(6);

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

  it('Hearty Stew grants one or two casts of Heal', () => {
    for (const seed of ['stew-a', 'stew-b', 'stew-c', 'stew-d', 'stew-e', 'stew-f']) {
      const { state } = start(seed);
      state.phase = 'shop';
      state.gold = 20;
      state.shop = shopState([{ id: 'o0', kind: 'eat', def: 'hearty-stew', price: 5 }]);
      const before = state.spells.filter((spell) => spell.id === 'heal').length;
      const eaten = act(state, { type: 'buy', offerId: 'o0' });
      expect(eaten.state.gold).toBe(15);
      const gained = eaten.state.spells.filter((spell) => spell.id === 'heal').length - before;
      expect(gained).toBeGreaterThanOrEqual(1);
      expect(gained).toBeLessThanOrEqual(2);
    }
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
    expect(bought.state.maxArmor).toBe(8);
    expect(ITEM_BY_ID.get('bottomless')?.description)
      .toContain('20% chance of +1 max armor');

    const bottomless = bought.state.items.find((item) => item.id === 'bottomless');
    const off = act(bought.state, { type: 'unequipItem', instance: bottomless!.instance });
    expect(off.state.maxArmor).toBe(4);
    const on = act(off.state, { type: 'equipItem', instance: bottomless!.instance });
    expect(on.state.maxArmor).toBe(8);
    on.state.phase = 'shop';
    on.state.shop = shopState();
    const sold = act(on.state, { type: 'sell', instance: bottomless!.instance });
    expect(sold.state.maxArmor).toBe(4);
  });

  it('stops offering food that permanently revealed its letter', () => {
    const { state } = start('gg-repeat');
    state.permanentReveals.push('g');
    for (let index = 0; index < 50; index++) {
      state.nodeIndex = 0;
      state.nodes[1] = { kind: 'shop', level: 1 };
      state.phase = 'shop';
      const shop = enterShop(state).state.shop;
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
      const shop = enterShop(state).state.shop;
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
    expect(guess.state.gold).toBeGreaterThanOrEqual(13);
    expect(guess.state.gold).toBeLessThanOrEqual(17);
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

  it('Muffin Tin is a 2g food that grants permanent armor for food eaten this shop', () => {
    expect(FOOD_BY_ID.get('muffin-tin')?.price).toBe(2);
    expect(ITEM_BY_ID.get('muffin-tin')).toBeUndefined();
    expect(ITEM_BY_ID.get('bulk-order')).toBeUndefined();

    const { state } = start('muffin-food');
    state.phase = 'shop';
    state.gold = 100;
    state.shop = shopState([
      { id: 'f0', kind: 'eat', def: 'snack', price: 3 },
      { id: 'f1', kind: 'eat', def: 'muffin-tin', price: 2 },
      { id: 'f2', kind: 'eat', def: 'feast', price: 5 },
    ]);
    const base = state.maxArmor;
    let current = act(state, { type: 'buy', offerId: 'f0' }).state;
    current = act(current, { type: 'buy', offerId: 'f1' }).state;
    expect(current.maxArmor).toBe(base + 1); // the tin itself
    current = act(current, { type: 'buy', offerId: 'f2' }).state;
    expect(current.maxArmor).toBe(base + 2);

    current.nodeIndex = 0;
    current.nodes[1] = { kind: 'shop', level: 1 };
    const left = act(current, { type: 'continue' });
    expect(left.state.maxArmor).toBe(base + 2); // armor persists after leaving
  });

  it('Muffin Tin stacks with an additional tin', () => {
    const { state } = start('muffin-stack');
    state.phase = 'shop';
    state.gold = 100;
    state.shop = shopState([
      { id: 'f0', kind: 'eat', def: 'muffin-tin', price: 2 },
      { id: 'f1', kind: 'eat', def: 'muffin-tin', price: 2 },
      { id: 'f2', kind: 'eat', def: 'feast', price: 5 },
    ]);
    const base = state.maxArmor;
    let current = act(state, { type: 'buy', offerId: 'f0' }).state;
    expect(current.maxArmor).toBe(base + 1);
    current = act(current, { type: 'buy', offerId: 'f1' }).state;
    expect(current.maxArmor).toBe(base + 3); // the second tin counts twice
    current = act(current, { type: 'buy', offerId: 'f2' }).state;
    expect(current.maxArmor).toBe(base + 5); // one food with two tins
  });

  it('Muffin Tin eaten outside a shop arms the next shop', () => {
    const { state } = start('muffin-outside');
    state.nodes[1] = { kind: 'shop', level: 1 };
    state.phase = 'reward';
    state.reward = {
      options: [{
        id: 'eat:muffin-tin',
        kind: 'eat',
        def: 'muffin-tin',
        label: 'Muffin Tin',
        description: '',
      }],
      boss: false,
    };
    const base = state.maxArmor;
    const eaten = act(state, { type: 'chooseReward', optionId: 'eat:muffin-tin' });
    expect(eaten.state.maxArmor).toBe(base + 1); // the tin's own armor
    expect(eaten.state.phase).toBe('shopChoice');
    expect(eaten.state.pendingMuffinStacks).toBe(1);

    const entered = act(eaten.state, { type: 'choose', optionId: 'shop' });
    expect(entered.state.phase).toBe('shop');
    expect(entered.state.muffinStacks).toBe(1);
    expect(entered.state.pendingMuffinStacks).toBe(0);
    entered.state.gold = 100;
    entered.state.shop!.offers = [{ id: 'f0', kind: 'eat', def: 'snack', price: 3 }];
    const fed = act(entered.state, { type: 'buy', offerId: 'f0' });
    expect(fed.state.maxArmor).toBe(base + 2);
  });

  it('Muffin Tin keeps counting across a shop reroll', () => {
    const { state } = start('muffin-reroll');
    state.phase = 'shop';
    state.gold = 100;
    state.shop = shopState([{ id: 'f0', kind: 'eat', def: 'muffin-tin', price: 2 }]);
    const base = state.maxArmor;
    let current = act(state, { type: 'buy', offerId: 'f0' }).state;
    expect(current.maxArmor).toBe(base + 1);
    current = act(current, { type: 'reroll' }).state;
    current.shop!.offers = [{ id: 'f1', kind: 'eat', def: 'feast', price: 5 }];
    current.shop!.foodOffers = 1;
    current.shop!.foodsBought = 0;
    current = act(current, { type: 'buy', offerId: 'f1' }).state;
    expect(current.maxArmor).toBe(base + 2);
  });

  it('Muffin Tin does not count foods eaten in another shop', () => {
    const { state } = start('muffin-visit');
    state.phase = 'shop';
    state.gold = 100;
    state.shop = shopState([{ id: 'f0', kind: 'eat', def: 'muffin-tin', price: 2 }]);
    const base = state.maxArmor;
    let current = act(state, { type: 'buy', offerId: 'f0' }).state;
    expect(current.maxArmor).toBe(base + 1);

    current.shop = { ...shopState([{ id: 'f1', kind: 'eat', def: 'feast', price: 5 }]), visit: 9 };
    current = act(current, { type: 'buy', offerId: 'f1' }).state;
    expect(current.maxArmor).toBe(base + 1);
  });

  it('Bulwark pays a spell every 10 damage blocked by armor and costs 8', () => {
    const { state } = start('bulwark');
    state.items.push({ instance: 'i-bul', id: 'bulwark', data: { blocked: 0 }, equipped: true });
    state.spells = [];
    state.round!.freeLeft = 0;
    state.armor = 20;
    state.maxArmor = 20;
    setAnswer(state, 'crane');
    let current = state;
    current = act(current, { type: 'guess', word: 'slate' }).state;
    current = act(current, { type: 'guess', word: 'brick' }).state;
    current = act(current, { type: 'guess', word: 'vamps' }).state;
    expect(current.spells).toHaveLength(0);
    current = act(current, { type: 'guess', word: 'fizzy' }).state;
    expect(current.spells).toHaveLength(1);
    expect(ITEM_BY_ID.get('bulwark')?.price).toBe(8);
    expect(ITEM_BY_ID.get('bulwark')?.description)
      .toContain('Every 10 damage blocked by armor');
  });

  it('Guardian Angel grants Immunity after 10 HP damage taken', () => {
    const { state } = start('guardian-angel');
    state.items.push({
      instance: 'i-angel',
      id: 'guardian-angel',
      data: { taken: 9 },
      equipped: true,
    });
    state.round!.freeLeft = 0;
    state.armor = 2;
    state.maxArmor = 2;
    setAnswer(state, 'crane');
    const hit = act(state, { type: 'guess', word: 'slate' });
    expect(hit.state.items.find((item) => item.id === 'guardian-angel')?.data.taken).toBe(0);
    expect(hit.state.round?.immuneGuesses).toBe(1);
    expect(ITEM_BY_ID.get('guardian-angel')?.price).toBe(8);
    expect(ITEM_BY_ID.get('guardian-angel')?.description)
      .toContain('every 10 HP damage');
  });

  it('Second Hand and Engine cross-grant spells at 80%', () => {
    let secondHeal = 0;
    let secondRestore = 0;
    let engineFreeze = 0;
    let engineImmunity = 0;

    for (let index = 0; index < 30; index++) {
      const handTf = start(`second-hand-tf-${index}`);
      handTf.state.items.push({ instance: 'i-sh', id: 'second-hand', data: {}, equipped: true });
      handTf.state.spells = [{ instance: 's-tf', id: 'time-freeze' }];
      const afterTf = act(handTf.state, { type: 'castSpell', instance: 's-tf' });
      if (afterTf.state.spells.some((spell) => spell.id === 'heal')) secondHeal++;

      const handImm = start(`second-hand-imm-${index}`);
      handImm.state.items.push({ instance: 'i-sh2', id: 'second-hand', data: {}, equipped: true });
      handImm.state.spells = [{ instance: 's-imm', id: 'immunity' }];
      const afterImm = act(handImm.state, { type: 'castSpell', instance: 's-imm' });
      if (afterImm.state.spells.some((spell) => spell.id === 'restore')) secondRestore++;

      const engineRestore = start(`engine-restore-${index}`);
      engineRestore.state.items.push({ instance: 'i-eng', id: 'engine', data: {}, equipped: true });
      engineRestore.state.spells = [{ instance: 's-res', id: 'restore' }];
      const afterRestore = act(engineRestore.state, { type: 'castSpell', instance: 's-res' });
      if (afterRestore.state.spells.some((spell) => spell.id === 'time-freeze')) engineFreeze++;

      const engineHeal = start(`engine-heal-${index}`);
      engineHeal.state.items.push({ instance: 'i-eng2', id: 'engine', data: {}, equipped: true });
      engineHeal.state.spells = [{ instance: 's-heal', id: 'heal' }];
      const afterHeal = act(engineHeal.state, { type: 'castSpell', instance: 's-heal' });
      if (afterHeal.state.spells.some((spell) => spell.id === 'immunity')) engineImmunity++;
    }

    expect(secondHeal).toBeGreaterThan(0);
    expect(secondRestore).toBeGreaterThan(0);
    expect(engineFreeze).toBeGreaterThan(0);
    expect(engineImmunity).toBeGreaterThan(0);
    expect(ITEM_BY_ID.get('second-hand')?.price).toBe(8);
    expect(ITEM_BY_ID.get('engine')?.price).toBe(8);
    expect(ITEM_BY_ID.get('second-hand')?.description).toContain('80%');
    expect(ITEM_BY_ID.get('engine')?.description).toContain('80%');
  });

  it('Immunity blocks the next hurting guess and the next 4 seconds of guesses', () => {
    const { state } = start('immunity-window');
    state.spells = [{ instance: 's-imm', id: 'immunity' }];
    state.round!.freeLeft = 0;
    state.armor = 0;
    state.maxArmor = 0;
    setAnswer(state, 'crane');

    const cast = act(state, { type: 'castSpell', instance: 's-imm' });
    expect(cast.state.round?.immuneGuesses).toBe(1);

    const first = act(cast.state, { type: 'guess', word: 'slate' });
    expect(first.state.hp).toBe(16);
    expect(first.state.round?.immuneGuesses).toBe(0);
    expect(first.state.round?.guessImmuneUntilMs).toBe(4_000);

    const second = act(first.state, { type: 'guess', word: 'brick' });
    expect(second.state.hp).toBe(16);

    second.state.round!.elapsedMs = 5_000;
    const third = act(second.state, { type: 'guess', word: 'vamps' });
    expect(third.state.hp).toBe(13);
  });

  it('applies the tuned content text and values', () => {
    expect(FOOD_BY_ID.get('gg-gum')?.effects)
      .toContainEqual({ type: 'revealLetter', letter: 'g' });
    expect(FOOD_BY_ID.get('gumdrop')?.price).toBe(2);
    expect(FOOD_BY_ID.get('bitter-root')?.effects)
      .toContainEqual({ type: 'maxArmor', delta: 1 });
    expect(FOOD_BY_ID.get('bitter-root')?.effects)
      .not.toContainEqual({ type: 'armor', delta: 1 });
    expect(ITEM_BY_ID.get('growth-spurt')?.description).toContain('+2 max HP');
    expect(FOOD_BY_ID.get('muffin-tin')?.description).toContain('+1 max armor');
    expect(CURSE_BY_ID.get('porcupine')?.damagePerGreen).toBe(2);
    expect(CURSE_BY_ID.get('porcupine')?.description)
      .toBe('+2 damage on the next guess per green tile on the previous guess.');
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
    expect(ITEM_BY_ID.get('blacklist-scholar')).toBeUndefined();
    expect(ITEM_BY_ID.get('gilded-fork')).toBeUndefined();
    expect(ITEM_BY_ID.get('rabbit-foot')).toBeUndefined();
    expect(FOOD_BY_ID.get('iron-ration')).toBeDefined();
    expect(CURSE_BY_ID.get('monochrome')?.name).toBe('Silver STD');
    expect(CURSE_BY_ID.get('monochrome')?.vision)
      .toContainEqual({ kind: 'ambiguousLetters', letters: 'std' });
    expect(CURSE_BY_ID.get('hard-r')?.vision)
      .toContainEqual({ kind: 'hideLetters', letters: 'r' });
  });

  it('The Tax reduces gold by 40% and does not stack', () => {
    expect(CURSE_BY_ID.get('tax')?.maxStacks).toBe(1);
    expect(CURSE_BY_ID.get('tax')?.goldMult).toBe(0.6);
    const { state } = start('tax');
    state.curses.push({ id: 'tax', stacks: 1 });
    state.bonusSolveGold = 2;
    setAnswer(state, 'crane');
    const solved = act(state, { type: 'guess', word: 'crane' });
    expect(solved.state.gold).toBe(18);
  });

  it('Mimic Mouth pays a spell for a wrong guess with 5 revealed letters, once per round', () => {
    const def = ITEM_BY_ID.get('mimic-mouth');
    expect(def?.price).toBe(7);
    expect(def?.description).toContain('5 revealed letters');
    expect(def?.description).toContain('wrong guess');

    const { state } = start('mimic');
    state.items.push({ instance: 'i-mimic', id: 'mimic-mouth', data: { used: 0 }, equipped: true });
    setAnswer(state, 'crane');
    const spellsBefore = state.spells.length;
    const first = act(state, { type: 'guess', word: 'nacre' }); // wrong, all five letters present
    expect(first.state.spells).toHaveLength(spellsBefore + 1);
    const second = act(first.state, { type: 'guess', word: 'caner' }); // wrong and five letters again
    expect(second.state.spells).toHaveLength(spellsBefore + 1);

    const exact = start('mimic-correct');
    exact.state.items.push({ instance: 'i-mimic', id: 'mimic-mouth', data: { used: 0 }, equipped: true });
    setAnswer(exact.state, 'crane');
    const exactBefore = exact.state.spells.length;
    const solved = act(exact.state, { type: 'guess', word: 'crane' });
    expect(solved.state.spells).toHaveLength(exactBefore);
  });

  it('a hidden tile stays hidden while the keyboard learns its letter', () => {
    const { state } = start('hidden-peek');
    state.curses.push({ id: 'censor', stacks: 1 });
    setAnswer(state, 'crane');

    const first = act(state, { type: 'guess', word: 'crate' }); // C is green but the tile is hidden
    const alone = game.view(first.state).phase;
    if (alone.kind !== 'round') throw new Error('expected round');
    expect(alone.board.guesses[0]?.tiles[0]).toBe('hidden');

    const second = act(first.state, { type: 'guess', word: 'actor' }); // C shows yellow at slot 2
    const after = game.view(second.state).phase;
    if (after.kind !== 'round') throw new Error('expected round');
    expect(after.board.keyboard.c).toBe('present');
    expect(after.board.guesses[0]?.tiles[0]).toBe('hidden');
  });

  it('Tally Lens is guaranteed in a shop once a vision curse is active', () => {
    const { state } = start('tally-shop');
    state.curses.push({ id: 'censor', stacks: 1 });
    state.nodeIndex = 0;
    state.nodes[1] = { kind: 'shop', level: 1 };
    state.phase = 'shop';
    const shop = enterShop(state).state.shop;
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
      const shop = enterShop(state).state.shop;
      expect(shop?.offers.some((offer) => offer.def === 'purge-the-d')).toBe(false);
    }
  });

  it('Heal restores half max HP', () => {
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
    expect(current.gold).toBe(13);
    current = act(current, { type: 'castSpell', instance: 's-heal' }).state;
    expect(current.gold).toBe(15);
    current = act(current, { type: 'castSpell', instance: 's-immunity' }).state;
    expect(current.gold).toBe(18);
    expect(ITEM_BY_ID.get('spellbook')?.dynamicDescription?.({ gold: 3 }))
      .toContain('+3 gold');
  });

  it('adds 2g Leftovers and 6g Iron Ration', () => {
    expect(ITEM_BY_ID.get('rabbit-foot')).toBeUndefined();
    expect(FOOD_BY_ID.get('leftovers')?.price).toBe(2);
    expect(FOOD_BY_ID.get('leftovers')?.effects)
      .toContainEqual({ type: 'healMissingPercent', percent: 50 });
    expect(FOOD_BY_ID.get('iron-ration')?.price).toBe(6);
    expect(FOOD_BY_ID.get('iron-ration')?.effects)
      .toContainEqual({ type: 'maxArmor', delta: 2 });
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
    expect(first.state.gold).toBe(14);
    const second = act(first.state, { type: 'guess', word: 'pious' });
    expect(second.state.gold).toBe(16);
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
    quick.state.round.playerGuesses = 1;
    const two = act(quick.state, { type: 'guess', word: 'crane' });
    expect(two.state.slots).toBe(6);

    const slow = start('shortcut-slow');
    slow.state.items.push({ instance: 'i-short', id: 'shortcut', data: {}, equipped: true });
    if (!slow.state.round) throw new Error('expected round');
    setAnswer(slow.state, 'crane');
    slow.state.round.totalGuesses = 2;
    slow.state.round.playerGuesses = 2;
    const three = act(slow.state, { type: 'guess', word: 'crane' });
    expect(three.state.slots).toBe(5);
  });

  it('counts only player guesses for within-X items', () => {
    const { state } = start('player-guess-count');
    state.curses.push({ id: 'clock', stacks: 1 });
    const next = nextRound(state);
    next.state.items.push({ instance: 'i-short', id: 'shortcut', data: {}, equipped: true });
    next.state.spells = [{ instance: 's-phone', id: 'phone-friend' }];
    setAnswer(next.state, 'crane');
    const cast = act(next.state, { type: 'castSpell', instance: 's-phone' });
    expect(cast.state.round?.guesses.filter((guess) => guess.by === 'friend')).toHaveLength(2);
    const solved = act(cast.state, { type: 'guess', word: 'crane' });
    expect(solved.state.slots).toBe(6); // one player guess, despite two friend guesses
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
    expect(FOOD_BY_ID.get('banh-mi')?.price).toBe(3);
    expect(FOOD_BY_ID.get('banh-mi')?.effects)
      .toContainEqual({ type: 'healPercent', percent: 30 });
    expect(FOOD_BY_ID.get('beshbarmak')?.price).toBe(5);
    expect(FOOD_BY_ID.get('beshbarmak')?.effects)
      .toContainEqual({ type: 'maxHpMultiply', factor: 1.05 });
    expect(FOOD_BY_ID.get('beshbarmak')?.effects)
      .toContainEqual({ type: 'healPercent', percent: 5 });
    expect(FOOD_BY_ID.get('die-coke')?.price).toBe(1);
    expect(FOOD_BY_ID.get('die-coke')?.effects)
      .toContainEqual({ type: 'healDiceGold', min: 1, max: 6 });
    expect(FOOD_BY_ID.get('overhealers-delight')?.price).toBe(3);
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

  it('sells the newest meal batch', () => {
    expect(FOOD_BY_ID.get('pho-dac-biet')?.price).toBe(6);
    expect(FOOD_BY_ID.get('pho-dac-biet')?.effects)
      .toContainEqual({ type: 'healPercent', percent: 100 });
    expect(FOOD_BY_ID.get('xiaolongbao')?.price).toBe(5);
    expect(FOOD_BY_ID.get('cheeseburger')?.price).toBe(3);
    expect(FOOD_BY_ID.get('double-cheeseburger')?.price).toBe(4);
    expect(FOOD_BY_ID.get('pani-puri')?.price).toBe(1);
    expect(FOOD_BY_ID.get('potato-chips')?.price).toBe(1);
    expect(FOOD_BY_ID.get('hagelslag')?.price).toBe(4);
    expect(FOOD_BY_ID.get('hagelslag')?.effects)
      .toContainEqual({ type: 'maxHp', delta: 3 });
    expect(FOOD_BY_ID.get('hagelslag')?.description).toContain('20%');
    expect(FOOD_BY_ID.get('hearty-stew')?.price).toBe(5);
    expect(FOOD_BY_ID.get('masala-dosa')?.price).toBe(3);
    expect(FOOD_BY_ID.get('cyrniki')?.price).toBe(4);
    expect(FOOD_BY_ID.get('menemen')?.price).toBe(4);
    expect(FOOD_BY_ID.get('big-eggplant')?.price).toBe(4);
    expect(FOOD_BY_ID.get('jumbo-hot-dog')?.price).toBe(3);
    expect(FOOD_BY_ID.get('juicy-peach')?.price).toBe(4);
    expect(FOOD_BY_ID.get('cherries')?.price).toBe(2);
    expect(FOOD_BY_ID.get('satchel')?.price).toBe(12);
    expect(FOOD_BY_ID.get('satchel')?.rarity).toBe('rare');
    expect(FOOD_BY_ID.get('o-toro')?.price).toBe(15);
    expect(FOOD_BY_ID.get('o-toro')?.effects)
      .toContainEqual({ type: 'revealLetter', letter: 'o' });
    expect(FOOD_BY_ID.get('i-spy')?.price).toBe(12);
    expect(FOOD_BY_ID.get('reveal-the-d')?.price).toBe(11);
    expect(FOOD_BY_ID.get('honey-cake')?.price).toBe(6);
    expect(FOOD_BY_ID.get('vitality')?.price).toBe(8);
    expect(FOOD_BY_ID.get('yin-yang')?.name).toBe('NY Cheesecake');
  });

  it('updates Arepa, Plov, cheeseburgers and cherries', () => {
    expect(FOOD_BY_ID.get('arepa')?.price).toBe(2);
    expect(FOOD_BY_ID.get('arepa')?.effects)
      .toContainEqual({ type: 'healPercent', percent: 20 });
    expect(FOOD_BY_ID.get('plov')?.price).toBe(4);
    expect(FOOD_BY_ID.get('plov')?.effects)
      .toContainEqual({ type: 'healMissingPercent', percent: 40 });
    expect(FOOD_BY_ID.get('cheeseburger')?.effects)
      .toContainEqual({ type: 'maxHp', delta: 3 });
    expect(FOOD_BY_ID.get('cheeseburger')?.effects)
      .toContainEqual({ type: 'damage', amount: 1, ignoreArmor: true });
    expect(FOOD_BY_ID.get('double-cheeseburger')?.effects)
      .toContainEqual({ type: 'maxHp', delta: 6 });
    expect(FOOD_BY_ID.get('double-cheeseburger')?.effects)
      .toContainEqual({ type: 'damage', amount: 2, ignoreArmor: true });
    expect(FOOD_BY_ID.get('cherries')?.description).toContain('gain a Heal spell');

    const burger = start('cheeseburger');
    burger.state.phase = 'shop';
    burger.state.gold = 20;
    burger.state.hp = 10;
    burger.state.armor = 4;
    burger.state.shop = shopState([{ id: 'o0', kind: 'eat', def: 'cheeseburger', price: 3 }]);
    const eaten = act(burger.state, { type: 'buy', offerId: 'o0' });
    expect(eaten.state.maxHp).toBe(19);
    expect(eaten.state.hp).toBe(9);
    expect(eaten.state.armor).toBe(4);
  });

  it('raises The Toll to 40% per stack', () => {
    expect(CURSE_BY_ID.get('toll')?.shopPriceAdd).toBe(0.4);
    expect(CURSE_BY_ID.get('toll')?.description).toContain('40%');
  });

  it('Knafeh queues the previous answer for the next round', () => {
    const { state } = start('knafeh');
    state.lastAnswer = 'crane';
    state.phase = 'shop';
    state.gold = 20;
    state.shop = shopState([{ id: 'o0', kind: 'eat', def: 'knafeh', price: 6 }]);
    const armorBefore = state.maxArmor;
    const bought = act(state, { type: 'buy', offerId: 'o0' });
    expect(bought.state.maxArmor).toBe(armorBefore + 1);
    expect(bought.state.nextRoundGuess).toBe('crane');

    bought.state.nodeIndex = 0;
    bought.state.nodes[1] = { kind: 'round' };
    bought.state.phase = 'shop';
    bought.state.shop = shopState();
    const next = act(bought.state, { type: 'continue' });
    expect(next.state.round?.guesses[0]?.word).toBe('crane');
    expect(next.state.round?.guesses[0]?.free).toBe(true);
    expect(next.state.nextRoundGuess).toBeUndefined();
  });

  it('King Mushroom caps the next round at 2 damage per wrong guess', () => {
    const { state } = start('king-mushroom');
    state.phase = 'shop';
    state.gold = 20;
    state.shop = shopState([{ id: 'o0', kind: 'eat', def: 'king-mushroom', price: 5 }]);
    const bought = act(state, { type: 'buy', offerId: 'o0' });
    expect(bought.state.nextRoundDamageCap).toBe(2);

    bought.state.nodeIndex = 0;
    bought.state.nodes[1] = { kind: 'round' };
    bought.state.phase = 'shop';
    bought.state.shop = shopState();
    const round = act(bought.state, { type: 'continue' });
    setAnswer(round.state, 'crane');
    round.state.round!.baseDamage = 9;
    round.state.round!.freeLeft = 0;
    round.state.armor = 0;
    const hpBefore = round.state.hp;
    const guessed = act(round.state, { type: 'guess', word: 'slate' });
    expect(hpBefore - guessed.state.hp).toBe(2);
  });

  it('Spell Pepper is a 3g food that doubles the next spell', () => {
    const def = FOOD_BY_ID.get('spell-pepper');
    expect(def?.price).toBe(3);
    expect(ITEM_BY_ID.has('spell-pepper')).toBe(false);

    const { state } = start('spell-pepper');
    state.phase = 'shop';
    state.gold = 20;
    state.hp = 4;
    state.spells.push({ instance: 's-heal', id: 'heal' });
    state.shop = shopState([{ id: 'o0', kind: 'eat', def: 'spell-pepper', price: 3 }]);
    const bought = act(state, { type: 'buy', offerId: 'o0' });
    expect(bought.state.nextSpellDouble).toBe(true);

    const cast = act(bought.state, { type: 'castSpell', instance: 's-heal' });
    expect(cast.state.hp).toBe(16); // heal 8 twice
    expect(cast.state.nextSpellDouble).toBe(false);
  });

  it('Chilaquiles is a 2g food that doubles the next two sales', () => {
    const { state } = start('chilaquiles');
    state.phase = 'shop';
    state.shop = shopState([{ id: 'o0', kind: 'eat', def: 'chilaquiles', price: 2 }]);
    state.items.push({ instance: 'i-glass', id: 'hourglass', data: {}, equipped: true });
    state.items.push({ instance: 'i-glass-2', id: 'hourglass', data: {}, equipped: true });
    const goldBefore = state.gold;
    const eaten = act(state, { type: 'buy', offerId: 'o0' });
    expect(eaten.state.gold).toBe(goldBefore - 2);
    expect(eaten.state.nextSaleDoubles).toBe(2);
    const sold = act(eaten.state, { type: 'sell', instance: 'i-glass' });
    const base = Math.floor((ITEM_BY_ID.get('hourglass')?.price ?? 2) / 2);
    expect(sold.state.gold - goldBefore).toBe(base * 2 - 2);
    expect(sold.state.nextSaleDoubles).toBe(1);
    const soldAgain = act(sold.state, { type: 'sell', instance: 'i-glass-2' });
    expect(soldAgain.state.gold - goldBefore).toBe(base * 4 - 2);
    expect(soldAgain.state.nextSaleDoubles).toBe(0);
    expect(ITEM_BY_ID.get('chilaquiles')).toBeUndefined();
    expect(FOOD_BY_ID.get('chilaquiles')?.price).toBe(2);
  });

  it('re-implements Piggy Bank at 2 gold plus 2 per round held', () => {
    const def = ITEM_BY_ID.get('piggy-bank');
    expect(def?.price).toBe(2);
    const item = { instance: 'i-pig', id: 'piggy-bank', data: { held: 4 }, equipped: true };
    expect(def?.sellValue?.({ state: start('piggy-value').state, self: item })).toBe(10);
    expect(def?.dynamicDescription?.({ held: 4 })).toContain('10 gold');
  });

  it('Midnight Snack is vision-gated and shows counts for 2 rounds', () => {
    const snack = FOOD_BY_ID.get('midnight-snack');
    expect(snack?.price).toBe(2);
    expect(snack?.requiresVisionCurse).toBe(1);
    expect(snack?.description).toContain('Next 2 rounds');
    expect(snack?.description.toLowerCase()).not.toContain('vision');
    expect(snack?.effects).toContainEqual({ type: 'visionCounts', rounds: 2 });

    const { state } = start('midnight-counts');
    state.curses.push({ id: 'censor', stacks: 1 });
    state.visionCountsRounds = 2;
    setAnswer(state, 'crane');
    const guessed = act(state, { type: 'guess', word: 'slate' });
    const phase = game.view(guessed.state).phase;
    if (phase.kind !== 'round') throw new Error('expected round');
    expect(phase.board.guesses[0]?.counts).toBeDefined();
  });

  it('Taco Pizza Party heals 12 and adds 1 max armor', () => {
    const def = FOOD_BY_ID.get('taco-pizza-party');
    expect(def?.price).toBe(9);
    expect(def?.effects).toContainEqual({ type: 'heal', amount: 12 });
    expect(def?.effects).toContainEqual({ type: 'maxArmor', delta: 1 });

    const { state } = start('taco-pizza');
    state.phase = 'shop';
    state.gold = 20;
    state.hp = 5;
    const armorBefore = state.maxArmor;
    state.shop = shopState([{ id: 'o0', kind: 'eat', def: 'taco-pizza-party', price: 9 }]);
    const eaten = act(state, { type: 'buy', offerId: 'o0' });
    expect(eaten.state.hp).toBe(16);
    expect(eaten.state.maxArmor).toBe(armorBefore + 1);
    expect(eaten.state.gold).toBe(11);
  });

  it('Coveted Cake trades an item slot for a random rare relic', () => {
    const def = FOOD_BY_ID.get('coveted-cake');
    expect(def?.price).toBe(11);
    expect(def?.rarity).toBe('rare');
    expect(def?.effects).toContainEqual({ type: 'slots', delta: -1 });
    expect(def?.effects).toContainEqual({ type: 'addRandomRelic' });

    const { state } = start('coveted-cake');
    state.phase = 'shop';
    state.gold = 20;
    const slotsBefore = state.slots;
    state.shop = shopState([{ id: 'o0', kind: 'eat', def: 'coveted-cake', price: 11 }]);
    const eaten = act(state, { type: 'buy', offerId: 'o0' });
    expect(eaten.state.gold).toBe(9);
    expect(eaten.state.slots).toBe(slotsBefore - 1);
    const relic = eaten.state.items.find((item) => ITEM_BY_ID.get(item.id)?.rarity === 'rare');
    expect(relic).toBeDefined();
  });

  it('Pho Dac Biet heals to full and Jumbo Hot Dog trades slots for HP', () => {
    const pho = start('pho-dac-biet');
    pho.state.phase = 'shop';
    pho.state.gold = 20;
    pho.state.hp = 3;
    pho.state.shop = shopState([{ id: 'o0', kind: 'eat', def: 'pho-dac-biet', price: 6 }]);
    const healed = act(pho.state, { type: 'buy', offerId: 'o0' });
    expect(healed.state.hp).toBe(healed.state.maxHp);

    const dog = start('jumbo-hot-dog');
    dog.state.phase = 'shop';
    dog.state.gold = 20;
    dog.state.slots = 5;
    dog.state.shop = shopState([{ id: 'o0', kind: 'eat', def: 'jumbo-hot-dog', price: 3 }]);
    const eaten = act(dog.state, { type: 'buy', offerId: 'o0' });
    expect(eaten.state.slots).toBe(6);
    expect(eaten.state.maxHp).toBe(6); // 16 - 10
  });

  it('Masala Dosa rerolls the shop offers', () => {
    const dosa = start('masala-dosa');
    dosa.state.phase = 'shop';
    dosa.state.gold = 20;
    dosa.state.shop = shopState([{ id: 'o0', kind: 'eat', def: 'masala-dosa', price: 3 }]);
    const bought = act(dosa.state, { type: 'buy', offerId: 'o0' });
    expect(bought.events.some((event) => event.type === 'shopRerolled')).toBe(true);
    expect(bought.state.shop?.offers.some((offer) => offer.def === 'masala-dosa')).toBe(false);
  });

  it('Banh Mi and Beshbarmak heal by percentage of max HP', () => {
    const banh = start('banh-mi');
    banh.state.phase = 'shop';
    banh.state.gold = 20;
    banh.state.hp = 5;
    banh.state.shop = shopState([{ id: 'o0', kind: 'eat', def: 'banh-mi', price: 3 }]);
    const eaten = act(banh.state, { type: 'buy', offerId: 'o0' });
    expect(eaten.state.maxHp).toBe(16);
    expect(eaten.state.hp).toBe(10); // 30% of 16 max HP, rounded up
    expect(eaten.state.gold).toBe(17);

    const besh = start('beshbarmak');
    besh.state.phase = 'shop';
    besh.state.gold = 20;
    besh.state.hp = 5;
    besh.state.shop = shopState([{ id: 'o0', kind: 'eat', def: 'beshbarmak', price: 5 }]);
    const feasted = act(besh.state, { type: 'buy', offerId: 'o0' });
    expect(feasted.state.maxHp).toBe(17); // +5% max HP (16 → 17)
    expect(feasted.state.hp).toBe(6); // heal 5% of 17, rounded up
    expect(feasted.state.gold).toBe(15);
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
    expect(plated.state.maxArmor).toBe(5);
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
    expect(ITEM_BY_ID.get('nest-egg')?.description).toContain('+3 gold');
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
    second.state.round!.elapsedMs = 7_000;
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
    expect(cast.state.maxArmor).toBe(6);
  });

  it('Clean Slate only pays once per round', () => {
    const { state } = start('clean-slate');
    state.items.push({ instance: 'i-clean', id: 'clean-slate', data: { used: 0 }, equipped: true });
    setAnswer(state, 'crane');
    const first = act(state, { type: 'guess', word: 'brick' });
    const trigger = act(first.state, { type: 'guess', word: 'vamps' });
    expect(trigger.state.maxArmor).toBe(5);
    const third = act(trigger.state, { type: 'guess', word: 'fizzy' });
    expect(third.state.maxArmor).toBe(5);
  });

  it('Empty Armor grants Restore when the round starts with no spells', () => {
    const { state } = start('empty-armor');
    state.items.push({ instance: 'i-empty', id: 'empty-armor', data: {}, equipped: true });
    state.spells = [];
    const next = nextRound(state);
    expect(next.state.spells.some((spell) => spell.id === 'restore')).toBe(true);
  });

  it('Empty Hand, Empty Armor and Cracked Orb all use the same round-start snapshot', () => {
    let sawOrbProc = false;
    for (let index = 0; index < 200 && !sawOrbProc; index++) {
      const { state } = start(`empty-stack-${index}`);
      state.spells = [];
      state.items.push(
        { instance: 'i-orb', id: 'cracked-orb', data: {}, equipped: true },
        { instance: 'i-hand-a', id: 'empty-hand', data: {}, equipped: true },
        { instance: 'i-hand-b', id: 'empty-hand', data: {}, equipped: true },
        { instance: 'i-armor', id: 'empty-armor', data: {}, equipped: true },
      );
      const next = nextRound(state);
      const spells = next.state.spells;
      expect(spells.length).toBeGreaterThanOrEqual(3);
      expect(spells.filter((spell) => spell.id === 'restore').length)
        .toBeGreaterThanOrEqual(1);
      if (spells.length === 4) sawOrbProc = true;
    }
    expect(sawOrbProc).toBe(true);
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

  it('removes Echo Chamber, Ritual Circle and Second Wind', () => {
    expect(ITEM_BY_ID.get('echo-chamber')).toBeUndefined();
    expect(ITEM_BY_ID.get('ritual-circle')).toBeUndefined();
    expect(ITEM_BY_ID.get('second-wind')).toBeUndefined();
  });

  it('uses the new rare relic prices', () => {
    const prices: Record<string, number> = {
      'acquired-taste': 26,
      'chrono-anchor': 28,
      counterweight: 26,
      'loaded-dice': 26,
      'loose-tongue': 24,
      'mending-plate': 26,
      'old-mcdonald': 30,
      'oracle-skull': 26,
      'phoenix-egg': 18,
      potluck: 26,
      quickdraw: 24,
      'speed-dial': 28,
      spellplate: 16,
      'thorn-crown': 26,
      'vowel-sigil': 18,
    };
    for (const [id, price] of Object.entries(prices)) {
      expect(ITEM_BY_ID.get(id)?.price, id).toBe(price);
    }
  });

  it('Quickdraw uses a 12s window and pays gold inside it', () => {
    const early = start('quickdraw-early');
    early.state.items.push({ instance: 'i-q', id: 'quickdraw', data: {}, equipped: true });
    const first = nextRound(early.state);
    setAnswer(first.state, 'crane');
    first.state.round!.freeLeft = 0;
    first.state.round!.elapsedMs = 11_000;
    const shielded = act(first.state, { type: 'guess', word: 'slate' });
    expect(shielded.state.round?.guesses[0].free).toBe(true);
    expect(shielded.state.hp).toBe(16);
    expect(shielded.state.gold).toBe(12);

    const late = start('quickdraw-late');
    late.state.items.push({ instance: 'i-q', id: 'quickdraw', data: {}, equipped: true });
    const second = nextRound(late.state);
    setAnswer(second.state, 'crane');
    second.state.round!.freeLeft = 0;
    second.state.round!.elapsedMs = 13_000;
    second.state.armor = 0;
    const unshielded = act(second.state, { type: 'guess', word: 'slate' });
    expect(unshielded.state.round?.guesses[0].free).toBe(false);
    expect(unshielded.state.hp).toBe(13);
  });

  it('Mending Plate starts with no armor bonus and pays per 5 HP healed', () => {
    const { state } = start('mending-plate');
    state.items.push({
      instance: 'i-mend',
      id: 'mending-plate',
      data: { healed: 0 },
      equipped: true,
    });
    expect(state.maxArmor).toBe(4);
    state.hp = 10;
    state.spells = [{ instance: 's-heal', id: 'heal' }];
    const cast = act(state, { type: 'castSpell', instance: 's-heal' });
    expect(cast.state.maxArmor).toBe(5);
  });

  it('Acquired Taste gives 4 max HP per new food', () => {
    const { state } = start('acquired-taste');
    state.items.push({
      instance: 'i-taste',
      id: 'acquired-taste',
      data: { _mask: 0, tasted: 0 },
      equipped: true,
    });
    state.phase = 'shop';
    state.gold = 40;
    state.shop = shopState([
      { id: 'f0', kind: 'eat', def: 'snack', price: 3 },
      { id: 'f1', kind: 'eat', def: 'candy', price: 4 },
    ]);
    let current = state;
    current = act(current, { type: 'buy', offerId: 'f0' }).state;
    current = act(current, { type: 'buy', offerId: 'f1' }).state;
    expect(current.maxHp).toBe(24);
  });

  it('applies the latest tweaks and text', () => {
    expect(ITEM_BY_ID.get('vowel-tithe')?.price).toBe(6);
    expect(ITEM_BY_ID.get('vowel-tithe')?.description).toContain('25%');
    expect(ITEM_BY_ID.get('tithe-box')?.price).toBe(10);
    expect(ITEM_BY_ID.get('iron-hide')?.price).toBe(6);
    expect(ITEM_BY_ID.get('thorn-crown')?.description).toContain('30%');
    expect(ITEM_BY_ID.get('vampire-teeth')).toBeUndefined();
    expect(ITEM_BY_ID.get('chrono-anchor')?.description).toContain('Taking damage: 30% chance');
    expect(ITEM_BY_ID.get('chrono-anchor')?.on?.onSolve).toBeUndefined();
    expect(ITEM_BY_ID.get('chrono-anchor')?.on?.onDamageTaken).toBeDefined();
  });

  it('Head Start is 6s and neither it nor Quickdraw is clock-gated', () => {
    expect(ITEM_BY_ID.get('head-start')?.description).toContain('6s');
    expect(ITEM_BY_ID.get('head-start')?.requiresClock).toBeUndefined();
    expect(ITEM_BY_ID.get('quickdraw')?.requiresClock).toBeUndefined();
    expect(ITEM_BY_ID.get('quickdraw')?.description).toBe('First 12s of each round: guesses are free.');
    expect(ITEM_BY_ID.get('quickdraw')?.on?.onGuessScored).toBeUndefined();
  });

  it('refuses stale clock-gated shop and reward offers after the clock is gone', () => {
    const shop = start('stale-shop');
    shop.state.phase = 'shop';
    shop.state.gold = 20;
    shop.state.shop = shopState([
      { id: 'o0', kind: 'item', def: 'hourglass', price: 6 },
      { id: 'o1', kind: 'eat', def: 'coffee', price: 6 },
    ]);
    const item = act(shop.state, { type: 'buy', offerId: 'o0' });
    expect(item.state.items).toHaveLength(0);
    expect(item.state.gold).toBe(20);
    expect(eventTypes(item.events)).toContain('shopRejected');
    const food = act(item.state, { type: 'buy', offerId: 'o1' });
    expect(food.state.gold).toBe(20);
    expect(eventTypes(food.events)).toContain('shopRejected');

    const reward = start('stale-reward');
    reward.state.phase = 'reward';
    reward.state.reward = {
      boss: false,
      options: [{
        id: 'i0',
        kind: 'item',
        def: 'hourglass',
        label: 'Hourglass',
        description: '+15s per round.',
      }],
    };
    const chosen = act(reward.state, { type: 'chooseReward', optionId: 'i0' });
    expect(chosen.state.items).toHaveLength(0);
    expect(chosen.state.phase).toBe('reward');
  });

  it('The Bargain grants its previewed item or curse with 60/40 odds', () => {
    let itemOutcomes = 0;
    let curseOutcomes = 0;
    for (let index = 0; index < 120; index++) {
      const { state } = start(`bargain-${index}`);
      state.phase = 'happening';
      state.happening = {
        id: 'the-bargain',
        options: [],
        previewItem: 'encore',
        previewCurse: 'without-d',
      };
      const result = act(state, { type: 'choose', optionId: 'draw' });
      if (result.state.items.length > 0) {
        itemOutcomes++;
        expect(result.state.items[0].id).toBe('encore');
      }
      if (result.state.curses.length > 0) {
        curseOutcomes++;
        expect(result.state.curses[0].id).toBe('without-d');
      }
    }
    expect(itemOutcomes).toBeGreaterThan(curseOutcomes);
    expect(itemOutcomes).toBeGreaterThan(0);
    expect(curseOutcomes).toBeGreaterThan(0);
  });

  it('The Bargain previews vary per event', () => {
    const items = new Set<string>();
    const curses = new Set<string>();
    for (let index = 0; index < 200 && (items.size < 2 || curses.size < 2); index++) {
      const { state } = start(`bargain-open-${index}`);
      state.nodeIndex = 0;
      state.nodes[1] = { kind: 'happening', level: 1 };
      state.phase = 'shop';
      const opened = act(state, { type: 'continue' }).state;
      if (opened.happening?.id !== 'the-bargain') continue;
      if (opened.happening.previewItem) items.add(opened.happening.previewItem);
      if (opened.happening.previewCurse) curses.add(opened.happening.previewCurse);
    }
    expect(items.size).toBeGreaterThan(1);
    expect(curses.size).toBeGreaterThan(1);
  });

  it('offers rare items in shops much more often', () => {
    let shopsWithRare = 0;
    for (let index = 0; index < 100; index++) {
      const { state } = start(`rare-shop-${index}`);
      state.curses.push({ id: 'clock', stacks: 1 });
      state.nodeIndex = 0;
      state.nodes[1] = { kind: 'shop', level: 1 };
      state.phase = 'shop';
      const offers = enterShop(state).state.shop?.offers ?? [];
      if (offers.some((offer) => offer.kind === 'item'
        && ITEM_BY_ID.get(offer.def)?.rarity === 'rare')) {
        shopsWithRare++;
      }
    }
    expect(shopsWithRare).toBeGreaterThan(40);
  });

  it('prices every shop spell at 4 gold', () => {
    let spells = 0;
    for (let index = 0; index < 60; index++) {
      const { state } = start(`spell-price-${index}`);
      state.nodeIndex = 0;
      state.nodes[1] = { kind: 'shop', level: 1 };
      state.phase = 'shop';
      const offers = enterShop(state).state.shop?.offers ?? [];
      for (const offer of offers) {
        if (offer.kind === 'spell') {
          spells++;
          expect(offer.price).toBe(4);
        }
      }
    }
    expect(spells).toBeGreaterThan(0);
    expect(ITEM_BY_ID.get('stopped-clock')?.price).toBe(6);
  });

  it('Head Start and Quickdraw do not stack their windows', () => {
    const { state } = start('shield-stack');
    state.items.push(
      { instance: 'i-hs', id: 'head-start', data: {}, equipped: true },
      { instance: 'i-qd', id: 'quickdraw', data: {}, equipped: true },
    );
    const next = nextRound(state);
    expect(next.state.round?.immuneUntilMs).toBe(12_000);
  });

  it('Frozen Durian grants Time Freeze every 4 foods', () => {
    const { state } = start('frozen-durian');
    state.items.push({
      instance: 'i-durian',
      id: 'frozen-durian',
      data: { eaten: 0 },
      equipped: true,
    });
    state.phase = 'shop';
    state.gold = 100;
    state.shop = shopState([
      { id: 'f0', kind: 'eat', def: 'snack', price: 3 },
      { id: 'f1', kind: 'eat', def: 'snack', price: 3 },
      { id: 'f2', kind: 'eat', def: 'snack', price: 3 },
      { id: 'f3', kind: 'eat', def: 'snack', price: 3 },
    ]);
    let current = state;
    for (const id of ['f0', 'f1', 'f2']) {
      current = act(current, { type: 'buy', offerId: id }).state;
      expect(current.spells).toHaveLength(1);
    }
    current = act(current, { type: 'buy', offerId: 'f3' }).state;
    expect(current.spells).toHaveLength(2);
    expect(current.items.find((item) => item.id === 'frozen-durian')?.data.eaten).toBe(0);
    expect(ITEM_BY_ID.get('frozen-durian')?.price).toBe(8);
  });

  it('Ice Cream Sundae rolls Time Freeze or heal +1 max HP', () => {
    let freeze = 0;
    let growth = 0;
    for (let index = 0; index < 60; index++) {
      const { state } = start(`sundae-${index}`);
      state.phase = 'shop';
      state.gold = 20;
      state.shop = shopState([
        { id: 'o0', kind: 'item', def: 'ice-cream-sundae', price: 3 },
      ]);
      const bought = act(state, { type: 'buy', offerId: 'o0' });
      expect(bought.state.items.some((item) => item.id === 'ice-cream-sundae')).toBe(false);
      if (bought.state.maxHp === 17) growth++;
      if (bought.state.spells.some((spell) => spell.id === 'time-freeze')) freeze++;
    }
    expect(freeze).toBeGreaterThan(0);
    expect(growth).toBeGreaterThan(0);
    expect(ITEM_BY_ID.get('ice-cream-sundae')?.price).toBe(3);
  });

  it('Daredevil is clock-gated and shortens rounds by 25%', () => {
    const { state } = start('daredevil');
    state.curses.push({ id: 'clock', stacks: 1 });
    state.items.push({ instance: 'i-dare', id: 'daredevil', data: {}, equipped: true });
    const next = nextRound(state);
    expect(next.state.round?.remainingMs).toBe(225_000);
    expect(ITEM_BY_ID.get('daredevil')?.requiresClock).toBe(true);
    expect(ITEM_BY_ID.get('daredevil')?.description).toContain('25% shorter');
  });

  it('applies the latest prices and text', () => {
    expect(FOOD_BY_ID.get('plating')?.price).toBe(3);
    expect(FOOD_BY_ID.get('plating')?.effects).toContainEqual({ type: 'maxArmor', delta: 1 });
    expect(ITEM_BY_ID.get('compound-interest')?.price).toBe(4);
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
    expect(SPELL_BY_ID.get('heal')?.description).toBe('Heal half of your max HP.');
    expect(HAPPENING_BY_ID.get('black-market')?.options.find((option) => option.id === 'spell')?.costGold).toBe(2);
    expect(HAPPENING_BY_ID.get('black-market')?.options.find((option) => option.id === 'armor')?.costGold).toBe(3);
    expect(CURSE_BY_ID.get('tax')?.description).toBe('Encounter gold is reduced by 40%.');
  });
});

describe('spells and foods', () => {
  it('has six spells and no Time Warp', () => {
    expect(SPELLS).toHaveLength(6);
    expect(SPELL_BY_ID.get('time-warp')).toBeUndefined();
  });

  it('uses the new Time Freeze text', () => {
    expect(SPELL_BY_ID.get('time-freeze')?.description)
      .toBe('Get a free and unobscured guess. Doesn\'t count towards the number of guesses (for certain items). Freeze the Clock.');
  });

  it('prices Pen Club at 15 gold for a 1-5 gold payout', () => {
    const pen = ITEM_BY_ID.get('pen-club');
    expect(pen?.price).toBe(15);
    expect(pen?.description).toContain('1-5 gold');
  });

  it('has rare purge foods', () => {
    expect(FOOD_BY_ID.get('inkcap')?.price).toBe(16);
    expect(FOOD_BY_ID.get('purge-the-d')?.price).toBe(12);
    expect(FOOD_BY_ID.get('purge-the-d')?.rarity).toBe('rare');
  });

  it('gives Coffee +5s for 2 gold and Chronos +12s', () => {
    expect(FOOD_BY_ID.get('coffee')?.price).toBe(2);
    expect(FOOD_BY_ID.get('coffee')?.effects).toContainEqual({ type: 'timeBonus', ms: 5_000 });
    expect(FOOD_BY_ID.get('chronos')?.effects).toContainEqual({ type: 'timeBonus', ms: 12_000 });
  });

  it('Snake Oil has a 30% chance to remove a random curse', () => {
    expect(FOOD_BY_ID.get('snake-oil')?.price).toBe(6);
    expect(FOOD_BY_ID.get('snake-oil')?.description).toContain('30% chance');

    let removed = 0;
    const runs = 150;
    for (let i = 0; i < runs; i++) {
      const { state } = start(`snake-${i}`);
      state.curses.push({ id: 'heavy-hand', stacks: 1 });
      state.gold = 20;
      state.phase = 'shop';
      state.shop = shopState([{ id: 'o0', kind: 'eat', def: 'snake-oil', price: 6 }]);
      const bought = act(state, { type: 'buy', offerId: 'o0' });
      expect(bought.state.gold).toBe(14);
      if (bought.state.curses.length === 0) removed++;
    }
    // 30% of 150 runs is ~45; wide bounds keep the seeded run deterministic.
    expect(removed).toBeGreaterThanOrEqual(25);
    expect(removed).toBeLessThanOrEqual(70);
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
      } else if (state.phase === 'shopChoice') {
        result = act(state, { type: 'choose', optionId: 'shop' });
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
