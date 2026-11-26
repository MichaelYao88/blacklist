import { describe, expect, it } from 'vitest';
import {
  normalizeLetters,
  summarizeWordList,
  wordsRemaining,
} from '../src/core/wordcount';

const ANSWERS = ['crane', 'slate', 'brick', 'prism', 'prowl', 'civic'];

describe('The List word counter', () => {
  it('normalizes, dedupes, lowercases and sorts excluded letters', () => {
    expect(normalizeLetters(['C', 'a', 'c', 'B', '1', ' b '])).toEqual(['a', 'b', 'c']);
  });

  it('counts only words that avoid every excluded letter', () => {
    expect(wordsRemaining(ANSWERS, ['c'])).toEqual(['slate', 'prism', 'prowl']);
    expect(wordsRemaining(ANSWERS, ['c', 'r'])).toEqual(['slate']);
    expect(summarizeWordList(ANSWERS, ['c', 'r']).count).toBe(1);
  });

  it('ignores positions and duplicate letters in the excluded set', () => {
    expect(summarizeWordList(ANSWERS, ['C', 'c']).count).toBe(3);
  });

  it('returns no sample when every word is ruled out', () => {
    const letters = normalizeLetters(['c', 'r', 'a', 'n', 'e', 's', 'l', 't', 'b', 'i', 'k', 'p', 'm', 'o', 'w', 'v']);
    const summary = summarizeWordList(ANSWERS, letters);
    expect(summary.count).toBe(0);
    expect(summary.sample).toBeNull();
  });

  it('picks a stable sample regardless of excluded order', () => {
    const first = summarizeWordList(ANSWERS, ['r', 'c']);
    const second = summarizeWordList(ANSWERS, ['C', 'R']);
    expect(first.sample).toBe(second.sample);
    expect(first.sample).not.toBeNull();
    expect(wordsRemaining(ANSWERS, ['r', 'c'])).toContain(first.sample);
  });

  it('uses the full answer list without being empty', () => {
    const summary = summarizeWordList(
      ['aback', 'abase', 'abate'],
      ['z', 'z'],
    );
    expect(summary.count).toBe(3);
    expect(summary.sample).toBeTruthy();
  });
});
