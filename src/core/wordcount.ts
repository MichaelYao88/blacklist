/**
 * Purgamanual glossary helper.
 *
 * This is display-only math: it counts answer words that avoid a set of
 * excluded letters and picks one deterministic sample. It never touches
 * run state and only uses letters, not positions or guess history.
 */

export interface WordListSummary {
  /** Distinct lowercase excluded letters, sorted. */
  excluded: string[];
  /** Answer words that contain none of the excluded letters. */
  count: number;
  /** A stable example word, or null when nothing remains. */
  sample: string | null;
}

/** Flatten input into distinct lowercase a-z letters, sorted. */
export function normalizeLetters(letters: readonly string[]): string[] {
  const found = new Set<string>();
  for (const raw of letters) {
    for (const char of String(raw).toLowerCase()) {
      if (char >= 'a' && char <= 'z') found.add(char);
    }
  }
  return [...found].sort();
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Every answer word that contains none of the excluded letters. */
export function wordsRemaining(
  answers: readonly string[],
  excluded: readonly string[],
): string[] {
  const blocked = new Set(normalizeLetters(excluded));
  return answers.filter((word) => {
    for (const letter of word) {
      if (blocked.has(letter)) return false;
    }
    return true;
  });
}

/** Count plus a deterministic sample chosen from the excluded-letter set. */
export function summarizeWordList(
  answers: readonly string[],
  excluded: readonly string[],
): WordListSummary {
  const normalized = normalizeLetters(excluded);
  const blocked = new Set(normalized);
  const words: string[] = [];
  for (const word of answers) {
    let allowed = true;
    for (const letter of word) {
      if (blocked.has(letter)) {
        allowed = false;
        break;
      }
    }
    if (allowed) words.push(word);
  }
  const sample = words.length > 0
    ? words[stableHash(normalized.join('')) % words.length]
    : null;
  return { excluded: normalized, count: words.length, sample };
}


const MAX_LISTED_LETTERS = 8;

/** A player-facing sentence describing the count and the ruled-out letters. */
export function wordListSentence(
  count: number,
  excluded: readonly string[],
): string {
  const letters = normalizeLetters(excluded).map((letter) => letter.toUpperCase());
  const noun = count === 1 ? 'word' : 'words';
  const amount = count === 0 ? 'no' : String(count);
  const verb = count === 1 ? 'is' : 'are';
  const tail = `there ${verb} ${amount} possible ${noun}`;
  if (letters.length === 0) {
    return `With no letters ruled out ${tail}`;
  }
  const shown = letters.length > MAX_LISTED_LETTERS
    ? `${letters.slice(0, MAX_LISTED_LETTERS).join(', ')}…`
    : letters.join(', ');
  const sentence = `Without ${shown} ${tail}`;
  return count === 0 ? `${sentence}.` : sentence;
}

/** Convenience wrapper for callers that only need the count. */
export function countWords(
  answers: readonly string[],
  excluded: readonly string[],
): number {
  return summarizeWordList(answers, excluded).count;
}

/** Convenience wrapper for callers that only need the stable sample. */
export function sampleWord(
  answers: readonly string[],
  excluded: readonly string[],
): string | null {
  return summarizeWordList(answers, excluded).sample;
}
