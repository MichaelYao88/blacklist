import type { SaveStore } from '../core/host';
import type { RunStats } from '../core/types';
import { ASCENSION_MAX } from '../core/ascension';

const RUN_KEY = 'blacklist.run.v1';
const META_KEY = 'blacklist.meta.v1';
const HISTORY_LIMIT = 50;

export interface RunRecord {
  at: number;
  result: 'victory' | 'defeat';
  level: number;
  act: number;
  curses: string[];
  items: string[];
  goldEarned: number;
  damageTaken: number;
  rounds: number;
  guesses: number;
  solves: number;
  solveMs: number;
  playMs: number;
}

export interface Meta {
  runs: number;
  wins: number;
  bestAct: number;
  bestLevel: number;
  /** Highest ascension level unlocked. Beating level N unlocks N+1. */
  ascension: number;
  history: RunRecord[];
  itemCounts: Record<string, number>;
  curseCounts: Record<string, number>;
  totalPlayMs: number;
  totalSolveMs: number;
  totalSolves: number;
  totalRounds: number;
  totalGuesses: number;
  totalGold: number;
  totalDamage: number;
}

const DEFAULT_META: Meta = {
  runs: 0,
  wins: 0,
  bestAct: 0,
  bestLevel: 0,
  ascension: 0,
  history: [],
  itemCounts: {},
  curseCounts: {},
  totalPlayMs: 0,
  totalSolveMs: 0,
  totalSolves: 0,
  totalRounds: 0,
  totalGuesses: 0,
  totalGold: 0,
  totalDamage: 0,
};

export class LocalStore implements SaveStore {
  load(): string | null {
    try {
      return localStorage.getItem(RUN_KEY);
    } catch {
      return null;
    }
  }

  save(json: string): void {
    try {
      localStorage.setItem(RUN_KEY, json);
    } catch {
      // Private mode or quota. The run still works in memory.
    }
  }

  clear(): void {
    try {
      localStorage.removeItem(RUN_KEY);
    } catch {
      // Ignore.
    }
  }
}

export function hasSave(): boolean {
  try {
    return Boolean(localStorage.getItem(RUN_KEY));
  } catch {
    return false;
  }
}

export function readMeta(): Meta {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return { ...DEFAULT_META, history: [], itemCounts: {}, curseCounts: {} };
    const parsed = JSON.parse(raw) as Partial<Meta>;
    return {
      runs: Number(parsed.runs) || 0,
      wins: Number(parsed.wins) || 0,
      bestAct: Number(parsed.bestAct) || 0,
      // Older saves only tracked acts. Approximate the level reached so the
      // stats page has something meaningful before the next run finishes.
      bestLevel: Number(parsed.bestLevel) || (Number(parsed.bestAct) || 0) * 10,
      ascension: Math.max(0, Math.min(ASCENSION_MAX, Number(parsed.ascension) || 0)),
      history: Array.isArray(parsed.history) ? parsed.history.slice(0, HISTORY_LIMIT) : [],
      itemCounts: parsed.itemCounts && typeof parsed.itemCounts === 'object'
        ? { ...parsed.itemCounts }
        : {},
      curseCounts: parsed.curseCounts && typeof parsed.curseCounts === 'object'
        ? { ...parsed.curseCounts }
        : {},
      totalPlayMs: Number(parsed.totalPlayMs) || 0,
      totalSolveMs: Number(parsed.totalSolveMs) || 0,
      totalSolves: Number(parsed.totalSolves) || 0,
      totalRounds: Number(parsed.totalRounds) || 0,
      totalGuesses: Number(parsed.totalGuesses) || 0,
      totalGold: Number(parsed.totalGold) || 0,
      totalDamage: Number(parsed.totalDamage) || 0,
    };
  } catch {
    return { ...DEFAULT_META, history: [], itemCounts: {}, curseCounts: {} };
  }
}

function writeMeta(meta: Meta): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    // Ignore.
  }
}

export function recordStart(): void {
  const meta = readMeta();
  meta.runs += 1;
  writeMeta(meta);
}

export interface RunRecordInput {
  result: 'victory' | 'defeat';
  level: number;
  act: number;
  ascension: number;
  curses: string[];
  items: string[];
  stats: RunStats;
}

export function recordRun(input: RunRecordInput): void {
  const meta = readMeta();
  if (input.result === 'victory') {
    meta.wins += 1;
    meta.ascension = Math.max(meta.ascension, Math.min(ASCENSION_MAX, input.ascension + 1));
  }
  meta.bestAct = Math.max(meta.bestAct, input.act + 1);
  meta.bestLevel = Math.max(meta.bestLevel, input.level);

  for (const id of input.curses) {
    meta.curseCounts[id] = (meta.curseCounts[id] ?? 0) + 1;
  }
  for (const id of input.items) {
    meta.itemCounts[id] = (meta.itemCounts[id] ?? 0) + 1;
  }

  meta.totalPlayMs += input.stats.playMs;
  meta.totalSolveMs += input.stats.solveMs;
  meta.totalSolves += input.stats.solves;
  meta.totalRounds += input.stats.rounds;
  meta.totalGuesses += input.stats.guesses;
  meta.totalGold += input.stats.goldEarned;
  meta.totalDamage += input.stats.damageTaken;

  meta.history.unshift({
    at: Date.now(),
    result: input.result,
    level: input.level,
    act: input.act,
    curses: input.curses.slice(),
    items: input.items.slice(),
    goldEarned: input.stats.goldEarned,
    damageTaken: input.stats.damageTaken,
    rounds: input.stats.rounds,
    guesses: input.stats.guesses,
    solves: input.stats.solves,
    solveMs: input.stats.solveMs,
    playMs: input.stats.playMs,
  });
  meta.history = meta.history.slice(0, HISTORY_LIMIT);
  writeMeta(meta);
}

