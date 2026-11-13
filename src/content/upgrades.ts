import { defineUpgrade, type UpgradeDef } from '../core/types';

export const UPGRADES: UpgradeDef[] = [
  defineUpgrade({
    id: 'vitality',
    name: 'Vitality',
    description: '+5 max HP, heal 5.',
    price: 8,
    effects: [
      { type: 'maxHp', delta: 5 },
      { type: 'heal', amount: 5 },
    ],
  }),
  defineUpgrade({
    id: 'plating',
    name: 'Plating',
    description: '+3 max armor.',
    price: 10,
    effects: [{ type: 'maxArmor', delta: 3 }],
  }),
  defineUpgrade({
    id: 'chronos',
    name: 'Chronos',
    description: '+10s per round.',
    price: 8,
    effects: [{ type: 'timeBonus', ms: 10_000 }],
  }),
  defineUpgrade({
    id: 'satchel',
    name: 'Satchel',
    description: '+1 slot.',
    price: 12,
    effects: [{ type: 'slots', delta: 1 }],
  }),
  defineUpgrade({
    id: 'bounty',
    name: 'Bounty',
    description: '+2 gold per solve.',
    price: 9,
    effects: [{ type: 'solveGold', amount: 2 }],
  }),
];

export const UPGRADE_BY_ID = new Map(UPGRADES.map((u) => [u.id, u]));
