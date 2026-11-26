import { describe, expect, it } from 'vitest';
import {
  normalizeLetters,
  summarizeWordList,
  wordListSentence,
  wordsRemaining,
} from '../src/core/wordcount';

const ANSWERS = ['crane', 'slate', 'brick', 'prism', 'prowl', 'civic'];

describe('Purgamanual word counter', () => {
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

  it('describes a short excluded set as a sentence', () => {
    expect(wordListSentence(128, ['c', 'a', 's']))
      .toBe('Without A, C, S there are 128 possible words');
  });

  it('uses singular grammar for one letter and one word', () => {
    expect(wordListSentence(1, ['q']))
      .toBe('Without Q there is 1 possible word');
  });

  it('handles an empty excluded set', () => {
    expect(wordListSentence(42, []))
      .toBe('With no letters ruled out there are 42 possible words');
  });

  it('reports zero results without a sample sentence', () => {
    expect(wordListSentence(0, ['c', 'b', 'a']))
      .toBe('Without A, B, C there are no possible words.');
  });

  it('summarizes long excluded sets with an ellipsis', () => {
    const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');
    expect(wordListSentence(3, letters))
      .toBe('Without A, B, C, D, E, F, G, H… there are 3 possible words');
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
