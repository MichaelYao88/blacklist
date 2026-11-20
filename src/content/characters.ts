import { defineCharacter, type CharacterDef } from '../core/types';

export const CHARACTERS: CharacterDef[] = [
  defineCharacter({
    id: 'runner',
    name: 'The Runner',
    description: 'The original listwalker. A balanced start with no extra baggage.',
    maxHp: 16,
    armor: 4,
    items: [],
    curses: [],
    sprite: 'runner',
  }),
  defineCharacter({
    id: 'maze-runner',
    name: 'The Maze Runner',
    description: 'Fast off the line, but The List is already writing.',
    maxHp: 14,
    armor: 2,
    items: ['head-start'],
    curses: ['the-list'],
    sprite: 'maze',
    unlockHint: 'Take your first curse with The Runner.',
  }),
  defineCharacter({
    id: 'necromancer',
    name: 'The Necromancer',
    description: 'A deep health pool, brittle armor, and a book that keeps taking.',
    maxHp: 40,
    armor: 2,
    items: ['necronomicon'],
    curses: ['weak-plate'],
    sprite: 'necromancer',
    unlockHint: 'Take your first curse with The Maze Runner.',
  }),
  defineCharacter({
    id: 'farmer',
    name: 'The Farmer',
    description: 'No armor, a harvest charm, and a stubborn twenty hit points.',
    maxHp: 20,
    armor: 0,
    items: ['harvest-charm'],
    curses: [],
    sprite: 'farmer',
    unlockHint: 'Reach a curse screen with The Necromancer.',
  }),
];

export const CHARACTER_BY_ID = new Map(CHARACTERS.map((character) => [character.id, character]));
