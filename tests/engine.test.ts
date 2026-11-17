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
import { CURSE_BY_ID, FOOD_BY_ID, ITEM_BY_ID, SPELL_BY_ID, SPELLS } from '../src/content';

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

describe('cursed run setup', () => {
  it('starts at level 1 with no clock, blacklist or curses', () => {
    const { state, events } = start();
    expect(state.phase).toBe('round');
    expect(state.level).toBe(1);
    expect(state.hp).toBe(40);
    expect(state.maxHp).toBe(40);
    expect(state.armor).toBe(5);
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

  it('blacklists one guess per stack', () => {
    const { state } = start();
    setAnswer(state, 'crane');
    state.curses.push({ id: 'the-list', stacks: 2 });
    const first = act(state, { type: 'guess', word: 'slate' });
    const second = act(first.state, { type: 'guess', word: 'pious' });
    expect(second.state.blacklist).toEqual(['slate', 'pious']);
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

describe('spells and foods', () => {
  it('has six spells and no Time Warp', () => {
    expect(SPELLS).toHaveLength(6);
    expect(SPELL_BY_ID.get('time-warp')).toBeUndefined();
  });

  it('has rare purge foods', () => {
    expect(FOOD_BY_ID.get('inkcap')).toBeDefined();
    expect(FOOD_BY_ID.get('purge-the-d')).toBeDefined();
    expect(FOOD_BY_ID.get('purge-the-d')?.rarity).toBe('rare');
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
