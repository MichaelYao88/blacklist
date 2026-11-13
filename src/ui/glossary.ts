import { escapeHtml } from './format';

interface GlossaryEntry {
  pattern: RegExp;
  tip: string;
}

// Order matters: longer or more specific phrases must come before the shorter
// word they contain, because earlier matches become placeholders.
const ENTRIES: GlossaryEntry[] = [
  {
    pattern: /\bmax(?:imum)? HP\b/gi,
    tip: 'Your hit point ceiling. Healing cannot push HP past it.',
  },
  {
    pattern: /\bmax armor\b/gi,
    tip: 'Your armor pool ceiling. The pool refills at the start of every round.',
  },
  {
    pattern: /\barmor\b/gi,
    tip: 'Armor soaks damage before HP, point for point. It refills each round. Timeout damage ignores it.',
  },
  {
    pattern: /\bfree guesses?\b/gi,
    tip: 'A guess that costs no HP. The first guess of every round is always free.',
  },
  {
    pattern: /\bpaid guesses?\b/gi,
    tip: 'A guess that costs HP. Each paid guess in a round hits 1 harder than the last.',
  },
  {
    pattern: /\brandom spells?\b/gi,
    tip: 'One spell picked at random from the spell pool.',
  },
  {
    pattern: /\bspells?\b/gi,
    tip: 'A one-use ability. Duplicates stack into a single pile.',
  },
  {
    pattern: /\brelics?\b/gi,
    tip: 'A rare boss prize. Its passive is always on, uses no slot, and it never appears in shops.',
  },
  {
    pattern: /\bslots?\b/gi,
    tip: 'Equipped gear uses a slot. Gear in your bag uses none and stays switched off.',
  },
  {
    pattern: /\bbags?\b/gi,
    tip: 'Gear stored here takes no slots and its passives are off. Rearrange it in a shop.',
  },
  {
    pattern: /\bequipped\b/gi,
    tip: 'Only equipped gear uses its passives and consumes slots.',
  },
  {
    pattern: /\bblacklist(?:ed)?\b/gi,
    tip: 'Up to 16 words you can never guess again. The first guess of each round joins the list.',
  },
  {
    pattern: /\bevict(?:ed|ion)\b/gi,
    tip: 'When the blacklist is full, its oldest word is pushed out to make room.',
  },
  {
    pattern: /\bpurge(?:d)?\b/gi,
    tip: 'Remove a letter from every future answer. You can never guess that letter again.',
  },
  {
    pattern: /\bsolve(?:d)?\b/gi,
    tip: 'Guess the answer and clear the round. A correct guess never deals damage.',
  },
  {
    pattern: /\btimeouts?\b/gi,
    tip: 'The clock reached zero. You take 35% max HP + 5 damage and the round ends.',
  },
  {
    pattern: /\bclock\b/gi,
    tip: 'The MASSIVE DAMAGE IN countdown. At zero you take 35% max HP + 5 damage.',
  },
  {
    pattern: /\btimer\b/gi,
    tip: 'The MASSIVE DAMAGE IN countdown. At zero you take 35% max HP + 5 damage.',
  },
  {
    pattern: /\bHP\b/gi,
    tip: 'Hit points. If this reaches 0, the run ends.',
  },
  {
    pattern: /\bOmen\b/g,
    tip: 'Spell: reveal one yellow (misplaced) letter in the answer.',
  },
  {
    pattern: /\bHeal\b/g,
    tip: 'Spell: restore half of your missing HP.',
  },
  {
    pattern: /\bRestore\b/g,
    tip: 'Spell: wipe the blacklist.',
  },
  {
    pattern: /\bTime Freeze\b/g,
    tip: 'Spell: the clock stops until your next guess.',
  },
  {
    pattern: /\bTime Warp\b/g,
    tip: 'Spell: add 30 seconds to the current round.',
  },
  {
    pattern: /\bPhone a Friend\b/g,
    tip: 'Spell: two free guesses and a 20-second clock freeze.',
  },
  {
    pattern: /\bImmunity\b/g,
    tip: 'Spell: the next guess that would hurt you deals no damage.',
  },
  {
    pattern: /\bon-eat\b/gi,
    tip: 'Effects that fire whenever you eat food.',
  },
  {
    pattern: /\beat(?:ing|s)?\b/gi,
    tip: 'Eating food triggers on-eat items.',
  },
  {
    pattern: /\bconsumed\b/gi,
    tip: 'Destroyed after it triggers once.',
  },
  {
    pattern: /\bconsumable\b/gi,
    tip: 'A one-use item. It takes no slot.',
  },
  {
    pattern: /\bupgrades?\b/gi,
    tip: 'A permanent boost bought in shops. It cannot be sold.',
  },
  {
    pattern: /\bboss(?:es)?\b/gi,
    tip: 'The last node of each act. Bosses hide part of the board and have no clock.',
  },
  {
    pattern: /\bgauntlet\b/gi,
    tip: 'Three puzzles on one shared clock. Death reveals all three answers.',
  },
  {
    pattern: /\bgold\b/gi,
    tip: 'The run currency. Spent in shops and some events.',
  },
  {
    pattern: /\bmeals?\b/gi,
    tip: 'Food is eaten immediately, heals or grants its effect, and takes no slot.',
  },
  {
    pattern: /\bfoods?\b/gi,
    tip: 'Food is eaten immediately, heals or grants its effect, and takes no slot.',
  },
  {
    pattern: /\bshop purchases?\b/gi,
    tip: 'Buying an offer from a shop.',
  },
  {
    pattern: /\byellow letters?\b/gi,
    tip: 'A letter that is in the answer but in the wrong position.',
  },
  {
    pattern: /\ball-(?:grey|absent)\b/gi,
    tip: 'A guess where none of the five letters is in the answer.',
  },
  {
    pattern: /\bruled[- ]out\b/gi,
    tip: 'A letter proven absent from this answer. Explorer effects count distinct ruled-out letters.',
  },
  {
    pattern: /\brevealed letters?\b/gi,
    tip: 'Any letter marked by a guess or a reveal. IN WORD means present; RULED OUT means absent.',
  },
  {
    pattern: /\breveal(?:ed|s|ing|ation)?\b/gi,
    tip: 'A revealed letter is marked on the keyboard and listed in the Revealed panel. IN WORD means present; RULED OUT means absent.',
  },
  {
    pattern: /\bblocked\b/gi,
    tip: 'Damage stopped by armor or immunity before it reached HP.',
  },
  {
    pattern: /\bhits?\b/gi,
    tip: 'One damage event. Armor cancels an entire hit.',
  },
];

export function glossaryText(text: string): string {
  if (!text) return '';
  let out = escapeHtml(text);
  const slots: string[] = [];
  for (const entry of ENTRIES) {
    out = out.replace(entry.pattern, (match) => {
      const index = slots.length;
      slots.push(
        `<span class="kw" data-tip="${escapeHtml(entry.tip)}">${match}</span>`,
      );
      return `\u0000${index}\u0000`;
    });
  }
  return out.replace(/\u0000(\d+)\u0000/g, (_, index) => slots[Number(index)]);
}
