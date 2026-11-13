import type { GameEvent, RejectReason } from '../core/types';

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

function signed(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}

/** Turns an engine event into a line for the run chronicle. */
export function describeEvent(event: GameEvent): string | null {
  switch (event.type) {
    case 'runStarted':
      return `Run started · seed ${event.seed}`;
    case 'nodeEntered': {
      const label = {
        round: 'A new round',
        boss: 'A boss blocks the way',
        shop: 'A shop unfolds',
        happening: 'Something happens',
      }[event.kind];
      return `Act ${event.act + 1} · ${label}`;
    }
    case 'guessRejected':
      return reasonText(event.reason);
    case 'guessMadeFree':
      return `FREE GUESS · ${event.index + 1}`;
    case 'blacklistChanged': {
      const parts: string[] = [];
      if (event.added) parts.push(`“${event.added}” is blacklisted`);
      if (event.evicted.length) parts.push(`evicted ${event.evicted.map((w) => `“${w}”`).join(', ')}`);
      if (event.removed.length) parts.push(`restored ${event.removed.map((w) => `“${w}”`).join(', ')}`);
      return parts.length ? parts.join(' · ') : null;
    }
    case 'keyboardHint':
      return event.status === 'present'
        ? `REVEAL · “${event.letter.toUpperCase()}” is in the answer`
        : `REVEAL · “${event.letter.toUpperCase()}” is not in the answer`;
    case 'letterPurged':
      return `PURGED · the letter ${event.letter.toUpperCase()} is gone forever`;
    case 'freeGuessesChanged':
      return `${event.remaining} free guess${event.remaining === 1 ? '' : 'es'} left`;
    case 'damageTaken':
      if (event.dealt === 0 && event.armorUsed > 0) return `Armor absorbed ${event.armorUsed} damage`;
      if (event.dealt === 0 && event.blocked > 0) return `Blocked ${event.blocked} damage`;
      if (event.dealt === 0) return 'No damage';
      return `−${event.dealt} HP`;
    case 'healed':
      return `+${event.amount} HP`;
    case 'maxHpChanged':
      return `Max HP is now ${event.maxHp}`;
    case 'immunityChanged':
      return event.guessesLeft > 0 ? 'Immune to the next hit' : null;
    case 'revived':
      return `REVIVED at ${event.hp} HP`;
    case 'timeExpired':
      return "TIME'S UP";
    case 'goldChanged':
      return `${signed(event.delta)} gold`;
    case 'itemAcquired':
      return `ITEM · ${event.item.id.replace(/-/g, ' ')}`;
    case 'itemRemoved':
      return event.reason === 'sold' ? 'Item sold' : event.reason === 'consumed' ? 'Item consumed' : 'Item replaced';
    case 'slotsChanged':
      return `${event.slots} item slots`;
    case 'spellGained':
      return `SPELL · ${event.spell.id.replace(/-/g, ' ')}`;
    case 'spellCast':
      return `CAST · ${event.spell.id.replace(/-/g, ' ')}`;
    case 'spellRejected':
      return `Spell failed: ${event.reason}`;
    case 'shopRejected':
      return event.reason;
    case 'offerBought':
      return `Bought for ${event.price} gold`;
    case 'happeningResolved':
      return event.text;
    case 'rewardChosen':
      return `Reward · ${event.label}`;
    case 'puzzleSolved':
      return `PUZZLE ${event.index}/${event.total} SOLVED · ${event.answer.toUpperCase()}`;
    case 'gauntletAdvanced':
      return `Puzzle ${event.index + 1}/${event.total} · the clock keeps running`;
    case 'foodEaten':
      return `ATE · ${event.name}`;
    case 'message':
      return event.text;
    case 'runEnded':
      return event.result === 'victory' ? 'THE LIST IS YOURS' : 'THE LIST CLOSES';
    case 'roundEnded':
      return event.outcome === 'solved'
        ? `Solved in ${event.guesses} guess${event.guesses === 1 ? '' : 'es'}`
        : event.outcome === 'timeout'
          ? 'The round ends. The answer was ' + event.answer.toUpperCase()
          : 'You died.';
    default:
      return null;
  }
}
