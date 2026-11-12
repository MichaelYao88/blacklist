import type { Content } from '../core/types';
import answers from '../data/answers.json';
import validWords from '../data/valid.json';
import hardAnswers from '../data/hard.json';
import { FRIEND_WORDS } from '../data/friends';
import { ITEMS, ITEM_BY_ID } from './items';
import { SPELLS, SPELL_BY_ID } from './spells';
import { BOSSES, BOSS_BY_ID } from './bosses';
import { UPGRADES, UPGRADE_BY_ID } from './upgrades';
import { FOODS, FOOD_BY_ID } from './foods';
import { HAPPENINGS, HAPPENING_BY_ID } from './happenings';

export const CONTENT: Content = {
  items: ITEMS,
  spells: SPELLS,
  bosses: BOSSES,
  upgrades: UPGRADES,
  foods: FOODS,
  happenings: HAPPENINGS,
  answers,
  valid: new Set(validWords as string[]),
  hardAnswers,
  friendWords: FRIEND_WORDS,
};

export {
  ITEMS,
  ITEM_BY_ID,
  SPELLS,
  SPELL_BY_ID,
  BOSSES,
  BOSS_BY_ID,
  UPGRADES,
  UPGRADE_BY_ID,
  FOODS,
  FOOD_BY_ID,
  HAPPENINGS,
  HAPPENING_BY_ID,
};
