import type {
  BoardView,
  BossDef,
  Content,
  Core,
  CurseDef,
  CurseId,
  Effect,
  GameEvent,
  HappeningDef,
  InstanceId,
  ItemDef,
  ItemInstance,
  ItemView,
  KeyboardStatus,
  Letter,
  Offer,
  PhaseView,
  PresentedGuess,
  RewardOption,
  RoundState,
  RunNode,
  RunState,
  RunView,
  ScoredGuess,
  Source,
  SpellDef,
  SpellId,
  SpellView,
  StepResult,
  Command,
  HookName,
  HookPayloads,
} from './types';
import { hashSeed, rngChance, rngInt, rngPick, rngNext, rngShuffle } from './rng';
import { scoreGuess, truthCounts } from './score';
import { ASCENSION_MAX, ascensionStartingCurses } from './ascension';

const VERSION = 6;
const WORD_LENGTH = 5;
const MAX_LEVEL = 50;
const LEVELS_PER_AREA = 10;
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz'.split('');

const RULES: Source = { kind: 'rules' };

interface Runtime {
  state: RunState;
  events: GameEvent[];
  source: Source;
  self?: InstanceId;
  pendingFree: boolean;
  pendingFreeSource?: Source;
  depth: number;
  dying: boolean;
}

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function normalizeWord(raw: string): string {
  return raw.trim().toLowerCase();
}

export function createCore(content: Content): Core {
  const itemById = new Map<string, ItemDef>(content.items.map((i) => [i.id, i]));
  const spellById = new Map<string, SpellDef>(content.spells.map((s) => [s.id, s]));
  const bossById = new Map<string, BossDef>(content.bosses.map((b) => [b.id, b]));
  const curseById = new Map<string, CurseDef>(content.curses.map((c) => [c.id, c]));
  const foodById = new Map(content.foods.map((f) => [f.id, f]));
  const happeningById = new Map<string, HappeningDef>(content.happenings.map((h) => [h.id, h]));

  // ── small helpers ────────────────────────────────────────────────────────

  const emit = (rt: Runtime, event: GameEvent): void => {
    rt.events.push(event);
  };

  const uid = (state: RunState, prefix: string): string => `${prefix}${state.nextId++}`;

  const statsCopy = (state: RunState) => ({ ...state.stats });

  const isOver = (state: RunState): boolean => state.phase === 'over';

  const findItem = (state: RunState, instance: InstanceId): ItemInstance | undefined =>
    state.items.find((i) => i.instance === instance);

  const itemDef = (item: ItemInstance): ItemDef | undefined => itemById.get(item.id);

  const itemSlots = (def: ItemDef): number => def.slots ?? (def.kind === 'gear' ? 1 : 0);

  const curseStacks = (state: RunState, id: CurseId): number =>
    state.curses.find((entry) => entry.id === id)?.stacks ?? 0;

  const curseDefs = (state: RunState): Array<{ def: CurseDef; stacks: number }> =>
    state.curses
      .map((entry) => {
        const def = curseById.get(entry.id);
        return def ? { def, stacks: entry.stacks } : null;
      })
      .filter((entry): entry is { def: CurseDef; stacks: number } => Boolean(entry));

  const hasCurse = (state: RunState, id: CurseId): boolean => curseStacks(state, id) > 0;

  const clockStacks = (state: RunState): number => curseStacks(state, 'clock');

  const clockLimitMs = (state: RunState): number | null => {
    const stacks = clockStacks(state);
    if (stacks <= 0) return null;
    const limit = 300_000 * Math.pow(0.8, Math.max(0, stacks - 1));
    return Math.max(30_000, Math.floor(limit));
  };

  const hasClock = (state: RunState): boolean => clockLimitMs(state) !== null;

  const sightCount = (state: RunState): number =>
    curseDefs(state).reduce(
      (sum, entry) => sum + (entry.def.tags.includes('vision') ? 1 : 0),
      0,
    );

  const noReveal = (state: RunState): boolean =>
    curseDefs(state).some((entry) => entry.def.noReveal);

  const noSell = (state: RunState): boolean =>
    curseDefs(state).some((entry) => entry.def.noSell);

  const shopPrice = (state: RunState, base: number): number => {
    const add = curseDefs(state).reduce(
      (sum, entry) => sum + (entry.def.shopPriceAdd ?? 0) * entry.stacks,
      0,
    );
    return Math.max(1, Math.ceil(base * (1 + add)));
  };

  const shopItemDelta = (state: RunState): number =>
    curseDefs(state).reduce(
      (sum, entry) => sum + (entry.def.shopItemDelta ?? 0) * entry.stacks,
      0,
    );

  const shopFoodDelta = (state: RunState): number =>
    curseDefs(state).reduce(
      (sum, entry) => sum + (entry.def.shopFoodDelta ?? 0) * entry.stacks,
      0,
    );

  const freeGuessPenalty = (state: RunState): number =>
    curseDefs(state).reduce(
      (sum, entry) => sum + (entry.def.freeGuessDelta ?? 0) * entry.stacks,
      0,
    );

  const armorRefillMultiplier = (state: RunState): number =>
    curseDefs(state).reduce(
      (mult, entry) => mult * Math.pow(entry.def.armorRefillMult ?? 1, entry.stacks),
      1,
    );

  const healMultiplier = (state: RunState): number =>
    curseDefs(state).reduce(
      (mult, entry) => mult * Math.pow(entry.def.healMult ?? 1, entry.stacks),
      1,
    );

  const goldMultiplier = (state: RunState): number =>
    curseDefs(state).reduce(
      (mult, entry) => mult * Math.pow(entry.def.goldMult ?? 1, entry.stacks),
      1,
    );

  const damageMultiplier = (state: RunState): number =>
    curseDefs(state).reduce(
      (mult, entry) => mult * Math.pow(entry.def.damageMultiplier ?? 1, entry.stacks),
      1,
    );

  const damagePerGreen = (state: RunState): number =>
    curseDefs(state).reduce((sum, entry) => {
      if (entry.def.damageTiers) {
        const tier = entry.def.damageTiers[Math.min(entry.stacks, entry.def.damageTiers.length) - 1];
        return sum + (tier?.green ?? 0);
      }
      return sum + (entry.def.damagePerGreen ?? 0) * entry.stacks;
    }, 0);

  const damagePerYellow = (state: RunState): number =>
    curseDefs(state).reduce((sum, entry) => {
      if (entry.def.damageTiers) {
        const tier = entry.def.damageTiers[Math.min(entry.stacks, entry.def.damageTiers.length) - 1];
        return sum + (tier?.yellow ?? 0);
      }
      return sum + (entry.def.damagePerYellow ?? 0) * entry.stacks;
    }, 0);

  const itemAvailable = (state: RunState, def: ItemDef): boolean => {
    if (def.requiresClock && !hasClock(state)) return false;
    if (def.requiresVisionCurse && sightCount(state) < def.requiresVisionCurse) return false;
    return true;
  };

  const foodAvailable = (
    state: RunState,
    def: (typeof content.foods)[number],
  ): boolean => {
    if (def.effects.some(
      (effect) => effect.type === 'purgeLetter' && state.purged.includes(effect.letter),
    )) {
      return false;
    }
    const revealLetters = def.effects
      .filter((effect) => effect.type === 'revealLetter')
      .map((effect) => effect.letter);
    if (
      revealLetters.length > 0
      && revealLetters.every((letter) => state.permanentReveals.includes(letter))
    ) {
      return false;
    }
    return !def.requiresClock || hasClock(state);
  };

  /** Slots are only consumed by equipped items. Slotless items are always on. */
  const isEquipped = (item: ItemInstance, def?: ItemDef): boolean =>
    !def || itemSlots(def) === 0 || item.equipped !== false;

  const usedSlots = (state: RunState): number =>
    state.items.reduce((sum, item) => {
      const def = itemDef(item);
      if (!def || !isEquipped(item, def)) return sum;
      return sum + itemSlots(def);
    }, 0);

  const canEquip = (state: RunState, def: ItemDef): boolean =>
    usedSlots(state) + itemSlots(def) <= state.slots;

  const firstPurchaseDiscount = (state: RunState): number =>
    state.items.reduce((max, item) => {
      const def = itemById.get(item.id);
      if (!def?.shopDiscount || !isEquipped(item, def)) return max;
      return Math.max(max, def.shopDiscount);
    }, 0);

  /** Loose Tongue and friends: any five letters become a legal probe. */
  const allowsInvalidGuesses = (state: RunState): boolean =>
    state.items.some(
      (item) => itemById.get(item.id)?.allowInvalidGuesses === true && isEquipped(item, itemById.get(item.id)),
    );

  const itemView = (state: RunState, item: ItemInstance): ItemView => {
    const def = itemById.get(item.id);
    return {
      instance: item.instance,
      id: item.id,
      data: { ...item.data },
      kind: def?.kind ?? 'gear',
      slots: def ? itemSlots(def) : 1,
      equipped: def ? isEquipped(item, def) : false,
      sellValue: def ? (def.sellValue ? def.sellValue({ state, self: item }) : Math.floor(def.price / 2)) : 0,
    };
  };

  const spellView = (spell: { instance: string; id: string }): SpellView => ({
    instance: spell.instance,
    id: spell.id,
  });

  // ── gold / hp / armor ────────────────────────────────────────────────────

  function changeGold(rt: Runtime, delta: number, source: Source): void {
    if (!delta) return;
    const state = rt.state;
    let amount = delta;
    if (amount > 0) {
      // Gold-income doublers roll once per equipped item. A doubled reward
      // still counts as earned gold, and the roll happens before the payout.
      for (const item of state.items) {
        const def = itemById.get(item.id);
        if (!def?.goldDoubleChance || !isEquipped(item, def)) continue;
        if (!rngChance(state, def.goldDoubleChance)) continue;
        amount *= 2;
        emit(rt, { type: 'message', text: `${def.name} doubles the gold.` });
      }
    }
    const before = state.gold;
    state.gold = Math.max(0, before + amount);
    const applied = state.gold - before;
    if (!applied) return;
    if (applied > 0) state.stats.goldEarned += applied;
    emit(rt, { type: 'goldChanged', delta: applied, total: state.gold, source });
  }

  function spendGold(rt: Runtime, amount: number, source: Source = RULES): boolean {
    if (amount <= 0) return true;
    if (rt.state.gold < amount) return false;
    changeGold(rt, -amount, source);
    runHook(rt, 'onGoldSpent', { amount, total: rt.state.gold });
    return true;
  }

  function heal(rt: Runtime, amount: number, source: Source): void {
    if (amount <= 0) return;
    const state = rt.state;
    const before = state.hp;
    const adjusted = Math.max(1, Math.round(amount * healMultiplier(state)));
    state.hp = Math.min(state.maxHp, state.hp + adjusted);
    const applied = state.hp - before;
    if (applied > 0) {
      emit(rt, { type: 'healed', amount: applied, hp: state.hp, source });
      runHook(rt, 'onHeal', { amount: applied, hp: state.hp });
    }
  }

  function changeMaxHp(rt: Runtime, delta: number, source: Source): void {
    const state = rt.state;
    if (!delta) return;
    const before = state.maxHp;
    state.maxHp = Math.max(1, state.maxHp + delta);
    if (state.hp > state.maxHp) state.hp = state.maxHp;
    emit(rt, { type: 'maxHpChanged', maxHp: state.maxHp, hp: state.hp, source });
    runHook(rt, 'onMaxHpChanged', { delta: state.maxHp - before, maxHp: state.maxHp });
  }

  function changeArmor(rt: Runtime, delta: number): void {
    const state = rt.state;
    state.armor = Math.max(0, Math.min(state.maxArmor, state.armor + delta));
    emit(rt, { type: 'armorChanged', armor: state.armor, max: state.maxArmor });
  }

  function changeMaxArmor(rt: Runtime, delta: number): void {
    const state = rt.state;
    state.maxArmor = Math.max(0, state.maxArmor + delta);
    if (delta > 0) state.armor = Math.min(state.maxArmor, state.armor + delta);
    else state.armor = Math.min(state.armor, state.maxArmor);
    emit(rt, { type: 'armorChanged', armor: state.armor, max: state.maxArmor });
  }

  // ── revealed letters ─────────────────────────────────────────────────────

  function hintLetter(
    rt: Runtime,
    letter: Letter,
    status: 'present' | 'absent',
  ): void {
    const round = rt.state.round;
    if (!round) return;
    if (!round.hints) round.hints = {};
    const current = round.hints[letter];
    // A green/present reveal is information you can never lose. Repeating an
    // absent reveal is noise, so both are ignored.
    if (current === 'present') return;
    if (current === 'absent' && status === 'absent') return;
    round.hints[letter] = status;
    emit(rt, { type: 'keyboardHint', letter, status });
    runHook(rt, 'onReveal', { letter, status });
  }

  function ruledOutLetters(state: RunState, round: RoundState): Set<string> {
    const present = new Set<string>();
    const absent = new Set<string>();

    for (const guess of round.guesses) {
      guess.truth.forEach((tile, index) => {
        if (tile === 'correct' || tile === 'present') present.add(guess.word[index]);
        else if (tile === 'absent') absent.add(guess.word[index]);
      });
    }
    for (const [letter, status] of Object.entries(round.hints ?? {})) {
      if (status === 'present') present.add(letter);
      else absent.add(letter);
    }
    for (const letter of state.purged) absent.add(letter);

    for (const letter of present) absent.delete(letter);
    return absent;
  }

  /** Reveal random unknown letters, leaning toward letters not in the answer. */
  function revealRandomLetters(rt: Runtime, count: number): void {    const state = rt.state;
    const round = state.round;
    if (!round || count <= 0) return;

    const known = new Set<string>([
      ...Object.keys(round.hints ?? {}),
      ...state.purged,
    ]);
    for (const guess of round.guesses) {
      for (const letter of guess.word.split('')) known.add(letter);
    }

    const candidates = ALPHABET.filter((letter) => !known.has(letter));
    const absent = candidates.filter((letter) => !round.answer.includes(letter));
    const present = candidates.filter((letter) => round.answer.includes(letter));

    for (let index = 0; index < count; index++) {
      if (absent.length === 0 && present.length === 0) return;
      // 70% of reveals name a letter that is not in the answer, so the
      // information is usually a clean elimination rather than a position hint.
      const pickAbsent = absent.length > 0
        && (present.length === 0 || rngChance(state, 70));
      const pool = pickAbsent ? absent : present.length > 0 ? present : absent;
      const letter = rngPick(state, pool);
      pool.splice(pool.indexOf(letter), 1);
      hintLetter(rt, letter, round.answer.includes(letter) ? 'present' : 'absent');
    }
  }

  /** Reveal only letters that are guaranteed not to be in the answer. */
  function revealAbsentLetters(rt: Runtime, count: number): void {
    const state = rt.state;
    const round = state.round;
    if (!round || count <= 0) return;

    const known = new Set<string>([
      ...Object.keys(round.hints ?? {}),
      ...state.purged,
    ]);
    for (const guess of round.guesses) {
      for (const letter of guess.word.split('')) known.add(letter);
    }

    const candidates = ALPHABET.filter(
      (letter) => !known.has(letter) && !round.answer.includes(letter),
    );
    for (let index = 0; index < count && candidates.length > 0; index++) {
      const letter = rngPick(state, candidates);
      candidates.splice(candidates.indexOf(letter), 1);
      hintLetter(rt, letter, 'absent');
    }
  }

  // ── blacklist ────────────────────────────────────────────────────────────

  function addBlacklist(rt: Runtime, word: string): void {
    const state = rt.state;
    if (!word || state.blacklist.includes(word)) return;
    state.blacklist.push(word);
    emit(rt, { type: 'blacklistChanged', list: state.blacklist.slice(), added: word });
  }

  function clearBlacklist(rt: Runtime): void {
    const state = rt.state;
    if (state.blacklist.length === 0) return;
    state.blacklist = [];
    emit(rt, { type: 'blacklistChanged', list: [] });
  }

  function purgeLetterNow(rt: Runtime, letter: Letter): boolean {
    const state = rt.state;
    const ch = letter.trim().toLowerCase();
    if (!/^[a-z]$/.test(ch)) {
      emit(rt, { type: 'message', text: 'Pick a single letter.' });
      return false;
    }
    if (state.purged.includes(ch)) {
      emit(rt, { type: 'message', text: `${ch.toUpperCase()} is already purged.` });
      return false;
    }
    // Only a live puzzle can be broken by removing one of its letters. Between
    // nodes the round object is leftover state: shops, rewards and happenings
    // still carry the last answer around, so it must not block a valid purge.
    const liveRound = state.phase === 'round' ? state.round : undefined;
    if (liveRound && liveRound.answer.includes(ch)) {
      emit(rt, { type: 'message', text: `You cannot purge a letter that is in the current answer.` });
      return false;
    }
    const remaining = content.answers.filter(
      (word) => !word.includes(ch) && !word.split('').some((c) => state.purged.includes(c)),
    );
    if (remaining.length < 80) {
      emit(rt, { type: 'message', text: `Purging ${ch.toUpperCase()} would leave too few answers.` });
      return false;
    }
    state.purged.push(ch);
    // If a finished round is still in state and its answer contains the letter,
    // swap that dead answer for a valid one. The real next answer is chosen when
    // the next round starts, but this keeps every stale read consistent.
    if (!liveRound && state.round && state.round.answer.includes(ch)) {
      state.round.answer = rngPick(state, remaining);
    }
    emit(rt, { type: 'letterPurged', letter: ch });
    return true;
  }

  // ── items / spells ───────────────────────────────────────────────────────

  function addItem(rt: Runtime, id: string): boolean {
    const state = rt.state;
    const def = itemById.get(id);
    if (!def) return false;
    const equip = itemSlots(def) === 0 || canEquip(state, def);
    const item: ItemInstance = {
      instance: uid(state, 'i'),
      id: def.id,
      data: { ...(def.initial ?? {}) },
      equipped: equip,
    };
    state.items.push(item);
    emit(rt, { type: 'itemAcquired', item: itemView(state, item) });
    if (!equip) {
      emit(rt, {
        type: 'message',
        text: `No free slot for ${def.name}. It is in your bag — equip it in a shop.`,
      });
    }
    if (def.onAcquire) {
      applyEffects(rt, def.onAcquire({ state, self: item }), { kind: 'item', instance: item.instance }, item.instance);
    }
    return true;
  }

  function equipItem(rt: Runtime, instance: InstanceId): void {
    const state = rt.state;
    const item = findItem(state, instance);
    if (!item) return;
    const def = itemById.get(item.id);
    if (!def) return;
    if (itemSlots(def) === 0 || item.equipped !== false) return;
    if (!canEquip(state, def)) {
      emit(rt, { type: 'message', text: `No free slot for ${def.name}. Unequip something first.` });
      return;
    }
    item.equipped = true;
    emit(rt, { type: 'itemEquipped', instance, equipped: true });
  }

  function unequipItem(rt: Runtime, instance: InstanceId): void {
    const state = rt.state;
    const item = findItem(state, instance);
    if (!item) return;
    const def = itemById.get(item.id);
    if (!def || itemSlots(def) === 0 || item.equipped === false) return;
    item.equipped = false;
    emit(rt, { type: 'itemEquipped', instance, equipped: false });
  }

  function removeItem(rt: Runtime, instance: InstanceId, reason: 'sold' | 'consumed' | 'replaced'): void {
    const state = rt.state;
    const index = state.items.findIndex((i) => i.instance === instance);
    if (index < 0) return;
    state.items.splice(index, 1);
    emit(rt, { type: 'itemRemoved', instance, reason });
  }

  function addSpell(rt: Runtime, id: string): SpellView | null {
    const state = rt.state;
    const def = spellById.get(id);
    if (!def) return null;
    const spell = { instance: uid(state, 's'), id: def.id };
    state.spells.push(spell);
    const view = spellView(spell);
    emit(rt, { type: 'spellGained', spell: view });
    return view;
  }

  function eatFood(rt: Runtime, id: string): void {
    const state = rt.state;
    const def = foodById.get(id);
    if (!def) return;
    const doubled = state.items.some((item) => {
      const itemDef = itemById.get(item.id);
      return Boolean(itemDef?.doubleFood) && isEquipped(item, itemDef);
    });
    emit(rt, { type: 'foodEaten', food: def.id, name: def.name });
    applyEffects(rt, doubled ? [...def.effects, ...def.effects] : def.effects, RULES);
    runHook(rt, 'onEat', { food: def.id });
  }

  // ── damage / death / revive ──────────────────────────────────────────────

  interface DamageOptions {
    ignoreArmor?: boolean;
    ignoreImmunity?: boolean;
    timeout?: boolean;
  }

  function dealDamage(rt: Runtime, amount: number, source: Source, options: DamageOptions = {}): void {
    const state = rt.state;
    if (amount <= 0 || isOver(state)) return;
    let modified = amount;
    for (const item of state.items.slice()) {
      const def = itemById.get(item.id);
      if (!def?.modifyDamage || !isEquipped(item, def)) continue;
      modified = def.modifyDamage({ state, self: item }, modified);
    }
    modified = Math.max(0, Math.floor(modified));
    const round = state.round;

    if (modified <= 0) {
      emit(rt, {
        type: 'damageTaken',
        incoming: 0,
        armorUsed: 0,
        blocked: 0,
        dealt: 0,
        hp: state.hp,
        source,
      });
      return;
    }

    if (round && !options.ignoreImmunity && round.elapsedMs < round.immuneUntilMs) {
      emit(rt, {
        type: 'damageTaken',
        incoming: modified,
        armorUsed: 0,
        blocked: modified,
        dealt: 0,
        hp: state.hp,
        source,
      });
      runHook(rt, 'onDamageTaken', {
        incoming: modified,
        dealt: 0,
        armorUsed: 0,
        blocked: modified,
        source,
      });
      return;
    }

    if (round && !options.ignoreImmunity && round.immuneGuesses > 0) {
      round.immuneGuesses--;
      emit(rt, { type: 'immunityChanged', guessesLeft: round.immuneGuesses });
      emit(rt, {
        type: 'damageTaken',
        incoming: modified,
        armorUsed: 0,
        blocked: modified,
        dealt: 0,
        hp: state.hp,
        source,
      });
      runHook(rt, 'onDamageTaken', {
        incoming: modified,
        dealt: 0,
        armorUsed: 0,
        blocked: modified,
        source,
      });
      return;
    }

    // Armor is a pool of damage reduction, not an all-or-nothing charge:
    // each point soaks one point of the hit before HP is touched.
    const armorUsed = round && !options.ignoreArmor
      ? Math.min(state.armor, modified)
      : 0;
    if (armorUsed > 0) {
      state.armor -= armorUsed;
      emit(rt, { type: 'armorChanged', armor: state.armor, max: state.maxArmor });
    }

    const dealt = modified - armorUsed;
    if (dealt > 0) {
      state.hp = Math.max(0, state.hp - dealt);
      state.stats.damageTaken += dealt;
      if (round) round.damageTaken += dealt;
    }

    emit(rt, {
      type: 'damageTaken',
      incoming: modified,
      armorUsed,
      blocked: armorUsed,
      dealt,
      hp: state.hp,
      source,
    });

    runHook(rt, 'onDamageTaken', {
      incoming: modified,
      dealt,
      armorUsed,
      blocked: armorUsed,
      source,
    });
    if (isOver(state)) return;

    if (state.hp <= 0) finishDeath(rt, options.timeout ? 'the clock' : 'damage');
  }

  function finishDeath(rt: Runtime, sourceText: string): void {
    const state = rt.state;
    if (isOver(state) || rt.dying) return;
    rt.dying = true;
    try {
      state.hp = 0;
      runHook(rt, 'onDeath', { source: sourceText });
      if (state.hp > 0) return;

      const round = state.round;
      if (round) {
        state.stats.rounds++;
        state.stats.playMs += round.elapsedMs;
        runHook(rt, 'onRoundEnd', {
          outcome: 'died',
          boss: round.boss,
          damageTaken: round.damageTaken,
        });
        emit(rt, {
          type: 'roundEnded',
          outcome: 'died',
          answer: round.answer,
          answers: round.gauntletTotal > 1 ? round.gauntletAnswers.slice() : undefined,
          guesses: round.totalGuesses,
          elapsedMs: round.elapsedMs,
        });
      }

      state.phase = 'over';
      state.over = {
        result: 'defeat',
        answer: round?.answer,
        answers: round && round.gauntletTotal > 1
          ? [...round.gauntletAnswers, round.answer]
          : undefined,
      };
      emit(rt, { type: 'runEnded', result: 'defeat', stats: statsCopy(state) });
    } finally {
      rt.dying = false;
    }
  }

  // ── effects ──────────────────────────────────────────────────────────────

  function applyEffects(rt: Runtime, effects: Effect[], source: Source, self?: InstanceId): void {
    const prevSource = rt.source;
    const prevSelf = rt.self;
    rt.source = source;
    rt.self = self;
    rt.depth++;
    try {
      for (const effect of effects) {
        if (isOver(rt.state)) break;
        applyEffect(rt, effect);
      }
    } finally {
      rt.depth--;
      rt.source = prevSource;
      rt.self = prevSelf;
    }
  }

  function applyEffect(rt: Runtime, effect: Effect): void {
    const state = rt.state;
    const source: Source = rt.self ? { kind: 'item', instance: rt.self } : rt.source;

    switch (effect.type) {
      case 'damage':
        dealDamage(rt, effect.amount, source);
        break;
      case 'heal':
        heal(rt, effect.amount, source);
        break;
      case 'healPercent':
        heal(rt, Math.max(1, Math.ceil(state.maxHp * (effect.percent / 100))), source);
        break;
      case 'maxHp':
        changeMaxHp(rt, effect.delta, source);
        break;
      case 'armor':
        changeArmor(rt, effect.delta);
        break;
      case 'refillArmor':
        changeArmor(rt, state.maxArmor - state.armor);
        break;
      case 'maxArmor':
        if (effect.chancePct !== undefined && !rngChance(state, effect.chancePct)) break;
        changeMaxArmor(rt, effect.delta);
        break;
      case 'revive': {
        if (isOver(state)) break;
        state.hp = Math.max(1, Math.min(state.maxHp, effect.hp));
        emit(rt, { type: 'revived', hp: state.hp, source });
        break;
      }
      case 'gold':
        changeGold(rt, effect.amount, source);
        break;
      case 'solveGold':
        state.bonusSolveGold = Math.max(0, state.bonusSolveGold + effect.amount);
        emit(rt, { type: 'attributeChanged', stat: 'bonusSolveGold', value: state.bonusSolveGold });
        break;
      case 'addTime': {
        const round = state.round;
        if (!round || round.remainingMs === null) break;
        round.remainingMs = Math.max(0, round.remainingMs + effect.ms);
        emit(rt, {
          type: 'timerChanged',
          remainingMs: round.remainingMs,
          frozen: round.frozenUntilGuess || round.frozenMs > 0,
          source,
        });
        break;
      }
      case 'timeBonus':
        state.bonusTimeMs += effect.ms;
        emit(rt, { type: 'attributeChanged', stat: 'bonusTimeMs', value: state.bonusTimeMs });
        break;
      case 'freezeTime': {
        const round = state.round;
        if (!round) break;
        round.frozenMs += effect.ms;
        emit(rt, {
          type: 'timerChanged',
          remainingMs: round.remainingMs,
          frozen: true,
          source,
        });
        break;
      }
      case 'freezeUntilGuess': {
        const round = state.round;
        if (!round) break;
        if (round.remainingMs === null) {
          round.freeLeft += 1;
          emit(rt, { type: 'freeGuessesChanged', remaining: round.freeLeft, source });
          emit(rt, { type: 'message', text: 'No clock. The next guess is free instead.' });
          break;
        }
        round.frozenUntilGuess = true;
        emit(rt, {
          type: 'timerChanged',
          remainingMs: round.remainingMs,
          frozen: true,
          source,
        });
        break;
      }
      case 'freeGuesses': {
        const round = state.round;
        if (!round) break;
        round.freeLeft = Math.max(0, round.freeLeft + effect.count);
        emit(rt, { type: 'freeGuessesChanged', remaining: round.freeLeft, source });
        break;
      }
      case 'makeGuessFree': {
        if (effect.chancePct !== undefined && !rngChance(state, effect.chancePct)) break;
        rt.pendingFree = true;
        rt.pendingFreeSource = rt.self ? { kind: 'item', instance: rt.self } : source;
        break;
      }
      case 'immunity': {
        const round = state.round;
        if (!round) break;
        round.immuneGuesses += effect.guesses;
        emit(rt, { type: 'immunityChanged', guessesLeft: round.immuneGuesses });
        break;
      }
      case 'timedImmunity': {
        const round = state.round;
        if (!round) break;
        round.immuneUntilMs = Math.max(round.immuneUntilMs, round.elapsedMs + effect.ms);
        emit(rt, { type: 'immunityChanged', guessesLeft: round.immuneGuesses });
        break;
      }
      case 'revealYellow': {
        const round = state.round;
        if (!round) break;
        if (noReveal(state) && (source.kind === 'item' || source.kind === 'spell')) break;
        const known = new Set<string>();
        for (const guess of round.guesses) {
          guess.truth.forEach((tile, i) => {
            if (tile === 'correct' || tile === 'present') known.add(guess.word[i]);
          });
        }
        for (const [letter, status] of Object.entries(round.hints ?? {})) {
          if (status === 'present') known.add(letter);
        }
        const letters = round.answer.split('').filter((ch) => !known.has(ch));
        if (letters.length > 0) {
          hintLetter(rt, rngPick(state, letters), 'present');
        }
        break;
      }
      case 'revealLetter': {
        if (noReveal(state) && (source.kind === 'item' || source.kind === 'spell')) break;
        const letter = effect.letter.toLowerCase();
        if (!state.permanentReveals) state.permanentReveals = [];
        const firstTime = !state.permanentReveals.includes(letter);
        if (firstTime) state.permanentReveals.push(letter);
        const round = state.round;
        if (state.phase === 'round' && round) {
          hintLetter(rt, letter, round.answer.includes(letter) ? 'present' : 'absent');
        } else {
          emit(rt, {
            type: 'message',
            text: firstTime
              ? `${letter.toUpperCase()} will be revealed every round from now on.`
              : `${letter.toUpperCase()} is already revealed every round.`,
          });
        }
        break;
      }
      case 'revealRandom':
        if (noReveal(state) && (source.kind === 'item' || source.kind === 'spell')) break;
        revealRandomLetters(rt, effect.count);
        break;
      case 'revealAbsent':
        if (noReveal(state) && (source.kind === 'item' || source.kind === 'spell')) break;
        revealAbsentLetters(rt, effect.count);
        break;
      case 'pendingAbsent':
        state.pendingAbsent += effect.count;
        break;
      case 'purgeLetter':
        purgeLetterNow(rt, effect.letter);
        break;
      case 'clearBlacklist':
        clearBlacklist(rt);
        break;
      case 'randomChoice': {
        if (effect.options.length === 0) break;
        const choice = effect.options[rngInt(state, effect.options.length)];
        for (const nested of choice) {
          if (isOver(state)) break;
          applyEffect(rt, nested);
        }
        break;
      }
      case 'giveSpell': {
        if (effect.chancePct !== undefined && !rngChance(state, effect.chancePct)) break;
        const id = effect.spell === 'random'
          ? (content.spells.length > 0 ? rngPick(state, content.spells).id : null)
          : effect.spell;
        if (id) addSpell(rt, id);
        break;
      }
      case 'castSpell':
        castSpellById(rt, effect.spell);
        break;
      case 'friendGuesses':
        playFriendGuesses(rt, effect.count);
        break;
      case 'autoGuess': {
        const round = state.round;
        if (!round || state.phase !== 'round') break;
        const word = normalizeWord(effect.word);
        if (word.length !== WORD_LENGTH) break;
        if (state.blacklist.includes(word)) break;
        if (word.split('').some((ch) => state.purged.includes(ch))) break;
        if (round.guesses.some((guess) => guess.word === word)) break;
        scorePlayerGuess(rt, word, 'friend');
        break;
      }
      case 'eatBurst': {
        for (let index = 0; index < effect.count; index++) {
          runHook(rt, 'onEat', { food: 'a seven-course meal' });
          if (isOver(state)) break;
        }
        break;
      }
      case 'grow': {
        if (!rt.self) break;
        const item = findItem(state, rt.self);
        if (!item) break;
        item.data[effect.stat] = (item.data[effect.stat] ?? 0) + effect.by;
        emit(rt, { type: 'itemGrew', instance: item.instance, stat: effect.stat, value: item.data[effect.stat] });
        break;
      }
      case 'setItemData': {
        if (!rt.self) break;
        const item = findItem(state, rt.self);
        if (!item) break;
        item.data[effect.stat] = effect.value;
        emit(rt, { type: 'itemDataChanged', instance: item.instance, stat: effect.stat, value: effect.value });
        break;
      }
      case 'consumeSelf': {
        if (!rt.self) break;
        removeItem(rt, rt.self, 'consumed');
        break;
      }
      case 'addItem':
        addItem(rt, effect.item);
        break;
      case 'addRandomItem': {
        const owned = new Set(
          state.items.filter((i) => itemById.get(i.id)?.kind === 'gear').map((i) => i.id),
        );
        const pool = content.items.filter(
          (i) => i.rarity !== 'rare'
            && itemAvailable(state, i)
            && (i.kind !== 'gear' || !owned.has(i.id)),
        );
        if (pool.length > 0) addItem(rt, rngPick(state, pool).id);
        break;
      }
      case 'addRandomRelic': {
        const owned = new Set(
          state.items
            .filter((i) => itemById.get(i.id)?.rarity === 'rare')
            .map((i) => i.id),
        );
        const rare = content.items.filter(
          (i) => i.rarity === 'rare' && itemAvailable(state, i),
        );
        const unowned = rare.filter((i) => !owned.has(i.id));
        const pool = unowned.length > 0 ? unowned : rare;
        if (pool.length > 0) addItem(rt, rngPick(state, pool).id);
        break;
      }
      case 'eat':
        eatFood(rt, effect.food);
        break;
      case 'eatRandom': {
        const pool = content.foods.filter((food) => foodAvailable(state, food));
        if (pool.length > 0) eatFood(rt, rngPick(state, pool).id);
        break;
      }
      case 'slots':
        state.slots = Math.max(0, state.slots + effect.delta);
        emit(rt, { type: 'slotsChanged', slots: state.slots });
        break;
      case 'pendingPurge':
        state.pendingPurge += effect.count;
        break;
      case 'addCurse':
        applyCurse(rt, effect.curse);
        break;
      case 'awaitCurseRemoval':
        state.pendingCurseRemoval += 1;
        break;
      case 'bossData': {
        const round = state.round;
        if (!round?.boss) break;
        round.bossState[effect.key] = effect.value;
        emit(rt, { type: 'bossStateChanged', boss: round.boss, state: { ...round.bossState } });
        break;
      }
      case 'message':
        emit(rt, { type: 'message', text: effect.text });
        break;
    }
  }

  // ── hooks ────────────────────────────────────────────────────────────────

  function runHook<H extends HookName>(rt: Runtime, hook: H, payload: HookPayloads[H]): void {
    const state = rt.state;
    if (rt.depth > 10 || isOver(state)) return;

    const bossId = state.round?.boss;
    if (bossId) {
      const boss = bossById.get(bossId);
      const handler = boss?.on?.[hook] as
        | ((ctx: { state: RunState }, payload: HookPayloads[H]) => Effect[])
        | undefined;
      if (handler) {
        const effects = handler({ state }, payload);
        if (effects.length > 0) {
          applyEffects(rt, effects, { kind: 'boss', boss: bossId });
        }
      }
    }

    for (const item of state.items.slice()) {
      if (!findItem(state, item.instance)) continue;
      const def = itemById.get(item.id);
      if (!def || !isEquipped(item, def)) continue;
      const handler = def.on?.[hook] as
        | ((ctx: { state: RunState; self: ItemInstance }, payload: HookPayloads[H]) => Effect[])
        | undefined;
      if (!handler) continue;
      const effects = handler({ state, self: item }, payload);
      if (effects.length === 0) continue;
      emit(rt, { type: 'itemTriggered', instance: item.instance, hook });
      applyEffects(rt, effects, { kind: 'item', instance: item.instance }, item.instance);
      if (isOver(state)) break;
    }
  }

  // ── presentation ─────────────────────────────────────────────────────────

  function presentGuess(state: RunState, guess: ScoredGuess): PresentedGuess {
    const bossId = state.round?.boss;
    const boss = bossId ? bossById.get(bossId) : undefined;
    if (boss?.present) {
      return boss.present({ state }, guess);
    }

    const vision = curseDefs(state).filter((entry) => entry.def.tags.includes('vision'));
    let tiles = guess.truth.slice() as Array<'correct' | 'present' | 'absent' | 'hit' | 'hidden'>;
    for (const entry of vision) {
      for (const effect of entry.def.vision ?? []) {
        if (effect.kind === 'ambiguousLetters') {
          const letters = new Set(effect.letters.split(''));
          tiles = tiles.map((tile, index) =>
            letters.has(guess.word[index]) && (tile === 'correct' || tile === 'present')
              ? 'hit'
              : tile,
          );
        }
      }
    }
    for (const entry of vision) {
      for (const effect of entry.def.vision ?? []) {
        if (effect.kind === 'hidePosition') {
          if (effect.index >= 0 && effect.index < tiles.length) tiles[effect.index] = 'hidden';
        } else if (effect.kind === 'hideLetters') {
          const letters = new Set(effect.letters.split(''));
          tiles = tiles.map((tile, index) =>
            letters.has(guess.word[index]) ? 'hidden' : tile,
          );
        }
      }
    }

    const tally = state.items.some((item) => {
      const def = itemById.get(item.id);
      return def?.id === 'tally-lens' && isEquipped(item, def);
    });
    const counts = vision.length > 0 && tally ? truthCounts(guess.truth) : undefined;
    return { word: guess.word, tiles, counts };
  }

  // ── answers ──────────────────────────────────────────────────────────────

  function chooseAnswer(rt: Runtime, boss?: BossDef): string {
    const state = rt.state;
    const pools = boss?.answerPool === 'hard'
      ? [content.hardAnswers, content.answers]
      : [content.answers];

    const clean = (pool: readonly string[], checkBlacklist: boolean): string[] =>
      pool.filter((word) => {
        if (checkBlacklist && state.blacklist.includes(word)) return false;
        if (state.usedAnswers.includes(word)) return false;
        if (word.split('').some((ch) => state.purged.includes(ch))) return false;
        return true;
      });

    for (const pool of pools) {
      let candidates = clean(pool, true);
      if (candidates.length === 0) {
        candidates = pool.filter(
          (word) =>
            !state.usedAnswers.includes(word) &&
            !word.split('').some((ch) => state.purged.includes(ch)),
        );
      }
      if (candidates.length === 0) {
        candidates = pool.filter((word) => !word.split('').some((ch) => state.purged.includes(ch)));
      }
      if (candidates.length > 0) {
        const answer = rngPick(state, candidates);
        state.usedAnswers.push(answer);
        return answer;
      }
    }

    const fallback = rngPick(state, content.answers);
    state.usedAnswers.push(fallback);
    return fallback;
  }

  // ── round lifecycle ──────────────────────────────────────────────────────

  function startRound(rt: Runtime): void {
    const state = rt.state;
    const node = state.nodes[state.nodeIndex];
    if (!node) return;
    const boss = node.boss ? bossById.get(node.boss) : undefined;
    const answer = chooseAnswer(rt, boss);

    const clock = clockLimitMs(state);
    const remaining = clock === null ? null : Math.max(30_000, clock + state.bonusTimeMs);
    const timerStart = remaining;

    // Encounter damage is 3 plus one per curse stack. Curses are the only
    // growth; Heavy Hand still multiplies the total.
    const curseTotal = state.curses.reduce((sum, entry) => sum + entry.stacks, 0);
    const baseDamage = Math.max(
      0,
      Math.round((3 + curseTotal) * damageMultiplier(state) + state.bonusBaseDamage),
    );

    const round: RoundState = {
      answer,
      boss: boss?.id,
      guesses: [],
      freeLeft: Math.max(0, 1 + freeGuessPenalty(state)),
      paidGuesses: 0,
      baseDamage,
      damageRamp: 0,
      elapsedMs: 0,
      remainingMs: remaining,
      timerStartMs: timerStart,
      frozenMs: 0,
      frozenUntilGuess: false,
      immuneGuesses: 0,
      immuneUntilMs: 0,
      damageTaken: 0,
      bossState: { ...(boss?.initialState ?? {}) },
      gauntletIndex: 0,
      gauntletTotal: boss?.gauntlet ? boss.gauntlet.puzzles : 1,
      gauntletAnswers: [],
      totalGuesses: 0,
      hints: {},
    };

    state.round = round;
    state.summary = undefined;
    state.reward = undefined;
    state.shop = undefined;
    state.happening = undefined;
    state.bossIntro = undefined;
    state.phase = 'round';
    state.armor = Math.floor(state.maxArmor * armorRefillMultiplier(state));
    emit(rt, { type: 'armorChanged', armor: state.armor, max: state.maxArmor });
    emit(rt, {
      type: 'roundStarted',
      boss: boss?.id,
      timerMs: remaining,
      freeGuesses: round.freeLeft,
      roundNumber: state.stats.rounds + 1,
      baseDamage: round.baseDamage,
      gauntletTotal: round.gauntletTotal,
    });

    // Reveal foods are permanent. Legacy queued reveals are folded into the
    // permanent list so an old save keeps its hint too.
    const watched = new Set<string>([
      ...(state.permanentReveals ?? []),
      ...(state.pendingReveals ?? []),
    ]);
    state.permanentReveals = [...watched];
    state.pendingReveals = [];
    for (const letter of watched) {
      hintLetter(rt, letter, round.answer.includes(letter) ? 'present' : 'absent');
    }
    if (state.pendingAbsent > 0) {
      revealAbsentLetters(rt, state.pendingAbsent);
      state.pendingAbsent = 0;
    }

    runHook(rt, 'onRoundStart', {
      boss: boss?.id,
      timerMs: remaining,
      roundNumber: state.stats.rounds + 1,
      baseDamage: round.baseDamage,
    });
  }

  function victory(rt: Runtime): void {
    const state = rt.state;
    if (isOver(state)) return;
    state.phase = 'over';
    state.over = { result: 'victory' };
    emit(rt, { type: 'runEnded', result: 'victory', stats: statsCopy(state) });
  }

  function advanceNode(rt: Runtime): void {
    const state = rt.state;
    state.nodeIndex++;
    if (state.nodeIndex >= state.nodes.length) {
      victory(rt);
      return;
    }
    enterNode(rt);
  }

  function finishRound(rt: Runtime, outcome: 'solved' | 'timeout' | 'died'): void {
    const state = rt.state;
    if (isOver(state)) return;
    const round = state.round;
    if (!round) return;

    state.stats.playMs += round.elapsedMs;
    if (outcome === 'solved') {
      state.stats.solves++;
      state.stats.solveMs += round.elapsedMs;
    }

    if (outcome === 'solved') {
      if (round.gauntletTotal > 1) round.gauntletAnswers.push(round.answer);
      state.lastAnswer = round.answer;
      if (round.boss) state.stats.bosses++;
    }

    // Every finished encounter pays a prize. Quick solves (3 guesses or fewer)
    // always pay 8; otherwise the base is a random 5-8. Bounty-style bonuses
    // still add on top.
    let baseGold = 0;
    if (outcome === 'solved') {
      const rolled = round.totalGuesses <= 3 ? 8 : rngPick(state, [5, 6, 7, 8]);
      baseGold = rolled + state.bonusSolveGold;
    } else if (outcome === 'timeout') {
      baseGold = 1;
    }
    const goldAward = Math.max(0, Math.floor(baseGold * goldMultiplier(state)));
    if (goldAward > 0) changeGold(rt, goldAward, RULES);

    if (outcome === 'solved') {
      runHook(rt, 'onSolve', {
        guesses: round.totalGuesses,
        elapsedMs: round.elapsedMs,
        remainingMs: round.remainingMs,
        damageTaken: round.damageTaken,
        ruledOut: ruledOutLetters(state, round).size,
        boss: round.boss,
      });
      if (isOver(state)) return;
    }

    if (outcome === 'timeout') state.stats.timeouts++;

    runHook(rt, 'onRoundEnd', {
      outcome,
      boss: round.boss,
      damageTaken: round.damageTaken,
    });
    if (isOver(state)) return;

    state.stats.rounds++;
    state.summary = {
      outcome,
      answer: round.answer,
      answers: round.gauntletTotal > 1 ? round.gauntletAnswers.slice() : undefined,
      guesses: round.totalGuesses,
      elapsedMs: round.elapsedMs,
      boss: round.boss,
      rewardPending: outcome === 'solved' && !round.boss,
      gold: goldAward,
    };
    state.phase = 'summary';

    emit(rt, {
      type: 'roundEnded',
      outcome,
      answer: round.answer,
      answers: round.gauntletTotal > 1 ? round.gauntletAnswers.slice() : undefined,
      guesses: round.totalGuesses,
      elapsedMs: round.elapsedMs,
    });
  }

  function guessDamageFor(state: RunState, round: RoundState, next = false): number {
    const boss = round.boss ? bossById.get(round.boss) : undefined;
    if (boss?.noGuessDamage) return 0;
    const last = round.guesses.length > 0
      ? round.guesses[round.guesses.length - 1]
      : undefined;
    const counts = last ? truthCounts(last.truth) : { correct: 0, present: 0 };
    const curseBonus =
      counts.correct * damagePerGreen(state) +
      counts.present * damagePerYellow(state);
    const base = boss?.damageFor
      ? boss.damageFor(state, next ? { ...round, totalGuesses: round.totalGuesses + 1 } : round)
      : round.baseDamage;
    return Math.max(0, Math.round(base + curseBonus));
  }

  function timeoutDamageFor(state: RunState, round: RoundState): number {
    return (
      2 * (guessDamageFor(state, round, true) + round.damageRamp) +
      Math.ceil(state.maxHp * 0.3)
    );
  }

  function expireRound(rt: Runtime): void {
    const state = rt.state;
    const round = state.round;
    if (!round || state.phase !== 'round') return;
    round.remainingMs = 0;
    emit(rt, { type: 'timeExpired' });
    dealDamage(rt, timeoutDamageFor(state, round), RULES, {
      ignoreArmor: true,
      ignoreImmunity: true,
      timeout: true,
    });
    if (isOver(state)) return;
    finishRound(rt, 'timeout');
  }

  // ── guessing ─────────────────────────────────────────────────────────────

  function handleSolved(rt: Runtime): void {
    const state = rt.state;
    const round = state.round;
    if (!round) return;
    const boss = round.boss ? bossById.get(round.boss) : undefined;

    if (boss?.gauntlet && round.gauntletIndex + 1 < round.gauntletTotal) {
      const solvedIndex = round.gauntletIndex + 1;
      emit(rt, {
        type: 'puzzleSolved',
        index: solvedIndex,
        total: round.gauntletTotal,
        answer: round.answer,
        elapsedMs: round.elapsedMs,
      });
      runHook(rt, 'onPuzzleSolved', {
        index: solvedIndex,
        total: round.gauntletTotal,
        elapsedMs: round.elapsedMs,
      });
      round.gauntletIndex++;
      round.gauntletAnswers.push(round.answer);
      round.guesses = [];
      round.paidGuesses = 0;
      round.damageTaken = 0;
      round.frozenUntilGuess = false;
      round.answer = chooseAnswer(rt, boss);
      emit(rt, {
        type: 'gauntletAdvanced',
        index: round.gauntletIndex,
        total: round.gauntletTotal,
        timerMs: round.remainingMs,
      });
      return;
    }

    finishRound(rt, 'solved');
  }

  function playFriendGuesses(rt: Runtime, count: number): void {
    const state = rt.state;
    const round = state.round;
    if (!round) return;

    const used = (): Set<string> => new Set(round.guesses.map((g) => g.word));
    const available = (word: string, taken: Set<string>): boolean => {
      const w = word.toLowerCase();
      return (
        w.length === WORD_LENGTH &&
        !taken.has(w) &&
        !state.blacklist.includes(w) &&
        !w.split('').some((ch) => state.purged.includes(ch))
      );
    };

    // A two-word call only ever delivers one of the friend's curated
    // catchphrases. He never improvises a pair from the random word bucket.
    if (count >= 2) {
      const taken = used();
      const phrases = content.friendPhrases.filter(
        ([first, second]) => available(first, taken) && available(second, taken),
      );
      if (phrases.length > 0) {
        const [first, second] = rngPick(state, phrases);
        if (state.phase === 'round') scorePlayerGuess(rt, first, 'friend');
        if (state.phase === 'round') scorePlayerGuess(rt, second, 'friend');
        return;
      }
      count = 1;
    }

    for (let i = 0; i < count; i++) {
      if (state.phase !== 'round') break;
      const taken = used();
      let pool = content.friendWords.filter((word) => available(word, taken));
      if (pool.length === 0) {
        pool = content.answers.filter((word) => available(word, taken));
      }
      if (pool.length === 0) break;
      const word = rngPick(state, pool);
      scorePlayerGuess(rt, word, 'friend');
    }
  }

  function scorePlayerGuess(rt: Runtime, raw: string, by: 'player' | 'friend'): void {
    const state = rt.state;
    const round = state.round;
    if (!round || state.phase !== 'round') return;

    const word = normalizeWord(raw);
    const previous = round.guesses.length > 0
      ? round.guesses[round.guesses.length - 1]
      : undefined;

    if (round.frozenUntilGuess) {
      round.frozenUntilGuess = false;
      emit(rt, {
        type: 'timerChanged',
        remainingMs: round.remainingMs,
        frozen: round.frozenMs > 0,
        source: RULES,
      });
    }

    const shieldedFree = by === 'player' && round.elapsedMs < round.immuneUntilMs;
    const naturalFree = by === 'friend' || round.freeLeft > 0;
    if (by === 'player' && naturalFree && !shieldedFree) round.freeLeft--;

    const truth = scoreGuess(round.answer, word);
    const guess: ScoredGuess = {
      word,
      truth,
      index: round.totalGuesses,
      free: naturalFree || shieldedFree,
      by,
    };

    round.totalGuesses++;
    state.stats.guesses++;
    round.guesses.push(guess);

    const mark = rt.events.length;
    rt.pendingFree = false;
    rt.pendingFreeSource = undefined;
    runHook(rt, 'onGuessScored', {
      guess,
      previous,
      elapsedMs: round.elapsedMs,
      remainingMs: round.remainingMs,
      paidIndex: round.paidGuesses,
    });
    const hookEvents = rt.events.splice(mark);

    let madeFree = false;
    if (!guess.free && rt.pendingFree) {
      guess.free = true;
      madeFree = true;
    }
    const freeSource = rt.pendingFreeSource;
    rt.pendingFree = false;
    rt.pendingFreeSource = undefined;

    const presented = presentGuess(state, guess);
    emit(rt, {
      type: 'guessScored',
      by,
      index: guess.index,
      guess: presented,
      free: guess.free,
      word,
    });
    if (madeFree) {
      emit(rt, {
        type: 'guessMadeFree',
        index: guess.index,
        source: freeSource ?? RULES,
      });
    }
    rt.events.push(...hookEvents);

    // Remember the first guess of every round even before The List exists, so
    // taking the curse can seed the blacklist with all previous rounds. The
    // curse itself blacklists only that one word per round.
    if (round.guesses.length === 1) {
      if (!state.firstGuesses.includes(word)) state.firstGuesses.push(word);
      if (hasCurse(state, 'the-list')) addBlacklist(rt, word);
    }

    if (isOver(state)) return;

    // A correct guess never hurts you. A wrong paid guess takes the fixed
    // encounter hit plus any curse scaling from eligible letters.
    const solved = word === round.answer;
    if (!solved && !guess.free && by === 'player') {
      const boss = round.boss ? bossById.get(round.boss) : undefined;
      if (!boss?.noGuessDamage) {
        round.paidGuesses++;
        const amount = guessDamageFor(state, round);
        if (amount > 0) {
          dealDamage(
            rt,
            amount,
            round.boss ? { kind: 'boss', boss: round.boss } : RULES,
          );
        }
      }
    }

    if (isOver(state)) return;
    if (solved) handleSolved(rt);
  }

  // ── reward / shop / happening ────────────────────────────────────────────

  function makeRewards(rt: Runtime): RewardOption[] {
    const state = rt.state;
    const options: RewardOption[] = [];

    const goldAmount = Math.max(1, Math.floor(5 * goldMultiplier(state)));
    options.push({
      id: 'gold',
      kind: 'gold',
      amount: goldAmount,
      label: `${goldAmount} gold`,
      description: 'A handful of coins. Always useful.',
    });

    const foods = content.foods.filter((food) => foodAvailable(state, food));
    const commonFoods = foods.filter((food) => food.rarity !== 'rare');
    const rareFoods = foods.filter((food) => food.rarity === 'rare');
    const wantSpell = content.spells.length > 0
      && (foods.length === 0 || rngChance(state, 65));
    if (wantSpell) {
      const spell = rngPick(state, content.spells);
      options.push({
        id: `spell:${spell.id}`,
        kind: 'spell',
        def: spell.id,
        label: spell.name,
        description: spell.description,
      });
    } else if (foods.length > 0) {
      const pool = rareFoods.length > 0 && rngChance(state, 10) ? rareFoods : commonFoods;
      const food = rngPick(state, pool.length > 0 ? pool : foods);
      options.push({
        id: `eat:${food.id}`,
        kind: 'eat',
        def: food.id,
        label: food.name,
        description: food.description,
      });
    }

    if (rngChance(state, 8)) {
      const owned = new Set(state.items.map((item) => item.id));
      const common = content.items.filter(
        (item) => item.rarity !== 'rare'
          && itemAvailable(state, item)
          && (item.kind !== 'gear' || !owned.has(item.id)),
      );
      const rare = content.items.filter(
        (item) => item.rarity === 'rare'
          && itemAvailable(state, item)
          && (item.kind !== 'gear' || !owned.has(item.id)),
      );
      const pool = rare.length > 0 && rngChance(state, 12) ? rare : common;
      if (pool.length > 0) {
        const item = rngPick(state, pool);
        options.push({
          id: `item:${item.id}`,
          kind: 'item',
          def: item.id,
          rarity: item.rarity,
          label: item.name,
          description: item.description,
        });
      }
    }

    return options;
  }

  function openReward(rt: Runtime): void {
    const state = rt.state;
    const options = makeRewards(rt);
    const boss = Boolean(state.summary?.boss);
    state.reward = { options, boss };
    state.phase = 'reward';
    emit(rt, { type: 'rewardOffered', options: clone(options), boss });
  }

  function chooseReward(rt: Runtime, optionId: string): void {
    const state = rt.state;
    const reward = state.reward;
    if (!reward || state.phase !== 'reward') return;
    if (state.pendingPurge > 0) {
      emit(rt, { type: 'message', text: 'Resolve your purge before choosing a reward.' });
      return;
    }
    const option = reward.options.find((o) => o.id === optionId);
    if (!option) return;

    if (option.kind === 'gold') {
      changeGold(rt, option.amount ?? 0, RULES);
    } else if (option.kind === 'spell' && option.def) {
      addSpell(rt, option.def);
    } else if (option.kind === 'item' && option.def) {
      if (!addItem(rt, option.def)) return;
    } else if (option.kind === 'eat' && option.def) {
      eatFood(rt, option.def);
    }

    if (isOver(state)) return;

    reward.chosen = option.id;
    emit(rt, { type: 'rewardChosen', option: option.id, kind: option.kind, label: option.label });
    advanceNode(rt);
  }

  function generateOffers(rt: Runtime): Offer[] {
    const state = rt.state;
    const availableItems = content.items.filter((item) => itemAvailable(state, item));
    const commonItems = availableItems.filter((item) => item.rarity !== 'rare');
    const rareItems = availableItems.filter((item) => item.rarity === 'rare');
    const availableFoods = content.foods.filter((food) => foodAvailable(state, food));
    const commonFoods = availableFoods.filter((food) => food.rarity !== 'rare');
    const rareFoods = availableFoods.filter((food) => food.rarity === 'rare');
    const itemTarget = Math.max(0, 3 + shopItemDelta(state));
    const foodTarget = Math.max(0, 2 + shopFoodDelta(state));
    const picked: Array<{
      kind: Offer['kind'];
      def: string;
      price: number;
      sale?: boolean;
      originalPrice?: number;
    }> = [];
    const usedDefs = new Map<string, number>();
    const usedCount = (key: string): number => usedDefs.get(key) ?? 0;
    const markUsed = (key: string): void => {
      usedDefs.set(key, usedCount(key) + 1);
    };

    const pickItem = (item: ItemDef, sale = false): void => {
      markUsed(`item:${item.id}`);
      const base = sale ? Math.max(1, Math.floor(item.price / 2)) : item.price;
      picked.push({
        kind: 'item',
        def: item.id,
        price: shopPrice(state, base),
        sale,
        originalPrice: sale ? shopPrice(state, item.price) : undefined,
      });
    };
    const pickFood = (food: (typeof content.foods)[number]): void => {
      markUsed(`eat:${food.id}`);
      picked.push({ kind: 'eat', def: food.id, price: shopPrice(state, food.price) });
    };
    const pickSpell = (spell: (typeof content.spells)[number]): void => {
      markUsed(`spell:${spell.id}`);
      picked.push({ kind: 'spell', def: spell.id, price: shopPrice(state, spell.price) });
    };
    const pickRandomItem = (): boolean => {
      let pool = commonItems.filter((item) => usedCount(`item:${item.id}`) < 2);
      if (rareItems.length > 0 && rngChance(state, 10)) {
        pool = rareItems.filter((item) => usedCount(`item:${item.id}`) < 2);
      }
      if (pool.length === 0) return false;
      pickItem(rngPick(state, pool));
      return true;
    };
    const pickRandomFood = (): boolean => {
      let pool = commonFoods.filter((food) => {
        const unique = food.effects.some((effect) => effect.type === 'purgeLetter');
        return usedCount(`eat:${food.id}`) < (unique ? 1 : 2);
      });
      if (rareFoods.length > 0 && rngChance(state, 10)) {
        pool = rareFoods.filter((food) => {
          const unique = food.effects.some((effect) => effect.type === 'purgeLetter');
          return usedCount(`eat:${food.id}`) < (unique ? 1 : 2);
        });
      }
      if (pool.length === 0) return false;
      pickFood(rngPick(state, pool));
      return true;
    };

    const wantsTally = sightCount(state) > 0
      && !state.items.some((item) => item.id === 'tally-lens');
    let forceTally = wantsTally;
    for (let index = 0; index < itemTarget; index++) {
      if (forceTally) {
        forceTally = false;
        const tally = commonItems.find((item) => item.id === 'tally-lens');
        if (tally) {
          pickItem(tally);
          continue;
        }
      }
      pickRandomItem();
    }
    if (picked.length > 0) {
      const saleIndex = rngInt(state, picked.length);
      const sale = picked[saleIndex];
      if (sale.kind === 'item') {
        const original = sale.price;
        sale.price = Math.max(1, Math.floor(original / 2));
        sale.sale = true;
        sale.originalPrice = original;
      }
    }
    for (let index = 0; index < foodTarget; index++) pickRandomFood();

    const categories = ['spell', 'eat', 'item'] as const;
    const wildcard = categories[rngInt(state, categories.length)];
    if (wildcard === 'spell') {
      if (content.spells.length > 0) pickSpell(rngPick(state, content.spells));
    } else if (wildcard === 'eat') {
      pickRandomFood();
    } else {
      pickRandomItem();
    }

    return picked.map((pick, index) => ({
      id: `o${index}`,
      kind: pick.kind,
      def: pick.def,
      price: pick.price,
      sale: pick.sale,
      originalPrice: pick.originalPrice,
    }));
  }

  function openShop(rt: Runtime): void {
    const state = rt.state;
    const offers = generateOffers(rt);
    state.shop = {
      offers,
      rerollCost: shopPrice(state, 2),
      rerolls: 0,
      purchases: 0,
      visit: state.nodeIndex,
      foodOffers: offers.filter((offer) => offer.kind === 'eat').length,
      foodsBought: 0,
    };
    state.phase = 'shop';
    emit(rt, {
      type: 'shopOpened',
      offers: clone(state.shop.offers),
      rerollCost: state.shop.rerollCost,
    });
  }

  function buy(rt: Runtime, offerId: string): void {
    const state = rt.state;
    const shop = state.shop;
    if (!shop || state.phase !== 'shop') return;
    const offer = shop.offers.find((o) => o.id === offerId);
    if (!offer) {
      emit(rt, { type: 'shopRejected', offerId, reason: 'That offer is gone.' });
      return;
    }
    const discount = shop.purchases === 0 && (offer.kind === 'item' || offer.kind === 'eat')
      ? firstPurchaseDiscount(state)
      : 0;
    const price = Math.max(1, offer.price - discount);
    if (state.gold < price) {
      emit(rt, { type: 'shopRejected', offerId, reason: 'Not enough gold.' });
      return;
    }

    if (!spendGold(rt, price)) return;

    if (offer.kind === 'item') {
      addItem(rt, offer.def);
    } else if (offer.kind === 'spell') {
      addSpell(rt, offer.def);
    } else if (offer.kind === 'eat') {
      eatFood(rt, offer.def);
      shop.foodsBought++;
    }

    if (isOver(state)) return;

    shop.purchases++;
    shop.offers = shop.offers.filter((o) => o.id !== offerId);
    emit(rt, { type: 'offerBought', offerId, kind: offer.kind, price });
    runHook(rt, 'onPurchase', { offer });
  }

  function reroll(rt: Runtime): void {
    const state = rt.state;
    const shop = state.shop;
    if (!shop || state.phase !== 'shop') return;
    if (state.gold < shop.rerollCost) {
      emit(rt, { type: 'shopRejected', offerId: 'reroll', reason: 'Not enough gold.' });
      return;
    }
    spendGold(rt, shop.rerollCost, RULES);
    shop.rerolls++;
    shop.rerollCost *= 2;
    shop.offers = generateOffers(rt);
    shop.foodOffers = shop.offers.filter((offer) => offer.kind === 'eat').length;
    shop.foodsBought = 0;
    emit(rt, {
      type: 'shopRerolled',
      offers: clone(shop.offers),
      rerollCost: shop.rerollCost,
    });
  }

  function sellItem(rt: Runtime, instance: InstanceId): void {
    const state = rt.state;
    if (state.phase !== 'shop' || !state.shop) return;
    if (noSell(state)) {
      emit(rt, { type: 'message', text: 'The Chained prevents selling.' });
      return;
    }
    const item = findItem(state, instance);
    if (!item) return;
    const def = itemById.get(item.id);
    if (!def) return;
    const value = def.sellValue
      ? def.sellValue({ state, self: item })
      : Math.floor(def.price / 2);
    const view = itemView(state, item);
    removeItem(rt, instance, 'sold');
    changeGold(rt, value, RULES);
    runHook(rt, 'onSell', { item: view });
  }

  function openHappening(rt: Runtime): void {
    const state = rt.state;
    const pool = content.happenings.filter(
      (happening) => (happening.requiresCurseCount ?? 0) <= state.curses.length
        && (!happening.requiresClock || hasClock(state)),
    );
    if (pool.length === 0) {
      advanceNode(rt);
      return;
    }
    const totalWeight = pool.reduce((sum, happening) => sum + (happening.weight ?? 1), 0);
    let roll = rngNext(state) * totalWeight;
    let def = pool[pool.length - 1];
    for (const happening of pool) {
      roll -= happening.weight ?? 1;
      if (roll <= 0) {
        def = happening;
        break;
      }
    }
    state.happening = {
      id: def.id,
      options: def.options.map((option) => ({
        id: option.id,
        label: option.label,
        description: option.description,
        costGold: option.costGold,
        fallbackPct: option.fallbackPct,
        fallbackMaxArmor: option.fallbackMaxArmor,
        chancePct: option.outcomes.length === 1
          ? 100
          : option.outcomes[0]?.chancePct,
        outcomes: option.outcomes.map((o) => ({ chancePct: o.chancePct, text: o.text })),
      })),
    };
    state.phase = 'happening';
    emit(rt, {
      type: 'happeningOffered',
      happening: def.id,
      options: clone(state.happening.options),
    });
  }

  function chooseHappening(rt: Runtime, optionId: string): void {
    const state = rt.state;
    const happening = state.happening;
    if (!happening || state.phase !== 'happening' || happening.resolved) return;
    const def = happeningById.get(happening.id);
    if (!def) return;
    const option = def.options.find((o) => o.id === optionId);
    if (!option) return;

    if (option.costGold && option.costGold > 0) {
      if (state.gold >= option.costGold) {
        spendGold(rt, option.costGold, { kind: 'happening', happening: def.id });
      } else if (option.fallbackMaxArmor) {
        applyEffects(
          rt,
          [{ type: 'maxArmor', delta: -option.fallbackMaxArmor }],
          { kind: 'happening', happening: def.id },
        );
      } else if (option.fallbackPct) {
        const cost = Math.max(0, Math.floor(state.gold * option.fallbackPct));
        if (cost > 0) spendGold(rt, cost, { kind: 'happening', happening: def.id });
      } else {
        emit(rt, { type: 'message', text: 'Not enough gold.' });
        return;
      }
    }

    const roll = rngNext(state) * 100;
    let cursor = 0;
    let chosen = option.outcomes.length - 1;
    for (let i = 0; i < option.outcomes.length; i++) {
      cursor += option.outcomes[i].chancePct;
      if (roll < cursor) {
        chosen = i;
        break;
      }
    }
    const outcome = option.outcomes[chosen];
    const success = chosen === 0;

    applyEffects(rt, outcome.effects, { kind: 'happening', happening: def.id });
    happening.resolved = {
      option: option.id,
      success,
      text: outcome.text,
    };
    emit(rt, {
      type: 'happeningResolved',
      happening: def.id,
      option: option.id,
      success,
      text: outcome.text,
    });
  }

  // ── node flow ────────────────────────────────────────────────────────────

  function curseWeight(state: RunState, def: CurseDef): number {
    let weight = def.weight ?? 1;
    if (state.level <= 12 && ['la-curse', 'ts-curse', 'rip-curse'].includes(def.id)) {
      weight *= 2;
    }
    return weight;
  }

  function eligibleCurses(state: RunState, starting: boolean): CurseDef[] {
    return content.curses.filter((def) => {
      if (curseStacks(state, def.id) >= def.maxStacks) return false;
      if (starting && def.startingEligible === false) return false;
      if (def.minLevel && state.level < def.minLevel) return false;
      if (def.maxLevel && state.level > def.maxLevel) return false;
      return true;
    });
  }

  function pickWeighted(
    state: RunState,
    pool: CurseDef[],
    weightOf: (def: CurseDef) => number = (def) => curseWeight(state, def),
  ): CurseDef {
    const total = pool.reduce((sum, def) => sum + weightOf(def), 0);
    let roll = rngNext(state) * total;
    for (const def of pool) {
      roll -= weightOf(def);
      if (roll <= 0) return def;
    }
    return pool[pool.length - 1];
  }

  function pickCurseOptions(state: RunState, starting: boolean): CurseId[] {
    const pool = eligibleCurses(state, starting).slice();
    const picks: CurseId[] = [];
    while (picks.length < 2 && pool.length > 0) {
      const chosen = pickWeighted(state, pool);
      picks.push(chosen.id);
      pool.splice(pool.indexOf(chosen), 1);
    }
    return picks;
  }

  function openCurseDraft(rt: Runtime, starting: boolean): void {
    const state = rt.state;
    const options = pickCurseOptions(state, starting);
    if (options.length === 0) {
      if (starting && state.pendingStartingCurses > 0) {
        state.pendingStartingCurses = 0;
        enterNode(rt);
      } else {
        advanceNode(rt);
      }
      return;
    }
    state.curse = { options, starting };
    state.phase = 'curse';
    emit(rt, { type: 'curseOffered', options: options.slice(), starting });
  }

  /** Unequip overflow when the slot count shrinks, keeping the bag usable. */
  function enforceSlotCapacity(state: RunState): string[] {
    let equippedCost = 0;
    const dropped: string[] = [];
    for (const item of state.items) {
      const def = itemById.get(item.id);
      const cost = def ? itemSlots(def) : 0;
      if (item.equipped === false || cost === 0) continue;
      if (equippedCost + cost > state.slots) {
        item.equipped = false;
        dropped.push(def?.name ?? item.id);
        continue;
      }
      equippedCost += cost;
    }
    return dropped;
  }

  function applyCurse(rt: Runtime, id: CurseId): void {
    const state = rt.state;
    const def = curseById.get(id);
    if (!def) return;
    let entry = state.curses.find((curse) => curse.id === id);
    if (entry && entry.stacks >= def.maxStacks) return;
    if (!entry) {
      entry = { id, stacks: 0 };
      state.curses.push(entry);
    }
    entry.stacks++;
    if (def.maxHpMult) {
      const before = state.maxHp;
      state.maxHp = Math.max(1, Math.floor(state.maxHp * def.maxHpMult));
      state.hp = Math.min(state.hp, state.maxHp);
      emit(rt, { type: 'maxHpChanged', maxHp: state.maxHp, hp: state.hp, source: RULES });
      if (state.maxHp !== before) {
        // Max HP changed; the event above carries the new value.
      }
    }
    if (def.slotDelta) {
      state.slots = Math.max(0, state.slots + def.slotDelta);
      emit(rt, { type: 'slotsChanged', slots: state.slots });
      const dropped = enforceSlotCapacity(state);
      if (dropped.length > 0) {
        emit(rt, {
          type: 'message',
          text: `Slots tightened. Moved to the bag: ${dropped.join(', ')}.`,
        });
      }
    }
    if (def.id === 'the-list') {
      const before = state.blacklist.length;
      for (const word of state.firstGuesses) {
        if (!state.blacklist.includes(word)) state.blacklist.push(word);
      }
      if (state.blacklist.length !== before) {
        emit(rt, { type: 'blacklistChanged', list: state.blacklist.slice() });
      }
    }
    emit(rt, { type: 'curseChosen', curse: id, stacks: entry.stacks, name: def.name });
    runHook(rt, 'onCurseGained', { curse: id, stacks: entry.stacks });
  }

  function chooseCurse(rt: Runtime, curseId: CurseId): void {
    const state = rt.state;
    const draft = state.curse;
    if (!draft || state.phase !== 'curse' || !draft.options.includes(curseId)) return;
    applyCurse(rt, curseId);
    draft.chosen = curseId;
    if (draft.starting && state.pendingStartingCurses > 0) {
      state.pendingStartingCurses--;
      if (state.pendingStartingCurses > 0) {
        openCurseDraft(rt, true);
        return;
      }
      state.curse = undefined;
      state.phase = 'round';
      enterNode(rt);
      return;
    }
    state.curse = undefined;
    advanceNode(rt);
  }

  function removeCurse(rt: Runtime, curseId: CurseId): void {
    const state = rt.state;
    if (state.pendingCurseRemoval <= 0) return;
    const index = state.curses.findIndex((curse) => curse.id === curseId);
    if (index < 0) return;
    const entry = state.curses[index];
    const def = curseById.get(curseId);
    entry.stacks--;
    if (def?.slotDelta) {
      state.slots = Math.max(0, state.slots - def.slotDelta);
      emit(rt, { type: 'slotsChanged', slots: state.slots });
    }
    if (entry.stacks <= 0) state.curses.splice(index, 1);
    if (curseId === 'the-list' && entry.stacks <= 0) clearBlacklist(rt);
    state.pendingCurseRemoval--;
    emit(rt, { type: 'curseRemoved', curse: curseId, stacks: entry.stacks });
    if (state.pendingCurseRemoval <= 0 && state.phase === 'happening') {
      // The event remains resolved; CONTINUE advances normally.
    }
  }

  function enterNode(rt: Runtime): void {
    const state = rt.state;
    if (state.nodeIndex >= state.nodes.length) {
      victory(rt);
      return;
    }
    const node = state.nodes[state.nodeIndex];
    state.level = node.level ?? state.nodeIndex + 1;
    state.act = Math.floor((state.level - 1) / LEVELS_PER_AREA);
    emit(rt, {
      type: 'nodeEntered',
      index: state.nodeIndex,
      kind: node.kind,
      act: state.act,
      level: state.level,
    });

    if (node.kind === 'curse') {
      openCurseDraft(rt, false);
      return;
    }
    if (node.kind === 'boss' && node.boss) {
      state.phase = 'bossIntro';
      state.bossIntro = { boss: node.boss };
      state.round = undefined;
      emit(rt, { type: 'bossIntro', boss: node.boss });
      return;
    }
    if (node.kind === 'round' || node.kind === 'boss') {
      startRound(rt);
    } else if (node.kind === 'shop') {
      openShop(rt);
    } else {
      openHappening(rt);
    }
  }

  function continueRun(rt: Runtime): void {
    const state = rt.state;
    if (state.pendingPurge > 0) {
      emit(rt, { type: 'message', text: 'Choose a letter to purge first.' });
      return;
    }
    if (state.pendingCurseRemoval > 0) {
      emit(rt, { type: 'message', text: 'Choose a curse to remove first.' });
      return;
    }
    if (state.phase === 'curse') {
      emit(rt, { type: 'message', text: 'Choose a curse first.' });
      return;
    }
    if (state.phase === 'bossIntro') {
      startRound(rt);
      return;
    }
    if (state.phase === 'summary') {
      if (state.summary?.rewardPending) openReward(rt);
      else advanceNode(rt);
      return;
    }
    if (state.phase === 'shop') {
      advanceNode(rt);
      return;
    }
    if (state.phase === 'happening') {
      if (!state.happening?.resolved) {
        emit(rt, { type: 'message', text: 'Choose an option first.' });
        return;
      }
      advanceNode(rt);
    }
  }

  // ── spell / item commands ────────────────────────────────────────────────

  function castSpellById(rt: Runtime, id: SpellId): void {
    const state = rt.state;
    const def = spellById.get(id);
    if (!def) return;
    if (def.usable === 'round' && (state.phase !== 'round' || !state.round)) return;
    emit(rt, { type: 'spellCast', spell: { instance: uid(state, 's'), id: def.id } });
    applyEffects(rt, def.cast({ state }), { kind: 'spell', spell: def.id });
    if (isOver(state)) return;
    runHook(rt, 'onSpellCast', { spell: def.id });
  }

  function castSpell(rt: Runtime, instance: InstanceId): void {
    const state = rt.state;
    if (isOver(state)) return;
    const index = state.spells.findIndex((s) => s.instance === instance);
    if (index < 0) {
      emit(rt, { type: 'spellRejected', instance, reason: 'Spell not found.' });
      return;
    }
    const spell = state.spells[index];
    const def = spellById.get(spell.id);
    if (!def) return;
    if (def.usable === 'round' && (state.phase !== 'round' || !state.round)) {
      emit(rt, { type: 'spellRejected', instance, reason: 'Only usable during a round.' });
      return;
    }
    state.spells.splice(index, 1);
    emit(rt, { type: 'spellCast', spell: spellView(spell) });
    applyEffects(rt, def.cast({ state }), { kind: 'spell', spell: def.id });
    if (isOver(state)) return;
    runHook(rt, 'onSpellCast', { spell: def.id });
  }

  function useItem(rt: Runtime, instance: InstanceId): void {
    const state = rt.state;
    if (isOver(state)) return;
    const item = findItem(state, instance);
    if (!item) return;
    const def = itemById.get(item.id);
    if (!def?.onUse) {
      emit(rt, { type: 'message', text: 'That item cannot be used.' });
      return;
    }
    applyEffects(rt, def.onUse({ state, self: item }), { kind: 'item', instance }, instance);
    if (isOver(state)) return;
    if (def.kind === 'consumable' && findItem(state, instance)) {
      removeItem(rt, instance, 'consumed');
    }
  }

  // ── tick ─────────────────────────────────────────────────────────────────

  function tick(rt: Runtime, dtMs: number): void {
    const state = rt.state;
    const round = state.round;
    if (state.phase !== 'round' || !round) return;
    let dt = Math.min(Math.max(0, Math.floor(dtMs)), 2_000);
    if (dt <= 0) return;

    if (round.frozenUntilGuess) return;

    if (round.frozenMs > 0) {
      const used = Math.min(round.frozenMs, dt);
      round.frozenMs -= used;
      dt -= used;
      if (round.frozenMs === 0) {
        emit(rt, {
          type: 'timerChanged',
          remainingMs: round.remainingMs,
          frozen: false,
          source: RULES,
        });
      }
      if (dt <= 0) return;
    }

    if (round.remainingMs === null) {
      round.elapsedMs += dt;
      runHook(rt, 'onTimerTick', {
        remainingMs: null,
        elapsedMs: round.elapsedMs,
        dtMs: dt,
      });
      return;
    }

    round.elapsedMs += dt;
    round.remainingMs = Math.max(0, round.remainingMs - dt);
    runHook(rt, 'onTimerTick', {
      remainingMs: round.remainingMs,
      elapsedMs: round.elapsedMs,
      dtMs: dt,
    });
    if (isOver(state)) return;
    if (round.remainingMs <= 0) expireRound(rt);
  }

  // ── view ─────────────────────────────────────────────────────────────────

  function boardView(state: RunState): BoardView {
    const round = state.round as RoundState;
    const boss = round.boss ? bossById.get(round.boss) : undefined;
    // damageFor describes the hit a wrong guess takes at the round's current
    // progress, so preview the next guess by stepping the counter forward.
    const rawNext = guessDamageFor(state, round, true);
    const timeoutDamage = timeoutDamageFor(state, round);
    const noGuessDamage = Boolean(boss?.noGuessDamage);
    const timerInterest = state.items.some((item) => {
      const def = itemById.get(item.id);
      return Boolean(def?.timerInterest) && isEquipped(item, def);
    });
    const timerMode = round.remainingMs !== null
      ? 'countdown'
      : timerInterest
        ? 'countup'
        : 'hidden';

    const keyboard: Partial<Record<Letter, KeyboardStatus>> = {};
    const rank: Record<string, number> = { absent: 0, hit: 1, present: 2, correct: 3 };
    for (const guess of round.guesses) {
      const shown = presentGuess(state, guess);
      shown.tiles.forEach((tile, index) => {
        if (tile === 'hidden') return;
        const letter = guess.word[index];
        const current = keyboard[letter];
        const nextStatus = tile as KeyboardStatus;
        if (!current || nextStatus === 'purged') {
          keyboard[letter] = nextStatus;
        } else if (rank[nextStatus] !== undefined && (rank[current] ?? -1) < rank[nextStatus]) {
          keyboard[letter] = nextStatus;
        }
      });
    }
    for (const [letter, status] of Object.entries(round.hints ?? {})) {
      const current = keyboard[letter];
      if (current === 'correct') continue;
      if (status === 'present') {
        if (current !== 'present') keyboard[letter] = 'present';
      } else if (!current || current === 'absent') {
        keyboard[letter] = 'absent';
      }
    }
    for (const letter of state.purged) {
      if (!keyboard[letter] || keyboard[letter] === 'absent') keyboard[letter] = 'purged';
    }

    return {
      guesses: round.guesses.map((guess) => presentGuess(state, guess)),
      freeGuessesLeft: round.freeLeft,
      nextGuessDamage: round.freeLeft > 0 || noGuessDamage ? 0 : rawNext,
      rawNextGuessDamage: rawNext,
      timeoutDamage,
      remainingMs: round.remainingMs,
      timerStartMs: round.timerStartMs,
      elapsedMs: round.elapsedMs,
      timerMode,
      timerFrozen: round.frozenUntilGuess || round.frozenMs > 0,
      keyboard,
      bossState: { ...round.bossState },
      gauntletIndex: round.gauntletIndex,
      gauntletTotal: round.gauntletTotal,
      noGuessDamage,
      hints: { ...round.hints },
      ruledOut: ruledOutLetters(state, round).size,
      shielded: round.elapsedMs < round.immuneUntilMs,
      shieldMsLeft: Math.max(0, round.immuneUntilMs - round.elapsedMs),
    };
  }

  function view(state: RunState): RunView {
    let phase: PhaseView;
    switch (state.phase) {
      case 'round':
        phase = {
          kind: 'round',
          boss: state.round?.boss,
          board: boardView(state),
        };
        break;
      case 'summary':
        phase = {
          kind: 'summary',
          outcome: state.summary?.outcome ?? 'timeout',
          answer: state.summary?.answer ?? '',
          answers: state.summary?.answers?.slice(),
          guesses: state.summary?.guesses ?? 0,
          elapsedMs: state.summary?.elapsedMs ?? 0,
          boss: state.summary?.boss,
          rewardPending: state.summary?.rewardPending ?? false,
          gold: state.summary?.gold ?? 0,
        };
        break;
      case 'reward':
        phase = {
          kind: 'reward',
          options: clone(state.reward?.options ?? []),
          boss: state.reward?.boss ?? false,
          chosen: state.reward?.chosen,
        };
        break;
      case 'bossIntro':
        phase = {
          kind: 'bossIntro',
          boss: state.bossIntro?.boss ?? state.nodes[state.nodeIndex]?.boss ?? '',
        };
        break;
      case 'curse':
        phase = {
          kind: 'curse',
          options: state.curse?.options.slice() ?? [],
          starting: state.curse?.starting ?? false,
        };
        break;
      case 'shop':
        phase = {
          kind: 'shop',
          offers: clone(state.shop?.offers ?? []),
          rerollCost: state.shop?.rerollCost ?? 2,
          purchases: state.shop?.purchases ?? 0,
        };
        break;
      case 'happening':
        phase = {
          kind: 'happening',
          happening: state.happening?.id ?? '',
          options: clone(state.happening?.options ?? []),
          resolved: state.happening?.resolved,
        };
        break;
      case 'over':
      default:
        phase = {
          kind: 'over',
          result: state.over?.result ?? 'defeat',
          answer: state.over?.answer,
          answers: state.over?.answers ? state.over.answers.slice() : undefined,
          stats: statsCopy(state),
        };
        break;
    }

    return {
      phase,
      nodes: clone(state.nodes),
      nodeIndex: state.nodeIndex,
      level: state.level,
      act: state.act,
      ascension: state.ascension,
      curses: state.curses.map((entry) => {
        const def = curseById.get(entry.id);
        return {
          id: entry.id,
          name: def?.name ?? entry.id,
          stacks: entry.stacks,
          rules: def?.rules ?? [],
          tags: def?.tags ?? [],
        };
      }),
      pendingCurseRemoval: state.pendingCurseRemoval,
      hp: state.hp,
      maxHp: state.maxHp,
      armor: state.armor,
      maxArmor: state.maxArmor,
      gold: state.gold,
      slots: { used: usedSlots(state), total: state.slots },
      items: state.items.map((item) => itemView(state, item)),
      spells: state.spells.map((s) => spellView(s)),
      blacklist: state.blacklist.slice(),
      purged: state.purged.slice(),
      revealed: state.phase === 'round' || state.phase === 'summary'
        ? Object.entries(state.round?.hints ?? {})
            .filter((entry): entry is [string, 'present' | 'absent'] => Boolean(entry[1]))
            .map(([letter, status]) => ({ letter, status }))
        : [],
      pendingPurge: state.pendingPurge,
      lastAnswer: state.lastAnswer,
      stats: statsCopy(state),
    };
  }

  // ── commands ─────────────────────────────────────────────────────────────

  function step(state: RunState, cmd: Command): StepResult {
    const draft = clone(state);
    const rt: Runtime = {
      state: draft,
      events: [],
      source: RULES,
      pendingFree: false,
      depth: 0,
      dying: false,
    };
    const round = draft.round;

    switch (cmd.type) {
      case 'guess': {
        if (draft.phase !== 'round' || !round) {
          emit(rt, { type: 'guessRejected', word: normalizeWord(cmd.word), reason: 'wrongPhase' });
          break;
        }
        if (draft.pendingPurge > 0) {
          emit(rt, { type: 'message', text: 'Choose a letter to purge first.' });
          break;
        }
        const word = normalizeWord(cmd.word);
        if (word.length !== WORD_LENGTH) {
          emit(rt, { type: 'guessRejected', word, reason: 'wrongLength' });
          break;
        }
        if (!content.valid.has(word) && !allowsInvalidGuesses(draft)) {
          emit(rt, { type: 'guessRejected', word, reason: 'notAWord' });
          break;
        }
        if (draft.blacklist.includes(word)) {
          emit(rt, { type: 'guessRejected', word, reason: 'blacklisted' });
          break;
        }
        if (word.split('').some((ch) => draft.purged.includes(ch))) {
          emit(rt, { type: 'guessRejected', word, reason: 'purgedLetter' });
          break;
        }
        scorePlayerGuess(rt, word, 'player');
        break;
      }
      case 'castSpell':
        castSpell(rt, cmd.instance);
        break;
      case 'useItem':
        useItem(rt, cmd.instance);
        break;
      case 'purgeLetter':
        if (draft.pendingPurge <= 0) {
          emit(rt, { type: 'message', text: 'You have nothing to purge.' });
          break;
        }
        if (purgeLetterNow(rt, cmd.letter)) draft.pendingPurge--;
        break;
      case 'tick':
        tick(rt, cmd.dtMs);
        break;
      case 'buy':
        buy(rt, cmd.offerId);
        break;
      case 'reroll':
        reroll(rt);
        break;
      case 'sell':
        sellItem(rt, cmd.instance);
        break;
      case 'equipItem':
        equipItem(rt, cmd.instance);
        break;
      case 'unequipItem':
        unequipItem(rt, cmd.instance);
        break;
      case 'choose':
        chooseHappening(rt, cmd.optionId);
        break;
      case 'chooseReward':
        chooseReward(rt, cmd.optionId);
        break;
      case 'chooseCurse':
        chooseCurse(rt, cmd.curseId);
        break;
      case 'removeCurse':
        removeCurse(rt, cmd.curseId);
        break;
      case 'continue':
        continueRun(rt);
        break;
    }

    return { state: draft, events: rt.events };
  }

  // ── run construction / serialization ─────────────────────────────────────

  function rollNodes(state: RunState): void {
    const nodes: RunNode[] = [];
    const addRound = (level: number): void => {
      nodes.push({ kind: 'round', level });
      if (rngChance(state, 40)) nodes.push({ kind: 'happening', level });
    };

    for (let level = 1; level <= 45; level++) {
      addRound(level);
      if (level % 2 === 1) {
        nodes.push({ kind: 'shop', level });
      } else if (level <= 44) {
        nodes.push({ kind: 'curse', level });
      }
    }

    addRound(46);
    for (let level = 47; level <= 49; level++) {
      nodes.push({ kind: 'curse', level });
    }
    nodes.push({ kind: 'boss', level: MAX_LEVEL, boss: 'final-boss' });
    state.nodes = nodes;
  }

  function newRun(opts: { seed: string; ascension?: number }): StepResult {
    const seed = String(opts.seed || 'blacklist');
    const ascension = Math.max(0, Math.min(ASCENSION_MAX, Math.floor(opts.ascension ?? 0)));
    const startingCurses = ascensionStartingCurses(ascension);
    const maxHp = 16;
    const startArmor = 2;
    const state: RunState = {
      version: VERSION,
      seed,
      rng: hashSeed(seed),
      nextId: 1,
      ascension,
      nodes: [],
      nodeIndex: 0,
      level: 1,
      act: 0,
      hp: maxHp,
      maxHp,
      armor: startArmor,
      maxArmor: startArmor,
      gold: 10,
      slots: 5,
      bonusTimeMs: 0,
      bonusBaseDamage: 0,
      bonusSolveGold: 0,
      items: [],
      spells: [],
      blacklist: [],
      firstGuesses: [],
      purged: [],
      usedAnswers: [],
      pendingPurge: 0,
      pendingAbsent: 0,
      pendingReveals: [],
      permanentReveals: [],
      curses: [],
      pendingStartingCurses: startingCurses,
      pendingCurseRemoval: 0,
      phase: 'round',
      stats: {
        rounds: 0,
        guesses: 0,
        goldEarned: 0,
        bosses: 0,
        timeouts: 0,
        damageTaken: 0,
        solves: 0,
        solveMs: 0,
        playMs: 0,
      },
    };

    rollNodes(state);
    const rt: Runtime = {
      state,
      events: [],
      source: RULES,
      pendingFree: false,
      depth: 0,
      dying: false,
    };
    emit(rt, {
      type: 'runStarted',
      seed,
      ascension,
      nodes: clone(state.nodes),
    });
    if (startingCurses > 0) openCurseDraft(rt, true);
    else enterNode(rt);
    return { state, events: rt.events };
  }

  function serialize(state: RunState): string {
    return JSON.stringify(state);
  }

  function deserialize(json: string): RunState | null {
    try {
      const parsed = JSON.parse(json) as Partial<RunState> | null;
      if (!parsed || typeof parsed !== 'object') return null;
      if (parsed.version !== VERSION) return null;
      if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.items)) return null;
      if (typeof parsed.hp !== 'number' || typeof parsed.maxHp !== 'number') return null;
      if (typeof parsed.rng !== 'number') return null;

      const state = parsed as RunState;
      const fromVersion = typeof parsed.version === 'number' ? parsed.version : 0;
      state.version = VERSION;
      state.ascension = typeof state.ascension === 'number'
        ? Math.max(0, Math.min(ASCENSION_MAX, Math.floor(state.ascension)))
        : 0;
      // Version 5 gives every run one more slot than it had before, because
      // relics now compete with gear for space.
      if (fromVersion < 5) {
        state.slots = (typeof state.slots === 'number' ? state.slots : 4) + 1;
      } else if (typeof state.slots !== 'number') {
        state.slots = 5;
      }
      state.bonusSolveGold = typeof state.bonusSolveGold === 'number' ? state.bonusSolveGold : 0;
      if (!Array.isArray(state.curses)) state.curses = [];
      if (!Array.isArray(state.firstGuesses)) state.firstGuesses = state.blacklist.slice();
      if (typeof state.level !== 'number') {
        state.level = state.nodes[state.nodeIndex]?.level ?? 1;
      }
      if (typeof state.pendingStartingCurses !== 'number') state.pendingStartingCurses = 0;
      if (typeof state.pendingCurseRemoval !== 'number') state.pendingCurseRemoval = 0;
      if (typeof state.pendingAbsent !== 'number') state.pendingAbsent = 0;
      if (!Array.isArray(state.pendingReveals)) state.pendingReveals = [];
      if (!Array.isArray(state.permanentReveals)) {
        state.permanentReveals = state.pendingReveals.slice();
      }
      state.pendingReveals = [];
      delete (state as RunState & { blacklistCapacity?: number }).blacklistCapacity;
      // Retired item ids are remapped or dropped so an old save can never
      // reference a definition the current content set no longer ships.
      const itemMigrations: Record<string, string> = {
        'null-lens': 'pen-club',
        'midas-relic': 'gilded-fork',
      };
      state.items = state.items
        .map((item) => {
          const mapped = itemMigrations[item.id];
          return mapped ? { ...item, id: mapped } : item;
        })
        .filter((item) => itemById.has(item.id));
      for (const item of state.items) {
        if (typeof item.equipped !== 'boolean') item.equipped = true;
      }
      // A save that predates relic slots can be over capacity. Unequip the
      // overflow rather than leaving a loadout the UI cannot represent.
      let equippedCost = 0;
      for (const item of state.items) {
        const def = itemById.get(item.id);
        const cost = def ? itemSlots(def) : 0;
        if (item.equipped === false || cost === 0) continue;
        if (equippedCost + cost > state.slots) {
          item.equipped = false;
          continue;
        }
        equippedCost += cost;
      }
      if (state.round) {
        if (!state.round.hints || typeof state.round.hints !== 'object') {
          state.round.hints = {};
        }
        if (typeof state.round.immuneUntilMs !== 'number') {
          state.round.immuneUntilMs = 0;
        }
        if (typeof state.round.damageRamp !== 'number') {
          state.round.damageRamp = 0;
        }
      }
      // Older saves can still have the retired upgrade offer kind. Drop those
      // entries rather than rendering a shelf the new client cannot price.
      if (state.shop) {
        state.shop.offers = state.shop.offers.filter(
          (offer) => (offer.kind as string) !== 'upgrade',
        );
        if (typeof state.shop.purchases !== 'number') state.shop.purchases = 0;
        if (typeof state.shop.visit !== 'number') state.shop.visit = state.nodeIndex;
        if (typeof state.shop.foodOffers !== 'number') {
          state.shop.foodOffers = state.shop.offers.filter((offer) => offer.kind === 'eat').length;
        }
        if (typeof state.shop.foodsBought !== 'number') state.shop.foodsBought = 0;
      }
      if (state.reward) {
        state.reward.options = state.reward.options.filter(
          (option) => (option.kind as string) !== 'upgrade',
        );
      }
      if (state.phase === 'bossIntro' && !state.bossIntro) {
        const boss = state.nodes[state.nodeIndex]?.boss;
        if (boss) state.bossIntro = { boss };
      }
      return state;
    } catch {
      return null;
    }
  }

  return { newRun, step, view, serialize, deserialize };
}
