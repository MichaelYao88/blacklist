/**
 * Ascension is only starting curses. There are no stat modifiers.
 */

export const ASCENSION_MAX = 10;

export function ascensionStartingCurses(level: number): number {
  return Math.max(0, Math.min(ASCENSION_MAX, Math.floor(level) || 0));
}

export function ascensionSummary(level: number): string {
  const starting = ascensionStartingCurses(level);
  if (starting === 0) return 'Base run. No starting curses.';
  return `Draft ${starting} extra curse${starting === 1 ? '' : 's'} before level 1.`;
}
