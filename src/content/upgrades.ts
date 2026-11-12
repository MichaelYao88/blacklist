import { defineUpgrade, type UpgradeDef } from '../core/types';

export const UPGRADES: UpgradeDef[] = [
  defineUpgrade({
    id: 'vitality',
    name: 'Vitality',
    description: '+5 max HP, and heal 5.',
    price: 8,
    effects: [
      { type: 'maxHp', delta: 5 },
      { type: 'heal', amount: 5 },
    ],
  }),
  defineUpgrade({
    id: 'plating',
    name: 'Plating',
    description: '+1 armor charge. Refills every round.',
    price: 10,
    effects: [{ type: 'maxArmor', delta: 1 }],
  }),
  defineUpgrade({
    id: 'chronos',
    name: 'Chronos',
    description: '+10 seconds on every future round.',
    price: 8,
    effects: [{ type: 'timeBonus', ms: 10_000 }],
  }),
  defineUpgrade({
    id: 'satchel',
    name: 'Satchel',
    description: '+1 item slot.',
    price: 12,
    effects: [{ type: 'slots', delta: 1 }],
  }),
  defineUpgrade({
    id: 'ledger',
    name: 'Ledger',
    description: '+2 blacklist capacity.',
    price: 6,
    effects: [{ type: 'blacklistCapacity', delta: 2 }],
  }),
];

export const UPGRADE_BY_ID = new Map(UPGRADES.map((u) => [u.id, u]));
