import { defineItem, type Effect, type ItemDef } from '../core/types';
import { isAllAbsent, sharedLetters, truthCounts } from '../core/score';
import { FOODS } from './foods';

const SPELL_BITS: Record<string, number> = {
  'time-freeze': 1,
  omen: 2,
  heal: 4,
  restore: 8,
  immunity: 16,
  'phone-friend': 32,
};

const FOOD_BITS = new Map(FOODS.map((food, index) => [food.id, 1 << index]));

/** Every fifth eat/solve pays one item slot. */
function everyFiveEatsOrSolves(self: { data: Record<string, number> }): Effect[] {
  const total = self.data.progress + 1;
  const slots = Math.floor(total / 5);
  return [
    { type: 'setItemData', stat: 'progress', value: total % 5 },
    ...Array.from({ length: slots }, () => ({ type: 'slots' as const, delta: 1 })),
  ];
}

function popcount(value: number): number {
  let count = 0;
  while (value) {
    value &= value - 1;
    count++;
  }
  return count;
}

export const ITEMS: ItemDef[] = [
  defineItem({
    id: 'hourglass',
    name: 'Hourglass',
    description: '+15s per round.',
    price: 6,
    kind: 'gear',
    requiresClock: true,
    on: { onRoundStart: () => [{ type: 'addTime', ms: 15_000 }] },
  }),
  defineItem({
    id: 'early-bird',
    name: 'Early Bird',
    description: 'Solve under 30s: gain 2 gold. +1 more gold each time this triggers.',
    price: 6,
    kind: 'gear',
    timerInterest: true,
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
    id: 'hat-trick',
    name: 'Hat Trick',
    description: 'Solve in 3 guesses: gain 5 gold. +2 more gold each time this triggers.',
    dynamicDescription: (data) =>
      `Solve in 3 guesses: gain ${data.gold ?? 5} gold. +2 more gold each time this triggers.`,
    price: 9,
    kind: 'gear',
    initial: { gold: 5 },
    on: {
      onSolve: (ctx, p) =>
        p.guesses <= 3
          ? [
              { type: 'gold', amount: ctx.self.data.gold },
              { type: 'grow', stat: 'gold', by: 2 },
            ]
          : [],
    },
  }),
  defineItem({
    id: 'brace',
    name: 'Brace',
    description: 'Solve in 3 guesses: +2 max armor.',
    price: 8,
    kind: 'gear',
    on: {
      onSolve: (_ctx, p) => (p.guesses <= 3 ? [{ type: 'maxArmor', delta: 2 }] : []),
    },
  }),
  defineItem({
    id: 'bloom',
    name: 'Bloom',
    description: 'Solve in 3 guesses: +5 max HP. +1 more each time.',
    dynamicDescription: (data) =>
      `Solve in 3 guesses: +${data.hp ?? 5} max HP. +1 more each time.`,
    price: 11,
    kind: 'gear',
    initial: { hp: 5 },
    on: {
      onSolve: (ctx, p) =>
        p.guesses <= 3
          ? [
              { type: 'maxHp', delta: ctx.self.data.hp },
              { type: 'grow', stat: 'hp', by: 1 },
            ]
          : [],
    },
  }),
  defineItem({
    id: 'patch-kit',
    name: 'Patch Kit',
    description: 'Solve in 3 guesses: heal 30% of max HP +1.',
    price: 10,
    kind: 'gear',
    on: {
      onSolve: (ctx, p) =>
        p.guesses <= 3
          ? [{ type: 'heal', amount: Math.ceil(ctx.state.maxHp * 0.3) + 1 }]
          : [],
    },
  }),
  defineItem({
    id: 'four-leaf-clover',
    name: 'Four-Leaf Clover',
    description: '20% chance of a random spell when you eat or cast.',
    price: 9,
    kind: 'gear',
    on: {
      onEat: () => [{ type: 'giveSpell', spell: 'random', chancePct: 20 }],
      onSpellCast: () => [{ type: 'giveSpell', spell: 'random', chancePct: 20 }],
    },
  }),
  defineItem({
    id: 'head-start',
    name: 'Head Start',
    description: 'The first 12s of each round: guesses are free.',
    price: 8,
    kind: 'gear',
    on: {
      onRoundStart: () => [{ type: 'timedImmunity', ms: 12_000 }],
    },
  }),
  defineItem({
    id: 'quickdraw',
    name: 'Quickdraw',
    description: 'First 10s of each round: guesses are free. Guesses in that window: +1 gold.',
    price: 18,
    kind: 'gear',
    rarity: 'rare',
    on: {
      onRoundStart: () => [{ type: 'timedImmunity', ms: 10_000 }],
      onGuessScored: (_ctx, p) =>
        p.elapsedMs < 10_000 ? [{ type: 'gold', amount: 1 }] : [],
    },
  }),
  defineItem({
    id: 'daredevil',
    name: 'Daredevil',
    description: 'Rounds start 20s shorter. Every guess: +1 gold.',
    price: 10,
    kind: 'gear',
    on: {
      onRoundStart: () => [{ type: 'addTime', ms: -20_000 }],
      onGuessScored: () => [{ type: 'gold', amount: 1 }],
    },
  }),
  defineItem({
    id: 'iron-hide',
    name: 'Iron Hide',
    description: 'Every hit deals 1 less.',
    price: 8,
    kind: 'gear',
    modifyDamage: (_ctx, amount) => Math.max(0, amount - 1),
  }),
  defineItem({
    id: 'scattershot',
    name: 'Scattershot',
    description: 'Once per round: no shared letters means a free guess.',
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
    description: 'Once per round: an all-grey guess is a free guess.',
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
    description: 'Round start: last round’s answer is guessed for free.',
    price: 9,
    kind: 'gear',
    on: {
      onRoundStart: (ctx) => {
        const answer = ctx.state.lastAnswer;
        if (!answer) return [];
        if (ctx.state.blacklist.includes(answer)) return [];
        if (answer.split('').some((ch) => ctx.state.purged.includes(ch))) return [];
        return [{ type: 'autoGuess', word: answer }];
      },
    },
  }),
  defineItem({
    id: 'old-mcdonald',
    name: 'Old McDonald',
    description: 'Round start: EIEIO is guessed for free.',
    price: 24,
    kind: 'gear',
    rarity: 'rare',
    on: {
      onRoundStart: () => [{ type: 'autoGuess', word: 'eieio' }],
    },
  }),
  defineItem({
    id: 'encore',
    name: 'Encore',
    description: 'Round start: the last solved answer is guessed for free.',
    price: 11,
    kind: 'gear',
    on: {
      onRoundStart: (ctx) => {
        const answer = ctx.state.lastAnswer;
        if (!answer) return [];
        if (ctx.state.blacklist.includes(answer)) return [];
        if (answer.split('').some((ch) => ctx.state.purged.includes(ch))) return [];
        return [{ type: 'autoGuess', word: answer }];
      },
    },
  }),
  defineItem({
    id: 'compound-interest',
    name: 'Compound Interest',
    description: 'On solve: gain 10% of your current gold, up to 10 gold.',
    price: 6,
    kind: 'gear',
    on: {
      onSolve: (ctx) => [
        { type: 'gold', amount: Math.min(10, Math.ceil(ctx.state.gold * 0.1)) },
      ],
    },
  }),
  defineItem({
    id: 'midas-touch',
    name: 'Midas Touch',
    description: 'Every gold gain: 20% chance to double it.',
    price: 12,
    kind: 'gear',
    goldDoubleChance: 20,
  }),
  defineItem({
    id: 'photosynthesis',
    name: 'Photosynthesis',
    description: 'On solve: heal 10% max HP.',
    price: 8,
    kind: 'gear',
    on: {
      onSolve: (ctx) => [{ type: 'heal', amount: Math.ceil(ctx.state.maxHp * 0.1) }],
    },
  }),
  defineItem({
    id: 'vampire-teeth',
    name: 'Vampire Teeth',
    description: 'End of round: heal 2 HP.',
    price: 7,
    kind: 'gear',
    on: { onRoundEnd: () => [{ type: 'heal', amount: 2 }] },
  }),
  defineItem({
    id: 'placebo',
    name: 'Placebo',
    description: 'Every guess you make: heal 1 HP.',
    price: 10,
    kind: 'gear',
    on: {
      onGuessScored: (_ctx, p) =>
        p.guess.by === 'player' ? [{ type: 'heal', amount: 1 }] : [],
    },
  }),
  defineItem({
    id: 'siphon',
    name: 'Siphon',
    description: 'Casting a spell heals 4 HP.',
    price: 8,
    kind: 'gear',
    on: { onSpellCast: () => [{ type: 'heal', amount: 4 }] },
  }),
  defineItem({
    id: 'gourmand',
    name: 'Gourmand',
    description: 'On spell cast or food eaten: +1 max HP.',
    price: 8,
    kind: 'gear',
    on: {
      onEat: () => [{ type: 'maxHp', delta: 1 }],
      onSpellCast: () => [{ type: 'maxHp', delta: 1 }],
    },
  }),
  defineItem({
    id: 'big-belt',
    name: 'Big Belt',
    description: 'Every 5 eats or solves: +1 item slot.',
    price: 12,
    kind: 'gear',
    initial: { progress: 0 },
    on: {
      onEat: (ctx) => everyFiveEatsOrSolves(ctx.self),
      onSolve: (ctx) => everyFiveEatsOrSolves(ctx.self),
    },
  }),
  defineItem({
    id: 'bottomless',
    name: 'Bottomless',
    description: 'Gain 4 max armor. Eating food: 20% chance of +1 max armor.',
    price: 12,
    kind: 'gear',
    onAcquire: () => [{ type: 'maxArmor', delta: 4 }],
    on: {
      onEat: () => [{ type: 'maxArmor', delta: 1, chancePct: 20 }],
    },
  }),
  defineItem({
    id: 'spellbook',
    name: 'Spellbook',
    description: 'Spell cast: +1 gold. The bonus increases by 1 after every spell cast.',
    dynamicDescription: (data) =>
      `Spell cast: +${data.gold ?? 1} gold. The bonus increases by 1 after every spell cast.`,
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
    name: 'Curse Collector',
    description: 'Whenever you gain a curse: Gain 1 max armor.',
    price: 9,
    kind: 'gear',
    on: {
      onCurseGained: () => [{ type: 'maxArmor', delta: 1 }],
    },
  }),
  defineItem({
    id: 'necronomicon',
    name: 'Necronomicon',
    description: 'Round start: reveal 2 letters. Every 13 reveals: +1 Omen, -3 max HP.',
    price: 10,
    kind: 'gear',
    initial: { reveals: 0 },
    on: {
      onRoundStart: () => [{ type: 'revealRandom', count: 2 }],
      onReveal: (ctx) => {
        const total = ctx.self.data.reveals + 1;
        const procs = Math.floor(total / 13);
        const effects: Effect[] = [
          { type: 'setItemData', stat: 'reveals', value: total % 13 },
        ];
        for (let index = 0; index < procs; index++) {
          effects.push(
            { type: 'giveSpell', spell: 'omen' },
            { type: 'maxHp', delta: -3 },
          );
        }
        return effects;
      },
    },
  }),
  defineItem({
    id: 'metronome',
    name: 'Metronome',
    description: 'Guess with ≤5s on the clock: +6 gold.',
    price: 8,
    kind: 'gear',
    requiresClock: true,
    on: {
      onGuessScored: (_ctx, p) => {
        if (p.remainingMs == null || p.remainingMs > 5_000) return [];
        return [{ type: 'gold', amount: 6 }];
      },
    },
  }),
  defineItem({
    id: 'tally',
    name: 'Tally',
    description: 'Every 4 guesses: +1 gold.',
    price: 7,
    kind: 'gear',
    initial: { guesses: 0 },
    on: {
      onGuessScored: (ctx) => {
        const next = ctx.self.data.guesses + 1;
        return [
          { type: 'grow', stat: 'guesses', by: 1 },
          ...(next % 4 === 0 ? [{ type: 'gold' as const, amount: 1 }] : []),
        ];
      },
    },
  }),
  defineItem({
    id: 'overachiever',
    name: 'Overachiever',
    description: 'On solve: +1 gold per guess this round.',
    price: 7,
    kind: 'gear',
    on: { onSolve: (_ctx, p) => [{ type: 'gold', amount: p.guesses }] },
  }),
  defineItem({
    id: 'time-dilation',
    name: 'Time Dilation',
    description: 'First 10s: guesses are free. Rounds start 5s shorter.',
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
    description: 'First death: revive at 50% HP. Consumed.',
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
    description: 'Shop purchase: 40% chance of a random spell.',
    price: 8,
    kind: 'gear',
    on: {
      onPurchase: () =>
        [{ type: 'giveSpell', spell: 'random', chancePct: 40 }],
    },
  }),
  defineItem({
    id: 'purge-token',
    name: 'Purge Token',
    description: 'Consumable. Purge one letter from all future answers.',
    price: 8,
    kind: 'consumable',
    slots: 0,
    onUse: () => [{ type: 'pendingPurge', count: 1 }],
  }),
  defineItem({
    id: 'boss-trophy',
    name: 'Witch Charm',
    description: 'Whenever you gain a curse: Gain a random spell.',
    price: 10,
    kind: 'gear',
    on: {
      onCurseGained: () => [{ type: 'giveSpell', spell: 'random' }],
    },
  }),
  defineItem({
    id: 'fast-learner',
    name: 'Fast Learner',
    description: 'Solve under 30s: Time Freeze.',
    price: 8,
    kind: 'gear',
    timerInterest: true,
    on: {
      onSolve: (_ctx, p) =>
        p.elapsedMs < 30_000 ? [{ type: 'giveSpell', spell: 'time-freeze' }] : [],
    },
  }),
  defineItem({
    id: 'untouchable',
    name: 'Untouchable',
    description: 'Solve without damage: Restore.',
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
    description: 'Eating: random spell.',
    price: 8,
    kind: 'gear',
    on: { onEat: () => [{ type: 'giveSpell', spell: 'random' }] },
  }),
  defineItem({
    id: 'spellhoarder',
    name: 'Spellhoarder',
    description: 'Every 3rd spell cast: +1 random spell.',
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
    id: 'sundial',
    name: 'Sundial',
    description: '+2 minutes per round. -1 free guess per round.',
    price: 9,
    kind: 'gear',
    requiresClock: true,
    on: {
      onRoundStart: () => [
        { type: 'addTime', ms: 120_000 },
        { type: 'freeGuesses', count: -1 },
      ],
    },
  }),
  defineItem({
    id: 'glass-cannon',
    name: 'Glass Cannon',
    description: '+1 free guess per round. −10 max HP when acquired.',
    price: 9,
    kind: 'gear',
    onAcquire: () => [{ type: 'maxHp', delta: -10 }],
    on: { onRoundStart: () => [{ type: 'freeGuesses', count: 1 }] },
  }),
  defineItem({
    id: 'loose-tongue',
    name: 'Loose Tongue',
    description: 'Any five letters are a valid guess. Nonsense still scores.',
    price: 18,
    kind: 'gear',
    rarity: 'rare',
    allowInvalidGuesses: true,
  }),

  // ── spell engines ───────────────────────────────────────────────────────
  // Passive items that turn a condition into a spell. Spells stack, so these
  // are the main way to build a real arsenal without a spell shelf.

  defineItem({
    id: 'mimic-mouth',
    name: 'Mimic Mouth',
    description: 'A guess with 4+ revealed letters: random spell. Once per round.',
    price: 9,
    kind: 'gear',
    initial: { used: 0 },
    on: {
      onRoundStart: () => [{ type: 'setItemData', stat: 'used', value: 0 }],
      onGuessScored: (ctx, p) => {
        if (ctx.self.data.used) return [];
        return p.guess.truth.filter((tile) => tile !== 'absent').length >= 4
          ? [
              { type: 'giveSpell', spell: 'random' },
              { type: 'setItemData', stat: 'used', value: 1 },
            ]
          : [];
      },
    },
  }),
  defineItem({
    id: 'dead-letter',
    name: 'Dead Letter',
    description: 'Timeout: two random spells.',
    price: 8,
    kind: 'gear',
    on: {
      onRoundEnd: (_ctx, p) =>
        p.outcome === 'timeout'
          ? [{ type: 'giveSpell', spell: 'random' }, { type: 'giveSpell', spell: 'random' }]
          : [],
    },
  }),
  defineItem({
    id: 'vowel-tithe',
    name: 'Vowel Tithe',
    description: 'Spell cast: 30% chance of another random spell.',
    price: 9,
    kind: 'gear',
    on: {
      onSpellCast: () => [{ type: 'giveSpell', spell: 'random', chancePct: 30 }],
    },
  }),
  defineItem({
    id: 'second-hand',
    name: 'Second Hand',
    description: 'Casting Time Freeze also grants a Heal spell.',
    price: 9,
    kind: 'gear',
    on: {
      onSpellCast: (_ctx, p) =>
        p.spell === 'time-freeze'
          ? [{ type: 'giveSpell', spell: 'heal' }]
          : [],
    },
  }),
  defineItem({
    id: 'cracked-orb',
    name: 'Cracked Orb',
    description: 'Each round: 25% chance to start with a random spell.',
    price: 9,
    kind: 'gear',
    on: {
      onRoundStart: () => [{ type: 'giveSpell', spell: 'random', chancePct: 25 }],
    },
  }),
  defineItem({
    id: 'sticky-fingers',
    name: 'Sticky Fingers',
    description: 'Every 3rd shop purchase: +1 random spell.',
    price: 9,
    kind: 'gear',
    initial: { buys: 0 },
    on: {
      onPurchase: (ctx) => {
        const next = ctx.self.data.buys + 1;
        return [
          { type: 'grow', stat: 'buys', by: 1 },
          ...(next % 3 === 0 ? [{ type: 'giveSpell' as const, spell: 'random' as const }] : []),
        ];
      },
    },
  }),
  defineItem({
    id: 'nest-egg',
    name: 'Nest Egg',
    description: 'On solve: +3 gold.',
    price: 8,
    kind: 'gear',
    on: { onSolve: () => [{ type: 'gold', amount: 3 }] },
  }),
  defineItem({
    id: 'waste-basket',
    name: 'Waste Basket',
    description: 'Selling an item: +1 gold, 25% chance of a spell.',
    price: 7,
    kind: 'gear',
    on: { onSell: () => [{ type: 'gold', amount: 1 }, { type: 'giveSpell', spell: 'random', chancePct: 25 }] },
  }),

  // ── engines ─────────────────────────────────────────────────────────────
  // Event-driven passives. Most wait on something another item, a spell or a
  // meal provides, so they do not pay out on a schedule every round.

  defineItem({
    id: 'field-kit',
    name: 'Field Kit',
    description: 'Round start, learn 4 letters not in the word.',
    price: 10,
    kind: 'gear',
    on: { onRoundStart: () => [{ type: 'revealAbsent', count: 4 }] },
  }),
  defineItem({
    id: 'doggy-bag',
    name: 'Doggy Bag',
    description: 'Round start: learn 2 letters not in the word. Eating food: 1 more next round.',
    price: 11,
    kind: 'gear',
    on: {
      onRoundStart: () => [{ type: 'revealAbsent', count: 2 }],
      onEat: () => [{ type: 'pendingAbsent', count: 1 }],
    },
  }),
  defineItem({
    id: 'field-dressing',
    name: 'Field Dressing',
    description: 'Whenever a letter is revealed for you, heal 1 HP.',
    price: 8,
    kind: 'gear',
    on: { onReveal: () => [{ type: 'heal', amount: 1 }] },
  }),
  defineItem({
    id: 'pen-club',
    name: 'Pen Club',
    description: 'Guess a word that starts with PEN: gain 1-5 gold.',
    price: 15,
    kind: 'gear',
    on: {
      onGuessScored: (_ctx, p) =>
        p.guess.word.startsWith('pen')
          ? [{
              type: 'randomChoice',
              options: [
                [{ type: 'gold', amount: 1 }],
                [{ type: 'gold', amount: 2 }],
                [{ type: 'gold', amount: 3 }],
                [{ type: 'gold', amount: 4 }],
                [{ type: 'gold', amount: 5 }],
              ],
            }]
          : [],
    },
  }),
  defineItem({
    id: 'trailblazer',
    name: 'Trailblazer',
    description: 'On solve with 20+ ruled-out letters: random spell.',
    price: 9,
    kind: 'gear',
    on: {
      onSolve: (_ctx, p) =>
        p.ruledOut >= 20 ? [{ type: 'giveSpell', spell: 'random' }] : [],
    },
  }),
  defineItem({
    id: 'bulwark',
    name: 'Bulwark',
    description: 'Every 5 damage blocked: +1 random spell.',
    price: 10,
    kind: 'gear',
    initial: { blocked: 0 },
    on: {
      onDamageTaken: (ctx, p) => {
        if (p.blocked <= 0) return [];
        const total = ctx.self.data.blocked + p.blocked;
        const spells = Math.floor(total / 5);
        return [
          { type: 'setItemData', stat: 'blocked', value: total % 5 },
          ...Array.from({ length: spells }, () => ({ type: 'giveSpell' as const, spell: 'random' as const })),
        ];
      },
    },
  }),
  defineItem({
    id: 'scrap-collector',
    name: 'Scrap Collector',
    description: 'Every 5 armor lost: +1 gold.',
    price: 8,
    kind: 'gear',
    initial: { lost: 0 },
    on: {
      onDamageTaken: (ctx, p) => {
        if (p.armorUsed <= 0) return [];
        const total = ctx.self.data.lost + p.armorUsed;
        const gold = Math.floor(total / 5);
        return [
          { type: 'setItemData', stat: 'lost', value: total % 5 },
          ...Array.from({ length: gold }, () => ({ type: 'gold' as const, amount: 1 })),
        ];
      },
    },
  }),
  defineItem({
    id: 'boss-aegis',
    name: 'Curse Bulwark',
    description: 'Whenever you gain a curse: Gain 4 max armor.',
    price: 10,
    kind: 'gear',
    on: {
      onCurseGained: () => [{ type: 'maxArmor', delta: 4 }],
    },
  }),
  defineItem({
    id: 'spellplate',
    name: 'Spellplate',
    description: 'Cast a spell: +1 max armor.',
    price: 18,
    kind: 'gear',
    rarity: 'rare',
    on: { onSpellCast: () => [{ type: 'maxArmor', delta: 1 }] },
  }),
  defineItem({
    id: 'mending-plate',
    name: 'Mending Plate',
    description: 'Gives +1 armor now. +1 more max armor per 4 HP healed.',
    price: 20,
    kind: 'gear',
    rarity: 'rare',
    initial: { healed: 0 },
    onAcquire: () => [{ type: 'maxArmor', delta: 1 }],
    on: {
      onHeal: (ctx, p) => {
        const total = ctx.self.data.healed + p.amount;
        const armor = Math.floor(total / 4);
        return [
          { type: 'setItemData', stat: 'healed', value: total % 4 },
          ...Array.from({ length: armor }, () => ({ type: 'maxArmor' as const, delta: 1 })),
        ];
      },
    },
  }),
  defineItem({
    id: 'harvest-charm',
    name: 'Harvest Charm',
    description: 'Round start, equal odds: +5 max HP, heal 5% max HP, or gain Restore.',
    price: 9,
    kind: 'gear',
    on: {
      onRoundStart: () => [
        {
          type: 'randomChoice',
          options: [
            [{ type: 'maxHp', delta: 5 }],
            [{ type: 'healPercent', percent: 5 }],
            [{ type: 'giveSpell', spell: 'restore' }],
          ],
        },
      ],
    },
  }),
  defineItem({
    id: 'life-savings',
    name: 'Life Savings',
    description: 'Every 6 gold spent: +1 max HP.',
    price: 9,
    kind: 'gear',
    initial: { spent: 0 },
    on: {
      onGoldSpent: (ctx, p) => {
        const total = ctx.self.data.spent + p.amount;
        const growth = Math.floor(total / 6);
        return [
          { type: 'setItemData', stat: 'spent', value: total % 6 },
          ...Array.from({ length: growth }, () => ({ type: 'maxHp' as const, delta: 1 })),
        ];
      },
    },
  }),
  defineItem({
    id: 'tithe-box',
    name: 'Tithe Box',
    description: 'Every time you spend gold: 10% chance of a Heal spell.',
    price: 9,
    kind: 'gear',
    on: {
      onGoldSpent: () => [{ type: 'giveSpell', spell: 'heal', chancePct: 10 }],
    },
  }),
  defineItem({
    id: 'growth-chart',
    name: 'Growth Chart',
    description: 'Every 5 max HP gained: +1 Time Freeze.',
    price: 9,
    kind: 'gear',
    initial: { grown: 0 },
    on: {
      onMaxHpChanged: (ctx, p) => {
        if (p.delta <= 0) return [];
        const total = ctx.self.data.grown + p.delta;
        const freezes = Math.floor(total / 5);
        return [
          { type: 'setItemData', stat: 'grown', value: total % 5 },
          ...Array.from({ length: freezes }, () => ({ type: 'giveSpell' as const, spell: 'time-freeze' as const })),
        ];
      },
    },
  }),
  defineItem({
    id: 'stopped-clock',
    name: 'Stopped Clock',
    description: 'Cast Time Freeze: +5 max HP. Once per round.',
    price: 9,
    kind: 'gear',
    initial: { used: 0 },
    on: {
      onRoundEnd: () => [{ type: 'setItemData', stat: 'used', value: 0 }],
      onSpellCast: (ctx, p) => {
        if (ctx.self.data.used || p.spell !== 'time-freeze') return [];
        return [
          { type: 'maxHp', delta: 5 },
          { type: 'setItemData', stat: 'used', value: 1 },
        ];
      },
    },
  }),
  defineItem({
    id: 'time-lattice',
    name: 'Time Lattice',
    description: 'Cast Time Freeze: gain Restore. Once per round.',
    price: 8,
    kind: 'gear',
    initial: { used: 0 },
    on: {
      onRoundEnd: () => [{ type: 'setItemData', stat: 'used', value: 0 }],
      onSpellCast: (ctx, p) => {
        if (ctx.self.data.used || p.spell !== 'time-freeze') return [];
        return [
          { type: 'giveSpell', spell: 'restore' },
          { type: 'setItemData', stat: 'used', value: 1 },
        ];
      },
    },
  }),
  defineItem({
    id: 'omen-loom',
    name: 'Omen Loom',
    description: 'Cast Omen: gain a random spell. Once per round.',
    price: 9,
    kind: 'gear',
    initial: { used: 0 },
    on: {
      onRoundEnd: () => [{ type: 'setItemData', stat: 'used', value: 0 }],
      onSpellCast: (ctx, p) => {
        if (ctx.self.data.used || p.spell !== 'omen') return [];
        return [
          { type: 'giveSpell', spell: 'random' },
          { type: 'setItemData', stat: 'used', value: 1 },
        ];
      },
    },
  }),
  defineItem({
    id: 'mercy-ledger',
    name: 'Mercy Ledger',
    description: 'Cast Heal: +4 gold. Once per round.',
    price: 8,
    kind: 'gear',
    initial: { used: 0 },
    on: {
      onRoundEnd: () => [{ type: 'setItemData', stat: 'used', value: 0 }],
      onSpellCast: (ctx, p) => {
        if (ctx.self.data.used || p.spell !== 'heal') return [];
        return [
          { type: 'gold', amount: 4 },
          { type: 'setItemData', stat: 'used', value: 1 },
        ];
      },
    },
  }),
  defineItem({
    id: 'ward-engine',
    name: 'Ward Engine',
    description: 'Cast Immunity: +2 armor. Once per round.',
    price: 8,
    kind: 'gear',
    initial: { used: 0 },
    on: {
      onRoundEnd: () => [{ type: 'setItemData', stat: 'used', value: 0 }],
      onSpellCast: (ctx, p) => {
        if (ctx.self.data.used || p.spell !== 'immunity') return [];
        return [
          { type: 'armor', delta: 2 },
          { type: 'setItemData', stat: 'used', value: 1 },
        ];
      },
    },
  }),

  // ── timer, shop and engine items ─────────────────────────────────────────

  defineItem({
    id: 'deadline',
    name: 'Deadline',
    description: 'The first guess with 30s or less left each round is free.',
    price: 8,
    kind: 'gear',
    requiresClock: true,
    initial: { used: 0 },
    on: {
      onRoundStart: () => [{ type: 'setItemData', stat: 'used', value: 0 }],
      onGuessScored: (ctx, p) => {
        if (ctx.self.data.used || p.guess.free) return [];
        if (p.remainingMs === null || p.remainingMs > 30_000) return [];
        return [
          { type: 'makeGuessFree' },
          { type: 'setItemData', stat: 'used', value: 1 },
        ];
      },
    },
  }),
  defineItem({
    id: 'ticking-fee',
    name: 'Ticking Fee',
    description: 'Every 20s that pass in a round: +1 gold.',
    price: 8,
    kind: 'gear',
    timerInterest: true,
    requiresClock: true,
    initial: { ms: 0 },
    on: {
      onRoundStart: () => [{ type: 'setItemData', stat: 'ms', value: 0 }],
      onTimerTick: (ctx, p) => {
        const total = ctx.self.data.ms + p.dtMs;
        const gold = Math.floor(total / 20_000);
        return [
          { type: 'setItemData', stat: 'ms', value: total % 20_000 },
          ...Array.from({ length: gold }, () => ({ type: 'gold' as const, amount: 1 })),
        ];
      },
    },
  }),
  defineItem({
    id: 'second-skin',
    name: 'Second Skin',
    description: 'First time armor hits 0 each round: heal 4, restore half your max armor.',
    price: 9,
    kind: 'gear',
    initial: { used: 0 },
    on: {
      onRoundStart: () => [{ type: 'setItemData', stat: 'used', value: 0 }],
      onDamageTaken: (ctx, p) => {
        if (ctx.self.data.used || p.armorUsed <= 0 || ctx.state.armor > 0) return [];
        return [
          { type: 'heal', amount: 4 },
          { type: 'armor', delta: Math.ceil(ctx.state.maxArmor / 2) },
          { type: 'setItemData', stat: 'used', value: 1 },
        ];
      },
    },
  }),
  defineItem({
    id: 'double-blind',
    name: 'Double Blind',
    description: 'Once per round: a guess with exactly one yellow and no green is free.',
    price: 8,
    kind: 'gear',
    initial: { used: 0 },
    on: {
      onRoundStart: () => [{ type: 'setItemData', stat: 'used', value: 0 }],
      onGuessScored: (ctx, p) => {
        if (ctx.self.data.used) return [];
        const counts = truthCounts(p.guess.truth);
        if (counts.correct !== 0 || counts.present !== 1) return [];
        return [
          { type: 'makeGuessFree' },
          { type: 'setItemData', stat: 'used', value: 1 },
        ];
      },
    },
  }),
  defineItem({
    id: 'pawn-ticket',
    name: 'Pawn Ticket',
    description: 'Every 2 items sold: +1 random spell.',
    price: 4,
    kind: 'gear',
    initial: { sold: 0 },
    on: {
      onSell: (ctx) => {
        const next = ctx.self.data.sold + 1;
        return [
          { type: 'grow', stat: 'sold', by: 1 },
          ...(next % 2 === 0
            ? [{ type: 'giveSpell' as const, spell: 'random' as const }]
            : []),
        ];
      },
    },
  }),
  defineItem({
    id: 'miser',
    name: 'Miser',
    description: 'End of round: +1 gold per 10 gold held.',
    price: 9,
    kind: 'gear',
    on: {
      onRoundEnd: (ctx) => {
        const amount = Math.floor(ctx.state.gold / 10);
        return amount > 0 ? [{ type: 'gold', amount }] : [];
      },
    },
  }),
  defineItem({
    id: 'coupon-book',
    name: 'Coupon Book',
    description: 'The first purchase in each shop costs 2 less.',
    price: 8,
    kind: 'gear',
    shopDiscount: 2,
  }),
  defineItem({
    id: 'contrapuntal',
    name: 'Contrapuntal',
    description: 'Cast each of the six spell types once. On the last, become a random relic.',
    price: 12,
    kind: 'gear',
    initial: { _mask: 0, types: 0 },
    on: {
      onSpellCast: (ctx, p) => {
        const bit = SPELL_BITS[p.spell];
        if (!bit) return [];
        const mask = ctx.self.data._mask ?? 0;
        if (mask & bit) return [];
        const next = mask | bit;
        const types = popcount(next);
        const effects: Effect[] = [
          { type: 'setItemData', stat: '_mask', value: next },
          { type: 'setItemData', stat: 'types', value: types },
        ];
        if (types >= 6) {
          effects.push({ type: 'consumeSelf' }, { type: 'addRandomRelic' });
        }
        return effects;
      },
    },
  }),
  defineItem({
    id: 'trophy-room',
    name: 'Reliquary',
    description: 'Whenever you gain a curse: Gain 1 item slot.',
    price: 10,
    kind: 'gear',
    on: {
      onCurseGained: () => [{ type: 'slots', delta: 1 }],
    },
  }),
  defineItem({
    id: 'loyalty-card',
    name: 'Loyalty Card',
    description: 'Every 7 shop purchases: +1 item slot.',
    price: 8,
    kind: 'gear',
    initial: { buys: 0 },
    on: {
      onPurchase: (ctx) => {
        const next = ctx.self.data.buys + 1;
        return [
          { type: 'grow', stat: 'buys', by: 1 },
          ...(next % 7 === 0 ? [{ type: 'slots' as const, delta: 1 }] : []),
        ];
      },
    },
  }),
  defineItem({
    id: 'bookend',
    name: 'Bookend',
    description: 'Guess a word starting and ending with the same letter: +3 gold.',
    price: 8,
    kind: 'gear',
    on: {
      onGuessScored: (_ctx, p) =>
        p.guess.word[0] === p.guess.word[4] ? [{ type: 'gold', amount: 3 }] : [],
    },
  }),
  defineItem({
    id: 'last-cast',
    name: 'Last Cast',
    description: 'Cast your last spell: +1 random spell. Once per round.',
    price: 9,
    kind: 'gear',
    initial: { used: 0 },
    on: {
      onRoundStart: () => [{ type: 'setItemData', stat: 'used', value: 0 }],
      onSpellCast: (ctx) => {
        if (ctx.self.data.used || ctx.state.spells.length > 0) return [];
        return [
          { type: 'giveSpell', spell: 'random' },
          { type: 'setItemData', stat: 'used', value: 1 },
        ];
      },
    },
  }),
  defineItem({
    id: 'empty-hand',
    name: 'Empty Hand',
    description: 'Start a round with no spells: +1 random spell.',
    price: 9,
    kind: 'gear',
    on: {
      onRoundStart: (ctx) =>
        ctx.state.spells.length === 0 ? [{ type: 'giveSpell', spell: 'random' }] : [],
    },
  }),
  defineItem({
    id: 'bulk-order',
    name: 'Bulk Order',
    description: 'Buy every food in a shop: +2 max HP and +1 max armor.',
    price: 9,
    kind: 'gear',
    initial: { _visit: -1 },
    on: {
      onPurchase: (ctx, p) => {
        const shop = ctx.state.shop;
        if (!shop || p.offer.kind !== 'eat') return [];
        if (shop.foodOffers <= 0 || shop.foodsBought < shop.foodOffers) return [];
        if (ctx.self.data._visit === shop.visit) return [];
        return [
          { type: 'setItemData', stat: '_visit', value: shop.visit },
          { type: 'maxHp', delta: 2 },
          { type: 'maxArmor', delta: 1 },
        ];
      },
    },
  }),
  defineItem({
    id: 'solo-note',
    name: 'Solo Note',
    description: 'Once per round: a guess with one yellow and no green grants Restore.',
    price: 9,
    kind: 'gear',
    initial: { used: 0 },
    on: {
      onRoundStart: () => [{ type: 'setItemData', stat: 'used', value: 0 }],
      onGuessScored: (ctx, p) => {
        if (ctx.self.data.used) return [];
        const counts = truthCounts(p.guess.truth);
        if (counts.correct !== 0 || counts.present !== 1) return [];
        return [
          { type: 'giveSpell', spell: 'restore' },
          { type: 'setItemData', stat: 'used', value: 1 },
        ];
      },
    },
  }),

  defineItem({
    id: 'off-road',
    name: 'Off-Road',
    description: 'Once per round: a guess sharing no letters with the previous guess grants Restore.',
    price: 9,
    kind: 'gear',
    initial: { used: 0 },
    on: {
      onRoundStart: () => [{ type: 'setItemData', stat: 'used', value: 0 }],
      onGuessScored: (ctx, p) => {
        if (ctx.self.data.used || !p.previous) return [];
        if (sharedLetters(p.guess.word, p.previous.word) > 0) return [];
        return [
          { type: 'giveSpell', spell: 'restore' },
          { type: 'setItemData', stat: 'used', value: 1 },
        ];
      },
    },
  }),
  defineItem({
    id: 'clean-slate',
    name: 'Clean Slate',
    description: 'A guess sharing no letters with the previous guess: +1 max armor.',
    price: 9,
    kind: 'gear',
    on: {
      onGuessScored: (_ctx, p) => {
        if (!p.previous) return [];
        return sharedLetters(p.guess.word, p.previous.word) === 0
          ? [{ type: 'maxArmor', delta: 1 }]
          : [];
      },
    },
  }),
  defineItem({
    id: 'shortcut',
    name: 'Shortcut',
    description: 'Solve in 2 guesses or fewer: +1 item slot.',
    price: 12,
    kind: 'gear',
    on: {
      onSolve: (_ctx, p) => (p.guesses <= 2 ? [{ type: 'slots', delta: 1 }] : []),
    },
  }),
  defineItem({
    id: 'growth-spurt',
    name: 'Growth Spurt',
    description: 'Solve in 4 guesses or fewer: +4 max HP.',
    price: 10,
    kind: 'gear',
    on: {
      onSolve: (_ctx, p) => (p.guesses <= 4 ? [{ type: 'maxHp', delta: 4 }] : []),
    },
  }),

  defineItem({
    id: 'tally-lens',
    name: 'Tally Lens',
    description: 'While a vision curse is active, guesses show correct and misplaced counts.',
    price: 8,
    kind: 'gear',
    requiresVisionCurse: 1,
  }),
  defineItem({
    id: 'meal-timer',
    name: 'Meal Timer',
    description: 'Eating food adds 2s to the clock. Only appears with a clock.',
    price: 8,
    kind: 'gear',
    requiresClock: true,
    on: {
      onEat: () => [{ type: 'addTime', ms: 2_000 }],
    },
  }),
  defineItem({
    id: 'plate-timer',
    name: 'Plate Timer',
    description: 'Every 10 armor lost adds 3s to the clock.',
    price: 9,
    kind: 'gear',
    requiresClock: true,
    initial: { lost: 0 },
    on: {
      onDamageTaken: (ctx, p) => {
        if (p.armorUsed <= 0) return [];
        const total = ctx.self.data.lost + p.armorUsed;
        const seconds = Math.floor(total / 10);
        return [
          { type: 'setItemData', stat: 'lost', value: total % 10 },
          ...Array.from({ length: seconds }, () => ({ type: 'addTime' as const, ms: 3_000 })),
        ];
      },
    },
  }),

  // ── boss relics ─────────────────────────────────────────────────────────
  // Rare passives. They take no slots, never appear in shops, and are only
  // offered as boss prizes. Several of them feed the spell engine.

  defineItem({
    id: 'oracle-skull',
    name: 'Oracle Skull',
    description: 'First heal each round: Omen.',
    price: 20,
    kind: 'gear',
    rarity: 'rare',
    initial: { used: 0 },
    on: {
      onRoundStart: () => [{ type: 'setItemData', stat: 'used', value: 0 }],
      onHeal: (ctx, p) => {
        if (ctx.self.data.used || p.amount <= 0) return [];
        return [
          { type: 'giveSpell', spell: 'omen' },
          { type: 'setItemData', stat: 'used', value: 1 },
        ];
      },
    },
  }),
  defineItem({
    id: 'thorn-crown',
    name: 'Thorn Crown',
    description: 'A hit gets through: 40% chance of a random spell.',
    price: 20,
    kind: 'gear',
    rarity: 'rare',
    on: {
      onDamageTaken: (_ctx, p) =>
        p.dealt > 0 ? [{ type: 'giveSpell', spell: 'random', chancePct: 40 }] : [],
    },
  }),
  defineItem({
    id: 'echo-chamber',
    name: 'Echo Chamber',
    description: 'First all-absent guess of the run: random spell.',
    price: 20,
    kind: 'gear',
    rarity: 'rare',
    initial: { used: 0 },
    on: {
      onGuessScored: (ctx, p) => {
        if (ctx.self.data.used) return [];
        if (!p.guess.truth.every((tile) => tile === 'absent')) return [];
        return [
          { type: 'setItemData', stat: 'used', value: 1 },
          { type: 'giveSpell', spell: 'random' },
        ];
      },
    },
  }),
  defineItem({
    id: 'phoenix-egg',
    name: 'Phoenix Egg',
    description: 'First death: revive at 50% HP, gain Restore. Consumed.',
    price: 24,
    kind: 'gear',
    rarity: 'rare',
    on: {
      onDeath: (ctx) => [
        { type: 'revive', hp: Math.ceil(ctx.state.maxHp * 0.5) },
        { type: 'giveSpell', spell: 'restore' },
        { type: 'consumeSelf' },
      ],
    },
  }),
  defineItem({
    id: 'speed-dial',
    name: 'Speed Dial',
    description: 'Round start: cast Phone a Friend.',
    price: 22,
    kind: 'gear',
    rarity: 'rare',
    on: {
      onRoundStart: () => [{ type: 'castSpell', spell: 'phone-friend' }],
    },
  }),
  defineItem({
    id: 'chrono-anchor',
    name: 'Chrono Anchor',
    description: '+20s per round. On solve: Time Freeze.',
    price: 22,
    kind: 'gear',
    rarity: 'rare',
    requiresClock: true,
    on: {
      onRoundStart: () => [{ type: 'addTime', ms: 20_000 }],
      onSolve: () => [{ type: 'giveSpell', spell: 'time-freeze' }],
    },
  }),
  defineItem({
    id: 'vowel-sigil',
    name: 'Vowel Sigil',
    description: 'Solve under 60s: Omen.',
    price: 18,
    kind: 'gear',
    rarity: 'rare',
    timerInterest: true,
    on: {
      onSolve: (_ctx, p) =>
        p.elapsedMs < 60_000 ? [{ type: 'giveSpell', spell: 'omen' }] : [],
    },
  }),
  defineItem({
    id: 'warding-idol',
    name: 'Warding Idol',
    description: 'Every 10 damage blocked by armor: +1 random spell.',
    price: 20,
    kind: 'gear',
    rarity: 'rare',
    initial: { blocked: 0 },
    on: {
      onDamageTaken: (ctx, p) => {
        if (p.armorUsed <= 0) return [];
        const total = ctx.self.data.blocked + p.armorUsed;
        const spells = Math.floor(total / 10);
        return [
          { type: 'setItemData', stat: 'blocked', value: total % 10 },
          ...Array.from({ length: spells }, () => ({ type: 'giveSpell' as const, spell: 'random' as const })),
        ];
      },
    },
  }),
  defineItem({
    id: 'loaded-dice',
    name: 'Loaded Dice',
    description: 'Every guess: 25% chance to be free.',
    price: 20,
    kind: 'gear',
    rarity: 'rare',
    on: {
      onGuessScored: (_ctx, p) =>
        p.guess.free ? [] : [{ type: 'makeGuessFree', chancePct: 25 }],
    },
  }),
  defineItem({
    id: 'counterweight',
    name: 'Counterweight',
    description: 'Completely blocked hit: +2 gold.',
    price: 20,
    kind: 'gear',
    rarity: 'rare',
    on: {
      onDamageTaken: (_ctx, p) => {
        if (p.dealt > 0 || p.blocked <= 0) return [];
        return [{ type: 'gold', amount: 2 }];
      },
    },
  }),
  defineItem({
    id: 'acquired-taste',
    name: 'Acquired Taste',
    description: 'Each different food you eat this run: +1 max HP.',
    price: 20,
    kind: 'gear',
    rarity: 'rare',
    initial: { _mask: 0, tasted: 0 },
    on: {
      onEat: (ctx, p) => {
        const bit = FOOD_BITS.get(p.food);
        if (!bit) return [];
        const mask = ctx.self.data._mask ?? 0;
        if (mask & bit) return [];
        const next = mask | bit;
        return [
          { type: 'setItemData', stat: '_mask', value: next },
          { type: 'setItemData', stat: 'tasted', value: popcount(next) },
          { type: 'maxHp', delta: 1 },
        ];
      },
    },
  }),
  defineItem({
    id: 'ritual-circle',
    name: 'Ritual Circle',
    description: 'Cast 3 different spell types in one round: +1 random spell, +2 max armor.',
    price: 20,
    kind: 'gear',
    rarity: 'rare',
    initial: { _mask: 0, types: 0, used: 0 },
    on: {
      onRoundStart: () => [
        { type: 'setItemData', stat: '_mask', value: 0 },
        { type: 'setItemData', stat: 'types', value: 0 },
        { type: 'setItemData', stat: 'used', value: 0 },
      ],
      onSpellCast: (ctx, p) => {
        const bit = SPELL_BITS[p.spell];
        if (!bit) return [];
        const mask = ctx.self.data._mask ?? 0;
        if (mask & bit) return [];
        const next = mask | bit;
        const types = popcount(next);
        const effects: Effect[] = [
          { type: 'setItemData', stat: '_mask', value: next },
          { type: 'setItemData', stat: 'types', value: types },
        ];
        if (types >= 3 && !ctx.self.data.used) {
          effects.push(
            { type: 'giveSpell', spell: 'random' },
            { type: 'maxArmor', delta: 2 },
            { type: 'setItemData', stat: 'used', value: 1 },
          );
        }
        return effects;
      },
    },
  }),
  defineItem({
    id: 'potluck',
    name: 'Potluck',
    description: 'Food you eat applies its effects twice. On-eat triggers still fire once.',
    price: 20,
    kind: 'gear',
    rarity: 'rare',
    doubleFood: true,
  }),
];

export const ITEM_BY_ID = new Map(ITEMS.map((i) => [i.id, i]));
