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
    description: '+10s this round. No slot.',
    price: 3,
    effects: [{ type: 'addTime', ms: 10_000 }],
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
];

export const FOOD_BY_ID = new Map(FOODS.map((f) => [f.id, f]));
