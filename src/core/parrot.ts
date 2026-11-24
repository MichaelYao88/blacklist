import type { TileShown } from './types';

export interface ParrotClue {
  word: string;
  tiles: readonly TileShown[];
}

export interface ParrotKnowledge {
  /** Visible rows, including greens, yellows, silvers and hidden tiles. */
  clues: readonly ParrotClue[];
  /** Letter hints revealed outside a guess, such as Omen or letter foods. */
  presentHints: readonly string[];
  absentHints: readonly string[];
  purged: readonly string[];
  /** Words the player cannot guess again, including previous guesses. */
  excluded: readonly string[];
}

const WORD_LENGTH = 5;

/**
 * Filter the answer list using only information the player can see.
 *
 * - green: fixed position and at least that many copies
 * - yellow / silver: the letter is present, but not at that position
 * - gray: the letter is absent, except for extra copies of a colored letter
 * - hidden: ignored entirely
 *
 * Min/max letter counts preserve duplicate-letter knowledge from rows such as
 * one green + one gray of the same letter.
 */
export function possibleWords(
  answers: readonly string[],
  knowledge: ParrotKnowledge,
): string[] {
  const fixed: Array<string | null> = Array.from({ length: WORD_LENGTH }, () => null);
  const notAt: Array<Set<string>> = Array.from({ length: WORD_LENGTH }, () => new Set());
  const min: Record<string, number> = {};
  const max: Record<string, number> = {};

  for (const clue of knowledge.clues) {
    const green = new Map<string, number>();
    const yellow = new Map<string, number>();
    const absent = new Map<string, number>();
    const hidden = new Map<string, number>();

    clue.tiles.forEach((tile, index) => {
      const letter = clue.word[index];
      if (!letter) return;
      if (tile === 'correct') {
        fixed[index] = letter;
        green.set(letter, (green.get(letter) ?? 0) + 1);
      } else if (tile === 'present' || tile === 'hit') {
        notAt[index].add(letter);
        yellow.set(letter, (yellow.get(letter) ?? 0) + 1);
      } else if (tile === 'absent') {
        absent.set(letter, (absent.get(letter) ?? 0) + 1);
      } else {
        hidden.set(letter, (hidden.get(letter) ?? 0) + 1);
      }
    });

    const letters = new Set([
      ...green.keys(),
      ...yellow.keys(),
      ...absent.keys(),
      ...hidden.keys(),
    ]);
    for (const letter of letters) {
      const colored = (green.get(letter) ?? 0) + (yellow.get(letter) ?? 0);
      if (colored > 0) {
        min[letter] = Math.max(min[letter] ?? 0, colored);
      }
      if ((absent.get(letter) ?? 0) > 0 && (hidden.get(letter) ?? 0) === 0) {
        max[letter] = Math.min(max[letter] ?? WORD_LENGTH, colored);
      }
    }
  }

  for (const letter of knowledge.presentHints) {
    min[letter] = Math.max(min[letter] ?? 0, 1);
  }
  for (const letter of knowledge.absentHints) {
    if (!min[letter]) max[letter] = 0;
  }
  for (const letter of knowledge.purged) {
    max[letter] = 0;
  }

  const excluded = new Set(knowledge.excluded);
  return answers.filter((word) => {
    if (word.length !== WORD_LENGTH || excluded.has(word)) return false;
    for (const letter of knowledge.purged) {
      if (word.includes(letter)) return false;
    }
    for (let index = 0; index < WORD_LENGTH; index++) {
      const letter = word[index];
      if (fixed[index] && letter !== fixed[index]) return false;
      // A later green overrides an earlier yellow in the same column.
      if (!fixed[index] && notAt[index].has(letter)) return false;
    }
    const counts: Record<string, number> = {};
    for (const letter of word) counts[letter] = (counts[letter] ?? 0) + 1;
    for (const [letter, required] of Object.entries(min)) {
      if ((counts[letter] ?? 0) < required) return false;
    }
    for (const [letter, allowed] of Object.entries(max)) {
      if ((counts[letter] ?? 0) > allowed) return false;
    }
    return true;
  });
}

/**
 * The parrot lies when there is a choice. When only one possible word remains,
 * that is the suggestion.
 */
export function chooseParrotWord(
  candidates: readonly string[],
  answer: string,
  pick: (items: readonly string[]) => string,
): string | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  const wrong = candidates.filter((word) => word !== answer);
  return pick(wrong.length > 0 ? wrong : candidates);
}
