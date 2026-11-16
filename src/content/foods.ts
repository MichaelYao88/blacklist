import { defineFood, type FoodDef } from '../core/types';

export const FOODS: FoodDef[] = [
  defineFood({
    id: 'snack',
    name: 'Snack',
    description: 'Recover 8 HP. No slot.',
    price: 3,
    effects: [{ type: 'heal', amount: 8 }],
  }),
  defineFood({
    id: 'feast',
    name: 'Feast',
    description: '+5 max HP, heal 5. No slot.',
    price: 5,
    effects: [
      { type: 'maxHp', delta: 5 },
      { type: 'heal', amount: 5 },
    ],
  }),
  defineFood({
    id: 'candy',
    name: 'Candy',
    description: 'Random spell. No slot.',
    price: 4,
    effects: [{ type: 'giveSpell', spell: 'random' }],
  }),
  defineFood({
    id: 'coffee',
    name: 'Coffee',
    description: '+3s per round, permanently. No slot.',
    price: 6,
    effects: [{ type: 'timeBonus', ms: 3_000 }],
  }),
  defineFood({
    id: 'mystery-stew',
    name: 'Mystery Stew',
    description: 'Two random spells. No slot.',
    price: 8,
    effects: [
      { type: 'giveSpell', spell: 'random' },
      { type: 'giveSpell', spell: 'random' },
    ],
  }),
  defineFood({
    id: 'hearty-meal',
    name: 'Hearty Meal',
    description: '+8 max HP, heal 8. No slot.',
    price: 8,
    effects: [
      { type: 'maxHp', delta: 8 },
      { type: 'heal', amount: 8 },
    ],
  }),
  defineFood({
    id: 'bone-broth',
    name: 'Bone Broth',
    description: 'Heal 12 HP and +2 max HP. No slot.',
    price: 6,
    effects: [
      { type: 'heal', amount: 12 },
      { type: 'maxHp', delta: 2 },
    ],
  }),
  defineFood({
    id: 'iron-ration',
    name: 'Iron Ration',
    description: '+3 max armor. No slot.',
    price: 6,
    effects: [{ type: 'maxArmor', delta: 3 }],
  }),
  defineFood({
    id: 'honey-cake',
    name: 'Honey Cake',
    description: 'Heal 6 HP and gain Omen. No slot.',
    price: 5,
    effects: [
      { type: 'heal', amount: 6 },
      { type: 'giveSpell', spell: 'omen' },
    ],
  }),
  defineFood({
    id: 'overtime-tea',
    name: 'Overtime Tea',
    description: '+20s this round and heal 4. No slot.',
    price: 5,
    effects: [
      { type: 'addTime', ms: 20_000 },
      { type: 'heal', amount: 4 },
    ],
  }),

  // Permanent boosts are eaten like food now. There is no separate upgrade
  // shelf: the shop offers three items, two foods and one wildcard.
  defineFood({
    id: 'vitality',
    name: 'Vitality',
    description: '+8 max HP, heal 8. No slot.',
    price: 6,
    effects: [
      { type: 'maxHp', delta: 8 },
      { type: 'heal', amount: 8 },
    ],
  }),
  defineFood({
    id: 'plating',
    name: 'Plating',
    description: '+2 max armor. No slot.',
    price: 6,
    effects: [{ type: 'maxArmor', delta: 2 }],
  }),
  defineFood({
    id: 'chronos',
    name: 'Chronos',
    description: '+10s per round. No slot.',
    price: 8,
    effects: [{ type: 'timeBonus', ms: 10_000 }],
  }),
  defineFood({
    id: 'satchel',
    name: 'Satchel',
    description: '+1 slot. No slot.',
    price: 10,
    effects: [{ type: 'slots', delta: 1 }],
  }),
  defineFood({
    id: 'bounty',
    name: 'Bounty',
    description: '+2 gold per solve. No slot.',
    price: 8,
    effects: [{ type: 'solveGold', amount: 2 }],
  }),

  // Letter reveals are too narrow for a gear slot, so they are sold as
  // expensive one-shot meals. Their reveal lands when the next round starts.
  defineFood({
    id: 'b-file',
    name: 'B-File',
    description: 'Next round: reveal whether the answer has B. No slot.',
    price: 10,
    effects: [{ type: 'revealLetter', letter: 'b' }],
  }),
  defineFood({
    id: 'x-ray',
    name: 'X-Ray',
    description: 'Next round: reveal whether the answer has X. No slot.',
    price: 12,
    effects: [{ type: 'revealLetter', letter: 'x' }],
  }),
  defineFood({
    id: 'q-tip',
    name: 'Q-Tip',
    description: 'Next round: reveal whether the answer has Q. No slot.',
    price: 12,
    effects: [{ type: 'revealLetter', letter: 'q' }],
  }),
];

export const FOOD_BY_ID = new Map(FOODS.map((f) => [f.id, f]));
