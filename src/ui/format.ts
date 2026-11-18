import type { RejectReason } from '../core/types';

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}

export function formatTime(ms: number | null): string {
  if (ms === null || ms === undefined) return 'NO LIMIT';
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function roman(value: number): string {
  const numerals: Array<[number, string]> = [
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];
  let n = Math.max(1, Math.min(10, value));
  let out = '';
  for (const [amount, symbol] of numerals) {
    while (n >= amount) {
      out += symbol;
      n -= amount;
    }
  }
  return out;
}

export function reasonText(reason: RejectReason | string): string {
  switch (reason) {
    case 'wrongLength':
      return 'Guesses must be five letters.';
    case 'notAWord':
      return 'That word is not in the dictionary.';
    case 'blacklisted':
      return 'That word is on your blacklist.';
    case 'purgedLetter':
      return 'That word contains a purged letter.';
    case 'wrongPhase':
      return 'You cannot guess right now.';
    default:
      return typeof reason === 'string' ? reason : 'That did not work.';
  }
}

