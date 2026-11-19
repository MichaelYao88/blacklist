/**
 * BLACKLIST — shared contract.
 *
 * The engine is deliberately platform-agnostic:
 * - time only arrives through `tick`
 * - all randomness comes from the seeded RNG stored in RunState
 * - state is plain JSON (arrays/objects/numbers/strings/booleans only)
 * - the UI only renders views and replays events
 *
 * That keeps the same core usable from the vanilla web client, a React client,
 * or a future Unity/C# port via a JS runtime.
 */

export type Letter = string;
export type ItemId = string;
export type SpellId = string;
export type BossId = string;
export type CurseId = string;
export type HappeningId = string;
export type InstanceId = string;

export type TileTruth = 'correct' | 'present' | 'absent';
export type TileShown = TileTruth | 'hit' | 'hidden';
export type KeyboardStatus = 'correct' | 'present' | 'absent' | 'hit' | 'hidden' | 'purged';

export interface PresentedGuess {
  word: string;
  tiles: TileShown[];
  counts?: { correct: number; present: number };
}

export type Source =
  | { kind: 'rules' }
  | { kind: 'item'; instance: InstanceId }
  | { kind: 'spell'; spell: SpellId }
  | { kind: 'boss'; boss: BossId }
  | { kind: 'happening'; happening: HappeningId };

export type NodeKind = 'round' | 'boss' | 'shop' | 'happening' | 'curse';
export type PhaseKind = 'round' | 'summary' | 'reward' | 'shop' | 'happening' | 'bossIntro' | 'curse' | 'over';
export type CurseTag = 'vision' | 'damage' | 'clock' | 'list' | 'shop' | 'body' | 'economy' | 'rule';
export type ItemKind = 'gear' | 'consumable';
export type OfferKind = 'item' | 'spell' | 'eat';
export type HookName =
  | 'onRoundStart'
  | 'onGuessScored'
  | 'onSolve'
  | 'onRoundEnd'
  | 'onSpellCast'
  | 'onEat'
  | 'onHeal'
  | 'onTimerTick'
  | 'onPurchase'
  | 'onSell'
  | 'onDamageTaken'
  | 'onDeath'
  | 'onPuzzleSolved'
  | 'onGoldSpent'
  | 'onMaxHpChanged'
  | 'onReveal'
  | 'onCurseGained';

export type RejectReason =
  | 'wrongPhase'
  | 'wrongLength'
  | 'notAWord'
  | 'blacklisted'
  | 'purgedLetter';
export type RoundOutcome = 'solved' | 'timeout' | 'died';

export interface RunStats {
  rounds: number;
  guesses: number;
  goldEarned: number;
  bosses: number;
  timeouts: number;
  damageTaken: number;
  solves: number;
  solveMs: number;
  playMs: number;
}

export interface RunNode {
  kind: NodeKind;
  /** Level shown in the HUD. Curse floors share the same counter. */
  level?: number;
  boss?: BossId;
}

export interface ItemInstance {
  instance: InstanceId;
  id: ItemId;
  data: Record<string, number>;
  /** Equipped items are active and occupy slots. Bagged items do nothing. */
  equipped?: boolean;
}
export interface SpellInstance {
  instance: InstanceId;
  id: SpellId;
}

export interface ScoredGuess {
  word: string;
  truth: TileTruth[];
  index: number;
  free: boolean;
  by: 'player' | 'friend';
  /** The free guess from Time Freeze ignores vision curses. */
  unobscured?: boolean;
}

export interface RoundState {
  answer: string;
  boss?: BossId;
  guesses: ScoredGuess[];
  freeLeft: number;
  paidGuesses: number;
  baseDamage: number;
  /** Extra damage added to each later wrong, non-free guess this round. */
  damageRamp: number;
  elapsedMs: number;
  remainingMs: number | null;
  timerStartMs: number | null;
  /** null when the run has no clock curse. */
  frozenMs: number;
  frozenUntilGuess: boolean;
  /** The next free guess granted by Time Freeze ignores vision curses. */
  nextFreeUnobscured: boolean;
  immuneGuesses: number;
  /** Damage is ignored while elapsedMs is below this value. */
  immuneUntilMs: number;
  /** Guess damage is ignored while elapsedMs is below this value. */
  guessImmuneUntilMs: number;
  damageTaken: number;
  bossState: Record<string, number>;
  gauntletIndex: number;
  gauntletTotal: number;
  gauntletAnswers: string[];
  totalGuesses: number;
  /** Guesses that were free and unobscured from Time Freeze. */
  unobscuredGuesses: number;
  /** Persistent keyboard information from Omen and reveal items. */
  hints: Partial<Record<Letter, 'present' | 'absent'>>;
}

export interface SummaryState {
  outcome: RoundOutcome;
  answer: string;
  answers?: string[];
  guesses: number;
  elapsedMs: number;
  boss?: BossId;
  rewardPending: boolean;
  gold: number;
}

export interface RewardOption {
  id: string;
  kind: 'gold' | 'spell' | 'item' | 'eat';
  def?: string;
  amount?: number;
  rarity?: 'common' | 'rare';
  label: string;
  description: string;
}
export interface RewardState {
  options: RewardOption[];
  boss: boolean;
  chosen?: string;
}

export type VisionEffect =
  | { kind: 'hidePosition'; index: number }
  | { kind: 'hideLetters'; letters: string }
  | { kind: 'ambiguousLetters'; letters: string };

export interface CurseDef {
  id: CurseId;
  name: string;
  description: string;
  rules: string[];
  art: string;
  tags: CurseTag[];
  maxStacks: number;
  weight?: number;
  startingEligible?: boolean;
  minLevel?: number;
  maxLevel?: number;
  vision?: VisionEffect[];
  timer?: boolean;
  damagePerGreen?: number;
  damagePerYellow?: number;
  damageTiers?: Array<{ green: number; yellow: number }>;
  damageMultiplier?: number;
  shopItemDelta?: number;
  shopFoodDelta?: number;
  shopPriceAdd?: number;
  freeGuessDelta?: number;
  armorRefillMult?: number;
  healMult?: number;
  slotDelta?: number;
  maxHpMult?: number;
  goldMult?: number;
  noSell?: boolean;
  noReveal?: boolean;
}

export interface CurseStack {
  id: CurseId;
  stacks: number;
}

export interface CurseState {
  options: CurseId[];
  starting: boolean;
  chosen?: CurseId;
}

export interface Offer {
  id: string;
  kind: OfferKind;
  def: string;
  price: number;
  /** A shop sale marks one item down by half. */
  sale?: boolean;
  originalPrice?: number;
}
export interface ShopState {
  offers: Offer[];
  rerollCost: number;
  rerolls: number;
  /** Purchases made in this shop, used by first-purchase effects. */
  purchases: number;
  /** Unique node index for this shop visit, used by per-shop counters. */
  visit: number;
  /** Food offers on the current shelf. */
  foodOffers: number;
  /** Foods bought from the current shelf. */
  foodsBought: number;
}

export interface HappeningOutcomeView {
  chancePct: number;
  text: string;
}
export interface HappeningOptionView {
  id: string;
  label: string;
  description: string;
  costGold?: number;
  fallbackPct?: number;
  chancePct?: number;
  outcomes: HappeningOutcomeView[];
}
export interface HappeningState {
  id: HappeningId;
  options: HappeningOptionView[];
  /** Pre-rolled previews for events such as The Bargain. */
  previewItem?: ItemId;
  previewCurse?: CurseId;
  resolved?: { option: string; success: boolean; text: string };
}

export type Effect =
  | { type: 'damage'; amount: number; ignoreArmor?: boolean }
  | { type: 'heal'; amount: number }
  | { type: 'healPercent'; percent: number }
  | { type: 'healMissingPercent'; percent: number }
  | { type: 'healDiceGold'; min: number; max: number }
  | { type: 'healOverflowMaxHp'; amount: number }
  | { type: 'maxHp'; delta: number }
  | { type: 'maxHpMultiply'; factor: number }
  | { type: 'hpMultiply'; factor: number }
  | { type: 'armor'; delta: number }
  | { type: 'refillArmor' }
  | { type: 'maxArmor'; delta: number; chancePct?: number }
  | { type: 'revive'; hp: number }
  | { type: 'gold'; amount: number }
  | { type: 'solveGold'; amount: number }
  | { type: 'addTime'; ms: number }
  | { type: 'timeBonus'; ms: number }
  | { type: 'freezeTime'; ms: number }
  | { type: 'freezeUntilGuess' }
  | { type: 'freeGuesses'; count: number }
  | { type: 'freeGuessBonus'; delta: number }
  | { type: 'makeGuessFree'; chancePct?: number }
  | { type: 'immunity'; guesses: number }
  | { type: 'timedImmunity'; ms: number }
  | { type: 'revealYellow' }
  | { type: 'revealLetter'; letter: Letter }
  | { type: 'revealRandom'; count: number }
  | { type: 'revealAbsent'; count: number }
  | { type: 'pendingAbsent'; count: number }
  | { type: 'purgeLetter'; letter: Letter }
  | { type: 'clearBlacklist' }
  | { type: 'randomChoice'; options: Effect[][] }
  | { type: 'giveSpell'; spell: SpellId | 'random'; chancePct?: number }
  | { type: 'castSpell'; spell: SpellId }
  | { type: 'friendGuesses'; count: number }
  | { type: 'autoGuess'; word: string }
  | { type: 'eatBurst'; count: number }
  | { type: 'grow'; stat: string; by: number }
  | { type: 'setItemData'; stat: string; value: number }
  | { type: 'consumeSelf' }
  | { type: 'addItem'; item: ItemId }
  | { type: 'addRandomItem' }
  | { type: 'addRandomRelic' }
  | { type: 'addRandomCurse' }
  | { type: 'addPreviewItem' }
  | { type: 'addPreviewCurse' }
  | { type: 'eat'; food: string }
  | { type: 'eatRandom' }
  | { type: 'slots'; delta: number }
  | { type: 'pendingPurge'; count: number }
  | { type: 'addCurse'; curse: CurseId }
  | { type: 'removeRandomCurse'; chancePct?: number }
  | { type: 'rerollShop' }
  | { type: 'giveMissingSpells'; chancePct?: number }
  | { type: 'queueLastAnswer' }
  | { type: 'damageCapNextRound'; amount: number }
  | { type: 'visionCounts'; rounds: number }
  | { type: 'armSpellDouble' }
  | { type: 'armSaleDouble' }
  | { type: 'awaitCurseRemoval' }
  | { type: 'bossData'; key: string; value: number }
  | { type: 'message'; text: string };

export interface Ctx {
  readonly state: RunState;
}
export interface ItemCtx extends Ctx {
  readonly self: ItemInstance;
  /** Spell count before any onRoundStart item fired. */
  readonly roundStartSpells?: number;
}

export interface HookPayloads {
  onRoundStart: { boss?: BossId; timerMs: number | null; roundNumber: number; baseDamage: number };
  onGuessScored: {
    guess: ScoredGuess;
    previous?: ScoredGuess;
    elapsedMs: number;
    remainingMs: number | null;
    paidIndex: number;
  };
  onSolve: {
    guesses: number;
    elapsedMs: number;
    remainingMs: number | null;
    damageTaken: number;
    ruledOut: number;
    boss?: BossId;
  };
  onRoundEnd: { outcome: RoundOutcome; boss?: BossId; damageTaken: number };
  onSpellCast: { spell: SpellId };
  onEat: { food: string };
  onHeal: { amount: number; hp: number };
  onTimerTick: { remainingMs: number | null; elapsedMs: number; dtMs: number };
  onPurchase: { offer: Offer };
  onSell: { item: ItemView };
  onDamageTaken: {
    incoming: number;
    dealt: number;
    /** Damage soaked by armor points. */
    armorUsed: number;
    /** Damage stopped by armor or immunity. */
    blocked: number;
    source: Source;
  };
  onDeath: { source: string };
  onGoldSpent: { amount: number; total: number };
  onMaxHpChanged: { delta: number; maxHp: number };
  onReveal: { letter: Letter; status: 'present' | 'absent' };
  onPuzzleSolved: { index: number; total: number; elapsedMs: number };
  onCurseGained: { curse: CurseId; stacks: number };
}
export type Reactors<C extends Ctx> = Partial<{
  [H in HookName]: (ctx: C, payload: HookPayloads[H]) => Effect[];
}>;

export interface ItemDef {
  id: ItemId;
  name: string;
  description: string;
  /** Optional live text for items that track state, such as growing rewards. */
  dynamicDescription?: (data: Record<string, number>) => string;
  price: number;
  kind: ItemKind;
  /** Rare relics are boss prizes. They consume an item slot like any other gear. */
  rarity?: 'common' | 'rare';
  /** Allows guesses that are not in the dictionary. */
  allowInvalidGuesses?: boolean;
  slots?: number;
  /** Chance to double any gold this item's owner gains. */
  goldDoubleChance?: number;
  /** Extra gold added to every positive gold gain. */
  goldGainBonus?: number;
  initial?: Record<string, number>;
  on?: Reactors<ItemCtx>;
  onAcquire?: (ctx: ItemCtx) => Effect[];
  onUse?: (ctx: ItemCtx) => Effect[];
  modifyDamage?: (ctx: ItemCtx, amount: number) => number;
  sellValue?: (ctx: ItemCtx) => number;
  /** Gold taken off the first purchase in each shop. */
  shopDiscount?: number;
  /** Food effects are applied twice, but on-eat hooks still fire once. */
  doubleFood?: boolean;
  /** Hidden from shops/rewards until a clock curse exists. */
  requiresClock?: boolean;
  /** Hidden from shops/rewards until this many vision curses exist. */
  requiresVisionCurse?: number;
  /** Shows the count-up timer while equipped. */
  timerInterest?: boolean;
}

export interface SpellDef {
  id: SpellId;
  name: string;
  description: string;
  price: number;
  usable: 'round' | 'any';
  cast: (ctx: Ctx) => Effect[];
}

export interface BossDef {
  id: BossId;
  name: string;
  description: string;
  acts: number[];
  timerMs: number | null;
  gauntlet?: { puzzles: number; timerMs: number };
  timerFromCurse?: boolean;
  noGuessDamage?: boolean;
  /** Fixed damage for a boss round. Omit to use the act-based default. */
  damage?: number;
  /** Per-guess damage override. Omit to use the round's base damage. */
  damageFor?: (state: RunState, round: RoundState) => number;
  /** Optional override for the damage chip on the boss intro screen. */
  damageLabel?: string;
  /** Plain-language mechanics shown on the boss intro screen. */
  rules: string[];
  answerPool?: 'normal' | 'hard';
  initialState?: Record<string, number>;
  present?: (ctx: Ctx, guess: ScoredGuess) => PresentedGuess;
  on?: Reactors<Ctx>;
}

export interface FoodDef {
  id: string;
  name: string;
  description: string;
  price: number;
  rarity?: 'common' | 'rare';
  requiresClock?: boolean;
  /** Hidden from shops/rewards until this many vision curses exist. */
  requiresVisionCurse?: number;
  effects: Effect[];
}

export interface HappeningOutcomeDef {
  chancePct: number;
  text: string;
  effects: Effect[];
}
export interface HappeningOptionDef {
  id: string;
  label: string;
  description: string;
  costGold?: number;
  /** If the player cannot pay costGold, take this fraction of their gold instead. */
  fallbackPct?: number;
  outcomes: HappeningOutcomeDef[];
}
export interface HappeningDef {
  id: HappeningId;
  name: string;
  description: string;
  requiresCurseCount?: number;
  /** Hidden from the event pool until a clock curse exists. */
  requiresClock?: boolean;
  weight?: number;
  options: HappeningOptionDef[];
}

export interface Content {
  items: ItemDef[];
  spells: SpellDef[];
  bosses: BossDef[];
  curses: CurseDef[];
  foods: FoodDef[];
  happenings: HappeningDef[];
  answers: readonly string[];
  valid: ReadonlySet<string>;
  hardAnswers: readonly string[];
  friendWords: readonly string[];
  /** Curated two-word catchphrases the Phone a Friend guy can deliver. */
  friendPhrases: readonly (readonly [string, string])[];
}

export interface RunState {
  version: number;
  seed: string;
  rng: number;
  nextId: number;
  ascension: number;
  nodes: RunNode[];
  nodeIndex: number;
  level: number;
  act: number;
  hp: number;
  maxHp: number;
  armor: number;
  maxArmor: number;
  gold: number;
  slots: number;
  bonusTimeMs: number;
  bonusBaseDamage: number;
  bonusSolveGold: number;
  /** Permanent change to free guesses per round from foods such as Sundial. */
  freeGuessBonus: number;
  items: ItemInstance[];
  spells: SpellInstance[];
  blacklist: string[];
  /** First guess of every round this run, used to seed The List when taken. */
  firstGuesses: string[];
  purged: Letter[];
  usedAnswers: string[];
  lastAnswer?: string;
  /** Knafeh: guess this word for free at the start of the next round. */
  nextRoundGuess?: string;
  /** King Mushroom: cap the next round's wrong-guess damage. */
  nextRoundDamageCap?: number;
  /** Midnight Snack: show correct/misplaced counts for this many rounds. */
  visionCountsRounds?: number;
  /** Spell Pepper: the next player-cast spell resolves twice. */
  nextSpellDouble?: boolean;
  /** Chilaquiles: the next sold item pays double. */
  nextSaleDouble?: boolean;
  pendingPurge: number;
  /** Absent letters queued to reveal at the start of the next round. */
  pendingAbsent: number;
  /** Letter reveals queued outside a round, applied when the next round starts. */
  pendingReveals: Letter[];
  /** Letters that are re-revealed for every round for the rest of the run. */
  permanentReveals: Letter[];
  curses: CurseStack[];
  /** Curse ids that have appeared in a draft, whether taken or not. */
  seenCurses: CurseId[];
  pendingStartingCurses: number;
  pendingCurseRemoval: number;
  phase: PhaseKind;
  bossIntro?: { boss: BossId };
  curse?: CurseState;
  round?: RoundState;
  summary?: SummaryState;
  reward?: RewardState;
  shop?: ShopState;
  happening?: HappeningState;
  over?: { result: 'victory' | 'defeat'; answer?: string; answers?: string[] };
  stats: RunStats;
}

export interface ItemView {
  instance: InstanceId;
  id: ItemId;
  data: Record<string, number>;
  kind: ItemKind;
  slots: number;
  equipped: boolean;
  sellValue: number;
}
export interface SpellView {
  instance: InstanceId;
  id: SpellId;
}

export interface BoardView {
  guesses: PresentedGuess[];
  freeGuessesLeft: number;
  nextGuessDamage: number;
  rawNextGuessDamage: number;
  /** Damage taken if the clock runs out: 2x the guess hit + 30% max HP. */
  timeoutDamage: number;
  remainingMs: number | null;
  timerStartMs: number | null;
  elapsedMs: number;
  timerMode: 'hidden' | 'countup' | 'countdown';
  timerFrozen: boolean;
  keyboard: Partial<Record<Letter, KeyboardStatus>>;
  bossState: Record<string, number>;
  gauntletIndex: number;
  gauntletTotal: number;
  noGuessDamage: boolean;
  hints: Partial<Record<Letter, 'present' | 'absent'>>;
  ruledOut: number;
  /** True while a timed immunity item is protecting the opening seconds. */
  shielded: boolean;
  shieldMsLeft: number;
  /** Remaining time on the Immunity spell's post-hit guess shield. */
  guessImmuneMsLeft: number;
}

export type PhaseView =
  | { kind: 'round'; boss?: BossId; board: BoardView }
  | {
      kind: 'summary';
      outcome: RoundOutcome;
      answer: string;
      answers?: string[];
      guesses: number;
      elapsedMs: number;
      boss?: BossId;
      rewardPending: boolean;
      gold: number;
    }
  | { kind: 'reward'; options: RewardOption[]; boss: boolean; chosen?: string }
  | { kind: 'bossIntro'; boss: BossId }
  | { kind: 'curse'; options: CurseId[]; starting: boolean }
  | { kind: 'shop'; offers: Offer[]; rerollCost: number; purchases: number }
  | {
      kind: 'happening';
      happening: HappeningId;
      options: HappeningOptionView[];
      previewItem?: ItemId;
      previewCurse?: CurseId;
      resolved?: { option: string; success: boolean; text: string };
    }
  | {
      kind: 'over';
      result: 'victory' | 'defeat';
      answer?: string;
      answers?: string[];
      stats: RunStats;
    };

export interface RunView {
  phase: PhaseView;
  nodes: RunNode[];
  nodeIndex: number;
  level: number;
  act: number;
  ascension: number;
  curses: Array<{ id: CurseId; name: string; stacks: number; rules: string[]; tags: CurseTag[] }>;
  pendingCurseRemoval: number;
  hp: number;
  maxHp: number;
  armor: number;
  maxArmor: number;
  gold: number;
  slots: { used: number; total: number };
  items: ItemView[];
  spells: SpellView[];
  blacklist: string[];
  purged: Letter[];
  revealed: Array<{ letter: Letter; status: 'present' | 'absent' }>;
  pendingPurge: number;
  lastAnswer?: string;
  stats: RunStats;
}

export type Command =
  | { type: 'guess'; word: string }
  | { type: 'castSpell'; instance: InstanceId }
  | { type: 'useItem'; instance: InstanceId }
  | { type: 'purgeLetter'; letter: Letter }
  | { type: 'tick'; dtMs: number }
  | { type: 'buy'; offerId: string }
  | { type: 'reroll' }
  | { type: 'sell'; instance: InstanceId }
  | { type: 'equipItem'; instance: InstanceId }
  | { type: 'unequipItem'; instance: InstanceId }
  | { type: 'choose'; optionId: string }
  | { type: 'chooseReward'; optionId: string }
  | { type: 'chooseCurse'; curseId: CurseId }
  | { type: 'removeCurse'; curseId: CurseId }
  | { type: 'continue' };

export type GameEvent =
  | { type: 'runStarted'; seed: string; ascension: number; nodes: RunNode[] }
  | { type: 'nodeEntered'; index: number; kind: NodeKind; act: number; level: number }
  | { type: 'bossIntro'; boss: BossId }
  | { type: 'curseOffered'; options: CurseId[]; starting: boolean }
  | { type: 'curseChosen'; curse: CurseId; stacks: number; name: string }
  | { type: 'curseRemoved'; curse: CurseId; stacks: number }
  | {
      type: 'roundStarted';
      boss?: BossId;
      timerMs: number | null;
      freeGuesses: number;
      roundNumber: number;
      baseDamage: number;
      gauntletTotal: number;
    }
  | {
      type: 'roundEnded';
      outcome: RoundOutcome;
      answer: string;
      answers?: string[];
      guesses: number;
      elapsedMs: number;
    }
  | { type: 'guessRejected'; word: string; reason: RejectReason }
  | {
      type: 'guessScored';
      by: 'player' | 'friend';
      index: number;
      guess: PresentedGuess;
      free: boolean;
      word: string;
    }
  | { type: 'guessMadeFree'; index: number; source: Source }
  | { type: 'friendSaid'; text: string }
  | { type: 'blacklistChanged'; list: string[]; added?: string }
  | { type: 'keyboardHint'; letter: Letter; status: 'present' | 'absent' }
  | { type: 'letterPurged'; letter: Letter }
  | { type: 'freeGuessesChanged'; remaining: number; source: Source }
  | {
      type: 'damageTaken';
      incoming: number;
      armorUsed: number;
      blocked: number;
      dealt: number;
      hp: number;
      source: Source;
    }
  | { type: 'healed'; amount: number; hp: number; source: Source }
  | { type: 'maxHpChanged'; maxHp: number; hp: number; source: Source }
  | { type: 'armorChanged'; armor: number; max: number }
  | { type: 'immunityChanged'; guessesLeft: number }
  | { type: 'revived'; hp: number; source: Source }
  | { type: 'timerChanged'; remainingMs: number | null; frozen: boolean; source: Source }
  | { type: 'timeExpired' }
  | { type: 'goldChanged'; delta: number; total: number; source: Source }
  | { type: 'itemAcquired'; item: ItemView }
  | { type: 'itemRemoved'; instance: InstanceId; reason: 'sold' | 'consumed' | 'replaced' }
  | { type: 'itemTriggered'; instance: InstanceId; hook: HookName }
  | { type: 'itemGrew'; instance: InstanceId; stat: string; value: number }
  | { type: 'itemEquipped'; instance: InstanceId; equipped: boolean }
  | { type: 'itemDataChanged'; instance: InstanceId; stat: string; value: number }
  | { type: 'slotsChanged'; slots: number }
  | { type: 'spellGained'; spell: SpellView }
  | { type: 'spellCast'; spell: SpellView }
  | { type: 'spellRejected'; instance: InstanceId; reason: string }
  | { type: 'shopOpened'; offers: Offer[]; rerollCost: number }
  | { type: 'shopRerolled'; offers: Offer[]; rerollCost: number }
  | { type: 'offerBought'; offerId: string; kind: OfferKind; price: number }
  | { type: 'shopRejected'; offerId: string; reason: string }
  | { type: 'happeningOffered'; happening: HappeningId; options: HappeningOptionView[] }
  | {
      type: 'happeningResolved';
      happening: HappeningId;
      option: string;
      success: boolean;
      text: string;
    }
  | { type: 'rewardOffered'; options: RewardOption[]; boss: boolean }
  | { type: 'rewardChosen'; option: string; kind: string; label: string }
  | { type: 'bossStateChanged'; boss: BossId; state: Record<string, number> }
  | { type: 'puzzleSolved'; index: number; total: number; answer: string; elapsedMs: number }
  | { type: 'gauntletAdvanced'; index: number; total: number; timerMs: number | null }
  | { type: 'foodEaten'; food: string; name: string }
  | { type: 'attributeChanged'; stat: string; value: number }
  | { type: 'message'; text: string }
  | { type: 'runEnded'; result: 'victory' | 'defeat'; stats: RunStats };

export interface StepResult {
  state: RunState;
  events: GameEvent[];
}

export interface Core {
  newRun(opts: { seed: string; ascension?: number }): StepResult;
  step(state: RunState, cmd: Command): StepResult;
  view(state: RunState): RunView;
  serialize(state: RunState): string;
  deserialize(json: string): RunState | null;
}

export const defineItem = (d: ItemDef): ItemDef => d;
export const defineSpell = (d: SpellDef): SpellDef => d;
export const defineBoss = (d: BossDef): BossDef => d;
export const defineCurse = (d: CurseDef): CurseDef => d;
export const defineFood = (d: FoodDef): FoodDef => d;
export const defineHappening = (d: HappeningDef): HappeningDef => d;
