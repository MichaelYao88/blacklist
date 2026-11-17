import { describe, expect, it } from 'vitest';
import { CoreHost, MemoryStore, game } from '../src/game';
import type { Command, GameEvent, RoundState, RunState, ShopState, StepResult } from '../src/game';
import { FOOD_BY_ID, HAPPENING_BY_ID, ITEM_BY_ID, SPELL_BY_ID } from '../src/content';
import { FRIEND_PHRASES } from '../src/data/friends';
import { rngNext } from '../src/core/rng';

function start(seed = 'test-seed'): StepResult {
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

function eventTypes(events: GameEvent[]): string[] {
  return events.map((e) => e.type);
}

describe('new run', () => {
  it('starts a seeded five-act run with default stats', () => {
    const { state, events } = start();
    expect(state.phase).toBe('round');
    expect(state.hp).toBe(40);
    expect(state.maxHp).toBe(40);
    expect(state.armor).toBe(5);
    expect(state.maxArmor).toBe(5);
    expect(state.gold).toBe(10);
    expect(state.slots).toBe(5);
    expect(state.blacklist).toEqual([]);
    expect(state.pendingReveals).toEqual([]);
    expect(state.nodes).toHaveLength(30);
    expect(state.nodes.filter((n) => n.kind === 'boss')).toHaveLength(5);
    expect(state.nodes.filter((n) => n.kind === 'shop' || n.kind === 'happening')).toHaveLength(10);
    expect(state.round?.answer).toHaveLength(5);
    expect(eventTypes(events)).toContain('runStarted');
    expect(eventTypes(events)).toContain('nodeEntered');
    expect(eventTypes(events)).toContain('roundStarted');
  });

  it('is deterministic for a seed', () => {
    const a = start('same-seed');
    const b = start('same-seed');
    expect(game.serialize(a.state)).toBe(game.serialize(b.state));
  });
});

describe('ascension', () => {
  const runAt = (ascension: number) => game.newRun({ seed: `asc-${ascension}`, ascension });

  it('starts A1 with the wrong-guess damage ramp and no armor penalty', () => {
    const { state } = runAt(1);
    expect(state.ascension).toBe(1);
    expect(state.hp).toBe(40);
    expect(state.maxHp).toBe(40);
    expect(state.armor).toBe(5);
    expect(state.maxArmor).toBe(5);
    expect(state.gold).toBe(10);
    expect(state.slots).toBe(5);
  });

  it('spreads HP losses and shop/boss scaling through A3, A6 and A8', () => {
    expect(runAt(2).state.maxHp).toBe(40);
    expect(runAt(3).state.maxHp).toBe(30);
    expect(runAt(5).state.maxHp).toBe(30);
    expect(runAt(6).state.maxHp).toBe(20);
    expect(runAt(7).state.maxHp).toBe(20);
    expect(runAt(8).state.maxHp).toBe(10);
    expect(runAt(9).state.maxHp).toBe(10);
    for (const level of [2, 3, 4, 5, 6, 7, 8, 9]) {
      expect(runAt(level).state.armor).toBe(1);
    }
  });

  it('shortens the clock by 20s on each timer level', () => {
    const timerAt = (level: number) => runAt(level).state.round?.timerStartMs;
    expect(timerAt(1)).toBe(150_000);
    expect(timerAt(2)).toBe(130_000);
    expect(timerAt(4)).toBe(110_000);
    expect(timerAt(7)).toBe(90_000);
    expect(timerAt(9)).toBe(90_000);
  });

  it('raises shop prices and reroll costs', () => {
    const begun = runAt(3);
    const state = begun.state;
    state.nodeIndex = 0;
    state.nodes[1] = { kind: 'shop' };
    state.phase = 'shop';
    state.shop = shopState();

    const shop = act(state, { type: 'continue' });
    expect(shop.state.phase).toBe('shop');
    expect(shop.state.shop?.rerollCost).toBe(3);

    for (const offer of shop.state.shop?.offers ?? []) {
      let base = 0;
      if (offer.kind === 'item') base = ITEM_BY_ID.get(offer.def)?.price ?? 0;
      else if (offer.kind === 'spell') base = SPELL_BY_ID.get(offer.def)?.price ?? 0;
      else base = FOOD_BY_ID.get(offer.def)?.price ?? 0;
      if (offer.sale) base = Math.max(1, Math.floor(base / 2));
      expect(offer.price).toBe(Math.ceil(base * 1.1));
    }
  });

  it('raises boss damage by 10% per HP-scaling level', () => {
    const bossRound = (ascension: number) => {
      const { state } = runAt(ascension);
      state.nodeIndex = 4;
      state.nodes[5] = { kind: 'boss', boss: 'editor' };
      state.phase = 'shop';
      state.shop = shopState();
      const intro = act(state, { type: 'continue' });
      const started = act(intro.state, { type: 'continue' });
      return started.state.round?.baseDamage;
    };
    expect(bossRound(1)).toBe(5);
    expect(bossRound(3)).toBe(6);
    expect(bossRound(6)).toBe(6);
    expect(bossRound(8)).toBe(7);
    expect(bossRound(9)).toBe(7);
  });

  it('ramps damage only on wrong non-free guesses', () => {
    const { state } = runAt(1);
    setAnswer(state, 'crane');
    state.round!.baseDamage = 5;
    state.round!.freeLeft = 1;
    state.armor = 0;

    const free = act(state, { type: 'guess', word: 'slate' });
    expect(free.state.hp).toBe(40);
    expect(free.state.round?.damageRamp).toBe(0);

    free.state.round!.freeLeft = 0;
    const firstPaid = act(free.state, { type: 'guess', word: 'pious' });
    expect(firstPaid.state.hp).toBe(35);
    expect(firstPaid.state.round?.damageRamp).toBe(1);

    const secondPaid = act(firstPaid.state, { type: 'guess', word: 'tiger' });
    expect(secondPaid.state.hp).toBe(29);
    expect(secondPaid.state.round?.damageRamp).toBe(2);
  });

  it('stacks the ramp again at A5', () => {
    const { state } = runAt(5);
    setAnswer(state, 'crane');
    state.round!.baseDamage = 5;
    state.round!.freeLeft = 0;
    state.armor = 0;

    const first = act(state, { type: 'guess', word: 'slate' });
    expect(first.state.hp).toBe(25);
    expect(first.state.round?.damageRamp).toBe(2);

    const second = act(first.state, { type: 'guess', word: 'pious' });
    expect(second.state.hp).toBe(18);
    expect(second.state.round?.damageRamp).toBe(4);
  });
});

describe('guessing and the blacklist', () => {
  it('makes the first guess free and blacklists only the first word', () => {
    const { state } = start();
    setAnswer(state, 'crane');

    const first = act(state, { type: 'guess', word: 'slate' });
    expect(first.state.hp).toBe(40);
    expect(first.state.armor).toBe(5);
    expect(first.state.round?.freeLeft).toBe(0);
    expect(first.state.blacklist).toContain('slate');
    expect(eventTypes(first.events)).toContain('guessScored');

    const second = act(first.state, { type: 'guess', word: 'pious' });
    expect(second.state.round?.freeLeft).toBe(0);
    expect(second.state.armor).toBe(3);
    expect(second.state.blacklist).toEqual(['slate']);

    const rejected = act(second.state, { type: 'guess', word: 'slate' });
    expect(rejected.events).toContainEqual({
      type: 'guessRejected',
      word: 'slate',
      reason: 'blacklisted',
    });
  });

  it('soaks damage point for point without climbing per wrong guess', () => {
    const { state } = start();
    setAnswer(state, 'crane');
    state.round!.freeLeft = 0;
    state.armor = 5;
    state.round!.baseDamage = 4;

    const first = act(state, { type: 'guess', word: 'tiger' });
    expect(first.state.hp).toBe(40);
    expect(first.state.armor).toBe(1);

    const second = act(first.state, { type: 'guess', word: 'mango' });
    expect(second.state.hp).toBe(37);
    expect(second.state.armor).toBe(0);

    const third = act(second.state, { type: 'guess', word: 'bumpy' });
    expect(third.state.hp).toBe(33);
    expect(third.state.round?.paidGuesses).toBe(3);
  });

  it('never evicts entries: the blacklist has no upper limit', () => {
    const { state } = start();
    setAnswer(state, 'crane');
    state.blacklist = ['crane', 'pious'];
    state.round!.freeLeft = 20;

    const current = act(state, { type: 'guess', word: 'tiger' });

    expect(current.state.blacklist).toEqual(['crane', 'pious', 'tiger']);
    const changes = current.events.filter((e) => e.type === 'blacklistChanged');
    expect(changes.at(-1)).toMatchObject({ added: 'tiger' });
    expect(changes.at(-1)).not.toHaveProperty('evicted');
  });
});

describe('timer and damage', () => {
  it('times out for armor-bypassing damage and ends the round', () => {
    const { state } = start();
    setAnswer(state, 'crane');
    state.round!.remainingMs = 1_000;
    state.armor = 1;

    const result = act(state, { type: 'tick', dtMs: 1_000 });
    // Timeout = 2x the guess hit (base 2) + 30% of 40 max HP = 16, armor ignored.
    expect(result.state.hp).toBe(24);
    expect(result.state.armor).toBe(1);
    expect(result.state.phase).toBe('summary');
    expect(result.state.summary?.outcome).toBe('timeout');
    expect(result.state.summary?.rewardPending).toBe(false);
    expect(result.state.summary?.gold).toBe(1);
    expect(result.state.gold).toBe(11);
    expect(result.state.stats.timeouts).toBe(1);
    expect(eventTypes(result.events)).toContain('timeExpired');
    expect(eventTypes(result.events)).toContain('roundEnded');
  });

  it('freezes time until the next guess', () => {
    const { state } = start();
    state.round!.frozenUntilGuess = true;
    state.round!.remainingMs = 60_000;

    const frozen = act(state, { type: 'tick', dtMs: 2_000 });
    expect(frozen.state.round?.remainingMs).toBe(60_000);

    const current = act(frozen.state, { type: 'guess', word: 'slate' });
    expect(current.state.round?.frozenUntilGuess).toBe(false);
  });
});

describe('gauntlet', () => {
  it('advances across three puzzles on one timer', () => {
    const { state } = start();
    const round = state.round as RoundState;
    state.round = {
      ...round,
      boss: 'gauntlet',
      answer: 'crane',
      guesses: [],
      freeLeft: 2,
      paidGuesses: 0,
      gauntletIndex: 0,
      gauntletTotal: 3,
      gauntletAnswers: [],
      remainingMs: 150_000,
      timerStartMs: 150_000,
      elapsedMs: 0,
      bossState: {},
    };

    const one = act(state, { type: 'guess', word: 'crane' });
    expect(one.state.phase).toBe('round');
    expect(one.state.round?.gauntletIndex).toBe(1);
    expect(one.state.round?.gauntletAnswers).toEqual(['crane']);
    expect(one.state.hp).toBe(40);
    expect(eventTypes(one.events)).toContain('puzzleSolved');
    expect(eventTypes(one.events)).toContain('gauntletAdvanced');

    one.state.round!.answer = 'slate';
    const two = act(one.state, { type: 'guess', word: 'slate' });
    expect(two.state.round?.gauntletIndex).toBe(2);

    two.state.round!.answer = 'pious';
    const three = act(two.state, { type: 'guess', word: 'pious' });
    expect(three.state.phase).toBe('summary');
    expect(three.state.summary?.answers).toEqual(['crane', 'slate', 'pious']);
    expect(three.state.lastAnswer).toBe('pious');
    expect(three.state.hp).toBe(40);
    expect(three.state.stats.bosses).toBe(1);
  });
});

describe('the sleeper', () => {
  it('wakes after three cumulative hits and only then hits for 10', () => {
    const { state } = start();
    setAnswer(state, 'crane');
    const round = state.round as RoundState;
    state.round = {
      ...round,
      boss: 'sleeper',
      freeLeft: 0,
      paidGuesses: 0,
      bossState: { woke: 0, hits: 0, wokeGuess: 0 },
      baseDamage: 10,
      remainingMs: null,
      timerStartMs: null,
    };
    state.armor = 0;

    const boardOf = (s: RunState) => {
      const phase = game.view(s).phase;
      if (phase.kind !== 'round') throw new Error('not in a round');
      return phase.board;
    };

    // Two hits, but the Sleeper sleeps through them.
    const one = act(state, { type: 'guess', word: 'slate' });
    expect(one.state.hp).toBe(40);
    expect(one.state.round?.bossState.hits).toBe(2);
    expect(one.state.round?.bossState.woke).toBe(0);
    expect(boardOf(one.state).nextGuessDamage).toBe(0);

    // No new hits: still asleep and still harmless.
    const two = act(one.state, { type: 'guess', word: 'pious' });
    expect(two.state.hp).toBe(40);
    expect(two.state.round?.bossState.hits).toBe(2);
    expect(boardOf(two.state).nextGuessDamage).toBe(0);

    // Three more hits push it over the edge. The waking guess deals nothing.
    const three = act(two.state, { type: 'guess', word: 'arise' });
    expect(three.state.hp).toBe(40);
    expect(three.state.round?.bossState.woke).toBe(1);
    expect(three.state.round?.bossState.wokeGuess).toBe(3);
    expect(boardOf(three.state).nextGuessDamage).toBe(10);
    expect(eventTypes(three.events)).toContain('bossStateChanged');

    // Every wrong guess after waking deals 10 and keeps the hit tally.
    const four = act(three.state, { type: 'guess', word: 'bulky' });
    expect(four.state.hp).toBe(30);
    expect(four.state.round?.bossState.hits).toBe(5);

    const five = act(four.state, { type: 'guess', word: 'wharf' });
    expect(five.state.hp).toBe(20);
  });
});

describe('spells, items and death', () => {
  it('casts heal and removes the spell', () => {
    const { state } = start();
    state.hp = 20;
    state.spells.push({ instance: 's999', id: 'heal' });

    const result = act(state, { type: 'castSpell', instance: 's999' });
    expect(result.state.hp).toBe(30);
    expect(result.state.spells).toHaveLength(0);
    expect(eventTypes(result.events)).toContain('spellCast');
  });

  it('reveals at round start and turns five reveals into Omen', () => {
    const { state } = start();
    setAnswer(state, 'crane');
    state.nodes[1] = { kind: 'shop' };
    state.items.push({ instance: 'i-necro', id: 'necronomicon', data: { reveals: 0 }, equipped: true });
    state.items.push({ instance: 'i-kit', id: 'field-kit', data: {}, equipped: true });

    let result = act(state, { type: 'guess', word: 'crane' });
    result = act(result.state, { type: 'continue' });
    result = act(result.state, {
      type: 'chooseReward',
      optionId: result.state.reward?.options[0]?.id ?? 'gold',
    });
    result = act(result.state, { type: 'continue' });

    expect(result.state.phase).toBe('round');
    expect(result.state.round?.hints).toBeDefined();
    expect(Object.keys(result.state.round?.hints ?? {})).toHaveLength(7);
    expect(result.state.spells.filter((s) => s.id === 'omen')).toHaveLength(1);
    expect(eventTypes(result.events)).toContain('itemTriggered');
    expect(eventTypes(result.events)).toContain('spellGained');
  });

  it('keeps Omen reveals on the keyboard instead of only in the log', () => {
    const { state } = start();
    setAnswer(state, 'crane');
    state.spells.push({ instance: 's-omen', id: 'omen' });

    const cast = act(state, { type: 'castSpell', instance: 's-omen' });
    expect(cast.state.phase).toBe('round');
    const view = game.view(cast.state);
    expect(view.phase.kind).toBe('round');
    if (view.phase.kind !== 'round') return;
    const hinted = Object.entries(view.phase.board.hints);
    expect(hinted).toHaveLength(1);
    expect(hinted[0][1]).toBe('present');
    expect(view.phase.board.keyboard[hinted[0][0]]).toBe('present');
  });

  it('revives with Second Wind instead of ending the run', () => {
    const { state } = start();
    setAnswer(state, 'crane');
    state.hp = 1;
    state.armor = 0;
    state.round!.remainingMs = 1_000;
    state.items.push({ instance: 'i999', id: 'second-wind', data: {} });

    const result = act(state, { type: 'tick', dtMs: 1_000 });
    expect(result.state.hp).toBe(20);
    expect(result.state.phase).toBe('summary');
    expect(result.state.summary?.outcome).toBe('timeout');
    expect(result.state.items).toHaveLength(0);
    expect(eventTypes(result.events)).toContain('revived');
    expect(eventTypes(result.events)).not.toContain('runEnded');
  });

  it('purges a letter when nothing pending blocks it', () => {
    const { state } = start();
    setAnswer(state, 'crane');
    state.pendingPurge = 1;

    const result = act(state, { type: 'purgeLetter', letter: 'q' });
    expect(result.state.purged).toContain('q');
    expect(result.state.pendingPurge).toBe(0);
    expect(eventTypes(result.events)).toContain('letterPurged');
  });

  it('refuses to purge a letter in the live answer', () => {
    const { state } = start();
    setAnswer(state, 'crane');
    state.pendingPurge = 1;

    const result = act(state, { type: 'purgeLetter', letter: 'c' });
    expect(result.state.purged).not.toContain('c');
    expect(result.state.pendingPurge).toBe(1);
    expect(result.state.round?.answer).toBe('crane');
    expect(eventTypes(result.events)).toContain('message');
  });

  it('allows a purge between nodes and swaps a stale answer that contained it', () => {
    const { state } = start();
    setAnswer(state, 'crane');
    state.phase = 'shop';
    state.pendingPurge = 1;

    const result = act(state, { type: 'purgeLetter', letter: 'c' });
    expect(result.state.purged).toContain('c');
    expect(result.state.pendingPurge).toBe(0);
    expect(result.state.summary).toBeUndefined();
    expect(result.state.round?.answer).not.toContain('c');
    expect(result.state.round?.answer).toHaveLength(5);
    expect(eventTypes(result.events)).toContain('letterPurged');
  });
});

describe('round rewards', () => {
  it('moves from summary to reward to the next node', () => {
    const { state } = start();
    setAnswer(state, 'crane');

    const solved = act(state, { type: 'guess', word: 'crane' });
    expect(solved.state.phase).toBe('summary');
    expect(solved.state.summary?.rewardPending).toBe(true);
    expect(solved.state.summary?.gold).toBe(5);

    const reward = act(solved.state, { type: 'continue' });
    expect(reward.state.phase).toBe('reward');
    const options = reward.state.reward?.options ?? [];
    expect(options.filter((option) => option.kind === 'gold')).toHaveLength(1);
    expect(options.some((option) => option.kind === 'spell' || option.kind === 'eat')).toBe(true);

    const chosen = act(reward.state, { type: 'chooseReward', optionId: 'gold' });
    expect(chosen.state.nodeIndex).toBe(1);
    expect(chosen.state.gold).toBe(20);
    expect(eventTypes(chosen.events)).toContain('rewardChosen');
  });

  it('offers three rare relics after a boss and no ordinary reward', () => {
    const { state } = start();
    state.phase = 'summary';
    state.summary = {
      outcome: 'solved',
      answer: 'crane',
      guesses: 1,
      elapsedMs: 1_000,
      boss: 'editor',
      rewardPending: true,
      gold: 20,
    };

    const reward = act(state, { type: 'continue' });
    expect(reward.state.phase).toBe('reward');
    expect(reward.state.reward?.boss).toBe(true);
    const options = reward.state.reward?.options ?? [];
    expect(options).toHaveLength(3);
    for (const option of options) {
      expect(option.kind).toBe('item');
      expect(option.rarity).toBe('rare');
      expect(ITEM_BY_ID.get(option.def ?? '')?.rarity).toBe('rare');
    }
  });
});

describe('full run', () => {
  it('plays a perfect run through all five acts to victory', () => {
    let result = start('perfect-run');
    let steps = 0;

    while (result.state.phase !== 'over' && steps < 500) {
      steps++;
      const state = result.state;
      if (state.pendingPurge > 0) {
        const letter = 'abcdefghijklmnopqrstuvwxyz'
          .split('')
          .find((ch) => !state.purged.includes(ch)) ?? 'q';
        result = act(state, { type: 'purgeLetter', letter });
      } else if (state.phase === 'round' && state.round) {
        result = act(state, { type: 'guess', word: state.round.answer });
      } else if (state.phase === 'summary') {
        result = act(state, { type: 'continue' });
      } else if (state.phase === 'reward') {
        result = act(state, { type: 'chooseReward', optionId: state.reward?.options[0]?.id ?? 'gold' });
      } else if (state.phase === 'shop' || state.phase === 'bossIntro') {
        result = act(state, { type: 'continue' });
      } else if (state.phase === 'happening') {
        if (state.happening?.resolved) {
          result = act(state, { type: 'continue' });
        } else {
          const options = state.happening?.options ?? [];
          const affordable = options.find(
            (option) => !option.costGold || option.costGold <= state.gold,
          ) ?? options[options.length - 1];
          result = act(state, {
            type: 'choose',
            optionId: affordable?.id ?? '',
          });
        }
      } else {
        break;
      }
    }

    expect(steps).toBeLessThan(500);
    expect(result.state.phase).toBe('over');
    expect(result.state.over?.result).toBe('victory');
    expect(result.state.nodeIndex).toBe(30);
    expect(result.state.stats.bosses).toBe(5);
    expect(result.state.stats.rounds).toBe(20);
    expect(game.view(result.state).phase.kind).toBe('over');
    const finalView = game.view(result.state);
    if (finalView.phase.kind === 'over') {
      expect(finalView.phase.answer).toBeUndefined();
    }
  });
});

describe('shop', () => {
  function reachShop(): StepResult {
    for (let i = 0; i < 120; i++) {
      let result = start(`shop-seed-${i}`);
      if (result.state.nodes[1]?.kind !== 'shop') continue;
      let guard = 0;
      while (result.state.phase !== 'shop' && result.state.phase !== 'over' && guard < 40) {
        guard++;
        const state = result.state;
        if (state.phase === 'round' && state.round) {
          result = act(state, { type: 'guess', word: state.round.answer });
        } else if (state.phase === 'summary') {
          result = act(state, { type: 'continue' });
        } else if (state.phase === 'reward') {
          result = act(state, { type: 'chooseReward', optionId: 'gold' });
        } else {
          break;
        }
      }
      if (result.state.phase === 'shop') return result;
    }
    throw new Error('no shop seed found');
  }

  it('sells three items, two foods and one wildcard, with one item half off', () => {
    const result = reachShop();
    const offers = result.state.shop?.offers ?? [];
    expect(offers).toHaveLength(6);
    const items = offers.filter((offer) => offer.kind === 'item');
    const foods = offers.filter((offer) => offer.kind === 'eat');
    const spells = offers.filter((offer) => offer.kind === 'spell');
    expect(items.length).toBeGreaterThanOrEqual(3);
    expect(foods.length).toBeGreaterThanOrEqual(2);
    expect(spells.length).toBeLessThanOrEqual(1);
    expect(items.length + foods.length + spells.length).toBe(6);
    expect(new Set(offers.map((offer) => `${offer.kind}:${offer.def}`)).size).toBe(6);
    const sale = offers.filter((offer) => offer.sale);
    expect(sale).toHaveLength(1);
    expect(sale[0].originalPrice).toBeDefined();
    expect(sale[0].price).toBe(Math.max(1, Math.floor((sale[0].originalPrice ?? 0) / 2)));
  });

  it('buys, rerolls and leaves without breaking the node flow', () => {
    const result = reachShop();
    const shop = result.state.shop!;
    expect(shop.offers.length).toBe(6);

    const goldBefore = result.state.gold;
    const offer = shop.offers[0];
    const bought = act(result.state, { type: 'buy', offerId: offer.id });
    expect(bought.state.gold).toBeLessThan(goldBefore);
    expect(bought.state.shop?.offers.some((o) => o.id === offer.id)).toBe(false);

    const rerolled = act(bought.state, { type: 'reroll' });
    expect(rerolled.state.shop?.offers).toHaveLength(6);
    expect(rerolled.state.shop?.rerollCost).toBe(shop.rerollCost * 2);

    const nodeBefore = rerolled.state.nodeIndex;
    const left = act(rerolled.state, { type: 'continue' });
    expect(left.state.nodeIndex).toBe(nodeBefore + 1);
    expect(left.state.phase).toBe('round');
  });

  it('puts gear in the bag when slots are full and equips it on command', () => {
    const result = reachShop();
    result.state.gold = 100;
    result.state.slots = 0;
    const offer = result.state.shop!.offers.find((o) => o.kind === 'item');
    expect(offer).toBeTruthy();

    const bought = act(result.state, { type: 'buy', offerId: offer!.id });
    const item = bought.state.items.at(-1);
    expect(item?.equipped).toBe(false);
    expect(game.view(bought.state).slots.used).toBe(0);

    bought.state.slots = 1;
    const equipped = act(bought.state, { type: 'equipItem', instance: item!.instance });
    expect(equipped.state.items.at(-1)?.equipped).toBe(true);
    expect(game.view(equipped.state).slots.used).toBe(1);

    const unequipped = act(equipped.state, { type: 'unequipItem', instance: item!.instance });
    expect(unequipped.state.items.at(-1)?.equipped).toBe(false);
    expect(game.view(unequipped.state).slots.used).toBe(0);
  });

  it('assigns a fixed encounter hit instead of scaling by paid guesses', () => {
    const result = reachShop();
    const next = act(result.state, { type: 'continue' });
    expect(next.state.phase).toBe('round');
    expect(next.state.round?.baseDamage).toBe(3);
  });
});

describe('boss encounters', () => {
  it('shows a boss intro with rules before the fight starts', () => {
    const { state } = start();
    state.nodeIndex = 4;
    state.phase = 'shop';

    const intro = act(state, { type: 'continue' });
    expect(intro.state.phase).toBe('bossIntro');
    expect(intro.state.nodeIndex).toBe(5);
    expect(eventTypes(intro.events)).toContain('bossIntro');
    expect(intro.state.bossIntro?.boss).toBe(intro.state.nodes[5].boss);
    expect(intro.state.round).toBeUndefined();

    const view = game.view(intro.state);
    expect(view.phase.kind).toBe('bossIntro');

    const started = act(intro.state, { type: 'continue' });
    expect(started.state.phase).toBe('round');
    expect(started.state.round?.boss).toBe(intro.state.nodes[5].boss);
  });

  it('lets The Horde add a body and hide one more tile per wrong guess', () => {
    const { state } = start();
    setAnswer(state, 'crane');
    const round = state.round as RoundState;
    state.round = {
      ...round,
      boss: 'horde',
      freeLeft: 0,
      paidGuesses: 0,
      bossState: { swarm: 0 },
      baseDamage: 6,
      remainingMs: null,
      timerStartMs: null,
    };
    state.armor = 0;

    const boardOf = (s: RunState) => {
      const phase = game.view(s).phase;
      if (phase.kind !== 'round') throw new Error('not in a round');
      return phase.board;
    };

    const one = act(state, { type: 'guess', word: 'slate' });
    expect(one.state.hp).toBe(34);
    expect(one.state.round?.bossState.swarm).toBe(1);
    expect(boardOf(one.state).guesses[0].tiles.slice(-1)).toEqual(['hidden']);
    expect(boardOf(one.state).nextGuessDamage).toBe(6);

    const two = act(one.state, { type: 'guess', word: 'pious' });
    expect(two.state.hp).toBe(28);
    expect(two.state.round?.bossState.swarm).toBe(2);
    expect(boardOf(two.state).guesses[0].tiles.slice(-2)).toEqual(['hidden', 'hidden']);
    expect(boardOf(two.state).guesses[1].tiles.slice(-1)).toEqual(['hidden']);
  });
});

describe('nonsense guesses', () => {
  it('only lets Loose Tongue work while it is equipped in a slot', () => {
    const { state } = start();
    setAnswer(state, 'crane');

    const rejected = act(state, { type: 'guess', word: 'aeiou' });
    expect(rejected.events).toContainEqual({
      type: 'guessRejected',
      word: 'aeiou',
      reason: 'notAWord',
    });
    expect(rejected.state.round?.guesses).toHaveLength(0);

    // Relics consume a slot now, so a relic left in the bag stays switched off.
    state.items.push({ instance: 'i-loose', id: 'loose-tongue', data: {}, equipped: false });
    const bagged = act(state, { type: 'guess', word: 'aeiou' });
    expect(eventTypes(bagged.events)).toContain('guessRejected');

    state.items[0].equipped = true;
    expect(game.view(state).slots.used).toBe(1);
    const accepted = act(state, { type: 'guess', word: 'aeiou' });
    expect(eventTypes(accepted.events)).toContain('guessScored');
    expect(accepted.state.round?.guesses).toHaveLength(1);
    expect(accepted.state.blacklist).toEqual(['aeiou']);
  });
});

describe('solving and dying', () => {
  it('never damages the player on a correct guess', () => {
    const { state } = start();
    setAnswer(state, 'crane');
    state.round!.freeLeft = 0;
    state.armor = 0;

    const solved = act(state, { type: 'guess', word: 'crane' });
    expect(solved.state.phase).toBe('summary');
    expect(solved.state.hp).toBe(40);
    expect(eventTypes(solved.events)).not.toContain('damageTaken');
  });

  it('reveals the missed answer when the run ends in defeat', () => {
    const { state } = start();
    setAnswer(state, 'crane');
    state.hp = 1;
    state.armor = 0;
    state.round!.freeLeft = 0;

    const dead = act(state, { type: 'guess', word: 'pious' });
    expect(dead.state.phase).toBe('over');
    expect(dead.state.over).toMatchObject({ result: 'defeat', answer: 'crane' });

    const view = game.view(dead.state);
    expect(view.phase).toMatchObject({ kind: 'over', result: 'defeat', answer: 'crane' });
  });

  it('reveals every gauntlet puzzle on death', () => {
    const { state } = start();
    setAnswer(state, 'crane');
    state.hp = 1;
    state.armor = 0;
    state.round!.freeLeft = 0;
    state.round!.gauntletTotal = 3;
    state.round!.gauntletIndex = 2;
    state.round!.gauntletAnswers = ['apple', 'beard'];

    const dead = act(state, { type: 'guess', word: 'pious' });
    expect(dead.state.over?.answer).toBe('crane');
    expect(dead.state.over?.answers).toEqual(['apple', 'beard', 'crane']);
  });
});

describe('rare relics and spell engines', () => {
  it('gives Echo Chamber a single payout on the first all-absent guess', () => {
    const { state } = start();
    setAnswer(state, 'crane');
    state.items.push({ instance: 'i-echo', id: 'echo-chamber', data: { used: 0 }, equipped: true });

    const first = act(state, { type: 'guess', word: 'pious' });
    expect(first.state.spells).toHaveLength(1);
    expect(eventTypes(first.events)).toContain('spellGained');

    const second = act(first.state, { type: 'guess', word: 'bumpy' });
    expect(second.state.spells).toHaveLength(1);
  });

  it('gives Oracle Skull Omen on the first heal of each round only', () => {
    const { state } = start();
    setAnswer(state, 'crane');
    state.hp = 20;
    state.items.push({ instance: 'i-skull', id: 'oracle-skull', data: { used: 0 }, equipped: true });
    state.spells.push({ instance: 's-heal-a', id: 'heal' });
    state.spells.push({ instance: 's-heal-b', id: 'heal' });

    const first = act(state, { type: 'castSpell', instance: 's-heal-a' });
    expect(first.state.spells.filter((spell) => spell.id === 'omen')).toHaveLength(1);

    const second = act(first.state, { type: 'castSpell', instance: 's-heal-b' });
    expect(second.state.spells.filter((spell) => spell.id === 'omen')).toHaveLength(1);
  });

  it('grants Heal when Time Freeze is cast with Second Hand', () => {
    const { state } = start();
    setAnswer(state, 'crane');
    state.items.push({ instance: 'i-hand', id: 'second-hand', data: {}, equipped: true });
    state.spells.push({ instance: 's-freeze', id: 'time-freeze' });

    const cast = act(state, { type: 'castSpell', instance: 's-freeze' });
    expect(cast.state.spells.some((spell) => spell.id === 'heal')).toBe(true);
  });

  it('pays Metronome gold with five seconds left', () => {
    const { state } = start();
    setAnswer(state, 'crane');
    state.items.push({ instance: 'i-metro', id: 'metronome', data: {}, equipped: true });
    state.round!.remainingMs = 4_000;
    const goldBefore = state.gold;

    const guess = act(state, { type: 'guess', word: 'pious' });
    expect(guess.state.gold).toBe(goldBefore + 6);
  });
});

describe('event-driven engines', () => {
  it('pays Bulwark for every 5 damage blocked', () => {
    const { state } = start();
    setAnswer(state, 'crane');
    state.round!.freeLeft = 0;
    state.armor = 5;
    state.round!.baseDamage = 6;
    state.items.push({ instance: 'i-bulwark', id: 'bulwark', data: { blocked: 0 }, equipped: true });

    const guess = act(state, { type: 'guess', word: 'tiger' });
    expect(guess.state.spells).toHaveLength(1);
    expect(guess.state.items.find((item) => item.instance === 'i-bulwark')?.data.blocked).toBe(0);
  });

  it('pays Scrap Collector for every 5 armor lost', () => {
    const { state } = start();
    setAnswer(state, 'crane');
    state.round!.freeLeft = 0;
    state.armor = 5;
    state.round!.baseDamage = 6;
    state.items.push({ instance: 'i-scrap', id: 'scrap-collector', data: { lost: 0 }, equipped: true });
    const goldBefore = state.gold;

    const guess = act(state, { type: 'guess', word: 'tiger' });
    expect(guess.state.gold).toBe(goldBefore + 1);
  });

  it('pays Tithe Box after 10 gold spent', () => {
    const { state } = start();
    state.phase = 'shop';
    state.shop = shopState();
    state.gold = 20;
    state.items.push({ instance: 'i-tithe', id: 'tithe-box', data: { spent: 8 }, equipped: true });

    const rerolled = act(state, { type: 'reroll' });
    expect(rerolled.state.spells.filter((spell) => spell.id === 'heal')).toHaveLength(1);
  });

  it('lets Field Dressing heal from Field Kit reveals', () => {
    const { state } = start();
    setAnswer(state, 'crane');
    state.nodes[1] = { kind: 'shop' };
    state.hp = 20;
    state.items.push({ instance: 'i-kit', id: 'field-kit', data: {}, equipped: true });
    state.items.push({ instance: 'i-dress', id: 'field-dressing', data: {}, equipped: true });

    let result = act(state, { type: 'guess', word: 'crane' });
    result = act(result.state, { type: 'continue' });
    result = act(result.state, {
      type: 'chooseReward',
      optionId: result.state.reward?.options[0]?.id ?? 'gold',
    });
    result = act(result.state, { type: 'continue' });

    expect(result.state.phase).toBe('round');
    expect(result.state.hp).toBe(25);
  });
});

describe('opening and guess engines', () => {
  it('blocks damage in the opening seconds with Head Start', () => {
    const { state } = start();
    setAnswer(state, 'crane');
    state.nodeIndex = 1;
    state.nodes[2] = { kind: 'round' };
    state.phase = 'shop';
    state.items.push({ instance: 'i-head', id: 'head-start', data: {}, equipped: true });

    const next = act(state, { type: 'continue' });
    expect(next.state.phase).toBe('round');
    expect(next.state.round?.immuneUntilMs).toBe(12_000);

    next.state.round!.freeLeft = 0;
    next.state.round!.baseDamage = 9;
    const hpBefore = next.state.hp;
    const guess = act(next.state, { type: 'guess', word: 'tiger' });
    expect(guess.state.hp).toBe(hpBefore);
    expect(guess.state.round?.immuneUntilMs).toBe(12_000);
  });

  it('counts Head Start guesses as free and keeps the Ascension ramp at zero', () => {
    const { state } = game.newRun({ seed: 'ramp-immunity', ascension: 1 });
    setAnswer(state, 'crane');
    state.nodeIndex = 0;
    state.nodes[1] = { kind: 'round' };
    state.phase = 'shop';
    state.items.push({ instance: 'i-head', id: 'head-start', data: {}, equipped: true });

    const next = act(state, { type: 'continue' });
    expect(next.state.round?.immuneUntilMs).toBe(12_000);
    setAnswer(next.state, 'crane');
    next.state.round!.freeLeft = 0;
    next.state.round!.baseDamage = 5;
    next.state.round!.elapsedMs = 0;
    next.state.armor = 0;

    const first = act(next.state, { type: 'guess', word: 'slate' });
    expect(first.state.hp).toBe(40);
    expect(first.state.round?.guesses.at(-1)?.free).toBe(true);
    expect(first.state.round?.damageRamp).toBe(0);

    const second = act(first.state, { type: 'guess', word: 'pious' });
    expect(second.state.hp).toBe(40);
    expect(second.state.round?.guesses.at(-1)?.free).toBe(true);
    expect(second.state.round?.damageRamp).toBe(0);

    second.state.round!.elapsedMs = 20_000;
    const third = act(second.state, { type: 'guess', word: 'tiger' });
    expect(third.state.hp).toBe(35);
    expect(third.state.round?.guesses.at(-1)?.free).toBe(false);
    expect(third.state.round?.damageRamp).toBe(1);
  });

  it('pays Quickdraw for a guess in the opening window', () => {
    const { state } = start();
    setAnswer(state, 'crane');
    state.nodeIndex = 1;
    state.nodes[2] = { kind: 'round' };
    state.phase = 'shop';
    state.items.push({ instance: 'i-quick', id: 'quickdraw', data: {}, equipped: true });

    const next = act(state, { type: 'continue' });
    next.state.round!.freeLeft = 0;
    next.state.round!.elapsedMs = 5_000;
    const goldBefore = next.state.gold;
    const hpBefore = next.state.hp;

    const guess = act(next.state, { type: 'guess', word: 'tiger' });
    expect(guess.state.gold).toBe(goldBefore + 1);
    expect(guess.state.hp).toBe(hpBefore);
    expect(guess.state.round?.guesses.at(-1)?.free).toBe(true);
  });

  it('lets Encore make the last solved answer free', () => {
    const { state } = start();
    setAnswer(state, 'blimp');
    state.lastAnswer = 'crane';
    state.round!.freeLeft = 0;
    state.armor = 0;
    state.items.push({ instance: 'i-encore', id: 'encore', data: {}, equipped: true });

    const guess = act(state, { type: 'guess', word: 'crane' });
    expect(guess.state.hp).toBe(40);
    expect(guess.state.round?.guesses.at(-1)?.free).toBe(true);
  });

  it('pays Tally every fourth guess', () => {
    const { state } = start();
    setAnswer(state, 'crane');
    state.items.push({ instance: 'i-tally', id: 'tally', data: { guesses: 3 }, equipped: true });
    state.round!.freeLeft = 2;
    const goldBefore = state.gold;

    const guess = act(state, { type: 'guess', word: 'tiger' });
    expect(guess.state.gold).toBe(goldBefore + 1);
    expect(guess.state.items.find((item) => item.instance === 'i-tally')?.data.guesses).toBe(4);
  });
});

describe('déjà vu', () => {
  it('auto-guesses last round’s answer for free at the next round start', () => {
    const { state } = start();
    setAnswer(state, 'blimp');
    state.lastAnswer = 'crane';
    state.usedAnswers = ['crane'];
    state.blacklist = [];
    state.nodeIndex = 0;
    state.nodes[1] = { kind: 'round' };
    state.phase = 'shop';
    state.shop = shopState();
    state.items.push({ instance: 'i-deja', id: 'deja-vu', data: {}, equipped: true });

    const next = act(state, { type: 'continue' });
    expect(next.state.phase).toBe('round');
    expect(next.state.round?.guesses).toHaveLength(1);
    expect(next.state.round?.guesses[0].word).toBe('crane');
    expect(next.state.round?.guesses[0].free).toBe(true);
    expect(next.state.round?.guesses[0].by).toBe('friend');
    expect(next.state.round?.freeLeft).toBe(1);
    expect(next.state.round?.answer).not.toBe('crane');
    expect(next.state.hp).toBe(40);
  });
});

describe('rebalanced relics', () => {
  it('pays Pen Club for a guess that starts with PEN', () => {
    const { state } = start();
    setAnswer(state, 'crane');
    state.items.push({ instance: 'i-pen', id: 'pen-club', data: {}, equipped: true });
    const goldBefore = state.gold;

    const guess = act(state, { type: 'guess', word: 'penny' });
    expect(guess.state.gold).toBe(goldBefore + 4);
  });

  it('pays Warding Idol for every 10 armor spent', () => {
    const { state } = start();
    setAnswer(state, 'crane');
    state.round!.freeLeft = 0;
    state.armor = 10;
    state.maxArmor = 20;
    state.round!.baseDamage = 10;
    state.items.push({ instance: 'i-idol', id: 'warding-idol', data: { blocked: 0 }, equipped: true });

    const guess = act(state, { type: 'guess', word: 'tiger' });
    expect(guess.state.hp).toBe(40);
    expect(guess.state.armor).toBe(0);
    expect(guess.state.spells).toHaveLength(1);
    expect(guess.state.items.find((item) => item.instance === 'i-idol')?.data.blocked).toBe(0);
  });

  it('gives Harvest Charm exactly one of its three round-start boons', () => {
    const { state } = start();
    setAnswer(state, 'crane');
    state.nodes[1] = { kind: 'round' };
    state.hp = 20;
    state.items.push({ instance: 'i-harvest', id: 'harvest-charm', data: {}, equipped: true });

    let result = act(state, { type: 'guess', word: 'crane' });
    result = act(result.state, { type: 'continue' });
    result = act(result.state, { type: 'chooseReward', optionId: 'gold' });

    expect(result.state.phase).toBe('round');
    const boons = [
      result.state.maxHp === 45,
      result.state.hp === 22,
      result.state.spells.some((spell) => spell.id === 'restore'),
    ];
    expect(boons.filter(Boolean)).toHaveLength(1);
  });

  it('only lets Phone a Friend use curated two-word phrases', () => {
    const { state } = start();
    setAnswer(state, 'crane');
    state.spells.push({ instance: 's-phone', id: 'phone-friend' });

    const cast = act(state, { type: 'castSpell', instance: 's-phone' });
    const words = cast.state.round?.guesses.map((guess) => guess.word) ?? [];
    expect(words).toHaveLength(2);
    const matched = FRIEND_PHRASES.some(
      ([first, second]) => words[0] === first && words[1] === second,
    );
    expect(matched).toBe(true);
  });
});

describe('gold engines and relic slots', () => {
  it('turns every rare relic into a one-slot item', () => {
    const rares = [...ITEM_BY_ID.values()].filter((item) => item.rarity === 'rare');
    expect(rares.length).toBe(18);
    for (const item of rares) {
      expect(item.slots ?? 1).toBe(1);
    }
    expect(ITEM_BY_ID.get('mending-plate')?.rarity).toBe('rare');
    expect(ITEM_BY_ID.get('speed-dial')?.rarity).toBe('rare');
    expect(ITEM_BY_ID.get('midas-touch')?.goldDoubleChance).toBe(20);
  });

  it('pays Compound Interest as 10% of current gold, capped at 10', () => {
    const { state } = start();
    setAnswer(state, 'crane');
    state.gold = 100;
    state.items.push({ instance: 'i-compound', id: 'compound-interest', data: {}, equipped: true });

    const solved = act(state, { type: 'guess', word: 'crane' });
    // Solve pays 5 first, taking gold to 105, then Compound Interest adds 10.
    expect(solved.state.gold).toBe(115);
  });

  it('doubles a gold gain when the Midas Touch roll succeeds', () => {
    const { state } = start();
    setAnswer(state, 'crane');
    state.blacklist = ['slate'];
    state.gold = 10;
    state.items.push({ instance: 'i-midas', id: 'midas-touch', data: {}, equipped: true });

    // Move the seeded RNG to a point where the next roll is below 20%.
    for (let i = 0; i < 10_000; i++) {
      const probe = { rng: state.rng };
      if (rngNext(probe) * 100 < 20) break;
      state.rng = probe.rng;
    }

    const solved = act(state, { type: 'guess', word: 'crane' });
    expect(solved.state.gold).toBe(20);
    expect(eventTypes(solved.events)).toContain('message');
    expect(solved.state.stats.goldEarned).toBe(10);
  });
});

describe('new item batch', () => {
  it('spells out how much Piggy Bank grows each round held', () => {
    const def = ITEM_BY_ID.get('piggy-bank');
    expect(def?.description).toContain('+3 more gold per round');
    const { state } = start();
    const item = { instance: 'i-pig', id: 'piggy-bank', data: { held: 3 }, equipped: true };
    expect(def?.sellValue?.({ state, self: item })).toBe(14);
  });

  it('gives Daredevil a shorter clock and gold for every guess', () => {
    const nextRound = (withItem: boolean) => {
      const begun = start('daredevil-seed');
      if (withItem) {
        begun.state.items.push({
          instance: 'i-devil',
          id: 'daredevil',
          data: {},
          equipped: true,
        });
      }
      begun.state.nodeIndex = 0;
      begun.state.nodes[1] = { kind: 'round' };
      begun.state.phase = 'shop';
      return act(begun.state, { type: 'continue' }).state;
    };

    const control = nextRound(false);
    const daredevil = nextRound(true);
    expect((control.round?.remainingMs ?? 0) - (daredevil.round?.remainingMs ?? 0)).toBe(20_000);

    setAnswer(daredevil, 'crane');
    daredevil.round!.freeLeft = 0;
    daredevil.round!.baseDamage = 0;
    daredevil.armor = 0;
    const goldBefore = daredevil.gold;
    const guess = act(daredevil, { type: 'guess', word: 'slate' });
    expect(guess.state.gold).toBe(goldBefore + 1);
  });

  it('turns every 6 gold spent into +1 max HP', () => {
    const { state } = start();
    state.gold = 20;
    state.items.push({
      instance: 'i-savings',
      id: 'life-savings',
      data: { spent: 0 },
      equipped: true,
    });
    state.phase = 'shop';
    state.shop = shopState([{ id: 'o0', kind: 'eat', def: 'snack', price: 6 }]);

    const bought = act(state, { type: 'buy', offerId: 'o0' });
    expect(bought.state.maxHp).toBe(41);
    expect(bought.state.items[0].data.spent).toBe(0);
  });

  it('heals 1 HP for every guess the player makes', () => {
    const { state } = start();
    setAnswer(state, 'crane');
    state.hp = 30;
    state.round!.freeLeft = 1;
    state.round!.baseDamage = 0;
    state.armor = 0;
    state.items.push({ instance: 'i-placebo', id: 'placebo', data: {}, equipped: true });

    const first = act(state, { type: 'guess', word: 'slate' });
    expect(first.state.hp).toBe(31);

    first.state.round!.freeLeft = 0;
    const second = act(first.state, { type: 'guess', word: 'pious' });
    expect(second.state.hp).toBe(32);
  });

  it('gives Mending Plate +1 armor now, then +1 max armor per 4 HP healed', () => {
    const { state } = start();
    state.gold = 20;
    state.phase = 'shop';
    state.shop = shopState([{ id: 'o0', kind: 'item', def: 'mending-plate', price: 20 }]);

    const bought = act(state, { type: 'buy', offerId: 'o0' });
    expect(bought.state.maxArmor).toBe(6);
    expect(bought.state.armor).toBe(6);

    bought.state.hp = 32;
    bought.state.spells.push({ instance: 's-heal', id: 'heal' });
    const healed = act(bought.state, { type: 'castSpell', instance: 's-heal' });
    expect(healed.state.maxArmor).toBe(7);
    expect(healed.state.armor).toBe(7);
  });

  it('casts Phone a Friend at the start of each round with Speed Dial', () => {
    const { state } = start('speed-dial-seed');
    state.nodeIndex = 0;
    state.nodes[1] = { kind: 'round' };
    state.phase = 'shop';
    state.items.push({
      instance: 'i-dial',
      id: 'speed-dial',
      data: {},
      equipped: true,
    });

    const next = act(state, { type: 'continue' });
    expect(next.events.some(
      (event) => event.type === 'spellCast' && event.spell.id === 'phone-friend',
    )).toBe(true);
    expect(next.state.round?.frozenMs).toBe(20_000);
    expect(next.state.round?.guesses.length ?? 0).toBeGreaterThanOrEqual(1);
  });

  it('keeps letter-reveal foods permanent for every later round', () => {
    const { state } = start('reveal-food');
    expect(FOOD_BY_ID.get('b-file')?.description).toContain('Every round');
    state.gold = 20;
    state.phase = 'shop';
    state.shop = shopState([{ id: 'o0', kind: 'eat', def: 'b-file', price: 10 }]);

    const bought = act(state, { type: 'buy', offerId: 'o0' });
    expect(bought.state.permanentReveals).toContain('b');

    bought.state.nodeIndex = 0;
    bought.state.nodes[1] = { kind: 'round' };
    const first = act(bought.state, { type: 'continue' });
    expect(first.state.round?.hints.b).toBe(
      first.state.round?.answer.includes('b') ? 'present' : 'absent',
    );

    first.state.phase = 'shop';
    first.state.shop = shopState();
    first.state.nodeIndex = 1;
    first.state.nodes[2] = { kind: 'round' };
    const second = act(first.state, { type: 'continue' });
    expect(second.state.round?.hints.b).toBe(
      second.state.round?.answer.includes('b') ? 'present' : 'absent',
    );
  });
});

describe('timer, shop and engine batch', () => {
  it('Restore clears the blacklist and refills armor', () => {
    const { state } = start();
    state.blacklist = ['slate'];
    state.armor = 1;
    state.spells.push({ instance: 's-restore', id: 'restore' });

    const cast = act(state, { type: 'castSpell', instance: 's-restore' });
    expect(cast.state.blacklist).toHaveLength(0);
    expect(cast.state.armor).toBe(cast.state.maxArmor);
  });

  it('makes a late Deadline guess free', () => {
    const { state } = start();
    setAnswer(state, 'crane');
    state.round!.freeLeft = 0;
    state.round!.remainingMs = 30_000;
    state.armor = 0;
    state.items.push({ instance: 'i-deadline', id: 'deadline', data: { used: 0 }, equipped: true });
    const hp = state.hp;

    const guess = act(state, { type: 'guess', word: 'tiger' });
    expect(guess.state.round?.guesses[0].free).toBe(true);
    expect(guess.state.hp).toBe(hp);
  });

  it('pays Ticking Fee every 20 seconds', () => {
    const { state } = start();
    state.items.push({ instance: 'i-fee', id: 'ticking-fee', data: { ms: 19_000 }, equipped: true });
    const goldBefore = state.gold;

    const tick = act(state, { type: 'tick', dtMs: 1_000 });
    expect(tick.state.gold).toBe(goldBefore + 1);
    expect(tick.state.items[0].data.ms).toBe(0);
  });

  it('Solo Note grants Restore for exactly one yellow and no green', () => {
    const { state } = start();
    setAnswer(state, 'crane');
    state.items.push({ instance: 'i-solo', id: 'solo-note', data: { used: 0 }, equipped: true });

    const guess = act(state, { type: 'guess', word: 'waltz' });
    expect(guess.state.spells.filter((spell) => spell.id === 'restore')).toHaveLength(1);
    expect(guess.state.items[0].data.used).toBe(1);
  });

  it('Double Blind makes the same one-yellow guess free', () => {
    const { state } = start();
    setAnswer(state, 'crane');
    state.round!.freeLeft = 0;
    state.armor = 0;
    state.items.push({ instance: 'i-blind', id: 'double-blind', data: { used: 0 }, equipped: true });
    const hp = state.hp;

    const guess = act(state, { type: 'guess', word: 'waltz' });
    expect(guess.state.round?.guesses[0].free).toBe(true);
    expect(guess.state.hp).toBe(hp);
  });

  it('Coupon Book discounts the first shop purchase', () => {
    const { state } = start();
    state.gold = 20;
    state.phase = 'shop';
    state.shop = shopState([{ id: 'o0', kind: 'item', def: 'hourglass', price: 6 }]);
    state.items.push({ instance: 'i-coupon', id: 'coupon-book', data: {}, equipped: true });

    const bought = act(state, { type: 'buy', offerId: 'o0' });
    expect(bought.state.gold).toBe(16);
    expect(bought.state.shop?.purchases).toBe(1);
  });

  it('Bulk Order pays after every food in a shop is bought', () => {
    const { state } = start();
    state.gold = 20;
    state.phase = 'shop';
    state.shop = shopState([
      { id: 'o0', kind: 'eat', def: 'snack', price: 3 },
      { id: 'o1', kind: 'eat', def: 'coffee', price: 3 },
    ]);
    state.items.push({ instance: 'i-bulk', id: 'bulk-order', data: { _visit: -1 }, equipped: true });
    const maxHpBefore = state.maxHp;

    const first = act(state, { type: 'buy', offerId: 'o0' });
    expect(first.state.maxHp).toBe(maxHpBefore);
    const second = act(first.state, { type: 'buy', offerId: 'o1' });
    expect(second.state.maxHp).toBe(maxHpBefore + 2);
    expect(second.state.armor).toBe(second.state.maxArmor);
  });

  it('Contrapuntal turns into a relic after all seven spell types', () => {
    const { state } = start();
    state.items.push({ instance: 'i-counter', id: 'contrapuntal', data: { _mask: 0, types: 0 }, equipped: true });
    state.spells = [
      { instance: 's1', id: 'time-freeze' },
      { instance: 's2', id: 'omen' },
      { instance: 's3', id: 'heal' },
      { instance: 's4', id: 'restore' },
      { instance: 's5', id: 'immunity' },
      { instance: 's6', id: 'time-warp' },
      { instance: 's7', id: 'phone-friend' },
    ];

    let result = state;
    for (const spell of state.spells.slice()) {
      result = act(result, { type: 'castSpell', instance: spell.instance }).state;
    }
    expect(result.items.some((item) => item.id === 'contrapuntal')).toBe(false);
    expect(result.items.some((item) => ITEM_BY_ID.get(item.id)?.rarity === 'rare')).toBe(true);
  });

  it('Last Cast refills an empty hand once per round', () => {
    const { state } = start();
    state.spells.push({ instance: 's-last', id: 'time-warp' });
    state.items.push({ instance: 'i-last', id: 'last-cast', data: { used: 0 }, equipped: true });

    const cast = act(state, { type: 'castSpell', instance: 's-last' });
    expect(cast.state.spells).toHaveLength(1);
    expect(cast.state.items[0].data.used).toBe(1);
  });

  it('Empty Hand starts a spellless round with a spell', () => {
    const { state } = start();
    state.items.push({ instance: 'i-empty', id: 'empty-hand', data: {}, equipped: true });
    state.spells = [];
    state.nodeIndex = 0;
    state.nodes[1] = { kind: 'round' };
    state.phase = 'shop';
    state.shop = shopState();

    const next = act(state, { type: 'continue' });
    expect(next.state.spells).toHaveLength(1);
  });

  it('Potluck doubles food effects without duplicating on-eat triggers', () => {
    const { state } = start();
    state.gold = 20;
    state.phase = 'shop';
    state.shop = shopState([{ id: 'o0', kind: 'eat', def: 'vitality', price: 6 }]);
    state.items.push({ instance: 'i-pot', id: 'potluck', data: {}, equipped: true });
    const maxHpBefore = state.maxHp;

    const bought = act(state, { type: 'buy', offerId: 'o0' });
    expect(bought.state.maxHp).toBe(maxHpBefore + 16);
  });

  it('Counterweight pays for the first fully blocked hit', () => {
    const { state } = start();
    setAnswer(state, 'crane');
    state.round!.freeLeft = 0;
    state.round!.baseDamage = 2;
    state.items.push({ instance: 'i-weight', id: 'counterweight', data: { used: 0 }, equipped: true });
    const goldBefore = state.gold;

    const guess = act(state, { type: 'guess', word: 'tiger' });
    expect(guess.state.gold).toBe(goldBefore + 2);
    expect(guess.state.items[0].data.used).toBe(1);
  });

  it('Pawn Ticket pays on every third sale', () => {
    const { state } = start();
    state.phase = 'shop';
    state.shop = shopState();
    state.items.push({ instance: 'i-pawn', id: 'pawn-ticket', data: { sold: 2 }, equipped: true });
    state.items.push({ instance: 'i-spare', id: 'hourglass', data: {}, equipped: true });

    const sold = act(state, { type: 'sell', instance: 'i-spare' });
    expect(sold.state.spells).toHaveLength(1);
  });

  it('Loyalty Card grants a slot on the fifth purchase', () => {
    const { state } = start();
    state.gold = 20;
    state.phase = 'shop';
    state.shop = shopState([{ id: 'o0', kind: 'eat', def: 'snack', price: 3 }]);
    state.items.push({ instance: 'i-loyal', id: 'loyalty-card', data: { buys: 4 }, equipped: true });
    const slotsBefore = state.slots;

    const bought = act(state, { type: 'buy', offerId: 'o0' });
    expect(bought.state.slots).toBe(slotsBefore + 1);
  });

  it('Bookend pays for a guess with matching first and last letters', () => {
    const { state } = start();
    setAnswer(state, 'crane');
    state.round!.freeLeft = 2;
    state.items.push({ instance: 'i-book', id: 'bookend', data: {}, equipped: true });
    const goldBefore = state.gold;

    const guess = act(state, { type: 'guess', word: 'level' });
    expect(guess.state.gold).toBe(goldBefore + 3);
  });

  it('Trophy Room grants a slot for beating a boss', () => {
    const { state } = start();
    state.nodeIndex = 4;
    state.phase = 'shop';
    state.shop = shopState();
    state.items.push({ instance: 'i-trophy', id: 'trophy-room', data: {}, equipped: true });

    const intro = act(state, { type: 'continue' });
    const begun = act(intro.state, { type: 'continue' });
    const answer = begun.state.round!.answer;
    const slotsBefore = begun.state.slots;
    const solved = act(begun.state, { type: 'guess', word: answer });
    expect(solved.state.slots).toBe(slotsBefore + 1);
  });
});

describe('clean-guess batch', () => {
  it('Off-Road grants Restore for a non-overlapping guess once per round', () => {
    const { state } = start();
    setAnswer(state, 'crane');
    state.items.push({ instance: 'i-offroad', id: 'off-road', data: { used: 0 }, equipped: true });

    const first = act(state, { type: 'guess', word: 'tiger' });
    expect(first.state.spells).toHaveLength(0);

    const second = act(first.state, { type: 'guess', word: 'bland' });
    expect(second.state.spells.filter((spell) => spell.id === 'restore')).toHaveLength(1);
    expect(second.state.items[0].data.used).toBe(1);

    const third = act(second.state, { type: 'guess', word: 'pious' });
    expect(third.state.spells.filter((spell) => spell.id === 'restore')).toHaveLength(1);
  });

  it('Clean Slate grants max armor for a non-overlapping guess', () => {
    const { state } = start();
    setAnswer(state, 'crane');
    state.items.push({ instance: 'i-clean', id: 'clean-slate', data: {}, equipped: true });
    const armorBefore = state.maxArmor;

    const first = act(state, { type: 'guess', word: 'tiger' });
    expect(first.state.maxArmor).toBe(armorBefore);

    const second = act(first.state, { type: 'guess', word: 'bland' });
    expect(second.state.maxArmor).toBe(armorBefore + 1);
  });

  it('Shortcut grants a slot for solving within four guesses', () => {
    const { state } = start();
    setAnswer(state, 'crane');
    state.items.push({ instance: 'i-short', id: 'shortcut', data: {}, equipped: true });
    const slotsBefore = state.slots;

    const solved = act(state, { type: 'guess', word: 'crane' });
    expect(solved.state.slots).toBe(slotsBefore + 1);
  });

  it('Growth Spurt grants 10 max HP for solving within four guesses', () => {
    const { state } = start();
    setAnswer(state, 'crane');
    state.items.push({ instance: 'i-growth', id: 'growth-spurt', data: {}, equipped: true });
    const maxHpBefore = state.maxHp;

    const solved = act(state, { type: 'guess', word: 'crane' });
    expect(solved.state.maxHp).toBe(maxHpBefore + 10);
  });
});

describe('content rules', () => {
  it('offers permanent HP boosts as food, not upgrades', () => {
    expect(FOOD_BY_ID.get('vitality')).toBeDefined();
    expect(FOOD_BY_ID.get('vitality')?.price).toBeLessThan(8);
    expect(FOOD_BY_ID.get('plating')).toBeDefined();
  });

  it('offers some food that grants random spells', () => {
    expect(FOOD_BY_ID.get('mystery-stew')).toBeDefined();
    expect(FOOD_BY_ID.get('candy')).toBeDefined();
  });

  it('keeps purge as an event, not a spell', () => {
    expect(SPELL_BY_ID.get('purge')).toBeUndefined();
    const redaction = HAPPENING_BY_ID.get('redaction');
    expect(redaction).toBeDefined();
    expect(
      redaction!.options.some((option) =>
        option.outcomes.some((outcome) =>
          outcome.effects.some((effect) => effect.type === 'pendingPurge'),
        ),
      ),
    ).toBe(true);
  });
});

describe('core purity', () => {
  it('never touches browser globals or ambient randomness', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const dir = path.resolve(process.cwd(), 'src/core');
    const files = (await fs.readdir(dir)).filter((file) => file.endsWith('.ts'));
    const forbidden = [
      /Math\.random/,
      /Date\.now/,
      /structuredClone/,
      /\bwindow\b/,
      /\bdocument\b/,
      /\blocalStorage\b/,
      /\bsessionStorage\b/,
      /\bnavigator\b/,
      /\bperformance\.now\b/,
      /\bfetch\b/,
    ];

    const offenders: string[] = [];
    for (const file of files) {
      const source = await fs.readFile(path.join(dir, file), 'utf8');
      const code = source
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      for (const pattern of forbidden) {
        if (pattern.test(code)) offenders.push(`${file}: ${pattern}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('save host', () => {
  it('saves after every step and resumes the same run', () => {
    const store = new MemoryStore();
    const host = new CoreHost({ core: game, store });
    host.start('host-seed');
    expect(store.load()).toBeTruthy();

    host.dispatch({ type: 'guess', word: 'slate' });
    const snapshot = game.serialize(host.current as RunState);

    const restored = new CoreHost({ core: game, store });
    expect(restored.resume()).toEqual([]);
    expect(game.serialize(restored.current as RunState)).toBe(snapshot);
    expect(restored.view()).toEqual(host.view());
  });

  it('wipes the active save when the run ends', () => {
    const store = new MemoryStore();
    const host = new CoreHost({ core: game, store });
    host.start('defeat-seed');
    const state = host.current as RunState;
    state.hp = 1;
    state.armor = 0;
    state.maxArmor = 0;
    state.round!.remainingMs = 1;

    const events = host.dispatch({ type: 'tick', dtMs: 2_000 });
    expect(events.some((event) => event.type === 'runEnded')).toBe(true);
    expect(host.current?.over?.result).toBe('defeat');
    expect(store.load()).toBeNull();
  });
});

describe('serialization', () => {
  it('round-trips state and remains deterministic', () => {
    const { state } = start('serialize-seed');
    const json = game.serialize(state);
    const restored = game.deserialize(json);
    expect(restored).not.toBeNull();
    expect(game.serialize(restored as RunState)).toBe(json);

    const command: Command = { type: 'guess', word: 'slate' };
    const a = act(state, command);
    const b = act(restored as RunState, command);
    expect(game.serialize(a.state)).toBe(game.serialize(b.state));
  });

  it('rejects malformed saves', () => {
    expect(game.deserialize('not json')).toBeNull();
    expect(game.deserialize(JSON.stringify({ version: 99 }))).toBeNull();
  });

  it('migrates retired item ids and drops unknown ones', () => {
    const { state } = start();
    state.items.push({ instance: 'i-lens', id: 'null-lens', data: {}, equipped: true });
    state.items.push({ instance: 'i-midas', id: 'midas-relic', data: {}, equipped: true });
    state.items.push({ instance: 'i-gone', id: 'removed-thing', data: {}, equipped: true });

    const restored = game.deserialize(game.serialize(state));
    expect(restored).not.toBeNull();
    const ids = restored!.items.map((item) => item.id);
    expect(ids).toContain('pen-club');
    expect(ids).toContain('gilded-fork');
    expect(ids).not.toContain('null-lens');
    expect(ids).not.toContain('midas-relic');
    expect(ids).not.toContain('removed-thing');
  });

  it('adds the new slot and trims overflow when loading a version 4 save', () => {
    const { state } = start();
    state.slots = 4;
    state.items = ['hourglass', 'early-bird', 'head-start', 'quickdraw', 'tally', 'hard-hat']
      .map((id, index) => ({
        instance: `i-migrate-${index}`,
        id,
        data: {},
        equipped: true,
      }));

    const raw = JSON.parse(game.serialize(state)) as RunState;
    raw.version = 4;
    raw.slots = 4;

    const restored = game.deserialize(JSON.stringify(raw));
    expect(restored).not.toBeNull();
    expect(restored!.version).toBe(5);
    expect(restored!.slots).toBe(5);
    expect(restored!.items.filter((item) => item.equipped)).toHaveLength(5);
    expect(restored!.items.filter((item) => !item.equipped)).toHaveLength(1);
  });
});
