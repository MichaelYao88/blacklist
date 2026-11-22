// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { readMeta, recordFood, recordPurchase, recordRun, recordStart, unlockCharacter } from '../src/ui/store';

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
  it('starts with only The Soldier and unlocks a character once', () => {
    expect(readMeta().characters).toEqual(['runner']);
    expect(unlockCharacter('pathfinder')).toBe(true);
    expect(unlockCharacter('pathfinder')).toBe(false);
    expect(readMeta().characters).toEqual(['runner', 'pathfinder']);
  });

  it('counts shop purchases across runs', () => {
    expect(readMeta().purchases).toEqual({});
    expect(recordPurchase('double-cheeseburger')).toBe(1);
    expect(recordPurchase('double-cheeseburger')).toBe(2);
    expect(recordPurchase('inkcap')).toBe(1);
    expect(readMeta().purchases).toEqual({
      'double-cheeseburger': 2,
      inkcap: 1,
    });
  });

  it('counts foods eaten across runs', () => {
    expect(readMeta().foodCounts).toEqual({});
    expect(recordFood('double-cheeseburger')).toBe(1);
    expect(recordFood('double-cheeseburger')).toBe(2);
    expect(recordFood('inkcap')).toBe(1);
    expect(readMeta().foodCounts).toEqual({
      'double-cheeseburger': 2,
      inkcap: 1,
    });
  });

  it('migrates Maze Runner to Pathfinder and keeps purchase counts', () => {
    localStorage.setItem(
      'blacklist.meta.v1',
      JSON.stringify({
        characters: ['maze-runner', 'necromancer'],
        purchases: { 'poppy-seeds': 3, bogus: 'nope' },
      }),
    );
    const meta = readMeta();
    expect(meta.characters).toEqual(['runner', 'pathfinder', 'necromancer']);
    expect(meta.purchases).toEqual({ 'poppy-seeds': 3 });
    expect(meta.foodCounts).toEqual({ 'poppy-seeds': 3 });
  });

  it('records runs, totals, favorites and unlocks the next ascension on a win', () => {
    recordStart();
    recordRun({
      result: 'victory',
      level: 50,
      act: 4,
      ascension: 0,
      character: 'runner',
      curses: ['clock', 'censor'],
      items: ['piggy-bank', 'tally-lens', 'bloom'],
      equippedItems: ['piggy-bank', 'tally-lens'],
      stats: stats(),
    });
    recordStart();
    recordRun({
      result: 'defeat',
      level: 22,
      act: 2,
      ascension: 1,
      curses: ['clock'],
      items: ['piggy-bank'],
      equippedItems: ['piggy-bank'],
      stats: stats({ rounds: 5, guesses: 20, solves: 4, solveMs: 80_000, playMs: 120_000 }),
    });

    const meta = readMeta();
    expect(meta.runs).toBe(2);
    expect(meta.wins).toBe(1);
    expect(meta.victoriousCharacters).toEqual(['runner']);
    expect(meta.ascension).toBe(1);
    expect(meta.bestLevel).toBe(50);
    expect(meta.itemCounts).toEqual({ 'piggy-bank': 2, 'tally-lens': 1 });
    expect(meta.curseCounts).toEqual({ clock: 2, censor: 1 });
    expect(meta.totalRounds).toBe(15);
    expect(meta.totalSolves).toBe(13);
    expect(meta.totalSolveMs).toBe(260_000);
    expect(meta.totalPlayMs).toBe(420_000);
    expect(meta.history).toHaveLength(2);
    expect(meta.history[0].result).toBe('defeat');
    expect(meta.history[1].result).toBe('victory');
    expect(meta.history[1].curses).toEqual(['clock', 'censor']);
    expect(meta.history[1].equippedItems).toEqual(['piggy-bank', 'tally-lens']);
  });

  it('tracks distinct characters that have won runs', () => {
    for (const character of ['runner', 'farmer', 'runner']) {
      recordRun({
        result: 'victory',
        level: 50,
        act: 4,
        ascension: 0,
        character,
        curses: [],
        items: [],
        equippedItems: [],
        stats: stats(),
      });
    }
    expect(readMeta().victoriousCharacters).toEqual(['runner', 'farmer']);
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
          items: ['piggy-bank'],
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
    expect(readMeta().history[0].equippedItems).toEqual(['piggy-bank']);
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
    expect(meta.victoriousCharacters).toEqual([]);
    expect(meta.totalSolves).toBe(0);
  });

  it('survives corrupt meta', () => {
    localStorage.setItem('blacklist.meta.v1', '{not json');
    const meta = readMeta();
    expect(meta.runs).toBe(0);
    expect(meta.history).toEqual([]);
  });
});
