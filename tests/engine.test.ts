import { describe, expect, it } from 'vitest';
import { CoreHost, MemoryStore, game } from '../src/game';
import type { Command, GameEvent, RoundState, RunState, StepResult } from '../src/game';

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

function eventTypes(events: GameEvent[]): string[] {
  return events.map((e) => e.type);
}

describe('new run', () => {
  it('starts a seeded three-act run with default stats', () => {
    const { state, events } = start();
    expect(state.phase).toBe('round');
    expect(state.hp).toBe(40);
    expect(state.maxHp).toBe(40);
    expect(state.armor).toBe(1);
    expect(state.maxArmor).toBe(1);
    expect(state.gold).toBe(10);
    expect(state.slots).toBe(4);
    expect(state.blacklistCapacity).toBe(16);
    expect(state.nodes).toHaveLength(15);
    expect(state.nodes.filter((n) => n.kind === 'boss')).toHaveLength(3);
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

describe('guessing and the blacklist', () => {
  it('makes the first two guesses free and blacklists each word', () => {
    const { state } = start();
    setAnswer(state, 'crane');

    const first = act(state, { type: 'guess', word: 'slate' });
    expect(first.state.hp).toBe(40);
    expect(first.state.round?.freeLeft).toBe(1);
    expect(first.state.blacklist).toContain('slate');
    expect(eventTypes(first.events)).toContain('guessScored');

    const second = act(first.state, { type: 'guess', word: 'pious' });
    expect(second.state.hp).toBe(40);
    expect(second.state.round?.freeLeft).toBe(0);
    expect(second.state.blacklist).toEqual(['slate', 'pious']);

    const rejected = act(second.state, { type: 'guess', word: 'slate' });
    expect(rejected.events).toContainEqual({
      type: 'guessRejected',
      word: 'slate',
      reason: 'blacklisted',
    });
  });

  it('lets armor eat the first real hit, then scales paid-guess damage', () => {
    const { state } = start();
    setAnswer(state, 'crane');
    state.round!.freeLeft = 0;
    state.armor = 1;

    const third = act(state, { type: 'guess', word: 'tiger' });
    expect(third.state.hp).toBe(40);
    expect(third.state.armor).toBe(0);

    const fourth = act(third.state, { type: 'guess', word: 'mango' });
    expect(fourth.state.hp).toBe(38);
    expect(fourth.state.round?.paidGuesses).toBe(2);
  });

  it('evicts the oldest blacklist entry when full', () => {
    const { state } = start();
    setAnswer(state, 'crane');
    state.blacklistCapacity = 2;
    state.round!.freeLeft = 20;

    let current = act(state, { type: 'guess', word: 'slate' });
    current = act(current.state, { type: 'guess', word: 'pious' });
    current = act(current.state, { type: 'guess', word: 'tiger' });

    expect(current.state.blacklist).toEqual(['pious', 'tiger']);
    const changes = current.events.filter((e) => e.type === 'blacklistChanged');
    expect(changes.at(-1)).toMatchObject({ added: 'tiger', evicted: ['slate'] });
  });
});

describe('timer and damage', () => {
  it('times out for armor-bypassing damage and ends the round', () => {
    const { state } = start();
    setAnswer(state, 'crane');
    state.round!.remainingMs = 1_000;
    state.armor = 1;

    const result = act(state, { type: 'tick', dtMs: 1_000 });
    expect(result.state.hp).toBe(21);
    expect(result.state.armor).toBe(1);
    expect(result.state.phase).toBe('summary');
    expect(result.state.summary?.outcome).toBe('timeout');
    expect(result.state.summary?.rewardPending).toBe(false);
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

  it('grants a spell from an item on solve', () => {
    const { state } = start();
    setAnswer(state, 'crane');
    state.items.push({ instance: 'i999', id: 'necronomicon', data: {} });

    const result = act(state, { type: 'guess', word: 'crane' });
    expect(result.state.phase).toBe('summary');
    expect(result.state.spells.some((s) => s.id === 'omen')).toBe(true);
    expect(eventTypes(result.events)).toContain('itemTriggered');
    expect(eventTypes(result.events)).toContain('spellGained');
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
});

describe('round rewards', () => {
  it('moves from summary to reward to the next node', () => {
    const { state } = start();
    setAnswer(state, 'crane');

    const solved = act(state, { type: 'guess', word: 'crane' });
    expect(solved.state.phase).toBe('summary');
    expect(solved.state.summary?.rewardPending).toBe(true);

    const reward = act(solved.state, { type: 'continue' });
    expect(reward.state.phase).toBe('reward');
    expect(reward.state.reward?.options).toHaveLength(3);

    const chosen = act(reward.state, { type: 'chooseReward', optionId: 'gold' });
    expect(chosen.state.phase).toBe('round');
    expect(chosen.state.nodeIndex).toBe(1);
    expect(chosen.state.gold).toBe(24);
    expect(eventTypes(chosen.events)).toContain('rewardChosen');
  });
});

describe('full run', () => {
  it('plays a perfect run through all three acts to victory', () => {
    let result = start('perfect-run');
    let steps = 0;

    while (result.state.phase !== 'over' && steps < 400) {
      steps++;
      const state = result.state;
      if (state.phase === 'round' && state.round) {
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
          result = act(state, {
            type: 'choose',
            optionId: state.happening?.options[0]?.id ?? '',
          });
        }
      } else {
        break;
      }
    }

    expect(steps).toBeLessThan(400);
    expect(result.state.phase).toBe('over');
    expect(result.state.over?.result).toBe('victory');
    expect(result.state.nodeIndex).toBe(15);
    expect(result.state.stats.bosses).toBe(3);
    expect(result.state.stats.rounds).toBe(12);
    expect(game.view(result.state).phase.kind).toBe('over');
  });
});

describe('shop', () => {
  it('buys, rerolls and leaves without breaking the node flow', () => {
    let result = start('shop-seed-0');
    for (let i = 0; i < 80; i++) {
      const candidate = start(`shop-seed-${i}`);
      if (candidate.state.nodes[2]?.kind === 'shop') {
        result = candidate;
        break;
      }
    }
    expect(result.state.nodes[2]?.kind).toBe('shop');
    let guard = 0;
    while (result.state.phase !== 'shop' && result.state.phase !== 'over' && guard < 80) {
      guard++;
      const state = result.state;
      if (state.phase === 'round' && state.round) {
        result = act(state, { type: 'guess', word: state.round.answer });
      } else if (state.phase === 'summary') {
        result = act(state, { type: 'continue' });
      } else if (state.phase === 'reward') {
        result = act(state, { type: 'chooseReward', optionId: 'gold' });
      } else if (state.phase === 'happening') {
        result = state.happening?.resolved
          ? act(state, { type: 'continue' })
          : act(state, { type: 'choose', optionId: state.happening?.options[0]?.id ?? '' });
      } else {
        break;
      }
    }

    expect(result.state.phase).toBe('shop');
    const shop = result.state.shop!;
    expect(shop.offers.length).toBe(4);

    const goldBefore = result.state.gold;
    const offer = shop.offers[0];
    const bought = act(result.state, { type: 'buy', offerId: offer.id });
    expect(bought.state.gold).toBeLessThan(goldBefore);
    expect(bought.state.shop?.offers.some((o) => o.id === offer.id)).toBe(false);

    const rerolled = act(bought.state, { type: 'reroll' });
    expect(rerolled.state.shop?.offers).toHaveLength(4);
    expect(rerolled.state.shop?.rerollCost).toBe(shop.rerollCost + 1);

    const nodeBefore = rerolled.state.nodeIndex;
    const left = act(rerolled.state, { type: 'continue' });
    expect(left.state.nodeIndex).toBe(nodeBefore + 1);
    expect(left.state.phase).toBe('round');
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
});
