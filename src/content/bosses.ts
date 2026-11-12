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
  }),
];

export const BOSS_BY_ID = new Map(BOSSES.map((b) => [b.id, b]));
export { standard };

