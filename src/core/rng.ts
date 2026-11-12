/** Tiny deterministic PRNG. State is a single uint32 stored in RunState. */
export function hashSeed(seed: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function rngNext(state: { rng: number }): number {
  state.rng = (state.rng + 0x6d2b79f5) >>> 0;
  let t = state.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function rngInt(state: { rng: number }, maxExclusive: number): number {
  if (maxExclusive <= 0) return 0;
  return Math.floor(rngNext(state) * maxExclusive);
}

export function rngPick<T>(state: { rng: number }, values: readonly T[]): T {
  if (values.length === 0) throw new Error('Cannot pick from an empty list');
  return values[rngInt(state, values.length)];
}

export function rngChance(state: { rng: number }, pct: number): boolean {
  return rngNext(state) * 100 < pct;
}

export function rngShuffle<T>(state: { rng: number }, values: readonly T[]): T[] {
  const out = values.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = rngInt(state, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
