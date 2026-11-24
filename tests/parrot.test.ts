import { describe, expect, it } from 'vitest';
import { chooseParrotWord, possibleWords } from '../src/core/parrot';
import { ITEM_BY_ID } from '../src/content';
import { glossaryText } from '../src/ui/glossary';
import { parrotLine, parrotStupidLine } from '../src/ui/format';

const empty = {
  presentHints: [],
  absentHints: [],
  purged: [],
  excluded: [],
};

describe('Evil Parrot word filter', () => {
  it('uses green positions and yellow letters', () => {
    const answers = ['chirp', 'curry', 'civic'];
    const candidates = possibleWords(answers, {
      ...empty,
      clues: [{
        word: 'crane',
        tiles: ['correct', 'present', 'absent', 'absent', 'absent'],
      }],
    });
    expect(candidates).toEqual(['chirp', 'curry']);
  });

  it('learns duplicate-letter limits from one green and one gray copy', () => {
    const answers = ['eerie', 'elite', 'eagle', 'elbow', 'elfin', 'eclat'];
    const candidates = possibleWords(answers, {
      ...empty,
      clues: [{
        word: 'eagle',
        tiles: ['correct', 'absent', 'absent', 'present', 'absent'],
      }],
    });
    expect(candidates).toEqual(['elbow', 'elfin']);
  });

  it('ignores hidden tiles instead of treating them as absent', () => {
    const answers = ['chirp', 'civic'];
    const candidates = possibleWords(answers, {
      ...empty,
      clues: [{
        word: 'crane',
        tiles: ['hidden', 'present', 'absent', 'absent', 'absent'],
      }],
    });
    expect(candidates).toEqual(['chirp']);
  });

  it('treats silver hit tiles as yellow', () => {
    const answers = ['chirp', 'prowl'];
    const candidates = possibleWords(answers, {
      ...empty,
      clues: [{
        word: 'brave',
        tiles: ['absent', 'hit', 'absent', 'absent', 'absent'],
      }],
    });
    expect(candidates).toEqual(['chirp']);
  });

  it('heeds revealed letters, purges and excluded words', () => {
    const answers = ['crane', 'slate', 'brick', 'prism'];
    const candidates = possibleWords(answers, {
      presentHints: ['r'],
      absentHints: ['c'],
      purged: ['b'],
      excluded: ['prism'],
      clues: [],
    });
    expect(candidates).toEqual([]);
  });

  it('explains possible words in the item description', () => {
    const html = glossaryText(ITEM_BY_ID.get('evil-parrot')?.description ?? '');
    expect(html).toContain('data-tip');
    expect(html).toContain('will not be the answer word');
  });

  it('alternates between try and squawk in the popup', () => {
    expect(parrotLine('crane', 0.1)).toBe('try CRANE');
    expect(parrotLine('crane', 0.9)).toBe('squawk CRANE squawk');
    expect(parrotStupidLine('crane')).toBe('try CRANE (stupid cracker)');
  });

  it('picks the farthest word below 70 candidates and tells the truth when one remains', () => {
    const first = (items: readonly string[]) => items[0];
    expect(chooseParrotWord(['crane', 'crate', 'slate'], 'crane', first)).toBe('slate');
    expect(chooseParrotWord(['crane', 'crate', 'blimp'], 'crane', first)).toBe('blimp');
    expect(chooseParrotWord(['crane', 'crate'], 'crane', first)).toBe('crate');
    expect(chooseParrotWord(['crane'], 'crane', first)).toBe('crane');
    expect(chooseParrotWord([], 'crane', first)).toBeNull();
  });

  it('uses fewer greens to break a shared-letter tie', () => {
    const first = (items: readonly string[]) => items[0];
    expect(chooseParrotWord(['crane', 'crate', 'enact'], 'crane', first)).toBe('enact');
  });

  it('randomizes once 70 or more candidates remain', () => {
    const answer = 'crane';
    const candidates = [
      answer,
      ...Array.from({ length: 69 }, (_, index) => `w${String(index).padStart(4, '0')}`),
    ];
    let pool: readonly string[] = [];
    const result = chooseParrotWord(candidates, answer, (items) => {
      pool = items;
      return items[items.length - 1];
    });
    expect(candidates).toHaveLength(70);
    expect(pool).toHaveLength(69);
    expect(result).toBe(pool[pool.length - 1]);
  });
});
