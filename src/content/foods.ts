import { defineFood, type FoodDef } from '../core/types';

export const FOODS: FoodDef[] = [
  defineFood({
    id: 'snack',
    name: 'Snack',
    description: 'Heal 8 HP. No slot.',
    price: 3,
    effects: [{ type: 'heal', amount: 8 }],
  }),
  defineFood({
    id: 'feast',
    name: 'Feast',
    description: '+5 max HP and heal 5. No slot.',
    price: 5,
    effects: [
      { type: 'maxHp', delta: 5 },
      { type: 'heal', amount: 5 },
    ],
  }),
  defineFood({
    id: 'candy',
    name: 'Candy',
    description: 'Gain a random spell. No slot.',
    price: 4,
    effects: [{ type: 'giveSpell', spell: 'random' }],
  }),
  defineFood({
    id: 'coffee',
    name: 'Coffee',
    description: 'Gain 10 seconds on the current round. No slot.',
    price: 3,
    effects: [{ type: 'addTime', ms: 10_000 }],
  }),
  defineFood({
    id: 'mystery-stew',
    name: 'Mystery Stew',
    description: 'Gain two random spells. No slot.',
    price: 8,
    effects: [
      { type: 'giveSpell', spell: 'random' },
      { type: 'giveSpell', spell: 'random' },
    ],
  }),
];

export const FOOD_BY_ID = new Map(FOODS.map((f) => [f.id, f]));
