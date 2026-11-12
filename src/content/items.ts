import { defineItem, type ItemDef } from '../core/types';
import { isAllAbsent, sharedLetters } from '../core/score';

export const ITEMS: ItemDef[] = [
  defineItem({
    id: 'hourglass',
    name: 'Hourglass',
    description: '+15 seconds at the start of every round.',
    price: 6,
    kind: 'gear',
    on: { onRoundStart: () => [{ type: 'addTime', ms: 15_000 }] },
  }),
  defineItem({
    id: 'early-bird',
    name: 'Early Bird',
    description: 'Solve in under 30s for 2 gold. Grows by 1 each time it pays.',
    price: 6,
    kind: 'gear',
    initial: { gold: 2 },
    on: {
      onSolve: (ctx, p) =>
        p.elapsedMs < 30_000
          ? [
              { type: 'gold', amount: ctx.self.data.gold },
              { type: 'grow', stat: 'gold', by: 1 },
            ]
          : [],
    },
  }),
  defineItem({
    id: 'hard-hat',
    name: 'Hard Hat',
    description: 'Damage from a single hit is capped at 3.',
    price: 8,
    kind: 'gear',
    modifyDamage: (_ctx, amount) => Math.min(amount, 3),
  }),
  defineItem({
    id: 'iron-hide',
    name: 'Iron Hide',
    description: 'Reduce every damage instance by 1.',
    price: 8,
    kind: 'gear',
    modifyDamage: (_ctx, amount) => Math.max(0, amount - 1),
  }),
  defineItem({
    id: 'rabbit-foot',
    name: "Rabbit's Foot",
    description: '+1 free guess every round.',
    price: 7,
    kind: 'gear',
    on: { onRoundStart: () => [{ type: 'freeGuesses', count: 1 }] },
  }),
  defineItem({
    id: 'scattershot',
    name: 'Scattershot',
    description: 'Once per round, a guess sharing no letters with the previous guess is free.',
    price: 8,
    kind: 'gear',
    initial: { used: 0 },
    on: {
      onRoundStart: () => [{ type: 'setItemData', stat: 'used', value: 0 }],
      onGuessScored: (ctx, p) => {
        if (ctx.self.data.used || !p.previous) return [];
        if (sharedLetters(p.guess.word, p.previous.word) > 0) return [];
        return [
          { type: 'makeGuessFree' },
          { type: 'setItemData', stat: 'used', value: 1 },
        ];
      },
    },
  }),
  defineItem({
    id: 'grey-matter',
    name: 'Grey Matter',
    description: 'Once per round, a guess with no coloured tiles is free.',
    price: 8,
    kind: 'gear',
    initial: { used: 0 },
    on: {
      onRoundStart: () => [{ type: 'setItemData', stat: 'used', value: 0 }],
      onGuessScored: (ctx, p) => {
        if (ctx.self.data.used || !isAllAbsent(p.guess.truth)) return [];
        return [
          { type: 'makeGuessFree' },
          { type: 'setItemData', stat: 'used', value: 1 },
        ];
      },
    },
  }),
  defineItem({
    id: 'deja-vu',
    name: 'Déjà Vu',
    description: 'Once per round, typing the previous round’s answer is free.',
    price: 9,
    kind: 'gear',
    initial: { used: 0 },
    on: {
      onRoundStart: () => [{ type: 'setItemData', stat: 'used', value: 0 }],
      onGuessScored: (ctx, p) => {
        if (ctx.self.data.used || !ctx.state.lastAnswer) return [];
        if (p.guess.word !== ctx.state.lastAnswer) return [];
        return [
          { type: 'makeGuessFree' },
          { type: 'setItemData', stat: 'used', value: 1 },
        ];
      },
    },
  }),
  defineItem({
    id: 'b-file',
    name: 'B-File',
    description: 'At round start, learn whether the answer contains B.',
    price: 7,
    kind: 'gear',
    on: { onRoundStart: () => [{ type: 'revealLetter', letter: 'b' }] },
  }),
  defineItem({
    id: 'x-ray',
    name: 'X-Ray',
    description: 'At round start, learn whether the answer contains X.',
    price: 7,
    kind: 'gear',
    on: { onRoundStart: () => [{ type: 'revealLetter', letter: 'x' }] },
  }),
  defineItem({
    id: 'q-tip',
    name: 'Q-Tip',
    description: 'At round start, learn whether the answer contains Q.',
    price: 7,
    kind: 'gear',
    on: { onRoundStart: () => [{ type: 'revealLetter', letter: 'q' }] },
  }),
  defineItem({
    id: 'compound-interest',
    name: 'Compound Interest',
    description: 'On solve, gain 10% of your current gold (max 10).',
    price: 10,
    kind: 'gear',
    on: {
      onSolve: (ctx) => [
        { type: 'gold', amount: Math.min(10, Math.ceil(ctx.state.gold * 0.1)) },
      ],
    },
  }),
  defineItem({
    id: 'photosynthesis',
    name: 'Photosynthesis',
    description: 'On solve, heal 10% of max HP.',
    price: 8,
    kind: 'gear',
    on: {
      onSolve: (ctx) => [{ type: 'heal', amount: Math.ceil(ctx.state.maxHp * 0.1) }],
    },
  }),
  defineItem({
    id: 'vampire-teeth',
    name: 'Vampire Teeth',
    description: 'Heal 2 HP at the end of every round.',
    price: 7,
    kind: 'gear',
    on: { onRoundEnd: () => [{ type: 'heal', amount: 2 }] },
  }),
  defineItem({
    id: 'siphon',
    name: 'Siphon',
    description: 'Heal 1 HP whenever you cast a spell.',
    price: 8,
    kind: 'gear',
    on: { onSpellCast: () => [{ type: 'heal', amount: 1 }] },
  }),
  defineItem({
    id: 'gourmand',
    name: 'Gourmand',
    description: 'Gain +1 max HP whenever you eat.',
    price: 8,
    kind: 'gear',
    on: { onEat: () => [{ type: 'maxHp', delta: 1 }] },
  }),
  defineItem({
    id: 'spellbook',
    name: 'Spellbook',
    description: 'Gain 1 gold per spell cast. Grows by 1 each time.',
    price: 8,
    kind: 'gear',
    initial: { gold: 1 },
    on: {
      onSpellCast: (ctx) => [
        { type: 'gold', amount: ctx.self.data.gold },
        { type: 'grow', stat: 'gold', by: 1 },
      ],
    },
  }),
  defineItem({
    id: 'trophy-hunter',
    name: 'Trophy Hunter',
    description: 'Gain +1 max armor whenever you defeat a boss.',
    price: 9,
    kind: 'gear',
    on: {
      onRoundEnd: (_ctx, p) =>
        p.boss && p.outcome === 'solved' ? [{ type: 'maxArmor', delta: 1 }] : [],
    },
  }),
  defineItem({
    id: 'lucky-charm',
    name: 'Lucky Charm',
    description: '25% chance to gain a random spell on solve.',
    price: 8,
    kind: 'gear',
    on: { onSolve: () => [{ type: 'giveSpell', spell: 'random', chancePct: 25 }] },
  }),
  defineItem({
    id: 'necronomicon',
    name: 'Necronomicon',
    description: 'Gain Omen on every solve.',
    price: 10,
    kind: 'gear',
    on: { onSolve: () => [{ type: 'giveSpell', spell: 'omen' }] },
  }),
  defineItem({
    id: 'piggy-bank',
    name: 'Piggy Bank',
    description: 'Sells for more the longer you hold it.',
    price: 7,
    kind: 'gear',
    initial: { held: 0 },
    on: { onRoundEnd: () => [{ type: 'grow', stat: 'held', by: 1 }] },
    sellValue: (ctx) => 5 + ctx.self.data.held * 3,
  }),
  defineItem({
    id: 'metronome',
    name: 'Metronome',
    description: 'Gain 6 gold when you guess with under 25% of the timer left.',
    price: 8,
    kind: 'gear',
    on: {
      onGuessScored: (ctx, p) => {
        const round = ctx.state.round;
        if (!round || p.remainingMs == null || !round.timerStartMs) return [];
        if (p.remainingMs >= round.timerStartMs * 0.25) return [];
        return [{ type: 'gold', amount: 6 }];
      },
    },
  }),
  defineItem({
    id: 'overachiever',
    name: 'Overachiever',
    description: 'On solve, gain 1 gold per guess you made this round.',
    price: 7,
    kind: 'gear',
    on: { onSolve: (_ctx, p) => [{ type: 'gold', amount: p.guesses }] },
  }),
  defineItem({
    id: 'time-dilation',
    name: 'Time Dilation',
    description: 'No damage in the first 10s. Every round starts 5s shorter.',
    price: 8,
    kind: 'gear',
    on: {
      onRoundStart: () => [{ type: 'addTime', ms: -5_000 }],
      onGuessScored: (_ctx, p) =>
        p.elapsedMs < 10_000 ? [{ type: 'makeGuessFree' }] : [],
    },
  }),
  defineItem({
    id: 'second-wind',
    name: 'Second Wind',
    description: 'The first time you die, revive at 50% HP. Consumed.',
    price: 12,
    kind: 'gear',
    on: {
      onDeath: (ctx) => [
        { type: 'revive', hp: Math.ceil(ctx.state.maxHp * 0.5) },
        { type: 'consumeSelf' },
      ],
    },
  }),
  defineItem({
    id: 'black-market-ledger',
    name: 'Black Market Ledger',
    description: '+4 blacklist slots when acquired.',
    price: 7,
    kind: 'gear',
    onAcquire: () => [{ type: 'blacklistCapacity', delta: 4 }],
  }),
  defineItem({
    id: 'purge-token',
    name: 'Purge Token',
    description: 'Consumable. Choose a letter to remove from all future puzzles.',
    price: 8,
    kind: 'consumable',
    slots: 0,
    onUse: () => [{ type: 'pendingPurge', count: 1 }],
  }),
  defineItem({
    id: 'boss-trophy',
    name: 'Boss Trophy',
    description: 'Gain a random spell whenever you defeat a boss.',
    price: 10,
    kind: 'gear',
    on: {
      onRoundEnd: (_ctx, p) =>
        p.boss && p.outcome === 'solved' ? [{ type: 'giveSpell', spell: 'random' }] : [],
    },
  }),
  defineItem({
    id: 'fast-learner',
    name: 'Fast Learner',
    description: 'Solve in under 30s to gain Time Warp.',
    price: 8,
    kind: 'gear',
    on: {
      onSolve: (_ctx, p) =>
        p.elapsedMs < 30_000 ? [{ type: 'giveSpell', spell: 'time-warp' }] : [],
    },
  }),
  defineItem({
    id: 'untouchable',
    name: 'Untouchable',
    description: 'Solve a round without taking damage to gain Restore.',
    price: 9,
    kind: 'gear',
    on: {
      onSolve: (_ctx, p) =>
        p.damageTaken === 0 ? [{ type: 'giveSpell', spell: 'restore' }] : [],
    },
  }),
  defineItem({
    id: 'feast-of-ideas',
    name: 'Feast of Ideas',
    description: 'Gain a random spell whenever you eat.',
    price: 8,
    kind: 'gear',
    on: { onEat: () => [{ type: 'giveSpell', spell: 'random' }] },
  }),
  defineItem({
    id: 'spellhoarder',
    name: 'Spellhoarder',
    description: 'Every 3rd spell cast, gain a random spell.',
    price: 9,
    kind: 'gear',
    initial: { casts: 0 },
    on: {
      onSpellCast: (ctx) => {
        const next = ctx.self.data.casts + 1;
        return [
          { type: 'grow', stat: 'casts', by: 1 },
          ...(next % 3 === 0 ? [{ type: 'giveSpell' as const, spell: 'random' as const }] : []),
        ];
      },
    },
  }),
  defineItem({
    id: 'blacklist-scholar',
    name: 'Blacklist Scholar',
    description: 'When the blacklist fills up, gain Omen. Once per round.',
    price: 8,
    kind: 'gear',
    initial: { used: 0 },
    on: {
      onRoundStart: () => [{ type: 'setItemData', stat: 'used', value: 0 }],
      onBlacklistChanged: (ctx, p) => {
        if (ctx.self.data.used || p.list.length < p.capacity) return [];
        return [
          { type: 'giveSpell', spell: 'omen' },
          { type: 'setItemData', stat: 'used', value: 1 },
        ];
      },
    },
  }),
  defineItem({
    id: 'ouroboros',
    name: 'Ouroboros',
    description: 'Gain 2 gold whenever a word is evicted from the blacklist.',
    price: 8,
    kind: 'gear',
    on: {
      onBlacklistChanged: (_ctx, p) =>
        p.evicted.length > 0 ? [{ type: 'gold', amount: p.evicted.length * 2 }] : [],
    },
  }),
  defineItem({
    id: 'sundial',
    name: 'Sundial',
    description: '+30s per round, but −1 free guess every round.',
    price: 8,
    kind: 'gear',
    on: {
      onRoundStart: () => [
        { type: 'addTime', ms: 30_000 },
        { type: 'freeGuesses', count: -1 },
      ],
    },
  }),
  defineItem({
    id: 'glass-cannon',
    name: 'Glass Cannon',
    description: '+1 free guess every round, but −10 max HP when acquired.',
    price: 9,
    kind: 'gear',
    onAcquire: () => [{ type: 'maxHp', delta: -10 }],
    on: { onRoundStart: () => [{ type: 'freeGuesses', count: 1 }] },
  }),

  // ── boss relics ─────────────────────────────────────────────────────────
  // Rare passives. They take no slots, never appear in shops, and are only
  // offered as boss prizes. Several of them feed the spell engine.

  defineItem({
    id: 'oracle-skull',
    name: 'Oracle Skull',
    description: 'At the start of every round, gain Omen.',
    price: 20,
    kind: 'gear',
    rarity: 'rare',
    slots: 0,
    on: { onRoundStart: () => [{ type: 'giveSpell', spell: 'omen' }] },
  }),
  defineItem({
    id: 'thorn-crown',
    name: 'Thorn Crown',
    description: 'When a hit gets through, 40% chance to gain a random spell.',
    price: 20,
    kind: 'gear',
    rarity: 'rare',
    slots: 0,
    on: {
      onDamageTaken: (_ctx, p) =>
        p.dealt > 0 ? [{ type: 'giveSpell', spell: 'random', chancePct: 40 }] : [],
    },
  }),
  defineItem({
    id: 'echo-chamber',
    name: 'Echo Chamber',
    description: 'Every second guess in a round, gain a random spell.',
    price: 20,
    kind: 'gear',
    rarity: 'rare',
    slots: 0,
    initial: { guesses: 0 },
    on: {
      onRoundStart: () => [{ type: 'setItemData', stat: 'guesses', value: 0 }],
      onGuessScored: (ctx) => {
        const next = ctx.self.data.guesses + 1;
        return [
          { type: 'grow', stat: 'guesses', by: 1 },
          ...(next % 2 === 0 ? [{ type: 'giveSpell' as const, spell: 'random' as const }] : []),
        ];
      },
    },
  }),
  defineItem({
    id: 'phoenix-egg',
    name: 'Phoenix Egg',
    description: 'The first time you die, revive at 50% HP and gain Restore. Consumed.',
    price: 24,
    kind: 'gear',
    rarity: 'rare',
    slots: 0,
    on: {
      onDeath: (ctx) => [
        { type: 'revive', hp: Math.ceil(ctx.state.maxHp * 0.5) },
        { type: 'giveSpell', spell: 'restore' },
        { type: 'consumeSelf' },
      ],
    },
  }),
  defineItem({
    id: 'chrono-anchor',
    name: 'Chrono Anchor',
    description: 'Every round starts with +20 seconds. Gain Time Warp on solve.',
    price: 22,
    kind: 'gear',
    rarity: 'rare',
    slots: 0,
    on: {
      onRoundStart: () => [{ type: 'addTime', ms: 20_000 }],
      onSolve: () => [{ type: 'giveSpell', spell: 'time-warp' }],
    },
  }),
  defineItem({
    id: 'midas-relic',
    name: 'Midas Relic',
    description: 'Gain 6 gold on solve. Gain a random spell whenever you eat.',
    price: 20,
    kind: 'gear',
    rarity: 'rare',
    slots: 0,
    on: {
      onSolve: () => [{ type: 'gold', amount: 6 }],
      onEat: () => [{ type: 'giveSpell', spell: 'random' }],
    },
  }),
  defineItem({
    id: 'vowel-sigil',
    name: 'Vowel Sigil',
    description: 'Solve a round in under 60 seconds to gain Omen.',
    price: 18,
    kind: 'gear',
    rarity: 'rare',
    slots: 0,
    on: {
      onSolve: (_ctx, p) =>
        p.elapsedMs < 60_000 ? [{ type: 'giveSpell', spell: 'omen' }] : [],
    },
  }),
  defineItem({
    id: 'blacklist-idol',
    name: 'Blacklist Idol',
    description: 'When the blacklist fills, gain a random spell. Once per round.',
    price: 20,
    kind: 'gear',
    rarity: 'rare',
    slots: 0,
    initial: { used: 0 },
    on: {
      onRoundStart: () => [{ type: 'setItemData', stat: 'used', value: 0 }],
      onBlacklistChanged: (ctx, p) => {
        if (ctx.self.data.used || p.list.length < p.capacity) return [];
        return [
          { type: 'giveSpell', spell: 'random' },
          { type: 'setItemData', stat: 'used', value: 1 },
        ];
      },
    },
  }),
  defineItem({
    id: 'loaded-dice',
    name: 'Loaded Dice',
    description: 'The first paid guess of every round is free.',
    price: 20,
    kind: 'gear',
    rarity: 'rare',
    slots: 0,
    initial: { used: 0 },
    on: {
      onRoundStart: () => [{ type: 'setItemData', stat: 'used', value: 0 }],
      onGuessScored: (ctx, p) => {
        if (ctx.self.data.used || p.guess.free || p.paidIndex > 0) return [];
        return [
          { type: 'makeGuessFree' },
          { type: 'setItemData', stat: 'used', value: 1 },
        ];
      },
    },
  }),
];

export const ITEM_BY_ID = new Map(ITEMS.map((i) => [i.id, i]));
