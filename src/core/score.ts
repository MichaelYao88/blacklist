import type { PresentedGuess, ScoredGuess, TileShown, TileTruth } from './types';

/** Standard Wordle scoring, including duplicate-letter accounting. */
export function scoreGuess(answer: string, guess: string): TileTruth[] {
  const length = answer.length;
  const result: TileTruth[] = Array.from({ length }, () => 'absent');
  const remaining: Record<string, number> = {};

  for (let i = 0; i < length; i++) {
    const a = answer[i];
    if (guess[i] === a) {
      result[i] = 'correct';
    } else {
      remaining[a] = (remaining[a] ?? 0) + 1;
    }
  }

  for (let i = 0; i < length; i++) {
    if (result[i] === 'correct') continue;
    const g = guess[i];
    const count = remaining[g] ?? 0;
    if (count > 0) {
      result[i] = 'present';
      remaining[g] = count - 1;
    }
  }

  return result;
}

export function truthCounts(truth: readonly TileTruth[]): { correct: number; present: number } {
  let correct = 0;
  let present = 0;
  for (const t of truth) {
    if (t === 'correct') correct++;
    else if (t === 'present') present++;
  }
  return { correct, present };
}

export function isAllAbsent(truth: readonly TileTruth[]): boolean {
  return truth.every((t) => t === 'absent');
}

export function sharedLetters(a: string, b: string): number {
  const set = new Set(a.split(''));
  let count = 0;
  for (const ch of new Set(b.split(''))) {
    if (set.has(ch)) count++;
  }
  return count;
}

export function presentTruth(guess: ScoredGuess): PresentedGuess {
  return { word: guess.word, tiles: guess.truth.slice() as TileShown[] };
}
