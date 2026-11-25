import { defineBoss, type BossDef } from '../core/types';

export const BOSSES: BossDef[] = [
  defineBoss({
    id: 'miniboss',
    name: 'Miniboss',
    description: 'Two words. One extra curse. A reward worth taking.',
    acts: [0],
    timerMs: null,
    gauntlet: { puzzles: 2, timerMs: 0 },
    prepCurses: 1,
    damageBonus: 5,
    timerFromCurse: true,
    rules: [
      'Draft 1 curse before the fight.',
      'Two words, back to back.',
      'Base damage is 5 higher than a normal encounter.',
      'No shop or curse between words.',
      'Armor refills only at the start of the encounter.',
      'Beat both words to gain an item slot and a full heal, then choose one reward.',
    ],
  }),
  defineBoss({
    id: 'floor-boss',
    name: 'Floor Boss',
    description: 'Three words. The curses are the fight.',
    acts: [0],
    timerMs: null,
    gauntlet: { puzzles: 3, timerMs: 0 },
    prepCurses: 0,
    damageBonus: 10,
    timerFromCurse: true,
    rules: [
      'Floor 38 holds the final three curse drafts.',
      'Three standard rounds, back to back.',
      'Base damage is 10 higher than a normal encounter.',
      'No shop or curse between rounds.',
      'Armor refills only at the start of the encounter.',
      'Your active curses are the boss mechanics.',
      'A clock, if you have one, is shared across all three rounds.',
      'Beat all three words to reach the Mysterious Room.',
    ],
  }),
];

export const BOSS_BY_ID = new Map(BOSSES.map((boss) => [boss.id, boss]));
