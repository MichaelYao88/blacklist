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

const FOOD_BITS = new Map(FOODS.map((food, index) => [food.id, index]));

/** Frozen Durian: one Time Freeze for every three eats or solves. */
function everyThreeFoodsOrSolves(self: { data: Record<string, number> }): Effect[] {
  const total = (self.data.eaten ?? 0) + 1;
  const freezes = Math.floor(total / 3);
  return [
    { type: 'setItemData', stat: 'eaten', value: total % 3 },
    ...Array.from({ length: freezes }, () => ({
      type: 'giveSpell' as const,
      spell: 'time-freeze' as const,
    })),
  ];
}

const MYTHOS_WORDS = [
  'ryleh', 'cthul', 'dagon', 'nyarl', 'azath', 'tsath', 'hypno',
  'elder', 'abyss', 'omens', 'sigil', 'ghoul', 'spawn', 'crawl',
  'dread', 'night', 'chaos', 'lunar', 'haunt', 'runes',
] as const;

/** Fed thresholds: 0, 13, 39, 79, 129, 189, 259. */
export function necronomiconTier(fed: number): number {
  if (fed >= 259) return 6;
  if (fed >= 189) return 5;
  if (fed >= 129) return 4;
  if (fed >= 79) return 3;
  if (fed >= 39) return 2;
  if (fed >= 13) return 1;
  return 0;
}

function necroProc(text: string): Effect {
  return { type: 'proc', text };
}

/**
 * The book's random gift pool. Tiers 5 and 6 add no new outcomes; they only
 * make the existing numbers bigger.
 */
export function necronomiconPool(tier: number): Effect[][] {
  const scale = tier;
  const reveal = 1 + Math.floor(tier / 2);
  const armor = 1 + Math.floor(tier / 2);
  const ruleOut = 3 + tier;
  const whisperChoices: Effect[][] = MYTHOS_WORDS.map((word) => [
    necroProc(`Whisper — autoguess ${word.toUpperCase()}.`),
    { type: 'autoGuess', word },
  ]);
  const twinChoices: Effect[][] = [];
  for (let first = 0; first < MYTHOS_WORDS.length; first++) {
    for (let second = first + 1; second < MYTHOS_WORDS.length; second++) {
      const a = MYTHOS_WORDS[first];
      const b = MYTHOS_WORDS[second];
      twinChoices.push([
        necroProc(`Twin Whispers — autoguess ${a.toUpperCase()} and ${b.toUpperCase()}.`),
        { type: 'autoGuess', word: a },
        { type: 'autoGuess', word: b },
      ]);
    }
  }
  const whisper = (): Effect[] => [
    { type: 'randomChoice', options: whisperChoices },
  ];
  const twin = (): Effect[] => [
    { type: 'randomChoice', options: twinChoices },
  ];
  const options: Effect[][] = [];

  // Both autoguess gifts are deliberately three times as likely as the rest.
  for (let index = 0; index < 3; index++) options.push(whisper());
  for (let index = 0; index < 3; index++) options.push(twin());

  options.push(
    [necroProc('Omen — a yellow letter surfaces.'), { type: 'castSpell', spell: 'omen' }],
    [
      necroProc('Twin Omens — two yellow letters surface.'),
      { type: 'castSpell', spell: 'omen' },
      { type: 'castSpell', spell: 'omen' },
    ],
    [
      necroProc(`Bounty — ${5 + 2 * scale} gold.`),
      { type: 'gold', amount: 5 + 2 * scale },
    ],
    [
      necroProc('Mend — heal to full and refill armor.'),
      { type: 'healMissingPercent', percent: 100 },
      { type: 'refillArmor' },
    ],
    [
      necroProc(`Glimpse — reveal ${reveal} letter${reveal === 1 ? '' : 's'}.`),
      { type: 'revealRandom', count: reveal },
    ],
    [
      necroProc(`Unwrite — rule out ${ruleOut} letters.`),
      { type: 'revealAbsent', count: ruleOut },
    ],
    [necroProc('Wild Spark — cast a random spell.'), { type: 'castSpell', spell: 'random' }],
  );

  if (tier >= 1) {
    options.push(
      [necroProc('Second Chance — +1 free guess.'), { type: 'freeGuesses', count: 1 }],
      [necroProc('Freeze — the clock stops.'), { type: 'castSpell', spell: 'time-freeze' }],
      [
        necroProc('Twin Immunity — cast Immunity twice.'),
        { type: 'castSpell', spell: 'immunity' },
        { type: 'castSpell', spell: 'immunity' },
      ],
      [necroProc(`Growth — +${1 + scale} max HP.`), { type: 'maxHp', delta: 1 + scale }],
      [necroProc(`Plating — +${armor} max armor.`), { type: 'maxArmor', delta: armor }],
      [necroProc('Feast — eat something.'), { type: 'eatRandom' }],
    );
  }

  if (tier >= 2) {
    options.push(
      [necroProc('Permanent Glimpse — learn a letter for good.'), { type: 'revealPermanentRandom' }],
      [necroProc('Erasure — purge a letter.'), { type: 'purgeRandomLetter' }],
      [
        necroProc(`Windfall — ${8 + 4 * scale} gold.`),
        { type: 'gold', amount: 8 + 4 * scale },
      ],
      [
        necroProc(`Counting House — counts for ${2 + scale} rounds.`),
        { type: 'visionCounts', rounds: 2 + scale },
      ],
      [
        necroProc('Blood Price — the book takes its cut.'),
        { type: 'damage', amount: 2 + scale, ignoreArmor: true },
        { type: 'castSpell', spell: 'random' },
        { type: 'castSpell', spell: 'random' },
      ],
    );
  }

  if (tier >= 3) {
    options.push(
      [necroProc('Extra Pocket — +1 item slot.'), { type: 'slots', delta: 1 }],
      [necroProc('Relic — a rare treasure.'), { type: 'addRandomRelic' }],
      [necroProc('Unburden — a curse lifts.'), { type: 'removeRandomCurse', chancePct: 100 }],
      [necroProc('Bloom of Flesh — max HP doubles.'), { type: 'maxHpMultiply', factor: 2 }],
    );
  }

  if (tier >= 4) {
    options.push([
      necroProc('Cursed Bargain — a relic, and a curse.'),
      { type: 'addRandomRelic' },
      { type: 'addRandomCurse' },
    ]);
  }

  return options;
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
    id: 'early-bird',
    name: 'Early Bird',
    description: 'Solve in under a minute: gain 2 gold. +1 more gold each time this triggers.',
    price: 6,
    kind: 'gear',
    timerInterest: true,
    initial: { gold: 2 },
    on: {
      onSolve: (ctx, p) =>
        p.elapsedMs < 60_000
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
    description: 'Solve in 3 guesses: gain 1 gold. +2 more gold each time this triggers.',
    dynamicDescription: (data) =>
      `Solve in 3 guesses: gain ${data.gold ?? 1} gold. +2 more gold each time this triggers.`,
    price: 9,
    kind: 'gear',
    initial: { gold: 1 },
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
    description: 'Solve in 3 guesses: +1 max armor.',
    price: 6,
    kind: 'gear',
    on: {
      onSolve: (_ctx, p) => (p.guesses <= 3 ? [{ type: 'maxArmor', delta: 1 }] : []),
    },
  }),
  defineItem({
    id: 'bloom',
    name: 'Bloom',
    description: 'Solve in 3 guesses: +3 max HP. +1 more each time.',
    dynamicDescription: (data) =>
      `Solve in 3 guesses: +${data.hp ?? 3} max HP. +1 more each time.`,
    price: 7,
    kind: 'gear',
    initial: { hp: 3 },
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
    description: 'The first 7s of each round: Immune to damage. Your free guess is still spent by the first guess.',
    price: 8,
    kind: 'gear',
    rarity: 'rare',
    on: {
      onRoundStart: () => [{ type: 'timedImmunity', ms: 7_000 }],
    },
  }),
  defineItem({
    id: 'scattershot',
    name: 'Scattershot',
    description: 'Once per round: a player guess sharing no letters with the previous guess autocasts a free random spell.',
    price: 10,
    kind: 'gear',
    rarity: 'uncommon',
    initial: { used: 0 },
    on: {
      onRoundStart: () => [{ type: 'setItemData', stat: 'used', value: 0 }],
      onGuessScored: (ctx, p) => {
        if (ctx.self.data.used || !p.previous || p.guess.by !== 'player') return [];
        if (sharedLetters(p.guess.word, p.previous.word) > 0) return [];
        return [
          { type: 'castSpell', spell: 'random' },
          { type: 'setItemData', stat: 'used', value: 1 },
        ];
      },
    },
  }),
  defineItem({
    id: 'grey-market',
    name: 'Grey Market',
    description: 'Every all-grey guess pays 2 gold. If one pays nothing, a letter was hidden.',
    price: 7,
    kind: 'gear',
    on: {
      onGuessScored: (_ctx, p) =>
        isAllAbsent(p.guess.truth) ? [{ type: 'gold', amount: 2 }] : [],
    },
  }),
  defineItem({
    id: 'encore',
    name: 'Encore',
    description: 'Round start: autoguess the last solved answer.',
    price: 7,
    kind: 'gear',
    appearanceWeight: 3,
    unique: true,
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
    price: 4,
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
    description: 'Every gold gain: 30% chance to double it.',
    price: 12,
    kind: 'gear',
    goldDoubleChance: 30,
  }),
  defineItem({
    id: 'gold-standard',
    name: 'Gold Standard',
    description: 'Every gold gain: +1 gold.',
    price: 8,
    kind: 'gear',
    goldGainBonus: 1,
  }),
  defineItem({
    id: 'photosynthesis',
    name: 'Photosynthesis',
    description: 'On solve: +2 max HP and heal 20% max HP.',
    price: 10,
    kind: 'gear',
    on: {
      onSolve: () => [
        { type: 'maxHp', delta: 2 },
        { type: 'healPercent', percent: 20 },
      ],
    },
  }),
  defineItem({
    id: 'adrenaline',
    name: 'Adrenaline',
    description: 'When HP drops below 50%: +3 max HP and +1 max armor. Re-arms after healing above 50%.',
    price: 10,
    kind: 'gear',
    initial: { armed: 1 },
    onAcquire: (ctx) => [{
      type: 'setItemData',
      stat: 'armed',
      value: ctx.state.hp >= ctx.state.maxHp / 2 ? 1 : 0,
    }],
    on: {
      onDamageTaken: (ctx) => {
        if (!ctx.self.data.armed) return [];
        if (ctx.state.hp >= ctx.state.maxHp / 2) return [];
        return [
          { type: 'setItemData', stat: 'armed', value: 0 },
          { type: 'maxHp', delta: 3 },
          { type: 'maxArmor', delta: 1 },
        ];
      },
      onHeal: (ctx) => {
        if (ctx.self.data.armed || ctx.state.hp < ctx.state.maxHp / 2) return [];
        return [{ type: 'setItemData', stat: 'armed', value: 1 }];
      },
      onRoundStart: (ctx) => {
        const armed = ctx.state.hp >= ctx.state.maxHp / 2 ? 1 : 0;
        return ctx.self.data.armed === armed
          ? []
          : [{ type: 'setItemData', stat: 'armed', value: armed }];
      },
    },
  }),
  defineItem({
    id: 'placebo',
    name: 'Placebo',
    description: 'Any guess, including an autoguess: heal 1 HP.',
    price: 4,
    kind: 'gear',
    on: {
      onGuessScored: () => [{ type: 'heal', amount: 1 }],
    },
  }),
  defineItem({
    id: 'siphon',
    name: 'Siphon',
    description: 'Casting a spell that isn\'t Heal: 40% chance to autocast a free Heal.',
    price: 8,
    kind: 'gear',
    on: {
      onSpellCast: (_ctx, p) =>
        p.spell === 'heal' ? [] : [{ type: 'castSpell', spell: 'heal', chancePct: 40 }],
    },
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
    description: 'Whenever you gain a curse: Gain 6 max HP and heal 6.',
    price: 9,
    kind: 'gear',
    on: {
      onCurseGained: () => [
        { type: 'maxHp', delta: 6 },
        { type: 'heal', amount: 6 },
      ],
    },
  }),
  defineItem({
    id: 'necronomicon',
    name: 'Necronomicon',
    description: 'Use during a fight: lose 13% max HP for a random gift. The book grows stronger as you feed it. Once per round.',
    price: 13,
    kind: 'gear',
    rarity: 'rare',
    initial: { fed: 0, _uses: 0 },
    onUse: (ctx) => {
      if (!ctx.self.equipped) {
        return [{ type: 'message', text: 'Equip the book first.' }];
      }
      if (ctx.state.phase !== 'round' || !ctx.state.round) {
        return [{ type: 'message', text: 'The book only answers during a fight.' }];
      }
      if ((ctx.self.data._uses ?? 0) >= 1) {
        return [{ type: 'message', text: 'The book is silent until next round.' }];
      }
      const cost = Math.min(
        Math.ceil(ctx.state.maxHp * 0.13),
        Math.max(0, ctx.state.maxHp - 1),
      );
      if (cost <= 0) {
        return [{ type: 'message', text: 'The book needs more life to take.' }];
      }
      const fed = (ctx.self.data.fed ?? ctx.self.data.paid ?? 0) + cost;
      return [
        { type: 'maxHp', delta: -cost },
        { type: 'setItemData', stat: 'fed', value: fed },
        { type: 'setItemData', stat: '_uses', value: 1 },
        { type: 'randomChoice', options: necronomiconPool(necronomiconTier(fed)) },
      ];
    },
    on: {
      onRoundStart: () => [{ type: 'setItemData', stat: '_uses', value: 0 }],
    },
  }),
  defineItem({
    id: 'tally',
    name: 'Tally',
    description: 'Every 4 guesses: +1 gold.',
    price: 7,
    kind: 'gear',
    unique: true,
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
    id: 'black-market-ledger',
    name: 'Black Market Ledger',
    description: 'Shop purchase or event: 40% chance of a random spell.',
    price: 8,
    kind: 'gear',
    on: {
      onPurchase: () =>
        [{ type: 'giveSpell', spell: 'random', chancePct: 40 }],
      onHappening: () =>
        [{ type: 'giveSpell', spell: 'random', chancePct: 40 }],
    },
  }),
  defineItem({
    id: 'fast-learner',
    name: 'Fast Learner',
    description: 'Solve in under a minute: Time Freeze.',
    price: 8,
    kind: 'gear',
    timerInterest: true,
    on: {
      onSolve: (_ctx, p) =>
        p.elapsedMs < 60_000 ? [{ type: 'giveSpell', spell: 'time-freeze' }] : [],
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
    id: 'spellhoarder',
    name: 'Panacea Pouch',
    description: 'Every 3rd spell cast: autocast a free Heal.',
    price: 9,
    kind: 'gear',
    initial: { casts: 0 },
    on: {
      onSpellCast: (ctx) => {
        const next = ctx.self.data.casts + 1;
        return [
          { type: 'grow', stat: 'casts', by: 1 },
          ...(next % 3 === 0 ? [{ type: 'castSpell' as const, spell: 'heal' as const }] : []),
        ];
      },
    },
  }),
  defineItem({
    id: 'loose-tongue',
    name: 'Loose Tongue',
    description: 'Any five letters are a valid guess. Nonsense still scores, and this is the only way to guess an invalid word.',
    price: 12,
    kind: 'gear',
    rarity: 'uncommon',
    allowInvalidGuesses: true,
  }),

  // ── spell engines ───────────────────────────────────────────────────────
  // Passive items that turn a condition into a spell. Spells stack, so these
  // are the main way to build a real arsenal without a spell shelf.

  defineItem({
    id: 'mimic-mouth',
    name: 'Mimic Mouth',
    description: 'A wrong guess with 5 revealed letters: autocast a free random spell. Once per round.',
    price: 7,
    kind: 'gear',
    initial: { used: 0 },
    on: {
      onRoundStart: () => [{ type: 'setItemData', stat: 'used', value: 0 }],
      onGuessScored: (ctx, p) => {
        if (ctx.self.data.used) return [];
        const solved = p.guess.word === ctx.state.round?.answer;
        if (solved) return [];
        return p.guess.truth.filter((tile) => tile !== 'absent').length >= 5
          ? [
              { type: 'castSpell', spell: 'random' },
              { type: 'setItemData', stat: 'used', value: 1 },
            ]
          : [];
      },
    },
  }),
  defineItem({
    id: 'vowel-tithe',
    name: 'Vowel Tithe',
    description: 'Spell cast: 25% chance to autocast a free Omen.',
    price: 8,
    kind: 'gear',
    on: {
      onSpellCast: () => [{ type: 'castSpell', spell: 'omen', chancePct: 25 }],
    },
  }),
  defineItem({
    id: 'second-hand',
    name: 'Second Hand',
    description: 'Casting Time Freeze: 80% chance to autocast a free Heal. Casting Immunity: 80% chance to autocast a free Restore.',
    price: 8,
    kind: 'gear',
    on: {
      onSpellCast: (_ctx, p) => {
        if (p.spell === 'time-freeze') {
          return [{ type: 'castSpell', spell: 'heal', chancePct: 80 }];
        }
        if (p.spell === 'immunity') {
          return [{ type: 'castSpell', spell: 'restore', chancePct: 80 }];
        }
        return [];
      },
    },
  }),
  defineItem({
    id: 'engine',
    name: 'Counterclockwise',
    description: 'Casting Restore: 80% chance to autocast a free Time Freeze. Casting Heal: 80% chance to autocast a free Immunity.',
    price: 8,
    kind: 'gear',
    on: {
      onSpellCast: (_ctx, p) => {
        if (p.spell === 'restore') {
          return [{ type: 'castSpell', spell: 'time-freeze', chancePct: 80 }];
        }
        if (p.spell === 'heal') {
          return [{ type: 'castSpell', spell: 'immunity', chancePct: 80 }];
        }
        return [];
      },
    },
  }),
  defineItem({
    id: 'combustion-engine',
    name: 'Combustion Engine',
    description: 'After you autocast a spell: 30% chance to autocast a free random spell.',
    price: 10,
    kind: 'gear',
    rarity: 'uncommon',
    appearanceWeight: 3,
    on: {
      onSpellCast: (_ctx, p) =>
        p.auto && p.sourceItem !== 'combustion-engine'
          ? [{ type: 'castSpell', spell: 'random', chancePct: 30 }]
          : [],
    },
  }),
  defineItem({
    id: 'genie-summon',
    name: 'Genie Summon',
    description: 'After your 3rd player guess each round: autocast a free random spell.',
    price: 8,
    kind: 'gear',
    rarity: 'uncommon',
    initial: { guesses: 0 },
    on: {
      onRoundStart: () => [{ type: 'setItemData', stat: 'guesses', value: 0 }],
      onGuessScored: (ctx, p) => {
        if (p.guess.by !== 'player') return [];
        const next = ctx.self.data.guesses + 1;
        return [
          { type: 'grow', stat: 'guesses', by: 1 },
          ...(next === 3 ? [{ type: 'castSpell' as const, spell: 'random' as const }] : []),
        ];
      },
    },
  }),
  defineItem({
    id: 'cracked-orb',
    name: 'Cracked Orb',
    description: 'Each round: 25% chance to autocast a free random spell.',
    price: 9,
    kind: 'gear',
    on: {
      onRoundStart: () => [{ type: 'castSpell', spell: 'random', chancePct: 25 }],
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
    description: 'Visit a shop: +3 gold.',
    price: 4,
    kind: 'gear',
    on: { onShopOpen: () => [{ type: 'gold', amount: 3 }] },
  }),
  defineItem({
    id: 'waste-basket',
    name: 'Waste Basket',
    description: 'Selling an item: +1 gold, 25% chance of a spell.',
    price: 3,
    kind: 'gear',
    on: { onSell: () => [{ type: 'gold', amount: 1 }, { type: 'giveSpell', spell: 'random', chancePct: 25 }] },
  }),

  // ── engines ─────────────────────────────────────────────────────────────
  // Event-driven passives. Most wait on something another item, a spell or a
  // meal provides, so they do not pay out on a schedule every round.

  defineItem({
    id: 'field-kit',
    name: 'Field Kit',
    description: 'Round start: Rule Out 4 letters guaranteed not in the word.',
    price: 10,
    kind: 'gear',
    on: { onRoundStart: () => [{ type: 'revealAbsent', count: 4 }] },
  }),
  defineItem({
    id: 'doggy-bag',
    name: 'Doggy Bag',
    description: 'Round start: Rule Out 2 letters guaranteed not in the word. Eating food: 1 more next round.',
    price: 11,
    kind: 'gear',
    on: {
      onRoundStart: () => [{ type: 'revealAbsent', count: 2 }],
      onEat: () => [{ type: 'pendingAbsent', count: 1 }],
    },
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
    description: 'On solve with 15+ ruled-out letters: random spell.',
    price: 7,
    kind: 'gear',
    on: {
      onSolve: (_ctx, p) =>
        p.ruledOut >= 15 ? [{ type: 'giveSpell', spell: 'random' }] : [],
    },
  }),
  defineItem({
    id: 'bulwark',
    name: 'Bulwark',
    description: 'Every 10 damage blocked by armor: autocast a free random spell.',
    price: 8,
    kind: 'gear',
    initial: { blocked: 0 },
    on: {
      onDamageTaken: (ctx, p) => {
        if (p.armorUsed <= 0) return [];
        const total = ctx.self.data.blocked + p.armorUsed;
        const spells = Math.floor(total / 10);
        return [
          { type: 'setItemData', stat: 'blocked', value: total % 10 },
          ...Array.from({ length: spells }, () => ({ type: 'castSpell' as const, spell: 'random' as const })),
        ];
      },
    },
  }),
  defineItem({
    id: 'ricochet',
    name: 'Ricochet',
    description: 'Every 10 armor lost: autoguess a random word.',
    price: 7,
    kind: 'gear',
    initial: { lost: 0 },
    on: {
      onDamageTaken: (ctx, p) => {
        if (p.armorUsed <= 0) return [];
        const total = ctx.self.data.lost + p.armorUsed;
        const guesses = Math.floor(total / 10);
        return [
          { type: 'setItemData', stat: 'lost', value: total % 10 },
          ...Array.from({ length: guesses }, () => ({
            type: 'randomGuesses' as const,
            count: 1,
          })),
        ];
      },
    },
  }),
  defineItem({
    id: 'guardian-angel',
    name: 'Guardian Angel',
    description: 'After every 10 HP damage taken: autocast a free Immunity.',
    price: 8,
    kind: 'gear',
    initial: { taken: 0 },
    on: {
      onDamageTaken: (ctx, p) => {
        if (p.dealt <= 0 || !ctx.state.round) return [];
        const total = ctx.self.data.taken + p.dealt;
        const procs = Math.floor(total / 10);
        return [
          { type: 'setItemData', stat: 'taken', value: total % 10 },
          ...Array.from({ length: procs }, () => ({ type: 'immunity' as const, guesses: 1 })),
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
    description: 'Whenever you gain a curse: Gain 2 max armor.',
    price: 10,
    kind: 'gear',
    on: {
      onCurseGained: () => [{ type: 'maxArmor', delta: 2 }],
    },
  }),
  defineItem({
    id: 'spellplate',
    name: 'Spellplate',
    description: 'Cast a spell: +1 max armor.',
    price: 16,
    kind: 'gear',
    rarity: 'rare',
    on: { onSpellCast: () => [{ type: 'maxArmor', delta: 1 }] },
  }),
  defineItem({
    id: 'mending-plate',
    name: 'Mending Plate',
    description: '+1 max armor per 8 HP healed.',
    price: 26,
    kind: 'gear',
    rarity: 'rare',
    initial: { healed: 0 },
    on: {
      onHeal: (ctx, p) => {
        const total = ctx.self.data.healed + p.amount;
        const armor = Math.floor(total / 8);
        return [
          { type: 'setItemData', stat: 'healed', value: total % 8 },
          ...Array.from({ length: armor }, () => ({ type: 'maxArmor' as const, delta: 1 })),
        ];
      },
    },
  }),
  defineItem({
    id: 'harvest-charm',
    name: 'Harvest Charm',
    description: 'Round start: autoguess a random word.',
    price: 9,
    kind: 'gear',
    noSpawn: true,
    on: {
      onRoundStart: () => [{ type: 'randomGuesses', count: 1 }],
    },
  }),
  defineItem({
    id: 'tithe-box',
    name: 'Tithe Box',
    description: 'Every time you spend gold: 10% chance of a Heal spell.',
    price: 10,
    kind: 'gear',
    on: {
      onGoldSpent: () => [{ type: 'giveSpell', spell: 'heal', chancePct: 10 }],
    },
  }),
  defineItem({
    id: 'growth-chart',
    name: 'Growth Chart',
    description: 'Every 3 max HP gained: +1 Time Freeze.',
    price: 8,
    kind: 'gear',
    initial: { grown: 0 },
    on: {
      onMaxHpChanged: (ctx, p) => {
        if (p.delta <= 0) return [];
        const total = (ctx.self.data.grown ?? 0) + p.delta;
        const freezes = Math.floor(total / 3);
        return [
          { type: 'setItemData', stat: 'grown', value: total % 3 },
          ...Array.from({ length: freezes }, () => ({ type: 'giveSpell' as const, spell: 'time-freeze' as const })),
        ];
      },
    },
  }),
  defineItem({
    id: 'stopped-clock',
    name: 'Stopped Clock',
    description: 'Cast Time Freeze: +5 max HP. Once per round.',
    price: 6,
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
    description: 'Cast Time Freeze: autocast a free Restore. Once per round.',
    price: 8,
    kind: 'gear',
    initial: { used: 0 },
    on: {
      onRoundEnd: () => [{ type: 'setItemData', stat: 'used', value: 0 }],
      onSpellCast: (ctx, p) => {
        if (ctx.self.data.used || p.spell !== 'time-freeze') return [];
        return [
          { type: 'castSpell', spell: 'restore' },
          { type: 'setItemData', stat: 'used', value: 1 },
        ];
      },
    },
  }),
  defineItem({
    id: 'frozen-durian',
    name: 'Frozen Durian',
    description: 'Every 3 foods eaten or solves: +1 Time Freeze.',
    price: 8,
    kind: 'gear',
    initial: { eaten: 0 },
    on: {
      onEat: (ctx) => everyThreeFoodsOrSolves(ctx.self),
      onSolve: (ctx) => everyThreeFoodsOrSolves(ctx.self),
    },
  }),
  defineItem({
    id: 'omen-loom',
    name: 'Omen Loom',
    description: 'Cast Omen: autocast a free random spell. Once per round.',
    price: 9,
    kind: 'gear',
    initial: { used: 0 },
    on: {
      onRoundEnd: () => [{ type: 'setItemData', stat: 'used', value: 0 }],
      onSpellCast: (ctx, p) => {
        if (ctx.self.data.used || p.spell !== 'omen') return [];
        return [
          { type: 'castSpell', spell: 'random' },
          { type: 'setItemData', stat: 'used', value: 1 },
        ];
      },
    },
  }),
  defineItem({
    id: 'ward-engine',
    name: 'Ward Engine',
    description: 'Cast Immunity: +2 max armor. Once per round.',
    price: 8,
    kind: 'gear',
    initial: { used: 0 },
    on: {
      onRoundEnd: () => [{ type: 'setItemData', stat: 'used', value: 0 }],
      onSpellCast: (ctx, p) => {
        if (ctx.self.data.used || p.spell !== 'immunity') return [];
        return [
          { type: 'maxArmor', delta: 2 },
          { type: 'setItemData', stat: 'used', value: 1 },
        ];
      },
    },
  }),

  // ── timer, shop and engine items ─────────────────────────────────────────

  defineItem({
    id: 'deadline',
    name: 'Deadline',
    description: 'As soon as the clock drops below 30s each round: +1 free guess.',
    price: 8,
    kind: 'gear',
    requiresClock: true,
    initial: { used: 0 },
    on: {
      onRoundStart: () => [{ type: 'setItemData', stat: 'used', value: 0 }],
      onTimerTick: (ctx, p) => {
        if (ctx.self.data.used) return [];
        if (p.remainingMs === null || p.remainingMs >= 30_000) return [];
        return [
          { type: 'freeGuesses', count: 1 },
          { type: 'setItemData', stat: 'used', value: 1 },
        ];
      },
    },
  }),
  defineItem({
    id: 'second-skin',
    name: 'Second Skin',
    description: 'First time armor hits 0 each round: restore half your max armor.',
    price: 9,
    kind: 'gear',
    rarity: 'uncommon',
    initial: { used: 0 },
    on: {
      onRoundStart: () => [{ type: 'setItemData', stat: 'used', value: 0 }],
      onDamageTaken: (ctx, p) => {
        if (ctx.self.data.used || p.armorUsed <= 0 || ctx.state.armor > 0) return [];
        return [
          { type: 'armor', delta: Math.ceil(ctx.state.maxArmor / 2) },
          { type: 'setItemData', stat: 'used', value: 1 },
        ];
      },
    },
  }),
  defineItem({
    id: 'double-blind',
    name: 'Yellow1',
    description: 'Once per round: a guess with exactly one yellow and no green autoguesses a random word.',
    price: 14,
    kind: 'gear',
    rarity: 'rare',
    initial: { used: 0 },
    on: {
      onRoundStart: () => [{ type: 'setItemData', stat: 'used', value: 0 }],
      onGuessScored: (ctx, p) => {
        if (ctx.self.data.used || p.guess.by !== 'player') return [];
        const counts = truthCounts(p.guess.truth);
        if (counts.correct !== 0 || counts.present !== 1) return [];
        return [
          { type: 'randomGuesses', count: 1 },
          { type: 'setItemData', stat: 'used', value: 1 },
        ];
      },
    },
  }),
  defineItem({
    id: 'green1',
    name: 'Green1',
    description: 'Once per round: a guess with exactly one green and no yellow autoguesses a random word.',
    price: 14,
    kind: 'gear',
    rarity: 'uncommon',
    initial: { used: 0 },
    on: {
      onRoundStart: () => [{ type: 'setItemData', stat: 'used', value: 0 }],
      onGuessScored: (ctx, p) => {
        if (ctx.self.data.used || p.guess.by !== 'player') return [];
        const counts = truthCounts(p.guess.truth);
        if (counts.correct !== 1 || counts.present !== 0) return [];
        return [
          { type: 'randomGuesses', count: 1 },
          { type: 'setItemData', stat: 'used', value: 1 },
        ];
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
    price: 7,
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
    description: 'Every 10 shop purchases: +1 item slot.',
    price: 12,
    rarity: 'uncommon',
    kind: 'gear',
    initial: { buys: 0 },
    on: {
      onPurchase: (ctx) => {
        const next = ctx.self.data.buys + 1;
        return [
          { type: 'grow', stat: 'buys', by: 1 },
          ...(next % 10 === 0 ? [{ type: 'slots' as const, delta: 1 }] : []),
        ];
      },
    },
  }),
  defineItem({
    id: 'bookend',
    name: 'Bookend',
    description: 'Guess a word starting and ending with the same letter: +2 gold.',
    price: 7,
    kind: 'gear',
    on: {
      onGuessScored: (_ctx, p) =>
        p.guess.word[0] === p.guess.word[4] ? [{ type: 'gold', amount: 2 }] : [],
    },
  }),
  defineItem({
    id: 'last-cast',
    name: 'Last Cast',
    description: 'When you cast your only remaining spell: autocast a free random spell. Once per round.',
    price: 9,
    kind: 'gear',
    initial: { used: 0 },
    on: {
      onRoundStart: () => [{ type: 'setItemData', stat: 'used', value: 0 }],
      onSpellCast: (ctx, p) => {
        if (ctx.self.data.used || p.auto || ctx.state.spells.length > 0) return [];
        return [
          { type: 'castSpell', spell: 'random' },
          { type: 'setItemData', stat: 'used', value: 1 },
        ];
      },
    },
  }),
  defineItem({
    id: 'empty-hand',
    name: 'Empty Hand',
    description: 'Start a round with no spells: autocast a free random spell.',
    price: 9,
    kind: 'gear',
    on: {
      onRoundStart: (ctx) =>
        (ctx.roundStartSpells ?? ctx.state.spells.length) === 0
          ? [{ type: 'castSpell', spell: 'random' }]
          : [],
    },
  }),
  defineItem({
    id: 'empty-armor',
    name: 'Empty Armor',
    description: 'Start a round with no spells: +1 Restore.',
    price: 8,
    kind: 'gear',
    on: {
      onRoundStart: (ctx) =>
        (ctx.roundStartSpells ?? ctx.state.spells.length) === 0
          ? [{ type: 'giveSpell', spell: 'restore' }]
          : [],
    },
  }),
  defineItem({
    id: 'empty-orb',
    name: 'Empty Orb',
    description: 'Start a round with no spells: autocast a free Omen.',
    price: 7,
    kind: 'gear',
    on: {
      onRoundStart: (ctx) =>
        (ctx.roundStartSpells ?? ctx.state.spells.length) === 0
          ? [{ type: 'castSpell', spell: 'omen' }]
          : [],
    },
  }),
  defineItem({
    id: 'empty-phone',
    name: 'Empty Phone',
    description: 'Start a round with no spells: autocast a free Phone a Friend.',
    price: 9,
    kind: 'gear',
    on: {
      onRoundStart: (ctx) =>
        (ctx.roundStartSpells ?? ctx.state.spells.length) === 0
          ? [{ type: 'castSpell', spell: 'phone-friend' }]
          : [],
    },
  }),
  defineItem({
    id: 'solo-note',
    name: 'Solo Note',
    description: 'Once per round: a guess with one yellow and no green autocasts a free Restore.',
    price: 7,
    kind: 'gear',
    initial: { used: 0 },
    on: {
      onRoundStart: () => [{ type: 'setItemData', stat: 'used', value: 0 }],
      onGuessScored: (ctx, p) => {
        if (ctx.self.data.used) return [];
        const counts = truthCounts(p.guess.truth);
        if (counts.correct !== 0 || counts.present !== 1) return [];
        return [
          { type: 'castSpell', spell: 'restore' },
          { type: 'setItemData', stat: 'used', value: 1 },
        ];
      },
    },
  }),

  defineItem({
    id: 'off-road',
    name: 'Off-Road',
    description: 'Once per round: a player guess sharing no letters with the previous guess autocasts a free random spell.',
    price: 9,
    kind: 'gear',
    initial: { used: 0 },
    on: {
      onRoundStart: () => [{ type: 'setItemData', stat: 'used', value: 0 }],
      onGuessScored: (ctx, p) => {
        if (ctx.self.data.used || !p.previous || p.guess.by !== 'player') return [];
        if (sharedLetters(p.guess.word, p.previous.word) > 0) return [];
        return [
          { type: 'castSpell', spell: 'random' },
          { type: 'setItemData', stat: 'used', value: 1 },
        ];
      },
    },
  }),
  defineItem({
    id: 'detour',
    name: 'Detour',
    description: 'Once per round: a guess sharing no letters with the previous guess autoguesses a random word.',
    price: 10,
    kind: 'gear',
    initial: { used: 0 },
    on: {
      onRoundStart: () => [{ type: 'setItemData', stat: 'used', value: 0 }],
      onGuessScored: (ctx, p) => {
        if (ctx.self.data.used || !p.previous || p.guess.by !== 'player') return [];
        if (sharedLetters(p.guess.word, p.previous.word) > 0) return [];
        return [
          { type: 'randomGuesses', count: 1 },
          { type: 'setItemData', stat: 'used', value: 1 },
        ];
      },
    },
  }),
  defineItem({
    id: 'dark-echo',
    name: 'Dark Echo',
    description: 'First player guess each round: autoguess a word sharing no letters with it.',
    price: 13,
    kind: 'gear',
    rarity: 'uncommon',
    initial: { used: 0 },
    on: {
      onRoundStart: () => [{ type: 'setItemData', stat: 'used', value: 0 }],
      onGuessScored: (ctx, p) => {
        if (ctx.self.data.used || p.guess.by !== 'player') return [];
        if (p.guess.word === ctx.state.round?.answer) return [];
        return [
          { type: 'randomGuesses', count: 1, excludeLetters: p.guess.word },
          { type: 'setItemData', stat: 'used', value: 1 },
        ];
      },
    },
  }),
  defineItem({
    id: 'black-eye',
    name: 'Black Eye',
    description: 'A hit gets through: 80% chance to autoguess a random word.',
    price: 8,
    kind: 'gear',
    on: {
      onDamageTaken: (_ctx, p) =>
        p.dealt > 0 ? [{ type: 'randomGuesses', count: 1, chancePct: 80 }] : [],
    },
  }),
  defineItem({
    id: 'turtle-shell',
    name: 'Turtle Shell',
    description: 'A Hit (HP damage) that armor does not soak is reduced by 50%.',
    price: 8,
    kind: 'gear',
    unarmoredHitMultiplier: 0.5,
  }),
  defineItem({
    id: 'palindrome',
    name: 'Palindrome',
    description: 'Once per round: a guess whose first and last letters match autoguesses a random word.',
    price: 10,
    kind: 'gear',
    rarity: 'rare',
    initial: { used: 0 },
    on: {
      onRoundStart: () => [{ type: 'setItemData', stat: 'used', value: 0 }],
      onGuessScored: (ctx, p) => {
        if (ctx.self.data.used || p.guess.by !== 'player') return [];
        if (p.guess.word[0] !== p.guess.word[4]) return [];
        return [
          { type: 'randomGuesses', count: 1 },
          { type: 'setItemData', stat: 'used', value: 1 },
        ];
      },
    },
  }),
  defineItem({
    id: 'crisis-15',
    name: 'Oasis 15',
    description: 'Guess a word ending in IS: autoguess a random word.',
    price: 5,
    kind: 'gear',
    on: {
      onGuessScored: (_ctx, p) =>
        p.guess.by === 'player' && p.guess.word.endsWith('is')
          ? [{ type: 'randomGuesses', count: 1 }]
          : [],
    },
  }),
  defineItem({
    id: 'shellshock',
    name: 'Shellshock',
    description: 'Armor is depleted: autoguess a random word.',
    price: 6,
    kind: 'gear',
    on: {
      onDamageTaken: (ctx, p) =>
        p.armorUsed > 0 && ctx.state.armor === 0
          ? [{ type: 'randomGuesses', count: 1 }]
          : [],
    },
  }),
  defineItem({
    id: 'echo-chamber',
    name: 'Echo Chamber',
    description: 'Every 2 spells cast: autoguess a random word.',
    price: 8,
    kind: 'gear',
    initial: { casts: 0 },
    on: {
      onSpellCast: (ctx) => {
        const next = ctx.self.data.casts + 1;
        return [
          { type: 'grow', stat: 'casts', by: 1 },
          ...(next % 2 === 0 ? [{ type: 'randomGuesses' as const, count: 1 }] : []),
        ];
      },
    },
  }),
  defineItem({
    id: 'panic-button',
    name: 'Panic Button',
    description: 'HP drops below half in a round: autocast a free Phone a Friend. Once per round.',
    price: 8,
    kind: 'gear',
    initial: { used: 0 },
    on: {
      onRoundStart: () => [{ type: 'setItemData', stat: 'used', value: 0 }],
      onDamageTaken: (ctx) => {
        if (ctx.self.data.used || ctx.state.phase !== 'round' || ctx.state.hp <= 0) return [];
        if (ctx.state.hp * 2 >= ctx.state.maxHp) return [];
        return [
          { type: 'setItemData', stat: 'used', value: 1 },
          { type: 'castSpell', spell: 'phone-friend' },
        ];
      },
    },
  }),
  defineItem({
    id: 'wild-magic',
    name: 'Wild Magic',
    description: 'Spell cast: 25% chance to autocast a free random spell and 25% chance to autoguess a random word.',
    price: 9,
    kind: 'gear',
    on: {
      onSpellCast: () => [
        { type: 'castSpell', spell: 'random', chancePct: 25 },
        { type: 'randomGuesses', count: 1, chancePct: 25 },
      ],
    },
  }),
  defineItem({
    id: 'empty-mouth',
    name: 'Empty Mouth',
    description: 'Start a round with no spells: autoguess a random word.',
    price: 8,
    kind: 'gear',
    on: {
      onRoundStart: (ctx) =>
        (ctx.roundStartSpells ?? ctx.state.spells.length) === 0
          ? [{ type: 'randomGuesses', count: 1 }]
          : [],
    },
  }),
  defineItem({
    id: 'clean-slate',
    name: 'Clean Slate',
    description: 'Once per round: a guess sharing no letters with the previous guess: +1 max HP or +1 max armor at random.',
    price: 9,
    kind: 'gear',
    initial: { used: 0 },
    on: {
      onRoundStart: () => [{ type: 'setItemData', stat: 'used', value: 0 }],
      onGuessScored: (ctx, p) => {
        if (ctx.self.data.used || !p.previous) return [];
        if (sharedLetters(p.guess.word, p.previous.word) > 0) return [];
        return [
          {
            type: 'randomChoice',
            options: [
              [{ type: 'maxHp', delta: 1 }],
              [{ type: 'maxArmor', delta: 1 }],
            ],
          },
          { type: 'setItemData', stat: 'used', value: 1 },
        ];
      },
    },
  }),
  defineItem({
    id: 'growth-spurt',
    name: 'Growth Spurt',
    description: 'Solve in 4 guesses or fewer: +3 max HP.',
    price: 6,
    kind: 'gear',
    on: {
      onSolve: (_ctx, p) => (p.guesses <= 4 ? [{ type: 'maxHp', delta: 3 }] : []),
    },
  }),

  defineItem({
    id: 'tally-lens',
    name: 'Counter-Intelligence',
    description: 'While a vision curse is active, guesses show correct and misplaced counts.',
    price: 12,
    kind: 'gear',
    rarity: 'common',
    shopRarity: 'uncommon',
    unique: true,
    appearanceWeight: 3,
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
    description: 'Every 10 armor lost adds 15s to the clock.',
    price: 7,
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
          ...Array.from({ length: seconds }, () => ({ type: 'addTime' as const, ms: 15_000 })),
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
    description: 'Whenever you are healed: autocast a free Omen.',
    price: 12,
    kind: 'gear',
    rarity: 'uncommon',
    on: {
      onHeal: (_ctx, p) => {
        if (p.amount <= 0) return [];
        return [{ type: 'castSpell', spell: 'omen' }];
      },
    },
  }),
  defineItem({
    id: 'thorn-crown',
    name: 'Thorn Crown',
    description: 'A hit gets through: 80% chance to autocast a free random spell.',
    price: 14,
    kind: 'gear',
    rarity: 'uncommon',
    on: {
      onDamageTaken: (_ctx, p) =>
        p.dealt > 0 ? [{ type: 'castSpell', spell: 'random', chancePct: 80 }] : [],
    },
  }),
  defineItem({
    id: 'phoenix-egg',
    name: 'Phoenix Egg',
    description: 'First death: revive at 50% HP, autocast a free Restore. Consumed.',
    price: 18,
    kind: 'gear',
    rarity: 'rare',
    on: {
      onDeath: (ctx) => [
        { type: 'revive', hp: Math.ceil(ctx.state.maxHp * 0.5) },
        { type: 'castSpell', spell: 'restore' },
        { type: 'consumeSelf' },
      ],
    },
  }),
  defineItem({
    id: 'speed-dial',
    name: 'Speed Dial',
    description: 'Round start: autocast a free Phone a Friend.',
    price: 28,
    kind: 'gear',
    rarity: 'rare',
    on: {
      onRoundStart: () => [{ type: 'castSpell', spell: 'phone-friend' }],
    },
  }),
  defineItem({
    id: 'chrono-anchor',
    name: 'Chrono Anchor',
    description: '+20s per round. Taking damage: 30% chance to autocast a free Time Freeze.',
    price: 28,
    kind: 'gear',
    rarity: 'uncommon',
    requiresClock: true,
    on: {
      onRoundStart: () => [{ type: 'addTime', ms: 20_000 }],
      onDamageTaken: () =>
        [{ type: 'castSpell', spell: 'time-freeze', chancePct: 30 }],
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
    id: 'counterweight',
    name: 'Counterweight',
    description: 'Completely blocked hit: +2 gold.',
    price: 10,
    kind: 'gear',
    rarity: 'uncommon',
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
    description: 'Each different food you eat this run: +4 max HP.',
    price: 7,
    kind: 'gear',
    rarity: 'uncommon',
    initial: { _mask: 0, tasted: 0 },
    on: {
      onEat: (ctx, p) => {
        const index = FOOD_BITS.get(p.food);
        if (index === undefined) return [];
        const word = Math.floor(index / 30);
        const stat = word === 0 ? '_mask' : `_mask${word}`;
        const bit = 1 << (index % 30);
        const mask = ctx.self.data[stat] ?? 0;
        if (mask & bit) return [];
        const next = mask | bit;
        return [
          { type: 'setItemData', stat, value: next },
          { type: 'setItemData', stat: 'tasted', value: (ctx.self.data.tasted ?? 0) + 1 },
          { type: 'maxHp', delta: 4 },
        ];
      },
    },
  }),
  defineItem({
    id: 'potluck',
    name: 'Potluck',
    description: 'The first food you eat each level applies its effects twice. On-eat triggers still fire once.',
    price: 26,
    kind: 'gear',
    rarity: 'rare',
    doubleFood: true,
  }),
  defineItem({
    id: 'piggy-bank',
    name: 'Piggy Bank',
    description: 'Sells for 2 gold. +2 more gold per round held.',
    price: 2,
    kind: 'gear',
    initial: { held: 0 },
    on: {
      onRoundStart: (ctx) => [
        { type: 'setItemData', stat: 'held', value: (ctx.self.data.held ?? 0) + 1 },
      ],
    },
    dynamicDescription: (data) =>
      `Sells for ${2 + 2 * (data.held ?? 0)} gold. +2 more gold per round held.`,
    sellValue: (ctx) => 2 + 2 * (ctx.self.data.held ?? 0),
  }),
];

export const ITEM_BY_ID = new Map(ITEMS.map((i) => [i.id, i]));
