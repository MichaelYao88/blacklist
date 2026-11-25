import type { ItemTag } from '../core/types';
import { escapeHtml } from './format';

interface GlossaryEntry {
  pattern: RegExp;
  tip: string;
}

export const ARMOR_TIP =
  'Armor soaks damage before HP, point for point. It refills at the start of every round. '
  + 'Damage that gets past armor is a Hit (HP damage).';

export const ITEM_TAG_TIPS: Record<ItemTag, string> = {
  armor: 'Armor item: it adds to, refills, or protects your armor pool.',
  spell: 'Spell item: it grants, casts, or reacts to spells.',
  guess: 'Guess item: it reacts to player guesses, autoguesses, or solve speed.',
  gold: 'Gold item: it earns, spends, or discounts gold.',
  vision: 'Vision item: it reveals letters or helps against vision curses.',
  food: 'Food item: it reacts to eating or supports food effects.',
  curse: 'Curse item: it reacts to gaining or removing curses.',
  time: 'Clock item: it adds time, freezes the clock, or reacts to time effects.',
  lore: 'A mysterious object. It is not sold in shops and may matter later.',
};

export const PURGED_TIP =
  'A purged letter can\'t be manually guessed again, and no puzzle answer will ever contain it. Autoguesses can still use it.';

export const INCOMING_DAMAGE_TIP =
  'Every wrong guess that is not free makes the monster hit you. '
  + 'Armor reduces that damage first; any damage that gets through becomes a Hit to HP. '
  + 'The attack is the monster\'s base damage plus bonuses from curses, bosses and items '
  + '(such as extra damage per green, per 60 gold spent, or per equipped slot over five).';

// Order matters: longer or more specific phrases must come before the shorter
// word they contain, because earlier matches become placeholders.
const ENTRIES: GlossaryEntry[] = [
  {
    pattern: /\bhit \(hp damage\)/gi,
    tip: 'Damage to your HP, not your armor. Armor soaks the monster\'s attack first; whatever is left over becomes Hit (HP damage).',
  },
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
    tip: ARMOR_TIP,
  },
  {
    pattern: /\bfree guesses?\b/gi,
    tip: 'Each round a player gets one free guess. Other guesses will take damage from the monster. If you haven\'t used your free guess by the 5th guess, you lose it.',
  },
  {
    pattern: /\bpaid guesses?\b/gi,
    tip: 'A guess that costs HP. Damage grows after the first five guesses of a round.',
  },
  {
    pattern: /\brandom spells?\b/gi,
    tip: 'One spell picked at random from the spell pool.',
  },
  {
    pattern: /\bauto[- ]?cast(?:s|ing)?\b/gi,
    tip: 'The item casts the spell immediately and for free. It never enters your spell list, but it still counts as a spell cast, so it triggers and advances cast-based items.',
  },
  {
    pattern: /\bauto[- ]?guess(?:es|ed|ing)?\b/gi,
    tip: 'A guess made by an item or the Phone a Friend spell. It is always free, never deals damage, and does not spend a free guess. It does add to the round\'s total guess count.',
  },
  {
    pattern: /\bplayer guesses?\b/gi,
    tip: 'Manual Guess only.',
  },
  {
    pattern: /\bpossible words?\b/gi,
    tip: 'It will not be the answer word unless it\'s the only one left.',
  },
  {
    pattern: /\bmanual guesses?\b/gi,
    tip: 'Player only. Autoguesses and friend guesses are not manual.',
  },
  {
    pattern: /\bspells?\b/gi,
    tip: 'A one-use ability. Duplicates stack into a single pile.',
  },
  {
    pattern: /\brelics?\b/gi,
    tip: 'A rare item find. It uses one item slot like any other item, works only while equipped, and can appear in shops and rewards.',
  },
  {
    pattern: /\bslots?\b/gi,
    tip: 'Equipped items use item slots. Items in your bag use none and stay switched off.',
  },
  {
    pattern: /\bbags?\b/gi,
    tip: 'Items stored here take no item slots and their effects are off. Rearrange them in a shop.',
  },
  {
    pattern: /\bequipped\b/gi,
    tip: 'Only equipped items use their effects and consume item slots.',
  },
  {
    pattern: /\bblacklist(?:ed)?\b/gi,
    tip: 'Words you can never guess again. It has no limit, and the first guess of each round joins it forever.',
  },
  {
    pattern: /\bpurge(?:s|d|ing)?\b/gi,
    tip: PURGED_TIP,
  },
  {
    pattern: /\bsolve(?:d)?\b/gi,
    tip: 'Guess the answer and clear the round. A correct guess never deals damage.',
  },
  {
    pattern: /\btimeouts?\b/gi,
    tip: 'The clock reached zero. The run ends immediately; armor, immunity and boss mechanics do not save you.',
  },
  {
    pattern: /\bclock\b/gi,
    tip: 'The RUN ENDS IN countdown. At zero the run is lost immediately.',
  },
  {
    pattern: /\btimer\b/gi,
    tip: 'The RUN ENDS IN countdown. At zero the run is lost immediately.',
  },
  {
    pattern: /\bHP\b/gi,
    tip: 'Hit points. If this reaches 0, the run ends.',
  },
  {
    pattern: /\bOmen\b/g,
    tip: 'Spell: Reveal one guaranteed yellow (misplaced) letter in the answer.',
  },
  {
    pattern: /\bHeal\b/g,
    tip: 'Spell: restore half of your max HP.',
  },
  {
    pattern: /\bRestore\b/g,
    tip: 'Spell: refill armor and clear the blacklist.',
  },
  {
    pattern: /\bTime Freeze\b/g,
    tip: 'Spell: the next guess is free. Freeze any timers until you make the guess.',
  },
  {
    pattern: /\bcurse\b/gi,
    tip: 'A permanent rule taken from a curse draft. It affects every future encounter.',
  },
  {
    pattern: /\bPhone a Friend\b/g,
    tip: 'Spell: he says a one- or two-word catchphrase.',
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
    tip: 'A one-use item. It takes no item slot.',
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
    tip: 'Food is eaten immediately, heals or grants its effect, and takes no item slot.',
  },
  {
    pattern: /\bfoods?\b/gi,
    tip: 'Food is eaten immediately, heals or grants its effect, and takes no item slot.',
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
    pattern: /\brule out\b/gi,
    tip: 'A letter guaranteed not to be in the answer. It is marked RULED OUT on the keyboard and never appears in the word.',
  },
  {
    pattern: /\bruled[- ]out\b/gi,
    tip: 'A letter proven absent from this answer. Explorer effects count distinct ruled-out letters.',
  },
  {
    pattern: /\bnot in the word\b/gi,
    tip: 'A guaranteed absent letter. It is marked RULED OUT on the keyboard and in the Revealed panel.',
  },
  {
    pattern: /\blearn(?:s|ed|ing)?\b/gi,
    tip: 'A letter you learn may be in the answer or absent. Check its mark: IN WORD means present; RULED OUT means absent.',
  },
  {
    pattern: /\brevealed letters?\b/gi,
    tip: 'Any letter marked by a guess or a reveal. IN WORD means present; RULED OUT means absent.',
  },
  {
    pattern: /\breveal(?:ed|s|ing|ation)?\b/gi,
    tip: 'A guaranteed yellow letter: it is in the answer, but not in that position.',
  },
  {
    pattern: /\bimmune to (?:guess )?damage\b/gi,
    tip: 'Damage does not reach you. Timed immunity blocks every hit for its duration; the Immunity spell blocks one hit.',
  },
  {
    pattern: /\bblocked\b/gi,
    tip: 'Damage stopped by armor or immunity before it reached HP.',
  },
  {
    pattern: /\bincoming damage\b/gi,
    tip: INCOMING_DAMAGE_TIP,
  },
  {
    pattern: /\bhits?\b/gi,
    tip: 'One incoming attack. Armor reduces it point for point; damage that gets through is dealt to HP as a Hit.',
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
