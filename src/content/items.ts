import { defineItem, type ItemDef } from '../core/types';
import { isAllAbsent, sharedLetters } from '../core/score';

export const ITEMS: ItemDef[] = [
  defineItem({
    id: 'hourglass',
    name: 'Hourglass',
    description: '+15s per round.',
    price: 6,
    kind: 'gear',
    on: { onRoundStart: () => [{ type: 'addTime', ms: 15_000 }] },
  }),
  defineItem({
    id: 'early-bird',
    name: 'Early Bird',
    description: 'Solve under 30s: 2 gold. +1 each payout.',
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
    description: 'Each hit is capped at 3.',
    price: 8,
    kind: 'gear',
    modifyDamage: (_ctx, amount) => Math.min(amount, 3),
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
    id: 'rabbit-foot',
    name: "Rabbit's Foot",
    description: '+1 free guess per round.',
    price: 7,
    kind: 'gear',
    on: { onRoundStart: () => [{ type: 'freeGuesses', count: 1 }] },
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
    description: 'Once per round: last round’s answer is a free guess.',
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
    description: 'Round start: reveal if the answer has B.',
    price: 7,
    kind: 'gear',
    on: { onRoundStart: () => [{ type: 'revealLetter', letter: 'b' }] },
  }),
  defineItem({
    id: 'x-ray',
    name: 'X-Ray',
    description: 'Round start: reveal if the answer has X.',
    price: 7,
    kind: 'gear',
    on: { onRoundStart: () => [{ type: 'revealLetter', letter: 'x' }] },
  }),
  defineItem({
    id: 'q-tip',
    name: 'Q-Tip',
    description: 'Round start: reveal if the answer has Q.',
    price: 7,
    kind: 'gear',
    on: { onRoundStart: () => [{ type: 'revealLetter', letter: 'q' }] },
  }),
  defineItem({
    id: 'compound-interest',
    name: 'Compound Interest',
    description: 'On solve: +10% gold (max 10).',
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
    id: 'siphon',
    name: 'Siphon',
    description: 'Casting a spell heals 1 HP.',
    price: 8,
    kind: 'gear',
    on: { onSpellCast: () => [{ type: 'heal', amount: 1 }] },
  }),
  defineItem({
    id: 'gourmand',
    name: 'Gourmand',
    description: 'Eating: +1 max HP.',
    price: 8,
    kind: 'gear',
    on: { onEat: () => [{ type: 'maxHp', delta: 1 }] },
  }),
  defineItem({
    id: 'spellbook',
    name: 'Spellbook',
    description: 'Spell cast: 1 gold. +1 each payout.',
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
    description: 'Beat a boss: +1 max armor.',
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
    description: 'On solve: 25% chance of a random spell.',
    price: 8,
    kind: 'gear',
    on: { onSolve: () => [{ type: 'giveSpell', spell: 'random', chancePct: 25 }] },
  }),
  defineItem({
    id: 'necronomicon',
    name: 'Necronomicon',
    description: 'Round start: reveal 2 letters. Every 5 reveals: Omen.',
    price: 10,
    kind: 'gear',
    initial: { reveals: 0 },
    on: {
      onRoundStart: () => [{ type: 'revealRandom', count: 2 }],
      onReveal: (ctx) => {
        const total = ctx.self.data.reveals + 1;
        const spells = Math.floor(total / 5);
        return [
          { type: 'setItemData', stat: 'reveals', value: total % 5 },
          ...Array.from({ length: spells }, () => ({ type: 'giveSpell' as const, spell: 'omen' as const })),
        ];
      },
    },
  }),
  defineItem({
    id: 'piggy-bank',
    name: 'Piggy Bank',
    description: 'Sells for more each round you hold it.',
    price: 7,
    kind: 'gear',
    initial: { held: 0 },
    on: { onRoundEnd: () => [{ type: 'grow', stat: 'held', by: 1 }] },
    sellValue: (ctx) => 5 + ctx.self.data.held * 3,
  }),
  defineItem({
    id: 'metronome',
    name: 'Metronome',
    description: 'Guess with ≤5s on the clock: +6 gold.',
    price: 8,
    kind: 'gear',
    on: {
      onGuessScored: (_ctx, p) => {
        if (p.remainingMs == null || p.remainingMs > 5_000) return [];
        return [{ type: 'gold', amount: 6 }];
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
    description: 'First 10s: no damage. Rounds start 5s shorter.',
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
    name: 'Boss Trophy',
    description: 'Beat a boss: random spell.',
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
    description: 'Solve under 30s: Time Warp.',
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
    description: 'Every 3rd spell cast: random spell.',
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
    name: 'Null Scholar',
    description: 'Once per round, a reveal that rules out a letter grants Omen.',
    price: 8,
    kind: 'gear',
    initial: { used: 0 },
    on: {
      onRoundEnd: () => [{ type: 'setItemData', stat: 'used', value: 0 }],
      onReveal: (ctx, p) => {
        if (ctx.self.data.used || p.status !== 'absent') return [];
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
    description: 'A word is evicted: +2 gold.',
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
    description: '+30s per round. −1 free guess per round.',
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
    price: 7,
    kind: 'gear',
    allowInvalidGuesses: true,
  }),

  // ── spell engines ───────────────────────────────────────────────────────
  // Passive items that turn a condition into a spell. Spells stack, so these
  // are the main way to build a real arsenal without a spell shelf.

  defineItem({
    id: 'mimic-mouth',
    name: 'Mimic Mouth',
    description: 'A guess with 4+ revealed letters: random spell.',
    price: 9,
    kind: 'gear',
    on: {
      onGuessScored: (_ctx, p) =>
        p.guess.truth.filter((tile) => tile !== 'absent').length >= 4
          ? [{ type: 'giveSpell', spell: 'random' }]
          : [],
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
    description: 'Casting Time Freeze or Time Warp also grants a Heal spell.',
    price: 9,
    kind: 'gear',
    on: {
      onSpellCast: (_ctx, p) =>
        p.spell === 'time-freeze' || p.spell === 'time-warp'
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
    description: 'Every 3rd shop purchase: random spell.',
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
    id: 'last-word',
    name: 'Last Word',
    description: 'First time below 25% HP: two random spells.',
    price: 12,
    kind: 'gear',
    rarity: 'common',
    initial: { used: 0 },
    on: {
      onDamageTaken: (ctx) => {
        if (ctx.self.data.used || ctx.state.hp > ctx.state.maxHp * 0.25) return [];
        return [
          { type: 'giveSpell', spell: 'random' },
          { type: 'giveSpell', spell: 'random' },
          { type: 'setItemData', stat: 'used', value: 1 },
        ];
      },
    },
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
    description: 'Round start: reveal 5 random letters, mostly not in the answer.',
    price: 10,
    kind: 'gear',
    on: { onRoundStart: () => [{ type: 'revealRandom', count: 5 }] },
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
    id: 'null-lens',
    name: 'Null Lens',
    description: 'Once per round, a reveal that rules a letter out grants a random spell.',
    price: 10,
    kind: 'gear',
    initial: { used: 0 },
    on: {
      onRoundEnd: () => [{ type: 'setItemData', stat: 'used', value: 0 }],
      onReveal: (ctx, p) => {
        if (ctx.self.data.used || p.status !== 'absent') return [];
        return [
          { type: 'giveSpell', spell: 'random' },
          { type: 'setItemData', stat: 'used', value: 1 },
        ];
      },
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
    description: 'Every 5 damage blocked by armor or immunity: gain a random spell.',
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
    name: 'Boss Aegis',
    description: 'Defeat a boss: +4 max armor.',
    price: 10,
    kind: 'gear',
    on: {
      onRoundEnd: (_ctx, p) =>
        p.boss && p.outcome === 'solved' ? [{ type: 'maxArmor', delta: 4 }] : [],
    },
  }),
  defineItem({
    id: 'spellplate',
    name: 'Spellplate',
    description: 'Cast a spell: +1 max armor. Cumulative.',
    price: 9,
    kind: 'gear',
    on: { onSpellCast: () => [{ type: 'maxArmor', delta: 1 }] },
  }),
  defineItem({
    id: 'mending-plate',
    name: 'Mending Plate',
    description: 'A single heal of 20+ HP: +1 max armor.',
    price: 8,
    kind: 'gear',
    on: {
      onHeal: (_ctx, p) => (p.amount >= 20 ? [{ type: 'maxArmor', delta: 1 }] : []),
    },
  }),
  defineItem({
    id: 'tithe-box',
    name: 'Tithe Box',
    description: 'Every 10 gold spent: gain a Heal spell.',
    price: 9,
    kind: 'gear',
    initial: { spent: 0 },
    on: {
      onGoldSpent: (ctx, p) => {
        const total = ctx.self.data.spent + p.amount;
        const heals = Math.floor(total / 10);
        return [
          { type: 'setItemData', stat: 'spent', value: total % 10 },
          ...Array.from({ length: heals }, () => ({ type: 'giveSpell' as const, spell: 'heal' as const })),
        ];
      },
    },
  }),
  defineItem({
    id: 'growth-chart',
    name: 'Growth Chart',
    description: 'Every 5 max HP gained: gain Time Warp.',
    price: 9,
    kind: 'gear',
    initial: { grown: 0 },
    on: {
      onMaxHpChanged: (ctx, p) => {
        if (p.delta <= 0) return [];
        const total = ctx.self.data.grown + p.delta;
        const warps = Math.floor(total / 5);
        return [
          { type: 'setItemData', stat: 'grown', value: total % 5 },
          ...Array.from({ length: warps }, () => ({ type: 'giveSpell' as const, spell: 'time-warp' as const })),
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
    id: 'second-stomach',
    name: 'Second Stomach',
    description: 'Eat food: +2 max HP and heal 2. Once per round.',
    price: 9,
    kind: 'gear',
    initial: { used: 0 },
    on: {
      onRoundEnd: () => [{ type: 'setItemData', stat: 'used', value: 0 }],
      onEat: (ctx) => {
        if (ctx.self.data.used) return [];
        return [
          { type: 'maxHp', delta: 2 },
          { type: 'heal', amount: 2 },
          { type: 'setItemData', stat: 'used', value: 1 },
        ];
      },
    },
  }),
  defineItem({
    id: 'preserves',
    name: 'Preserves',
    description: 'Eat food: gain a random spell. Once per round.',
    price: 8,
    kind: 'gear',
    initial: { used: 0 },
    on: {
      onRoundEnd: () => [{ type: 'setItemData', stat: 'used', value: 0 }],
      onEat: (ctx) =>
        ctx.self.data.used
          ? []
          : [
              { type: 'giveSpell', spell: 'random' },
              { type: 'setItemData', stat: 'used', value: 1 },
            ],
    },
  }),
  defineItem({
    id: 'time-lattice',
    name: 'Time Lattice',
    description: 'Cast Time Warp: gain Restore. Once per round.',
    price: 8,
    kind: 'gear',
    initial: { used: 0 },
    on: {
      onRoundEnd: () => [{ type: 'setItemData', stat: 'used', value: 0 }],
      onSpellCast: (ctx, p) => {
        if (ctx.self.data.used || p.spell !== 'time-warp') return [];
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
    slots: 0,
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
    slots: 0,
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
    slots: 0,
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
    description: '+20s per round. On solve: Time Warp.',
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
    description: 'On solve: +6 gold. Eating: random spell.',
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
    description: 'Solve under 60s: Omen.',
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
    name: 'Warding Idol',
    description: 'The first time you block damage each round, gain a random spell.',
    price: 20,
    kind: 'gear',
    rarity: 'rare',
    slots: 0,
    initial: { used: 0 },
    on: {
      onRoundEnd: () => [{ type: 'setItemData', stat: 'used', value: 0 }],
      onDamageTaken: (ctx, p) => {
        if (ctx.self.data.used || p.blocked <= 0) return [];
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
    description: 'First paid guess each round is free.',
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
