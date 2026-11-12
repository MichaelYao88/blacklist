import { defineSpell, type SpellDef } from '../core/types';

export const SPELLS: SpellDef[] = [
  defineSpell({
    id: 'time-freeze',
    name: 'Time Freeze',
    description: 'The timer stops until your next guess.',
    price: 7,
    usable: 'round',
    cast: () => [{ type: 'freezeUntilGuess' }],
  }),
  defineSpell({
    id: 'omen',
    name: 'Omen',
    description: 'Reveal one yellow letter in the answer.',
    price: 5,
    usable: 'round',
    cast: () => [{ type: 'revealYellow' }],
  }),
  defineSpell({
    id: 'heal',
    name: 'Heal',
    description: 'Heal half of your missing HP.',
    price: 6,
    usable: 'any',
    cast: ({ state }) => [{ type: 'heal', amount: Math.ceil((state.maxHp - state.hp) / 2) }],
  }),
  defineSpell({
    id: 'restore',
    name: 'Restore',
    description: 'Wipe the blacklist.',
    price: 6,
    usable: 'any',
    cast: () => [{ type: 'clearBlacklist' }],
  }),
  defineSpell({
    id: 'immunity',
    name: 'Immunity',
    description: 'The next guess that would hurt you deals no damage.',
    price: 7,
    usable: 'round',
    cast: () => [{ type: 'immunity', guesses: 1 }],
  }),
  defineSpell({
    id: 'phone-friend',
    name: 'Phone a Friend',
    description: 'Two free guesses from a friend with terrible taste. Timer freezes for 20s.',
    price: 8,
    usable: 'round',
    cast: () => [
      { type: 'friendGuesses', count: 2 },
      { type: 'freezeTime', ms: 20_000 },
    ],
  }),
  defineSpell({
    id: 'time-warp',
    name: 'Time Warp',
    description: 'Add 30 seconds to the current round.',
    price: 5,
    usable: 'round',
    cast: () => [{ type: 'addTime', ms: 30_000 }],
  }),
];

export const SPELL_BY_ID = new Map(SPELLS.map((s) => [s.id, s]));
