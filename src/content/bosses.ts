import { defineBoss, type BossDef } from '../core/types';

export const BOSSES: BossDef[] = [
  defineBoss({
    id: 'final-boss',
    name: 'The Final Boss',
    description: 'Three words. No intermission. The curses are the fight.',
    acts: [0],
    timerMs: null,
    gauntlet: { puzzles: 3, timerMs: 0 },
    timerFromCurse: true,
    damage: 3,
    rules: [
      'Three standard rounds, back to back.',
      'No shop or curse between rounds.',
      'Armor refills only at the start of the encounter.',
      'Your active curses are the boss mechanics.',
      'A clock, if you have one, is shared across all three rounds.',
      'Beat all three words to win the run.',
    ],
  }),
];

export const BOSS_BY_ID = new Map(BOSSES.map((boss) => [boss.id, boss]));
