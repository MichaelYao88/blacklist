// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { readMeta, recordRun, recordStart, unlockCharacter } from '../src/ui/store';

const stats = (overrides: Partial<Parameters<typeof recordRun>[0]['stats']> = {}) => ({
  rounds: 10,
  guesses: 40,
  goldEarned: 30,
  bosses: 0,
  timeouts: 1,
  damageTaken: 12,
  solves: 9,
  solveMs: 180_000,
  playMs: 300_000,
  ...overrides,
});

beforeEach(() => {
  localStorage.clear();
});

describe('run history store', () => {
  it('starts with only The Runner and unlocks a character once', () => {
    expect(readMeta().characters).toEqual(['runner']);
    expect(unlockCharacter('maze-runner')).toBe(true);
    expect(unlockCharacter('maze-runner')).toBe(false);
    expect(readMeta().characters).toEqual(['runner', 'maze-runner']);
  });

  it('records runs, totals, favorites and unlocks the next ascension on a win', () => {
    recordStart();
    recordRun({
      result: 'victory',
      level: 50,
      act: 4,
      ascension: 0,
      curses: ['clock', 'censor'],
      items: ['hourglass', 'tally-lens', 'bloom'],
      equippedItems: ['hourglass', 'tally-lens'],
      stats: stats(),
    });
    recordStart();
    recordRun({
      result: 'defeat',
      level: 22,
      act: 2,
      ascension: 1,
      curses: ['clock'],
      items: ['hourglass'],
      equippedItems: ['hourglass'],
      stats: stats({ rounds: 5, guesses: 20, solves: 4, solveMs: 80_000, playMs: 120_000 }),
    });

    const meta = readMeta();
    expect(meta.runs).toBe(2);
    expect(meta.wins).toBe(1);
    expect(meta.ascension).toBe(1);
    expect(meta.bestLevel).toBe(50);
    expect(meta.itemCounts).toEqual({ hourglass: 2, 'tally-lens': 1 });
    expect(meta.curseCounts).toEqual({ clock: 2, censor: 1 });
    expect(meta.totalRounds).toBe(15);
    expect(meta.totalSolves).toBe(13);
    expect(meta.totalSolveMs).toBe(260_000);
    expect(meta.totalPlayMs).toBe(420_000);
    expect(meta.history).toHaveLength(2);
    expect(meta.history[0].result).toBe('defeat');
    expect(meta.history[1].result).toBe('victory');
    expect(meta.history[1].curses).toEqual(['clock', 'censor']);
    expect(meta.history[1].equippedItems).toEqual(['hourglass', 'tally-lens']);
  });

  it('keeps only the newest 50 runs', () => {
    for (let index = 0; index < 55; index++) {
      recordStart();
      recordRun({
        result: 'defeat',
        level: index + 1,
        act: 0,
        ascension: 0,
        curses: [],
        items: [],
        equippedItems: [],
        stats: stats(),
      });
    }
    const meta = readMeta();
    expect(meta.runs).toBe(55);
    expect(meta.history).toHaveLength(50);
    expect(meta.history[0].level).toBe(55);
  });

  it('backfills equipped items for old history rows', () => {
    localStorage.setItem(
      'blacklist.meta.v1',
      JSON.stringify({
        history: [{
          at: 1,
          result: 'defeat',
          level: 4,
          act: 0,
          curses: [],
          items: ['hourglass'],
          goldEarned: 1,
          damageTaken: 1,
          rounds: 1,
          guesses: 1,
          solves: 0,
          solveMs: 0,
          playMs: 1000,
        }],
      }),
    );
    expect(readMeta().history[0].equippedItems).toEqual(['hourglass']);
  });

  it('migrates legacy meta without history or level tracking', () => {
    localStorage.setItem(
      'blacklist.meta.v1',
      JSON.stringify({ runs: 4, wins: 1, bestAct: 3, ascension: 1 }),
    );
    const meta = readMeta();
    expect(meta.bestLevel).toBe(30);
    expect(meta.history).toEqual([]);
    expect(meta.itemCounts).toEqual({});
    expect(meta.curseCounts).toEqual({});
    expect(meta.characters).toEqual(['runner']);
    expect(meta.totalSolves).toBe(0);
  });

  it('survives corrupt meta', () => {
    localStorage.setItem('blacklist.meta.v1', '{not json');
    const meta = readMeta();
    expect(meta.runs).toBe(0);
    expect(meta.history).toEqual([]);
  });
});
