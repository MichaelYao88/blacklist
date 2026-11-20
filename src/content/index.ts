import type { Content } from '../core/types';
import answers from '../data/answers.json';
import validWords from '../data/valid.json';
import hardAnswers from '../data/hard.json';
import nonnativeWords from '../data/nonnative.json';
import { FRIEND_PHRASES, FRIEND_WORDS } from '../data/friends';
import { ITEMS, ITEM_BY_ID } from './items';
import { SPELLS, SPELL_BY_ID } from './spells';
import { BOSSES, BOSS_BY_ID } from './bosses';
import { CURSES, CURSE_BY_ID } from './curses';
import { FOODS, FOOD_BY_ID } from './foods';
import { HAPPENINGS, HAPPENING_BY_ID } from './happenings';
import { CHARACTERS, CHARACTER_BY_ID } from './characters';

export const CONTENT: Content = {
  items: ITEMS,
  spells: SPELLS,
  bosses: BOSSES,
  curses: CURSES,
  foods: FOODS,
  happenings: HAPPENINGS,
  characters: CHARACTERS,
  answers,
  valid: new Set(validWords as string[]),
  hardAnswers,
  nonnative: nonnativeWords,
  friendWords: FRIEND_WORDS,
  friendPhrases: FRIEND_PHRASES,
};

export {
  ITEMS,
  ITEM_BY_ID,
  SPELLS,
  SPELL_BY_ID,
  BOSSES,
  BOSS_BY_ID,
  CURSES,
  CURSE_BY_ID,
  FOODS,
  FOOD_BY_ID,
  HAPPENINGS,
  HAPPENING_BY_ID,
  CHARACTERS,
  CHARACTER_BY_ID,
};
