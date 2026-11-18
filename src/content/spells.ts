import { defineSpell, type SpellDef } from '../core/types';

export const SPELLS: SpellDef[] = [
  defineSpell({
    id: 'time-freeze',
    name: 'Time Freeze',
    description: 'The next guess is free. Freeze any timers until you make the guess.',
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
    description: 'Heal half of your max HP.',
    price: 6,
    usable: 'any',
    cast: ({ state }) => [{ type: 'heal', amount: Math.ceil(state.maxHp / 2) }],
  }),
  defineSpell({
    id: 'restore',
    name: 'Restore',
    description: 'Refill armor and clear the blacklist.',
    price: 6,
    usable: 'any',
    cast: () => [{ type: 'clearBlacklist' }, { type: 'refillArmor' }],
  }),
  defineSpell({
    id: 'immunity',
    name: 'Immunity',
    description: 'The next hurting guess and any guess for 4 seconds after deal no damage.',
    price: 7,
    usable: 'round',
    cast: () => [{ type: 'immunity', guesses: 1 }],
  }),
  defineSpell({
    id: 'phone-friend',
    name: 'Phone a Friend',
    description: 'He says a one- or two-word catchphrase.',
    price: 8,
    usable: 'round',
    cast: () => [
      { type: 'addTime', ms: 5_000 },
      { type: 'friendGuesses', count: 2 },
    ],
  }),
];

export const SPELL_BY_ID = new Map(SPELLS.map((s) => [s.id, s]));
