import { defineBoss, type BossDef, type PresentedGuess, type ScoredGuess } from '../core/types';
import { truthCounts } from '../core/score';

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);

function standard(guess: ScoredGuess): PresentedGuess {
  return { word: guess.word, tiles: guess.truth.slice() };
}

export const BOSSES: BossDef[] = [
  defineBoss({
    id: 'editor',
    name: 'The Editor',
    description: 'Suffix. The last three tiles of every guess are covered.',
    acts: [0, 3],
    timerMs: null,
    damage: 5,
    rules: [
      'The last three tiles of every guess are covered.',
      'You still see the first two tiles.',
      'There is no clock. Every wrong guess deals 5 damage.',
    ],
    present: (_ctx, g) => ({
      word: g.word,
      tiles: g.truth.map((t, i) => (i < 2 ? t : 'hidden')),
    }),
  }),
  defineBoss({
    id: 'sleeper',
    name: 'The Sleeper',
    description: 'Asleep. Wake it with two hits in one guess and it deals 10 damage.',
    acts: [0, 3],
    timerMs: null,
    damage: 7,
    rules: [
      'The Sleeper starts asleep and does not attack.',
      'Two or more hits in one guess wake it and deal 10 damage immediately.',
      'Once awake, every wrong guess deals 7 damage.',
    ],
    initialState: { woke: 0 },
    on: {
      onGuessScored: (ctx, p) => {
        const round = ctx.state.round;
        if (!round || round.bossState.woke) return [];
        const { correct, present } = truthCounts(p.guess.truth);
        if (correct + present < 2) return [];
        return [
          { type: 'bossData', key: 'woke', value: 1 },
          { type: 'damage', amount: 10 },
          { type: 'message', text: 'The Sleeper opens one eye. The floor drops out.' },
        ];
      },
    },
  }),
  defineBoss({
    id: 'censor',
    name: 'The Censor',
    description: 'Mastermind. Drawn from the hardest answers. The first tile of every guess is covered.',
    acts: [1, 4],
    timerMs: null,
    damage: 8,
    rules: [
      'Answers are drawn from the hardest pool.',
      'The first tile of every guess is covered.',
      'There is no clock. Every wrong guess deals 8 damage.',
    ],
    answerPool: 'hard',
    present: (_ctx, g) => ({
      word: g.word,
      tiles: g.truth.map((t, i) => (i === 0 ? 'hidden' : t)),
    }),
  }),
  defineBoss({
    id: 'auditor',
    name: 'The Auditor',
    description: 'Counts only. You see how many greens and yellows, never where they are.',
    acts: [1, 4],
    timerMs: null,
    damage: 7,
    rules: [
      'No tile is ever shown in place.',
      'You only see how many letters are green and how many are yellow.',
      'There is no clock. Every wrong guess deals 7 damage.',
    ],
    present: (_ctx, g) => ({
      word: g.word,
      tiles: g.truth.map(() => 'hidden'),
      counts: truthCounts(g.truth),
    }),
  }),
  defineBoss({
    id: 'vowel-fog',
    name: 'Vowel Fog',
    description: 'Vowels are clear-coloured: you know they are present, not whether they are green or yellow.',
    acts: [1, 4],
    timerMs: null,
    damage: 6,
    rules: [
      'A present vowel is shown as a clear hit, never green or yellow.',
      'You know the vowel is in the answer, not where.',
      'Consonants score normally. Every wrong guess deals 6 damage.',
    ],
    present: (_ctx, g) => ({
      word: g.word,
      tiles: g.truth.map((t, i) =>
        VOWELS.has(g.word[i]) && (t === 'correct' || t === 'present') ? 'hit' : t,
      ),
    }),
  }),
  defineBoss({
    id: 'monochrome',
    name: 'Monochrome',
    description: 'Every present tile is the same colour. You know the letters, not the positions.',
    acts: [2, 3],
    timerMs: null,
    damage: 9,
    rules: [
      'Every present tile is shown as the same colour.',
      'You know the letter is in the answer, not whether it is in place.',
      'There is no clock. Every wrong guess deals 9 damage.',
    ],
    present: (_ctx, g) => ({
      word: g.word,
      tiles: g.truth.map((t) => (t === 'correct' || t === 'present' ? 'hit' : t)),
    }),
  }),
  defineBoss({
    id: 'gauntlet',
    name: 'The Gauntlet',
    description: 'Three puzzles. One shared 150-second clock. No damage per guess.',
    acts: [2, 4],
    timerMs: 150_000,
    gauntlet: { puzzles: 3, timerMs: 150_000 },
    noGuessDamage: true,
    damage: 0,
    rules: [
      'Three puzzles, solved one after another.',
      'One shared 150-second clock keeps running between puzzles.',
      'Wrong guesses do not deal damage, but the clock does.',
      'If you die, all three answers are revealed.',
    ],
  }),
];

export const BOSS_BY_ID = new Map(BOSSES.map((b) => [b.id, b]));
export { standard };

