import type { SaveStore } from '../core/host';

const RUN_KEY = 'blacklist.run.v1';
const META_KEY = 'blacklist.meta.v1';

export interface Meta {
  runs: number;
  wins: number;
  bestAct: number;
}

const DEFAULT_META: Meta = { runs: 0, wins: 0, bestAct: 0 };

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
    if (!raw) return { ...DEFAULT_META };
    const parsed = JSON.parse(raw) as Partial<Meta>;
    return {
      runs: Number(parsed.runs) || 0,
      wins: Number(parsed.wins) || 0,
      bestAct: Number(parsed.bestAct) || 0,
    };
  } catch {
    return { ...DEFAULT_META };
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

export function recordOutcome(result: 'victory' | 'defeat', act: number): void {
  const meta = readMeta();
  if (result === 'victory') meta.wins += 1;
  meta.bestAct = Math.max(meta.bestAct, act + 1);
  writeMeta(meta);
}
