import { defineBoss, type BossDef } from '../core/types';

export const BOSSES: BossDef[] = [
  defineBoss({
    id: 'floor-boss',
    name: 'Floor Boss',
    description: 'Three revives. Four words. The curses are the fight.',
    acts: [0],
    timerMs: null,
    gauntlet: { puzzles: 4, timerMs: 0 },
    revives: 3,
    timerFromCurse: true,
    damage: 3,
    rules: [
      'Choose 3 curses before the fight.',
      'The Floor Boss revives after each solved word, three times.',
      'Four standard rounds, back to back.',
      'No shop or curse between rounds.',
      'Armor refills only at the start of the encounter.',
      'Your active curses are the boss mechanics.',
      'A clock, if you have one, is shared across all four rounds.',
      'Beat all four words to win the run.',
    ],
  }),
];

export const BOSS_BY_ID = new Map(BOSSES.map((boss) => [boss.id, boss]));
