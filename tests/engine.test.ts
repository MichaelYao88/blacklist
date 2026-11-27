import { describe, expect, it } from 'vitest';
import { game } from '../src/game';
import type {
  Command,
  Effect,
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
  FOODS,
  HAPPENING_BY_ID,
  ITEM_BY_ID,
  SPELL_BY_ID,
  SPELLS,
} from '../src/content';
import { necronomiconPool, necronomiconTier } from '../src/content/items';

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

function forcePositionHides(state: RunState, ...indices: number[]): void {
  if (!state.round) return;
  for (const guess of state.round.guesses) guess.positionHides = indices;
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

function findHappeningById(prefix: string, id: string): StepResult {
  for (let index = 0; index < 900; index++) {
    const run = start(`${prefix}-${index}`);
    const next = nextHappening(run.state);
    if (next.state.happening?.id === id) return next;
  }
  throw new Error(`could not find happening ${id}`);
}

/** Advance into a boss intro. */
function enterBoss(state: RunState, bossId: string): StepResult {
  const bossIndex = nodeAt(state, (node) => node.kind === 'boss' && node.boss === bossId);
  state.nodeIndex = bossIndex - 1;
  state.phase = 'shop';
  state.shop = shopState();
  return act(state, { type: 'continue' });
}

function enterMiniboss(state: RunState): StepResult {
  return enterBoss(state, 'miniboss');
}

function enterFloorBoss(state: RunState): StepResult {
  return enterBoss(state, 'floor-boss');
}

describe('cursed run setup', () => {
  it('starts at level 1 with no clock, blacklist or curses', () => {
    const { state, events } = start();
    expect(state.phase).toBe('round');
    expect(state.level).toBe(1);
    expect(state.hp).toBe(15);
    expect(state.maxHp).toBe(15);
    expect(state.armor).toBe(7);
    expect(state.gold).toBe(12);
    expect(state.slots).toBe(4);
    expect(state.blacklist).toEqual([]);
    expect(state.curses).toEqual([]);
    expect(state.spells).toHaveLength(1);
    expect(state.spells[0].id).toBe('omen');
    expect(state.round?.remainingMs).toBeNull();
    expect(state.round?.baseDamage).toBe(3);
    expect(eventTypes(events)).toContain('runStarted');
  });

  it('applies preset character starts', () => {
    const soldier = game.newRun({ seed: 'preset-soldier' }).state;
    expect(soldier.character).toBe('runner');
    expect(soldier.maxHp).toBe(15);
    expect(soldier.maxArmor).toBe(7);
    expect(soldier.gold).toBe(12);

    const pathfinder = game.newRun({ seed: 'preset-pathfinder', character: 'pathfinder' }).state;
    expect(pathfinder.character).toBe('pathfinder');
    expect(pathfinder.maxHp).toBe(21);
    expect(pathfinder.maxArmor).toBe(3);
    expect(pathfinder.armor).toBe(3);
    expect(pathfinder.gold).toBe(9);
    expect(pathfinder.items.some((item) => item.id === 'head-start' && item.equipped)).toBe(true);
    expect(pathfinder.curses.some((curse) => curse.id === 'the-list')).toBe(true);

    const necro = game.newRun({ seed: 'preset-necro', character: 'necromancer' }).state;
    expect(necro.character).toBe('necromancer');
    expect(necro.maxHp).toBe(31);
    expect(necro.maxArmor).toBe(4);
    expect(necro.armor).toBe(4);
    expect(necro.gold).toBe(16);
    expect(necro.items.some((item) => item.id === 'necronomicon' && item.equipped)).toBe(true);
    expect(necro.curses.some((curse) => curse.id === 'sleeper')).toBe(true);

    const purgamist = game.newRun({ seed: 'preset-purgamist', character: 'purgamist' }).state;
    expect(purgamist.character).toBe('purgamist');
    expect(purgamist.maxHp).toBe(18);
    expect(purgamist.maxArmor).toBe(5);
    expect(purgamist.gold).toBe(17);
    expect(purgamist.pendingPurge).toBe(0);
    expect(purgamist.phase).toBe('round');
    expect(purgamist.level).toBe(1);
    expect(purgamist.round).toBeDefined();
    expect(purgamist.items.some((item) => item.id === 'travel-inkwell' && item.equipped)).toBe(true);
    expect(purgamist.items.some((item) => item.id === 'soapstone' && item.equipped)).toBe(true);
    expect(purgamist.curses.some((curse) => curse.id === 'without-d')).toBe(true);

    const gourmand = game.newRun({ seed: 'preset-gourmand', character: 'gourmand' }).state;
    expect(gourmand.character).toBe('gourmand');
    expect(gourmand.maxHp).toBe(25);
    expect(gourmand.maxArmor).toBe(4);
    expect(gourmand.gold).toBe(6);
    expect(gourmand.items.some((item) => item.id === 'potluck' && item.equipped)).toBe(true);
    expect(gourmand.curses.some((curse) => curse.id === 'porcupine')).toBe(true);

    const farmer = game.newRun({ seed: 'preset-farmer', character: 'farmer' }).state;
    expect(farmer.character).toBe('farmer');
    expect(farmer.maxHp).toBe(17);
    expect(farmer.maxArmor).toBe(3);
    expect(farmer.armor).toBe(3);
    expect(farmer.gold).toBe(2);
    expect(farmer.items.filter((item) => item.id === 'harvest-charm' && item.equipped))
      .toHaveLength(3);
    expect(farmer.items.some((item) => item.id === 'early-bird' && item.equipped)).toBe(true);
    expect(farmer.curses).toEqual([{ id: 'short-fuse', stacks: 1 }]);

    const emptyArmor = game.newRun({ seed: 'preset-empty-armor', character: 'empty-armor' }).state;
    expect(emptyArmor.character).toBe('empty-armor');
    expect(emptyArmor.maxHp).toBe(1);
    expect(emptyArmor.maxArmor).toBe(13);
    expect(emptyArmor.armor).toBe(13);
    expect(emptyArmor.slots).toBe(5);
    expect(emptyArmor.gold).toBe(6);
    expect(emptyArmor.items.some((item) => item.id === 'bulwark' && item.equipped)).toBe(true);
    expect(emptyArmor.curses.some((curse) => curse.id === 'slow-mending')).toBe(true);

    const werewolf = game.newRun({ seed: 'preset-werewolf', character: 'werewolf' }).state;
    expect(werewolf.character).toBe('werewolf');
    expect(werewolf.maxHp).toBe(69);
    expect(werewolf.maxArmor).toBe(0);
    expect(werewolf.armor).toBe(0);
    expect(werewolf.slots).toBe(2);
    expect(werewolf.gold).toBe(6);
    expect(werewolf.items.some((item) => item.id === 'dark-echo' && item.equipped)).toBe(true);
    expect(werewolf.items.some((item) => item.id === 'thorn-crown' && item.equipped)).toBe(true);
    expect(werewolf.curses.some((curse) => curse.id === 'weak-plate')).toBe(true);
    expect(werewolf.curses.some((curse) => curse.id === 'tight-slots')).toBe(true);
  });

  it('builds a 40-floor map with the Miniboss on 23, the Floor Boss on 39, and the Mysterious Room on 40', () => {
    const { state } = start();
    expect(nodeAt(state, (node) => node.kind === 'boss')).toBeGreaterThan(0);
    expect(state.nodes.filter((node) => node.kind === 'boss')).toHaveLength(2);
    expect(state.nodes.filter((node) => node.kind === 'round')).toHaveLength(18);
    expect(state.nodes.filter((node) => node.kind === 'shop')).toHaveLength(10);
    expect(state.nodes.filter((node) => node.kind === 'curse')).toHaveLength(12);
    expect(state.nodes.filter((node) => node.kind === 'mysteriousRoom')).toHaveLength(1);
    expect(state.nodes.find((node) => node.kind === 'boss' && node.boss === 'miniboss')?.level)
      .toBe(23);
    expect(state.nodes.find((node) => node.kind === 'boss' && node.boss === 'floor-boss')?.level)
      .toBe(39);
    expect(state.nodes.find((node) => node.kind === 'mysteriousRoom')?.level)
      .toBe(40);
    expect(state.nodes.some((node) => node.kind === 'boss' && node.level === 27)).toBe(false);
    expect(state.nodes
      .filter((node) => node.level === 38)
      .map((node) => node.kind))
      .toEqual(['shop', 'curse', 'curse', 'curse']);
    expect(state.nodes.every((node) => (node.level ?? 0) <= 40)).toBe(true);

    const labeled = state.nodes
      .filter((node) => node.kind !== 'happening')
      .slice(0, 8)
      .map((node) => `${node.kind}:${node.level}`);
    expect(labeled).toEqual([
      'round:1', 'shop:2', 'round:3', 'curse:4',
      'round:5', 'shop:6', 'round:7', 'curse:8',
    ]);

    for (const event of state.nodes.filter((node) => node.kind === 'happening')) {
      const index = state.nodes.indexOf(event);
      expect(state.nodes[index - 1].kind).toBe('round');
      expect(state.nodes[index - 1].level).toBe(event.level);
    }
  });

  it('opens a starting curse draft for Ascension 1 through 10', () => {
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

    const ten = start('asc10', 10);
    expect(ten.state.ascension).toBe(10);
    expect(ten.state.pendingStartingCurses).toBe(10);
    expect(game.view(ten.state).phase.kind).toBe('curse');

    const clamped = start('asc11', 11);
    expect(clamped.state.ascension).toBe(10);
    expect(clamped.state.pendingStartingCurses).toBe(10);
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

describe('vision curses and Counter-Intelligence', () => {
  it('hides the first tile with Censor and shows counts with Counter-Intelligence', () => {
    const { state } = start();
    setAnswer(state, 'crane');
    state.curses.push({ id: 'censor', stacks: 1 });
    state.items.push({ instance: 'i-tally', id: 'tally-lens', data: {}, equipped: true });

    const guess = act(state, { type: 'guess', word: 'slate' });
    forcePositionHides(guess.state, 0);
    const view = game.view(guess.state);
    if (view.phase.kind !== 'round') throw new Error('expected round');
    expect(view.phase.board.guesses[0].tiles[0]).toBe('hidden');
    expect(view.phase.board.guesses[0].counts).toBeDefined();
  });

  it('position curses hide their tile about half the time', () => {
    expect(CURSE_BY_ID.get('censor')?.description).toContain('50%');
    expect(CURSE_BY_ID.get('third-eye')?.description).toContain('50%');

    let hidden = 0;
    let shown = 0;
    for (let index = 0; index < 40; index++) {
      const { state } = start(`vision-half-${index}`);
      setAnswer(state, 'crane');
      state.curses.push({ id: 'censor', stacks: 1 });
      state.round!.freeLeft = 0;
      const guess = act(state, { type: 'guess', word: 'slate' });
      const view = game.view(guess.state).phase;
      if (view.kind !== 'round') throw new Error('expected round');
      if (view.board.guesses[0].tiles[0] === 'hidden') hidden++;
      else shown++;
    }
    expect(hidden).toBeGreaterThan(0);
    expect(shown).toBeGreaterThan(0);
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
  it('base damage is 3 plus curse stacks, and Heavy Hand adds 50% per stack', () => {
    const { state } = start();
    expect(state.round?.baseDamage).toBe(3);
    state.curses.push({ id: 'heavy-hand', stacks: 2 });
    const next = nextRound(state);
    expect(next.state.round?.baseDamage).toBe(11);
    expect(CURSE_BY_ID.get('heavy-hand')?.damageMultiplier).toBe(1.5);
    expect(CURSE_BY_ID.get('heavy-hand')?.description).toContain('50%');
  });

  it('removes Piercing and Wasting from the curse pool', () => {
    expect(CURSE_BY_ID.get('piercing')).toBeUndefined();
    expect(CURSE_BY_ID.get('wasting')).toBeUndefined();
  });

  it('raises base damage by 1.3 per curse stack, rounded down', () => {
    const { state } = start('curse-damage');
    state.curses.push({ id: 'censor', stacks: 1 });
    state.curses.push({ id: 'clock', stacks: 1 });
    expect(nextRound(state).state.round?.baseDamage).toBe(5);

    for (const [stacks, expected] of [[1, 4], [2, 5], [3, 6], [4, 8]] as const) {
      const run = start(`curse-damage-${stacks}`);
      run.state.curses.push({ id: 'censor', stacks });
      expect(nextRound(run.state).state.round?.baseDamage, String(stacks)).toBe(expected);
    }
  });

  it('Turtle Shell halves hits that armor does not soak', () => {
    const { state } = start('turtle-shell');
    state.items.push({ instance: 'i-shell', id: 'turtle-shell', data: {}, equipped: true });
    state.round!.freeLeft = 0;
    setAnswer(state, 'crane');

    state.armor = 1;
    const soaked = act(state, { type: 'guess', word: 'slate' });
    expect(soaked.state.hp).toBe(13); // 1 armor, then 2 HP damage, not halved

    const unarmored = act(soaked.state, { type: 'guess', word: 'brick' });
    expect(unarmored.state.hp).toBe(12); // 3 unarmored damage, halved to 1
  });

  it('Pain au Chocolat halves only the first hit armor does not soak', () => {
    const { state } = start('pain-au-chocolat');
    state.phase = 'shop';
    state.gold = 100;
    state.shop = shopState([{ id: 'f0', kind: 'eat', def: 'pain-au-chocolat', price: 14 }]);
    const eaten = act(state, { type: 'buy', offerId: 'f0' }).state;
    expect(eaten.unarmoredHalfCharges).toBe(1);
    expect(eaten.eatenFoods).toContain('pain-au-chocolat');

    eaten.phase = 'round';
    eaten.round!.freeLeft = 0;
    setAnswer(eaten, 'crane');
    eaten.armor = 1;
    const soaked = act(eaten, { type: 'guess', word: 'slate' });
    expect(soaked.state.hp).toBe(13); // armor soaked this one, so the charge remains
    expect(soaked.state.unarmoredHalfCharges).toBe(1);

    const soft = act(soaked.state, { type: 'guess', word: 'brick' });
    expect(soft.state.hp).toBe(12); // first unarmored hit is halved
    expect(soft.state.unarmoredHalfCharges).toBe(0);

    const normal = act(soft.state, { type: 'guess', word: 'vamps' });
    expect(normal.state.hp).toBe(9); // later unarmored hits are normal
  });

  it('offsets base damage by 1.3 per starting curse stack', () => {
    const pathfinder = game.newRun({ seed: 'starting-curse-damage', character: 'pathfinder' }).state;
    expect(pathfinder.round?.baseDamage).toBe(3); // 3 + 1 - 1.3 -> 3 after rounding

    const werewolf = game.newRun({ seed: 'starting-curse-damage-wolf', character: 'werewolf' }).state;
    expect(werewolf.round?.baseDamage).toBe(2); // 3 + 2 - 2.6 -> 2 after rounding
  });

  it('adds Turtle Shell and Pain au Chocolat', () => {
    expect(ITEM_BY_ID.get('turtle-shell')?.price).toBe(8);
    expect(ITEM_BY_ID.get('turtle-shell')?.unarmoredHitMultiplier).toBe(0.5);
    const food = FOOD_BY_ID.get('pain-au-chocolat');
    expect(food?.price).toBe(14);
    expect(food?.rarity).toBe('rare');
    expect(food?.unique).toBe(true);
    expect(food?.effects).toContainEqual({ type: 'unarmoredHalfCharges', count: 1 });
  });

  it('Porcupine damages the next guess based on previous greens', () => {
    const { state } = start('porcupine');
    state.curses.push({ id: 'porcupine', stacks: 1 });
    const next = nextRound(state);
    setAnswer(next.state, 'crane');
    next.state.round!.freeLeft = 0;
    next.state.armor = 0;
    next.state.maxHp = 15;
    next.state.hp = 15;
    const first = act(next.state, { type: 'guess', word: 'slate' });
    expect(first.state.hp).toBe(11);
    const second = act(first.state, { type: 'guess', word: 'pious' });
    expect(second.state.hp).toBe(3);
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
  it('starts at 5:00 and loses 40% per extra Clock stack', () => {
    const { state } = start();
    state.curses.push({ id: 'clock', stacks: 1 });
    const first = nextRound(state);
    expect(first.state.round?.remainingMs).toBe(300_000);

    first.state.curses[0].stacks = 2;
    const second = nextRound(first.state);
    expect(second.state.round?.remainingMs).toBe(180_000);
  });

  it('running out of time ends the run immediately', () => {
    const { state } = start('timeout-defeat');
    state.curses.push({ id: 'clock', stacks: 1 });
    state.items.push({ instance: 'i-phoenix', id: 'phoenix-egg', data: {}, equipped: true });
    const started = nextRound(state);
    const view = game.view(started.state);
    if (view.phase.kind !== 'round') throw new Error('expected round');
    expect('timeoutDamage' in view.phase.board).toBe(false);
    const answer = started.state.round!.answer;

    started.state.hp = 40;
    started.state.armor = 99;
    started.state.round!.immuneUntilMs = 60_000;
    started.state.round!.remainingMs = 1;
    const timedOut = act(started.state, { type: 'tick', dtMs: 2_000 });
    expect(timedOut.state.phase).toBe('over');
    expect(timedOut.state.over?.result).toBe('defeat');
    expect(timedOut.state.over?.answer).toBe(answer);
    expect(timedOut.state.hp).toBe(0);
    expect(timedOut.state.items.some((item) => item.id === 'phoenix-egg')).toBe(true);
    expect(timedOut.state.stats.timeouts).toBe(1);
    expect(timedOut.events.some((event) => event.type === 'timeExpired')).toBe(true);
    expect(timedOut.events.some(
      (event) => event.type === 'roundEnded' && event.outcome === 'timeout',
    )).toBe(true);
    expect(timedOut.events.some(
      (event) => event.type === 'runEnded' && event.result === 'defeat',
    )).toBe(true);
  });

  it('shows count-up time when a timer-interest item is equipped', () => {
    const { state } = start();
    state.items.push({ instance: 'i-early', id: 'early-bird', data: {}, equipped: true });
    const view = game.view(state);
    if (view.phase.kind !== 'round') throw new Error('expected round');
    expect(view.phase.board.timerMode).toBe('countup');
  });

  it('Early Bird pays for solves under a minute', () => {
    const quick = start('early-bird-compare');
    quick.state.items.push({ instance: 'i-early', id: 'early-bird', data: { gold: 2 }, equipped: true });
    setAnswer(quick.state, 'crane');
    quick.state.round!.elapsedMs = 59_999;
    const solved = act(quick.state, { type: 'guess', word: 'crane' });

    const late = start('early-bird-compare');
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
    state.maxHp = 15;
    state.hp = 10;
    setAnswer(state, 'crane');
    const solved = act(state, { type: 'guess', word: 'crane' });
    expect(solved.state.maxHp).toBe(17);
    expect(solved.state.hp).toBe(14);
    expect(ITEM_BY_ID.get('photosynthesis')?.price).toBe(10);
    expect(ITEM_BY_ID.get('photosynthesis')?.description)
      .toContain('+2 max HP');
  });

  it('Adrenaline raises max HP and armor when HP crosses below 50%', () => {
    const { state } = start('adrenaline');
    state.items.push({ instance: 'i-adr', id: 'adrenaline', data: { armed: 1 }, equipped: true });
    state.maxHp = 15;
    state.hp = 9;
    state.armor = 0;
    state.maxArmor = 0;
    state.round!.freeLeft = 0;
    setAnswer(state, 'crane');

    const hit = act(state, { type: 'guess', word: 'slate' }); // 3 damage -> 6 HP
    expect(hit.state.hp).toBe(6);
    expect(hit.state.maxHp).toBe(18);
    expect(hit.state.maxArmor).toBe(1);
    expect(hit.state.items.find((item) => item.id === 'adrenaline')?.data.armed).toBe(0);

    const again = act(hit.state, { type: 'guess', word: 'brick' });
    expect(again.state.maxHp).toBe(18);
    expect(again.state.maxArmor).toBe(1);

    again.state.spells = [{ instance: 's-heal', id: 'heal' }];
    const healed = act(again.state, { type: 'castSpell', instance: 's-heal' });
    expect(healed.state.hp).toBeGreaterThanOrEqual(10.5);
    expect(healed.state.maxHp).toBe(19);
    expect(healed.state.items.find((item) => item.id === 'adrenaline')?.data.armed).toBe(1);

    healed.state.hp = 10;
    healed.state.armor = 0;
    const second = act(healed.state, { type: 'guess', word: 'fizzy' });
    expect(second.state.hp).toBe(7);
    expect(second.state.maxHp).toBe(22);
    expect(second.state.maxArmor).toBe(2);
    expect(ITEM_BY_ID.get('adrenaline')?.price).toBe(10);
    expect(ITEM_BY_ID.get('adrenaline')?.description).toContain('+3 max HP');
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
    expect(guess.state.hp).toBe(15);
    expect(guess.state.round?.guesses.at(-1)?.free).toBe(true);
    expect(guess.state.round?.nextFreeUnobscured).toBe(false);
    const view = game.view(guess.state).phase;
    if (view.kind !== 'round') throw new Error('expected round');
    expect(view.board.guesses[0].tiles[0]).not.toBe('hidden');

    const next = act(guess.state, { type: 'guess', word: 'slate' });
    forcePositionHides(next.state, 0);
    const after = game.view(next.state).phase;
    if (after.kind !== 'round') throw new Error('expected round');
    expect(after.board.guesses[1].tiles[0]).toBe('hidden');
  });

  it('Time Freeze is free and unobscured with a clock and a position curse', () => {
    const { state } = start('time-freeze-clock');
    state.curses.push({ id: 'clock', stacks: 1 });
    state.curses.push({ id: 'censor', stacks: 1 });
    setAnswer(state, 'crane');
    state.round!.remainingMs = 300_000;
    state.round!.timerStartMs = 300_000;
    state.round!.freeLeft = 0;
    state.spells.push({ instance: 's-freeze', id: 'time-freeze' });
    const cast = act(state, { type: 'castSpell', instance: 's-freeze' });
    expect(cast.state.round?.frozenUntilGuess).toBe(true);
    expect(cast.state.round?.nextFreeUnobscured).toBe(true);
    expect(cast.state.round?.freeLeft).toBe(1);

    const guess = act(cast.state, { type: 'guess', word: 'slate' });
    expect(guess.state.round?.guesses.at(-1)?.free).toBe(true);
    expect(guess.state.round?.guesses.at(-1)?.unobscured).toBe(true);
    const view = game.view(guess.state).phase;
    if (view.kind !== 'round') throw new Error('expected round');
    expect(view.board.guesses[0].tiles[0]).not.toBe('hidden');
  });

  it('stops the clock until the next guess', () => {
    const { state } = start('time-freeze-tick');
    state.curses.push({ id: 'clock', stacks: 1 });
    setAnswer(state, 'crane');
    state.round!.remainingMs = 300_000;
    state.round!.timerStartMs = 300_000;
    state.round!.freeLeft = 0;
    state.spells.push({ instance: 's-freeze', id: 'time-freeze' });
    const cast = act(state, { type: 'castSpell', instance: 's-freeze' });
    expect(cast.state.round?.frozenUntilGuess).toBe(true);

    const frozen = act(cast.state, { type: 'tick', dtMs: 5_000 });
    expect(frozen.state.round?.remainingMs).toBe(300_000);
    expect(frozen.state.round?.frozenUntilGuess).toBe(true);

    const guess = act(frozen.state, { type: 'guess', word: 'slate' });
    expect(guess.state.round?.frozenUntilGuess).toBe(false);
    const resumed = act(guess.state, { type: 'tick', dtMs: 1_000 });
    expect(resumed.state.round?.remainingMs).toBe(299_000);
  });

  it('does not let friend guesses or autoguesses end Time Freeze', () => {
    const { state } = start('time-freeze-friends');
    state.curses.push({ id: 'clock', stacks: 1 });
    setAnswer(state, 'zzzzz');
    state.round!.remainingMs = 300_000;
    state.round!.timerStartMs = 300_000;
    state.round!.freeLeft = 0;
    state.spells = [
      { instance: 's-freeze', id: 'time-freeze' },
      { instance: 's-phone', id: 'phone-friend' },
    ];

    const frozen = act(state, { type: 'castSpell', instance: 's-freeze' });
    const phone = act(frozen.state, { type: 'castSpell', instance: 's-phone' });
    expect(phone.state.round?.guesses.some((guess) => guess.by === 'friend')).toBe(true);
    expect(phone.state.round?.frozenUntilGuess).toBe(true);
    expect(phone.state.round?.remainingMs).toBe(305_000);

    const ticked = act(phone.state, { type: 'tick', dtMs: 5_000 });
    expect(ticked.state.round?.remainingMs).toBe(305_000);

    const guess = act(ticked.state, { type: 'guess', word: 'slate' });
    expect(guess.state.round?.frozenUntilGuess).toBe(false);
  });

  it('Restore ignores a position curse for the rest of the round', () => {
    const { state } = start('restore-position');
    state.curses.push({ id: 'censor', stacks: 1 });
    setAnswer(state, 'crane');
    state.round!.freeLeft = 0;
    state.spells.push({ instance: 's-restore', id: 'restore' });
    const cast = act(state, { type: 'castSpell', instance: 's-restore' });
    const guess = act(cast.state, { type: 'guess', word: 'slate' });
    const view = game.view(guess.state).phase;
    if (view.kind !== 'round') throw new Error('expected round');
    expect(view.board.guesses[0].tiles[0]).not.toBe('hidden');
  });

  it('does not count Time Freeze free guesses for solve-count items', () => {
    const { state } = start('time-freeze-count');
    state.items.push({ instance: 'i-growth', id: 'growth-spurt', data: {}, equipped: true });
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
    expect(solved.state.maxHp).toBe(18);
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
    expect(gatedItems.has('meal-timer')).toBe(true);

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
    expect(bought.state.maxArmor).toBe(7);
    expect(bought.state.items.some((item) => ITEM_BY_ID.get(item.id)?.rarity === 'rare')).toBe(false);
    expect(eventTypes(bought.events)).toContain('message');
  });

  it('the Curse Broker removes a random curse', () => {
    const { state } = start();
    state.curses.push({ id: 'censor', stacks: 1 });
    state.phase = 'happening';
    state.happening = { id: 'curse-broker', options: [] };
    state.gold = 200;

    const bought = act(state, { type: 'choose', optionId: 'remove' });
    expect(bought.state.gold).toBe(185);
    expect(bought.state.curses).toEqual([]);
    expect(bought.state.pendingCurseRemoval).toBe(0);
  });

  it('the Curse Broker only sells one thing per visit', () => {
    const { state } = start();
    state.curses.push({ id: 'censor', stacks: 1 });
    state.phase = 'happening';
    state.happening = { id: 'curse-broker', options: [] };
    state.gold = 50;

    const first = act(state, { type: 'choose', optionId: 'relic' });
    expect(first.state.gold).toBe(38);
    expect(first.state.happening?.resolved).toBeDefined();

    const second = act(first.state, { type: 'choose', optionId: 'remove' });
    expect(second.state.gold).toBe(38);
    expect(second.state.curses).toHaveLength(1);
  });

  it('Babification removes a curse and forces a starting-value penalty', () => {
    const event = HAPPENING_BY_ID.get('babification');
    expect(event?.options.map((option) => option.id)).toEqual(['slots', 'armor']);

    const slotsState = start('babification-slots');
    slotsState.state.curses.push({ id: 'censor', stacks: 1 }, { id: 'clock', stacks: 1 });
    slotsState.state.slots = 8;
    slotsState.state.phase = 'happening';
    slotsState.state.happening = { id: 'babification', options: [] };
    const slotsChosen = act(slotsState.state, { type: 'choose', optionId: 'slots' });
    expect(slotsChosen.state.curses).toHaveLength(1);
    expect(slotsChosen.state.slots).toBe(4);

    const armorState = start('babification-armor');
    armorState.state.curses.push({ id: 'censor', stacks: 1 }, { id: 'clock', stacks: 1 });
    armorState.state.maxArmor = 9;
    armorState.state.armor = 9;
    armorState.state.phase = 'happening';
    armorState.state.happening = { id: 'babification', options: [] };
    const armorChosen = act(armorState.state, { type: 'choose', optionId: 'armor' });
    expect(armorChosen.state.curses).toHaveLength(1);
    expect(armorChosen.state.maxArmor).toBe(7);
    expect(armorChosen.state.armor).toBe(7);
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
    expect(rested.state.maxHp).toBe(16);
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
    expect(detour?.options.map((option) => option.id)).toEqual(['slot', 'bakery']);
    const bakery = detour?.options.find((option) => option.id === 'bakery');
    expect(bakery?.outcomes[0].effects).toEqual([
      { type: 'maxHp', delta: 8 },
      { type: 'giveSpell', spell: 'time-freeze' },
    ]);

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

  it('adds The Hollow Pocket and The Forbidden Feast events', () => {
    const hollow = HAPPENING_BY_ID.get('hollow-pocket');
    expect(hollow?.options.map((option) => option.id)).toEqual(['slot', 'gamble']);
    expect(hollow?.options.find((option) => option.id === 'slot')?.outcomes[0].effects)
      .toEqual([{ type: 'slots', delta: -1 }]);
    const gamble = hollow?.options.find((option) => option.id === 'gamble');
    expect(gamble?.outcomes.map((outcome) => outcome.chancePct)).toEqual([50, 50]);
    expect(gamble?.outcomes[0].effects).toEqual([]);
    expect(gamble?.outcomes[1].effects).toEqual([{ type: 'addPreviewCurse' }]);

    const feast = HAPPENING_BY_ID.get('forbidden-feast');
    expect(feast?.options.map((option) => option.id)).toEqual(['eat', 'leave']);
    const eat = feast?.options.find((option) => option.id === 'eat');
    expect(eat?.outcomes.map((outcome) => outcome.chancePct)).toEqual([50, 50]);
    expect(eat?.outcomes[0].effects).toEqual([{ type: 'addPreviewFood' }]);
    expect(eat?.outcomes[1].effects).toEqual([
      { type: 'addPreviewFood' },
      { type: 'addPreviewCurse' },
    ]);

    const market = HAPPENING_BY_ID.get('flesh-market');
    expect(market?.options.map((option) => option.id)).toEqual(['hp', 'armor', 'leave']);
  });

  it('The Flesh Market sells half your max HP for twice that much gold', () => {
    const run = findHappeningById('flesh-market-hp', 'flesh-market');
    const option = run.state.happening!.options.find((entry) => entry.id === 'hp')!;
    const loss = Math.min(Math.floor(run.state.maxHp / 2), run.state.maxHp - 1);
    const paid = loss * 2;
    expect(option.description).toContain(`${loss} max HP`);
    expect(option.description).toContain(`${paid} gold`);
    expect(option.locked).toBe(false);

    const maxHpBefore = run.state.maxHp;
    const goldBefore = run.state.gold;
    const sold = act(run.state, { type: 'choose', optionId: 'hp' });
    expect(sold.state.maxHp).toBe(maxHpBefore - loss);
    expect(sold.state.gold).toBe(goldBefore + paid);
    expect(sold.state.happening?.resolved?.success).toBe(true);
  });

  it('The Flesh Market sells all your armor for four times that much gold', () => {
    const run = findHappeningById('flesh-market-armor', 'flesh-market');
    const option = run.state.happening!.options.find((entry) => entry.id === 'armor')!;
    const armorBefore = run.state.maxArmor;
    expect(option.description).toContain(`${armorBefore} max armor`);
    expect(option.description).toContain(`${armorBefore * 4} gold`);
    expect(option.locked).toBe(false);

    const goldBefore = run.state.gold;
    const sold = act(run.state, { type: 'choose', optionId: 'armor' });
    expect(sold.state.maxArmor).toBe(0);
    expect(sold.state.armor).toBe(0);
    expect(sold.state.gold).toBe(goldBefore + armorBefore * 4);
    expect(sold.state.happening?.resolved?.success).toBe(true);
  });

  it('locks the Flesh Market armor sale when there is no armor', () => {
    let found: StepResult | undefined;
    for (let index = 0; index < 900 && !found; index++) {
      const run = start(`flesh-market-broke-${index}`);
      run.state.maxArmor = 0;
      run.state.armor = 0;
      const next = nextHappening(run.state);
      if (next.state.happening?.id === 'flesh-market') found = next;
    }
    expect(found).toBeDefined();
    const option = found!.state.happening!.options.find((entry) => entry.id === 'armor')!;
    expect(option.locked).toBe(true);
    expect(option.description).toContain('no armor');
    const refused = act(found!.state, { type: 'choose', optionId: 'armor' });
    expect(refused.state.happening?.resolved).toBeUndefined();
    expect(refused.state.maxArmor).toBe(0);
  });

  it('resolves The Hollow Pocket slot loss and curse gamble', () => {
    const slot = findHappeningById('hollow-slot', 'hollow-pocket');
    const slotsBefore = slot.state.slots;
    const lost = act(slot.state, { type: 'choose', optionId: 'slot' });
    expect(lost.state.slots).toBe(slotsBefore - 1);

    const safe = findHappeningById('hollow-safe', 'hollow-pocket');
    safe.state.rng = 0; // 26.6%: the pocket is empty
    const nothing = act(safe.state, { type: 'choose', optionId: 'gamble' });
    expect(nothing.state.curses).toHaveLength(0);
    expect(nothing.state.happening?.resolved?.success).toBe(true);

    const risk = findHappeningById('hollow-risk', 'hollow-pocket');
    const preview = risk.state.happening?.previewCurse;
    expect(preview).toBeDefined();
    expect(risk.state.happening?.options.find((option) => option.id === 'gamble')?.description)
      .toContain(CURSE_BY_ID.get(preview!)?.name ?? '');
    risk.state.rng = 1; // 62.7%: the curse lands
    const cursed = act(risk.state, { type: 'choose', optionId: 'gamble' });
    expect(cursed.state.curses.some((curse) => curse.id === preview)).toBe(true);
    expect(cursed.state.happening?.resolved?.success).toBe(false);
  });

  it('resolves The Forbidden Feast with a specific rare food and curse roll', () => {
    const feast = findHappeningById('feast-preview', 'forbidden-feast');
    const previewFood = feast.state.happening?.previewFood;
    const previewCurse = feast.state.happening?.previewCurse;
    expect(FOOD_BY_ID.get(previewFood ?? '')?.rarity).toBe('rare');
    expect(previewCurse).toBeDefined();
    const eatOption = feast.state.happening?.options.find((option) => option.id === 'eat');
    expect(eatOption?.description).toContain(FOOD_BY_ID.get(previewFood!)?.name ?? '');
    expect(eatOption?.description).toContain(CURSE_BY_ID.get(previewCurse!)?.name ?? '');

    const safe = findHappeningById('feast-safe', 'forbidden-feast');
    const safeFood = safe.state.happening!.previewFood!;
    const safeCurse = safe.state.happening!.previewCurse!;
    safe.state.rng = 0; // 26.6%: food only
    const foodOnly = act(safe.state, { type: 'choose', optionId: 'eat' });
    expect(foodOnly.events.some(
      (event) => event.type === 'foodEaten' && event.food === safeFood,
    )).toBe(true);
    expect(foodOnly.state.curses.some((curse) => curse.id === safeCurse)).toBe(false);

    const risk = findHappeningById('feast-risk', 'forbidden-feast');
    const riskFood = risk.state.happening!.previewFood!;
    const riskCurse = risk.state.happening!.previewCurse!;
    risk.state.rng = 1; // 62.7%: food and curse
    const cursed = act(risk.state, { type: 'choose', optionId: 'eat' });
    expect(cursed.events.some(
      (event) => event.type === 'foodEaten' && event.food === riskFood,
    )).toBe(true);
    expect(cursed.state.curses.some((curse) => curse.id === riskCurse)).toBe(true);

    const leave = findHappeningById('feast-leave', 'forbidden-feast');
    const walked = act(leave.state, { type: 'choose', optionId: 'leave' });
    expect(walked.state.curses).toHaveLength(0);
    expect(walked.state.happening?.resolved?.success).toBe(true);
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
    expect(coin?.options.find((option) => option.id === 'slot')?.costGold).toBe(10);
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

  it('The Coin Box charges 1 gold for two Heals or 10 gold for a slot', () => {
    const { state } = start('coin-box');
    state.gold = 10;
    state.phase = 'happening';
    state.happening = { id: 'coin-box', options: [] };
    const bought = act(state, { type: 'choose', optionId: 'slot' });
    expect(bought.state.gold).toBe(0);
    expect(bought.state.slots).toBe(5);
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

  it('visits the Time Bakery from the Detour for +8 max HP and a Time Freeze', () => {
    const { state } = start('detour-bakery');
    state.phase = 'happening';
    state.happening = { id: 'detour', options: [] };
    state.spells = [];
    const startMax = state.maxHp;
    const chosen = act(state, { type: 'choose', optionId: 'bakery' });
    expect(chosen.state.maxHp).toBe(startMax + 8);
    expect(chosen.state.spells.some((spell) => spell.id === 'time-freeze')).toBe(true);
    expect(chosen.state.phase).toBe('happening');
    expect(chosen.state.happening?.resolved?.option).toBe('bakery');
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

  it('grants +4 max HP and heals to full at the inn', () => {
    const { state } = start('inn-heal');
    state.nodeIndex = 0;
    state.nodes[1] = { kind: 'shop', level: 1 };
    state.phase = 'shop';
    state.hp = 3;
    const startMax = state.maxHp;
    const arrived = act(state, { type: 'continue' });
    arrived.state.rng = 1; // next roll is 62.7%, so the shop stays closed
    const rested = act(arrived.state, { type: 'choose', optionId: 'inn' });
    expect(rested.state.maxHp).toBe(startMax + 4);
    expect(rested.state.hp).toBe(rested.state.maxHp);
    expect(rested.state.shop).toBeUndefined();
    expect(rested.state.phase).not.toBe('shop');

    // Resting at full health still grants the max HP.
    const healthy = start('inn-healthy');
    healthy.state.nodeIndex = 0;
    healthy.state.nodes[1] = { kind: 'shop', level: 1 };
    healthy.state.phase = 'shop';
    const healthyMax = healthy.state.maxHp;
    const healthyArrived = act(healthy.state, { type: 'continue' });
    healthyArrived.state.rng = 1;
    const restedHealthy = act(healthyArrived.state, { type: 'choose', optionId: 'inn' });
    expect(restedHealthy.state.maxHp).toBe(healthyMax + 4);
    expect(restedHealthy.state.hp).toBe(restedHealthy.state.maxHp);
  });

  it('sometimes leaves the shop open after resting at the inn', () => {
    const { state } = start('inn-shop-open');
    state.nodeIndex = 0;
    state.nodes[1] = { kind: 'shop', level: 1 };
    state.phase = 'shop';
    const startMax = state.maxHp;
    const arrived = act(state, { type: 'continue' });
    arrived.state.rng = 0; // next roll is 26.6%, so the shop stays open
    const rested = act(arrived.state, { type: 'choose', optionId: 'inn' });
    expect(rested.state.maxHp).toBe(startMax + 4);
    expect(rested.state.hp).toBe(rested.state.maxHp);
    expect(rested.state.phase).toBe('shop');
    expect(rested.state.shop?.offers.length).toBeGreaterThan(0);
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
    state.items = state.items.filter((item) => item.id !== 'evil-parrot');
    state.phase = 'shop';
    state.shop = shopState();
    state.curses.push({ id: 'chained', stacks: 1 });
    state.items.push({ instance: 'i-hour', id: 'piggy-bank', data: {}, equipped: true });
    const sold = act(state, { type: 'sell', instance: 'i-hour' });
    expect(sold.state.items).toHaveLength(1);
    expect(eventTypes(sold.events)).toContain('message');
  });
});

describe('event balance pass', () => {
  it('The Scavenger trades a 40% slot for a 60% ten-damage bite', () => {
    const reach = HAPPENING_BY_ID.get('scavenger')?.options.find((option) => option.id === 'reach');
    expect(reach?.description).toBe('40%: +1 slot. 60%: −10 HP.');
    expect(reach?.outcomes.map((outcome) => outcome.chancePct)).toEqual([40, 60]);
    expect(reach?.outcomes[0].effects).toEqual([{ type: 'slots', delta: 1 }]);
    expect(reach?.outcomes[1].effects).toEqual([{ type: 'damage', amount: 10 }]);
  });

  it('The Letter Garden prints the floor level and scales its damage to it', () => {
    const pull = HAPPENING_BY_ID.get('letter-garden')?.options.find((option) => option.id === 'pull');
    expect(pull?.outcomes.map((outcome) => outcome.chancePct)).toEqual([50, 50]);
    expect(pull?.outcomes[1].effects).toEqual([{ type: 'damageLevel' }]);

    for (let index = 0; index < 400; index++) {
      const { state } = start(`letter-garden-${index}`);
      state.nodeIndex = 0;
      state.nodes[1] = { kind: 'happening', level: 12 };
      state.phase = 'shop';
      state.shop = shopState();
      const arrived = act(state, { type: 'continue' });
      if (arrived.state.happening?.id !== 'letter-garden') continue;

      const shown = arrived.state.happening.options.find((option) => option.id === 'pull');
      expect(shown?.description).toContain('−12 HP');
      expect(shown?.description).not.toContain('{level}');
      expect(shown?.outcomes[1].text).toContain('−12 HP');

      arrived.state.armor = 0;
      arrived.state.maxArmor = 0;
      arrived.state.maxHp = 50;
      arrived.state.hp = 50;
      const hpBefore = arrived.state.hp;
      const chosen = act(arrived.state, { type: 'choose', optionId: 'pull' });
      if (chosen.state.hp !== hpBefore - 12) continue;

      expect(chosen.state.happening?.resolved?.text).toContain('−12 HP');
      expect(chosen.state.happening?.resolved?.text).not.toContain('{level}');
      return;
    }
    throw new Error('never saw the Letter Garden damage outcome');
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
      { instance: 'i-boss-aegis', id: 'boss-aegis', data: {}, equipped: true },
      { instance: 'i-trophy-room', id: 'trophy-room', data: {}, equipped: true },
    );
    state.curse = { options: ['censor'], starting: false };
    state.phase = 'curse';
    const chosen = act(state, { type: 'chooseCurse', curseId: 'censor' });
    expect(chosen.state.maxHp).toBe(21);
    expect(chosen.state.hp).toBe(21);
    expect(chosen.state.maxArmor).toBe(9);
    expect(chosen.state.slots).toBe(5);
    expect(chosen.state.spells).toHaveLength(1);
  });

  it('describes all of them as Gain a curse', () => {
    for (const id of ['trophy-hunter', 'boss-aegis', 'trophy-room']) {
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

  it('Omen never reveals a letter already seen yellow or green', () => {
    const { state } = start('omen-skip-known');
    state.round!.answer = 'crane';
    state.round!.freeLeft = 0;
    const guessed = act(state, { type: 'guess', word: 'slate' });
    const present = new Set(
      guessed.state.round!.guesses.flatMap((guess) =>
        guess.truth.flatMap((tile, i) =>
          tile === 'correct' || tile === 'present' ? [guess.word[i]] : []),
      ),
    );
    expect([...present].sort()).toEqual(['a', 'e']);
    guessed.state.spells = [{ instance: 's-omen', id: 'omen' }];
    const cast = act(guessed.state, { type: 'castSpell', instance: 's-omen' });
    const hint = Object.keys(cast.state.round!.hints ?? {})[0];
    expect(present.has(hint)).toBe(false);
    expect(['c', 'r', 'n']).toContain(hint);
  });

  it('Omen reveals a letter whose only present tile was hidden by a position curse', () => {
    const { state } = start('omen-hidden-position');
    state.curses.push({ id: 'fourth-wall', stacks: 1 });
    state.round!.answer = 'spear';
    state.round!.freeLeft = 0;
    state.round!.hints = { a: 'present', e: 'present' };
    // CRISP puts S on the fourth tile, which Fourth Wall hides.
    const guessed = act(state, { type: 'guess', word: 'crisp' });
    forcePositionHides(guessed.state, 3);
    expect(guessed.state.round!.hints.s).toBeUndefined();
    guessed.state.spells = [{ instance: 's-omen', id: 'omen' }];
    const cast = act(guessed.state, { type: 'castSpell', instance: 's-omen' });
    expect(cast.state.round!.hints.s).toBe('present');
  });

  it("Old McDonald's queues one free EIEIO guess for the next round", () => {
    const { state } = start('old-mcdonald');
    state.phase = 'shop';
    state.gold = 20;
    state.shop = shopState([{ id: 'f0', kind: 'eat', def: 'old-mcdonald', price: 4 }]);
    const bought = act(state, { type: 'buy', offerId: 'f0' });
    expect(bought.state.nextRoundWord).toBe('eieio');
    const next = nextRound(bought.state);
    const guess = next.state.round?.guesses.find((entry) => entry.word === 'eieio');
    expect(guess).toBeDefined();
    expect(guess?.free).toBe(true);
    expect(next.state.hp).toBe(15);
    expect(next.state.nextRoundWord).toBeUndefined();
    const second = nextRound(next.state);
    expect(second.state.round?.guesses.some((entry) => entry.word === 'eieio')).toBe(false);
    expect(FOOD_BY_ID.get('old-mcdonald')?.name).toBe("Old McDonald's");
    expect(FOOD_BY_ID.get('old-mcdonald')?.price).toBe(4);
    expect(FOOD_BY_ID.get('old-mcdonald')?.unique).toBe(true);
    expect(FOOD_BY_ID.get('old-mcdonald')?.effects)
      .toContainEqual({ type: 'queueNextRoundWord', word: 'eieio' });
  });

  it('removes the damage cap and prices letter foods by rarity', () => {
    expect(ITEM_BY_ID.get('hard-hat')).toBeUndefined();
    expect(FOOD_BY_ID.get('q-tip')?.price).toBe(6);
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
    expect(first.state.gold).toBeGreaterThanOrEqual(21); // 12 start + 5 hat + 4-8 solve
    expect(first.state.gold).toBeLessThanOrEqual(25);
    expect(first.state.items.find((item) => item.id === 'hat-trick')?.data.gold).toBe(7);

    const second = nextRound(first.state);
    setAnswer(second.state, 'crane');
    const secondSolve = act(second.state, { type: 'guess', word: 'crane' });
    expect(secondSolve.state.gold).toBeGreaterThanOrEqual(first.state.gold + 11);
    expect(secondSolve.state.gold).toBeLessThanOrEqual(first.state.gold + 15);
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
  it('pays a random 4-8 gold on solve regardless of guess count', () => {
    for (let index = 0; index < 30; index++) {
      const { state } = start(`gold-roll-${index}`);
      if (!state.round) throw new Error('expected round');
      setAnswer(state, 'crane');
      state.round.totalGuesses = index;
      state.round.playerGuesses = index;
      const solved = act(state, { type: 'guess', word: 'crane' });
      expect(solved.state.gold - 12).toBeGreaterThanOrEqual(4);
      expect(solved.state.gold - 12).toBeLessThanOrEqual(8);
    }
  });

  it('Brace pays 1 max armor, Bloom grows max HP, Patch Kit heals 30% +1', () => {
    const brace = start('brace');
    brace.state.items.push({ instance: 'i-brace', id: 'brace', data: {}, equipped: true });
    setAnswer(brace.state, 'crane');
    const braced = act(brace.state, { type: 'guess', word: 'crane' });
    expect(braced.state.maxArmor).toBe(8);
    expect(ITEM_BY_ID.get('brace')?.price).toBe(6);

    const bloom = start('bloom');
    bloom.state.items.push({ instance: 'i-bloom', id: 'bloom', data: { hp: 5 }, equipped: true });
    setAnswer(bloom.state, 'crane');
    const grown = act(bloom.state, { type: 'guess', word: 'crane' });
    expect(grown.state.maxHp).toBe(20);
    expect(grown.state.items.find((item) => item.id === 'bloom')?.data.hp).toBe(6);
    const bloomNext = nextRound(grown.state);
    setAnswer(bloomNext.state, 'crane');
    const grownAgain = act(bloomNext.state, { type: 'guess', word: 'crane' });
    expect(grownAgain.state.maxHp).toBe(26);

    const patch = start('patch-kit');
    patch.state.items.push({ instance: 'i-patch', id: 'patch-kit', data: {}, equipped: true });
    patch.state.maxHp = 15;
    patch.state.hp = 10;
    setAnswer(patch.state, 'crane');
    const patched = act(patch.state, { type: 'guess', word: 'crane' });
    expect(patched.state.hp).toBe(15);
  });

  it('Hearty Stew grants one or two casts of Heal', () => {
    for (const seed of ['stew-a', 'stew-b', 'stew-c', 'stew-d', 'stew-e', 'stew-f']) {
      const { state } = start(seed);
      state.phase = 'shop';
      state.gold = 20;
      state.shop = shopState([{ id: 'o0', kind: 'eat', def: 'hearty-stew', price: 4 }]);
      const before = state.spells.filter((spell) => spell.id === 'heal').length;
      const eaten = act(state, { type: 'buy', offerId: 'o0' });
      expect(eaten.state.gold).toBe(16);
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

  it('removes Bottomless from the content set', () => {
    expect(ITEM_BY_ID.get('bottomless')).toBeUndefined();
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
    state.items = state.items.filter((item) => item.id !== 'evil-parrot');
    for (let index = 0; index < 5; index++) {
      state.items.push({
        instance: `i-hour-${index}`,
        id: 'piggy-bank',
        data: {},
        equipped: true,
      });
    }
    state.curse = { options: ['tight-slots'], starting: false };
    state.phase = 'curse';
    const cursed = act(state, { type: 'chooseCurse', curseId: 'tight-slots' });
    expect(cursed.state.slots).toBe(2);
    expect(cursed.state.items.filter((item) => item.equipped)).toHaveLength(2);
    expect(cursed.state.items.filter((item) => !item.equipped)).toHaveLength(3);
  });

  it('replaces a gear offer with food when item slots are full', () => {
    const { state } = start('shop-full-slots');
    for (let index = 0; index < 4; index++) {
      state.items.push({
        instance: `i-full-${index}`,
        id: 'piggy-bank',
        data: {},
        equipped: true,
      });
    }
    state.nodeIndex = 0;
    state.nodes[1] = { kind: 'shop', level: 1 };
    state.phase = 'shop';
    const shop = enterShop(state).state.shop;
    const items = shop?.offers.filter((offer) => offer.kind === 'item') ?? [];
    const foods = shop?.offers.filter((offer) => offer.kind === 'eat') ?? [];
    expect(items).toHaveLength(2);
    expect(foods.length).toBeGreaterThanOrEqual(3);
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

  it('Shop Upgrade is a 14g rare unique food that grants two extra wildcards', () => {
    const food = FOOD_BY_ID.get('shop-upgrade');
    expect(food?.price).toBe(14);
    expect(food?.rarity).toBe('rare');
    expect(food?.unique).toBe(true);
    expect(food?.effects).toEqual([{ type: 'shopWildcardSlots', count: 2 }]);
  });

  it('Shop Upgrade adds two offers to future shops', () => {
    const control = start('shop-upgrade-slots');
    control.state.nodeIndex = 0;
    control.state.nodes[1] = { kind: 'shop', level: 1 };
    control.state.phase = 'shop';
    const baseOffers = enterShop(control.state).state.shop?.offers ?? [];

    const upgraded = start('shop-upgrade-slots');
    upgraded.state.shopWildcardBonus = 2;
    upgraded.state.nodeIndex = 0;
    upgraded.state.nodes[1] = { kind: 'shop', level: 1 };
    upgraded.state.phase = 'shop';
    const upgradedOffers = enterShop(upgraded.state).state.shop?.offers ?? [];

    expect(upgradedOffers.length).toBe(baseOffers.length + 2);
  });

  it('The Gourmand starts with Shop Upgrade already eaten', () => {
    const { state } = game.newRun({ seed: 'gourmand-shop-upgrade', character: 'gourmand' });
    expect(state.eatenFoods).toContain('shop-upgrade');
    expect(state.shopWildcardBonus).toBe(2);
  });

  it('The Endless Table fires on-eat effects 7 times', () => {
    const { state } = start('endless-table');
    state.items.push({ instance: 'i-gour', id: 'gourmand', data: {}, equipped: true });
    state.phase = 'happening';
    state.happening = { id: 'endless-table', options: [] };
    const eaten = act(state, { type: 'choose', optionId: 'eat' });
    expect(eaten.state.maxHp).toBe(22);
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
    expect(eaten.state.maxHp).toBe(16);

    const caster = start('gourmand-cast');
    caster.state.items.push({ instance: 'i-gour', id: 'gourmand', data: {}, equipped: true });
    caster.state.spells.push({ instance: 's-omen', id: 'omen' });
    const cast = act(caster.state, { type: 'castSpell', instance: 's-omen' });
    expect(cast.state.maxHp).toBe(16);
  });

  it('Muffin Tin is a 3g food that grants permanent armor for food eaten this shop', () => {
    expect(FOOD_BY_ID.get('muffin-tin')?.price).toBe(3);
    expect(ITEM_BY_ID.get('muffin-tin')).toBeUndefined();
    expect(ITEM_BY_ID.get('bulk-order')).toBeUndefined();

    const { state } = start('muffin-food');
    state.phase = 'shop';
    state.gold = 100;
    state.shop = shopState([
      { id: 'f0', kind: 'eat', def: 'snack', price: 3 },
      { id: 'f1', kind: 'eat', def: 'muffin-tin', price: 3 },
      { id: 'f2', kind: 'eat', def: 'feast', price: 5 },
    ]);
    const base = state.maxArmor;
    let current = act(state, { type: 'buy', offerId: 'f0' }).state;
    current = act(current, { type: 'buy', offerId: 'f1' }).state;
    expect(current.maxArmor).toBe(base); // the tin does not count itself
    current = act(current, { type: 'buy', offerId: 'f2' }).state;
    expect(current.maxArmor).toBe(base + 1);

    current.nodeIndex = 0;
    current.nodes[1] = { kind: 'shop', level: 1 };
    const left = act(current, { type: 'continue' });
    expect(left.state.maxArmor).toBe(base + 1); // armor persists after leaving
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
    expect(current.maxArmor).toBe(base);
    current = act(current, { type: 'buy', offerId: 'f1' }).state;
    expect(current.maxArmor).toBe(base + 1); // the second tin sees the first
    current = act(current, { type: 'buy', offerId: 'f2' }).state;
    expect(current.maxArmor).toBe(base + 3); // one food with two tins
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
    expect(eaten.state.maxArmor).toBe(base); // the tin does not count itself
    expect(eaten.state.phase).toBe('shopChoice');
    expect(eaten.state.pendingMuffinStacks).toBe(1);

    const entered = act(eaten.state, { type: 'choose', optionId: 'shop' });
    expect(entered.state.phase).toBe('shop');
    expect(entered.state.muffinStacks).toBe(1);
    expect(entered.state.pendingMuffinStacks).toBe(0);
    entered.state.gold = 100;
    entered.state.shop!.offers = [{ id: 'f0', kind: 'eat', def: 'snack', price: 3 }];
    const fed = act(entered.state, { type: 'buy', offerId: 'f0' });
    expect(fed.state.maxArmor).toBe(base + 1);
  });

  it('Muffin Tin keeps counting across a shop reroll', () => {
    const { state } = start('muffin-reroll');
    state.phase = 'shop';
    state.gold = 100;
    state.shop = shopState([{ id: 'f0', kind: 'eat', def: 'muffin-tin', price: 2 }]);
    const base = state.maxArmor;
    let current = act(state, { type: 'buy', offerId: 'f0' }).state;
    expect(current.maxArmor).toBe(base);
    current = act(current, { type: 'reroll' }).state;
    current.shop!.offers = [{ id: 'f1', kind: 'eat', def: 'feast', price: 5 }];
    current.shop!.foodOffers = 1;
    current.shop!.foodsBought = 0;
    current = act(current, { type: 'buy', offerId: 'f1' }).state;
    expect(current.maxArmor).toBe(base + 1);
  });

  it('Muffin Tin does not count foods eaten in another shop', () => {
    const { state } = start('muffin-visit');
    state.phase = 'shop';
    state.gold = 100;
    state.shop = shopState([{ id: 'f0', kind: 'eat', def: 'muffin-tin', price: 2 }]);
    const base = state.maxArmor;
    let current = act(state, { type: 'buy', offerId: 'f0' }).state;
    expect(current.maxArmor).toBe(base);

    current.shop = { ...shopState([{ id: 'f1', kind: 'eat', def: 'feast', price: 5 }]), visit: 9 };
    current = act(current, { type: 'buy', offerId: 'f1' }).state;
    expect(current.maxArmor).toBe(base);
  });

  it('Bulwark advertises its 11 damage blocked threshold and costs 8', () => {
    expect(ITEM_BY_ID.get('bulwark')?.price).toBe(8);
    expect(ITEM_BY_ID.get('bulwark')?.description)
      .toContain('Every 11 damage blocked by armor');
    expect(ITEM_BY_ID.get('bulwark')?.description)
      .toContain('autocast a free random spell');
    expect(ITEM_BY_ID.get('bulwark')?.description)
      .not.toContain('Every 10 damage blocked');
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
      .toContain('autocast a free Immunity');
  });

  it('Second Hand and Engine cross-cast spells at 80%', () => {
    let secondHeal = 0;
    let secondRestore = 0;
    let engineFreeze = 0;
    let engineImmunity = 0;
    const cast = (result: ReturnType<typeof act>, id: string): boolean =>
      result.events.some(
        (event) => event.type === 'spellCast' && event.auto && event.spell.id === id,
      );

    for (let index = 0; index < 30; index++) {
      const handTf = start(`second-hand-tf-${index}`);
      handTf.state.items.push({ instance: 'i-sh', id: 'second-hand', data: {}, equipped: true });
      handTf.state.spells = [{ instance: 's-tf', id: 'time-freeze' }];
      const afterTf = act(handTf.state, { type: 'castSpell', instance: 's-tf' });
      if (cast(afterTf, 'heal')) secondHeal++;

      const handImm = start(`second-hand-imm-${index}`);
      handImm.state.items.push({ instance: 'i-sh2', id: 'second-hand', data: {}, equipped: true });
      handImm.state.spells = [{ instance: 's-imm', id: 'immunity' }];
      const afterImm = act(handImm.state, { type: 'castSpell', instance: 's-imm' });
      if (cast(afterImm, 'restore')) secondRestore++;

      const engineRestore = start(`engine-restore-${index}`);
      engineRestore.state.items.push({ instance: 'i-eng', id: 'engine', data: {}, equipped: true });
      engineRestore.state.spells = [{ instance: 's-res', id: 'restore' }];
      const afterRestore = act(engineRestore.state, { type: 'castSpell', instance: 's-res' });
      if (cast(afterRestore, 'time-freeze')) engineFreeze++;

      const engineHeal = start(`engine-heal-${index}`);
      engineHeal.state.items.push({ instance: 'i-eng2', id: 'engine', data: {}, equipped: true });
      engineHeal.state.spells = [{ instance: 's-heal', id: 'heal' }];
      const afterHeal = act(engineHeal.state, { type: 'castSpell', instance: 's-heal' });
      if (cast(afterHeal, 'immunity')) engineImmunity++;
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
    expect(first.state.hp).toBe(15);
    expect(first.state.round?.immuneGuesses).toBe(0);
    expect(first.state.round?.guessImmuneUntilMs).toBe(4_000);

    const second = act(first.state, { type: 'guess', word: 'brick' });
    expect(second.state.hp).toBe(15);

    second.state.round!.elapsedMs = 5_000;
    const third = act(second.state, { type: 'guess', word: 'vamps' });
    expect(third.state.hp).toBe(12);
  });

  it('applies the tuned content text and values', () => {
    expect(FOOD_BY_ID.get('gg-gum')?.effects)
      .toContainEqual({ type: 'revealLetter', letter: 'g' });
    expect(FOOD_BY_ID.get('gumdrop')?.price).toBe(2);
    expect(FOOD_BY_ID.get('bitter-root')).toBeUndefined();
    expect(FOOD_BY_ID.get('spring-tonic')).toBeUndefined();
    expect(FOOD_BY_ID.get('one-bo-hue')?.rarity).toBe('uncommon');
    expect(FOOD_BY_ID.get('taco-pizza-party')?.rarity).toBe('rare');
    expect(FOOD_BY_ID.get('plating')?.rarity).toBe('uncommon');
    expect(ITEM_BY_ID.get('growth-spurt')?.description).toContain('+3 max HP');
    expect(FOOD_BY_ID.get('muffin-tin')?.description).toContain('+1 max armor');
    expect(CURSE_BY_ID.get('porcupine')?.damagePerGreen).toBe(2);
    expect(CURSE_BY_ID.get('porcupine')?.description)
      .toBe('+2 damage on the next guess per green tile on the previous guess.');
    expect(CURSE_BY_ID.get('tight-slots')?.slotDelta).toBe(-2);
    expect(SPELL_BY_ID.get('restore')?.description)
      .toContain('ignore vision curses');
    expect(ITEM_BY_ID.get('siphon')?.description).toContain('40% chance to autocast a free Heal');
    expect(ITEM_BY_ID.get('gourmand')?.description).toContain('On spell cast or food eaten');
    expect(ITEM_BY_ID.get('pen-club')?.description).toContain('1-5 gold');
    expect(ITEM_BY_ID.get('midas-touch')?.description).toContain('30%');
    expect(ITEM_BY_ID.get('midas-touch')?.goldDoubleChance).toBe(30);
    expect(ITEM_BY_ID.get('miser')).toBeUndefined();
    expect(ITEM_BY_ID.get('plate-timer')).toBeUndefined();
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
    expect(solved.state.gold).toBeGreaterThanOrEqual(15); // 12 start + 40% tax on 6-10 solve gold
    expect(solved.state.gold).toBeLessThanOrEqual(18);
  });

  it('Mimic Mouth casts a random spell for a wrong guess with 5 revealed letters, once per round', () => {
    const def = ITEM_BY_ID.get('mimic-mouth');
    expect(def?.price).toBe(7);
    expect(def?.description).toContain('5 revealed letters');
    expect(def?.description).toContain('wrong guess');

    const { state } = start('mimic');
    state.items.push({ instance: 'i-mimic', id: 'mimic-mouth', data: { used: 0 }, equipped: true });
    setAnswer(state, 'crane');
    const spellsBefore = state.spells.length;
    const first = act(state, { type: 'guess', word: 'nacre' }); // wrong, all five letters present
    expect(first.events.some(
      (event) => event.type === 'spellCast' && event.auto,
    )).toBe(true);
    expect(first.state.spells).toHaveLength(spellsBefore);
    const second = act(first.state, { type: 'guess', word: 'caner' }); // wrong and five letters again
    expect(second.events.some(
      (event) => event.type === 'spellCast' && event.auto,
    )).toBe(false);

    const exact = start('mimic-correct');
    exact.state.items.push({ instance: 'i-mimic', id: 'mimic-mouth', data: { used: 0 }, equipped: true });
    setAnswer(exact.state, 'crane');
    const exactBefore = exact.state.spells.length;
    const solved = act(exact.state, { type: 'guess', word: 'crane' });
    expect(solved.state.spells).toHaveLength(exactBefore);
  });

  it('moves a hidden colored duplicate onto a visible duplicate', () => {
    const { state } = start('third-eye-hidden-keyboard');
    state.curses.push({ id: 'third-eye', stacks: 1 });
    setAnswer(state, 'paste');
    state.round!.freeLeft = 0;
    const guessed = act(state, { type: 'guess', word: 'sassy' });
    forcePositionHides(guessed.state, 2);
    const view = game.view(guessed.state).phase;
    if (view.kind !== 'round') throw new Error('expected round');
    expect(view.board.guesses[0].tiles[2]).toBe('hidden');
    expect(view.board.guesses[0].tiles[0]).toBe('present');
    expect(view.board.keyboard.s).toBe('present');
  });

  it('moves a hidden yellow E onto the other E in the guess', () => {
    const { state } = start('duplicate-hidden-e');
    state.curses.push({ id: 'second-sight', stacks: 1 });
    setAnswer(state, 'crane');
    state.round!.freeLeft = 0;
    const guessed = act(state, { type: 'guess', word: 'needs' });
    forcePositionHides(guessed.state, 1);
    const view = game.view(guessed.state).phase;
    if (view.kind !== 'round') throw new Error('expected round');
    expect(view.board.guesses[0].tiles[1]).toBe('hidden');
    expect(view.board.guesses[0].tiles[2]).toBe('present');
    expect(view.board.keyboard.e).toBe('present');
  });

  it('keeps a letter hidden when it appears only behind a hidden tile', () => {
    const { state } = start('third-eye-hidden-only');
    state.curses.push({ id: 'third-eye', stacks: 1 });
    setAnswer(state, 'paste');
    state.round!.freeLeft = 0;
    const guessed = act(state, { type: 'guess', word: 'crane' });
    forcePositionHides(guessed.state, 2);
    const view = game.view(guessed.state).phase;
    if (view.kind !== 'round') throw new Error('expected round');
    expect(view.board.guesses[0].tiles[2]).toBe('hidden');
    expect(view.board.keyboard.a).toBe('hidden');
  });

  it('a hidden tile stays hidden while the keyboard learns its letter', () => {
    const { state } = start('hidden-peek');
    state.curses.push({ id: 'censor', stacks: 1 });
    setAnswer(state, 'crane');

    const first = act(state, { type: 'guess', word: 'crate' }); // C is green but the tile is hidden
    forcePositionHides(first.state, 0);
    const alone = game.view(first.state).phase;
    if (alone.kind !== 'round') throw new Error('expected round');
    expect(alone.board.guesses[0]?.tiles[0]).toBe('hidden');

    const second = act(first.state, { type: 'guess', word: 'actor' }); // C shows yellow at slot 2
    forcePositionHides(second.state, 0);
    const after = game.view(second.state).phase;
    if (after.kind !== 'round') throw new Error('expected round');
    expect(after.board.keyboard.c).toBe('present');
    expect(after.board.guesses[0]?.tiles[0]).toBe('hidden');
  });

  it('keeps the revealed letters visible in a shop', () => {
    const { state } = start('revealed-shop');
    state.round!.hints = { a: 'present', z: 'absent' };
    state.phase = 'shop';
    state.shop = shopState();
    const view = game.view(state);
    expect(view.revealed).toContainEqual({ letter: 'a', status: 'present' });
    expect(view.revealed).toContainEqual({ letter: 'z', status: 'absent' });
  });

  it('separates collected permanent reveals from this puzzle reveals', () => {
    const { state } = start('collected-reveals');
    state.permanentReveals = ['a', 'z'];
    state.round!.hints = { a: 'present', z: 'absent', q: 'present' };
    const view = game.view(state);
    expect(view.collectedReveals).toEqual(['a', 'z']);
    expect(view.revealed).toEqual([{ letter: 'q', status: 'present' }]);
  });

  it('Counter-Intelligence is weighted but no longer guaranteed after a vision curse', () => {
    expect(ITEM_BY_ID.get('tally-lens')?.rarity).toBe('common');
    expect(ITEM_BY_ID.get('tally-lens')?.shopRarity).toBe('uncommon');
    expect(ITEM_BY_ID.get('tally-lens')?.appearanceWeight).toBe(3);
    expect(ITEM_BY_ID.get('tally-lens')?.price).toBe(12);
    expect(ITEM_BY_ID.get('tally-lens')?.unique).toBe(true);

    let withTally = 0;
    let withoutTally = 0;
    for (let index = 0; index < 200; index++) {
      const { state } = start(`tally-shop-${index}`);
      state.curses.push({ id: 'censor', stacks: 1 });
      state.nodeIndex = 0;
      state.nodes[1] = { kind: 'shop', level: 1 };
      state.phase = 'shop';
      const shop = enterShop(state).state.shop;
      if (shop?.offers.some((offer) => offer.kind === 'item' && offer.def === 'tally-lens')) {
        withTally++;
      } else {
        withoutTally++;
      }
    }
    expect(withTally).toBeGreaterThan(0);
    expect(withoutTally).toBeGreaterThan(0);

    for (let index = 0; index < 50; index++) {
      const { state: ownedState } = start(`tally-owned-${index}`);
      ownedState.curses.push({ id: 'censor', stacks: 1 });
      ownedState.items.push({
        instance: 'i-owned-tally',
        id: 'tally-lens',
        data: {},
        equipped: true,
      });
      ownedState.nodeIndex = 0;
      ownedState.nodes[1] = { kind: 'shop', level: 1 };
      ownedState.phase = 'shop';
      const shop = enterShop(ownedState).state.shop;
      expect(
        shop?.offers.some((offer) => offer.kind === 'item' && offer.def === 'tally-lens'),
      ).toBe(false);
    }
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

  it('Heal raises max HP by 1 and restores half of the new max HP', () => {
    const heal = start('heal-half');
    heal.state.maxHp = 15;
    heal.state.hp = 4;
    heal.state.spells.push({ instance: 's-heal', id: 'heal' });
    const cast = act(heal.state, { type: 'castSpell', instance: 's-heal' });
    expect(cast.state.maxHp).toBe(16);
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
    expect(guess.state.hp).toBe(13);
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

  it('Spellbook costs 4g and pays 1 gold flat per cast', () => {
    const def = ITEM_BY_ID.get('spellbook');
    expect(def?.price).toBe(4);
    expect(def?.description).toContain('+1 gold');
    expect(def?.dynamicDescription).toBeUndefined();

    const { state } = start('spellbook');
    state.items.push({ instance: 'i-book', id: 'spellbook', data: {}, equipped: true });
    state.spells = [
      { instance: 's-omen', id: 'omen' },
      { instance: 's-heal', id: 'heal' },
      { instance: 's-immunity', id: 'immunity' },
    ];
    let current = state;
    current = act(current, { type: 'castSpell', instance: 's-omen' }).state;
    expect(current.gold).toBe(13);
    current = act(current, { type: 'castSpell', instance: 's-heal' }).state;
    expect(current.gold).toBe(14);
    current = act(current, { type: 'castSpell', instance: 's-immunity' }).state;
    expect(current.gold).toBe(15);
  });

  it('adds 2g Leftovers and 12g Iron Ration', () => {
    expect(ITEM_BY_ID.get('rabbit-foot')).toBeUndefined();
    expect(FOOD_BY_ID.get('leftovers')?.price).toBe(2);
    expect(FOOD_BY_ID.get('leftovers')?.effects)
      .toContainEqual({ type: 'healMissingPercent', percent: 50 });
    expect(FOOD_BY_ID.get('iron-ration')?.price).toBe(12);
    expect(FOOD_BY_ID.get('iron-ration')?.rarity).toBe('rare');
    expect(FOOD_BY_ID.get('iron-ration')?.effects)
      .toContainEqual({ type: 'maxArmor', delta: 2 });
  });

  it('removes Pawn Ticket from the content set', () => {
    expect(ITEM_BY_ID.get('pawn-ticket')).toBeUndefined();
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

  it('removes Shortcut', () => {
    expect(ITEM_BY_ID.get('shortcut')).toBeUndefined();
    expect(ITEM_BY_ID.has('shortcut')).toBe(false);
  });

  it('counts only player guesses for within-X items', () => {
    const { state } = start('player-guess-count');
    state.curses.push({ id: 'clock', stacks: 1 });
    const next = nextRound(state);
    next.state.items.push({ instance: 'i-growth', id: 'growth-spurt', data: {}, equipped: true });
    next.state.spells = [{ instance: 's-phone', id: 'phone-friend' }];
    setAnswer(next.state, 'crane');
    const cast = act(next.state, { type: 'castSpell', instance: 's-phone' });
    expect(cast.state.round?.guesses.filter((guess) => guess.by === 'friend')).toHaveLength(2);
    const solved = act(cast.state, { type: 'guess', word: 'crane' });
    expect(solved.state.maxHp).toBe(18); // one player guess, despite two friend guesses
  });

  it('Bookend pays 2 gold for matching first and last letters', () => {
    const { state } = start('bookend-pay');
    state.items.push({ instance: 'i-book', id: 'bookend', data: {}, equipped: true });
    state.round!.freeLeft = 0;
    setAnswer(state, 'crane');
    const before = state.gold;
    const guess = act(state, { type: 'guess', word: 'level' });
    expect(guess.state.gold).toBe(before + 2);
  });

  it('Necronomicon pays 13% max HP for a random gift once per round', () => {
    const def = ITEM_BY_ID.get('necronomicon');
    expect(def?.rarity).toBe('rare');
    expect(def?.onUse).toBeDefined();
    expect(def?.description).toContain('13% max HP');
    expect(def?.description).toContain('random gift');
    expect(def?.description).toContain('Once per round');

    const { state } = start('necronomicon-use');
    state.items.push({
      instance: 'i-nec',
      id: 'necronomicon',
      data: { fed: 0, _uses: 0 },
      equipped: true,
    });
    state.spells = [];
    setAnswer(state, 'crane');
    const used = act(state, { type: 'useItem', instance: 'i-nec' });
    const item = used.state.items.find((entry) => entry.id === 'necronomicon');
    expect(item?.data.fed).toBe(2);
    expect(item?.data._uses).toBe(1);
    expect(used.state.maxHp).toBeLessThan(15);
    expect(used.events.some((event) => event.type === 'itemProc')).toBe(true);

    const again = act(used.state, { type: 'useItem', instance: 'i-nec' });
    expect(again.state.maxHp).toBe(used.state.maxHp);
    expect(again.events.some((event) => event.type === 'itemProc')).toBe(false);
    expect(again.events.some(
      (event) => event.type === 'message' && event.text.includes('silent'),
    )).toBe(true);

    const next = nextRound(again.state);
    const usedAgain = act(next.state, { type: 'useItem', instance: 'i-nec' });
    expect(usedAgain.state.maxHp).toBeLessThan(next.state.maxHp);
  });

  it('Necronomicon cannot be used at 1 max HP', () => {
    const { state } = start('necronomicon-empty');
    state.maxHp = 1;
    state.hp = 1;
    state.items.push({
      instance: 'i-nec-empty',
      id: 'necronomicon',
      data: { fed: 0 },
      equipped: true,
    });
    setAnswer(state, 'crane');
    const used = act(state, { type: 'useItem', instance: 'i-nec-empty' });
    expect(used.state.maxHp).toBe(1);
    expect(used.state.items.find((item) => item.id === 'necronomicon')?.data.fed).toBe(0);
    expect(used.events.some(
      (event) => event.type === 'message' && event.text.includes('more life'),
    )).toBe(true);
  });

  it('Necronomicon only answers during a fight', () => {
    const { state } = start('necronomicon-shop');
    state.phase = 'shop';
    state.shop = shopState();
    state.items.push({
      instance: 'i-nec-shop',
      id: 'necronomicon',
      data: { fed: 0 },
      equipped: true,
    });
    const used = act(state, { type: 'useItem', instance: 'i-nec-shop' });
    expect(used.events.some(
      (event) => event.type === 'message' && event.text.includes('fight'),
    )).toBe(true);
  });

  it('Necronomicon pool unlocks with fed tiers and scales', () => {
    expect(necronomiconTier(0)).toBe(0);
    expect(necronomiconTier(12)).toBe(0);
    expect(necronomiconTier(13)).toBe(1);
    expect(necronomiconTier(38)).toBe(1);
    expect(necronomiconTier(39)).toBe(2);
    expect(necronomiconTier(78)).toBe(2);
    expect(necronomiconTier(79)).toBe(3);
    expect(necronomiconTier(128)).toBe(3);
    expect(necronomiconTier(129)).toBe(4);
    expect(necronomiconTier(188)).toBe(4);
    expect(necronomiconTier(189)).toBe(5);
    expect(necronomiconTier(258)).toBe(5);
    expect(necronomiconTier(259)).toBe(6);

    const has = (pool: Effect[][], type: string): boolean =>
      pool.some((option) => option.some((effect) => effect.type === type));
    const tier0 = necronomiconPool(0);
    const tier2 = necronomiconPool(2);
    const tier3 = necronomiconPool(3);
    const tier4 = necronomiconPool(4);
    const tier6 = necronomiconPool(6);

    expect(tier0).toHaveLength(13); // 3 Whisper + 3 Twin + 7 basics
    const singleChoices = tier0.filter(
      (option) => option.length === 1 && option[0].type === 'randomChoice',
    );
    expect(singleChoices).toHaveLength(6); // 3 Whisper + 3 Twin
    const hasNestedProc = (option: Effect[], prefix: string): boolean => {
      if (option.length !== 1 || option[0].type !== 'randomChoice') return false;
      return option[0].options.some((nested) => nested.some(
        (effect) => effect.type === 'proc' && effect.text.startsWith(prefix),
      ));
    };
    expect(singleChoices.filter((option) => hasNestedProc(option, 'Whisper'))).toHaveLength(3);
    expect(singleChoices.filter((option) => hasNestedProc(option, 'Twin Whispers'))).toHaveLength(3);

    const mythos = tier0.flatMap((option) => option.flatMap((effect) => (
      effect.type === 'randomChoice' ? effect.options.flat() : [effect]
    ))).flatMap((effect) => (effect.type === 'autoGuess' ? [effect.word] : []));
    expect(mythos).toEqual(expect.arrayContaining(['ryleh', 'cthul', 'dagon']));

    const tier1 = necronomiconPool(1);
    const optionWith = (pool: Effect[][], prefix: string): Effect[] | undefined =>
      pool.find((option) => option.some(
        (effect) => effect.type === 'proc' && effect.text.startsWith(prefix),
      ));
    const twinOmens = optionWith(tier0, 'Twin Omens');
    expect(twinOmens?.filter(
      (effect) => effect.type === 'castSpell' && effect.spell === 'omen',
    )).toHaveLength(2);
    const mend = optionWith(tier0, 'Mend');
    expect(mend?.some(
      (effect) => effect.type === 'healMissingPercent' && effect.percent === 100,
    )).toBe(true);
    expect(mend?.some((effect) => effect.type === 'refillArmor')).toBe(true);
    expect(optionWith(tier0, 'Ward')).toBeUndefined();
    const unwrite0 = optionWith(tier0, 'Unwrite');
    expect(unwrite0?.some(
      (effect) => effect.type === 'revealAbsent' && effect.count === 3,
    )).toBe(true);
    const unwrite1 = optionWith(tier1, 'Unwrite');
    expect(unwrite1?.some(
      (effect) => effect.type === 'revealAbsent' && effect.count === 4,
    )).toBe(true);
    const twinImmunity = optionWith(tier1, 'Twin Immunity');
    expect(twinImmunity?.filter(
      (effect) => effect.type === 'castSpell' && effect.spell === 'immunity',
    )).toHaveLength(2);

    expect(has(tier0, 'gold')).toBe(true);
    expect(has(tier0, 'slots')).toBe(false);
    expect(has(tier2, 'purgeRandomLetter')).toBe(true);
    expect(has(tier3, 'slots')).toBe(true);
    expect(tier3.some(
      (option) => option.some(
        (effect) => effect.type === 'maxHpMultiply' && effect.factor === 2,
      ),
    )).toBe(true);
    expect(has(tier4, 'addRandomCurse')).toBe(true);

    // Tiers 5 and 6 add no new outcomes, only bigger numbers.
    expect(tier6).toHaveLength(tier4.length);
    const goldAt = (pool: Effect[][]): number[] => pool.flatMap((option) =>
      option.flatMap((effect) => (effect.type === 'gold' ? [effect.amount] : [])));
    expect(Math.max(...goldAt(tier6))).toBeGreaterThan(Math.max(...goldAt(tier4)));

    // Clean Slate and Borrowed Time are gone.
    const removed = [...tier0, ...tier2, ...tier3, ...tier4, ...tier6];
    expect(has(removed, 'clearBlacklist')).toBe(false);
    expect(has(removed, 'addTime')).toBe(false);
  });

  it('autoguesses go through purged letters', () => {
    const { state } = start('autoguess-purged');
    state.permanentRoundStartWord = 'dagon';
    state.purged = ['d'];
    setAnswer(state, 'crane');
    const next = nextRound(state);
    expect(next.state.round?.guesses.some(
      (guess) => guess.word === 'dagon' && guess.by === 'friend',
    )).toBe(true);
  });

  it('manual guesses still reject purged letters', () => {
    const { state } = start('manual-purged');
    state.purged = ['s'];
    setAnswer(state, 'crane');
    const rejected = act(state, { type: 'guess', word: 'slate' });
    expect(rejected.events).toContainEqual({
      type: 'guessRejected',
      word: 'slate',
      reason: 'purgedLetter',
    });
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
    expect(FOOD_BY_ID.get('empty-calories')?.price).toBe(5);
    expect(FOOD_BY_ID.get('empty-calories')?.name).toBe('Donut Holes');
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
    expect(FOOD_BY_ID.get('spring-tonic')).toBeUndefined();
    expect(FOOD_BY_ID.get('packed-lunch')).toBeUndefined();
    expect(ITEM_BY_ID.get('bookend')?.price).toBe(7);
    expect(ITEM_BY_ID.get('bookend')?.description).toContain('+2 gold');
    expect(FOOD_BY_ID.get('gg-gum')?.price).toBe(16);
    expect(ITEM_BY_ID.get('overachiever')).toBeUndefined();
    expect(ITEM_BY_ID.get('miser')).toBeUndefined();
    expect(FOOD_BY_ID.get('old-mcdonald')).toBeDefined();
  });

  it('Die Coke turns excess healing into gold', () => {
    const { state } = start('die-coke');
    state.phase = 'shop';
    state.gold = 10;
    state.shop = shopState([{ id: 'o0', kind: 'eat', def: 'die-coke', price: 1 }]);
    const eaten = act(state, { type: 'buy', offerId: 'o0' });
    expect(eaten.state.hp).toBe(15);
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
    expect(eaten.state.maxHp).toBe(23);
    expect(eaten.state.hp).toBe(23);

    const delicacy = start('overhealers-delicacy');
    delicacy.state.phase = 'shop';
    delicacy.state.gold = 20;
    delicacy.state.shop = shopState([
      { id: 'o0', kind: 'eat', def: 'overhealers-delicacy', price: 12 },
    ]);
    const feasted = act(delicacy.state, { type: 'buy', offerId: 'o0' });
    expect(feasted.state.maxHp).toBe(27);
    expect(feasted.state.hp).toBe(27);
  });

  it('sells the newest meal batch', () => {
    expect(FOOD_BY_ID.get('pho-dac-biet')?.price).toBe(6);
    expect(FOOD_BY_ID.get('pho-dac-biet')?.effects)
      .toContainEqual({ type: 'healPercent', percent: 100 });
    expect(FOOD_BY_ID.get('xiaolongbao')?.price).toBe(2);
    expect(FOOD_BY_ID.get('cheeseburger')?.price).toBe(3);
    expect(FOOD_BY_ID.get('double-cheeseburger')?.price).toBe(4);
    expect(FOOD_BY_ID.get('pani-puri')?.price).toBe(1);
    expect(FOOD_BY_ID.get('potato-chips')?.price).toBe(1);
    expect(FOOD_BY_ID.get('hagelslag')?.price).toBe(4);
    expect(FOOD_BY_ID.get('hagelslag')?.effects)
      .toContainEqual({ type: 'maxHp', delta: 3 });
    expect(FOOD_BY_ID.get('hagelslag')?.description).toContain('20%');
    expect(FOOD_BY_ID.get('hearty-stew')?.price).toBe(4);
    expect(FOOD_BY_ID.get('masala-dosa')?.price).toBe(3);
    expect(FOOD_BY_ID.get('cyrniki')?.price).toBe(3);
    expect(FOOD_BY_ID.get('cyrniki')?.effects)
      .toContainEqual({ type: 'healMissingPercent', percent: 50 });
    expect(FOOD_BY_ID.get('menemen')?.price).toBe(4);
    expect(FOOD_BY_ID.get('big-eggplant')?.price).toBe(4);
    expect(FOOD_BY_ID.get('big-eggplant')?.rarity).toBe('uncommon');
    expect(FOOD_BY_ID.get('big-eggplant')?.effects)
      .toContainEqual({ type: 'maxArmor', delta: -3 });
    expect(FOOD_BY_ID.get('jumbo-hot-dog')?.price).toBe(3);
    expect(FOOD_BY_ID.get('jumbo-hot-dog')?.rarity).toBe('uncommon');
    expect(FOOD_BY_ID.get('juicy-peach')?.price).toBe(4);
    expect(FOOD_BY_ID.get('juicy-peach')?.effects)
      .toContainEqual({ type: 'maxHp', delta: 3 });
    expect(FOOD_BY_ID.get('juicy-peach')?.effects)
      .toContainEqual({ type: 'heal', amount: 3 });
    expect(FOOD_BY_ID.get('juicy-peach')?.effects)
      .toContainEqual({ type: 'giveSpell', spell: 'restore', chancePct: 50 });
    expect(FOOD_BY_ID.get('cherries')?.price).toBe(2);
    expect(FOOD_BY_ID.get('satchel')?.price).toBe(19);
    expect(FOOD_BY_ID.get('satchel')?.rarity).toBe('uncommon');
    expect(FOOD_BY_ID.get('o-toro')?.price).toBe(18);
    expect(FOOD_BY_ID.get('o-toro')?.effects)
      .toContainEqual({ type: 'revealLetter', letter: 'o' });
    expect(FOOD_BY_ID.get('i-spy')?.price).toBe(16);
    expect(FOOD_BY_ID.get('i-spy')?.name).toBe('I-Cee');
    expect(FOOD_BY_ID.get('reveal-the-d')?.price).toBe(18);
    expect(FOOD_BY_ID.get('reveal-the-d')?.rarity).toBe('rare');
    expect(FOOD_BY_ID.get('reveal-the-d')?.shopRarity).toBeUndefined();
    expect(FOOD_BY_ID.get('honey-cake')?.price).toBe(4);
    expect(FOOD_BY_ID.get('vitality')?.price).toBe(8);
    expect(FOOD_BY_ID.get('yin-yang')?.name).toBe('NY Cheesecake');
  });

  it('updates Arepa, Plov, cheeseburgers and cherries', () => {
    expect(FOOD_BY_ID.get('arepa')?.price).toBe(2);
    expect(FOOD_BY_ID.get('arepa')?.effects)
      .toContainEqual({ type: 'healPercent', percent: 20 });
    expect(FOOD_BY_ID.get('plov')?.price).toBe(3);
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
    expect(eaten.state.maxHp).toBe(18);
    expect(eaten.state.hp).toBe(9);
    expect(eaten.state.armor).toBe(4);
  });

  it('raises The Toll to 40% per stack', () => {
    expect(CURSE_BY_ID.get('toll')?.shopPriceAdd).toBe(0.4);
    expect(CURSE_BY_ID.get('toll')?.description).toContain('40%');
  });

  it('Kase inherits Knafeh\'s old armor and previous-answer effect', () => {
    const { state } = start('kase');
    state.lastAnswer = 'crane';
    state.phase = 'shop';
    state.gold = 20;
    state.shop = shopState([{ id: 'o0', kind: 'eat', def: 'kase', price: 6 }]);
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
    expect(cast.state.maxHp).toBe(17); // two Heals raise max HP by 1 each
    expect(cast.state.hp).toBe(17); // heal 8 then 9, capped at 17
    expect(cast.state.nextSpellDouble).toBe(false);
  });

  it('Chilaquiles is a 2g food that doubles the next two sales', () => {
    const { state } = start('chilaquiles');
    state.phase = 'shop';
    state.shop = shopState([{ id: 'o0', kind: 'eat', def: 'chilaquiles', price: 2 }]);
    state.items.push({ instance: 'i-glass', id: 'turtle-shell', data: {}, equipped: true });
    state.items.push({ instance: 'i-glass-2', id: 'turtle-shell', data: {}, equipped: true });
    const goldBefore = state.gold;
    const eaten = act(state, { type: 'buy', offerId: 'o0' });
    expect(eaten.state.gold).toBe(goldBefore - 2);
    expect(eaten.state.nextSaleDoubles).toBe(2);
    const sold = act(eaten.state, { type: 'sell', instance: 'i-glass' });
    const base = Math.floor((ITEM_BY_ID.get('turtle-shell')?.price ?? 2) / 2);
    expect(sold.state.gold - goldBefore).toBe(base * 2 - 2);
    expect(sold.state.nextSaleDoubles).toBe(1);
    const soldAgain = act(sold.state, { type: 'sell', instance: 'i-glass-2' });
    expect(soldAgain.state.gold - goldBefore).toBe(base * 4 - 2);
    expect(soldAgain.state.nextSaleDoubles).toBe(0);
    expect(ITEM_BY_ID.get('chilaquiles')).toBeUndefined();
    expect(FOOD_BY_ID.get('chilaquiles')?.price).toBe(2);
  });

  it('Potluck doubles only the first food eaten in each level', () => {
    const { state } = start('potluck');
    state.items.push({ instance: 'i-pot', id: 'potluck', data: {}, equipped: true });
    state.phase = 'shop';
    state.gold = 100;
    state.shop = shopState([
      { id: 'f0', kind: 'eat', def: 'empty-calories', price: 5 },
      { id: 'f1', kind: 'eat', def: 'empty-calories', price: 5 },
    ]);
    const base = state.maxHp;
    let current = act(state, { type: 'buy', offerId: 'f0' }).state;
    expect(current.maxHp).toBe(base + 18); // the level's first food doubles +9
    current = act(current, { type: 'buy', offerId: 'f1' }).state;
    expect(current.maxHp).toBe(base + 27); // later food in the level does not

    current.level = 2;
    current.nodeIndex = 0;
    current.nodes[0] = { kind: 'round', level: 2 };
    current.nodes[1] = { kind: 'shop', level: 2 };
    current.phase = 'reward';
    current.reward = {
      options: [{
        id: 'eat:empty-calories',
        kind: 'eat',
        def: 'empty-calories',
        label: 'Donut Holes',
        description: '',
      }],
      boss: false,
    };
    const rewarded = act(current, { type: 'chooseReward', optionId: 'eat:empty-calories' });
    expect(rewarded.state.maxHp).toBe(base + 45); // reward food doubles too
    expect(rewarded.state.phase).toBe('shopChoice');
    const opened = act(rewarded.state, { type: 'choose', optionId: 'shop' });

    opened.state.gold = 100;
    opened.state.shop!.offers = [{ id: 'f2', kind: 'eat', def: 'empty-calories', price: 5 }];
    const after = act(opened.state, { type: 'buy', offerId: 'f2' });
    expect(after.state.maxHp).toBe(base + 54); // level already used its double
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
    expect(def?.price).toBe(6);
    expect(def?.effects).toContainEqual({ type: 'heal', amount: 12 });
    expect(def?.effects).toContainEqual({ type: 'maxArmor', delta: 1 });

    const { state } = start('taco-pizza');
    state.phase = 'shop';
    state.gold = 20;
    state.hp = 5;
    const armorBefore = state.maxArmor;
    state.shop = shopState([{ id: 'o0', kind: 'eat', def: 'taco-pizza-party', price: 6 }]);
    const eaten = act(state, { type: 'buy', offerId: 'o0' });
    expect(eaten.state.hp).toBe(15);
    expect(eaten.state.maxArmor).toBe(armorBefore + 1);
    expect(eaten.state.gold).toBe(14);
  });

  it('Coveted Cake trades an item slot for a random rare relic', () => {
    const def = FOOD_BY_ID.get('coveted-cake');
    expect(def?.price).toBe(2);
    expect(def?.rarity).toBe('rare');
    expect(def?.effects).toContainEqual({ type: 'slots', delta: -1 });
    expect(def?.effects).toContainEqual({ type: 'addRandomRelic' });

    const { state } = start('coveted-cake');
    state.phase = 'shop';
    state.gold = 20;
    const slotsBefore = state.slots;
    state.shop = shopState([{ id: 'o0', kind: 'eat', def: 'coveted-cake', price: 2 }]);
    const eaten = act(state, { type: 'buy', offerId: 'o0' });
    expect(eaten.state.gold).toBe(18);
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
    expect(eaten.state.maxHp).toBe(5); // 15 - 10
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
    expect(eaten.state.maxHp).toBe(15);
    expect(eaten.state.hp).toBe(10); // 30% of 15 max HP, rounded up
    expect(eaten.state.gold).toBe(17);

    const besh = start('beshbarmak');
    besh.state.phase = 'shop';
    besh.state.gold = 20;
    besh.state.hp = 5;
    besh.state.shop = shopState([{ id: 'o0', kind: 'eat', def: 'beshbarmak', price: 5 }]);
    const feasted = act(besh.state, { type: 'buy', offerId: 'o0' });
    expect(feasted.state.maxHp).toBe(16); // +5% max HP (16 → 17)
    expect(feasted.state.hp).toBe(6); // heal 5% of 17, rounded up
    expect(feasted.state.gold).toBe(15);
  });

  it('removes Packed Lunch from the content set', () => {
    expect(FOOD_BY_ID.get('packed-lunch')).toBeUndefined();
  });

  it('The Scales doubles max HP and halves current HP, or grants max armor', () => {
    const grow = start('scales-grow');
    grow.state.phase = 'happening';
    grow.state.happening = { id: 'the-scales', options: [] };
    const grown = act(grow.state, { type: 'choose', optionId: 'grow' });
    expect(grown.state.maxHp).toBe(30);
    expect(grown.state.hp).toBe(8);

    const plate = start('scales-plate');
    plate.state.phase = 'happening';
    plate.state.happening = { id: 'the-scales', options: [] };
    const plated = act(plate.state, { type: 'choose', optionId: 'plate' });
    expect(plated.state.maxArmor).toBe(8);
  });

  it('Growth Chart grants a Time Freeze every 3 max HP gained', () => {
    const { state } = start('growth-chart-threshold');
    state.items.push({ instance: 'i-chart', id: 'growth-chart', data: {}, equipped: true });
    state.spells = [];
    state.phase = 'shop';
    state.gold = 10;
    state.shop = shopState([
      { id: 'o0', kind: 'eat', def: 'potato-chips', price: 1 },
      { id: 'o1', kind: 'eat', def: 'potato-chips', price: 1 },
      { id: 'o2', kind: 'eat', def: 'potato-chips', price: 1 },
    ]);
    const chart = (s: RunState) => s.items.find((item) => item.id === 'growth-chart');
    const freezes = (s: RunState) =>
      s.spells.filter((spell) => spell.id === 'time-freeze').length;

    let current = act(state, { type: 'buy', offerId: 'o0' }).state;
    current = act(current, { type: 'buy', offerId: 'o1' }).state;
    expect(chart(current)?.data.grown).toBe(2);
    expect(freezes(current)).toBe(0);

    current = act(current, { type: 'buy', offerId: 'o2' }).state;
    expect(chart(current)?.data.grown).toBe(0);
    expect(freezes(current)).toBe(1);
  });

  it('Growth Chart triggers once for a single large max HP gain', () => {
    const { state } = start('growth-chart-instance');
    state.items.push({ instance: 'i-chart', id: 'growth-chart', data: {}, equipped: true });
    state.spells = [];
    state.phase = 'shop';
    state.gold = 20;
    state.shop = shopState([{ id: 'o0', kind: 'eat', def: 'vitality', price: 8 }]);
    const chart = (s: RunState) => s.items.find((item) => item.id === 'growth-chart');
    const freezes = (s: RunState) =>
      s.spells.filter((spell) => spell.id === 'time-freeze').length;

    const bought = act(state, { type: 'buy', offerId: 'o0' }).state;
    expect(chart(bought)?.data.grown).toBe(2);
    expect(freezes(bought)).toBe(1);
    expect(ITEM_BY_ID.get('growth-chart')?.description).toContain('Once per max HP gain');
  });

  it('removes the retired item batch', () => {
    expect(ITEM_BY_ID.get('dead-letter')).toBeUndefined();
    expect(ITEM_BY_ID.get('feast-of-ideas')).toBeUndefined();
    expect(ITEM_BY_ID.get('field-dressing')).toBeUndefined();
    expect(ITEM_BY_ID.get('time-dilation')).toBeUndefined();
    expect(ITEM_BY_ID.get('deja-vu')).toBeUndefined();
    expect(ITEM_BY_ID.get('sundial')).toBeUndefined();
    expect(FOOD_BY_ID.get('sundial')).toBeUndefined();
  });

  it('applies the new prices and text', () => {
    expect(ITEM_BY_ID.get('bloom')?.price).toBe(7);
    expect(ITEM_BY_ID.get('bloom')?.initial).toMatchObject({ hp: 3 });
    expect(ITEM_BY_ID.get('contrapuntal')?.price).toBe(7);
    expect(ITEM_BY_ID.get('growth-chart')?.price).toBe(8);
    expect(ITEM_BY_ID.get('growth-spurt')?.price).toBe(6);
    expect(ITEM_BY_ID.get('growth-spurt')?.description).toContain('+3 max HP');
    expect(ITEM_BY_ID.get('hat-trick')?.initial).toMatchObject({ gold: 1 });
    expect(ITEM_BY_ID.get('necronomicon')?.price).toBe(13);
    expect(ITEM_BY_ID.get('necronomicon')?.rarity).toBe('rare');
    expect(ITEM_BY_ID.get('necronomicon')?.description).toContain('13% max HP');
    expect(ITEM_BY_ID.get('nest-egg')?.price).toBe(4);
    expect(ITEM_BY_ID.get('nest-egg')?.description).toContain('+3 gold');
    expect(ITEM_BY_ID.get('second-skin')?.price).toBe(9);
    expect(ITEM_BY_ID.get('second-skin')?.rarity).toBe('uncommon');
    expect(ITEM_BY_ID.get('second-skin')?.description).not.toContain('heal');
    expect(ITEM_BY_ID.get('solo-note')?.price).toBe(7);
    expect(ITEM_BY_ID.get('ticking-fee')).toBeUndefined();
    expect(ITEM_BY_ID.get('metronome')).toBeUndefined();
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
    expect(shielded.state.hp).toBe(15);

    const late = start('head-start-late');
    late.state.items.push({ instance: 'i-hs', id: 'head-start', data: {}, equipped: true });
    const second = nextRound(late.state);
    setAnswer(second.state, 'crane');
    second.state.round!.freeLeft = 0;
    second.state.round!.elapsedMs = 7_000;
    second.state.armor = 0;
    const unshielded = act(second.state, { type: 'guess', word: 'slate' });
    expect(unshielded.state.round?.guesses[0].free).toBe(false);
    expect(unshielded.state.hp).toBe(12);
  });

  it('Head Start keeps its opening guess safe but still spends the free guess', () => {
    const { state } = start('head-start-free-spend');
    state.items.push({ instance: 'i-hs', id: 'head-start', data: {}, equipped: true });
    const round = nextRound(state);
    setAnswer(round.state, 'crane');
    round.state.round!.freeLeft = 1;
    round.state.round!.elapsedMs = 2_000;
    const beforeHp = round.state.hp;
    const guessed = act(round.state, { type: 'guess', word: 'slate' });
    expect(guessed.state.round?.guesses[0].free).toBe(true);
    expect(guessed.state.round?.freeLeft).toBe(0);
    expect(guessed.state.hp).toBe(beforeHp);
  });

  it('Ward Engine grants max armor', () => {
    const { state } = start('ward-engine');
    state.items.push({ instance: 'i-ward', id: 'ward-engine', data: { used: 0 }, equipped: true });
    state.spells = [{ instance: 's-imm', id: 'immunity' }];
    const cast = act(state, { type: 'castSpell', instance: 's-imm' });
    expect(cast.state.maxArmor).toBe(9);
  });

  it('Clean Slate gives +1 max HP or +1 max armor once per round', () => {
    const { state } = start('clean-slate');
    state.items.push({ instance: 'i-clean', id: 'clean-slate', data: { used: 0 }, equipped: true });
    setAnswer(state, 'crane');
    const hpBefore = state.maxHp;
    const armorBefore = state.maxArmor;
    const first = act(state, { type: 'guess', word: 'brick' });
    const trigger = act(first.state, { type: 'guess', word: 'vamps' });
    const gained = (trigger.state.maxHp - hpBefore) + (trigger.state.maxArmor - armorBefore);
    expect(gained).toBe(1);
    const third = act(trigger.state, { type: 'guess', word: 'fizzy' });
    expect((third.state.maxHp - hpBefore) + (third.state.maxArmor - armorBefore)).toBe(1);
  });

  it('Momentum grants max armor every 8 player guesses', () => {
    const { state } = start('momentum');
    state.items.push({ instance: 'i-momentum', id: 'momentum', data: { guesses: 0 }, equipped: true });
    setAnswer(state, 'jumbo');
    state.round!.freeLeft = 20;
    const armorBefore = state.maxArmor;
    let current = state;
    for (const word of ['slate', 'crane', 'adieu', 'pious', 'tiger', 'mango', 'lemon', 'berry']) {
      current = act(current, { type: 'guess', word }).state;
    }
    expect(current.maxArmor).toBe(armorBefore + 1);
    expect(current.items.find((item) => item.id === 'momentum')?.data.guesses).toBe(8);
  });

  it('Ballast gains 3 max HP whenever an autoguess happens', () => {
    const { state } = start('ballast');
    state.items.push({ instance: 'i-ballast', id: 'ballast', data: {}, equipped: true });
    state.items.push({ instance: 'i-charm', id: 'harvest-charm', data: {}, equipped: true });
    const maxHpBefore = state.maxHp;
    const next = nextRound(state);
    expect(next.state.round?.guesses.some((guess) => guess.by === 'friend')).toBe(true);
    expect(next.state.maxHp).toBe(maxHpBefore + 3);
  });

  it('letter-payoff items trigger on guesses containing their letters', () => {
    const hpRun = start('h-and-p');
    hpRun.state.items.push({ instance: 'i-hp', id: 'h-and-p', data: {}, equipped: true });
    setAnswer(hpRun.state, 'crane');
    const hpBefore = hpRun.state.maxHp;
    const healthy = act(hpRun.state, { type: 'guess', word: 'happy' });
    expect(healthy.state.maxHp).toBe(hpBefore + 1);
    expect(healthy.state.hp).toBe(healthy.state.maxHp);

    const zed = start('zed-plate');
    zed.state.items.push({ instance: 'i-zed', id: 'zed-plate', data: {}, equipped: true });
    setAnswer(zed.state, 'crane');
    const armorBefore = zed.state.maxArmor;
    const fizzy = act(zed.state, { type: 'guess', word: 'fizzy' });
    expect(fizzy.state.maxArmor).toBe(armorBefore + 1);

    const gilded = start('gilded');
    gilded.state.items.push({ instance: 'i-gilded', id: 'gilded', data: {}, equipped: true });
    setAnswer(gilded.state, 'crane');
    const goldBefore = gilded.state.gold;
    const mango = act(gilded.state, { type: 'guess', word: 'mango' });
    expect(mango.state.gold).toBe(goldBefore + 1);

    const marks = start('x-marks');
    marks.state.items.push({ instance: 'i-marks', id: 'x-marks', data: {}, equipped: true });
    setAnswer(marks.state, 'crane');
    const marksGold = marks.state.gold;
    const marksArmor = marks.state.maxArmor;
    const boxer = act(marks.state, { type: 'guess', word: 'boxer' });
    expect(boxer.state.gold).toBe(marksGold + 1);
    expect(boxer.state.maxArmor).toBe(marksArmor + 1);
  });

  it('Empty Armor grants Restore when the round starts with no spells', () => {
    const { state } = start('empty-armor');
    state.items.push({ instance: 'i-empty', id: 'empty-armor', data: {}, equipped: true });
    state.spells = [];
    const next = nextRound(state);
    expect(next.state.spells.some((spell) => spell.id === 'restore')).toBe(true);
  });

  it('Empty Hand, Empty Armor and Cracked Orb all use the same round-start snapshot', () => {
    let sawOrbCast = false;
    for (let index = 0; index < 200 && !sawOrbCast; index++) {
      const { state } = start(`empty-stack-${index}`);
      state.spells = [];
      state.items.push(
        { instance: 'i-orb', id: 'cracked-orb', data: {}, equipped: true },
        { instance: 'i-hand', id: 'empty-hand', data: {}, equipped: true },
        { instance: 'i-armor', id: 'empty-armor', data: {}, equipped: true },
      );
      const next = nextRound(state);
      // Empty Armor still grants Restore because the snapshot saw zero spells.
      expect(next.state.spells.some((spell) => spell.id === 'restore')).toBe(true);
      // Empty Hand casts immediately, and Cracked Orb sometimes adds a second cast.
      const autoCasts = next.events.filter(
        (event) => event.type === 'spellCast' && event.auto,
      );
      expect(autoCasts.length).toBeGreaterThanOrEqual(1);
      if (autoCasts.length >= 2) sawOrbCast = true;
    }
    expect(sawOrbCast).toBe(true);
  });

  it('keeps Echo Chamber and removes Ritual Circle and Second Wind', () => {
    expect(ITEM_BY_ID.get('echo-chamber')?.name).toBe('Echo Chamber');
    expect(ITEM_BY_ID.get('ritual-circle')).toBeUndefined();
    expect(ITEM_BY_ID.get('second-wind')).toBeUndefined();
  });

  it('uses the new rare relic prices', () => {
    const prices: Record<string, number> = {
      'chrono-anchor': 28,
      counterweight: 10,
      'loose-tongue': 12,
      'mending-plate': 26,
      momentum: 10,
      ballast: 10,
      'h-and-p': 11,
      'zed-plate': 9,
      gilded: 9,
      'x-marks': 8,
      'oracle-skull': 12,
      'phoenix-egg': 18,
      potluck: 26,
      'speed-dial': 28,
      spellplate: 16,
      'thorn-crown': 14,
      'vowel-sigil': 18,
    };
    for (const [id, price] of Object.entries(prices)) {
      expect(ITEM_BY_ID.get(id)?.price, id).toBe(price);
    }
  });

  it('Mending Plate starts with no armor bonus and pays per 8 HP healed', () => {
    const { state } = start('mending-plate');
    state.items.push({
      instance: 'i-mend',
      id: 'mending-plate',
      data: { healed: 0 },
      equipped: true,
    });
    expect(ITEM_BY_ID.get('mending-plate')?.description).toContain('per 8 HP');
    expect(state.maxArmor).toBe(7);
    state.maxHp = 15;
    state.hp = 5;
    state.spells = [{ instance: 's-heal', id: 'heal' }];
    const cast = act(state, { type: 'castSpell', instance: 's-heal' });
    expect(cast.state.maxArmor).toBe(8);
  });

  it('Mending Plate waits for 8 total HP before paying armor', () => {
    const { state } = start('mending-plate-threshold');
    state.items.push({
      instance: 'i-mend-threshold',
      id: 'mending-plate',
      data: { healed: 0 },
      equipped: true,
    });
    state.phase = 'shop';
    state.gold = 10;
    state.maxHp = 15;
    state.hp = 5;
    state.shop = shopState([
      { id: 'g0', kind: 'eat', def: 'gumdrop', price: 2 },
      { id: 'g1', kind: 'eat', def: 'gumdrop', price: 2 },
    ]);
    const first = act(state, { type: 'buy', offerId: 'g0' });
    expect(first.state.maxArmor).toBe(7);
    const second = act(first.state, { type: 'buy', offerId: 'g1' });
    expect(second.state.maxArmor).toBe(8);
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
    expect(current.maxHp).toBe(23);
  });

  it('applies the latest tweaks and text', () => {
    expect(ITEM_BY_ID.get('vowel-tithe')?.price).toBe(8);
    expect(ITEM_BY_ID.get('vowel-tithe')?.description).toContain('25%');
    expect(ITEM_BY_ID.get('vowel-tithe')?.description).toContain('Omen');
    expect(ITEM_BY_ID.get('spellhoarder')?.name).toBe('Panacea Pouch');
    expect(ITEM_BY_ID.get('spellhoarder')?.description).toContain('Heal');
    expect(ITEM_BY_ID.get('grey-market')?.price).toBe(7);
    expect(ITEM_BY_ID.get('grey-market')?.description).toContain('all-grey');
    expect(ITEM_BY_ID.get('grey-market')?.description).toContain('2 gold');
    expect(ITEM_BY_ID.get('grey-market')?.on?.onGuessScored).toBeDefined();
    expect(ITEM_BY_ID.get('acquired-taste')?.price).toBe(7);
    expect(ITEM_BY_ID.get('acquired-taste')?.rarity).toBe('uncommon');
    expect(ITEM_BY_ID.get('tithe-box')?.price).toBe(10);
    expect(ITEM_BY_ID.get('iron-hide')).toBeUndefined();
    expect(ITEM_BY_ID.get('purge-token')).toBeUndefined();
    expect(ITEM_BY_ID.get('boss-trophy')).toBeUndefined();
    expect(ITEM_BY_ID.get('thorn-crown')?.description).toContain('80%');
    expect(ITEM_BY_ID.get('vampire-teeth')).toBeUndefined();
    expect(ITEM_BY_ID.get('chrono-anchor')?.description).toContain('Taking damage: 30% chance');
    expect(ITEM_BY_ID.get('chrono-anchor')?.on?.onSolve).toBeUndefined();
    expect(ITEM_BY_ID.get('chrono-anchor')?.on?.onDamageTaken).toBeDefined();
  });

  it('Grey Market pays 2 gold for all-grey guesses', () => {
    const { state } = start('grey-market');
    state.items.push({ instance: 'i-grey', id: 'grey-market', data: {}, equipped: true });
    state.round!.freeLeft = 0;
    state.round!.answer = 'crane';
    const gold = state.gold;
    const miss = act(state, { type: 'guess', word: 'sloth' });
    expect(miss.state.gold).toBe(gold + 2);
    expect(miss.events.some(
      (event) => event.type === 'itemProc'
        && event.item === 'grey-market'
        && event.text.includes('+2 gold'),
    )).toBe(true);
    const hit = act(miss.state, { type: 'guess', word: 'slate' });
    expect(hit.state.gold).toBe(gold + 2);
  });

  it('Scattershot autocasts a spell once per round after a disjoint guess', () => {
    const { state } = start('scattershot-auto');
    state.items.push({ instance: 'i-scatter', id: 'scattershot', data: { used: 0 }, equipped: true });
    state.round!.answer = 'crane';
    state.round!.freeLeft = 0;
    let current = act(state, { type: 'guess', word: 'sloth' }).state;
    expect(current.round?.guesses.some((guess) => guess.by === 'friend')).toBe(false);
    const triggered = act(current, { type: 'guess', word: 'brick' });
    current = triggered.state;
    expect(triggered.events.some(
      (event) => event.type === 'spellCast' && event.auto,
    )).toBe(true);
    expect(current.items.find((item) => item.id === 'scattershot')?.data.used).toBe(1);
  });

  it('Scattershot ignores autoguesses', () => {
    const { state } = start('scattershot-friend');
    state.items.push({ instance: 'i-scatter', id: 'scattershot', data: { used: 0 }, equipped: true });
    state.items.push({ instance: 'i-echo', id: 'dark-echo', data: { used: 0 }, equipped: true });
    setAnswer(state, 'clots');
    state.round!.freeLeft = 0;
    const guessed = act(state, { type: 'guess', word: 'slate' });
    expect(guessed.state.round?.guesses.some((guess) => guess.by === 'friend')).toBe(true);
    expect(guessed.events.some((event) => event.type === 'spellCast')).toBe(false);
    expect(guessed.state.items.find((item) => item.id === 'scattershot')?.data.used).toBe(0);
  });

  it('Yellow1 autoguesses once per round on one yellow and no green', () => {
    const { state } = start('yellow1-auto');
    state.items.push({ instance: 'i-yellow', id: 'double-blind', data: { used: 0 }, equipped: true });
    state.round!.answer = 'crane';
    state.round!.freeLeft = 0;
    const guessed = act(state, { type: 'guess', word: 'roost' });
    expect(guessed.state.round?.guesses.some((guess) => guess.by === 'friend')).toBe(true);
    expect(guessed.state.items.find((item) => item.id === 'double-blind')?.data.used).toBe(1);

    const spent = start('yellow1-spent');
    spent.state.items.push({
      instance: 'i-yellow-spent',
      id: 'double-blind',
      data: { used: 1 },
      equipped: true,
    });
    spent.state.round!.answer = 'crane';
    spent.state.round!.freeLeft = 0;
    const skipped = act(spent.state, { type: 'guess', word: 'roost' });
    expect(skipped.state.round?.guesses.some((guess) => guess.by === 'friend')).toBe(false);

    expect(ITEM_BY_ID.get('double-blind')?.initial).toEqual({ used: 0 });
    expect(ITEM_BY_ID.get('double-blind')?.on?.onRoundStart).toBeDefined();
    expect(ITEM_BY_ID.get('double-blind')?.description).toContain('Once per round');
    expect(ITEM_BY_ID.get('double-blind')?.price).toBe(14);
    expect(ITEM_BY_ID.get('double-blind')?.rarity).toBe('rare');
  });

  it('Yellow1 and Green1 ignore non-player guesses', () => {
    const yellow = start('yellow1-friend');
    yellow.state.items.push({ instance: 'i-yellow-friend', id: 'double-blind', data: {}, equipped: true });
    yellow.state.permanentRoundStartWord = 'roost';
    yellow.state.round!.answer = 'crane';
    const yellowNext = nextRound(yellow.state);
    expect(yellowNext.state.round?.guesses.filter((guess) => guess.by === 'friend')).toHaveLength(1);
    expect(yellowNext.events.some(
      (event) => event.type === 'itemProc' && event.item === 'double-blind',
    )).toBe(false);

    const green = start('green1-friend');
    green.state.items.push({ instance: 'i-green-friend', id: 'green1', data: {}, equipped: true });
    green.state.permanentRoundStartWord = 'climb';
    green.state.round!.answer = 'crane';
    const greenNext = nextRound(green.state);
    expect(greenNext.state.round?.guesses.filter((guess) => guess.by === 'friend')).toHaveLength(1);
    expect(greenNext.events.some(
      (event) => event.type === 'itemProc' && event.item === 'green1',
    )).toBe(false);
    expect(ITEM_BY_ID.get('double-blind')?.description).toContain('Once per round');
    expect(ITEM_BY_ID.get('green1')?.description).toContain('Once per round');
  });

  it('Green1 autoguesses once per round on one green and no yellow', () => {
    const { state } = start('green1-auto');
    state.items.push({ instance: 'i-green', id: 'green1', data: { used: 0 }, equipped: true });
    state.round!.answer = 'crane';
    state.round!.freeLeft = 0;
    const guessed = act(state, { type: 'guess', word: 'climb' });
    expect(guessed.state.round?.guesses.some((guess) => guess.by === 'friend')).toBe(true);
    expect(guessed.state.items.find((item) => item.id === 'green1')?.data.used).toBe(1);

    const spent = start('green1-spent');
    spent.state.items.push({
      instance: 'i-green-spent',
      id: 'green1',
      data: { used: 1 },
      equipped: true,
    });
    spent.state.round!.answer = 'crane';
    spent.state.round!.freeLeft = 0;
    const skipped = act(spent.state, { type: 'guess', word: 'climb' });
    expect(skipped.state.round?.guesses.some((guess) => guess.by === 'friend')).toBe(false);

    expect(ITEM_BY_ID.get('green1')?.initial).toEqual({ used: 0 });
    expect(ITEM_BY_ID.get('green1')?.on?.onRoundStart).toBeDefined();
    expect(ITEM_BY_ID.get('green1')?.description).toContain('Once per round');
    expect(ITEM_BY_ID.get('green1')?.price).toBe(14);
    expect(ITEM_BY_ID.get('green1')?.rarity).toBe('uncommon');
  });

  it('Grey Market stays silent when a hidden letter keeps a guess off all-grey', () => {
    const { state } = start('grey-market-hidden');
    state.items.push({ instance: 'i-grey', id: 'grey-market', data: {}, equipped: true });
    state.curses.push({ id: 'hard-r', stacks: 1 });
    state.round!.freeLeft = 0;
    state.round!.answer = 'crane';
    const gold = state.gold;
    // roost hides its one present letter (R), so the board looks all-dark.
    const hidden = act(state, { type: 'guess', word: 'roost' });
    expect(hidden.state.gold).toBe(gold);
    expect(hidden.events.some(
      (event) => event.type === 'itemProc' && event.item === 'grey-market',
    )).toBe(false);
    const miss = act(hidden.state, { type: 'guess', word: 'sloth' });
    expect(miss.state.gold).toBe(gold + 2);
  });

  it('Grey Market pays for all-grey auto-guesses too', () => {
    let paid = false;
    for (let seedIndex = 0; seedIndex < 40 && !paid; seedIndex++) {
      const { state } = start(`grey-market-auto-${seedIndex}`);
      state.items.push(
        { instance: 'i-grey', id: 'grey-market', data: {}, equipped: true },
      );
      state.permanentRoundStartWord = 'eieio';
      const gold = state.gold;
      const next = nextRound(state);
      const answer = next.state.round?.answer ?? '';
      if ([...'eio'].some((ch) => answer.includes(ch))) continue;
      paid = true;
      expect(next.state.round?.guesses.some((guess) => guess.word === 'eieio')).toBe(true);
      expect(next.state.gold).toBe(gold + 2);
    }
    expect(paid).toBe(true);
  });

  it('Head Start is a 7s rare opening shield and Quickdraw is gone', () => {
    expect(ITEM_BY_ID.get('head-start')?.description).toContain('7s');
    expect(ITEM_BY_ID.get('head-start')?.rarity).toBe('rare');
    expect(ITEM_BY_ID.get('head-start')?.requiresClock).toBeUndefined();
    expect(ITEM_BY_ID.get('quickdraw')).toBeUndefined();
  });

  it('refuses stale clock-gated shop and reward offers after the clock is gone', () => {
    const shop = start('stale-shop');
    shop.state.items = shop.state.items.filter((item) => item.id !== 'evil-parrot');
    shop.state.phase = 'shop';
    shop.state.gold = 20;
    shop.state.shop = shopState([
      { id: 'o0', kind: 'item', def: 'meal-timer', price: 8 },
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
    reward.state.items = reward.state.items.filter((item) => item.id !== 'evil-parrot');
    reward.state.phase = 'reward';
    reward.state.reward = {
      boss: false,
      options: [{
        id: 'i0',
        kind: 'item',
        def: 'meal-timer',
        label: 'Meal Timer',
        description: 'Eating food adds 2s to the clock. Only appears with a clock.',
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
      state.items = state.items.filter((item) => item.id !== 'evil-parrot');
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

  it('still offers rare items in shops under the rarity floors', () => {
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
    expect(shopsWithRare).toBeGreaterThan(0);
  });

  it('prices shop spells at 4 gold, or 2 while on sale', () => {
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
          expect(offer.price).toBe(offer.sale ? 2 : 4);
          if (offer.sale) expect(offer.originalPrice).toBe(4);
        }
      }
    }
    expect(spells).toBeGreaterThan(0);
    expect(ITEM_BY_ID.get('stopped-clock')?.price).toBe(6);
  });

  it('Head Start sets a 7 second opening window', () => {
    const { state } = start('shield-stack');
    state.items.push(
      { instance: 'i-hs', id: 'head-start', data: {}, equipped: true },
    );
    const next = nextRound(state);
    expect(next.state.round?.immuneUntilMs).toBe(7_000);
  });

  it('Frozen Durian grants Time Freeze every 3 eats or solves', () => {
    const { state } = start('frozen-durian');
    state.items.push({
      instance: 'i-durian',
      id: 'frozen-durian',
      data: { eaten: 2 },
      equipped: true,
    });
    state.phase = 'shop';
    state.gold = 100;
    state.shop = shopState([{ id: 'f0', kind: 'eat', def: 'snack', price: 3 }]);
    const baseline = state.spells.length;
    const fed = act(state, { type: 'buy', offerId: 'f0' });
    expect(fed.state.spells).toHaveLength(baseline + 1);
    expect(fed.state.items.find((item) => item.id === 'frozen-durian')?.data.eaten).toBe(0);

    const durian = fed.state.items.find((item) => item.id === 'frozen-durian')!;
    durian.data.eaten = 2;
    const next = nextRound(fed.state);
    setAnswer(next.state, 'crane');
    const solved = act(next.state, { type: 'guess', word: 'crane' });
    expect(solved.state.spells).toHaveLength(baseline + 2);
    expect(solved.state.items.find((item) => item.id === 'frozen-durian')?.data.eaten).toBe(0);
    expect(ITEM_BY_ID.get('frozen-durian')?.price).toBe(8);
  });

  it('removes retired items and foods from the content set', () => {
    expect(ITEM_BY_ID.get('ice-cream-sundae')).toBeUndefined();
    expect(ITEM_BY_ID.get('daredevil')).toBeUndefined();
    expect(ITEM_BY_ID.get('hourglass')).toBeUndefined();
    expect(FOOD_BY_ID.get('oracles-banquet')).toBeUndefined();
  });

  it('applies the latest prices and text', () => {
    expect(FOOD_BY_ID.get('plating')?.price).toBe(4);
    expect(FOOD_BY_ID.get('plating')?.effects).toContainEqual({ type: 'maxArmor', delta: 1 });
    expect(ITEM_BY_ID.get('compound-interest')?.price).toBe(4);
    expect(FOOD_BY_ID.get('yin-yang')?.price).toBe(18);
    expect(ITEM_BY_ID.get('counterweight')?.description).toContain('Completely blocked hit');
    expect(ITEM_BY_ID.get('encore')?.description).toContain('last solved answer');
    expect(ITEM_BY_ID.get('necronomicon')?.description).toContain('13% max HP');
    expect(ITEM_BY_ID.get('necronomicon')?.description).toContain('random gift');
    expect(ITEM_BY_ID.get('necronomicon')?.description).not.toContain('permanently');
    expect(ITEM_BY_ID.get('necronomicon')?.description).not.toContain('round up');
    expect(FOOD_BY_ID.get('hearty-meal')?.description).toBe('+5 max HP, heal 5. No slot.');
    expect(ITEM_BY_ID.get('loyalty-card')?.description).toContain('Every 10 shop purchases');
    expect(ITEM_BY_ID.get('loyalty-card')?.price).toBe(12);
    expect(ITEM_BY_ID.get('loyalty-card')?.rarity).toBe('uncommon');
    expect(ITEM_BY_ID.get('tithe-box')?.description).toContain('10% chance');
    expect(ITEM_BY_ID.get('mimic-mouth')?.description).toContain('Once per round');
    expect(ITEM_BY_ID.get('second-skin')?.description).toContain('half your max armor');
    expect(SPELL_BY_ID.get('heal')?.description).toBe('Gain +1 max HP, then heal half of your max HP.');
    expect(HAPPENING_BY_ID.get('black-market')?.options.find((option) => option.id === 'spell')?.costGold).toBe(1);
    expect(HAPPENING_BY_ID.get('black-market')?.options.find((option) => option.id === 'armor')?.costGold).toBe(5);
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
      .toBe('Get a free guess that ignores vision curses. It doesn\'t count towards the number of guesses for certain items. Freeze the clock until your next guess.');
  });

  it('prices Pen Club at 15 gold for a 1-5 gold payout', () => {
    const pen = ITEM_BY_ID.get('pen-club');
    expect(pen?.price).toBe(15);
    expect(pen?.description).toContain('1-5 gold');
  });

  it('has common purge foods with uncommon shop banners', () => {
    expect(FOOD_BY_ID.get('inkcap')?.price).toBe(12);
    expect(FOOD_BY_ID.get('inkcap')?.rarity).toBe('rare');
    expect(FOOD_BY_ID.get('purge-the-d')?.price).toBe(12);
    expect(FOOD_BY_ID.get('purge-the-d')?.rarity).toBe('common');
    expect(FOOD_BY_ID.get('purge-the-d')?.shopRarity).toBe('uncommon');
    expect(FOOD_BY_ID.get('poppy-seeds')?.price).toBe(6);
    expect(FOOD_BY_ID.get('poppy-seeds')?.shopRarity).toBe('uncommon');
    expect(FOOD_BY_ID.get('poppy-seeds')?.effects)
      .toContainEqual({ type: 'purgeRandomLetter' });
  });

  it('adds Without U and makes every knowledge food rare', () => {
    const uNagi = FOOD_BY_ID.get('only-u');
    const withoutU = FOOD_BY_ID.get('without-u');
    expect(uNagi?.price).toBe(14);
    expect(uNagi?.rarity).toBe('rare');
    expect(withoutU?.price).toBe(3);
    expect(withoutU?.rarity).toBe('common');
    expect(withoutU?.shopRarity).toBe('uncommon');
    expect(withoutU?.unique).toBe(true);
    expect(withoutU?.effects).toContainEqual({ type: 'purgeLetter', letter: 'u' });

    const aSteak = FOOD_BY_ID.get('a-steak');
    expect(aSteak?.rarity).toBe('rare');
    expect(aSteak?.shopRarity).toBeUndefined();
    expect(aSteak?.price).toBe(13);
    expect(aSteak?.effects).toContainEqual({ type: 'revealLetter', letter: 'a' });

    for (const food of FOODS) {
      if (food.effects.some((effect) => effect.type === 'revealLetter')) {
        expect(food.rarity, food.id).toBe('rare');
        expect(food.shopRarity, food.id).toBeUndefined();
      }
    }
  });

  it('Poppy Seeds purges one random letter', () => {
    const { state } = start('poppy-seeds');
    state.phase = 'shop';
    state.gold = 10;
    state.shop = shopState([{ id: 'o0', kind: 'eat', def: 'poppy-seeds', price: 4 }]);
    const eaten = act(state, { type: 'buy', offerId: 'o0' });
    expect(eaten.state.gold).toBe(6);
    expect(eaten.state.purged).toHaveLength(1);
  });

  it('starts the Purgamist in a round with no free purges', () => {
    const { state } = game.newRun({ seed: 'purgamist-no-start-purge', character: 'purgamist' });
    expect(state.phase).toBe('round');
    expect(state.level).toBe(1);
    expect(state.pendingPurge).toBe(0);
    expect(state.round).toBeDefined();
    expect(state.items.some((item) => item.id === 'travel-inkwell')).toBe(true);
    expect(state.items.some((item) => item.id === 'soapstone')).toBe(true);
  });

  it('purges a letter normally when legal words remain', () => {
    const { state } = start('purge-normal');
    state.phase = 'shop';
    state.pendingPurge = 1;
    const purged = act(state, { type: 'purgeLetter', letter: 'z' });
    expect(purged.state.purged).toContain('z');
    expect(purged.state.pendingPurge).toBe(0);
    expect(purged.events.some(
      (event) => event.type === 'message' && event.text.includes('legal words'),
    )).toBe(false);
  });

  it('refuses a purge that would leave no legal words', () => {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz'.split('');
    let fatal: { letter: string; purged: string[] } | null = null;
    for (const word of CONTENT.answers) {
      const keep = new Set(word.split(''));
      const purged = alphabet.filter((ch) => !keep.has(ch));
      for (const letter of keep) {
        const blocked = new Set([...purged, letter]);
        const legal = CONTENT.answers.some((candidate) =>
          !candidate.split('').some((ch) => blocked.has(ch)),
        );
        if (!legal) {
          fatal = { letter, purged };
          break;
        }
      }
      if (fatal) break;
    }
    expect(fatal).not.toBeNull();

    const { state } = start('purge-dead-end');
    state.phase = 'shop';
    state.pendingPurge = 1;
    state.purged = fatal!.purged as typeof state.purged;
    const blocked = act(state, { type: 'purgeLetter', letter: fatal!.letter });
    expect(blocked.state.purged).not.toContain(fatal!.letter);
    expect(blocked.state.purged).toEqual(fatal!.purged);
    expect(blocked.state.pendingPurge).toBe(1);
    expect(blocked.events.some(
      (event) => event.type === 'message' && event.text.includes('Pick another letter'),
    )).toBe(true);
  });

  it('unpurges a random letter when every legal word is blacklisted', () => {
    const { state } = start('blacklist-unpurge');
    state.purged = ['z'];
    state.blacklist = CONTENT.answers.filter((word) => !word.includes('z'));
    state.usedAnswers = [];

    const next = nextRound(state);
    expect(next.state.purged).not.toContain('z');
    expect(next.events.some(
      (event) => event.type === 'blacklistUnpurged' && event.letter === 'z',
    )).toBe(true);
    expect(next.state.round?.answer).toContain('z');
  });

  it('restores letters before choosing an answer when none are legal', () => {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz'.split('');
    const { state } = start('purge-legacy');
    state.purged = alphabet.slice();
    const next = nextRound(state);
    const round = next.state.round;
    if (!round) throw new Error('expected round');
    expect(next.state.purged.length).toBeLessThan(26);
    expect(round.answer.split('').some((ch) => next.state.purged.includes(ch))).toBe(false);
    expect(next.events.some(
      (event) => event.type === 'message' && event.text.includes('No legal words remained'),
    )).toBe(true);
  });

  it('gives Coffee +5s for 1 gold and The Waffle +24s', () => {
    expect(FOOD_BY_ID.get('coffee')?.price).toBe(1);
    expect(FOOD_BY_ID.get('coffee')?.effects).toContainEqual({ type: 'timeBonus', ms: 5_000 });
    expect(FOOD_BY_ID.get('chronos')?.name).toBe('The Waffle');
    expect(FOOD_BY_ID.get('chronos')?.price).toBe(6);
    expect(FOOD_BY_ID.get('chronos')?.rarity).toBe('rare');
    expect(FOOD_BY_ID.get('chronos')?.effects).toContainEqual({ type: 'timeBonus', ms: 24_000 });
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
          const choice = options.find((option) => !option.locked
            && (!option.costGold || option.costGold <= state.gold)) ?? options.at(-1);
          result = act(state, { type: 'choose', optionId: choice?.id ?? '' });
        }
      } else if (state.phase === 'bossIntro') {
        result = act(state, { type: 'continue' });
      } else if (state.phase === 'mysteriousRoom') {
        result = act(state, { type: 'claimVictory' });
      } else {
        break;
      }
    }
    expect(steps).toBeLessThan(2000);
    expect(result.state.phase).toBe('over');
  });
});

describe('Miniboss', () => {
  it('shows the intro, drafts one curse, then fights two words, granting a slot, full heal, and rare choice', () => {
    const { state } = start('miniboss-rewards');
    let result = enterMiniboss(state);
    expect(result.state.phase).toBe('bossIntro');
    expect(result.state.bossIntro?.boss).toBe('miniboss');
    expect(result.state.bossCursesLeft).toBe(1);

    result.state.slots = 10;
    result.state.hp = 1;
    const draft = act(result.state, { type: 'continue' });
    expect(draft.state.phase).toBe('curse');
    expect(draft.state.curse?.boss).toBe(true);
    let round = act(draft.state, {
      type: 'chooseCurse',
      curseId: draft.state.curse!.options[0],
    });
    expect(round.state.phase).toBe('round');
    expect(round.state.round?.boss).toBe('miniboss');
    expect(round.state.round?.gauntletTotal).toBe(2);
    round = act(round.state, { type: 'guess', word: round.state.round!.answer });
    round = act(round.state, { type: 'guess', word: round.state.round!.answer });

    expect(round.state.phase).toBe('summary');
    expect(round.state.summary?.rewardPending).toBe(true);
    expect(round.state.slots).toBe(11);
    expect(round.state.hp).toBe(round.state.maxHp);

    const reward = act(round.state, { type: 'continue' });
    expect(reward.state.phase).toBe('reward');
    expect(reward.state.reward?.miniboss).toBe(true);
    expect(reward.state.reward?.options.map((option) => option.kind).sort())
      .toEqual(['eat', 'item']);
    const chosen = act(reward.state, {
      type: 'chooseReward',
      optionId: reward.state.reward!.options[0].id,
    });
    expect(chosen.state.phase).not.toBe('reward');
  });

  it('orders the intro, then the curse draft, then the fight', () => {
    const { state } = start('miniboss-order');
    let result = enterMiniboss(state);
    expect(result.state.phase).toBe('bossIntro');
    result = act(result.state, { type: 'continue' });
    expect(result.state.phase).toBe('curse');
    expect(result.state.curse?.boss).toBe(true);
    result = act(result.state, {
      type: 'chooseCurse',
      curseId: result.state.curse!.options[0],
    });
    expect(result.state.phase).toBe('round');
    expect(result.state.round?.boss).toBe('miniboss');
  });

  it('has 5 more base damage than a normal encounter', () => {
    const { state } = start('miniboss-damage');
    let result = enterMiniboss(state);
    result.state.curses = [];
    result.state.bonusBaseDamage = 0;
    result.state.bossCursesLeft = 0;
    result = act(result.state, { type: 'continue' });
    expect(result.state.round?.baseDamage).toBe(8);
  });
});

describe('future objects', () => {
  it('offers the Red Amulet, Silver Key, or Nonsensical Map and grants one', () => {
    const event = HAPPENING_BY_ID.get('peddlers-table');
    expect(event?.options.map((option) => option.id))
      .toEqual(['red-amulet', 'silver-key', 'nonsensical-map']);
    for (const id of ['red-amulet', 'silver-key', 'nonsensical-map']) {
      const item = ITEM_BY_ID.get(id);
      expect(item?.noSpawn, id).toBe(true);
      expect(item?.slots, id).toBe(0);
      expect(item?.description.toLowerCase(), id).toContain('later');
    }

    const run = findHappeningById('peddlers-table', 'peddlers-table');
    const chosen = act(run.state, { type: 'choose', optionId: 'silver-key' });
    expect(chosen.state.items.some((item) => item.id === 'silver-key')).toBe(true);
  });

  it('locks objects the player already carries', () => {
    let found: StepResult | undefined;
    for (let index = 0; index < 900 && !found; index++) {
      const run = start(`peddlers-owned-${index}`);
      run.state.items.push({ instance: 'i-amulet', id: 'red-amulet', data: {}, equipped: true });
      run.state.items.push({ instance: 'i-key', id: 'silver-key', data: {}, equipped: true });
      const next = nextHappening(run.state);
      if (next.state.happening?.id === 'peddlers-table') found = next;
    }
    expect(found).toBeDefined();
    const options = found!.state.happening!.options;
    expect(options.find((option) => option.id === 'red-amulet')?.locked).toBe(true);
    expect(options.find((option) => option.id === 'silver-key')?.locked).toBe(true);
    expect(options.find((option) => option.id === 'nonsensical-map')?.locked).toBe(false);
  });

  it('makes the Red Amulet stir when the Miniboss falls, even while unequipped', () => {
    const { state } = start('miniboss-amulet');
    state.items.push({
      instance: 'i-amulet',
      id: 'red-amulet',
      data: {},
      equipped: false,
    });
    let result = enterMiniboss(state);
    const draft = act(result.state, { type: 'continue' });
    result = act(draft.state, {
      type: 'chooseCurse',
      curseId: draft.state.curse!.options[0],
    });
    result.state.hp = result.state.maxHp;
    result = act(result.state, { type: 'guess', word: result.state.round!.answer });
    result = act(result.state, { type: 'guess', word: result.state.round!.answer });
    expect(result.state.phase).toBe('summary');
    expect(result.events.some(
      (event) => event.type === 'itemProc'
        && event.item === 'red-amulet'
        && event.text === 'stirs',
    )).toBe(true);
  });
});

describe('The Unredaction', () => {
  function findUnredaction(prefix: string, purged: string[]): StepResult {
    for (let index = 0; index < 900; index++) {
      const run = start(`${prefix}-${index}`);
      run.state.purged = purged.slice();
      const next = nextHappening(run.state);
      if (next.state.happening?.id === 'unredaction') return next;
    }
    throw new Error('could not find The Unredaction');
  }

  it('offers two purged letters and a curse draft', () => {
    const run = findUnredaction('unredaction', ['q', 'z', 'x']);
    const options = run.state.happening!.options;
    const letterIds = options.map((option) => option.id).filter((id) => id !== 'curse');
    expect(letterIds).toHaveLength(2);
    expect(new Set(letterIds).size).toBe(2);
    for (const id of letterIds) expect(['q', 'z', 'x']).toContain(id);
    expect(options.some((option) => option.id === 'curse')).toBe(true);
  });

  it('restores the chosen letter', () => {
    const run = findUnredaction('unredaction-restore', ['q', 'z', 'x']);
    const letter = run.state.happening!.options.find((option) => option.id !== 'curse')!.id;
    const chosen = act(run.state, { type: 'choose', optionId: letter });
    expect(chosen.state.purged).not.toContain(letter);
    expect(chosen.state.happening?.resolved?.success).toBe(true);
  });

  it('opens a curse draft instead', () => {
    const run = findUnredaction('unredaction-curse', ['q', 'z', 'x']);
    const chosen = act(run.state, { type: 'choose', optionId: 'curse' });
    expect(chosen.state.phase).toBe('curse');
    expect(chosen.state.curse?.options.length).toBeGreaterThan(0);
  });

  it('does not appear with fewer than two purged letters', () => {
    for (let index = 0; index < 200; index++) {
      const run = start(`unredaction-one-${index}`);
      run.state.purged = ['q'];
      const next = nextHappening(run.state);
      expect(next.state.happening?.id).not.toBe('unredaction');
    }
  });
});

describe('Floor Boss', () => {
  it('puts the final shop and three curse drafts on floor 38, then enters the boss', () => {
    const { state } = start('boss-prep');
    const bossIndex = nodeAt(
      state,
      (node) => node.kind === 'boss' && node.boss === 'floor-boss',
    );
    expect(state.nodes[bossIndex]?.level).toBe(39);
    expect(state.nodes[bossIndex - 1]).toMatchObject({ kind: 'curse', level: 38 });
    expect(state.nodes
      .filter((node) => node.level === 38)
      .map((node) => node.kind))
      .toEqual(['shop', 'curse', 'curse', 'curse']);

    state.nodeIndex = bossIndex - 2;
    state.phase = 'shop';
    state.shop = shopState();
    let result = act(state, { type: 'continue' });
    expect(result.state.phase).toBe('curse');
    expect(result.state.level).toBe(38);
    expect(result.state.curse?.boss).toBeFalsy();
    const option = result.state.curse?.options[0];
    expect(option).toBeDefined();
    result = act(result.state, { type: 'chooseCurse', curseId: option! });
    expect(result.state.phase).toBe('bossIntro');
    expect(result.state.bossIntro?.boss).toBe('floor-boss');
  });

  it('continues to the Mysterious Room after the boss and only Claim victory ends the run', () => {
    const { state } = start();
    const intro = enterFloorBoss(state);
    expect(intro.state.phase).toBe('bossIntro');

    let result = act(intro.state, { type: 'continue' });
    expect(result.state.round?.gauntletTotal).toBe(3);

    for (let i = 0; i < 3; i++) {
      if (result.state.phase !== 'round' || !result.state.round) break;
      result = act(result.state, { type: 'guess', word: result.state.round.answer });
    }

    expect(result.state.phase).toBe('summary');
    expect(result.state.summary?.rewardPending).toBe(false);
    const room = act(result.state, { type: 'continue' });
    expect(room.state.phase).toBe('mysteriousRoom');
    expect(room.state.over).toBeUndefined();
    expect(room.state.level).toBe(40);
    expect(room.events.some((event) => event.type === 'runEnded')).toBe(false);

    const won = act(room.state, { type: 'claimVictory' });
    expect(won.state.phase).toBe('over');
    expect(won.state.over?.result).toBe('victory');
    expect(won.events.filter((event) => event.type === 'runEnded')).toHaveLength(1);
  });

  it('has 10 more base damage than a normal encounter', () => {
    const { state } = start('boss-damage');
    let result = enterFloorBoss(state);
    result.state.curses = [];
    result.state.bonusBaseDamage = 0;
    result = act(result.state, { type: 'continue' });
    expect(result.state.round?.baseDamage).toBe(13);
  });

  it('resets hints and skips letters seen in an earlier gauntlet puzzle', () => {
    const { state } = start('omen-gauntlet');
    let result = enterFloorBoss(state);
    result = act(result.state, { type: 'continue' });
    expect(result.state.round?.gauntletTotal).toBe(3);
    result.state.round!.answer = 'crane';
    result.state.round!.freeLeft = 0;
    result.state.round!.hints.q = 'absent';
    result = act(result.state, { type: 'guess', word: 'slate' }); // a and e are yellow
    result = act(result.state, { type: 'guess', word: 'crane' }); // solve puzzle 1
    expect(result.state.round!.gauntletIndex).toBe(1);
    expect(result.state.round!.guesses).toHaveLength(0);
    expect(result.state.round!.hints).toEqual({});
    expect(result.state.round!.seenPresent).toEqual(expect.arrayContaining(['a', 'e']));

    result.state.round!.answer = 'trace';
    result.state.spells = [{ instance: 's-omen', id: 'omen' }];
    const cast = act(result.state, { type: 'castSpell', instance: 's-omen' });
    const hint = Object.keys(cast.state.round!.hints ?? {})[0];
    expect(['a', 'e']).not.toContain(hint);
    expect(['t', 'r', 'c']).toContain(hint);
  });
});

describe('Mysterious Room', () => {
  function enterRoom(state: RunState): StepResult {
    const index = nodeAt(state, (node) => node.kind === 'mysteriousRoom');
    state.nodeIndex = index - 1;
    state.phase = 'shop';
    state.shop = shopState();
    return act(state, { type: 'continue' });
  }

  it('flags each lore item selected at the Peddler\'s Table', () => {
    for (const id of ['red-amulet', 'silver-key', 'nonsensical-map']) {
      const run = findHappeningById(`peddlers-flag-${id}`, 'peddlers-table');
      const chosen = act(run.state, { type: 'choose', optionId: id });
      expect(chosen.state.loreBrought?.[id]).toBe(true);
      expect(chosen.state.items.some((item) => item.id === id)).toBe(true);
    }
  });

  it('does not count merely owning a lore item without the event pick', () => {
    const { state } = start('mysterious-owned');
    state.items.push({ instance: 'i-amulet', id: 'red-amulet', data: {}, equipped: true });
    const room = enterRoom(state);
    expect(room.state.phase).toBe('mysteriousRoom');
    expect(room.state.mysteriousBrought).toEqual([]);
    expect(room.events.find((event) => event.type === 'mysteriousRoomEntered'))
      .toMatchObject({ brought: [] });
  });

  it('counts each flagged item once and never double counts on resume', () => {
    const { state } = start('mysterious-count');
    state.loreBrought = { 'red-amulet': true, 'silver-key': true };
    const room = enterRoom(state);
    const entered = room.events.find((event) => event.type === 'mysteriousRoomEntered');
    expect(entered).toEqual({ type: 'mysteriousRoomEntered', brought: ['red-amulet', 'silver-key'] });
    expect(room.state.mysteriousCounted).toBe(true);

    const resumed = game.deserialize(game.serialize(room.state))!;
    const won = act(resumed, { type: 'claimVictory' });
    expect(won.events.some((event) => event.type === 'mysteriousRoomEntered')).toBe(false);
    expect(won.state.phase).toBe('over');
    expect(won.state.over?.result).toBe('victory');
  });

  it('claim victory ends the run exactly once', () => {
    const { state } = start('mysterious-claim');
    const room = enterRoom(state);
    const won = act(room.state, { type: 'claimVictory' });
    expect(won.state.phase).toBe('over');
    expect(won.state.over?.result).toBe('victory');
    expect(won.events.filter((event) => event.type === 'runEnded')).toHaveLength(1);

    const again = act(won.state, { type: 'claimVictory' });
    expect(again.events.filter((event) => event.type === 'runEnded')).toHaveLength(0);
  });
});

describe('Evil Parrot theft', () => {
  function idleRun(seed: string) {
    const { state } = start(seed);
    state.items = state.items.filter((item) => item.id !== 'evil-parrot');
    state.gold = 10;
    state.round!.remainingMs = null;
    state.round!.parrotIdleMs = 0;
    return state;
  }

  function stepMs(state: RunState, ms: number): StepResult {
    let current = state;
    const events: GameEvent[] = [];
    for (let elapsed = 0; elapsed < ms; elapsed += 1_000) {
      const result = act(current, { type: 'tick', dtMs: 1_000 });
      current = result.state;
      events.push(...result.events);
    }
    return { state: current, events };
  }

  it('does not need a parrot in the inventory', () => {
    const state = idleRun('parrot-steal-none');
    expect(state.items.some((item) => item.id === 'evil-parrot')).toBe(false);
    state.round!.parrotIdleMs = 194_000;
    const ticked = act(state, { type: 'tick', dtMs: 1_000 });
    expect(ticked.state.gold).toBe(6);
    expect(ticked.events.some(
      (event) => event.type === 'message' && event.text === 'The Evil Parrot swipes 4 gold.',
    )).toBe(true);
  });

  it('waits 194 full seconds and steals at 195', () => {
    const before = idleRun('parrot-steal-boundary');
    before.round!.parrotIdleMs = 193_000;
    const at194 = act(before, { type: 'tick', dtMs: 1_000 });
    expect(at194.state.gold).toBe(10);
    expect(at194.state.round?.parrotIdleMs).toBe(194_000);

    const at195 = act(at194.state, { type: 'tick', dtMs: 1_000 });
    expect(at195.state.gold).toBe(6);
    expect(at195.state.round?.parrotIdleMs).toBe(0);
  });

  it('takes all remaining gold when under 4', () => {
    const state = idleRun('parrot-steal-small');
    state.gold = 3;
    state.round!.parrotIdleMs = 194_000;
    const ticked = act(state, { type: 'tick', dtMs: 1_000 });
    expect(ticked.state.gold).toBe(0);
    expect(ticked.events.some(
      (event) => event.type === 'message' && event.text === 'The Evil Parrot swipes 3 gold.',
    )).toBe(true);
  });

  it('takes nothing at 0 gold but still resets the timer', () => {
    const state = idleRun('parrot-steal-broke');
    state.gold = 0;
    state.round!.parrotIdleMs = 194_000;
    const ticked = act(state, { type: 'tick', dtMs: 1_000 });
    expect(ticked.state.gold).toBe(0);
    expect(ticked.state.round?.parrotIdleMs).toBe(0);
    expect(ticked.events.some((event) => event.type === 'goldChanged')).toBe(false);
    expect(ticked.events.some(
      (event) => event.type === 'message' && event.text.includes('swipes'),
    )).toBe(false);
  });

  it('repeats after another 195 seconds of inactivity', () => {
    const state = idleRun('parrot-steal-repeat');
    state.round!.parrotIdleMs = 194_000;
    const first = act(state, { type: 'tick', dtMs: 1_000 });
    expect(first.state.gold).toBe(6);

    const second = stepMs(first.state, 195_000);
    expect(second.state.gold).toBe(2);
    const steals = second.events.filter(
      (event) => event.type === 'message' && event.text.includes('swipes'),
    );
    expect(steals).toHaveLength(1);
  });

  it('resets the idle counter on a player guess but not on a friend guess', () => {
    const state = idleRun('parrot-steal-reset');
    state.round!.remainingMs = null;
    state.round!.answer = 'crane';
    state.round!.parrotIdleMs = 120_000;
    const guessed = act(state, { type: 'guess', word: 'slate' });
    expect(guessed.state.round?.parrotIdleMs).toBe(0);

    guessed.state.round!.parrotIdleMs = 120_000;
    guessed.state.spells = [{ instance: 's-phone', id: 'phone-friend' }];
    const cast = act(guessed.state, { type: 'castSpell', instance: 's-phone' });
    expect(cast.state.round?.parrotIdleMs).toBe(120_000);
  });

  it('does not count paused or non-round time', () => {
    const state = idleRun('parrot-steal-pause');
    state.round!.parrotIdleMs = 100_000;
    state.round!.frozenUntilGuess = true;
    const frozen = act(state, { type: 'tick', dtMs: 1_000 });
    expect(frozen.state.round?.parrotIdleMs).toBe(100_000);

    frozen.state.phase = 'shop';
    frozen.state.shop = shopState();
    const shopping = act(frozen.state, { type: 'tick', dtMs: 1_000 });
    expect(shopping.state.round?.parrotIdleMs).toBe(100_000);
  });

  it('resets at the start of each round', () => {
    const state = idleRun('parrot-steal-next-round');
    state.round!.parrotIdleMs = 150_000;
    const next = nextRound(state);
    expect(next.state.round?.parrotIdleMs).toBe(0);
  });
});

describe('The Toll Collector', () => {
  it('pays 11 gold and resolves the event', () => {
    const run = findHappeningById('toll-pay', 'toll-collector');
    run.state.gold = 20;
    const paid = act(run.state, { type: 'choose', optionId: 'pay' });
    expect(paid.state.gold).toBe(9);
    expect(paid.state.phase).toBe('happening');
    expect(paid.state.happening?.resolved?.option).toBe('pay');
  });

  it('locks payment under 11 gold and forces the extra curse draft', () => {
    let run: StepResult | undefined;
    for (let index = 0; index < 900 && !run; index++) {
      const started = start(`toll-broke-${index}`);
      started.state.gold = 5;
      const next = nextHappening(started.state);
      if (next.state.happening?.id === 'toll-collector') run = next;
    }
    expect(run).toBeDefined();
    expect(run!.state.happening?.options.find((option) => option.id === 'pay')?.locked)
      .toBe(true);

    const refused = act(run!.state, { type: 'choose', optionId: 'refuse' });
    expect(refused.state.phase).toBe('curse');
    expect(refused.state.happening?.resolved?.option).toBe('refuse');
    expect(refused.state.curse?.returnToHappening).toBe(true);
    expect(refused.state.curse?.options.length).toBeGreaterThan(0);

    const before = refused.state.curses.reduce((sum, curse) => sum + curse.stacks, 0);
    const drafted = act(refused.state, {
      type: 'chooseCurse',
      curseId: refused.state.curse!.options[0],
    });
    const after = drafted.state.curses.reduce((sum, curse) => sum + curse.stacks, 0);
    expect(after).toBe(before + 1);
    expect(drafted.state.gold).toBe(5);
    expect(drafted.state.phase).toBe('happening');
    expect(drafted.state.happening?.resolved?.option).toBe('refuse');
  });

  it('makes the draft mandatory rather than skippable', () => {
    const run = findHappeningById('toll-mandatory', 'toll-collector');
    run.state.gold = 20;
    const refused = act(run.state, { type: 'choose', optionId: 'refuse' });
    expect(refused.state.phase).toBe('curse');
    const skipped = act(refused.state, { type: 'continue' });
    expect(skipped.state.phase).toBe('curse');
    expect(skipped.events.some(
      (event) => event.type === 'message' && event.text === 'Choose a curse first.',
    )).toBe(true);
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

describe('autocast and random-guess batch', () => {
  it('ships a non-native guess pool including etude and butte', () => {
    expect(CONTENT.nonnative).toHaveLength(217);
    expect(CONTENT.nonnative).toContain('patsy');
    expect(CONTENT.nonnative).toContain('wharf');
    expect(CONTENT.nonnative).toContain('rajah');
    expect(CONTENT.nonnative).toContain('guppy');
    expect(CONTENT.nonnative).toContain('glyph');
    expect(CONTENT.nonnative).toContain('lymph');
    expect(CONTENT.nonnative).toContain('gaunt');
    expect(CONTENT.nonnative).toContain('wryly');
    expect(CONTENT.nonnative).toContain('jaunt');
    expect(CONTENT.nonnative).toContain('vaunt');
    expect(CONTENT.nonnative).toContain('lurid');
    expect(CONTENT.nonnative).toContain('torus');
    expect(CONTENT.nonnative).toContain('bough');
    expect(CONTENT.nonnative).toContain('caput');
    expect(CONTENT.nonnative).toContain('etude');
    expect(CONTENT.nonnative).toContain('butte');
    expect(CONTENT.nonnative).toContain('easel');
    expect(CONTENT.nonnative).toContain('smock');
    expect(CONTENT.nonnative).not.toContain('daisy');
    expect(new Set(CONTENT.nonnative).size).toBe(217);
    for (const word of CONTENT.nonnative) {
      expect(word, word).toMatch(/^[a-z]{5}$/);
    }
  });

  it('removes Chikn Nuggy from Phone a Friend', () => {
    expect(CONTENT.friendWords).not.toContain('chikn');
    expect(CONTENT.friendWords).not.toContain('nuggy');
  });

  it('removes Big Belt and keeps Harvest Charm out of shops', () => {
    expect(ITEM_BY_ID.get('big-belt')).toBeUndefined();
    expect(ITEM_BY_ID.get('harvest-charm')?.noSpawn).toBe(true);

    for (let index = 0; index < 100; index++) {
      const { state } = start(`harvest-shop-${index}`);
      state.nodeIndex = 0;
      state.nodes[1] = { kind: 'shop', level: 1 };
      state.phase = 'shop';
      const shop = enterShop(state).state.shop;
      expect(
        shop?.offers.some((offer) => offer.kind === 'item' && offer.def === 'harvest-charm'),
      ).toBe(false);
    }
  });

  it('Harvest Charm autoguesses a non-native word at round start', () => {
    const { state } = start('harvest-charm-guess');
    state.spells = [];
    state.items.push({ instance: 'i-harvest', id: 'harvest-charm', data: {}, equipped: true });
    const next = nextRound(state);
    const friend = next.state.round?.guesses.find((guess) => guess.by === 'friend');
    expect(friend).toBeDefined();
    expect(CONTENT.nonnative).toContain(friend?.word);
  });

  it('Empty Mouth autoguesses when the round starts with no spells', () => {
    const { state } = start('empty-mouth');
    state.spells = [];
    state.items.push({ instance: 'i-mouth', id: 'empty-mouth', data: {}, equipped: true });
    const next = nextRound(state);
    expect(next.state.round?.guesses.some((guess) => guess.by === 'friend')).toBe(true);
  });

  it('Dark Echo guesses a word with no shared letters', () => {
    let sawFriend = false;
    for (let index = 0; index < 40 && !sawFriend; index++) {
      const { state } = start(`dark-echo-${index}`);
      state.items.push({ instance: 'i-dark', id: 'dark-echo', data: { used: 0 }, equipped: true });
      setAnswer(state, 'crane');
      state.round!.freeLeft = 0;
      const first = act(state, { type: 'guess', word: 'sloth' });
      const friend = first.state.round?.guesses.find((guess) => guess.by === 'friend');
      if (!friend) continue;
      sawFriend = true;
      expect(friend.word.split('').some((letter) => 'sloth'.includes(letter))).toBe(false);
    }
    expect(sawFriend).toBe(true);
  });

  it('Palindrome and Oasis 15 trigger random guesses from player guesses', () => {
    const palindrome = start('palindrome');
    palindrome.state.items.push({
      instance: 'i-pal',
      id: 'palindrome',
      data: { used: 0 },
      equipped: true,
    });
    setAnswer(palindrome.state, 'crane');
    palindrome.state.round!.freeLeft = 0;
    const pal = act(palindrome.state, { type: 'guess', word: 'civic' });
    expect(pal.state.round?.guesses.some((guess) => guess.by === 'friend')).toBe(true);

    const crisis = start('crisis-15');
    crisis.state.items.push({
      instance: 'i-crisis',
      id: 'crisis-15',
      data: {},
      equipped: true,
    });
    setAnswer(crisis.state, 'crane');
    crisis.state.round!.freeLeft = 0;
    const isGuess = act(crisis.state, { type: 'guess', word: 'taxis' });
    expect(isGuess.state.round?.guesses.some((guess) => guess.by === 'friend')).toBe(true);
    expect(ITEM_BY_ID.get('crisis-15')?.name).toBe('Oasis 15');
  });

  it('Echo Chamber carries its cast count across rounds', () => {
    const { state } = start('echo-chamber');
    state.items.push({
      instance: 'i-echo',
      id: 'echo-chamber',
      data: { casts: 1 },
      equipped: true,
    });
    state.spells = [{ instance: 's-heal', id: 'heal' }];
    const cast = act(state, { type: 'castSpell', instance: 's-heal' });
    expect(cast.state.round?.guesses.some((guess) => guess.by === 'friend')).toBe(true);
    expect(cast.state.items.find((item) => item.id === 'echo-chamber')?.data.casts).toBe(2);
  });

  it('Restore suppresses vision curses for the rest of the round', () => {
    const { state } = start('restore-vision');
    state.curses.push({ id: 'censor', stacks: 1 });
    state.spells = [{ instance: 's-restore', id: 'restore' }];
    setAnswer(state, 'crane');
    const restored = act(state, { type: 'castSpell', instance: 's-restore' });
    const guessed = act(restored.state, { type: 'guess', word: 'slate' });
    const view = game.view(guessed.state);
    if (view.phase.kind !== 'round') throw new Error('expected round');
    expect(view.phase.board.guesses[0].tiles[0]).not.toBe('hidden');
  });

  it('Naked Curse removes all max armor', () => {
    expect(CURSE_BY_ID.get('naked')?.maxArmorMult).toBe(0);
    expect(CURSE_BY_ID.get('naked')?.minLevel).toBe(20);
    const { state } = start('naked-curse');
    state.phase = 'curse';
    state.curse = { options: ['naked'], starting: false };
    const chosen = act(state, { type: 'chooseCurse', curseId: 'naked' });
    expect(chosen.state.curses.some((curse) => curse.id === 'naked')).toBe(true);
    expect(chosen.state.maxArmor).toBe(0);
    expect(chosen.state.armor).toBe(0);
  });

  it('Ricochet autoguesses after losing 10 armor', () => {
    const { state } = start('ricochet');
    state.items.push({ instance: 'i-rico', id: 'ricochet', data: { lost: 0 }, equipped: true });
    state.maxArmor = 20;
    state.armor = 20;
    setAnswer(state, 'crane');
    state.round!.freeLeft = 0;
    let current = state;
    for (const word of ['slate', 'pride', 'brick', 'crony']) {
      current = act(current, { type: 'guess', word }).state;
    }
    expect(current.items.find((item) => item.id === 'ricochet')?.data.lost).toBe(2);
    expect(current.round?.guesses.some((guess) => guess.by === 'friend')).toBe(true);
  });

  it('marks the new uncommon and weighted content', () => {
    expect(ITEM_BY_ID.get('counterweight')?.rarity).toBe('uncommon');
    expect(ITEM_BY_ID.get('counterweight')?.price).toBe(10);
    expect(ITEM_BY_ID.get('thorn-crown')?.rarity).toBe('uncommon');
    expect(ITEM_BY_ID.get('thorn-crown')?.price).toBe(14);
    expect(ITEM_BY_ID.get('chrono-anchor')?.rarity).toBe('uncommon');
    expect(ITEM_BY_ID.get('encore')?.unique).toBe(true);
    expect(ITEM_BY_ID.get('encore')?.appearanceWeight).toBe(3);
    expect(FOOD_BY_ID.get('poppy-seeds')?.rarity).toBe('common');
    expect(FOOD_BY_ID.get('poppy-seeds')?.shopRarity).toBe('uncommon');
    expect(FOOD_BY_ID.get('poppy-seeds')?.appearanceWeight).toBeUndefined();
  });

  it('swaps the Knafeh and Double Dip identities', () => {
    expect(FOOD_BY_ID.get('knafeh')?.effects).toEqual([{ type: 'revealLetter', letter: 'k' }]);
    expect(FOOD_BY_ID.get('knafeh')?.unique).toBe(true);
    expect(FOOD_BY_ID.get('kase')?.name).toBe('Double Dip');
    expect(FOOD_BY_ID.get('kase')?.effects).toContainEqual({ type: 'maxArmor', delta: 1 });
    expect(FOOD_BY_ID.get('kase')?.effects).toContainEqual({ type: 'queueLastAnswer' });
    expect(FOOD_BY_ID.get('kase')?.unique).toBe(true);
  });

  it('adds the new letter foods and prices', () => {
    const expected: Record<string, [string, number, string]> = {
      'e-fu-noodles': ['E-Fu Noodles', 21, 'e'],
      't-bone': ['T-Bone', 14, 't'],
      'j-ello': ['J-Ello', 8, 'j'],
      'c-urchin': ['C-Urchin', 14, 'c'],
      'f-unnel-cake': ['F-Unnel Cake', 13, 'f'],
      'h-erring': ['H-Erring', 13, 'h'],
      'p-stachio': ['P-Stachio', 13, 'p'],
      'l-bacore-tuna': ['L-Bacore Tuna', 16, 'l'],
      'w-asabi': ['W-Asabi', 10, 'w'],
    };
    for (const [id, [name, price, letter]] of Object.entries(expected)) {
      expect(FOOD_BY_ID.get(id)?.name, id).toBe(name);
      expect(FOOD_BY_ID.get(id)?.price, id).toBe(price);
      expect(FOOD_BY_ID.get(id)?.unique, id).toBe(true);
      expect(FOOD_BY_ID.get(id)?.effects, id)
        .toContainEqual({ type: 'revealLetter', letter });
    }
    expect(FOOD_BY_ID.get('i-spy')?.name).toBe('I-Cee');
    expect(FOOD_BY_ID.get('i-spy')?.price).toBe(16);
    expect(FOOD_BY_ID.get('b-file')?.name).toBe('B-Fsteak');
    expect(FOOD_BY_ID.get('b-file')?.price).toBe(13);
    expect(FOOD_BY_ID.get('q-tip')?.price).toBe(6);
    expect(FOOD_BY_ID.get('o-toro')?.price).toBe(18);
    expect(FOOD_BY_ID.get('only-u')?.price).toBe(14);

    for (const id of [
      'only-u', 'b-file', 'q-tip', 'gg-gum', 'yin-yang',
      'j-ello', 'c-urchin', 'f-unnel-cake', 'h-erring', 'w-asabi', 'knafeh',
      'e-fu-noodles', 'i-spy', 'o-toro', 't-bone', 'p-stachio', 'l-bacore-tuna',
      'a-steak', 'reveal-the-d',
    ]) {
      expect(FOOD_BY_ID.get(id)?.rarity, id).toBe('rare');
      expect(FOOD_BY_ID.get(id)?.shopRarity, id).toBeUndefined();
    }
    expect(FOOD_BY_ID.get('pay-respects-f')?.rarity).toBe('common');
    expect(FOOD_BY_ID.get('pay-respects-f')?.shopRarity).toBe('uncommon');
    expect(FOOD_BY_ID.get('pay-respects-f')?.price).toBe(8);
    expect(FOOD_BY_ID.get('pay-respects-f')?.effects)
      .toContainEqual({ type: 'purgeLetter', letter: 'f' });
  });

  it('adds the new random-guess and autocast items', () => {
    const ids = [
      'empty-mouth', 'empty-orb', 'empty-phone', 'detour', 'dark-echo',
      'black-eye', 'palindrome', 'crisis-15', 'shellshock', 'echo-chamber',
      'panic-button', 'wild-magic',
    ];
    for (const id of ids) expect(ITEM_BY_ID.get(id), id).toBeDefined();
    expect(ITEM_BY_ID.get('dark-echo')?.rarity).toBe('uncommon');
    expect(ITEM_BY_ID.get('dark-echo')?.price).toBe(13);
    expect(ITEM_BY_ID.get('detour')?.price).toBe(10);
    expect(ITEM_BY_ID.get('wild-magic')?.price).toBe(9);
    expect(ITEM_BY_ID.get('panic-button')?.price).toBe(8);
    expect(ITEM_BY_ID.get('black-eye')?.price).toBe(8);
    expect(ITEM_BY_ID.get('black-eye')?.description).toContain('80%');
    expect(ITEM_BY_ID.get('palindrome')?.rarity).toBe('rare');
    expect(ITEM_BY_ID.get('palindrome')?.price).toBe(10);
    expect(ITEM_BY_ID.get('scattershot')?.rarity).toBe('uncommon');
    expect(ITEM_BY_ID.get('scattershot')?.price).toBe(10);
    expect(ITEM_BY_ID.get('empty-orb')?.price).toBe(7);
    expect(ITEM_BY_ID.get('empty-phone')?.price).toBe(9);
  });

  it('Empty Orb and Empty Phone cast at round start with no spells', () => {
    const { state } = start('empty-orb-phone');
    state.spells = [];
    state.items.push(
      { instance: 'i-orb', id: 'empty-orb', data: {}, equipped: true },
      { instance: 'i-phone', id: 'empty-phone', data: {}, equipped: true },
    );
    const next = nextRound(state);
    const casts = next.events.filter(
      (event) => event.type === 'spellCast' && event.auto,
    ).map((event) => event.type === 'spellCast' ? event.spell.id : '');
    expect(casts).toContain('omen');
    expect(casts).toContain('phone-friend');
  });

  it('adds Idiot Moron to the friend phrase list and wharf to the guess pool', () => {
    expect(CONTENT.friendPhrases).toContainEqual(['idiot', 'moron']);
    expect(CONTENT.nonnative).toContain('wharf');
  });
});

describe('Genie Summon and Combustion Engine', () => {
  it('Genie Summon autocasts after the third player guess of the round', () => {
    const { state } = start('genie-summon');
    state.items.push({
      instance: 'i-genie',
      id: 'genie-summon',
      data: { guesses: 0 },
      equipped: true,
    });
    state.spells = [{ instance: 's-phone', id: 'phone-friend' }];
    setAnswer(state, 'crane');
    state.round!.freeLeft = 0;
    const first = act(state, { type: 'guess', word: 'slate' });
    const phone = act(first.state, { type: 'castSpell', instance: 's-phone' });
    expect(phone.state.items.find((item) => item.id === 'genie-summon')?.data.guesses).toBe(1);
    const second = act(phone.state, { type: 'guess', word: 'brick' });
    const third = act(second.state, { type: 'guess', word: 'vamps' });
    expect(first.events.some((event) => event.type === 'spellCast' && event.auto)).toBe(false);
    expect(phone.events.some((event) => event.type === 'spellCast' && event.auto)).toBe(false);
    expect(second.events.some((event) => event.type === 'spellCast' && event.auto)).toBe(false);
    expect(third.events.some((event) => event.type === 'spellCast' && event.auto)).toBe(true);
    expect(third.state.items.find((item) => item.id === 'genie-summon')?.data.guesses).toBe(3);
    expect(ITEM_BY_ID.get('genie-summon')?.price).toBe(8);
    expect(ITEM_BY_ID.get('genie-summon')?.rarity).toBe('uncommon');
  });

  it('caps a round-start autocast chain', () => {
    const { state } = start('autocast-cap');
    state.spells = [];
    state.items.push(
      { instance: 'i-empty-hand', id: 'empty-hand', data: {}, equipped: true },
      { instance: 'i-empty-orb', id: 'empty-orb', data: {}, equipped: true },
      { instance: 'i-empty-phone', id: 'empty-phone', data: {}, equipped: true },
      { instance: 'i-empty-armor', id: 'empty-armor', data: {}, equipped: true },
      { instance: 'i-empty-mouth', id: 'empty-mouth', data: {}, equipped: true },
      { instance: 'i-combustion', id: 'combustion-engine', data: {}, equipped: true },
      { instance: 'i-second-hand', id: 'second-hand', data: {}, equipped: true },
      { instance: 'i-counter', id: 'engine', data: {}, equipped: true },
    );
    const next = nextRound(state);
    const autoCasts = next.events.filter(
      (event) => event.type === 'spellCast' && event.auto,
    );
    expect(autoCasts.length).toBeLessThanOrEqual(10);
    expect(next.state.round?.guesses.length).toBeGreaterThanOrEqual(1);
  });

  it('Combustion Engine is rare and triggers only on autocasts, at 25%', () => {
    expect(ITEM_BY_ID.get('combustion-engine')?.rarity).toBe('rare');
    let chained = 0;
    for (let index = 0; index < 40; index++) {
      const { state } = start(`combustion-${index}`);
      state.permanentRoundStartSpells = ['omen'];
      state.items.push({
        instance: 'i-combustion',
        id: 'combustion-engine',
        data: {},
        equipped: true,
      });
      const next = nextRound(state);
      const autoCasts = next.events.filter(
        (event) => event.type === 'spellCast' && event.auto,
      );
      expect(autoCasts.length).toBeLessThanOrEqual(2);
      if (autoCasts.length >= 2) chained++;
    }
    expect(chained).toBeGreaterThan(0);

    const manual = start('combustion-manual');
    manual.state.items.push({
      instance: 'i-combustion-manual',
      id: 'combustion-engine',
      data: {},
      equipped: true,
    });
    manual.state.spells = [{ instance: 's-heal', id: 'heal' }];
    const cast = act(manual.state, { type: 'castSpell', instance: 's-heal' });
    expect(cast.events.some(
      (event) => event.type === 'spellCast' && event.auto,
    )).toBe(false);
    expect(ITEM_BY_ID.get('combustion-engine')?.rarity).toBe('rare');
    expect(ITEM_BY_ID.get('combustion-engine')?.appearanceWeight).toBe(3);
    expect(ITEM_BY_ID.get('combustion-engine')?.description).toContain('25%');
    expect(ITEM_BY_ID.get('engine')?.name).toBe('Counterclockwise');
  });
});

describe('round-start autoguess foods', () => {
  it('Fortune Cookie queues one autoguess for the next round', () => {
    const { state } = start('fortune-cookie');
    state.phase = 'shop';
    state.gold = 10;
    state.shop = shopState([{ id: 'f0', kind: 'eat', def: 'fortune-cookie', price: 2 }]);
    const bought = act(state, { type: 'buy', offerId: 'f0' });
    expect(bought.state.nextRoundRandomGuesses).toBe(1);
    const next = nextRound(bought.state);
    expect(next.state.round?.guesses.some((guess) => guess.by === 'friend')).toBe(true);
    expect(next.state.nextRoundRandomGuesses).toBe(0);

    expect(FOOD_BY_ID.get('fortune-cookie')?.price).toBe(2);
    expect(FOOD_BY_ID.get('fortune-cookie')?.appearanceWeight).toBe(5);
    expect(FOOD_BY_ID.get('fortune-cookie')?.effects)
      .toContainEqual({ type: 'queueRandomGuesses', count: 1 });
  });

  it('Moon Cake autocasts Omen at the start of every round', () => {
    const { state } = start('moon-cake');
    state.phase = 'shop';
    state.gold = 30;
    state.shop = shopState([{ id: 'f0', kind: 'eat', def: 'moon-cake', price: 25 }]);
    const bought = act(state, { type: 'buy', offerId: 'f0' });
    expect(bought.state.permanentRoundStartSpells).toContain('omen');

    const first = nextRound(bought.state);
    expect(first.events.some(
      (event) => event.type === 'spellCast' && event.auto && event.spell.id === 'omen',
    )).toBe(true);

    const second = nextRound(first.state);
    expect(second.events.some(
      (event) => event.type === 'spellCast' && event.auto && event.spell.id === 'omen',
    )).toBe(true);

    expect(FOOD_BY_ID.get('moon-cake')?.price).toBe(25);
    expect(FOOD_BY_ID.get('moon-cake')?.rarity).toBe('rare');
    expect(FOOD_BY_ID.get('moon-cake')?.unique).toBe(true);
    expect(FOOD_BY_ID.get('moon-cake')?.effects)
      .toContainEqual({ type: 'permanentRoundStartSpell', spell: 'omen' });
  });

  it('Heartstone is a rare relic that autocasts Heal at the start of every round', () => {
    const { state } = start('heartstone');
    state.items.push({
      instance: 'i-heartstone',
      id: 'heartstone',
      data: {},
      equipped: true,
    });
    state.hp = 4;
    const maxHpBefore = state.maxHp;

    const first = nextRound(state);
    expect(first.events.some(
      (event) => event.type === 'spellCast' && event.auto && event.spell.id === 'heal',
    )).toBe(true);
    expect(first.state.hp).toBeGreaterThan(4);
    expect(first.state.maxHp).toBe(maxHpBefore + 1);

    const second = nextRound(first.state);
    expect(second.events.some(
      (event) => event.type === 'spellCast' && event.auto && event.spell.id === 'heal',
    )).toBe(true);

    expect(ITEM_BY_ID.get('heartstone')?.price).toBe(15);
    expect(ITEM_BY_ID.get('heartstone')?.rarity).toBe('rare');
    expect(ITEM_BY_ID.get('heartstone')?.unique).toBe(true);
  });
});

describe('content and rules batch', () => {
  it('never chooses a blacklisted word as the target', () => {
    const { state } = start('blacklist-target');
    const last = CONTENT.answers[CONTENT.answers.length - 1];
    state.blacklist = CONTENT.answers.filter((word) => word !== last);
    state.usedAnswers = CONTENT.answers.filter((word) => word !== last);
    const next = nextRound(state);
    expect(next.state.round?.answer).toBe(last);
  });

  it('auto-guesses do not lower solve gold', () => {
    const { state } = start('auto-gold');
    state.permanentRoundStartWord = 'eieio';
    const next = nextRound(state);
    expect(next.state.round?.guesses.some((guess) => guess.by === 'friend')).toBe(true);
    next.state.round!.answer = 'crane';
    const solved = act(next.state, { type: 'guess', word: 'crane' });
    expect(solved.state.gold).toBeGreaterThanOrEqual(16); // 12 starting gold + 4-8 solve gold
    expect(solved.state.gold).toBeLessThanOrEqual(20);
  });

  it('Enoki queues an autoguess and gives +3 max HP', () => {
    const { state } = start('enoki');
    state.phase = 'shop';
    state.gold = 10;
    state.shop = shopState([{ id: 'f0', kind: 'eat', def: 'enoki', price: 4 }]);
    const hp = state.maxHp;
    const bought = act(state, { type: 'buy', offerId: 'f0' });
    expect(bought.state.maxHp).toBe(hp + 3);
    expect(bought.state.nextRoundRandomGuesses).toBe(1);
    const next = nextRound(bought.state);
    expect(next.state.round?.guesses.some((guess) => guess.by === 'friend')).toBe(true);
    expect(FOOD_BY_ID.get('enoki')?.price).toBe(4);
  });

  it('Corn gives +2 max HP and reveals C, O, R and N for one round', () => {
    const { state } = start('corn');
    state.phase = 'shop';
    state.gold = 10;
    state.shop = shopState([{ id: 'f0', kind: 'eat', def: 'corn', price: 3 }]);
    const hp = state.maxHp;
    const bought = act(state, { type: 'buy', offerId: 'f0' });
    expect(bought.state.maxHp).toBe(hp + 2);
    expect(bought.state.nextRoundReveals.sort()).toEqual(['c', 'n', 'o', 'r']);

    const next = nextRound(bought.state);
    expect(next.state.nextRoundReveals).toEqual([]);
    expect(Object.keys(next.state.round?.hints ?? {}).sort()).toEqual(['c', 'n', 'o', 'r']);

    const after = nextRound(next.state);
    expect(after.state.round?.hints.c).toBeUndefined();
    expect(FOOD_BY_ID.get('corn')?.price).toBe(3);
  });

  it('applies the new food tiers and removals', () => {
    expect(FOOD_BY_ID.get('one-bo-hue')?.rarity).toBe('uncommon');
    expect(FOOD_BY_ID.get('taco-pizza-party')?.rarity).toBe('rare');
    expect(FOOD_BY_ID.get('iron-ration')?.price).toBe(12);
    expect(FOOD_BY_ID.get('iron-ration')?.rarity).toBe('rare');
    expect(FOOD_BY_ID.get('plating')?.rarity).toBe('uncommon');
    expect(FOOD_BY_ID.get('muffin-tin')?.rarity).toBe('uncommon');
    expect(FOOD_BY_ID.get('bitter-root')).toBeUndefined();
    expect(FOOD_BY_ID.get('spring-tonic')).toBeUndefined();
    expect(ITEM_BY_ID.get('bottomless')).toBeUndefined();
    expect(ITEM_BY_ID.get('acquired-taste')?.price).toBe(7);
  });
});

describe('letter happenings', () => {
  it('removes Know the Letter and keeps Purge the Letter', () => {
    expect(HAPPENING_BY_ID.get('know-the-letter')).toBeUndefined();
    expect(HAPPENING_BY_ID.get('purge-the-letter')).toBeDefined();
  });

  it('Purge the Letter permanently purges the chosen letter', () => {
    const { state } = start('purge-letter-event');
    state.phase = 'happening';
    state.happening = { id: 'purge-the-letter', options: [], letters: ['q', 'x'] };
    const chosen = act(state, { type: 'choose', optionId: 'q' });
    expect(chosen.state.purged).toContain('q');
    expect(chosen.state.happening?.resolved?.success).toBe(true);
  });

  it('lets the 80% Purge letter option fail', () => {
    const purge = start('purge-letter-fail').state;
    purge.phase = 'happening';
    purge.happening = { id: 'purge-the-letter', options: [], letters: ['q', 'x'] };
    purge.rng = 4;
    const failedPurge = act(purge, { type: 'choose', optionId: 'x' });
    expect(failedPurge.state.purged).not.toContain('x');
    expect(failedPurge.state.happening?.resolved?.success).toBe(false);
  });

  it('offers two Purge letters with 100% and 80% odds', () => {
    let purge: RunState['happening'];
    for (let index = 0; index < 400 && !purge; index++) {
      const { state } = start(`letter-event-${index}`);
      const next = nextHappening(state);
      if (next.state.happening?.id === 'purge-the-letter') purge = next.state.happening;
    }
    expect(purge?.letters).toHaveLength(2);
    expect(new Set(purge?.letters).size).toBe(2);
    const letterOptions = purge?.options.filter((option) => option.id !== 'leave') ?? [];
    expect(letterOptions).toHaveLength(2);
    expect(letterOptions.map((option) => option.chancePct ?? 0).sort((a, b) => a - b))
      .toEqual([80, 100]);
  });
});

describe('relic uniqueness', () => {
  const relicIds = [...ITEM_BY_ID.values()]
    .filter((item) => item.rarity === 'rare')
    .map((item) => item.id);

  it('never offers a relic already in the player inventory', () => {
    expect(relicIds).toHaveLength(12);
    let sawOtherRelic = false;
    for (let index = 0; index < 60; index++) {
      const { state } = start(`relic-owned-${index}`);
      state.items.push({ instance: 'i-owned', id: 'mending-plate', data: {}, equipped: true });
      state.nodeIndex = 0;
      state.nodes[1] = { kind: 'shop', level: 1 };
      state.phase = 'shop';
      const offers = enterShop(state).state.shop?.offers ?? [];
      for (const offer of offers) {
        if (offer.kind !== 'item') continue;
        const def = ITEM_BY_ID.get(offer.def);
        if (def?.rarity !== 'rare') continue;
        expect(offer.def).not.toBe('mending-plate');
        sawOtherRelic = true;
      }
    }
    expect(sawOtherRelic).toBe(true);
  });

  it('never offers an owned relic as a round reward', () => {
    for (let index = 0; index < 20; index++) {
      const { state } = start(`relic-owned-reward-${index}`);
      state.items.push({ instance: 'i-owned', id: 'mending-plate', data: {}, equipped: true });
      state.nodes = [
        { kind: 'round', level: 1 },
        { kind: 'round', level: 2 },
      ];
      state.nodeIndex = 0;
      state.round!.freeLeft = 0;
      state.round!.answer = CONTENT.answers[index % CONTENT.answers.length];
      const solved = act(state, { type: 'guess', word: state.round!.answer });
      const reward = act(solved.state, { type: 'continue' });
      expect(reward.state.phase).toBe('reward');
      for (const option of reward.state.reward?.options ?? []) {
        if (option.kind !== 'item' || !option.def) continue;
        expect(option.def).not.toBe('mending-plate');
      }
    }
  });

  it('random relic effects only grant relics the player does not own', () => {
    const { state } = start('relic-cake');
    for (const id of relicIds.filter((id) => id !== 'mending-plate')) {
      state.items.push({ instance: `i-${id}`, id, data: {}, equipped: true });
    }
    state.phase = 'shop';
    state.gold = 100;
    state.shop = shopState([{ id: 'f0', kind: 'eat', def: 'coveted-cake', price: 11 }]);
    const bought = act(state, { type: 'buy', offerId: 'f0' });
    expect(bought.state.items.some((item) => item.id === 'mending-plate')).toBe(true);
  });
});

describe('spellbroker and ledger additions', () => {
  it('lets the Spellbroker trade each spell for its payout', () => {
    const trade = (spell: string, optionId: string) => {
      const { state } = start(`spellbroker-${optionId}`);
      state.spells = [{ instance: `s-${spell}`, id: spell }];
      state.phase = 'happening';
      state.happening = { id: 'spellbroker', options: [] };
      return act(state, { type: 'choose', optionId });
    };

    const omen = trade('omen', 'omen');
    expect(omen.state.spells.some((spell) => spell.id === 'omen')).toBe(false);
    expect(omen.state.permanentReveals.length).toBe(1);

    const phone = trade('phone-friend', 'phone-friend');
    expect(phone.state.spells.some((spell) => spell.id === 'phone-friend')).toBe(false);
    expect(phone.state.permanentReveals.length).toBe(1);

    const heal = trade('heal', 'heal');
    expect(heal.state.spells.some((spell) => spell.id === 'heal')).toBe(false);
    expect(heal.state.maxHp).toBe(25);
    expect(heal.state.hp).toBe(25);

    const immunity = trade('immunity', 'immunity');
    expect(immunity.state.spells.some((spell) => spell.id === 'immunity')).toBe(false);
    expect(immunity.state.maxArmor).toBe(12);
    expect(immunity.state.armor).toBe(12);

    const restore = trade('restore', 'restore');
    expect(restore.state.spells.some((spell) => spell.id === 'restore')).toBe(false);
    expect(restore.state.maxArmor).toBe(12);
    expect(restore.state.armor).toBe(12);
  });

  it('will not take a trade without the required spell', () => {
    const { state } = start('spellbroker-empty');
    state.spells = [];
    state.phase = 'happening';
    state.happening = { id: 'spellbroker', options: [] };
    const chosen = act(state, { type: 'choose', optionId: 'heal' });
    expect(chosen.state.happening?.resolved).toBeUndefined();
    expect(chosen.state.maxHp).toBe(state.maxHp);
    expect(chosen.events.some((event) => event.type === 'message')).toBe(true);
  });

  it('Spell Tithe trades one random spell for knowledge or a purge', () => {
    let seed = '';
    for (let index = 0; index < 400 && !seed; index++) {
      const candidate = `spell-tithe-${index}`;
      const { state } = start(candidate);
      state.spells = [{ instance: 's-heal', id: 'heal' }];
      state.nodes = [
        { kind: 'round', level: 1 },
        { kind: 'happening', level: 2 },
      ];
      state.nodeIndex = 0;
      state.phase = 'shop';
      const opened = act(state, { type: 'continue' });
      if (opened.state.happening?.id === 'spell-tithe') seed = candidate;
    }
    expect(seed).not.toBe('');

    const openTithe = (spells: RunState['spells']) => {
      const { state } = start(seed);
      state.spells = spells;
      state.nodes = [
        { kind: 'round', level: 1 },
        { kind: 'happening', level: 2 },
      ];
      state.nodeIndex = 0;
      state.phase = 'shop';
      return act(state, { type: 'continue' }).state;
    };

    const paid = openTithe([{ instance: 's-heal', id: 'heal' }]);
    const know = paid.happening?.options.find((option) => option.id.startsWith('know-'));
    const purge = paid.happening?.options.find((option) => option.id.startsWith('purge-'));
    expect(know).toBeDefined();
    expect(purge).toBeDefined();
    expect(know?.locked).toBe(false);
    expect(purge?.locked).toBe(false);
    expect(know?.description).toContain('Lose a random spell');

    const chosen = act(paid, { type: 'choose', optionId: know!.id });
    expect(chosen.state.spells).toHaveLength(0);
    const letter = know!.id.slice('know-'.length);
    expect(chosen.state.permanentReveals).toContain(letter);
    expect(chosen.state.happening?.resolved?.success).toBe(true);

    const broke = openTithe([]);
    const lockedKnow = broke.happening?.options.find((option) => option.id.startsWith('know-'));
    expect(lockedKnow?.locked).toBe(true);
    const refused = act(broke, { type: 'choose', optionId: lockedKnow!.id });
    expect(refused.state.happening?.resolved).toBeUndefined();
    expect(refused.state.spells).toHaveLength(0);
  });

  it('marks one random shop offer half price across items, food and spells', () => {
    const kinds = new Set<string>();
    for (let index = 0; index < 240; index++) {
      const { state } = start(`sale-kind-${index}`);
      state.nodeIndex = 0;
      state.nodes[1] = { kind: 'shop', level: 1 };
      state.phase = 'shop';
      const shop = enterShop(state).state.shop;
      const sale = shop?.offers.find((offer) => offer.sale);
      expect(sale, `sale-kind-${index}`).toBeDefined();
      expect(sale?.originalPrice).toBeGreaterThanOrEqual(sale!.price);
      expect(sale?.price).toBe(Math.max(1, Math.floor((sale?.originalPrice ?? 0) / 2)));
      kinds.add(sale!.kind);
    }
    expect(kinds.has('item')).toBe(true);
    expect(kinds.has('eat')).toBe(true);
    expect(kinds.has('spell')).toBe(true);
  });

  it('Black Market Ledger watches purchases and events', () => {
    const ledger = ITEM_BY_ID.get('black-market-ledger');
    expect(ledger?.on?.onPurchase).toBeTypeOf('function');
    expect(ledger?.on?.onHappening).toBeTypeOf('function');
    expect(ledger?.description).toContain('50%');
    expect(ledger?.description).toContain('event');
    expect(ledger?.on?.onPurchase?.(undefined as never, undefined as never))
      .toContainEqual({ type: 'giveSpell', spell: 'random', chancePct: 50 });
    expect(ledger?.on?.onHappening?.(undefined as never, undefined as never))
      .toContainEqual({ type: 'giveSpell', spell: 'random', chancePct: 50 });
  });

  it('Fortune Cookie survives a second shop before the next round', () => {
    const { state } = start('fortune-two-shops');
    state.nodes = [
      { kind: 'shop', level: 1 },
      { kind: 'shop', level: 2 },
      { kind: 'round', level: 3 },
    ];
    state.nodeIndex = 0;
    state.level = 1;
    state.phase = 'shop';
    state.gold = 10;
    state.shop = shopState([{ id: 'f0', kind: 'eat', def: 'fortune-cookie', price: 2 }]);
    const bought = act(state, { type: 'buy', offerId: 'f0' });
    expect(bought.state.nextRoundRandomGuesses).toBe(1);

    const toSecond = act(bought.state, { type: 'continue' });
    expect(toSecond.state.phase).toBe('shopChoice');
    const secondShop = act(toSecond.state, { type: 'choose', optionId: 'shop' });
    expect(secondShop.state.nextRoundRandomGuesses).toBe(1);

    const next = act(secondShop.state, { type: 'continue' });
    expect(next.state.round?.guesses.some((guess) => guess.by === 'friend')).toBe(true);
    expect(next.state.nextRoundRandomGuesses).toBe(0);
  });
});

describe('item tuning batch', () => {
  it('Oracle Skull is a 12g uncommon that casts Omen on every heal', () => {
    const skull = ITEM_BY_ID.get('oracle-skull');
    expect(skull?.price).toBe(12);
    expect(skull?.rarity).toBe('uncommon');
    expect(skull?.description).toContain('Whenever you are healed');

    const { state } = start('oracle-skull-heals');
    state.items.push({ instance: 'i-skull', id: 'oracle-skull', data: {}, equipped: true });
    state.hp = 1;
    setAnswer(state, 'crane');
    state.spells = [
      { instance: 's-heal-1', id: 'heal' },
      { instance: 's-heal-2', id: 'heal' },
    ];
    const first = act(state, { type: 'castSpell', instance: 's-heal-1' });
    const second = act(first.state, { type: 'castSpell', instance: 's-heal-2' });
    const omens = [...first.events, ...second.events].filter(
      (event) => event.type === 'spellCast' && event.auto && event.spell.id === 'omen',
    );
    expect(omens).toHaveLength(2);
  });

  it('Placebo heals exactly 1 HP on any guess, including an autoguess', () => {
    expect(ITEM_BY_ID.get('placebo')?.price).toBe(4);
    expect(ITEM_BY_ID.get('placebo')?.description).toContain('autoguess');
    const { state } = start('placebo-one');
    state.items.push({ instance: 'i-placebo', id: 'placebo', data: {}, equipped: true });
    state.hp = 5;
    setAnswer(state, 'crane');
    state.round!.freeLeft = 1;
    const guessed = act(state, { type: 'guess', word: 'slate' });
    expect(guessed.state.hp).toBe(6);
    expect(guessed.events.filter(
      (event) => event.type === 'healed' && event.source.kind === 'item',
    )).toHaveLength(1);

    const auto = start('placebo-auto');
    auto.state.items.push({ instance: 'i-placebo-auto', id: 'placebo', data: {}, equipped: true });
    auto.state.permanentRoundStartWord = 'slate';
    auto.state.hp = 5;
    const next = nextRound(auto.state);
    expect(next.state.round?.guesses.some((guess) => guess.by === 'friend')).toBe(true);
    expect(next.state.hp).toBe(6);
  });

  it('Loyalty Card pays a slot after 10 purchases', () => {
    const { state } = start('loyalty-card-ten');
    state.items.push({ instance: 'i-loyalty', id: 'loyalty-card', data: { buys: 0 }, equipped: true });
    state.phase = 'shop';
    state.gold = 100;
    state.shop = shopState(
      Array.from({ length: 10 }, (_, index) => ({
        id: `o${index}`,
        kind: 'spell' as const,
        def: 'heal',
        price: 1,
      })),
    );
    let current = state;
    for (let index = 0; index < 9; index++) {
      current = act(current, { type: 'buy', offerId: `o${index}` }).state;
    }
    expect(current.slots).toBe(4);
    current = act(current, { type: 'buy', offerId: 'o9' }).state;
    expect(current.slots).toBe(5);
  });

  it('Loose Tongue is a 12g uncommon', () => {
    const tongue = ITEM_BY_ID.get('loose-tongue');
    expect(tongue?.price).toBe(12);
    expect(tongue?.rarity).toBe('uncommon');
    expect(tongue?.allowInvalidGuesses).toBe(true);
  });
});

describe('secret gold-spent damage', () => {
  it('tracks gold spent on a purchase', () => {
    const { state } = start('gold-spent-track');
    state.phase = 'shop';
    state.gold = 100;
    state.shop = shopState([{ id: 'o0', kind: 'item', def: 'bloom', price: 10 }]);
    const bought = act(state, { type: 'buy', offerId: 'o0' });
    expect(bought.state.goldSpent).toBe(10);
  });

  it('adds +1 encounter damage for every 60 gold spent', () => {
    for (const [spent, expected] of [[0, 3], [59, 3], [60, 4], [120, 5]]) {
      const { state } = start(`gold-spent-damage-${spent}`);
      state.goldSpent = spent;
      state.curses = [];
      state.bonusBaseDamage = 0;
      state.maxArmor = 0;
      state.armor = 0;
      state.hp = 16;
      setAnswer(state, 'crane');
      state.round!.freeLeft = 0;
      const before = state.hp;
      const guessed = act(state, { type: 'guess', word: 'slate' });
      expect(before - guessed.state.hp, `spent ${spent}`).toBe(expected);
    }
  });
});

describe('Last Cast', () => {
  it('does not trigger on an auto-cast spell', () => {
    const { state } = start('last-cast-auto');
    state.items.push({ instance: 'i-last', id: 'last-cast', data: { used: 0 }, equipped: true });
    state.spells = [];
    state.permanentRoundStartSpells = ['omen'];
    const next = nextRound(state);
    expect(next.events.some(
      (event) => event.type === 'spellCast' && event.auto && event.spell.id === 'omen',
    )).toBe(true);
    expect(next.events.some(
      (event) => event.type === 'itemProc' && event.item === 'last-cast',
    )).toBe(false);
    expect(next.state.items.find((item) => item.id === 'last-cast')?.data.used).toBe(0);
  });

  it('still triggers after manually casting the last spell', () => {
    const { state } = start('last-cast-manual');
    state.items.push({ instance: 'i-last', id: 'last-cast', data: { used: 0 }, equipped: true });
    state.spells = [{ instance: 's-heal', id: 'heal' }];
    state.hp = 5;
    const cast = act(state, { type: 'castSpell', instance: 's-heal' });
    expect(cast.state.spells).toHaveLength(0);
    expect(cast.events.some(
      (event) => event.type === 'spellCast' && event.auto,
    )).toBe(true);
    expect(cast.state.items.find((item) => item.id === 'last-cast')?.data.used).toBe(1);
  });
});

describe('Second Wind and late curse pool', () => {
  it('adds a second word with one free guess and one reward', () => {
    const { state } = start('second-wind');
    state.curses.push({ id: 'second-wind', stacks: 1 });
    const started = nextRound(state);
    expect(started.state.round?.gauntletTotal).toBe(2);
    setAnswer(started.state, 'crane');
    started.state.round!.freeLeft = 0;
    const first = act(started.state, { type: 'guess', word: 'crane' });
    expect(first.state.phase).toBe('round');
    expect(first.state.round?.gauntletIndex).toBe(1);
    expect(first.state.round?.freeLeft).toBe(1);
    expect(first.state.round?.answer).not.toBe('crane');
    expect(first.state.round?.gauntletAnswers).toEqual(['crane']);

    setAnswer(first.state, 'trace');
    const second = act(first.state, { type: 'guess', word: 'trace' });
    expect(second.state.phase).toBe('summary');
    expect(second.state.summary?.answers).toEqual(['crane', 'trace']);
    expect(second.state.summary?.rewardPending).toBe(true);
  });

  it('reapplies knowledge food reveals to the second word', () => {
    const { state } = start('second-wind-knowledge');
    state.curses.push({ id: 'second-wind', stacks: 1 });
    state.permanentReveals.push('q');
    const started = nextRound(state);
    expect(started.state.round?.hints.q).toBeDefined();

    setAnswer(started.state, 'crane');
    started.state.round!.freeLeft = 0;
    const first = act(started.state, { type: 'guess', word: 'crane' });
    expect(first.state.round?.gauntletIndex).toBe(1);
    expect(first.state.round?.hints.q).toBeDefined();
  });

  it('does not add a fourth Floor Boss puzzle or a free guess', () => {
    const { state } = start('second-wind-boss');
    state.curses.push({ id: 'second-wind', stacks: 1 });
    let result = enterFloorBoss(state);
    result = act(result.state, { type: 'continue' });
    expect(result.state.round?.gauntletTotal).toBe(3);
    setAnswer(result.state, 'crane');
    result.state.round!.freeLeft = 0;
    result = act(result.state, { type: 'guess', word: 'crane' });
    expect(result.state.round?.gauntletIndex).toBe(1);
    expect(result.state.round?.freeLeft).toBe(0);
  });

  it('stops offering Chained and Tax after level 20 and Toll after level 40', () => {
    expect(CURSE_BY_ID.get('toll')?.maxLevel).toBe(40);
    expect(CURSE_BY_ID.get('chained')?.maxLevel).toBe(20);
    expect(CURSE_BY_ID.get('tax')?.maxLevel).toBe(20);
    for (let index = 0; index < 40; index++) {
      const { state } = start(`late-curse-${index}`);
      state.nodeIndex = 0;
      state.nodes[1] = { kind: 'curse', level: 21 };
      state.phase = 'shop';
      const opened = act(state, { type: 'continue' });
      if (opened.state.phase !== 'curse') continue;
      const options = game.view(opened.state).phase;
      if (options.kind !== 'curse') continue;
      expect(options.options).not.toContain('chained');
      expect(options.options).not.toContain('tax');
    }
    for (let index = 0; index < 40; index++) {
      const { state } = start(`late-toll-${index}`);
      state.nodeIndex = 0;
      state.nodes[1] = { kind: 'curse', level: 41 };
      state.phase = 'shop';
      const opened = act(state, { type: 'continue' });
      if (opened.state.phase !== 'curse') continue;
      const options = game.view(opened.state).phase;
      if (options.kind !== 'curse') continue;
      expect(options.options).not.toContain('toll');
      expect(options.options).not.toContain('chained');
      expect(options.options).not.toContain('tax');
    }
  });
});

describe('curse rarity and trigger curses', () => {
  it('assigns the configured rarities and removes retired curses', () => {
    for (const id of [
      'censor', 'second-sight', 'third-eye', 'fourth-wall', 'editor',
      'vowel-fog', 'monochrome', 'a-curse', 'ts-curse', 'rip-curse', 'e-curse',
      'second-wind',
    ]) {
      expect(CURSE_BY_ID.get(id)?.rarity, id).toBe('rare');
    }
    for (const id of ['hard-r', 'without-d', 'ip-theft']) {
      expect(CURSE_BY_ID.get(id)?.rarity, id).toBe('uncommon');
    }
    for (const id of [
      'sleeper', 'porcupine', 'clock', 'the-list', 'la-curse', 'triggerless', 'short-fuse',
    ]) {
      expect(CURSE_BY_ID.get(id)?.rarity, id).toBe('common');
    }
    expect(CURSE_BY_ID.get('short-fuse')?.maxStacks).toBe(4);
    expect(CURSE_BY_ID.get('short-fuse')?.damageRampEarly).toBe(1);
    expect(CURSE_BY_ID.get('short-fuse')?.damageRampEarlyPerStack).toBe(1);
    expect(CURSE_BY_ID.get('no-help')).toBeUndefined();
    expect(CURSE_BY_ID.get('slow-mending')?.noSpawn).toBe(true);
    expect(CURSE_BY_ID.get('slow-mending')?.healMult).toBe(0.5);
    expect(CURSE_BY_ID.get('triggerless')?.name).toBe('Triggerless');
    expect(CURSE_BY_ID.get('triggerless')?.minLevel).toBe(20);
    expect(CURSE_BY_ID.get('regurgitation')?.minLevel).toBe(20);
    expect(CURSE_BY_ID.get('regurgitation')?.rarity).toBe('uncommon');
    expect(CURSE_BY_ID.get('chained')?.maxLevel).toBe(20);
    expect(CURSE_BY_ID.get('tax')?.maxLevel).toBe(20);
  });

  it('upgrades commons that are passed up or selected', () => {
    const passed = start('curse-upgrade-pass');
    passed.state.curse = { options: ['sleeper', 'censor'], starting: false };
    passed.state.phase = 'curse';
    const passedResult = act(passed.state, { type: 'chooseCurse', curseId: 'censor' });
    expect(passedResult.state.upgradedCommonCurses).toContain('sleeper');

    const selected = start('curse-upgrade-selected');
    selected.state.curse = { options: ['clock', 'censor'], starting: false };
    selected.state.phase = 'curse';
    const selectedResult = act(selected.state, { type: 'chooseCurse', curseId: 'clock' });
    expect(selectedResult.state.upgradedCommonCurses).toContain('clock');
  });

  it('still drafts when no common curses remain', () => {
    for (let index = 0; index < 24; index++) {
      const { state } = start(`no-common-curses-${index}`);
      state.level = 21;
      state.upgradedCommonCurses = [
        'sleeper', 'porcupine', 'clock', 'the-list', 'la-curse', 'triggerless', 'short-fuse',
      ];
      state.nodeIndex = 0;
      state.nodes[1] = { kind: 'curse', level: 21 };
      state.phase = 'shop';
      const opened = act(state, { type: 'continue' });
      if (opened.state.phase !== 'curse') continue;
      const view = game.view(opened.state).phase;
      if (view.kind !== 'curse') continue;
      expect(view.options).toHaveLength(2);
    }
  });

  it('Triggerless makes autoguesses fail sometimes', () => {
    let succeeded = 0;
    let failed = 0;
    for (let index = 0; index < 50; index++) {
      const { state } = start(`triggerless-${index}`);
      state.curses.push({ id: 'triggerless', stacks: 1 });
      state.permanentRandomGuesses = 1;
      const next = nextRound(state);
      const guessed = next.state.round?.guesses.some((guess) => guess.by === 'friend');
      if (guessed) succeeded++;
      else failed++;
    }
    expect(succeeded).toBeGreaterThan(0);
    expect(failed).toBeGreaterThan(0);
  });

  it('Triggerless does not swallow fixed round-start words', () => {
    for (let index = 0; index < 20; index++) {
      const { state } = start(`triggerless-round-word-${index}`);
      state.curses.push({ id: 'triggerless', stacks: 1 });
      state.permanentRoundStartWord = 'eieio';
      const next = nextRound(state);
      expect(
        next.state.round?.guesses.some(
          (guess) => guess.by === 'friend' && guess.word === 'eieio',
        ),
        `seed ${index}`,
      ).toBe(true);
    }
  });

  it('Triggerless makes autocasts fail sometimes', () => {
    let cast = 0;
    let failed = 0;
    for (let index = 0; index < 50; index++) {
      const { state } = start(`triggerless-autocast-${index}`);
      state.curses.push({ id: 'triggerless', stacks: 1 });
      state.permanentRoundStartSpells = ['omen'];
      const next = nextRound(state);
      if (next.events.some(
        (event) => event.type === 'spellCast' && event.auto && event.spell.id === 'omen',
      )) {
        cast++;
      }
      if (next.events.some(
        (event) => event.type === 'message'
          && event.text.includes('Triggerless swallows the autocast'),
      )) {
        failed++;
      }
    }
    expect(cast).toBeGreaterThan(0);
    expect(failed).toBeGreaterThan(0);
  });

  it('Regurgitation makes food reveals fail sometimes', () => {
    let revealed = 0;
    let failed = 0;
    for (let index = 0; index < 40; index++) {
      const { state } = start(`regurgitation-${index}`);
      state.curses.push({ id: 'regurgitation', stacks: 1 });
      state.phase = 'shop';
      state.gold = 20;
      state.shop = shopState([{ id: 'o0', kind: 'eat', def: 'b-file', price: 13 }]);
      const eaten = act(state, { type: 'buy', offerId: 'o0' });
      if (eaten.state.permanentReveals.includes('b')) revealed++;
      else failed++;
    }
    expect(revealed).toBeGreaterThan(0);
    expect(failed).toBeGreaterThan(0);
  });
});

describe('balance pass', () => {
  it('applies the food prices and Head Start tuning', () => {
    expect(FOOD_BY_ID.get('xiaolongbao')?.price).toBe(2);
    expect(FOOD_BY_ID.get('overtime-tea')?.price).toBe(2);
    expect(FOOD_BY_ID.get('taco-pizza-party')?.price).toBe(6);
    expect(FOOD_BY_ID.get('plov')?.price).toBe(3);
    expect(FOOD_BY_ID.get('fortune-cookie')?.price).toBe(2);
    expect(ITEM_BY_ID.get('head-start')?.price).toBe(14);
    expect(ITEM_BY_ID.get('head-start')?.rarity).toBe('rare');
    expect(ITEM_BY_ID.get('quickdraw')).toBeUndefined();
  });
});

describe('damage doubling and slots', () => {
  it('increases wrong-guess damage after the fifth guess', () => {
    const { state } = start('damage-doubling');
    setAnswer(state, 'crane');
    state.round!.baseDamage = 3;
    state.round!.freeLeft = 0;
    state.armor = 0;
    state.maxArmor = 0;
    state.hp = 200;
    state.maxHp = 200;

    let current = state;
    const damages: number[] = [];
    for (const word of [
      'slate', 'brick', 'plumb', 'chunk', 'vamps', 'fizzy', 'jumpy', 'waltz', 'jumbo',
    ]) {
      const before = current.hp;
      const result = act(current, { type: 'guess', word });
      damages.push(before - result.state.hp);
      current = result.state;
    }
    expect(damages).toEqual([3, 3, 3, 3, 3, 6, 9, 12, 15]);
  });

  it('consumes any remaining free guess when the safe guess limit is reached', () => {
    const { state } = start('multiplier-free-guess');
    setAnswer(state, 'crane');
    state.round!.baseDamage = 3;
    state.round!.freeLeft = 0;
    state.armor = 0;
    state.maxArmor = 0;
    state.hp = 200;
    state.maxHp = 200;
    let current = state;
    for (const word of ['slate', 'brick', 'plumb', 'chunk']) {
      current = act(current, { type: 'guess', word }).state;
    }

    // The fifth guess is the last safe guess. It spends one free guess and the
    // limit consumes the spare.
    current.round!.freeLeft = 2;
    const fifth = act(current, { type: 'guess', word: 'vamps' });
    expect(fifth.state.round?.freeLeft).toBe(0);
    expect(fifth.events.some(
      (event) => event.type === 'freeGuessesChanged' && event.remaining === 0,
    )).toBe(true);
    expect(fifth.events.some(
      (event) => event.type === 'damageMultiplier' && event.multiplier === 2,
    )).toBe(true);
  });

  it('moves the free-guess loss earlier with Short Fuse', () => {
    const one = start('short-fuse-free-guess');
    one.state.curses.push({ id: 'short-fuse', stacks: 1 });
    setAnswer(one.state, 'crane');
    one.state.round!.baseDamage = 3;
    one.state.round!.freeLeft = 0;
    one.state.armor = 0;
    one.state.maxArmor = 0;
    one.state.hp = 200;
    one.state.maxHp = 200;
    let current = one.state;
    for (const word of ['slate', 'brick', 'plumb']) {
      current = act(current, { type: 'guess', word }).state;
    }
    current.round!.freeLeft = 2;
    const fourth = act(current, { type: 'guess', word: 'chunk' });
    expect(fourth.state.round?.freeLeft).toBe(0);
    expect(fourth.events.some(
      (event) => event.type === 'freeGuessesChanged' && event.remaining === 0,
    )).toBe(true);
    expect(fourth.events.some(
      (event) => event.type === 'damageMultiplier' && event.multiplier === 2,
    )).toBe(true);

    const two = start('short-fuse-free-guess-two');
    two.state.curses.push({ id: 'short-fuse', stacks: 2 });
    setAnswer(two.state, 'crane');
    two.state.round!.baseDamage = 3;
    two.state.round!.freeLeft = 0;
    two.state.armor = 0;
    two.state.maxArmor = 0;
    two.state.hp = 200;
    two.state.maxHp = 200;
    current = act(two.state, { type: 'guess', word: 'slate' }).state;
    current = act(current, { type: 'guess', word: 'brick' }).state;
    current.round!.freeLeft = 2;
    const third = act(current, { type: 'guess', word: 'plumb' });
    expect(third.state.round?.freeLeft).toBe(0);
    expect(third.events.some(
      (event) => event.type === 'freeGuessesChanged' && event.remaining === 0,
    )).toBe(true);
    expect(third.events.some(
      (event) => event.type === 'damageMultiplier' && event.multiplier === 2,
    )).toBe(true);

    const four = start('short-fuse-free-guess-four');
    four.state.curses.push({ id: 'short-fuse', stacks: 4 });
    const next = nextRound(four.state);
    next.state.round!.freeLeft = 2;
    const first = act(next.state, { type: 'guess', word: 'slate' });
    expect(first.state.round?.freeLeft).toBe(0);
    expect(first.events.some(
      (event) => event.type === 'damageMultiplier' && event.multiplier === 2,
    )).toBe(true);
  });

  it('notifies each time the damage multiplier doubles', () => {
    const { state } = start('damage-doubling-notice');
    setAnswer(state, 'crane');
    state.round!.baseDamage = 3;
    state.round!.freeLeft = 0;
    state.armor = 0;
    state.maxArmor = 0;
    state.hp = 200;
    state.maxHp = 200;

    let current = state;
    for (const word of ['slate', 'brick', 'plumb', 'chunk']) {
      current = act(current, { type: 'guess', word }).state;
    }
    const fifth = act(current, { type: 'guess', word: 'vamps' });
    expect(fifth.events.some(
      (event) => event.type === 'damageMultiplier' && event.multiplier === 2,
    )).toBe(true);
    const sixth = act(fifth.state, { type: 'guess', word: 'fizzy' });
    expect(sixth.events.some(
      (event) => event.type === 'damageMultiplier' && event.multiplier === 3,
    )).toBe(true);
  });

  it('does not show the multiplier warning on a correct guess', () => {
    const { state } = start('damage-doubling-correct');
    setAnswer(state, 'crane');
    state.round!.baseDamage = 3;
    state.round!.freeLeft = 0;
    state.armor = 0;
    state.maxArmor = 0;
    state.hp = 200;
    state.maxHp = 200;

    let current = state;
    for (const word of ['slate', 'brick', 'plumb', 'chunk']) {
      current = act(current, { type: 'guess', word }).state;
    }
    const solved = act(current, { type: 'guess', word: 'crane' });
    expect(solved.state.phase).toBe('summary');
    expect(solved.events.some((event) => event.type === 'damageMultiplier')).toBe(false);
  });

  it('does not show the multiplier warning when the fifth guess kills you', () => {
    const { state } = start('damage-doubling-death');
    setAnswer(state, 'crane');
    state.round!.baseDamage = 3;
    state.round!.freeLeft = 0;
    state.armor = 0;
    state.maxArmor = 0;
    state.hp = 200;
    state.maxHp = 200;

    let current = state;
    for (const word of ['slate', 'brick', 'plumb', 'chunk']) {
      current = act(current, { type: 'guess', word }).state;
    }
    current.hp = 3;
    const fatal = act(current, { type: 'guess', word: 'vamps' });
    expect(fatal.state.phase).toBe('over');
    expect(fatal.events.some((event) => event.type === 'damageMultiplier')).toBe(false);
  });

  it('counts autoguesses toward the fifth-guess threshold', () => {
    let started: ReturnType<typeof nextRound> | undefined;
    for (let index = 0; index < 20 && !started; index++) {
      const run = start(`autoguess-double-${index}`);
      run.state.permanentRoundStartWord = 'slate';
      const next = nextRound(run.state);
      if (next.state.phase === 'round') started = next;
    }
    expect(started).toBeDefined();
    const round = started!.state.round!;
    expect(round.totalGuesses).toBe(1);
    expect(round.guesses).toHaveLength(1);
    round.answer = 'crane';
    round.baseDamage = 3;
    round.freeLeft = 0;
    started!.state.armor = 0;
    started!.state.maxArmor = 0;
    started!.state.hp = 200;
    started!.state.maxHp = 200;

    let current = started!.state;
    for (const word of ['brick', 'plumb', 'chunk', 'vamps']) {
      current = act(current, { type: 'guess', word }).state;
    }
    const before = current.hp;
    const sixth = act(current, { type: 'guess', word: 'fizzy' });
    expect(before - sixth.state.hp).toBe(6);
  });

  it('Short Fuse starts the multiplier one guess earlier per stack', () => {
    const one = start('short-fuse-one');
    one.state.curses.push({ id: 'short-fuse', stacks: 1 });
    setAnswer(one.state, 'crane');
    one.state.round!.baseDamage = 3;
    one.state.round!.freeLeft = 0;
    one.state.armor = 0;
    one.state.maxArmor = 0;
    one.state.hp = 200;
    one.state.maxHp = 200;
    let current = one.state;
    for (const word of ['slate', 'brick', 'plumb', 'chunk']) {
      current = act(current, { type: 'guess', word }).state;
    }
    const before = current.hp;
    const fifth = act(current, { type: 'guess', word: 'jumpy' });
    expect(before - fifth.state.hp).toBe(6);

    const two = start('short-fuse-two');
    two.state.curses.push({ id: 'short-fuse', stacks: 2 });
    setAnswer(two.state, 'crane');
    two.state.round!.baseDamage = 3;
    two.state.round!.freeLeft = 0;
    two.state.armor = 0;
    two.state.maxArmor = 0;
    two.state.hp = 200;
    two.state.maxHp = 200;
    current = two.state;
    for (const word of ['slate', 'brick', 'plumb']) {
      current = act(current, { type: 'guess', word }).state;
    }
    const stackedBefore = current.hp;
    const fourth = act(current, { type: 'guess', word: 'chunk' });
    expect(stackedBefore - fourth.state.hp).toBe(6);

    const three = start('short-fuse-three');
    three.state.curses.push({ id: 'short-fuse', stacks: 3 });
    setAnswer(three.state, 'crane');
    three.state.round!.baseDamage = 3;
    three.state.round!.freeLeft = 0;
    three.state.armor = 0;
    three.state.maxArmor = 0;
    three.state.hp = 200;
    three.state.maxHp = 200;
    current = three.state;
    for (const word of ['slate', 'brick']) {
      current = act(current, { type: 'guess', word }).state;
    }
    const firstBefore = current.hp;
    const third = act(current, { type: 'guess', word: 'plumb' });
    expect(firstBefore - third.state.hp).toBe(6);

    const four = start('short-fuse-four');
    four.state.curses.push({ id: 'short-fuse', stacks: 4 });
    setAnswer(four.state, 'crane');
    four.state.round!.baseDamage = 3;
    four.state.round!.freeLeft = 0;
    four.state.armor = 0;
    four.state.maxArmor = 0;
    four.state.hp = 200;
    four.state.maxHp = 200;
    current = act(four.state, { type: 'guess', word: 'slate' }).state;
    const fourBefore = current.hp;
    const second = act(current, { type: 'guess', word: 'brick' });
    expect(fourBefore - second.state.hp).toBe(6);
  });

  it('resets the damage multiplier on Second Wind puzzles', () => {
    const { state } = start('second-wind-ramp');
    state.curses.push({ id: 'second-wind', stacks: 1 });
    const started = nextRound(state);
    setAnswer(started.state, 'crane');
    started.state.round!.baseDamage = 3;
    started.state.round!.freeLeft = 0;
    started.state.armor = 0;
    started.state.maxArmor = 0;
    started.state.hp = 200;
    started.state.maxHp = 200;

    let current = started.state;
    for (const word of ['slate', 'brick', 'plumb', 'chunk', 'vamps', 'fizzy']) {
      current = act(current, { type: 'guess', word }).state;
    }
    const solved = act(current, { type: 'guess', word: 'crane' });
    expect(solved.state.round?.gauntletIndex).toBe(1);
    expect(solved.state.round?.guesses).toHaveLength(0);

    solved.state.round!.baseDamage = 3;
    solved.state.round!.freeLeft = 0;
    solved.state.armor = 0;
    solved.state.maxArmor = 0;
    solved.state.hp = 200;
    solved.state.maxHp = 200;
    const wrong = solved.state.round!.answer === 'slate' ? 'brick' : 'slate';
    const before = solved.state.hp;
    const hit = act(solved.state, { type: 'guess', word: wrong });
    expect(before - hit.state.hp).toBe(3);
    expect(hit.events.some(
      (event) => event.type === 'damageMultiplier',
    )).toBe(false);
  });

  it('resets the damage multiplier on each Floor Boss puzzle', () => {
    const { state } = start('boss-ramp');
    let result = enterFloorBoss(state);
    result = act(result.state, { type: 'continue' });
    expect(result.state.round?.gauntletTotal).toBe(3);

    result.state.round!.answer = 'crane';
    result.state.round!.freeLeft = 0;
    result.state.round!.baseDamage = 3;
    result.state.armor = 0;
    result.state.maxArmor = 0;
    result.state.hp = 200;
    result.state.maxHp = 200;
    let current = result.state;
    for (const word of ['slate', 'brick', 'plumb', 'chunk', 'vamps', 'fizzy']) {
      current = act(current, { type: 'guess', word }).state;
    }
    const solved = act(current, { type: 'guess', word: 'crane' });
    expect(solved.state.round?.gauntletIndex).toBe(1);
    expect(solved.state.round?.guesses).toHaveLength(0);

    solved.state.round!.baseDamage = 3;
    solved.state.round!.freeLeft = 0;
    solved.state.armor = 0;
    solved.state.maxArmor = 0;
    solved.state.hp = 200;
    solved.state.maxHp = 200;
    const wrong = solved.state.round!.answer === 'jumbo' ? 'waltz' : 'jumbo';
    const before = solved.state.hp;
    const hit = act(solved.state, { type: 'guess', word: wrong });
    expect(before - hit.state.hp).toBe(3);
  });

  it('adds one damage per equipped slot above five and previews the same number', () => {
    const { state } = start('slot-damage');
    state.items = state.items.filter((item) => item.id !== 'evil-parrot');
    state.slots = 7;
    for (let index = 0; index < 6; index++) {
      state.items.push({
        instance: `i-slot-${index}`,
        id: 'piggy-bank',
        data: {},
        equipped: true,
      });
    }
    setAnswer(state, 'crane');
    state.round!.baseDamage = 3;
    state.round!.freeLeft = 0;
    state.armor = 0;
    state.maxArmor = 0;

    const phase = game.view(state).phase;
    if (phase.kind !== 'round') throw new Error('expected round');
    expect(phase.board.rawNextGuessDamage).toBe(4);
    expect(phase.board.nextGuessBase).toBe(4);
    expect(phase.board.nextGuessMultiplier).toBe(1);
    expect(phase.board.damageRampEarly).toBe(0);
    expect(phase.board.damageBreakdown).toContainEqual({ label: 'Base', amount: 3, kind: 'add' });
    expect(phase.board.damageBreakdown).toContainEqual({ label: 'Extra item slots', amount: 1, kind: 'add' });

    const guessed = act(state, { type: 'guess', word: 'slate' });
    expect(guessed.state.hp).toBe(11);
  });

  it('exposes the Short Fuse ramp for the guess outline', () => {
    const { state } = start('short-fuse-outline');
    state.curses.push({ id: 'short-fuse', stacks: 1 });
    const phase = game.view(state).phase;
    if (phase.kind !== 'round') throw new Error('expected round');
    expect(phase.board.damageRampEarly).toBe(1);
  });

  it('counts equipped slots only, not unused capacity', () => {
    const { state } = start('slot-capacity');
    state.slots = 10;
    for (let index = 0; index < 4; index++) {
      state.items.push({
        instance: `i-slot-${index}`,
        id: 'piggy-bank',
        data: {},
        equipped: true,
      });
    }
    setAnswer(state, 'crane');
    state.round!.baseDamage = 3;
    state.round!.freeLeft = 0;
    state.armor = 0;
    state.maxArmor = 0;

    const guessed = act(state, { type: 'guess', word: 'slate' });
    expect(guessed.state.hp).toBe(12);
  });

});

describe('phoenix egg and random guesses', () => {
  it('Phoenix Egg revives at full HP and casts every spell', () => {
    const { state } = start('phoenix-revive');
    state.items.push({ instance: 'i-phoenix', id: 'phoenix-egg', data: {}, equipped: true });
    setAnswer(state, 'crane');
    state.round!.freeLeft = 0;
    state.maxHp = 15;
    state.hp = 1;
    state.armor = 0;
    state.maxArmor = 0;
    const died = act(state, { type: 'guess', word: 'slate' });
    expect(died.state.items.some((item) => item.id === 'phoenix-egg')).toBe(false);
    expect(died.state.hp).toBe(died.state.maxHp);
    expect(died.state.hp).toBeGreaterThan(1);
    expect(died.events.some((event) => event.type === 'revived')).toBe(true);
    const castIds = new Set(died.events.flatMap((event) => (
      event.type === 'spellCast' ? [event.spell.id] : []
    )));
    for (const spell of SPELLS) expect(castIds.has(spell.id)).toBe(true);
  });

  it('adds Gaunt and Wryly to the random guess pool', () => {
    expect(CONTENT.nonnative).toContain('gaunt');
    expect(CONTENT.nonnative).toContain('wryly');
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
