import type {
  BoardView,
  BossDef,
  Content,
  Core,
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
  SpellView,
  StepResult,
  Command,
  HookName,
  HookPayloads,
} from './types';
import { hashSeed, rngChance, rngInt, rngPick, rngNext, rngShuffle } from './rng';
import { scoreGuess } from './score';

const VERSION = 2;
const WORD_LENGTH = 5;
const ACTS = 5;
const NODES_PER_ACT = 6;

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
  const upgradeById = new Map(content.upgrades.map((u) => [u.id, u]));
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
    const before = state.gold;
    state.gold = Math.max(0, before + delta);
    const applied = state.gold - before;
    if (!applied) return;
    if (applied > 0) state.stats.goldEarned += applied;
    emit(rt, { type: 'goldChanged', delta: applied, total: state.gold, source });
  }

  function spendGold(rt: Runtime, amount: number, source: Source = RULES): boolean {
    if (amount <= 0) return true;
    if (rt.state.gold < amount) return false;
    changeGold(rt, -amount, source);
    return true;
  }

  function heal(rt: Runtime, amount: number, source: Source): void {
    if (amount <= 0) return;
    const state = rt.state;
    const before = state.hp;
    state.hp = Math.min(state.maxHp, state.hp + amount);
    const applied = state.hp - before;
    if (applied > 0) {
      emit(rt, { type: 'healed', amount: applied, hp: state.hp, source });
      runHook(rt, 'onHeal', { amount: applied, hp: state.hp });
    }
  }

  function changeMaxHp(rt: Runtime, delta: number, source: Source): void {
    const state = rt.state;
    if (!delta) return;
    state.maxHp = Math.max(1, state.maxHp + delta);
    if (state.hp > state.maxHp) state.hp = state.maxHp;
    emit(rt, { type: 'maxHpChanged', maxHp: state.maxHp, hp: state.hp, source });
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

  // ── blacklist ────────────────────────────────────────────────────────────

  function blacklistPayload(rt: Runtime, added?: string, evicted: string[] = [], removed: string[] = []) {
    const state = rt.state;
    return {
      list: state.blacklist.slice(),
      capacity: state.blacklistCapacity,
      added,
      evicted,
      removed,
    };
  }

  function addBlacklist(rt: Runtime, word: string): void {
    const state = rt.state;
    if (!word || state.blacklist.includes(word)) return;
    state.blacklist.push(word);
    const evicted: string[] = [];
    while (state.blacklist.length > Math.max(1, state.blacklistCapacity)) {
      evicted.push(state.blacklist.shift() as string);
    }
    const payload = blacklistPayload(rt, word, evicted);
    emit(rt, { type: 'blacklistChanged', ...payload });
    runHook(rt, 'onBlacklistChanged', payload);
  }

  function clearBlacklist(rt: Runtime): void {
    const state = rt.state;
    if (state.blacklist.length === 0) return;
    const removed = state.blacklist.slice();
    state.blacklist = [];
    const payload = blacklistPayload(rt, undefined, [], removed);
    emit(rt, { type: 'blacklistChanged', ...payload });
    runHook(rt, 'onBlacklistChanged', payload);
  }

  function addRandomBlacklist(rt: Runtime, count: number): void {
    const state = rt.state;
    const candidates = content.answers.filter(
      (word) =>
        !state.blacklist.includes(word) &&
        !state.usedAnswers.includes(word) &&
        !word.split('').some((ch) => state.purged.includes(ch)),
    );
    if (candidates.length === 0) return;
    for (let i = 0; i < count && candidates.length > 0; i++) {
      const index = rngInt(state, candidates.length);
      const [word] = candidates.splice(index, 1);
      addBlacklist(rt, word);
    }
  }

  function removeRandomBlacklist(rt: Runtime, count: number): void {
    const state = rt.state;
    const removed: string[] = [];
    for (let i = 0; i < count && state.blacklist.length > 0; i++) {
      const index = rngInt(state, state.blacklist.length);
      removed.push(state.blacklist.splice(index, 1)[0]);
    }
    if (removed.length === 0) return;
    const payload = blacklistPayload(rt, undefined, [], removed);
    emit(rt, { type: 'blacklistChanged', ...payload });
    runHook(rt, 'onBlacklistChanged', payload);
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
    if (state.round && state.round.answer.includes(ch)) {
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
    emit(rt, { type: 'foodEaten', food: def.id, name: def.name });
    applyEffects(rt, def.effects, RULES);
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
        dealt: 0,
        hp: state.hp,
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
        dealt: 0,
        hp: state.hp,
        source,
      });
      return;
    }

    let armorUsed = 0;
    if (round && !options.ignoreArmor && state.armor > 0) {
      armorUsed = 1;
      state.armor--;
      emit(rt, { type: 'armorChanged', armor: state.armor, max: state.maxArmor });
    }

    const dealt = armorUsed ? 0 : modified;
    if (dealt > 0) {
      state.hp = Math.max(0, state.hp - dealt);
      state.stats.damageTaken += dealt;
      if (round) round.damageTaken += dealt;
    }

    emit(rt, {
      type: 'damageTaken',
      incoming: modified,
      armorUsed,
      dealt,
      hp: state.hp,
      source,
    });

    runHook(rt, 'onDamageTaken', { incoming: modified, dealt, armorUsed, source });
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
      case 'maxHp':
        changeMaxHp(rt, effect.delta, source);
        break;
      case 'armor':
        changeArmor(rt, effect.delta);
        break;
      case 'maxArmor':
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
      case 'makeGuessFree':
        rt.pendingFree = true;
        rt.pendingFreeSource = rt.self ? { kind: 'item', instance: rt.self } : source;
        break;
      case 'immunity': {
        const round = state.round;
        if (!round) break;
        round.immuneGuesses += effect.guesses;
        emit(rt, { type: 'immunityChanged', guessesLeft: round.immuneGuesses });
        break;
      }
      case 'revealYellow': {
        const round = state.round;
        if (!round) break;
        const known = new Set<string>();
        for (const guess of round.guesses) {
          guess.truth.forEach((tile, i) => {
            if (tile === 'correct' || tile === 'present') known.add(guess.word[i]);
          });
        }
        const letters = round.answer.split('').filter((ch) => !known.has(ch));
        const pool = letters.length > 0 ? letters : round.answer.split('');
        if (pool.length > 0) {
          const letter = rngPick(state, pool);
          emit(rt, { type: 'keyboardHint', letter, status: 'present' });
        }
        break;
      }
      case 'revealLetter': {
        const round = state.round;
        if (!round) break;
        const letter = effect.letter.toLowerCase();
        emit(rt, {
          type: 'keyboardHint',
          letter,
          status: round.answer.includes(letter) ? 'present' : 'absent',
        });
        break;
      }
      case 'purgeLetter':
        purgeLetterNow(rt, effect.letter);
        break;
      case 'clearBlacklist':
        clearBlacklist(rt);
        break;
      case 'blacklistAddRandom':
        addRandomBlacklist(rt, effect.count);
        break;
      case 'blacklistRemoveRandom':
        removeRandomBlacklist(rt, effect.count);
        break;
      case 'giveSpell': {
        if (effect.chancePct !== undefined && !rngChance(state, effect.chancePct)) break;
        const id = effect.spell === 'random'
          ? (content.spells.length > 0 ? rngPick(state, content.spells).id : null)
          : effect.spell;
        if (id) addSpell(rt, id);
        break;
      }
      case 'friendGuesses':
        playFriendGuesses(rt, effect.count);
        break;
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
          (i) => i.rarity !== 'rare' && (i.kind !== 'gear' || !owned.has(i.id)),
        );
        if (pool.length > 0) addItem(rt, rngPick(state, pool).id);
        break;
      }
      case 'eat':
        eatFood(rt, effect.food);
        break;
      case 'eatRandom':
        if (content.foods.length > 0) eatFood(rt, rngPick(state, content.foods).id);
        break;
      case 'slots':
        state.slots = Math.max(0, state.slots + effect.delta);
        emit(rt, { type: 'slotsChanged', slots: state.slots });
        break;
      case 'pendingPurge':
        state.pendingPurge += effect.count;
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
    if (bossId) {
      const boss = bossById.get(bossId);
      if (boss?.present) {
        return boss.present({ state }, guess);
      }
    }
    return { word: guess.word, tiles: guess.truth.slice() };
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

  function normalTimerMs(state: RunState): number {
    const base = Math.max(45_000, 150_000 - 6_000 * state.stats.rounds - 10_000 * state.ascension);
    return Math.max(15_000, base + state.bonusTimeMs);
  }

  function startRound(rt: Runtime): void {
    const state = rt.state;
    const node = state.nodes[state.nodeIndex];
    if (!node) return;
    const boss = node.boss ? bossById.get(node.boss) : undefined;
    const answer = chooseAnswer(rt, boss);

    let remaining: number | null;
    let timerStart: number | null;
    if (boss?.gauntlet) {
      remaining = Math.max(60_000, boss.gauntlet.timerMs - 10_000 * state.ascension);
    } else if (boss && boss.timerMs === null) {
      remaining = null;
    } else if (boss && boss.timerMs !== null) {
      remaining = Math.max(20_000, boss.timerMs - 10_000 * state.ascension);
    } else {
      remaining = normalTimerMs(state);
    }
    timerStart = remaining;

    const round: RoundState = {
      answer,
      boss: boss?.id,
      guesses: [],
      freeLeft: 2,
      paidGuesses: 0,
      baseDamage: 1 + state.act + Math.floor(state.stats.rounds / 3) + state.bonusBaseDamage,
      elapsedMs: 0,
      remainingMs: remaining,
      timerStartMs: timerStart,
      frozenMs: 0,
      frozenUntilGuess: false,
      immuneGuesses: 0,
      damageTaken: 0,
      bossState: { ...(boss?.initialState ?? {}) },
      gauntletIndex: 0,
      gauntletTotal: boss?.gauntlet ? boss.gauntlet.puzzles : 1,
      gauntletAnswers: [],
      totalGuesses: 0,
    };

    state.round = round;
    state.summary = undefined;
    state.reward = undefined;
    state.shop = undefined;
    state.happening = undefined;
    state.phase = 'round';
    state.armor = state.maxArmor;
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

    if (outcome === 'solved') {
      if (round.gauntletTotal > 1) round.gauntletAnswers.push(round.answer);
      state.lastAnswer = round.answer;
      if (round.boss) state.stats.bosses++;
    }

    // Every finished encounter pays out. A solve pays the full prize; a
    // timeout still leaves a few coins so a bad round is not a dead run.
    const goldAward = outcome === 'solved'
      ? Math.max(1, Math.floor((6 + 2 * state.stats.rounds) * 0.7)) + state.bonusSolveGold
      : outcome === 'timeout'
        ? Math.max(1, Math.floor((3 + state.act) * 0.7))
        : 0;
    if (goldAward > 0) changeGold(rt, goldAward, RULES);

    if (outcome === 'solved') {
      runHook(rt, 'onSolve', {
        guesses: round.totalGuesses,
        elapsedMs: round.elapsedMs,
        remainingMs: round.remainingMs,
        damageTaken: round.damageTaken,
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
      rewardPending: outcome === 'solved',
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

  function expireRound(rt: Runtime): void {
    const state = rt.state;
    const round = state.round;
    if (!round || state.phase !== 'round') return;
    round.remainingMs = 0;
    emit(rt, { type: 'timeExpired' });
    dealDamage(rt, Math.ceil(state.maxHp * 0.35) + 5, RULES, {
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
    for (let i = 0; i < count; i++) {
      if (state.phase !== 'round') break;
      const used = new Set(round.guesses.map((g) => g.word));
      let pool = content.friendWords.filter((word) => {
        const w = word.toLowerCase();
        return (
          w.length === WORD_LENGTH &&
          !used.has(w) &&
          !state.blacklist.includes(w) &&
          !w.split('').some((ch) => state.purged.includes(ch))
        );
      });
      if (pool.length === 0) {
        pool = content.answers.filter(
          (word) =>
            !used.has(word) &&
            !state.blacklist.includes(word) &&
            !word.split('').some((ch) => state.purged.includes(ch)),
        );
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

    const naturalFree = by === 'friend' || round.freeLeft > 0;
    if (by === 'player' && naturalFree) round.freeLeft--;

    const truth = scoreGuess(round.answer, word);
    const guess: ScoredGuess = {
      word,
      truth,
      index: round.totalGuesses,
      free: naturalFree,
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

    // Only the first word of a round goes on the blacklist. Later guesses
    // still reveal information, but they do not burn more of the list.
    if (round.guesses.length === 1) addBlacklist(rt, word);

    if (isOver(state)) return;

    // A correct guess never hurts you. You still pay for wrong guesses only.
    const solved = word === round.answer;
    if (!solved && !guess.free && by === 'player') {
      const boss = round.boss ? bossById.get(round.boss) : undefined;
      if (!boss?.noGuessDamage) {
        const paidIndex = round.paidGuesses;
        round.paidGuesses++;
        dealDamage(
          rt,
          round.baseDamage + paidIndex,
          round.boss ? { kind: 'boss', boss: round.boss } : RULES,
        );
      }
    }

    if (isOver(state)) return;
    if (solved) handleSolved(rt);
  }

  // ── reward / shop / happening ────────────────────────────────────────────

  function makeRewards(rt: Runtime): RewardOption[] {
    const state = rt.state;
    const options: RewardOption[] = [];

    // Bosses do not hand out coins or ordinary spells. They hand over a
    // relic: three rare passives, one of which is yours to keep.
    if (state.summary?.boss) {
      const owned = new Set(state.items.map((i) => i.id));
      const rare = content.items.filter((i) => i.rarity === 'rare');
      const unowned = rare.filter((i) => !owned.has(i.id));
      const fallback = rare.filter((i) => owned.has(i.id));
      const ordered = [...rngShuffle(state, unowned), ...rngShuffle(state, fallback)];
      const picks: ItemDef[] = [];
      const seen = new Set<string>();

      for (const item of ordered) {
        if (picks.length >= 3) break;
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        picks.push(item);
      }

      for (const item of picks) {
        options.push({
          id: `item:${item.id}`,
          kind: 'item',
          def: item.id,
          rarity: 'rare',
          label: item.name,
          description: item.description,
        });
      }
      if (options.length === 0) {
        options.push({
          id: 'gold',
          kind: 'gold',
          amount: 30,
          label: '30 gold',
          description: 'The vault is empty, but the coins are real.',
        });
      }
      return options;
    }

    // Ordinary victories pay coins, sometimes a spell, and only rarely a
    // piece of gear or a meal. Shops and events are the reliable source.
    const goldAmount = Math.max(1, Math.floor((8 + 3 * state.act) * 0.7));
    options.push({
      id: 'gold',
      kind: 'gold',
      amount: goldAmount,
      label: `${goldAmount} gold`,
      description: 'A handful of coins. Always useful.',
    });

    if (content.spells.length > 0 && rngChance(state, 70)) {
      const spell = rngPick(state, content.spells);
      options.push({
        id: `spell:${spell.id}`,
        kind: 'spell',
        def: spell.id,
        label: spell.name,
        description: spell.description,
      });
    } else {
      options.push({
        id: 'gold-extra',
        kind: 'gold',
        amount: goldAmount + 4,
        label: `${goldAmount + 4} gold`,
        description: 'A heavier purse instead of a spell.',
      });
    }

    if (rngChance(state, 30)) {
      const itemPool = content.items.filter(
        (i) => i.rarity !== 'rare' && (i.kind !== 'gear' || !state.items.some((owned) => owned.id === i.id)),
      );
      const roll = rngNext(state);
      if (roll < 0.6 && itemPool.length > 0) {
        const item = rngPick(state, itemPool);
        options.push({
          id: `item:${item.id}`,
          kind: 'item',
          def: item.id,
          label: item.name,
          description: item.description,
        });
      } else if (content.foods.length > 0) {
        const food = rngPick(state, content.foods);
        options.push({
          id: `eat:${food.id}`,
          kind: 'eat',
          def: food.id,
          label: food.name,
          description: food.description,
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
    } else if (option.kind === 'upgrade' && option.def) {
      const upgrade = upgradeById.get(option.def);
      if (upgrade) applyEffects(rt, upgrade.effects, { kind: 'rules' });
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
    const ownedGear = new Set(
      state.items.filter((i) => itemById.get(i.id)?.kind === 'gear').map((i) => i.id),
    );
    const itemPool = content.items.filter(
      (i) => i.rarity !== 'rare' && (i.kind !== 'gear' || !ownedGear.has(i.id)),
    );
    const offers: Offer[] = [];
    const picked: Array<{ kind: Offer['kind']; def: string; price: number }> = [];

    // Shops sell gear, food and permanent upgrades. Spells are never on the
    // shelf: they come from food and from item triggers.
    const picks = rngShuffle(state, itemPool).slice(0, 2);
    for (const item of picks) {
      picked.push({ kind: 'item', def: item.id, price: item.price });
    }
    if (content.foods.length > 0) {
      const food = rngPick(state, content.foods);
      picked.push({ kind: 'eat', def: food.id, price: food.price });
    }
    if (content.upgrades.length > 0) {
      const upgrade = rngPick(state, content.upgrades);
      picked.push({ kind: 'upgrade', def: upgrade.id, price: upgrade.price });
    }

    picked.forEach((pick, index) => {
      offers.push({ id: `o${index}`, kind: pick.kind, def: pick.def, price: pick.price });
    });
    return offers;
  }

  function openShop(rt: Runtime): void {
    const state = rt.state;
    state.shop = {
      offers: generateOffers(rt),
      rerollCost: 2,
      rerolls: 0,
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
    if (state.gold < offer.price) {
      emit(rt, { type: 'shopRejected', offerId, reason: 'Not enough gold.' });
      return;
    }

    if (!spendGold(rt, offer.price)) return;

    if (offer.kind === 'item') {
      addItem(rt, offer.def);
    } else if (offer.kind === 'spell') {
      addSpell(rt, offer.def);
    } else if (offer.kind === 'eat') {
      eatFood(rt, offer.def);
    } else if (offer.kind === 'upgrade') {
      const upgrade = upgradeById.get(offer.def);
      if (upgrade) applyEffects(rt, upgrade.effects, RULES);
    }

    if (isOver(state)) return;

    shop.offers = shop.offers.filter((o) => o.id !== offerId);
    emit(rt, { type: 'offerBought', offerId, kind: offer.kind, price: offer.price });
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
    shop.rerollCost += 1;
    shop.offers = generateOffers(rt);
    emit(rt, {
      type: 'shopRerolled',
      offers: clone(shop.offers),
      rerollCost: shop.rerollCost,
    });
  }

  function sellItem(rt: Runtime, instance: InstanceId): void {
    const state = rt.state;
    if (state.phase !== 'shop' || !state.shop) return;
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
    if (content.happenings.length === 0) {
      advanceNode(rt);
      return;
    }
    const def = rngPick(state, content.happenings);
    state.happening = {
      id: def.id,
      options: def.options.map((option) => ({
        id: option.id,
        label: option.label,
        description: option.description,
        costGold: option.costGold,
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
      if (state.gold < option.costGold) {
        emit(rt, { type: 'message', text: 'Not enough gold.' });
        return;
      }
      spendGold(rt, option.costGold, { kind: 'happening', happening: def.id });
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

  function enterNode(rt: Runtime): void {
    const state = rt.state;
    if (state.nodeIndex >= state.nodes.length) {
      victory(rt);
      return;
    }
    const node = state.nodes[state.nodeIndex];
    state.act = Math.floor(state.nodeIndex / NODES_PER_ACT);
    emit(rt, {
      type: 'nodeEntered',
      index: state.nodeIndex,
      kind: node.kind,
      act: state.act,
    });

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
      return;
    }

    round.elapsedMs += dt;
    round.remainingMs = Math.max(0, round.remainingMs - dt);
    runHook(rt, 'onTimerTick', { remainingMs: round.remainingMs, dtMs: dt });
    if (isOver(state)) return;
    if (round.remainingMs <= 0) expireRound(rt);
  }

  // ── view ─────────────────────────────────────────────────────────────────

  function boardView(state: RunState): BoardView {
    const round = state.round as RoundState;
    const boss = round.boss ? bossById.get(round.boss) : undefined;
    const rawNext = round.baseDamage + round.paidGuesses;
    const noGuessDamage = Boolean(boss?.noGuessDamage);

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
    for (const letter of state.purged) {
      if (!keyboard[letter] || keyboard[letter] === 'absent') keyboard[letter] = 'purged';
    }

    return {
      guesses: round.guesses.map((guess) => presentGuess(state, guess)),
      freeGuessesLeft: round.freeLeft,
      nextGuessDamage: round.freeLeft > 0 || noGuessDamage ? 0 : rawNext,
      rawNextGuessDamage: rawNext,
      remainingMs: round.remainingMs,
      timerStartMs: round.timerStartMs,
      timerFrozen: round.frozenUntilGuess || round.frozenMs > 0,
      keyboard,
      bossState: { ...round.bossState },
      gauntletIndex: round.gauntletIndex,
      gauntletTotal: round.gauntletTotal,
      noGuessDamage,
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
      case 'shop':
        phase = {
          kind: 'shop',
          offers: clone(state.shop?.offers ?? []),
          rerollCost: state.shop?.rerollCost ?? 2,
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
      act: state.act,
      ascension: state.ascension,
      hp: state.hp,
      maxHp: state.maxHp,
      armor: state.armor,
      maxArmor: state.maxArmor,
      gold: state.gold,
      slots: { used: usedSlots(state), total: state.slots },
      items: state.items.map((item) => itemView(state, item)),
      spells: state.spells.map((s) => spellView(s)),
      blacklist: state.blacklist.slice(),
      blacklistCapacity: state.blacklistCapacity,
      purged: state.purged.slice(),
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
      case 'continue':
        continueRun(rt);
        break;
    }

    return { state: draft, events: rt.events };
  }

  // ── run construction / serialization ─────────────────────────────────────

  function rollNodes(state: RunState): void {
    const nodes: RunState['nodes'] = [];
    const usedBosses = new Set<string>();
    for (let act = 0; act < ACTS; act++) {
      const bossPool = content.bosses.filter(
        (b) => b.acts.includes(act) && !usedBosses.has(b.id),
      );
      const fallback = content.bosses.filter((b) => !usedBosses.has(b.id));
      const pool = bossPool.length > 0 ? bossPool : fallback;
      const boss = pool.length > 0 ? rngPick(state, pool) : undefined;
      if (boss) usedBosses.add(boss.id);
      const support = (): RunNode =>
        rngChance(state, 60) ? { kind: 'shop' } : { kind: 'happening' };
      nodes.push({ kind: 'round' });
      nodes.push(support());
      nodes.push({ kind: 'round' });
      nodes.push(support());
      nodes.push({ kind: 'round' });
      nodes.push({ kind: 'boss', boss: boss?.id });
    }
    state.nodes = nodes;
  }

  function newRun(opts: { seed: string; ascension?: number }): StepResult {
    const seed = String(opts.seed || 'blacklist');
    const ascension = Math.max(0, Math.floor(opts.ascension ?? 0));
    const maxHp = Math.max(10, 40 - 3 * ascension);
    const startArmor = ascension >= 4 ? 0 : 1;
    const state: RunState = {
      version: VERSION,
      seed,
      rng: hashSeed(seed),
      nextId: 1,
      ascension,
      nodes: [],
      nodeIndex: 0,
      act: 0,
      hp: maxHp,
      maxHp,
      armor: startArmor,
      maxArmor: startArmor,
      gold: Math.max(0, 10 - 2 * ascension),
      slots: 4,
      bonusTimeMs: 0,
      bonusBaseDamage: 0,
      bonusSolveGold: 0,
      items: [],
      spells: [],
      blacklist: [],
      blacklistCapacity: 16,
      purged: [],
      usedAnswers: [],
      pendingPurge: 0,
      phase: 'round',
      stats: {
        rounds: 0,
        guesses: 0,
        goldEarned: 0,
        bosses: 0,
        timeouts: 0,
        damageTaken: 0,
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
    enterNode(rt);
    return { state, events: rt.events };
  }

  function serialize(state: RunState): string {
    return JSON.stringify(state);
  }

  function deserialize(json: string): RunState | null {
    try {
      const parsed = JSON.parse(json) as Partial<RunState> | null;
      if (!parsed || typeof parsed !== 'object') return null;
      if (parsed.version !== VERSION && parsed.version !== 1) return null;
      if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.items)) return null;
      if (typeof parsed.hp !== 'number' || typeof parsed.maxHp !== 'number') return null;
      if (typeof parsed.rng !== 'number') return null;

      const state = parsed as RunState;
      state.version = VERSION;
      state.bonusSolveGold = typeof state.bonusSolveGold === 'number' ? state.bonusSolveGold : 0;
      for (const item of state.items) {
        if (typeof item.equipped !== 'boolean') item.equipped = true;
      }
      return state;
    } catch {
      return null;
    }
  }

  return { newRun, step, view, serialize, deserialize };
}
