/**
 * Ascension is cumulative. Each level below stacks on every level before it.
 *
 * The old five levels are still present, but they are now spread between new
 * timer and damage-ramp levels. Keeping the schedule in one place lets the
 * engine and the title screen agree on what a level actually does.
 */

export const ASCENSION_MAX = 9;

/** Every timer level removes this much from the round's starting clock. */
export const ASCENSION_TIMER_PENALTY_MS = 20_000;

/** Levels that add one point to the per-wrong-guess damage ramp. */
export const ASCENSION_RAMP_LEVELS = [1, 5] as const;
/** Levels that shorten every timed round. */
export const ASCENSION_TIME_LEVELS = [2, 4, 7] as const;
/** The level that strips the starting armor. */
export const ASCENSION_ARMOR_LEVEL = 2;
/** Levels that remove 10 max HP, inflate shops and raise boss damage by 10%. */
export const ASCENSION_HP_LEVELS = [3, 6, 8] as const;
/** Levels that add another 10% to shop prices. */
export const ASCENSION_SHOP_LEVELS = [3, 6, 8, 9] as const;
/** Levels that make bosses hit 10% harder. */
export const ASCENSION_BOSS_PCT_LEVELS = [3, 6, 8] as const;

export interface AscensionStats {
  rampPerWrong: number;
  timePenaltyMs: number;
  armorPenalty: boolean;
  hpLoss: number;
  shopSteps: number;
  bossPctSteps: number;
}

const countAtOrBelow = (levels: readonly number[], level: number): number =>
  levels.filter((entry) => entry <= level).length;

export function ascensionStats(level: number): AscensionStats {
  const clamped = Math.max(0, Math.min(ASCENSION_MAX, Math.floor(level) || 0));
  return {
    rampPerWrong: countAtOrBelow(ASCENSION_RAMP_LEVELS, clamped),
    timePenaltyMs: ASCENSION_TIMER_PENALTY_MS * countAtOrBelow(ASCENSION_TIME_LEVELS, clamped),
    armorPenalty: clamped >= ASCENSION_ARMOR_LEVEL,
    hpLoss: 10 * countAtOrBelow(ASCENSION_HP_LEVELS, clamped),
    shopSteps: countAtOrBelow(ASCENSION_SHOP_LEVELS, clamped),
    bossPctSteps: countAtOrBelow(ASCENSION_BOSS_PCT_LEVELS, clamped),
  };
}

export function ascensionShopMultiplier(level: number): number {
  return 1 + 0.1 * ascensionStats(level).shopSteps;
}

export function ascensionBossMultiplier(level: number): number {
  return 1 + 0.1 * ascensionStats(level).bossPctSteps;
}

export function ascensionTimePenaltyMs(level: number): number {
  return ascensionStats(level).timePenaltyMs;
}

export function ascensionRampPerWrong(level: number): number {
  return ascensionStats(level).rampPerWrong;
}

export function ascensionSummary(level: number): string {
  if (level <= 0) return 'Base difficulty. No Ascension modifiers.';
  const stats = ascensionStats(level);
  const parts: string[] = [];
  if (stats.rampPerWrong > 0) {
    parts.push(`Each wrong non-free guess adds +${stats.rampPerWrong} damage to later wrong guesses.`);
  }
  if (stats.armorPenalty) parts.push('Start with 1 armor instead of 5.');
  if (stats.timePenaltyMs > 0) {
    parts.push(`Rounds start ${stats.timePenaltyMs / 1000}s shorter.`);
  }
  if (stats.hpLoss > 0) {
    parts.push(`Start with ${Math.max(10, 40 - stats.hpLoss)} max HP.`);
  }
  if (stats.shopSteps > 0) parts.push(`Shop prices +${stats.shopSteps * 10}%.`);
  if (stats.bossPctSteps > 0) {
    parts.push(`Boss damage +${stats.bossPctSteps * 10}%.`);
  }
  return parts.join(' ');
}
