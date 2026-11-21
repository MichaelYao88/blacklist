import type {
  BoardView,
  BossDef,
  CharacterId,
  Content,
  Core,
  CurseDef,
  CurseId,
  Effect,
  GameEvent,
  HappeningDef,
  HappeningOptionView,
  InstanceId,
  ItemDef,
  ItemInstance,
  ItemView,
  ItemCtx,
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
  autoCasts: number;
  autoCapped: boolean;
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
    const limit = 300_000 * Math.pow(0.6, Math.max(0, stacks - 1));
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
    curseDefs(state).reduce(
      (sum, entry) => sum + (entry.def.damagePerGreen ?? 0) * entry.stacks,
      0,
    );

  const damagePerFirstReveal = (state: RunState): number =>
    curseDefs(state).reduce(
      (sum, entry) => sum + (entry.def.damagePerFirstReveal ?? 0) * entry.stacks,
      0,
    );

  const itemAvailable = (state: RunState, def: ItemDef): boolean => {
    if (def.requiresClock && !hasClock(state)) return false;
    if (def.requiresVisionCurse && sightCount(state) < def.requiresVisionCurse) return false;
    return true;
  };

  const foodAvailable = (
    state: RunState,
    def: (typeof content.foods)[number],
  ): boolean => {
    if (def.unique && state.eatenFoods.includes(def.id)) return false;
    if (def.requiresVisionCurse && sightCount(state) < def.requiresVisionCurse) return false;
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
      // Flat gain bonuses stack after any multipliers.
      for (const item of state.items) {
        const def = itemById.get(item.id);
        if (!def?.goldGainBonus || !isEquipped(item, def)) continue;
        amount += def.goldGainBonus;
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
    rt.state.goldSpent = (rt.state.goldSpent ?? 0) + amount;
    runHook(rt, 'onGoldSpent', { amount, total: rt.state.gold });
    return true;
  }

  function heal(rt: Runtime, amount: number, source: Source): number {
    if (amount <= 0) return 0;
    const state = rt.state;
    const before = state.hp;
    const adjusted = Math.max(1, Math.round(amount * healMultiplier(state)));
    state.hp = Math.min(state.maxHp, state.hp + adjusted);
    const applied = state.hp - before;
    if (applied > 0) {
      emit(rt, { type: 'healed', amount: applied, hp: state.hp, source });
      runHook(rt, 'onHeal', { amount: applied, hp: state.hp });
    }
    return applied;
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
  function revealPermanentLetter(rt: Runtime, raw: string): void {
    const state = rt.state;
    const letter = raw.toLowerCase();
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
  }

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

  const hasPurgedLetter = (state: RunState, word: string): boolean =>
    word.split('').some((ch) => state.purged.includes(ch));

  const legalAnswers = (state: RunState): string[] =>
    content.answers.filter((word) => !hasPurgedLetter(state, word));

  const legalAnswerExists = (state: RunState): boolean =>
    legalAnswers(state).length > 0;

  /**
   * Purging can never leave the run without a guessable answer. If it does,
   * restore random purged letters until at least one word is legal again.
   */
  function restoreLegalWords(rt: Runtime, attempted?: Letter): string[] {
    const state = rt.state;
    if (legalAnswerExists(state)) return [];
    const restored: string[] = [];
    while (!legalAnswerExists(state) && state.purged.length > 0) {
      const index = rngInt(state, state.purged.length);
      restored.push(state.purged[index]);
      state.purged.splice(index, 1);
    }
    if (restored.length > 0) {
      const letters = restored.map((letter) => letter.toUpperCase()).join(', ');
      const verb = restored.length === 1 ? 'was' : 'were';
      const attemptedRestored = Boolean(attempted && restored.includes(attempted));
      emit(rt, {
        type: 'message',
        text: attemptedRestored
          ? `Purging ${attempted!.toUpperCase()} would leave no legal words, so it was restored.`
          : attempted
            ? `Purging ${attempted.toUpperCase()} left no legal words, so ${letters} ${verb} restored.`
            : `No legal words remained, so ${letters} ${verb} restored.`,
      });
    }
    return restored;
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
    state.purged.push(ch);
    restoreLegalWords(rt, ch);
    if (!state.purged.includes(ch)) return false;
    // If a finished round is still in state and its answer contains the letter,
    // swap that dead answer for a valid one. The real next answer is chosen when
    // the next round starts, but this keeps every stale read consistent.
    if (!liveRound && state.round && state.round.answer.includes(ch)) {
      const remaining = legalAnswers(state);
      if (remaining.length > 0) state.round.answer = rngPick(state, remaining);
    }
    emit(rt, { type: 'letterPurged', letter: ch });
    return true;
  }

  function purgeRandomLetter(rt: Runtime): boolean {
    const state = rt.state;
    const liveRound = state.phase === 'round' ? state.round : undefined;
    const blocked = new Set<string>(state.purged);
    if (liveRound) {
      for (const letter of liveRound.answer) blocked.add(letter);
    }
    const candidates = ALPHABET.filter((letter) => {
      if (blocked.has(letter)) return false;
      return content.answers.some(
        (word) => !word.includes(letter) && !word.split('').some((c) => state.purged.includes(c)),
      );
    });
    if (candidates.length === 0) {
      emit(rt, { type: 'message', text: 'No letter can be purged right now.' });
      return false;
    }
    return purgeLetterNow(rt, rngPick(state, candidates));
  }

  // ── items / spells ───────────────────────────────────────────────────────

  function addItem(rt: Runtime, id: string): boolean {
    const state = rt.state;
    const def = itemById.get(id);
    if (!def) return false;
    if (!itemAvailable(state, def)) {
      emit(rt, { type: 'message', text: `${def.name} is not available yet.` });
      return false;
    }
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
    if (equip && def.equipMaxArmor) {
      changeMaxArmor(rt, def.equipMaxArmor);
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
    if (def.equipMaxArmor) changeMaxArmor(rt, def.equipMaxArmor);
  }

  function unequipItem(rt: Runtime, instance: InstanceId): void {
    const state = rt.state;
    const item = findItem(state, instance);
    if (!item) return;
    const def = itemById.get(item.id);
    if (!def || itemSlots(def) === 0 || item.equipped === false) return;
    item.equipped = false;
    emit(rt, { type: 'itemEquipped', instance, equipped: false });
    if (def.equipMaxArmor) changeMaxArmor(rt, -def.equipMaxArmor);
  }

  function removeItem(rt: Runtime, instance: InstanceId, reason: 'sold' | 'consumed' | 'replaced'): void {
    const state = rt.state;
    const index = state.items.findIndex((i) => i.instance === instance);
    if (index < 0) return;
    const item = state.items[index];
    const def = itemById.get(item.id);
    if (item.equipped !== false && def?.equipMaxArmor) {
      changeMaxArmor(rt, -def.equipMaxArmor);
    }
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

  /**
   * Muffin Tin: arm the current shop. Each tin eaten this visit adds a stack;
   * every food eaten adds +1 max armor per stack. The armor is permanent, but
   * the counting stops when the shop is left.
   */
  function armMuffinTin(rt: Runtime): void {
    const state = rt.state;
    const shop = state.shop;
    if (!shop || state.phase !== 'shop') return;
    if (state.muffinShopVisit !== shop.visit) {
      state.muffinShopVisit = shop.visit;
      state.muffinStacks = 0;
    }
  }

  function eatFood(rt: Runtime, id: string): void {
    const state = rt.state;
    const def = foodById.get(id);
    if (!def) return;
    if (def.unique && !state.eatenFoods.includes(def.id)) {
      state.eatenFoods.push(def.id);
    }
    const hasPotluck = state.items.some((item) => {
      const itemDef = itemById.get(item.id);
      return Boolean(itemDef?.doubleFood) && isEquipped(item, itemDef);
    });
    // Potluck only doubles the first food of each level, so rerolling a shop
    // cannot multiply the same level's food over and over. Food from rewards
    // goes through this same path, so it counts (and doubles) as well.
    const doubled = hasPotluck && state.potluckLevel !== state.level;
    if (doubled) state.potluckLevel = state.level;
    emit(rt, { type: 'foodEaten', food: def.id, name: def.name });
    applyEffects(rt, doubled ? [...def.effects, ...def.effects] : def.effects, RULES);
    const shop = state.shop;
    if (shop && state.phase === 'shop') {
      shop.foodsEaten = (shop.foodsEaten ?? 0) + 1;
      if (state.muffinShopVisit === shop.visit) {
        const stacks = state.muffinStacks ?? 0;
        if (stacks > 0) changeMaxArmor(rt, stacks);
        if (def.id === 'muffin-tin') state.muffinStacks = stacks + 1;
      }
    } else if (def.id === 'muffin-tin') {
      // Eaten outside a shop: a tin never pays for itself, but existing tins
      // still pay now and the new stack waits for the next shop.
      const stacks = state.pendingMuffinStacks ?? 0;
      if (stacks > 0) changeMaxArmor(rt, stacks);
      state.pendingMuffinStacks = stacks + 1;
    }
    runHook(rt, 'onEat', { food: def.id });
  }

  // ── damage / death / revive ──────────────────────────────────────────────

  interface DamageOptions {
    ignoreArmor?: boolean;
    ignoreImmunity?: boolean;
    /** This damage comes from a guess, so the Immunity spell can block it. */
    guess?: boolean;
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

    const blocked = (): void => {
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
    };

    if (round && !options.ignoreImmunity && round.elapsedMs < round.immuneUntilMs) {
      blocked();
      return;
    }

    if (round && options.guess && !options.ignoreImmunity) {
      if (round.elapsedMs < round.guessImmuneUntilMs) {
        blocked();
        return;
      }
      if (round.immuneGuesses > 0) {
        round.immuneGuesses--;
        round.guessImmuneUntilMs = round.elapsedMs + 4_000;
        emit(rt, { type: 'immunityChanged', guessesLeft: round.immuneGuesses });
        blocked();
        return;
      }
    }

    // Armor is a pool of damage reduction, not an all-or-nothing charge:
    // each point soaks one point of the hit before HP is touched.
    const armorPierce = curseDefs(state).reduce(
      (highest, entry) => Math.max(highest, entry.def.armorPierce ?? 0),
      0,
    );
    let armorUsed = round && !options.ignoreArmor
      ? Math.min(state.armor, modified)
      : 0;
    if (armorPierce > 0) {
      armorUsed = Math.min(armorUsed, Math.floor(modified * (1 - armorPierce)));
    }
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

    if (state.hp <= 0) finishDeath(rt, 'damage');
  }

  function finishDeath(rt: Runtime, sourceText: string): void {
    finishRun(rt, sourceText, 'died', true);
  }

  function finishRun(
    rt: Runtime,
    sourceText: string,
    outcome: 'died' | 'timeout',
    allowRevive: boolean,
  ): void {
    const state = rt.state;
    if (isOver(state) || rt.dying) return;
    rt.dying = true;
    try {
      state.hp = 0;
      if (allowRevive) {
        runHook(rt, 'onDeath', { source: sourceText });
        if (state.hp > 0) return;
      }

      const round = state.round;
      if (round) {
        state.stats.rounds++;
        state.stats.playMs += round.elapsedMs;
        runHook(rt, 'onRoundEnd', {
          outcome,
          boss: round.boss,
          damageTaken: round.damageTaken,
        });
        emit(rt, {
          type: 'roundEnded',
          outcome,
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
        dealDamage(rt, effect.amount, source, { ignoreArmor: effect.ignoreArmor });
        break;
      case 'damageLevel':
        dealDamage(rt, state.level, source);
        break;
      case 'heal':
        heal(rt, effect.amount, source);
        break;
      case 'healPercent':
        heal(rt, Math.max(1, Math.ceil(state.maxHp * (effect.percent / 100))), source);
        break;
      case 'healMissingPercent': {
        const missing = Math.max(0, state.maxHp - state.hp);
        heal(rt, Math.ceil(missing * (effect.percent / 100)), source);
        break;
      }
      case 'healDiceGold': {
        const rolled = rngInt(state, effect.max - effect.min + 1) + effect.min;
        const adjusted = Math.max(1, Math.round(rolled * healMultiplier(state)));
        const applied = heal(rt, rolled, source);
        const excess = Math.max(0, adjusted - applied);
        if (excess > 0) changeGold(rt, excess, source);
        break;
      }
      case 'healOverflowMaxHp': {
        const adjusted = Math.max(1, Math.round(effect.amount * healMultiplier(state)));
        const before = state.hp;
        state.hp = Math.min(state.maxHp, state.hp + adjusted);
        const applied = state.hp - before;
        if (applied > 0) {
          emit(rt, { type: 'healed', amount: applied, hp: state.hp, source });
          runHook(rt, 'onHeal', { amount: applied, hp: state.hp });
        }
        const excess = Math.max(0, adjusted - applied);
        if (excess > 0) {
          changeMaxHp(rt, excess, source);
          state.hp = Math.min(state.maxHp, state.hp + excess);
          emit(rt, { type: 'healed', amount: excess, hp: state.hp, source });
        }
        break;
      }
      case 'maxHp':
        changeMaxHp(rt, effect.delta, source);
        break;
      case 'maxHpMultiply': {
        const target = Math.max(1, Math.round(state.maxHp * effect.factor));
        changeMaxHp(rt, target - state.maxHp, source);
        break;
      }
      case 'hpMultiply': {
        state.hp = Math.max(1, Math.min(state.maxHp, Math.round(state.hp * effect.factor)));
        emit(rt, { type: 'maxHpChanged', maxHp: state.maxHp, hp: state.hp, source });
        break;
      }
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
      case 'muffinArmor':
        armMuffinTin(rt);
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
          round.nextFreeUnobscured = true;
          emit(rt, { type: 'freeGuessesChanged', remaining: round.freeLeft, source });
          emit(rt, { type: 'message', text: 'No clock. The next guess is free and unobscured.' });
          break;
        }
        round.frozenUntilGuess = true;
        round.freeLeft += 1;
        round.nextFreeUnobscured = true;
        emit(rt, { type: 'freeGuessesChanged', remaining: round.freeLeft, source });
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
      case 'freeGuessBonus':
        state.freeGuessBonus += effect.delta;
        emit(rt, { type: 'attributeChanged', stat: 'freeGuessBonus', value: state.freeGuessBonus });
        break;
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
          const shown = presentGuess(state, guess).tiles;
          shown.forEach((tile, index) => {
            // A tile hidden by a vision curse told the player nothing, even if
            // the underlying letter was actually in the answer.
            if (tile === 'correct' || tile === 'present' || tile === 'hit') {
              known.add(guess.word[index]);
            }
          });
        }
        for (const [letter, status] of Object.entries(round.hints ?? {})) {
          if (status === 'present') known.add(letter);
        }
        // In the final boss gauntlet the board resets between words. Do not
        // spend an Omen re-revealing a letter the player already saw yellow.
        for (const letter of round.seenPresent ?? []) known.add(letter);
        const letters = round.answer.split('').filter((ch) => !known.has(ch));
        if (letters.length > 0) {
          hintLetter(rt, rngPick(state, letters), 'present');
        } else {
          emit(rt, { type: 'message', text: 'Omen finds nothing new.' });
        }
        break;
      }
      case 'revealLetter': {
        if (noReveal(state) && (source.kind === 'item' || source.kind === 'spell')) break;
        revealPermanentLetter(rt, effect.letter);
        break;
      }
      case 'revealPermanentRandom': {
        const candidates = ALPHABET.filter(
          (letter) => !state.purged.includes(letter) && !state.permanentReveals.includes(letter),
        );
        if (candidates.length === 0) {
          emit(rt, { type: 'message', text: 'Every letter is already known or purged.' });
          break;
        }
        revealPermanentLetter(rt, rngPick(state, candidates));
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
      case 'purgeRandomLetter':
        purgeRandomLetter(rt);
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
      case 'removeSpell': {
        const index = state.spells.findIndex((spell) => spell.id === effect.spell);
        if (index < 0) break;
        state.spells.splice(index, 1);
        const name = spellById.get(effect.spell)?.name ?? effect.spell;
        emit(rt, { type: 'message', text: `${name} changes hands.` });
        break;
      }
      case 'removeRandomSpell': {
        if (state.spells.length === 0) break;
        const index = rngInt(state, state.spells.length);
        const [spell] = state.spells.splice(index, 1);
        const name = spellById.get(spell.id)?.name ?? spell.id;
        emit(rt, { type: 'message', text: `${name} changes hands.` });
        break;
      }
      case 'giveMissingSpells': {
        const owned = new Set(state.spells.map((spell) => spell.id));
        for (const spell of content.spells) {
          if (owned.has(spell.id)) continue;
          if (effect.chancePct !== undefined && !rngChance(state, effect.chancePct)) continue;
          addSpell(rt, spell.id);
        }
        break;
      }
      case 'openShop':
        openShop(rt);
        break;
      case 'rerollShop': {
        const shop = state.shop;
        if (!shop || state.phase !== 'shop') break;
        shop.offers = generateOffers(rt);
        shop.foodOffers = shop.offers.filter((offer) => offer.kind === 'eat').length;
        shop.foodsBought = 0;
        emit(rt, {
          type: 'shopRerolled',
          offers: clone(shop.offers),
          rerollCost: shop.rerollCost,
        });
        break;
      }
      case 'castSpell': {
        if (effect.chancePct !== undefined && !rngChance(state, effect.chancePct)) break;
        const id = effect.spell === 'random'
          ? (content.spells.length > 0 ? rngPick(state, content.spells).id : null)
          : effect.spell;
        if (id) castSpellById(rt, id);
        break;
      }
      case 'randomGuesses':
        if (effect.chancePct !== undefined && !rngChance(state, effect.chancePct)) break;
        playRandomGuesses(rt, effect.count, effect.excludeLetters);
        break;
      case 'queueRandomGuesses':
        state.nextRoundRandomGuesses += effect.count;
        break;
      case 'permanentRandomGuesses':
        state.permanentRandomGuesses += effect.count;
        break;
      case 'permanentRoundStartSpell':
        if (!state.permanentRoundStartSpells.includes(effect.spell)) {
          state.permanentRoundStartSpells.push(effect.spell);
        }
        break;
      case 'permanentRoundStartWord':
        state.permanentRoundStartWord = effect.word;
        break;
      case 'queueNextRoundReveal':
        for (const letter of effect.letters) {
          if (!state.nextRoundReveals.includes(letter)) state.nextRoundReveals.push(letter);
        }
        break;
      case 'disableVisionThisRound':
        if (state.round && !state.round.visionDisabled) {
          state.round.visionDisabled = true;
          emit(rt, { type: 'message', text: 'Vision curses fade for the rest of the round.' });
        }
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
          (i) => !i.noSpawn
            && i.rarity !== 'rare'
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
          (i) => !i.noSpawn && i.rarity === 'rare' && itemAvailable(state, i),
        );
        const pool = rare.filter((i) => !owned.has(i.id));
        if (pool.length > 0) addItem(rt, rngPick(state, pool).id);
        else emit(rt, { type: 'message', text: 'You already own every relic.' });
        break;
      }
      case 'addRandomCurse': {
        const pool = eligibleCurses(state, false);
        if (pool.length === 0) {
          emit(rt, { type: 'message', text: 'No curse is available.' });
          break;
        }
        applyCurse(rt, pickWeighted(state, pool).id);
        break;
      }
      case 'addPreviewItem': {
        const item = state.happening?.previewItem;
        if (item) addItem(rt, item);
        else emit(rt, { type: 'message', text: 'No item is available.' });
        break;
      }
      case 'addPreviewCurse': {
        const curse = state.happening?.previewCurse;
        if (curse) applyCurse(rt, curse);
        else emit(rt, { type: 'message', text: 'No curse is available.' });
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
        if (effect.delta < 0) {
          const dropped = enforceSlotCapacity(rt, state);
          if (dropped.length > 0) {
            emit(rt, {
              type: 'message',
              text: `Slots tightened. Moved to the bag: ${dropped.join(', ')}.`,
            });
          }
        }
        break;
      case 'pendingPurge':
        state.pendingPurge += effect.count;
        break;
      case 'addCurse':
        applyCurse(rt, effect.curse);
        break;
      case 'removeRandomCurse': {
        if (effect.chancePct !== undefined && !rngChance(state, effect.chancePct)) break;
        if (state.curses.length === 0) break;
        removeCurseEntry(rt, rngPick(state, state.curses).id);
        break;
      }
      case 'queueLastAnswer':
        if (state.lastAnswer) state.nextRoundGuess = state.lastAnswer;
        break;
      case 'damageCapNextRound':
        state.nextRoundDamageCap = effect.amount;
        break;
      case 'visionCounts':
        state.visionCountsRounds = Math.max(state.visionCountsRounds ?? 0, effect.rounds);
        break;
      case 'armSpellDouble':
        state.nextSpellDouble = true;
        break;
      case 'armSaleDouble':
        state.nextSaleDoubles = (state.nextSaleDoubles ?? 0) + 2;
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

  interface ProcSnapshot {
    gold: number;
    hp: number;
    maxHp: number;
    armor: number;
    maxArmor: number;
    slots: number;
    freeLeft: number;
    pendingFree: boolean;
    spells: Map<string, number>;
    items: Set<string>;
    curses: Map<string, number>;
    purged: Set<string>;
    hints: Map<string, string | undefined>;
    permanentReveals: Set<string>;
    nextSpellDouble: boolean;
    nextSaleDoubles: number;
    nextRoundGuess?: string;
    nextRoundRandomGuesses: number;
    permanentRandomGuesses: number;
    bonusTimeMs: number;
    remainingMs: number | null;
    immuneGuesses: number;
    immuneUntilMs: number;
    guessImmuneUntilMs: number;
    nextRoundDamageCap?: number;
    freeGuessBonus: number;
    pendingPurge: number;
    pendingAbsent: number;
    pendingCurseRemoval: number;
    visionCountsRounds: number;
    blacklist: number;
    guesses: number;
    frozenMs: number;
    frozenUntilGuess: boolean;
    nextFreeUnobscured: boolean;
  }

  const countIds = (ids: string[]): Map<string, number> => {
    const counts = new Map<string, number>();
    for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
    return counts;
  };

  function snapshotProc(rt: Runtime): ProcSnapshot {
    const state = rt.state;
    const round = state.round;
    return {
      gold: state.gold,
      hp: state.hp,
      maxHp: state.maxHp,
      armor: state.armor,
      maxArmor: state.maxArmor,
      slots: state.slots,
      freeLeft: round?.freeLeft ?? 0,
      pendingFree: rt.pendingFree,
      spells: countIds(state.spells.map((spell) => spell.id)),
      items: new Set(state.items.map((item) => item.id)),
      curses: countIds(state.curses.map((entry) => entry.id)),
      purged: new Set(state.purged),
      hints: new Map(Object.entries(round?.hints ?? {})),
      permanentReveals: new Set(state.permanentReveals),
      nextSpellDouble: state.nextSpellDouble === true,
      nextSaleDoubles: state.nextSaleDoubles ?? 0,
      nextRoundGuess: state.nextRoundGuess,
      nextRoundRandomGuesses: state.nextRoundRandomGuesses,
      permanentRandomGuesses: state.permanentRandomGuesses,
      bonusTimeMs: state.bonusTimeMs,
      remainingMs: round?.remainingMs ?? null,
      immuneGuesses: round?.immuneGuesses ?? 0,
      immuneUntilMs: round?.immuneUntilMs ?? 0,
      guessImmuneUntilMs: round?.guessImmuneUntilMs ?? 0,
      nextRoundDamageCap: state.nextRoundDamageCap,
      freeGuessBonus: state.freeGuessBonus,
      pendingPurge: state.pendingPurge,
      pendingAbsent: state.pendingAbsent,
      pendingCurseRemoval: state.pendingCurseRemoval,
      visionCountsRounds: state.visionCountsRounds ?? 0,
      blacklist: state.blacklist.length,
      guesses: round?.guesses.length ?? 0,
      frozenMs: round?.frozenMs ?? 0,
      frozenUntilGuess: round?.frozenUntilGuess ?? false,
      nextFreeUnobscured: round?.nextFreeUnobscured ?? false,
    };
  }

  function procSummary(before: ProcSnapshot, rt: Runtime, hook: HookName): string {
    const state = rt.state;
    const round = state.round;
    const parts: string[] = [];
    const signed = (value: number): string => `${value > 0 ? '+' : ''}${value}`;

    const gold = state.gold - before.gold;
    if (gold !== 0) parts.push(`${signed(gold)} gold`);
    const hp = state.hp - before.hp;
    if (hp !== 0) parts.push(`${signed(hp)} HP`);
    const maxHp = state.maxHp - before.maxHp;
    if (maxHp !== 0) parts.push(`${signed(maxHp)} max HP`);
    const armor = state.armor - before.armor;
    if (armor !== 0) parts.push(`${signed(armor)} armor`);
    const maxArmor = state.maxArmor - before.maxArmor;
    if (maxArmor !== 0) parts.push(`${signed(maxArmor)} max armor`);
    const slots = state.slots - before.slots;
    if (slots !== 0) parts.push(`${signed(slots)} slot${Math.abs(slots) === 1 ? '' : 's'}`);

    for (const [id, count] of countIds(state.spells.map((spell) => spell.id))) {
      const gained = count - (before.spells.get(id) ?? 0);
      if (gained > 0) {
        parts.push(`+${gained > 1 ? `${gained} ` : ''}${spellById.get(id)?.name ?? id}`);
      }
    }
    for (const id of state.items.map((item) => item.id)) {
      if (!before.items.has(id)) parts.push(`+${itemById.get(id)?.name ?? id}`);
    }
    for (const [id, count] of countIds(state.curses.map((entry) => entry.id))) {
      const gained = count - (before.curses.get(id) ?? 0);
      if (gained > 0) parts.push(`+${curseById.get(id)?.name ?? id} curse`);
      else if (gained < 0) parts.push(`-${curseById.get(id)?.name ?? id}`);
    }
    for (const letter of state.purged) {
      if (!before.purged.has(letter)) parts.push(`purged ${letter.toUpperCase()}`);
    }
    for (const [letter, status] of Object.entries(round?.hints ?? {})) {
      if (before.hints.get(letter) === status) continue;
      parts.push(status === 'present'
        ? `revealed ${letter.toUpperCase()}`
        : `ruled out ${letter.toUpperCase()}`);
    }
    for (const letter of state.permanentReveals) {
      if (!before.permanentReveals.has(letter)) {
        parts.push(`revealed ${letter.toUpperCase()} for good`);
      }
    }

    if (round) {
      const free = round.freeLeft - before.freeLeft;
      if (free > 0) parts.push(`+${free} free guess${free === 1 ? '' : 'es'}`);
      if (round.immuneGuesses > before.immuneGuesses) parts.push('Immunity');
      if (round.immuneUntilMs > before.immuneUntilMs) parts.push('opening shield');
      if (round.guessImmuneUntilMs > before.guessImmuneUntilMs) parts.push('guess shield');
      if (round.remainingMs !== null && before.remainingMs !== null) {
        const delta = round.remainingMs - before.remainingMs;
        if (delta >= 1_000) parts.push(`+${Math.round(delta / 1_000)}s`);
        else if (delta <= -1_000) parts.push(`${Math.round(delta / 1_000)}s`);
      }
      if (round.guesses.length > before.guesses) {
        const words = round.guesses.slice(before.guesses).map((guess) => guess.word.toUpperCase());
        if (words.length > 0) parts.push(`guessed ${words.join(' ')}`);
      }
    }
    if (!before.pendingFree && rt.pendingFree) {
      parts.push(hook === 'onGuessScored' ? 'free guess' : 'next guess free');
    }
    if (!before.nextSpellDouble && state.nextSpellDouble) parts.push('next spell doubled');
    const sales = (state.nextSaleDoubles ?? 0) - before.nextSaleDoubles;
    if (sales > 0) parts.push(`next sale${sales === 1 ? '' : 's'} doubled`);
    if (!before.nextRoundGuess && state.nextRoundGuess) parts.push('next round auto-guess');
    const queuedGuesses = state.nextRoundRandomGuesses - before.nextRoundRandomGuesses;
    if (queuedGuesses > 0) {
      parts.push(`next round autoguess${queuedGuesses === 1 ? '' : 'es'}`);
    }
    if (state.permanentRandomGuesses > before.permanentRandomGuesses) {
      parts.push('round-start autoguess for good');
    }
    if (state.bonusTimeMs > before.bonusTimeMs) {
      parts.push(`+${Math.round((state.bonusTimeMs - before.bonusTimeMs) / 1_000)}s next round`);
    }
    if (
      state.nextRoundDamageCap !== undefined
      && state.nextRoundDamageCap !== before.nextRoundDamageCap
    ) {
      parts.push('next round damage capped');
    }
    if (state.blacklist.length > before.blacklist) {
      parts.push(`+${state.blacklist.length - before.blacklist} blacklist`);
    }
    const freeBonus = state.freeGuessBonus - before.freeGuessBonus;
    if (freeBonus !== 0) parts.push(`${signed(freeBonus)} free guess${Math.abs(freeBonus) === 1 ? '' : 'es'}`);
    const pendingPurge = state.pendingPurge - before.pendingPurge;
    if (pendingPurge > 0) parts.push(`+${pendingPurge} purge`);
    const pendingAbsent = state.pendingAbsent - before.pendingAbsent;
    if (pendingAbsent > 0) parts.push(`+${pendingAbsent} reveal next round`);
    const pendingRemoval = state.pendingCurseRemoval - before.pendingCurseRemoval;
    if (pendingRemoval > 0) parts.push('curse removal');
    if ((state.visionCountsRounds ?? 0) > before.visionCountsRounds) {
      parts.push(`counts for ${state.visionCountsRounds} rounds`);
    }
    if (round && round.frozenMs > before.frozenMs) parts.push('clock frozen');
    if (round?.frozenUntilGuess && !before.frozenUntilGuess) parts.push('clock frozen');
    if (round?.nextFreeUnobscured && !before.nextFreeUnobscured) {
      parts.push('next guess unobscured');
    }

    return [...new Set(parts)].join(' · ');
  }

  function runHook<H extends HookName>(rt: Runtime, hook: H, payload: HookPayloads[H]): void {
    const state = rt.state;
    if (rt.depth > 10 || isOver(state)) return;
    const roundStartSpells = hook === 'onRoundStart' ? state.spells.length : undefined;

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
        | ((ctx: ItemCtx, payload: HookPayloads[H]) => Effect[])
        | undefined;
      if (!handler) continue;
      const effects = handler({ state, self: item, roundStartSpells }, payload);
      if (effects.length === 0) continue;
      const before = snapshotProc(rt);
      applyEffects(rt, effects, { kind: 'item', instance: item.instance }, item.instance);
      const text = procSummary(before, rt, hook);
      if (text) {
        emit(rt, {
          type: 'itemProc',
          item: item.id,
          instance: item.instance,
          hook,
          text,
        });
      }
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

    const vision = guess.unobscured || state.round?.visionDisabled
      ? []
      : curseDefs(state).filter((entry) => entry.def.tags.includes('vision'));
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
    const snack = (state.visionCountsRounds ?? 0) > 0;
    const counts = vision.length > 0 && (tally || snack)
      ? truthCounts(guess.truth)
      : undefined;
    return { word: guess.word, tiles, counts };
  }

  // ── answers ──────────────────────────────────────────────────────────────

  function chooseAnswer(rt: Runtime, boss?: BossDef): string {
    const state = rt.state;
    restoreLegalWords(rt);
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

    const pick = (candidates: string[]): string => {
      const answer = rngPick(state, candidates);
      state.usedAnswers.push(answer);
      return answer;
    };

    for (const pool of pools) {
      let candidates = clean(pool, true);
      if (candidates.length === 0) {
        // Used answers can run out; the blacklist and purged letters cannot be
        // relaxed. Start the used-answer cycle over before ever selecting a
        // blacklisted word.
        state.usedAnswers = [];
        candidates = pool.filter(
          (word) =>
            !state.blacklist.includes(word) &&
            !word.split('').some((ch) => state.purged.includes(ch)),
        );
      }
      if (candidates.length > 0) return pick(candidates);
    }

    // Extremely late runs can have every legal word blacklisted. Release one
    // legal word rather than using a blacklisted target.
    const legal = content.answers.filter(
      (word) => !word.split('').some((ch) => state.purged.includes(ch)),
    );
    if (legal.length > 0) {
      const answer = rngPick(state, legal);
      if (state.blacklist.includes(answer)) {
        state.blacklist = state.blacklist.filter((word) => word !== answer);
        emit(rt, {
          type: 'message',
          text: `The List releases ${answer.toUpperCase()} so the round can begin.`,
        });
      }
      state.usedAnswers.push(answer);
      return answer;
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
    const secondPuzzle = !boss && curseDefs(state).some((entry) => entry.def.secondPuzzle);
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
      freeLeft: Math.max(0, 1 + freeGuessPenalty(state) + state.freeGuessBonus),
      paidGuesses: 0,
      baseDamage,
      damageRamp: 0,
      elapsedMs: 0,
      remainingMs: remaining,
      timerStartMs: timerStart,
      frozenMs: 0,
      frozenUntilGuess: false,
      nextFreeUnobscured: false,
      immuneGuesses: 0,
      immuneUntilMs: 0,
      guessImmuneUntilMs: 0,
      damageTaken: 0,
      bossState: { ...(boss?.initialState ?? {}) },
      gauntletIndex: 0,
      gauntletTotal: boss?.gauntlet ? boss.gauntlet.puzzles : secondPuzzle ? 2 : 1,
      gauntletAnswers: [],
      totalGuesses: 0,
      playerGuesses: 0,
      unobscuredGuesses: 0,
      lockedSpells: [],
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
    if (state.nextRoundReveals.length > 0) {
      const letters = state.nextRoundReveals.slice();
      state.nextRoundReveals = [];
      for (const letter of letters) {
        hintLetter(rt, letter, round.answer.includes(letter) ? 'present' : 'absent');
      }
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
    if (isOver(state)) return;

    // Knafeh queues the previous solved word for the very next round only.
    if (state.nextRoundGuess) {
      const word = state.nextRoundGuess;
      state.nextRoundGuess = undefined;
      if (
        word.length === WORD_LENGTH
        && !state.blacklist.includes(word)
        && !word.split('').some((ch) => state.purged.includes(ch))
        && !round.guesses.some((guess) => guess.word === word)
      ) {
        scorePlayerGuess(rt, word, 'friend');
      }
    }

    // Old McDonald's guesses its word for free every round.
    if (state.permanentRoundStartWord) {
      const word = state.permanentRoundStartWord;
      if (
        word.length === WORD_LENGTH
        && !state.blacklist.includes(word)
        && !word.split('').some((ch) => state.purged.includes(ch))
        && !round.guesses.some((guess) => guess.word === word)
      ) {
        scorePlayerGuess(rt, word, 'friend');
      }
    }

    // Moon Cake autocasts Omen (or any other permanent round-start spell).
    for (const spell of state.permanentRoundStartSpells) {
      if (state.phase !== 'round') break;
      castSpellById(rt, spell);
    }

    // Oracle's Banquet autoguesses at the start of every round; Fortune
    // Cookie queues one guess for the next round only.
    if (state.permanentRandomGuesses > 0) {
      playRandomGuesses(rt, state.permanentRandomGuesses);
    }
    if (state.nextRoundRandomGuesses > 0) {
      const queued = state.nextRoundRandomGuesses;
      const played = playRandomGuesses(rt, queued);
      state.nextRoundRandomGuesses = state.phase === 'round'
        ? Math.max(0, queued - played)
        : 0;
    }
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

    // Every finished encounter pays a prize. Solve gold drops with each guess:
    // 8 for a one-guess solve, then 7, 6, 5 and 4. Bounty-style bonuses still
    // add on top.
    let baseGold = 0;
    if (outcome === 'solved') {
      baseGold = 4 + rngInt(state, 5) + state.bonusSolveGold;
    } else if (outcome === 'timeout') {
      baseGold = 1;
    }
    const goldAward = Math.max(0, Math.floor(baseGold * goldMultiplier(state)));
    if (goldAward > 0) changeGold(rt, goldAward, RULES);

    if (outcome === 'solved') {
      const countedGuesses = round.playerGuesses - round.unobscuredGuesses;
      runHook(rt, 'onSolve', {
        guesses: countedGuesses,
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
    // One-shot round modifiers expire when the encounter ends.
    if (state.nextRoundDamageCap !== undefined) state.nextRoundDamageCap = undefined;
    if ((state.visionCountsRounds ?? 0) > 0) {
      state.visionCountsRounds = (state.visionCountsRounds ?? 0) - 1;
    }
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
    const previous = next
      ? round.guesses[round.guesses.length - 1]
      : round.guesses[round.guesses.length - 2];
    const previousCounts = previous
      ? truthCounts(previous.truth)
      : { correct: 0, present: 0 };
    const firstPlayerGuess = round.guesses.find((guess) => guess.by === 'player');
    const firstCounts = firstPlayerGuess
      ? truthCounts(firstPlayerGuess.truth)
      : { correct: 0, present: 0 };
    const curseBonus =
      previousCounts.correct * damagePerGreen(state) +
      (firstCounts.correct + firstCounts.present) * damagePerFirstReveal(state);
    const base = boss?.damageFor
      ? boss.damageFor(state, next ? { ...round, totalGuesses: round.totalGuesses + 1 } : round)
      : round.baseDamage;
    return Math.max(0, Math.round(base + curseBonus));
  }

  function expireRound(rt: Runtime): void {
    const state = rt.state;
    const round = state.round;
    if (!round || state.phase !== 'round') return;
    round.remainingMs = 0;
    emit(rt, { type: 'timeExpired' });
    state.stats.timeouts++;
    // Running out of time is an unconditional loss: armor, immunity and
    // revive effects cannot save the run.
    finishRun(rt, 'the clock', 'timeout', false);
  }

  // ── guessing ─────────────────────────────────────────────────────────────

  function handleSolved(rt: Runtime): void {
    const state = rt.state;
    const round = state.round;
    if (!round) return;
    const boss = round.boss ? bossById.get(round.boss) : undefined;

    if (round.gauntletIndex + 1 < round.gauntletTotal) {
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
      const seen = new Set<string>(round.seenPresent ?? []);
      for (const guess of round.guesses) {
        guess.truth.forEach((tile, i) => {
          if (tile === 'correct' || tile === 'present') seen.add(guess.word[i]);
        });
      }
      for (const [letter, status] of Object.entries(round.hints ?? {})) {
        if (status === 'present') seen.add(letter);
      }
      round.seenPresent = [...seen];
      round.guesses = [];
      // Hints describe the answer that was just solved. They must not carry
      // over and claim letters are in the next word.
      round.hints = {};
      round.paidGuesses = 0;
      round.damageTaken = 0;
      round.frozenUntilGuess = false;
      round.answer = chooseAnswer(rt, boss);
      // Knowledge foods promise a reveal every round, including Second Wind's
      // extra word in the same encounter.
      for (const letter of state.permanentReveals ?? []) {
        hintLetter(rt, letter, round.answer.includes(letter) ? 'present' : 'absent');
      }
      // Second Wind's extra word starts with one free guess. Boss gauntlets
      // keep their normal free-guess state and ignore the curse.
      if (!round.boss) round.freeLeft += 1;
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
      // When purges shrink the phrase pool below three options, fall back to
      // single words so Phone a Friend does not repeat the same two phrases.
      if (phrases.length >= 3) {
        const [first, second] = rngPick(state, phrases);
        if (first === 'pizza' && second === 'pzazz') {
          emit(rt, { type: 'friendSaid', text: 'Pizza Pzazz 🍕✨' });
        }
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

  function playRandomGuesses(rt: Runtime, count: number, excludeLetters?: string): number {
    const state = rt.state;
    const round = state.round;
    if (!round || state.phase !== 'round') return 0;
    let played = 0;
    const blocked = new Set(
      (excludeLetters ?? '').toLowerCase().split('').filter(Boolean),
    );
    const used = (): Set<string> => new Set(round.guesses.map((guess) => guess.word));
    const available = (word: string, taken: Set<string>): boolean => {
      const w = word.toLowerCase();
      return (
        w.length === WORD_LENGTH
        && !taken.has(w)
        && !state.blacklist.includes(w)
        && !w.split('').some((ch) => state.purged.includes(ch))
        && !w.split('').some((ch) => blocked.has(ch))
      );
    };

    for (let index = 0; index < count; index++) {
      if (state.phase !== 'round') break;
      const taken = used();
      let pool = content.nonnative.filter((word) => available(word, taken));
      if (pool.length === 0 && blocked.size === 0) {
        pool = content.answers.filter((word) => available(word, taken));
      }
      if (pool.length === 0) break;
      const word = rngPick(state, pool);
      scorePlayerGuess(rt, word, 'friend');
      played++;
    }
    return played;
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
    const consumesFree = by === 'player' && naturalFree && !shieldedFree;
    const unobscured = consumesFree && round.nextFreeUnobscured;
    if (consumesFree) {
      round.freeLeft--;
      if (round.nextFreeUnobscured) round.nextFreeUnobscured = false;
    }

    const truth = scoreGuess(round.answer, word);
    const guess: ScoredGuess = {
      word,
      truth,
      index: round.totalGuesses,
      free: naturalFree || shieldedFree,
      by,
      unobscured,
    };

    round.totalGuesses++;
    state.stats.guesses++;
    if (by === 'player') round.playerGuesses++;
    if (unobscured) round.unobscuredGuesses++;
    if (by === 'player' && round.lockedSpells.length > 0) round.lockedSpells = [];
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
    const solved = word === round.answer;
    emit(rt, {
      type: 'guessScored',
      by,
      index: guess.index,
      guess: presented,
      free: guess.free,
      word,
      solved,
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
    if (!solved && !guess.free && by === 'player') {
      const boss = round.boss ? bossById.get(round.boss) : undefined;
      if (!boss?.noGuessDamage) {
        round.paidGuesses++;
        const raw = guessDamageFor(state, round)
          + Math.floor((state.goldSpent ?? 0) / 60);
        const amount = state.nextRoundDamageCap !== undefined
          ? Math.min(raw, state.nextRoundDamageCap)
          : raw;
        if (amount > 0) {
          dealDamage(
            rt,
            amount,
            round.boss ? { kind: 'boss', boss: round.boss } : RULES,
            { guess: true },
          );
        }
      }
    }

    if (isOver(state)) return;
    if (solved) handleSolved(rt);
  }

  // ── reward / shop / happening ────────────────────────────────────────────

  type RarityTier = 'common' | 'uncommon' | 'rare';
  interface RarityWeighted {
    rarity?: RarityTier;
    appearanceWeight?: number;
  }

  function weightedPick<T extends { appearanceWeight?: number }>(
    state: RunState,
    pool: T[],
  ): T {
    const total = pool.reduce((sum, def) => sum + (def.appearanceWeight ?? 1), 0);
    let roll = rngNext(state) * total;
    for (const def of pool) {
      roll -= def.appearanceWeight ?? 1;
      if (roll <= 0) return def;
    }
    return pool[pool.length - 1];
  }

  /**
   * Rarity is rolled directly: 35% rare, 50% uncommon, 15% common.
   * If the selected tier is empty, fall back to the entire pool.
   */
  function pickByRarity<T extends RarityWeighted>(
    state: RunState,
    pools: { common: T[]; uncommon: T[]; rare: T[] },
  ): T | undefined {
    const all = [...pools.rare, ...pools.uncommon, ...pools.common];
    if (all.length === 0) return undefined;
    const roll = rngNext(state) * 100;
    const pool = roll < 40
      ? all
      : roll < 85
        ? [...pools.uncommon, ...pools.common]
        : pools.common;
    return weightedPick(state, pool.length > 0 ? pool : all);
  }

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
    const commonFoods = foods.filter((food) => food.rarity === undefined || food.rarity === 'common');
    const uncommonFoods = foods.filter((food) => food.rarity === 'uncommon');
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
      const food = pickByRarity(state, {
        common: commonFoods,
        uncommon: uncommonFoods,
        rare: rareFoods,
      });
      if (food) {
        options.push({
          id: `eat:${food.id}`,
          kind: 'eat',
          def: food.id,
          rarity: food.rarity,
          label: food.name,
          description: food.description,
        });
      }
    }

    if (rngChance(state, 8)) {
      const owned = new Set(state.items.map((item) => item.id));
      const common = content.items.filter(
        (item) => !item.noSpawn
          && (item.rarity === undefined || item.rarity === 'common')
          && itemAvailable(state, item)
          && !(item.unique && owned.has(item.id))
          && (item.kind !== 'gear' || !owned.has(item.id)),
      );
      const uncommon = content.items.filter(
        (item) => !item.noSpawn
          && item.rarity === 'uncommon'
          && itemAvailable(state, item)
          && !(item.unique && owned.has(item.id))
          && (item.kind !== 'gear' || !owned.has(item.id)),
      );
      const rare = content.items.filter(
        (item) => !item.noSpawn
          && item.rarity === 'rare'
          && itemAvailable(state, item)
          && !owned.has(item.id),
      );
      const item = pickByRarity(state, { common, uncommon, rare });
      if (item) {
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

    if (option.kind === 'item' && option.def) {
      const def = itemById.get(option.def);
      if (!def || !itemAvailable(state, def)) {
        emit(rt, { type: 'message', text: 'That item is no longer available.' });
        return;
      }
    }
    if (option.kind === 'eat' && option.def) {
      const def = foodById.get(option.def);
      if (!def || !foodAvailable(state, def)) {
        emit(rt, { type: 'message', text: 'That food is no longer available.' });
        return;
      }
    }

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
    const owned = new Set(state.items.map((item) => item.id));
    const availableItems = content.items.filter(
      (item) => !item.noSpawn && itemAvailable(state, item),
    );
    const commonItems = availableItems.filter(
      (item) => (item.rarity === undefined || item.rarity === 'common')
        && !(item.unique && owned.has(item.id)),
    );
    const uncommonItems = availableItems.filter(
      (item) => item.rarity === 'uncommon' && !(item.unique && owned.has(item.id)),
    );
    const rareItems = availableItems.filter(
      (item) => item.rarity === 'rare' && !owned.has(item.id),
    );
    const availableFoods = content.foods.filter((food) => foodAvailable(state, food));
    const commonFoods = availableFoods.filter(
      (food) => food.rarity === undefined || food.rarity === 'common',
    );
    const uncommonFoods = availableFoods.filter((food) => food.rarity === 'uncommon');
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
      picked.push({ kind: 'spell', def: spell.id, price: shopPrice(state, 4) });
    };
    const pickRandomItem = (): boolean => {
      const item = pickByRarity(state, {
        common: commonItems.filter(
          (item) => usedCount(`item:${item.id}`) < (item.unique ? 1 : 2),
        ),
        uncommon: uncommonItems.filter(
          (item) => usedCount(`item:${item.id}`) < (item.unique ? 1 : 2),
        ),
        rare: rareItems.filter((item) => usedCount(`item:${item.id}`) < 1),
      });
      if (!item) return false;
      pickItem(item);
      return true;
    };
    const pickRandomFood = (): boolean => {
      const eligible = (food: (typeof content.foods)[number]): boolean => {
        const unique = food.unique || food.effects.some(
          (effect) => effect.type === 'purgeLetter' || effect.type === 'purgeRandomLetter',
        );
        return usedCount(`eat:${food.id}`) < (unique ? 1 : 2);
      };
      const food = pickByRarity(state, {
        common: commonFoods.filter(eligible),
        uncommon: uncommonFoods.filter(eligible),
        rare: rareFoods.filter(eligible),
      });
      if (!food) return false;
      pickFood(food);
      return true;
    };

    for (let index = 0; index < itemTarget; index++) {
      pickRandomItem();
    }
    for (let index = 0; index < foodTarget; index++) pickRandomFood();

    const categories = ['spell', 'eat'] as const;
    const wildcard = categories[rngInt(state, categories.length)];
    if (wildcard === 'spell') {
      if (content.spells.length > 0) pickSpell(rngPick(state, content.spells));
    } else {
      pickRandomFood();
    }

    // One random offer is half price. It can land on an item, a food, or the
    // wildcard spell, so sales are not limited to the item row.
    if (picked.length > 0) {
      const sale = picked[rngInt(state, picked.length)];
      const original = sale.price;
      sale.price = Math.max(1, Math.floor(original / 2));
      sale.sale = true;
      sale.originalPrice = original;
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
      rerollCost: shopPrice(state, 1),
      rerolls: 0,
      purchases: 0,
      visit: state.nodeIndex,
      foodOffers: offers.filter((offer) => offer.kind === 'eat').length,
      foodsBought: 0,
      foodsEaten: 0,
    };
    state.phase = 'shop';
    const pendingMuffin = state.pendingMuffinStacks ?? 0;
    if (pendingMuffin > 0) {
      state.muffinShopVisit = state.shop.visit;
      state.muffinStacks = pendingMuffin;
      state.pendingMuffinStacks = 0;
      emit(rt, { type: 'message', text: 'The Muffin Tin is ready for this shop.' });
    }
    emit(rt, {
      type: 'shopOpened',
      offers: clone(state.shop.offers),
      rerollCost: state.shop.rerollCost,
    });
    runHook(rt, 'onShopOpen', { offers: state.shop.offers });
  }

  /** A shop node lets the player shop or rest at the inn instead. */
  function chooseShopOrInn(rt: Runtime, optionId: string): void {
    const state = rt.state;
    if (state.phase !== 'shopChoice') return;
    if (optionId === 'inn') {
      const before = state.hp;
      changeMaxHp(rt, 8, { kind: 'inn' });
      state.hp = state.maxHp;
      const applied = state.hp - before;
      if (applied > 0) {
        emit(rt, { type: 'healed', amount: applied, hp: state.hp, source: { kind: 'inn' } });
        runHook(rt, 'onHeal', { amount: applied, hp: state.hp });
      }
      emit(rt, {
        type: 'message',
        text: 'The inn grants +8 max HP and restores you to full health.',
      });
      advanceNode(rt);
      return;
    }
    if (optionId === 'shop') openShop(rt);
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
    if (
      offer.kind === 'item'
      && (!itemById.get(offer.def) || !itemAvailable(state, itemById.get(offer.def)!))
    ) {
      emit(rt, { type: 'shopRejected', offerId, reason: 'That item is no longer available.' });
      return;
    }
    if (
      offer.kind === 'eat'
      && (!foodById.get(offer.def) || !foodAvailable(state, foodById.get(offer.def)!))
    ) {
      emit(rt, { type: 'shopRejected', offerId, reason: 'That food is no longer available.' });
      return;
    }
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
    emit(rt, { type: 'offerBought', offerId, kind: offer.kind, def: offer.def, price });
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
    const doublesLeft = state.nextSaleDoubles ?? 0;
    const doubled = doublesLeft > 0;
    const paid = doubled ? value * 2 : value;
    if (doubled) {
      state.nextSaleDoubles = doublesLeft - 1;
      emit(rt, { type: 'message', text: 'Chilaquiles doubled the sale.' });
    }
    const view = itemView(state, item);
    removeItem(rt, instance, 'sold');
    changeGold(rt, paid, RULES);
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
    const letterEvent = def.id === 'know-the-letter' || def.id === 'purge-the-letter';
    // Floor-scaled events keep the number visible to the player. The token is
    // resolved once when the event opens so the displayed text and the text
    // saved with the resolved event agree.
    const formatText = (text: string): string => text.split('{level}').join(String(state.level));
    const baseOptions: HappeningOptionView[] = def.options.map((option) => ({
      id: option.id,
      label: option.label,
      description: formatText(option.description),
      costGold: option.costGold,
      fallbackPct: option.fallbackPct,
      requiresSpell: option.requiresSpell,
      locked: option.requiresSpell
        ? !state.spells.some((spell) => spell.id === option.requiresSpell)
        : undefined,
      chancePct: option.outcomes.length === 1
        ? 100
        : option.outcomes[0]?.chancePct,
      outcomes: option.outcomes.map((o) => ({
        chancePct: o.chancePct,
        text: formatText(o.text),
      })),
    }));
    let letters: Letter[] | undefined;
    let options = baseOptions;
    if (letterEvent) {
      const know = def.id === 'know-the-letter';
      const candidates = ALPHABET.filter((letter) => (
        !state.purged.includes(letter)
        && (!know || !state.permanentReveals.includes(letter))
      ));
      letters = rngShuffle(state, candidates).slice(0, know ? 2 : 3);
      const letterOptions: HappeningOptionView[] = letters.map((letter) => ({
        id: letter,
        label: `${know ? 'Know' : 'Purge'} ${letter.toUpperCase()}`,
        description: know
          ? `Permanently reveal ${letter.toUpperCase()} in every round.`
          : `Permanently purge ${letter.toUpperCase()} from future answers.`,
        chancePct: 100,
        outcomes: [{
          chancePct: 100,
          text: know
            ? `${letter.toUpperCase()} will be known from now on.`
            : `${letter.toUpperCase()} will be purged from future answers.`,
        }],
      }));
      const leave = baseOptions.find((option) => option.id === 'leave');
      options = [...letterOptions, ...(leave ? [leave] : [])];
    }
    if (def.id === 'spell-tithe') {
      const knowPool = ALPHABET.filter(
        (letter) => !state.purged.includes(letter) && !state.permanentReveals.includes(letter),
      );
      const purgePool = ALPHABET.filter((letter) => !state.purged.includes(letter));
      const knowLetter = knowPool.length > 0 ? rngPick(state, knowPool) : undefined;
      const purgeLetter = purgePool.length > 0 ? rngPick(state, purgePool) : undefined;
      const canTrade = state.spells.length > 0;
      const trades: HappeningOptionView[] = [];
      if (knowLetter) {
        trades.push({
          id: `know-${knowLetter}`,
          label: `Know ${knowLetter.toUpperCase()}`,
          description: `Lose a random spell. Permanently reveal ${knowLetter.toUpperCase()} in every round.`,
          requiresAnySpell: true,
          locked: !canTrade,
          chancePct: 100,
          outcomes: [{
            chancePct: 100,
            text: `${knowLetter.toUpperCase()} is written into your book for good.`,
          }],
        });
      }
      if (purgeLetter) {
        trades.push({
          id: `purge-${purgeLetter}`,
          label: `Purge ${purgeLetter.toUpperCase()}`,
          description: `Lose a random spell. Permanently purge ${purgeLetter.toUpperCase()} from future answers.`,
          requiresAnySpell: true,
          locked: !canTrade,
          chancePct: 100,
          outcomes: [{
            chancePct: 100,
            text: `${purgeLetter.toUpperCase()} is struck from every future answer.`,
          }],
        });
      }
      const leave = baseOptions.find((option) => option.id === 'leave');
      options = [...trades, ...(leave ? [leave] : [])];
    }
    state.happening = {
      id: def.id,
      options,
      letters,
    };
    if (def.id === 'the-bargain') {
      const items = content.items.filter(
        (item) => !item.noSpawn && item.rarity !== 'rare' && itemAvailable(state, item),
      );
      const curses = eligibleCurses(state, false);
      state.happening.previewItem = items.length > 0 ? rngPick(state, items).id : undefined;
      state.happening.previewCurse = curses.length > 0
        ? pickWeighted(state, curses).id
        : undefined;
    }
    state.phase = 'happening';
    emit(rt, {
      type: 'happeningOffered',
      happening: def.id,
      options: clone(state.happening.options),
    });
    runHook(rt, 'onHappening', { happening: def.id });
  }

  function chooseHappening(rt: Runtime, optionId: string): void {
    const state = rt.state;
    const happening = state.happening;
    if (!happening || state.phase !== 'happening' || happening.resolved) return;
    const def = happeningById.get(happening.id);
    if (!def) return;
    const tithe = def.id === 'spell-tithe' && /^(know|purge)-([a-z])$/.exec(optionId);
    if (tithe) {
      if (!happening.options.some((option) => option.id === optionId)) return;
      if (state.spells.length === 0) {
        emit(rt, { type: 'message', text: 'You have no spell to trade.' });
        return;
      }
      const kind = tithe[1];
      const letter = tithe[2] as Letter;
      if (kind === 'purge' && !purgeLetterNow(rt, letter)) {
        const text = `${letter.toUpperCase()} could not be purged.`;
        happening.resolved = { option: optionId, success: false, text };
        emit(rt, {
          type: 'happeningResolved',
          happening: def.id,
          option: optionId,
          success: false,
          text,
        });
        return;
      }
      applyEffects(
        rt,
        [
          { type: 'removeRandomSpell' },
          ...(kind === 'know'
            ? [{ type: 'revealLetter' as const, letter }]
            : []),
        ],
        { kind: 'happening', happening: def.id },
      );
      const text = kind === 'know'
        ? `${letter.toUpperCase()} is written into your book for good.`
        : `${letter.toUpperCase()} is struck from every future answer.`;
      happening.resolved = { option: optionId, success: true, text };
      emit(rt, {
        type: 'happeningResolved',
        happening: def.id,
        option: optionId,
        success: true,
        text,
      });
      return;
    }
    if (happening.letters && def.id === 'know-the-letter' && happening.letters.includes(optionId as Letter)) {
      const letter = optionId as Letter;
      applyEffects(rt, [{ type: 'revealLetter', letter }], { kind: 'happening', happening: def.id });
      const text = `${letter.toUpperCase()} will be known from now on.`;
      happening.resolved = { option: letter, success: true, text };
      emit(rt, {
        type: 'happeningResolved',
        happening: def.id,
        option: letter,
        success: true,
        text,
      });
      return;
    }
    if (happening.letters && def.id === 'purge-the-letter' && happening.letters.includes(optionId as Letter)) {
      const letter = optionId as Letter;
      const success = purgeLetterNow(rt, letter);
      const text = success
        ? `${letter.toUpperCase()} is purged from future answers.`
        : `${letter.toUpperCase()} could not be purged.`;
      happening.resolved = { option: letter, success, text };
      emit(rt, {
        type: 'happeningResolved',
        happening: def.id,
        option: letter,
        success,
        text,
      });
      return;
    }
    const option = def.options.find((o) => o.id === optionId);
    if (!option) return;
    if (
      option.requiresSpell
      && !state.spells.some((spell) => spell.id === option.requiresSpell)
    ) {
      emit(rt, { type: 'message', text: 'You do not have that spell to trade.' });
      return;
    }

    if (option.costGold && option.costGold > 0) {
      if (state.gold >= option.costGold) {
        spendGold(rt, option.costGold, { kind: 'happening', happening: def.id });
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
    const shown = happening.options.find((entry) => entry.id === option.id);
    const outcomeText = shown?.outcomes[chosen]?.text ?? outcome.text;

    applyEffects(rt, outcome.effects, { kind: 'happening', happening: def.id });
    happening.resolved = {
      option: option.id,
      success,
      text: outcomeText,
    };
    emit(rt, {
      type: 'happeningResolved',
      happening: def.id,
      option: option.id,
      success,
      text: outcomeText,
    });
  }

  // ── node flow ────────────────────────────────────────────────────────────

  function curseWeight(state: RunState, def: CurseDef): number {
    let weight = def.weight ?? 1;
    // The signature blacklist and the first timer curse are the headline
    // burdens. They get one boosted stretch before their first draft
    // appearance, then settle into the normal pool.
    if (
      (def.id === 'the-list' || def.id === 'clock')
      && !state.seenCurses.includes(def.id)
    ) {
      weight *= 3;
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
    for (const id of picks) {
      if (!state.seenCurses.includes(id)) state.seenCurses.push(id);
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
  function enforceSlotCapacity(rt: Runtime, state: RunState): string[] {
    let equippedCost = 0;
    const dropped: string[] = [];
    for (const item of state.items) {
      const def = itemById.get(item.id);
      const cost = def ? itemSlots(def) : 0;
      if (item.equipped === false || cost === 0) continue;
      if (equippedCost + cost > state.slots) {
        item.equipped = false;
        if (def?.equipMaxArmor) changeMaxArmor(rt, -def.equipMaxArmor);
        dropped.push(def?.name ?? item.id);
        continue;
      }
      equippedCost += cost;
    }
    return dropped;
  }

  function applyCurse(rt: Runtime, id: CurseId, silent = false): void {
    const state = rt.state;
    const def = curseById.get(id);
    if (!def) return;
    if (!state.seenCurses.includes(id)) state.seenCurses.push(id);
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
      const dropped = enforceSlotCapacity(rt, state);
      if (dropped.length > 0) {
        emit(rt, {
          type: 'message',
          text: `Slots tightened. Moved to the bag: ${dropped.join(', ')}.`,
        });
      }
    }
    if (def.maxArmorMult !== undefined) {
      state.maxArmor = Math.max(0, Math.floor(state.maxArmor * def.maxArmorMult));
      state.armor = Math.min(state.armor, state.maxArmor);
      emit(rt, { type: 'armorChanged', armor: state.armor, max: state.maxArmor });
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
    if (!silent) {
      emit(rt, { type: 'curseChosen', curse: id, stacks: entry.stacks, name: def.name });
      runHook(rt, 'onCurseGained', { curse: id, stacks: entry.stacks });
    }
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

  function removeCurseEntry(rt: Runtime, curseId: CurseId): boolean {
    const state = rt.state;
    const index = state.curses.findIndex((curse) => curse.id === curseId);
    if (index < 0) return false;
    const entry = state.curses[index];
    const def = curseById.get(curseId);
    entry.stacks--;
    if (def?.slotDelta) {
      state.slots = Math.max(0, state.slots - def.slotDelta);
      emit(rt, { type: 'slotsChanged', slots: state.slots });
    }
    if (entry.stacks <= 0) state.curses.splice(index, 1);
    if (curseId === 'the-list' && entry.stacks <= 0) clearBlacklist(rt);
    emit(rt, { type: 'curseRemoved', curse: curseId, stacks: entry.stacks });
    return true;
  }

  function removeCurse(rt: Runtime, curseId: CurseId): void {
    const state = rt.state;
    if (state.pendingCurseRemoval <= 0) return;
    if (!removeCurseEntry(rt, curseId)) return;
    state.pendingCurseRemoval--;
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
      state.shop = undefined;
      state.phase = 'shopChoice';
      return;
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
    if (state.phase === 'shopChoice') {
      emit(rt, { type: 'message', text: 'Choose the shop or the inn.' });
      return;
    }
    if (state.phase === 'shop') {
      if ((state.muffinStacks ?? 0) > 0) {
        emit(rt, { type: 'message', text: 'The Muffin Tin stops counting. Its armor stays.' });
      }
      state.muffinStacks = 0;
      state.muffinShopVisit = undefined;
      state.pendingMuffinStacks = 0;
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
    if (rt.depth > 12) return;
    if (rt.autoCasts >= 10) {
      if (!rt.autoCapped) {
        rt.autoCapped = true;
        emit(rt, { type: 'message', text: 'The spell chain fizzles.' });
      }
      return;
    }
    rt.autoCasts++;
    if (def.usable === 'round' && (state.phase !== 'round' || !state.round)) return;
    const sourceItem = rt.self ? findItem(state, rt.self)?.id : undefined;
    emit(rt, { type: 'spellCast', spell: { instance: uid(state, 's'), id: def.id }, auto: true });
    applyEffects(rt, def.cast({ state }), { kind: 'spell', spell: def.id });
    if (isOver(state)) return;
    runHook(rt, 'onSpellCast', { spell: def.id, auto: true, sourceItem });
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
    const round = state.round;
    if (
      round
      && (def.id === 'immunity' || def.id === 'time-freeze')
      && round.lockedSpells.includes(def.id)
    ) {
      emit(rt, {
        type: 'spellRejected',
        instance,
        reason: `Guess First! You already cast ${def.name}.`,
      });
      return;
    }
    state.spells.splice(index, 1);
    const doubled = state.nextSpellDouble === true;
    if (doubled) state.nextSpellDouble = false;
    emit(rt, { type: 'spellCast', spell: spellView(spell) });
    applyEffects(rt, def.cast({ state }), { kind: 'spell', spell: def.id });
    if (doubled && !isOver(state)) {
      emit(rt, { type: 'message', text: 'Spell Pepper doubles the spell.' });
      applyEffects(rt, def.cast({ state }), { kind: 'spell', spell: def.id });
    }
    if (isOver(state)) return;
    runHook(rt, 'onSpellCast', { spell: def.id, auto: false });
    if (
      round
      && (def.id === 'immunity' || def.id === 'time-freeze')
      && !round.lockedSpells.includes(def.id)
    ) {
      round.lockedSpells.push(def.id);
    }
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
    const guesses = round.guesses.map((guess) => presentGuess(state, guess));
    for (const shown of guesses) {
      shown.tiles.forEach((tile, index) => {
        if (tile === 'hidden') return;
        const letter = shown.word[index];
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
    const hiddenLetters = new Set<string>();
    for (const entry of curseDefs(state)) {
      for (const effect of entry.def.vision ?? []) {
        if (effect.kind === 'hideLetters') {
          for (const letter of effect.letters) hiddenLetters.add(letter);
        }
      }
    }
    for (const letter of hiddenLetters) {
      if (!keyboard[letter]) keyboard[letter] = 'hidden';
    }
    for (const letter of state.purged) {
      if (!keyboard[letter] || keyboard[letter] === 'absent' || keyboard[letter] === 'hidden') {
        keyboard[letter] = 'purged';
      }
    }

    return {
      guesses,
      freeGuessesLeft: round.freeLeft,
      nextGuessDamage: round.freeLeft > 0 || noGuessDamage ? 0 : rawNext,
      rawNextGuessDamage: rawNext,
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
      guessImmuneMsLeft: Math.max(0, round.guessImmuneUntilMs - round.elapsedMs),
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
      case 'shopChoice':
        phase = { kind: 'shopChoice' };
        break;
      case 'shop':
        phase = {
          kind: 'shop',
          offers: clone(state.shop?.offers ?? []),
          rerollCost: state.shop?.rerollCost ?? 1,
          purchases: state.shop?.purchases ?? 0,
        };
        break;
      case 'happening':
        phase = {
          kind: 'happening',
          happening: state.happening?.id ?? '',
          options: clone(state.happening?.options ?? []),
          previewItem: state.happening?.previewItem,
          previewCurse: state.happening?.previewCurse,
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
          equippedItems: state.items
            .filter((item) => item.equipped !== false)
            .map((item) => item.id),
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
      character: state.character,
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
      revealed: Object.entries(state.round?.hints ?? {})
        .filter((entry): entry is [string, 'present' | 'absent'] => Boolean(entry[1]))
        .map(([letter, status]) => ({ letter, status })),
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
      autoCasts: 0,
      autoCapped: false,
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
        if (rt.state.phase === 'shopChoice') chooseShopOrInn(rt, cmd.optionId);
        else chooseHappening(rt, cmd.optionId);
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
      if (rngChance(state, 55)) nodes.push({ kind: 'happening', level });
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

  function newRun(opts: { seed: string; ascension?: number; character?: CharacterId }): StepResult {
    const seed = String(opts.seed || 'blacklist');
    const ascension = Math.max(0, Math.min(ASCENSION_MAX, Math.floor(opts.ascension ?? 0)));
    const startingCurses = ascensionStartingCurses(ascension);
    const character = content.characters.find((entry) => entry.id === opts.character)
      ?? content.characters[0];
    const maxHp = character.maxHp;
    const startArmor = character.armor;
    const state: RunState = {
      version: VERSION,
      seed,
      rng: hashSeed(seed),
      nextId: 1,
      character: character.id,
      ascension,
      nodes: [],
      nodeIndex: 0,
      level: 1,
      act: 0,
      hp: maxHp,
      maxHp,
      armor: startArmor,
      maxArmor: startArmor,
      gold: 12,
      goldSpent: 0,
      slots: 5,
      bonusTimeMs: 0,
      bonusBaseDamage: 0,
      bonusSolveGold: 0,
      freeGuessBonus: 0,
      items: [],
      spells: [],
      blacklist: [],
      eatenFoods: [],
      firstGuesses: [],
      purged: [],
      usedAnswers: [],
      pendingPurge: 0,
      pendingAbsent: 0,
      pendingReveals: [],
      permanentReveals: [],
      nextRoundRandomGuesses: 0,
      permanentRandomGuesses: 0,
      permanentRoundStartSpells: [],
      nextRoundReveals: [],
      curses: [],
      seenCurses: [],
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
      autoCasts: 0,
      autoCapped: false,
    };
    emit(rt, {
      type: 'runStarted',
      seed,
      ascension,
      nodes: clone(state.nodes),
    });
    if (content.spells.length > 0) addSpell(rt, rngPick(state, content.spells).id);
    for (const item of character.items) addItem(rt, item);
    for (const curse of character.curses) applyCurse(rt, curse, true);
    if ((character.startingPurges ?? 0) > 0) {
      state.pendingPurge += character.startingPurges ?? 0;
    }
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
      const characterAliases: Record<string, string> = {
        'maze-runner': 'pathfinder',
      };
      if (typeof state.character === 'string' && characterAliases[state.character]) {
        state.character = characterAliases[state.character];
      }
      if (
        typeof state.character !== 'string'
        || !content.characters.some((character) => character.id === state.character)
      ) {
        state.character = content.characters[0].id;
      }
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
      if (typeof state.goldSpent !== 'number') state.goldSpent = 0;
      if (typeof state.freeGuessBonus !== 'number') state.freeGuessBonus = 0;
      if (!Array.isArray(state.curses)) state.curses = [];
      if (!Array.isArray(state.seenCurses)) state.seenCurses = [];
      for (const curse of state.curses) {
        if (!state.seenCurses.includes(curse.id)) state.seenCurses.push(curse.id);
      }
      if (!Array.isArray(state.eatenFoods)) state.eatenFoods = [];
      if (typeof state.nextRoundRandomGuesses !== 'number') state.nextRoundRandomGuesses = 0;
      if (typeof state.permanentRandomGuesses !== 'number') state.permanentRandomGuesses = 0;
      if (!Array.isArray(state.permanentRoundStartSpells)) state.permanentRoundStartSpells = [];
      if (!Array.isArray(state.nextRoundReveals)) state.nextRoundReveals = [];
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
      const legacySaleDouble = (state as RunState & { nextSaleDouble?: boolean }).nextSaleDouble;
      if (legacySaleDouble === true && !state.nextSaleDoubles) state.nextSaleDoubles = 1;
      delete (state as RunState & { nextSaleDouble?: boolean }).nextSaleDouble;
      // Retired item ids are remapped or dropped so an old save can never
      // reference a definition the current content set no longer ships.
      const itemMigrations: Record<string, string> = {
        'null-lens': 'pen-club',
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
        if (typeof state.round.guessImmuneUntilMs !== 'number') {
          state.round.guessImmuneUntilMs = 0;
        }
        if (typeof state.round.nextFreeUnobscured !== 'boolean') {
          state.round.nextFreeUnobscured = false;
        }
        if (typeof state.round.unobscuredGuesses !== 'number') {
          state.round.unobscuredGuesses = 0;
        }
        if (typeof state.round.playerGuesses !== 'number') {
          state.round.playerGuesses = state.round.guesses.filter(
            (guess) => guess.by === 'player',
          ).length;
        }
        if (!Array.isArray(state.round.lockedSpells)) {
          state.round.lockedSpells = [];
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
        if (typeof state.shop.foodsEaten !== 'number') state.shop.foodsEaten = 0;
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
