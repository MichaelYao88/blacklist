import { game, CoreHost } from '../game';
import type {
  BoardView,
  BossId,
  Command,
  GameEvent,
  ItemView,
  NodeKind,
  Offer,
  PhaseView,
  RunView,
  Source,
  SpellView,
} from '../game';
import {
  BOSS_BY_ID,
  CHARACTERS,
  CHARACTER_BY_ID,
  CURSE_BY_ID,
  FOOD_BY_ID,
  HAPPENING_BY_ID,
  ITEM_BY_ID,
  SPELL_BY_ID,
} from '../content';
import { LocalStore, dismissCharacterTip, dismissDamageTutorial, hasSave, readMeta, recordFood, recordPurchase, recordPurge, recordRun, recordStart, unlockCharacter } from './store';
import {
  trackBossReached,
  trackEventChoice,
  trackGameLoaded,
  trackRunAbandoned,
  trackRunEnded,
  trackRunResumed,
  trackRunStarted,
} from './analytics';
import { escapeHtml, formatTime, reasonText, roman } from './format';
import { ARMOR_TIP, PURGED_TIP, glossaryText } from './glossary';
import {
  bossColor,
  bossSigil,
  enemyArt,
  enemySprite,
  foodIcon,
  itemIcon,
  spellIcon,
} from './icons';
import runnerWalk from '../assets/sprites/runner-walk.png';
import runnerAttack from '../assets/sprites/runner-attack.png';
import runnerPortrait from '../assets/sprites/runner-portrait.png';
import orcWalk from '../assets/sprites/orc-walk.png';
import orcAttack from '../assets/sprites/orc-attack.png';
import orcDeath from '../assets/sprites/orc-death.png';
import runnerDeath from '../assets/sprites/runner-death.png';
import mazeWalk from '../assets/sprites/maze-walk.png';
import mazeAttack from '../assets/sprites/maze-attack.png';
import mazeDeath from '../assets/sprites/maze-death.png';
import mazePortrait from '../assets/sprites/maze-portrait.png';
import necroWalk from '../assets/sprites/necro-walk.png';
import necroAttack from '../assets/sprites/necro-attack.png';
import necroDeath from '../assets/sprites/necro-death.png';
import necroPortrait from '../assets/sprites/necro-portrait.png';
import farmerWalk from '../assets/sprites/farmer-walk.png';
import farmerAttack from '../assets/sprites/farmer-attack.png';
import farmerDeath from '../assets/sprites/farmer-death.png';
import farmerPortrait from '../assets/sprites/farmer-portrait.png';
import kitsuneWalk from '../assets/sprites/kitsune-walk.png';
import kitsuneAttack from '../assets/sprites/kitsune-attack.png';
import kitsuneDeath from '../assets/sprites/kitsune-death.png';
import kitsunePortrait from '../assets/sprites/kitsune-portrait.png';
import tenguWalk from '../assets/sprites/tengu-walk.png';
import tenguAttack from '../assets/sprites/tengu-attack.png';
import tenguDeath from '../assets/sprites/tengu-death.png';
import tenguPortrait from '../assets/sprites/tengu-portrait.png';
import knightWalk from '../assets/sprites/knight-walk.png';
import knightAttack from '../assets/sprites/knight-attack.png';
import knightDeath from '../assets/sprites/knight-death.png';
import knightPortrait from '../assets/sprites/knight-portrait.png';
import werewolfWalk from '../assets/sprites/werewolf-walk.png';
import werewolfAttack from '../assets/sprites/werewolf-attack.png';
import werewolfDeath from '../assets/sprites/werewolf-death.png';
import werewolfPortrait from '../assets/sprites/werewolf-portrait.png';
import { sfx } from './audio';
import { music } from './music';
import { ASCENSION_MAX, ascensionSummary } from '../core/ascension';

interface CharacterSprite {
  walk: string;
  attack: string;
  death: string;
  portrait: string;
  walkFrames: number;
  walkSteps: number;
  attackFrames: number;
  attackSteps: number;
  deathFrames: number;
  deathSteps: number;
  aspect: number;
  width: number;
}

const CHARACTER_SPRITES: Record<string, CharacterSprite> = {
  runner: {
    walk: runnerWalk, attack: runnerAttack, death: runnerDeath, portrait: runnerPortrait,
    walkFrames: 8, walkSteps: 7, attackFrames: 6, attackSteps: 5,
    deathFrames: 4, deathSteps: 3, aspect: 1, width: 1,
  },
  maze: {
    walk: mazeWalk, attack: mazeAttack, death: mazeDeath, portrait: mazePortrait,
    walkFrames: 8, walkSteps: 7, attackFrames: 5, attackSteps: 4,
    deathFrames: 4, deathSteps: 3, aspect: 4 / 3, width: 1.5,
  },
  necromancer: {
    walk: necroWalk, attack: necroAttack, death: necroDeath, portrait: necroPortrait,
    walkFrames: 8, walkSteps: 7, attackFrames: 8, attackSteps: 7,
    deathFrames: 8, deathSteps: 7, aspect: 1, width: 1,
  },
  farmer: {
    walk: farmerWalk, attack: farmerAttack, death: farmerDeath, portrait: farmerPortrait,
    walkFrames: 6, walkSteps: 5, attackFrames: 6, attackSteps: 5,
    deathFrames: 4, deathSteps: 3, aspect: 1, width: 1,
  },
  kitsune: {
    walk: kitsuneWalk, attack: kitsuneAttack, death: kitsuneDeath, portrait: kitsunePortrait,
    walkFrames: 8, walkSteps: 7, attackFrames: 8, attackSteps: 7,
    deathFrames: 8, deathSteps: 7, aspect: 1, width: 1,
  },
  tengu: {
    walk: tenguWalk, attack: tenguAttack, death: tenguDeath, portrait: tenguPortrait,
    walkFrames: 8, walkSteps: 7, attackFrames: 6, attackSteps: 5,
    deathFrames: 6, deathSteps: 5, aspect: 1, width: 1,
  },
  knight: {
    walk: knightWalk, attack: knightAttack, death: knightDeath, portrait: knightPortrait,
    walkFrames: 8, walkSteps: 7, attackFrames: 5, attackSteps: 4,
    deathFrames: 6, deathSteps: 5, aspect: 1, width: 1,
  },
  werewolf: {
    walk: werewolfWalk, attack: werewolfAttack, death: werewolfDeath, portrait: werewolfPortrait,
    walkFrames: 8, walkSteps: 7, attackFrames: 6, attackSteps: 5,
    deathFrames: 2, deathSteps: 1, aspect: 1, width: 1,
  },
};

function characterSprite(characterId: string | undefined): CharacterSprite {
  const def = characterId ? CHARACTER_BY_ID.get(characterId) : undefined;
  return CHARACTER_SPRITES[def?.sprite ?? 'runner'] ?? CHARACTER_SPRITES.runner;
}

function spriteStyle(sprite: CharacterSprite): string {
  return [
    `--walk:url('${sprite.walk}')`,
    `--attack:url('${sprite.attack}')`,
    `--death:url('${sprite.death}')`,
    `--walk-frames:${sprite.walkFrames}`,
    `--walk-steps:${sprite.walkSteps}`,
    `--attack-frames:${sprite.attackFrames}`,
    `--attack-steps:${sprite.attackSteps}`,
    `--death-frames:${sprite.deathFrames}`,
    `--death-steps:${sprite.deathSteps}`,
    `--sprite-aspect:${sprite.aspect}`,
    `--sprite-width:${sprite.width * 100}%`,
  ].join(';');
}

const app = document.getElementById('app');
if (!app) throw new Error('Missing #app root');
document.documentElement.classList.add('ph-no-capture');

// Damage feedback lives outside the main render tree so unrelated re-renders
// (timer ticks, shake cleanup) cannot restart its animation mid-flight.
const fxRoot = document.createElement('div');
fxRoot.id = 'fx-root';
document.body.appendChild(fxRoot);

// Phone a Friend spams his chosen words behind the rest of the UI.
const phraseRoot = document.createElement('div');
phraseRoot.id = 'phrase-root';
document.body.appendChild(phraseRoot);

// Free-guess callout. It lives outside the render tree so timer ticks cannot
// restart the pop animation.
const freeGuessRoot = document.createElement('div');
freeGuessRoot.id = 'free-guess-root';
freeGuessRoot.setAttribute('aria-live', 'polite');
document.body.appendChild(freeGuessRoot);
let freeGuessTimer: number | undefined;

function showFreeGuessPopup(source: string): void {
  freeGuessRoot.innerHTML = `<div class="free-guess-pop">
    <span class="free-guess-kicker">FREE GUESS!</span>
    <span class="free-guess-source">(${escapeHtml(source)})</span>
  </div>`;
  if (freeGuessTimer) window.clearTimeout(freeGuessTimer);
  freeGuessTimer = window.setTimeout(() => {
    freeGuessRoot.innerHTML = '';
    freeGuessTimer = undefined;
  }, 2_400);
}

// The countdown lives outside the render tree so the per-second update only
// swaps the number instead of rebuilding (and restarting) the whole overlay.
const countdownRoot = document.createElement('div');
countdownRoot.id = 'countdown-root';
countdownRoot.setAttribute('aria-live', 'assertive');
document.body.appendChild(countdownRoot);
let countdownShown = 0;

function renderCountdown(level: number, count: number): void {
  if (count <= 0) {
    if (countdownRoot.innerHTML) countdownRoot.innerHTML = '';
    countdownShown = 0;
    return;
  }
  if (!countdownRoot.firstElementChild) {
    countdownRoot.innerHTML = `<div class="countdown-overlay">
      <div class="countdown-card">
        <span class="countdown-kicker"></span>
        <b class="countdown-number"></b>
        <span class="countdown-label">READ THE LIST</span>
      </div>
    </div>`;
  }
  const kicker = countdownRoot.querySelector<HTMLElement>('.countdown-kicker');
  const kickerText = `LEVEL ${level}`;
  if (kicker && kicker.textContent !== kickerText) kicker.textContent = kickerText;
  if (count !== countdownShown) {
    countdownShown = count;
    const number = countdownRoot.querySelector<HTMLElement>('.countdown-number');
    if (number) {
      number.outerHTML = `<b class="countdown-number" data-count="${count}">${count}</b>`;
    }
  }
}

const procRoot = document.createElement('div');
procRoot.id = 'proc-root';
procRoot.setAttribute('aria-live', 'polite');
document.body.appendChild(procRoot);
let phraseTimer: number | undefined;

const spellRoot = document.createElement('div');
spellRoot.id = 'spell-root';
spellRoot.setAttribute('aria-live', 'polite');
document.body.appendChild(spellRoot);
interface SpellPopup {
  id: number;
  name: string;
  icon: string;
  auto: boolean;
}
let spellPopupQueue: SpellPopup[] = [];
let spellPopups: SpellPopup[] = [];
const spellPopupTimers = new Map<number, number>();
let spellReleaseTimer: number | undefined;
let spellPopupSeq = 0;
const POPUP_GAP_MS = 2_000;
const POPUP_EXTRA_MS = 3_000;
const SPELL_POPUP_TTL = POPUP_GAP_MS + POPUP_EXTRA_MS;

function showSpellPopup(spellId: string, auto: boolean): void {
  const def = SPELL_BY_ID.get(spellId);
  spellPopupQueue.push({
    id: ++spellPopupSeq,
    name: def?.name ?? spellId,
    icon: spellIcon(spellId),
    auto,
  });
  releaseNextSpellPopup();
}

function releaseNextSpellPopup(): void {
  if (spellReleaseTimer !== undefined) return;
  const popup = spellPopupQueue.shift();
  if (!popup) return;
  spellPopups.push(popup);
  spellPopupTimers.set(
    popup.id,
    window.setTimeout(() => dropSpellPopup(popup.id), SPELL_POPUP_TTL),
  );
  renderSpellPopups();
  spellReleaseTimer = window.setTimeout(() => {
    spellReleaseTimer = undefined;
    releaseNextSpellPopup();
  }, POPUP_GAP_MS);
}

function dropSpellPopup(id: number): void {
  const timer = spellPopupTimers.get(id);
  if (timer) window.clearTimeout(timer);
  spellPopupTimers.delete(id);
  spellPopups = spellPopups.filter((popup) => popup.id !== id);
  renderSpellPopups();
}

function renderSpellPopups(): void {
  spellRoot.innerHTML = spellPopups.length === 0
    ? ''
    : `<div class="spell-popup-stack">${spellPopups.map((popup) => `
      <div class="spell-popup ${popup.auto ? 'auto' : ''}">
        <span class="spell-popup-icon" aria-hidden="true">${popup.icon}</span>
        <span class="spell-popup-name">${escapeHtml(popup.name)}</span>
        <span class="spell-popup-tag">${popup.auto ? 'AUTOCAST' : 'CAST'}</span>
      </div>`).join('')}</div>`;
}

// The Immunity banner lives outside the main render tree so its timer drain is
// not restarted by the once-per-second render.
const immunityRoot = document.createElement('div');
immunityRoot.id = 'immunity-root';
document.body.appendChild(immunityRoot);
let immunityActive = false;

const openingRoot = document.createElement('div');
openingRoot.id = 'opening-root';
document.body.appendChild(openingRoot);
let openingActive = false;
let openingTotalMs = 0;

const host = new CoreHost({ core: game, store: new LocalStore() });

type Screen = 'title' | 'run' | 'help' | 'stats';
interface Notice {
  text: string;
  kind: 'info' | 'good' | 'bad';
}
let screen: Screen = 'title';
let damageTutorialOpen = false;
let damageTutorialSeen = false;
let damageTutorialMute = false;
let input = '';
let notice: Notice | null = null;
let noticeTimer: number | undefined;
let shake = false;
let shakeTimer: number | undefined;
let lastTick = performance.now();
let paused = false;
let pointerHeld = 0;
let renderQueued = false;
let soundMuted = sfx.muted;
let heartbeatSecond = -1;
interface DamageFx {
  id: number;
  hpLost: number;
  armorSpent: number;
  incoming: number;
  at: number;
  /** Suppressed while a damage tooltip is open. */
  showOverlay: boolean;
}
let damageFx: DamageFx | null = null;
let damageTimer: number | undefined;
let damageSeq = 0;
let damageRendered = 0;
type ArenaAttack = { who: 'player' | 'enemy'; startedAt: number };
let arenaAttack: ArenaAttack | null = null;
let arenaAttackTimer: number | undefined;
let nextArenaAttacker: 'player' | 'enemy' = 'enemy';
let orcDeathStartedAt: number | null = null;
let orcDeathTimer: number | undefined;
let playerDeathStartedAt: number | null = null;
const WALK_MS = 1_000;
const ATTACK_MS = 800;
const ATTACK_CLEAR_MS = 900;
const DEATH_MS = 700;
const KILL_MS = 560;
const spritesStartedAt = performance.now();
let countdownUntil = 0;
let setupPurge = false;
const COUNTDOWN_MS = 2_400;
let selectedAscension = 0;
let selectedCharacter = 'runner';
let characterTip: 'pathfinder' | 'purgamist' | null = null;
let characterTipMute = false;
let characterUnlock: string | null = null;
let characterUnlockQueue: string[] = [];
let keyboardLayoutNoticeShown = false;

function queueCharacterUnlock(id: string): void {
  if (characterUnlock === id || characterUnlockQueue.includes(id)) return;
  characterUnlockQueue.push(id);
  if (!characterUnlock) {
    characterUnlock = characterUnlockQueue.shift() ?? null;
  }
}

function nextCharacterUnlock(): void {
  characterUnlock = characterUnlockQueue.shift() ?? null;
}

type ChronicleKind = 'info' | 'good' | 'bad' | 'spell' | 'item' | 'guess' | 'curse' | 'food' | 'shop';
interface ChronicleEntry {
  id: number;
  level: number;
  kind: ChronicleKind;
  text: string;
}
let chronicleEntries: ChronicleEntry[] = [];
let chronicleSeq = 0;
const CHRONICLE_MAX = 120;

function logChronicle(kind: ChronicleKind, text: string): void {
  chronicleEntries.push({
    id: ++chronicleSeq,
    level: host.current?.level ?? 1,
    kind,
    text,
  });
  if (chronicleEntries.length > CHRONICLE_MAX) chronicleEntries.shift();
}

function clearChronicle(): void {
  chronicleEntries = [];
  chronicleSeq = 0;
}

const KIND_LABELS: Record<Offer['kind'], string> = {
  item: 'ITEM',
  spell: 'SPELL',
  eat: 'FOOD',
};

// ── state / event plumbing ─────────────────────────────────────────────────

function notify(text: string, kind: Notice['kind'] = 'info'): void {
  notice = { text, kind };
  if (noticeTimer) window.clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => {
    notice = null;
    render();
  }, 3200);
}

function flashDamage(hpLost: number, armorSpent: number, incoming: number): void {
  const tooltipOpen = isDamageTooltipOpen();
  damageSeq += 1;
  damageFx = {
    id: damageSeq,
    hpLost,
    armorSpent,
    incoming,
    at: performance.now(),
    showOverlay: !tooltipOpen,
  };
  shake = hpLost > 0 && !tooltipOpen;
  if (shakeTimer) window.clearTimeout(shakeTimer);
  shakeTimer = window.setTimeout(() => {
    shake = false;
    render();
  }, 380);
  if (damageTimer) window.clearTimeout(damageTimer);
  damageTimer = window.setTimeout(() => {
    damageFx = null;
    render();
  }, 1200);
}

function triggerArenaAttack(force?: 'player' | 'enemy'): void {
  const who = force ?? nextArenaAttacker;
  if (!force) nextArenaAttacker = who === 'enemy' ? 'player' : 'enemy';
  arenaAttack = { who, startedAt: performance.now() };
  if (arenaAttackTimer) window.clearTimeout(arenaAttackTimer);
  arenaAttackTimer = window.setTimeout(() => {
    arenaAttack = null;
    arenaAttackTimer = undefined;
    render();
  }, ATTACK_CLEAR_MS);
}

function flashFriendPhrases(words: string[], callout?: string): void {
  const unique = [...new Set(words.map((word) => word.toUpperCase()).filter(Boolean))];
  if (unique.length === 0 && !callout) return;
  const spans = unique.length > 0
    ? Array.from({ length: 20 }, (_, index) => {
        const word = unique[index % unique.length];
        const left = 4 + Math.random() * 88;
        const top = 6 + Math.random() * 82;
        const rotation = -22 + Math.random() * 44;
        const scale = 0.8 + Math.random() * 1.5;
        const delay = Math.random() * 0.35;
        return `<span style="left:${left.toFixed(1)}vw;top:${top.toFixed(1)}vh;--rot:${rotation.toFixed(1)}deg;--scale:${scale.toFixed(2)};animation-delay:${delay.toFixed(2)}s">${escapeHtml(word)}</span>`;
      }).join('')
    : '';
  phraseRoot.innerHTML = (callout
    ? `<div class="phrase-callout">${escapeHtml(callout)}</div>`
    : '') + spans;
  if (phraseTimer) window.clearTimeout(phraseTimer);
  phraseTimer = window.setTimeout(() => {
    phraseRoot.innerHTML = '';
    phraseTimer = undefined;
  }, 1700);
}

interface ProcEntry {
  id: number;
  itemId: string;
  text: string;
  count: number;
}
let procEntries: ProcEntry[] = [];
let procPending: ProcEntry[] = [];
const procTimers = new Map<number, number>();
let procReleaseTimer: number | undefined;
let procSeq = 0;
const PROC_TTL = 7_800 + POPUP_EXTRA_MS;
const PROC_MAX = 4;

function renderProcFeed(): void {
  procRoot.innerHTML = procEntries.map((entry) => {
    const def = ITEM_BY_ID.get(entry.itemId);
    const name = escapeHtml(def?.name ?? entry.itemId);
    const count = entry.count > 1 ? ` ×${entry.count}` : '';
    return `<div class="proc-pop">
      <span class="proc-icon" aria-hidden="true">${itemIcon(entry.itemId)}</span>
      <span class="proc-text"><b>${name}</b><span>${escapeHtml(entry.text)}${count}</span></span>
    </div>`;
  }).join('');
}

function dropProc(id: number): void {
  const timer = procTimers.get(id);
  if (timer) window.clearTimeout(timer);
  procTimers.delete(id);
  procEntries = procEntries.filter((entry) => entry.id !== id);
  renderProcFeed();
}

function releaseNextProc(): void {
  if (procReleaseTimer !== undefined) return;
  const entry = procPending.shift();
  if (!entry) return;
  procEntries.push(entry);
  procTimers.set(entry.id, window.setTimeout(() => dropProc(entry.id), PROC_TTL));
  if (procEntries.length > PROC_MAX) {
    const dropped = procEntries.shift();
    if (dropped) {
      const timer = procTimers.get(dropped.id);
      if (timer) window.clearTimeout(timer);
      procTimers.delete(dropped.id);
    }
  }
  renderProcFeed();
  procReleaseTimer = window.setTimeout(() => {
    procReleaseTimer = undefined;
    releaseNextProc();
  }, POPUP_GAP_MS);
}

function showProc(itemId: string, text: string): void {
  const existing = procEntries.find((entry) => entry.itemId === itemId)
    ?? procPending.find((entry) => entry.itemId === itemId);
  if (existing) {
    existing.count += 1;
    existing.text = text;
    if (procEntries.includes(existing)) {
      const timer = procTimers.get(existing.id);
      if (timer) window.clearTimeout(timer);
      procTimers.set(existing.id, window.setTimeout(() => dropProc(existing.id), PROC_TTL));
    }
  } else {
    procPending.push({ id: ++procSeq, itemId, text, count: 1 });
  }
  releaseNextProc();
  renderProcFeed();
}

function clearProcFeed(): void {
  for (const timer of procTimers.values()) window.clearTimeout(timer);
  if (procReleaseTimer) window.clearTimeout(procReleaseTimer);
  procTimers.clear();
  procReleaseTimer = undefined;
  procEntries = [];
  procPending = [];
  renderProcFeed();
}

function clearSpellPopups(): void {
  if (spellReleaseTimer) window.clearTimeout(spellReleaseTimer);
  for (const timer of spellPopupTimers.values()) window.clearTimeout(timer);
  spellReleaseTimer = undefined;
  spellPopupTimers.clear();
  spellPopupQueue = [];
  spellPopups = [];
  renderSpellPopups();
}

function logGameEvent(event: GameEvent): void {
  switch (event.type) {
    case 'runStarted':
      logChronicle('info', `Run started${event.ascension > 0 ? ` · A${event.ascension}` : ''}`);
      break;
    case 'nodeEntered':
      if (event.kind !== 'round') logChronicle('shop', `Entered ${event.kind}`);
      break;
    case 'bossIntro':
      logChronicle('bad', `Boss: ${BOSS_BY_ID.get(event.boss)?.name ?? event.boss}`);
      break;
    case 'curseOffered':
      logChronicle('curse', event.starting ? 'Starting curse draft' : 'Curse draft');
      break;
    case 'curseChosen':
      logChronicle('curse', `Curse: ${event.name}${event.stacks > 1 ? ` x${event.stacks}` : ''}`);
      break;
    case 'curseRemoved':
      logChronicle('good', `Curse removed: ${CURSE_BY_ID.get(event.curse)?.name ?? event.curse}`);
      break;
    case 'roundStarted':
      logChronicle('info', `Round ${event.roundNumber} started${event.boss ? ` · ${BOSS_BY_ID.get(event.boss)?.name ?? event.boss}` : ''}`);
      break;
    case 'roundEnded':
      logChronicle(
        event.outcome === 'solved' ? 'good' : 'bad',
        event.outcome === 'solved'
          ? `Solved: ${event.answer.toUpperCase()}`
          : `${event.outcome === 'timeout' ? 'Time out' : 'Died'} — ${event.answer.toUpperCase()}`,
      );
      break;
    case 'guessRejected':
      logChronicle('bad', reasonText(event.reason));
      break;
    case 'guessScored': {
      const correct = event.guess.tiles.filter((tile) => tile === 'correct').length;
      const present = event.guess.tiles.filter((tile) => tile === 'present').length;
      const absent = event.guess.tiles.filter((tile) => tile === 'absent').length;
      const label = event.by === 'friend' ? 'Autoguess' : 'Guess';
      if (event.solved) {
        logChronicle('good', `${label} ${event.word.toUpperCase()} solved it`);
      } else {
        logChronicle('guess', `${label} ${event.word.toUpperCase()} — ${correct}G ${present}Y ${absent}X${event.free ? ' · free' : ''}`);
      }
      break;
    }
    case 'blacklistChanged':
      if (event.added) logChronicle('bad', `Blacklisted ${event.added.toUpperCase()}`);
      else if (event.list.length === 0) logChronicle('good', 'Blacklist cleared');
      break;
    case 'letterPurged':
      logChronicle('curse', `Purged ${event.letter.toUpperCase()}`);
      break;
    case 'damageTaken':
      if (event.dealt > 0) {
        logChronicle('bad', `Took ${event.dealt} damage${event.armorUsed > 0 ? ` · ${event.armorUsed} blocked` : ''} · HP ${event.hp}`);
      } else if (event.incoming > 0) {
        logChronicle('info', `Blocked ${event.incoming} damage`);
      }
      break;
    case 'healed':
      logChronicle('good', `Healed ${event.amount} · HP ${event.hp}`);
      break;
    case 'revived':
      logChronicle('good', `Revived at ${event.hp} HP`);
      break;
    case 'goldChanged':
      if (event.delta !== 0) {
        logChronicle(event.delta > 0 ? 'good' : 'bad', `${event.delta > 0 ? '+' : ''}${event.delta} gold`);
      }
      break;
    case 'itemAcquired':
      logChronicle('item', `Found ${ITEM_BY_ID.get(event.item.id)?.name ?? event.item.id}`);
      break;
    case 'itemProc':
      logChronicle('item', `${ITEM_BY_ID.get(event.item)?.name ?? event.item}: ${event.text}`);
      break;
    case 'spellGained':
      logChronicle('spell', `Gained ${SPELL_BY_ID.get(event.spell.id)?.name ?? event.spell.id}`);
      break;
    case 'spellCast':
      logChronicle('spell', `${event.auto ? 'Autocast' : 'Cast'} ${SPELL_BY_ID.get(event.spell.id)?.name ?? event.spell.id}`);
      break;
    case 'spellRejected':
      logChronicle('bad', event.reason);
      break;
    case 'shopOpened':
      logChronicle('shop', 'Shop opened');
      break;
    case 'shopRerolled':
      logChronicle('shop', 'Shop rerolled');
      break;
    case 'offerBought':
      logChronicle('shop', `Bought ${KIND_LABELS[event.kind]?.toLowerCase() ?? event.kind} for ${event.price}g`);
      break;
    case 'shopRejected':
      logChronicle('bad', event.reason);
      break;
    case 'happeningOffered':
      logChronicle('info', 'Happening');
      break;
    case 'happeningResolved':
      logChronicle(event.success ? 'good' : 'bad', event.text);
      break;
    case 'rewardChosen':
      logChronicle('good', `Reward: ${event.label}`);
      break;
    case 'puzzleSolved':
      logChronicle('good', `Puzzle ${event.index}/${event.total} solved`);
      break;
    case 'gauntletAdvanced':
      logChronicle('good', `Puzzle ${event.index}/${event.total} cleared`);
      break;
    case 'foodEaten':
      logChronicle('food', `Ate ${event.name}`);
      break;
    case 'message':
      logChronicle('info', event.text);
      break;
    case 'runEnded':
      logChronicle(event.result === 'victory' ? 'good' : 'bad', `Run ${event.result}`);
      break;
    default:
      break;
  }
}

function freeSourceLabel(source: Source | undefined): string {
  if (!source) return 'Free guess';
  switch (source.kind) {
    case 'item': {
      const item = host.current?.items.find((entry) => entry.instance === source.instance);
      return item ? ITEM_BY_ID.get(item.id)?.name ?? 'Item' : 'Item';
    }
    case 'spell':
      return SPELL_BY_ID.get(source.spell)?.name ?? 'Spell';
    case 'food':
      return FOOD_BY_ID.get(source.food)?.name ?? 'Food';
    case 'boss':
      return BOSS_BY_ID.get(source.boss)?.name ?? 'Boss';
    case 'happening':
      return HAPPENING_BY_ID.get(source.happening)?.name ?? 'Happening';
    case 'inn':
      return 'Inn';
    default:
      return 'Free guess';
  }
}

function processEvents(events: GameEvent[]): void {
  let playerGuessed = false;
  let playerFreeGuess = false;
  let solvedByPlayer = false;
  let playerDied = false;
  for (const event of events) {
    logGameEvent(event);
    const character = host.current?.character ?? 'runner';
    if (event.type === 'curseOffered' && character === 'runner' && unlockCharacter('pathfinder')) {
      queueCharacterUnlock('pathfinder');
      sfx.play('win');
    }
    if (event.type === 'offerBought') {
      const count = recordPurchase(event.def);
      const unlocked = [
        event.def === 'necronomicon' && count >= 1 ? 'necromancer' : null,
      ].filter((id): id is string => Boolean(id));
      for (const id of unlocked) {
        if (unlockCharacter(id)) {
          queueCharacterUnlock(id);
          sfx.play('win');
        }
      }
    }
    if (event.type === 'foodEaten') {
      const count = recordFood(event.food);
      const unlocked = [
        event.food === 'double-cheeseburger' && count >= 3 ? 'gourmand' : null,
      ].filter((id): id is string => Boolean(id));
      for (const id of unlocked) {
        if (unlockCharacter(id)) {
          queueCharacterUnlock(id);
          sfx.play('win');
        }
      }
    }
    if (event.type === 'letterPurged') {
      const purged = recordPurge();
      if (purged >= 6 && unlockCharacter('purgamist')) {
        queueCharacterUnlock('purgamist');
        sfx.play('win');
      }
    }
    if (event.type === 'runEnded' && event.result === 'victory') {
      const ascension = host.current?.ascension ?? 0;
      const winners = new Set([...readMeta().victoriousCharacters, character]);
      const unlocked = [
        'farmer',
        ...(ascension >= 1 ? ['empty-armor'] : []),
        ...(winners.size >= 2 ? ['werewolf'] : []),
      ];
      for (const id of unlocked) {
        if (unlockCharacter(id)) {
          queueCharacterUnlock(id);
          sfx.play('win');
        }
      }
    }
    if (event.type === 'guessRejected') {
      notify(reasonText(event.reason), 'bad');
      sfx.play('error');
    }
    if (event.type === 'shopRejected') {
      notify(event.reason, 'bad');
      sfx.play('error');
    }
    if (event.type === 'spellRejected') {
      notify(event.reason, 'bad');
      sfx.play('error');
    }
    if (event.type === 'damageMultiplier') {
      logChronicle('bad', `Damage ×${event.multiplier}`);
    }
    if (event.type === 'message') notify(event.text, 'info');
    if (event.type === 'spellCast') showSpellPopup(event.spell.id, Boolean(event.auto));
    if (event.type === 'itemProc') showProc(event.item, event.text);
    if (event.type === 'happeningResolved') {
      notify(event.text, event.success ? 'good' : 'bad');
      const happeningView = host.view();
      trackEventChoice({
        runNumber: readMeta().runs,
        happening: event.happening,
        option: event.option,
        success: event.success,
        level: happeningView?.level ?? 0,
      });
    }
    if (event.type === 'damageTaken') {
      if (event.hp <= 0) playerDied = true;
      if (event.dealt > 0 || event.armorUsed > 0) {
        flashDamage(event.dealt, event.armorUsed, event.incoming);
        sfx.play(event.dealt > 0 ? 'hit' : 'armor');
      } else if (event.incoming > 0) {
        flashDamage(0, 0, event.incoming);
        sfx.play('block');
      }
      if (
        event.incoming > 0
        && !damageTutorialSeen
        && !readMeta().damageTutorialDismissed
      ) {
        damageTutorialSeen = true;
        damageTutorialOpen = true;
      }
    }
    if (event.type === 'guessScored' && event.by === 'player') {
      playerGuessed = true;
      if (event.free) {
        playerFreeGuess = true;
        const view = host.view();
        const shielded = view?.phase.kind === 'round' ? view.phase.board.shielded : false;
        const label = event.unobscured
          ? 'Time Freeze'
          : event.firstPlayerGuess
            ? 'First player guess'
            : event.freeSource
              ? freeSourceLabel(event.freeSource)
              : shielded ? 'Immune to damage' : 'Free guess';
        showFreeGuessPopup(label);
      }
      if (event.solved) solvedByPlayer = true;
    }
    if (event.type === 'healed') sfx.play('coin');
    if (event.type === 'timeExpired') {
      notify("TIME'S UP", 'bad');
      sfx.play('error');
    }
    if (event.type === 'puzzleSolved') {
      notify(`Puzzle ${event.index}/${event.total} solved`, 'good');
      sfx.play('solve');
    }
    if (event.type === 'letterPurged' && setupPurge && (host.view()?.pendingPurge ?? 0) === 0) {
      setupPurge = false;
      countdownUntil = performance.now() + COUNTDOWN_MS;
      heartbeatSecond = -1;
    }
    if (event.type === 'roundStarted') {
      countdownUntil = performance.now() + COUNTDOWN_MS;
      heartbeatSecond = -1;
      orcDeathStartedAt = null;
      if (orcDeathTimer) {
        window.clearTimeout(orcDeathTimer);
        orcDeathTimer = undefined;
      }
      arenaAttack = null;
      if (arenaAttackTimer) {
        window.clearTimeout(arenaAttackTimer);
        arenaAttackTimer = undefined;
      }
      sfx.play('tick');
    }
    if (event.type === 'roundEnded') {
      if (event.outcome === 'solved') {
        if (orcDeathTimer) window.clearTimeout(orcDeathTimer);
        const dropOrc = () => {
          orcDeathTimer = undefined;
          orcDeathStartedAt = performance.now();
          render();
        };
        // The winning blow is the Runner's. Let the swing land before the Orc
        // starts its death frames; otherwise kill it right away.
        if (solvedByPlayer) {
          orcDeathTimer = window.setTimeout(dropOrc, KILL_MS);
        } else {
          dropOrc();
        }
      } else {
        orcDeathStartedAt = null;
      }
    }
    if (event.type === 'rewardChosen' || event.type === 'offerBought') sfx.play('buy');
    if (event.type === 'bossIntro') {
      const bossView = host.view();
      trackBossReached({
        runNumber: readMeta().runs,
        boss: event.boss,
        level: bossView?.level ?? 0,
        character: bossView?.character ?? 'runner',
        ascension: bossView?.ascension ?? 0,
      });
    }
    if (event.type === 'runEnded') {
      if (event.result === 'defeat') {
        playerDied = true;
        playerDeathStartedAt = performance.now();
      } else {
        playerDeathStartedAt = null;
      }
      if (orcDeathTimer) {
        window.clearTimeout(orcDeathTimer);
        orcDeathTimer = undefined;
      }
      const view = host.view();
      const finalState = host.current;
      recordRun({
        result: event.result,
        level: view?.level ?? 1,
        act: view?.act ?? 0,
        ascension: view?.ascension ?? 0,
        character: finalState?.character ?? 'runner',
        curses: finalState?.curses.map((curse) => curse.id) ?? [],
        items: finalState?.items.map((item) => item.id) ?? [],
        equippedItems: finalState?.items
          .filter((item) => item.equipped !== false)
          .map((item) => item.id) ?? [],
        stats: event.stats,
      });
      notify(
        event.result === 'victory' ? 'THE LIST IS YOURS' : 'THE LIST CLOSES',
        event.result === 'victory' ? 'good' : 'bad',
      );
      sfx.play(event.result === 'victory' ? 'win' : 'death');
      const endedBy = event.result === 'victory'
        ? 'cleared'
        : events.some((item) => item.type === 'timeExpired')
          ? 'timeout'
          : 'hp';
      trackRunEnded({
        runNumber: readMeta().runs,
        result: event.result === 'victory' ? 'won' : 'lost',
        endedBy,
        level: view?.level ?? 0,
        durationMs: event.stats.playMs,
        character: finalState?.character ?? 'runner',
        ascension: view?.ascension ?? 0,
      });
    }
  }

  if (!isDamageTooltipOpen()) {
    if (playerDied) {
      triggerArenaAttack('enemy');
    } else if (playerGuessed) {
      triggerArenaAttack(playerFreeGuess || solvedByPlayer ? 'player' : undefined);
    }
  }

  const phoneFriend = events.some(
    (event) => event.type === 'spellCast' && event.spell.id === 'phone-friend',
  );
  const friendWords = phoneFriend
    ? events.flatMap((event) =>
        event.type === 'guessScored' && event.by === 'friend' ? [event.word] : [],
      )
    : [];
  const friendSaid = phoneFriend
    ? events.flatMap((event) => (event.type === 'friendSaid' ? [event.text] : []))
    : [];
  if (friendSaid.length > 0) {
    flashFriendPhrases([], friendSaid[0]);
  } else if (friendWords.length > 0) {
    flashFriendPhrases(friendWords);
  }
}

function dispatchCommand(command: Command): GameEvent[] {
  const events = host.dispatch(command);
  if (events.some((event) => event.type === 'guessScored')) input = '';
  processEvents(events);
  render();
  return events;
}

function startNewRun(preferredCharacter?: string): void {
  characterTip = null;
  characterTipMute = false;
  if (hasSave() && !host.current?.over) {
    const ok = window.confirm('Start a new run? Your active run will be lost.');
    if (!ok) return;
    const view = host.view();
    trackRunAbandoned({
      runNumber: readMeta().runs,
      reason: 'replaced',
      level: view?.level ?? 0,
      character: view?.character ?? selectedCharacter,
      ascension: view?.ascension ?? selectedAscension,
    });
  }
  const seed = `bl-${Date.now().toString(36)}-${Math.floor(Math.random() * 1_000_000).toString(36)}`;
  const unlocked = readMeta().characters;
  const chosen = preferredCharacter ?? selectedCharacter;
  const character = unlocked.includes(chosen) ? chosen : 'runner';
  selectedCharacter = character;
  const events = host.start(seed, selectedAscension, character);
  music.beginRun();
  recordStart();
  trackRunStarted({
    runNumber: readMeta().runs,
    character,
    ascension: selectedAscension,
  });
  screen = 'run';
  input = '';
  notice = null;
  paused = false;
  damageFx = null;
  arenaAttack = null;
  if (arenaAttackTimer) window.clearTimeout(arenaAttackTimer);
  arenaAttackTimer = undefined;
  nextArenaAttacker = 'enemy';
  orcDeathStartedAt = null;
  if (orcDeathTimer) window.clearTimeout(orcDeathTimer);
  orcDeathTimer = undefined;
  playerDeathStartedAt = null;
  phraseRoot.innerHTML = '';
  if (freeGuessTimer) window.clearTimeout(freeGuessTimer);
  freeGuessTimer = undefined;
  freeGuessRoot.innerHTML = '';
  countdownShown = 0;
  countdownRoot.innerHTML = '';
  damageTutorialOpen = false;
  damageTutorialSeen = false;
  damageTutorialMute = false;
  clearProcFeed();
  clearSpellPopups();
  clearChronicle();
  heartbeatSecond = -1;
  processEvents(events);
  setupPurge = (host.view()?.pendingPurge ?? 0) > 0;
  if (setupPurge) {
    countdownUntil = 0;
    heartbeatSecond = -1;
  }
  lastTick = performance.now();
  render();
}

function resumeRun(): void {
  characterTip = null;
  characterTipMute = false;
  host.resume();
  if (!host.hasRun) {
    notify('No active run found.', 'bad');
    render();
    return;
  }
  const resumedView = host.view();
  if (resumedView && readMeta().characters.includes(resumedView.character)) {
    selectedCharacter = resumedView.character;
  }
  if (
    resumedView?.phase.kind === 'curse'
    && resumedView.character === 'runner'
    && unlockCharacter('pathfinder')
  ) {
    queueCharacterUnlock('pathfinder');
    sfx.play('win');
  }
  screen = 'run';
  input = '';
  notice = null;
  paused = false;
  damageFx = null;
  arenaAttack = null;
  if (arenaAttackTimer) window.clearTimeout(arenaAttackTimer);
  arenaAttackTimer = undefined;
  nextArenaAttacker = 'enemy';
  orcDeathStartedAt = null;
  if (orcDeathTimer) window.clearTimeout(orcDeathTimer);
  orcDeathTimer = undefined;
  playerDeathStartedAt = null;
  if (freeGuessTimer) window.clearTimeout(freeGuessTimer);
  freeGuessTimer = undefined;
  freeGuessRoot.innerHTML = '';
  countdownShown = 0;
  countdownRoot.innerHTML = '';
  damageTutorialOpen = false;
  damageTutorialSeen = (host.current?.stats.damageTaken ?? 0) > 0
    || readMeta().damageTutorialDismissed;
  damageTutorialMute = false;
  clearProcFeed();
  clearSpellPopups();
  clearChronicle();
  logChronicle('info', 'Run resumed');
  heartbeatSecond = -1;
  setupPurge = (resumedView?.pendingPurge ?? 0) > 0;
  countdownUntil = 0;
  music.resume();
  lastTick = performance.now();
  trackRunResumed({
    runNumber: readMeta().runs,
    character: resumedView?.character ?? 'runner',
    ascension: resumedView?.ascension ?? 0,
    level: resumedView?.level ?? 0,
  });
  render();
}

function addLetter(letter: string): void {
  if (screen !== 'run' || damageTutorialOpen) return;
  const view = host.view();
  if (!view || view.phase.kind !== 'round' || view.pendingPurge > 0) return;
  if (view.purged.includes(letter.toLowerCase())) return;
  if (input.length >= 5) return;
  input += letter.toLowerCase();
  render();
}

function submitGuess(): void {
  if (damageTutorialOpen) return;
  const view = host.view();
  if (!view || view.phase.kind !== 'round') return;
  if (view.pendingPurge > 0) {
    notify('Choose a letter to purge first.', 'bad');
    render();
    return;
  }
  if (input.length !== 5) {
    notify('Guesses must be five letters.', 'bad');
    render();
    return;
  }
  dispatchCommand({ type: 'guess', word: input });
}

// ── click / keyboard wiring ────────────────────────────────────────────────

/**
 * Latin layouts send the typed character in event.key. Non-Latin layouts and
 * active IMEs often send the local character (or "Process") instead, so fall
 * back to the physical QWERTY position: KeyC -> c. The on-screen keyboard is
 * QWERTY, which makes the fallback easy to follow.
 */
function letterFromKey(event: KeyboardEvent): string | null {
  if (event.key === 'Dead') return null;
  if (/^[a-z]$/i.test(event.key)) return event.key.toLowerCase();
  const physical = /^Key([A-Z])$/.exec(event.code);
  return physical ? physical[1].toLowerCase() : null;
}

function noteKeyboardFallback(event: KeyboardEvent, letter: string | null): void {
  if (!letter || keyboardLayoutNoticeShown) return;
  if (/^[a-z]$/i.test(event.key)) return;
  keyboardLayoutNoticeShown = true;
  notify('Non-English keyboard detected. Using QWERTY key positions.', 'info');
  render();
}

document.addEventListener('pointerdown', () => {
  pointerHeld += 1;
}, true);

function releasePointer(): void {
  if (pointerHeld > 0) pointerHeld -= 1;
  if (pointerHeld === 0 && renderQueued) {
    renderQueued = false;
    // Let the click event for this press run before replacing the DOM.
    window.setTimeout(() => render(), 0);
  }
}
window.addEventListener('pointerup', releasePointer, true);
window.addEventListener('pointercancel', releasePointer, true);
window.addEventListener('blur', () => {
  pointerHeld = 0;
  if (renderQueued) {
    renderQueued = false;
    render();
  }
});

app.addEventListener('click', (event) => {
  sfx.unlock();
  music.unlock();
  const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-action]');
  if (!target) return;
  event.preventDefault();
  const action = target.dataset.action;
  switch (action) {
    case 'pause':
      paused = true;
      lastTick = performance.now();
      music.pause();
      render();
      break;
    case 'resume':
      resumeRun();
      break;
    case 'unpause':
      paused = false;
      lastTick = performance.now();
      music.resume();
      render();
      break;
    case 'sound':
      soundMuted = sfx.toggle();
      render();
      break;
    case 'music-next':
      music.unlock();
      music.cycleTrack();
      render();
      break;
    case 'music-mute':
      music.unlock();
      music.toggleMute();
      render();
      break;
    case 'new-run':
      startNewRun(target.dataset.character);
      break;
    case 'ascension':
      selectedAscension = Math.max(0, Math.min(ASCENSION_MAX, Number(target.dataset.level) || 0));
      render();
      break;
    case 'character': {
      const id = target.dataset.id ?? '';
      if (readMeta().characters.includes(id)) {
        selectedCharacter = id;
        const tipId = id === 'pathfinder' || id === 'purgamist' ? id : null;
        characterTip = tipId && !readMeta().dismissedCharacterTips.includes(tipId) ? tipId : null;
        characterTipMute = false;
      }
      render();
      break;
    }
    case 'toggle-character-tip-mute':
      characterTipMute = !characterTipMute;
      render();
      break;
    case 'dismiss-character-tip':
      if (characterTip && characterTipMute) dismissCharacterTip(characterTip);
      characterTip = null;
      characterTipMute = false;
      render();
      break;
    case 'dismiss-unlock':
      nextCharacterUnlock();
      render();
      break;
    case 'toggle-damage-tutorial-mute':
      damageTutorialMute = !damageTutorialMute;
      render();
      break;
    case 'dismiss-damage-tutorial':
      if (damageTutorialMute) dismissDamageTutorial();
      damageTutorialOpen = false;
      damageTutorialMute = false;
      render();
      break;
    case 'help':
      screen = 'help';
      lastTick = performance.now();
      render();
      break;
    case 'stats':
      screen = 'stats';
      lastTick = performance.now();
      render();
      break;
    case 'back':
      characterTip = null;
      characterTipMute = false;
      screen = host.hasRun ? 'run' : 'title';
      paused = false;
      lastTick = performance.now();
      render();
      break;
    case 'title':
      characterTip = null;
      characterTipMute = false;
      screen = 'title';
      lastTick = performance.now();
      render();
      break;
    case 'abandon': {
      if (!window.confirm('Abandon this run? The save will be wiped.')) return;
      const view = host.view();
      trackRunAbandoned({
        runNumber: readMeta().runs,
        reason: 'abandon',
        level: view?.level ?? 0,
        character: view?.character ?? 'runner',
        ascension: view?.ascension ?? 0,
      });
      host.discard();
      characterTip = null;
      characterTipMute = false;
      screen = 'title';
      input = '';
      damageFx = null;
      if (damageTimer) window.clearTimeout(damageTimer);
      damageTimer = undefined;
      render();
      break;
    }
    case 'continue':
      dispatchCommand({ type: 'continue' });
      break;
    case 'key':
      addLetter(target.dataset.letter ?? '');
      break;
    case 'del':
      input = input.slice(0, -1);
      render();
      break;
    case 'submit':
      submitGuess();
      break;
    case 'cast':
      dispatchCommand({ type: 'castSpell', instance: target.dataset.id ?? '' });
      break;
    case 'use':
      dispatchCommand({ type: 'useItem', instance: target.dataset.id ?? '' });
      break;
    case 'buy':
      dispatchCommand({ type: 'buy', offerId: target.dataset.id ?? '' });
      break;
    case 'reroll':
      dispatchCommand({ type: 'reroll' });
      break;
    case 'sell':
      dispatchCommand({ type: 'sell', instance: target.dataset.id ?? '' });
      break;
    case 'equip':
      dispatchCommand({ type: 'equipItem', instance: target.dataset.id ?? '' });
      break;
    case 'unequip':
      dispatchCommand({ type: 'unequipItem', instance: target.dataset.id ?? '' });
      break;
    case 'choose':
      dispatchCommand({ type: 'choose', optionId: target.dataset.id ?? '' });
      break;
    case 'curse':
      dispatchCommand({ type: 'chooseCurse', curseId: target.dataset.id ?? '' });
      break;
    case 'remove-curse':
      dispatchCommand({ type: 'removeCurse', curseId: target.dataset.id ?? '' });
      break;
    case 'reward':
      dispatchCommand({ type: 'chooseReward', optionId: target.dataset.id ?? '' });
      break;
    case 'purge':
      dispatchCommand({ type: 'purgeLetter', letter: target.dataset.letter ?? '' });
      break;
    default:
      break;
  }
});

// Drag a piece of gear between the slot sockets and the bag in a shop.
app.addEventListener('dragstart', (event) => {
  const chip = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-item]');
  if (!chip) return;
  event.dataTransfer?.setData('text/plain', chip.dataset.item ?? '');
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  chip.classList.add('dragging');
});

app.addEventListener('dragend', (event) => {
  (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-item]')?.classList.remove('dragging');
});

app.addEventListener('dragover', (event) => {
  if ((event.target as HTMLElement | null)?.closest('[data-drop]')) {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  }
});

app.addEventListener('drop', (event) => {
  const zone = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-drop]');
  if (!zone) return;
  event.preventDefault();
  const instance = event.dataTransfer?.getData('text/plain');
  if (!instance) return;
  if (zone.dataset.drop === 'slot') {
    dispatchCommand({ type: 'equipItem', instance });
  } else {
    dispatchCommand({ type: 'unequipItem', instance });
  }
});

window.addEventListener('keydown', (event) => {
  sfx.unlock();
  music.unlock();
  if (screen !== 'run') return;
  const altGraph = (event.getModifierState?.('AltGraph') ?? false)
    || (event.ctrlKey && event.altKey);
  if (!altGraph && (event.metaKey || event.ctrlKey || event.altKey)) return;
  const view = host.view();
  if (!view) return;
  const letter = letterFromKey(event);

  if (
    event.key === 'Escape'
    || event.code === 'Escape'
    || event.key === ' '
    || event.code === 'Space'
  ) {
    if (view.phase.kind !== 'over') {
      event.preventDefault();
      paused = !paused;
      lastTick = performance.now();
      if (paused) music.pause();
      else music.resume();
      render();
    }
    return;
  }

  if (paused) return;

  noteKeyboardFallback(event, letter);

  if (view.pendingPurge > 0) {
    if (letter) {
      event.preventDefault();
      dispatchCommand({ type: 'purgeLetter', letter });
    }
    return;
  }

  const enter = event.key === 'Enter'
    || event.code === 'Enter'
    || event.code === 'NumpadEnter';
  if (enter && view.phase.kind === 'summary' && view.phase.outcome !== 'died') {
    event.preventDefault();
    dispatchCommand({ type: 'continue' });
    return;
  }

  if (view.phase.kind !== 'round') return;
  if (letter) {
    event.preventDefault();
    addLetter(letter);
  } else if (event.key === 'Backspace' || event.code === 'Backspace') {
    event.preventDefault();
    input = input.slice(0, -1);
    render();
  } else if (
    event.key === 'Enter'
    || event.code === 'Enter'
    || event.code === 'NumpadEnter'
  ) {
    event.preventDefault();
    submitGuess();
  }
});

window.setInterval(() => {
  const now = performance.now();
  const dt = now - lastTick;
  lastTick = now;
  if (screen !== 'run' || document.hidden || paused || damageTutorialOpen) return;
  const view = host.view();
  if (!view || view.phase.kind !== 'round') {
    heartbeatSecond = -1;
    renderCountdown(0, 0);
    return;
  }
  // The clock does not start until the countdown ends.
  if (now < countdownUntil) {
    renderCountdown(view.level, Math.max(1, Math.ceil((countdownUntil - now) / 800)));
    return;
  }
  renderCountdown(0, 0);
  if (view.pendingPurge > 0) return;
  const events = host.dispatch({ type: 'tick', dtMs: dt });
  if (events.length > 0) processEvents(events);

  const current = host.view();
  if (current && current.phase.kind === 'round') {
    const remaining = current.phase.board.remainingMs;
    if (remaining !== null && remaining > 0 && remaining <= 10_000) {
      const second = Math.ceil(remaining / 1_000);
      if (second !== heartbeatSecond) {
        heartbeatSecond = second;
        sfx.play('tick');
      }
    } else {
      heartbeatSecond = -1;
    }
  }
  render();
}, 1_000);

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    music.pause();
    if (screen === 'run' && host.view()?.phase.kind !== 'over') {
      paused = true;
      lastTick = performance.now();
      render();
    }
  } else if (!paused) {
    music.resume();
  }
});

// ── rendering ──────────────────────────────────────────────────────────────

function render(): void {
  // A full re-render replaces every button node. Doing that between a pointer
  // press and release swallows the click, so hold renders until the press ends.
  if (pointerHeld > 0) {
    renderQueued = true;
    return;
  }
  const view = host.view();
  if (screen === 'run' && !view) screen = 'title';

  const bossMusic = screen === 'run' && Boolean(
    view
    && (
      view.phase.kind === 'bossIntro'
      || ((view.phase.kind === 'round' || view.phase.kind === 'summary') && view.phase.boss)
      || (view.phase.kind === 'reward' && view.phase.boss)
    ),
  );
  music.setBoss(bossMusic);
  if (screen === 'run' && view) music.setLevel(view.level);

  if (screen === 'title') {
    app!.innerHTML = renderTitle();
  } else if (screen === 'help') {
    app!.innerHTML = renderHelp();
  } else if (screen === 'stats') {
    app!.innerHTML = renderStats();
  } else {
    app!.innerHTML = renderRun(view as RunView);
  }
  app!.insertAdjacentHTML('beforeend', noticeHtml());
  if (characterUnlock) app!.insertAdjacentHTML('beforeend', renderCharacterUnlock());

  const damageId = damageFx?.id ?? 0;
  const overRun = screen === 'run' && view?.phase.kind === 'over';
  if (screen !== 'run' || overRun) {
    if (fxRoot.innerHTML) fxRoot.innerHTML = '';
    damageRendered = 0;
  } else if (damageId !== damageRendered) {
    damageRendered = damageId;
    fxRoot.innerHTML = damageOverlayHtml();
  }

  renderImmunity(screen === 'run' ? view : null);
  renderOpeningShield(screen === 'run' ? view : null);
  const countdownActive = screen === 'run'
    && Boolean(view)
    && view!.phase.kind === 'round'
    && !paused
    && performance.now() < countdownUntil;
  renderCountdown(
    countdownActive ? view!.level : 0,
    countdownActive ? Math.max(1, Math.ceil((countdownUntil - performance.now()) / 800)) : 0,
  );
}

function renderImmunity(view: RunView | null): void {
  const left = view && view.phase.kind === 'round'
    ? view.phase.board.guessImmuneMsLeft
    : 0;
  if (left <= 0) {
    if (immunityActive) {
      immunityRoot.innerHTML = '';
      immunityActive = false;
    }
    return;
  }
  if (!immunityActive) {
    immunityRoot.innerHTML = `
    <div class="immunity-banner" role="status" aria-live="polite">
      <span class="immunity-shield" aria-hidden="true">🛡</span>
      <span class="immunity-word">Immunity!</span>
      <span class="immunity-shield" aria-hidden="true">🛡</span>
      <span class="immunity-timer" aria-hidden="true"><i></i></span>
    </div>`;
    immunityActive = true;
  }
  const bar = immunityRoot.querySelector<HTMLElement>('.immunity-timer i');
  if (!bar) return;
  const ratio = Math.max(0, Math.min(1, left / 4_000));
  bar.style.width = `${(ratio * 100).toFixed(1)}%`;
  bar.style.opacity = `${(0.35 + ratio * 0.65).toFixed(2)}`;
}

function renderOpeningShield(view: RunView | null): void {
  if (!view || view.phase.kind !== 'round') {
    if (openingActive) {
      openingRoot.innerHTML = '';
      openingActive = false;
      openingTotalMs = 0;
    }
    return;
  }
  const left = view.phase.board.shieldMsLeft;
  if (left <= 0) {
    if (openingActive) {
      openingRoot.innerHTML = '';
      openingActive = false;
      openingTotalMs = 0;
    }
    return;
  }

  const headStart = view.items.some((item) => item.id === 'head-start' && item.equipped);
  const total = headStart ? 7_000 : Math.max(1_000, left);
  const label = headStart ? 'Head Start!' : 'Opening Shield!';

  if (!openingActive || total !== openingTotalMs) {
    openingRoot.innerHTML = `
    <div class="immunity-banner opening-banner" role="status" aria-live="polite">
      <span class="immunity-shield" aria-hidden="true">⚡</span>
      <span class="immunity-word">${label}</span>
      <span class="opening-seconds" aria-hidden="true">${Math.ceil(left / 1_000)}s</span>
      <span class="immunity-timer" aria-hidden="true"><i></i></span>
    </div>`;
    openingActive = true;
    openingTotalMs = total;
  }

  const ratio = Math.max(0, Math.min(1, left / openingTotalMs));
  const bar = openingRoot.querySelector<HTMLElement>('.opening-banner .immunity-timer i');
  if (bar) {
    bar.style.width = `${(ratio * 100).toFixed(1)}%`;
    bar.style.opacity = `${(0.35 + ratio * 0.65).toFixed(2)}`;
  }
  const seconds = openingRoot.querySelector<HTMLElement>('.opening-seconds');
  if (seconds) seconds.textContent = `${Math.ceil(left / 1_000)}s`;
}

function noticeHtml(): string {
  if (!notice) return '';
  return `<div class="toast ${notice.kind}">${escapeHtml(notice.text)}</div>`;
}

function renderCharacterUnlock(): string {
  if (!characterUnlock) return '';
  const def = CHARACTER_BY_ID.get(characterUnlock);
  if (!def) {
    nextCharacterUnlock();
    return '';
  }
  const items = def.items.map((id) => ITEM_BY_ID.get(id)?.name ?? id);
  const curses = def.curses.map((id) => CURSE_BY_ID.get(id)?.name ?? id);
  const kit = [
    ...items,
    ...curses.map((name) => `${name} curse`),
  ].join(', ');
  return `
  <div class="unlock-overlay" role="dialog" aria-modal="true" aria-labelledby="unlock-title">
    <div class="unlock-card">
      <p class="kicker">CHARACTER UNLOCKED</p>
      <i class="character-portrait unlock-portrait ${characterPortraitClass(def.id)}" aria-hidden="true" style="${characterPortraitStyle(def.id)}"></i>
      <h2 id="unlock-title">${escapeHtml(def.name)}</h2>
      <p class="unlock-tagline">${escapeHtml(def.tagline)}</p>
      <p class="unlock-desc">${escapeHtml(def.description)}</p>
      <div class="unlock-stats">
        <span><b>${def.maxHp}</b> HP</span>
        <span><b>${def.armor}</b> ARMOR</span>
      </div>
      <p class="unlock-kit">${escapeHtml(kit || 'No starting gear')}</p>
      <button class="btn primary big" data-action="dismiss-unlock">ADD TO ROSTER</button>
    </div>
  </div>`;
}

// ── keyword tooltips ───────────────────────────────────────────────────────

let tipEl: HTMLDivElement | null = null;
let tipTarget: HTMLElement | null = null;
let damageTipOpen = false;

const DAMAGE_TIP_SELECTOR = '.guess-damage, .board-divider';

/** True while the incoming-damage or multiplier tooltip is on screen. */
function isDamageTooltipOpen(): boolean {
  return damageTipOpen;
}

/** Clear competing damage feedback without re-rendering the page. */
function clearDamageFeedback(): void {
  if (damageTimer) {
    window.clearTimeout(damageTimer);
    damageTimer = undefined;
  }
  if (shakeTimer) {
    window.clearTimeout(shakeTimer);
    shakeTimer = undefined;
  }
  damageFx = null;
  damageRendered = 0;
  fxRoot.innerHTML = '';
  shake = false;
  app?.querySelector('.shell')?.classList.remove('shake');
}

function ensureTip(): HTMLDivElement {
  if (!tipEl) {
    tipEl = document.createElement('div');
    tipEl.className = 'kw-tooltip';
    tipEl.setAttribute('role', 'tooltip');
    document.body.appendChild(tipEl);
  }
  return tipEl;
}

function showTip(target: HTMLElement): void {
  const text = target.dataset.tip;
  if (!text) return;
  const el = ensureTip();
  tipTarget = target;
  el.textContent = text;
  el.classList.add('visible');
  damageTipOpen = Boolean(target.closest(DAMAGE_TIP_SELECTOR));
  if (damageTipOpen) clearDamageFeedback();

  const rect = target.getBoundingClientRect();
  const size = el.getBoundingClientRect();
  const gap = 10;
  let left = rect.left + rect.width / 2 - size.width / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - size.width - 8));
  let top = rect.top - size.height - gap;
  if (top < 8) top = rect.bottom + gap;
  el.style.left = `${Math.round(left)}px`;
  el.style.top = `${Math.round(top)}px`;
}

function hideTip(): void {
  tipEl?.classList.remove('visible');
  tipTarget = null;
  damageTipOpen = false;
}

document.addEventListener('pointermove', (event) => {
  const target = (event.target as Element | null)?.closest<HTMLElement>('[data-tip]');
  if (!target) {
    if (tipTarget) hideTip();
    return;
  }
  if (target !== tipTarget) showTip(target);
});

window.addEventListener('scroll', hideTip, true);
window.addEventListener('resize', hideTip);

document.addEventListener('focusin', (event) => {
  const target = (event.target as Element | null)?.closest<HTMLElement>('[data-tip]');
  if (target) showTip(target);
});
document.addEventListener('focusout', hideTip);

function characterPortraitStyle(characterId: string): string {
  const sprite = characterSprite(characterId);
  return `--portrait:url('${sprite.portrait}')`;
}

function characterPortraitClass(characterId: string): string {
  return CHARACTER_BY_ID.get(characterId)?.sprite ?? 'runner';
}

function renderCharacterPicker(meta: ReturnType<typeof readMeta>): string {
  if (meta.characters.length <= 1) return '';
  if (!meta.characters.includes(selectedCharacter)) selectedCharacter = 'runner';
  return `
  <div class="character-picker">
    <div class="character-head">
      <span class="panel-kicker">CHARACTER</span>
      <span class="character-current">${escapeHtml(CHARACTER_BY_ID.get(selectedCharacter)?.name ?? 'The Soldier')}</span>
    </div>
    <div class="character-grid">
      ${CHARACTERS.map((character) => {
        const locked = !meta.characters.includes(character.id);
        const items = character.items
          .map((id) => ITEM_BY_ID.get(id)?.name ?? id);
        const curses = character.curses
          .map((id) => CURSE_BY_ID.get(id)?.name ?? id);
        const foods = (character.startingFoods ?? [])
          .map((id) => `${FOOD_BY_ID.get(id)?.name ?? id} food`);
        const kit = [...items, ...curses.map((name) => `${name} curse`), ...foods].join(', ');
        return `<button class="character-card ${character.id === selectedCharacter ? 'active' : ''} ${locked ? 'locked' : ''}" data-action="character" data-id="${escapeHtml(character.id)}" ${locked ? 'disabled' : ''}>
          <i class="character-portrait ${characterPortraitClass(character.id)}" aria-hidden="true" style="${characterPortraitStyle(character.id)}"></i>
          <span class="character-name">${escapeHtml(character.name)}</span>
          <span class="character-tagline">${escapeHtml(character.tagline)}</span>
          <span class="character-stats">${character.maxHp} HP · ${character.armor} ARMOR</span>
          ${locked
            ? `<span class="character-lock">${escapeHtml(character.unlockHint ?? 'Locked')}</span>`
            : `<span class="character-kit">${escapeHtml(kit || 'No starting gear')}</span>`}
        </button>`;
      }).join('')}
    </div>
  </div>`;
}

const CHARACTER_TIPS: Record<string, { kicker: string; title: string; lines: string[] }> = {
  pathfinder: {
    kicker: 'PATHFINDER TIP',
    title: 'Spam first, solve later.',
    lines: [
      'For players who like to open with four covering words, then solve from what is left.',
      'Spam four words that cover 20 letters. The blacklist blocks repeats, so vary your spam words.',
      'Try TUBES-WINDY-CHAMP-BLING or GATED-FORKS-IMPLY-BUNCH.',
    ],
  },
  purgamist: {
    kicker: 'PURGAMIST TIP',
    title: 'Pick your favorite vowel.',
    lines: [
      'Purge A, E, I, O and U: only 14 dictionary words remain, all with Y as the vowel.',
    ],
  },
};

function renderCharacterTip(): string {
  const tip = characterTip ? CHARACTER_TIPS[characterTip] : undefined;
  if (!tip) return '';
  return `
  <div class="modal character-tip-modal">
    <div class="modal-card">
      <p class="panel-kicker">${escapeHtml(tip.kicker)}</p>
      <h2>${escapeHtml(tip.title)}</h2>
      ${tip.lines.map((line) => `<p class="muted">${escapeHtml(line)}</p>`).join('')}
      <button class="tutorial-check ${characterTipMute ? 'checked' : ''}" data-action="toggle-character-tip-mute" role="checkbox" aria-checked="${characterTipMute}">
        <span class="tutorial-box" aria-hidden="true">${characterTipMute ? '✓' : ''}</span>
        Don't remind me
      </button>
      <button class="btn primary big" data-action="dismiss-character-tip">GOT IT</button>
    </div>
  </div>`;
}

function renderTitle(): string {
  const meta = readMeta();
  const saved = hasSave();
  const unlocked = Math.max(0, Math.min(ASCENSION_MAX, meta.ascension));
  if (selectedAscension > unlocked) selectedAscension = unlocked;
  const metaLine = meta.runs > 0
    ? `<p class="meta-line">${meta.wins} win${meta.wins === 1 ? '' : 's'} · ${meta.runs} run${meta.runs === 1 ? '' : 's'} · best level ${meta.bestLevel || '—'}${unlocked > 0 ? ` · Ascension ${unlocked} unlocked` : ''}</p>`
    : `<p class="meta-line">A fresh list. Nothing written yet.</p>`;
  const ascensionPicker = unlocked > 0
    ? `<div class="ascension-picker">
        <div class="ascension-head">
          <span class="panel-kicker">ASCENSION</span>
          <span class="ascension-current">${selectedAscension === 0 ? 'OFF' : `LEVEL ${selectedAscension}`}</span>
        </div>
        <div class="ascension-levels">
          ${Array.from({ length: Math.min(ASCENSION_MAX, unlocked) + 1 }, (_, level) => `
            <button class="ascension-btn ${level === selectedAscension ? 'active' : ''}" data-action="ascension" data-level="${level}">${level === 0 ? 'OFF' : level}</button>
          `).join('')}
        </div>
        <p class="ascension-note">${escapeHtml(ascensionSummary(selectedAscension))}</p>
      </div>`
    : '';
  const characterPicker = renderCharacterPicker(meta);

  return `
  <div class="title-screen">
    <div class="title-music">${renderMusicControls()}</div>
    <div class="title-mark" aria-hidden="true">
      <span class="ring r1"></span>
      <span class="ring r2"></span>
      <span class="ring r3"></span>
      <span class="mark-letter">B</span>
    </div>
    <p class="kicker">A WORD ROGUELIKE</p>
    <h1 class="logo">BLACK<span>LIST</span></h1>
    <p class="tagline">Every curse is a choice. Every word is a way through.</p>
    <div class="title-actions">
      <button class="btn primary big" data-action="new-run">NEW RUN</button>
      ${saved ? `<button class="btn big" data-action="resume">CONTINUE</button>` : ''}
      <button class="btn ghost big" data-action="help">HOW TO PLAY</button>
      ${meta.runs > 0 ? `<button class="btn ghost big" data-action="stats">STATS</button>` : ''}
    </div>
    ${characterPicker}
    ${ascensionPicker}
    <div class="title-facts">
      <div><b>50</b><span>levels</span></div>
      <div><b>2</b><span>curse choices</span></div>
      <div><b>3</b><span>base damage</span></div>
      <div><b>1</b><span>free guess</span></div>
    </div>
    ${metaLine}
    <p class="title-foot">BLACKLIST · v0.1 · a pure-core word roguelike</p>
  </div>
  ${renderCharacterTip()}`;
}

function renderHelp(): string {
  return `
  <div class="help-screen">
    <div class="help-head">
      <button class="btn tiny ghost" data-action="back">← BACK</button>
      <p class="kicker">FIELD MANUAL</p>
      <h1>How to play</h1>
      <p class="tagline">Solve the word. Pay for every guess past the first. Do not run out of time or health.</p>
    </div>
    <div class="rules-grid">
      <article class="rule-card">
        <h3>The run</h3>
        <p>Fifty floors. The loop cycles <b>fight → shop → fight → curse</b>; fights, shops and curses each count as a floor, while events happen between floors and do not. Floor 27 is the <b>Miniboss</b>: draft <b>1 curse</b>, then beat two words for a slot, a full heal, and a rare choice. Floor 51 is the <b>Floor Boss</b>: draft <b>3 curses</b>, then beat three words.</p>
      </article>
      <article class="rule-card">
        <h3>Damage</h3>
        <p>Your first guess each round is free. Every wrong guess after that is a <b>Hit (HP damage)</b>. Damage starts at <b>3</b>, plus bonuses from curses, bosses and items. The first five guesses use a ×1 multiplier; from the <b>6th guess</b> on, damage is multiplied by the guess number minus 4. Armor soaks it first. A correct guess never hurts you, and autoguesses are always free.</p>
      </article>
      <article class="rule-card">
        <h3>Armor</h3>
        <p>Armor is a pool of damage reduction. Each point soaks one point of an incoming hit before HP is touched. The pool refills at the start of every round.</p>
      </article>
      <article class="rule-card">
        <h3>The clock</h3>
        <p>There is no clock until you take <b>The Clock</b> curse. The first stack gives 5:00; each later stack cuts 40%. Reveal-time items show a count-up timer, while clock rounds show a count-down. If the clock reaches zero, the run ends immediately, even if armor remains.</p>
      </article>
      <article class="rule-card">
        <h3>Curses</h3>
        <p>Curses are permanent rules. Vision curses hide tiles or letters; others change damage, shops, healing, slots, HP, gold or the clock. Some stack; boolean vision curses are one copy each. <b>Counter-Intelligence</b> shows correct/misplaced counts after the first vision curse.</p>
      </article>
      <article class="rule-card">
        <h3>Words you will see</h3>
        <p><b>Autocast</b>: the item casts a spell immediately and for free. It never enters your spell list, but it still counts as a spell cast. <b>Autoguess</b>: a free guess from an item or Phone a Friend. It never deals damage and does not spend a free guess, but it does add to the round's guess count. <b>Player guess</b>: manual guess only. <b>Reveal</b>: a guaranteed yellow letter. <b>Learn</b>: a letter that may be present or absent. <b>Rule Out</b>: a letter guaranteed not to be in the word.</p>
      </article>
      <article class="rule-card">
        <h3>Items & spells</h3>
        <p>Items work only while equipped. Spells stack. <b>Time Warp is gone</b>; Time Freeze stops the clock, or makes the next guess free when there is no clock. Time-based foods and remaining-time items are gated until The Clock is taken.</p>
      </article>
      <article class="rule-card">
        <h3>Ascension</h3>
        <p>Ascension only adds starting curses. Each level drafts one more curse before level 1, up to A10.</p>
      </article>
      <article class="rule-card">
        <h3>Controls</h3>
        <p>Type letters, <b>Backspace</b> to delete, <b>Enter</b> to submit. <b>Space</b> or <b>Esc</b> pauses. Click the <b>MUSIC</b> name to cycle tracks; the mute button is separate. More Power only plays for bosses. Non-English keyboard layouts use the physical QWERTY key positions.</p>
      </article>
    </div>
    <div class="help-actions">
      <button class="btn primary" data-action="back">GOT IT</button>
    </div>
  </div>`;
}

function renderMusicControls(): string {
  return `
  <div class="music-controls ${music.bossActive ? 'boss' : ''}" title="Music: ${escapeHtml(music.currentName)}">
    <span class="music-kicker">MUSIC</span>
    <button class="music-now" data-action="music-next" title="Click to change track">${escapeHtml(music.currentName)}</button>
    ${music.bossActive ? '<span class="music-boss">BOSS</span>' : ''}
    <button class="btn tiny ghost music-mute" data-action="music-mute" title="${music.mutedState ? 'Unmute music' : 'Mute music'}" aria-label="${music.mutedState ? 'Unmute music' : 'Mute music'}">${music.mutedState ? '🔇' : '🎵'}</button>
  </div>`;
}

function topEntries(counts: Record<string, number>, limit = 5): Array<[string, number]> {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit);
}

function renderStats(): string {
  const meta = readMeta();
  const winRate = meta.runs > 0 ? Math.round((meta.wins / meta.runs) * 100) : 0;
  const avgSolve = meta.totalSolves > 0 ? meta.totalSolveMs / meta.totalSolves : 0;
  const gearCounts = Object.fromEntries(
    Object.entries(meta.purchases)
      .filter(([id]) => ITEM_BY_ID.get(id)?.kind === 'gear'),
  );
  const favorites = topEntries(gearCounts);
  const curses = topEntries(meta.curseCounts);
  const history = meta.history.slice(0, 20);

  return `
  <div class="stats-screen">
    <div class="help-head">
      <button class="btn tiny ghost" data-action="back">← BACK</button>
      <p class="kicker">FIELD RECORDS</p>
      <h1>Run history</h1>
      <p class="tagline">Every curse, every word, every mistake.</p>
    </div>

    <div class="stats-hero">
      <div><b>${meta.runs}</b><span>runs</span></div>
      <div><b>${meta.wins}</b><span>wins</span></div>
      <div><b>${winRate}%</b><span>win rate</span></div>
      <div><b>${meta.bestLevel || '—'}</b><span>best level</span></div>
      <div><b>${formatTime(avgSolve)}</b><span>avg solve</span></div>
      <div><b>${meta.ascension ? `A${meta.ascension}` : 'OFF'}</b><span>ascension</span></div>
    </div>

    <div class="stats-panels">
      <section class="stats-panel">
        <p class="panel-kicker">TOTALS</p>
        <dl class="stat-list">
          <div><dt>Time played</dt><dd>${formatTime(meta.totalPlayMs)}</dd></div>
          <div><dt>Rounds cleared</dt><dd>${meta.totalRounds}</dd></div>
          <div><dt>Solved</dt><dd>${meta.totalSolves}</dd></div>
          <div><dt>Guesses</dt><dd>${meta.totalGuesses}</dd></div>
          <div><dt>Gold earned</dt><dd>${meta.totalGold}</dd></div>
          <div><dt>Damage taken</dt><dd>${meta.totalDamage}</dd></div>
        </dl>
      </section>

      <section class="stats-panel">
        <p class="panel-kicker">MOST BOUGHT GEAR</p>
        ${favorites.length
          ? `<ol class="favorite-list">${favorites.map(([id, count]) => `<li><span>${escapeHtml(ITEM_BY_ID.get(id)?.name ?? id)}</span><b>${count}</b></li>`).join('')}</ol>`
          : `<p class="empty-note">No gear bought yet.</p>`}
      </section>

      <section class="stats-panel">
        <p class="panel-kicker">FAVORITE CURSES</p>
        ${curses.length
          ? `<ol class="favorite-list">${curses.map(([id, count]) => `<li><span>${escapeHtml(CURSE_BY_ID.get(id)?.name ?? id)}</span><b>${count}</b></li>`).join('')}</ol>`
          : `<p class="empty-note">No curses survived a run yet.</p>`}
      </section>
    </div>

    <section class="history-panel">
      <div class="panel-head"><span class="panel-kicker">RECENT RUNS</span><span class="count">${history.length}</span></div>
      ${history.length
        ? `<div class="history-list">${history.map((run) => {
          const result = run.result === 'victory' ? 'WIN' : 'LOSS';
          const solve = run.solves > 0 ? formatTime(run.solveMs / run.solves) : '—';
          const equipped = (run.equippedItems ?? run.items)
            .map((id) => ITEM_BY_ID.get(id)?.name ?? id);
          const equippedLabel = equipped.length > 0
            ? equipped.join(', ')
            : 'nothing equipped';
          return `<article class="history-row ${run.result}">
            <span class="history-result">${result}</span>
            <b>Level ${run.level}</b>
            <span>${run.curses.length} curse${run.curses.length === 1 ? '' : 's'} · ${run.items.length} item${run.items.length === 1 ? '' : 's'}</span>
            <span class="history-equipment" title="${escapeHtml(equippedLabel)}">Equipped: ${escapeHtml(equippedLabel)}</span>
            <span>${run.rounds} rounds · ${solve} avg solve</span>
            <span>+${run.goldEarned} gold · ${run.damageTaken} damage</span>
            <time>${new Date(run.at).toLocaleDateString()}</time>
          </article>`;
        }).join('')}</div>`
        : `<p class="empty-note">Play a run and its history will appear here.</p>`}
    </section>
  </div>`;
}

function renderTopbar(view: RunView): string {
  return `
  <header class="topbar">
    <div class="brand">BLACKLIST</div>
    <div class="top-stats">
      <div class="chip-stat gold" title="Gold">🪙 <b>${view.gold}</b></div>
      ${view.ascension > 0 ? `<div class="chip-stat ascension" title="Ascension modifiers are active">A${view.ascension}</div>` : ''}
      <div class="chip-stat" title="Area">AREA ${roman(view.act + 1)}</div>
    </div>
    <div class="top-actions">
      ${renderMusicControls()}
      <button class="btn tiny ghost sound-btn" data-action="sound" title="${soundMuted ? 'Unmute game sounds' : 'Mute game sounds'}" aria-label="${soundMuted ? 'Unmute game sounds' : 'Mute game sounds'}">${soundMuted ? '🔇' : '🔊'}</button>
      <button class="btn tiny" data-action="pause" ${paused ? 'disabled' : ''}>⏸ PAUSE</button>
      <button class="btn tiny ghost" data-action="help">RULES</button>
      <button class="btn tiny danger" data-action="abandon">ABANDON</button>
    </div>
  </header>`;
}

const ACT_ENEMIES = [
  { name: 'The Orc', line: 'It keeps the names that got this far.' },
  { name: 'The Hollow Choir', line: 'Every voice wants a different word.' },
  { name: 'The Ash Revenant', line: 'It remembers everything you already tried.' },
  { name: 'The Pale Auditor', line: 'It is counting what you have left.' },
  { name: 'The Last Word', line: 'It has been waiting at the end of the list.' },
];

const ACT_COLORS = ['#e7b85a', '#8b6bd9', '#df615a', '#58b4c6', '#4fbf87'];

function arenaEnemy(view: RunView, bossId?: string) {
  const boss = bossId ? BOSS_BY_ID.get(bossId) : undefined;
  if (boss) {
    return { boss, name: boss.name, line: boss.description, color: bossColor(boss.id) };
  }
  const index = Math.max(0, Math.min(ACT_ENEMIES.length - 1, view.act));
  return { boss: undefined, ...ACT_ENEMIES[index], color: ACT_COLORS[index] };
}

function phaseLabel(view: RunView): string {
  const phase = view.phase;
  return phase.kind === 'round'
    ? `LEVEL ${view.level}`
    : phase.kind === 'summary'
      ? 'ROUND OVER'
      : phase.kind === 'reward'
        ? 'REWARD'
        : phase.kind === 'bossIntro'
          ? 'BOSS'
          : phase.kind === 'curse'
            ? 'CURSE'
            : phase.kind === 'shopChoice'
              ? 'SHOP OR INN'
              : phase.kind === 'shop'
                ? 'SHOP'
                : phase.kind === 'happening'
                  ? 'INTERRUPTION'
                  : phase.kind === 'purge'
                    ? 'SETUP'
                    : 'THE LIST';
}

function damageOverlayHtml(): string {
  if (!damageFx || !damageFx.showOverlay) return '';
  if (damageFx.hpLost > 0) {
    const absorbed = damageFx.armorSpent > 0
      ? `<span>${damageFx.armorSpent} armor absorbed</span>`
      : '';
    return `<div class="damage-overlay" data-seq="${damageFx.id}" aria-live="assertive">
      <b class="damage-big">${damageFx.hpLost} damage</b>
      ${absorbed}
    </div>`;
  }
  if (damageFx.incoming > 0) {
    return `<div class="damage-overlay blocked" data-seq="${damageFx.id}" aria-live="assertive">
      <b class="damage-big">BLOCKED</b>
      <span>${damageFx.incoming} damage stopped</span>
    </div>`;
  }
  return '';
}

function guessDamageHtml(board: BoardView): string {
  const safe = board.freeGuessesLeft > 0
    || board.noGuessDamage
    || board.shielded
    || board.guessImmuneMsLeft > 0;
  const value = safe ? 0 : board.nextGuessDamage;
  const fmt = (amount: number): string => (
    Number.isInteger(amount) ? String(amount) : amount.toFixed(1)
  );
  const labelTip = 'Your first guess each round is free. Every wrong guess after that is attacked by the monster. '
    + 'Armor reduces that damage first; whatever is left over becomes a Hit to HP.';
  const calcTip = safe
    ? 'Your next guess is free, so there is no damage to calculate.'
    : value <= 0 && board.noGuessDamage
      ? 'This boss takes no damage from guesses.'
      : [
        ...board.damageBreakdown.map((line) => (
          line.kind === 'mult'
            ? `${line.label} ×${fmt(line.amount)}`
            : `${line.label} ${line.amount >= 0 ? '+' : ''}${fmt(line.amount)}`
        )),
        `= ${value} damage`,
      ].join('\n');
  return `<div class="guess-damage ${safe ? 'safe' : ''}">
    <span class="guess-damage-label tip-dots" tabindex="0" data-tip="${escapeHtml(labelTip)}" aria-label="${escapeHtml(labelTip)}">INCOMING DAMAGE</span>
    <b class="guess-damage-value tip-dots" tabindex="0" data-tip="${escapeHtml(calcTip)}" aria-label="${escapeHtml(calcTip)}">${safe ? 'FREE' : `⚔️ ${value} ⚔️`}</b>
  </div>`;
}

function bossStateChips(entries: Array<[string, number]>): string {
  const chips = entries
    .filter(([key]) => key !== 'wokeGuess')
    .map(([key, value]) => {
      if (key === 'woke') return `<span>${value ? 'AWAKE' : 'ASLEEP'}</span>`;
      if (key === 'hits') return `<span>HITS ${value}</span>`;
      if (key === 'swarm') return `<span>SWARM ${value}</span>`;
      return `<span>${escapeHtml(key)} ${value}</span>`;
    });
  return chips.length > 0 ? `<div class="boss-state">${chips.join('')}</div>` : '';
}

function renderTimer(view: RunView, board: BoardView): string {
  if (board.timerMode === 'hidden') return '';
  const countUp = board.timerMode === 'countup';
  const time = countUp ? formatTime(board.elapsedMs) : formatTime(board.remainingMs);
  const label = countUp
    ? 'TIME'
    : board.timerFrozen
      ? 'FROZEN'
      : 'RUN ENDS IN';
  const pct = countUp || !board.timerStartMs || board.remainingMs === null
    ? 100
    : Math.max(0, Math.min(100, (board.remainingMs / board.timerStartMs) * 100));
  const urgent = !countUp && board.remainingMs !== null && board.remainingMs <= 15_000;
  const timerTip = countUp
    ? 'No clock limit. Time is shown because an equipped item cares about it.'
    : 'When this reaches zero the run ends, even if you still have armor.';
  return `<div class="timer ${urgent ? 'urgent' : ''} ${board.timerFrozen ? 'frozen' : ''}" tabindex="0" data-tip="${escapeHtml(timerTip)}" aria-label="${escapeHtml(timerTip)}">
    <span class="timer-label">${label}</span>
    <b>${time}</b>
    <div class="timer-bar"><i style="width:${pct}%"></i></div>
  </div>`;
}

const RAIL_NODE_LABELS: Record<NodeKind, string> = {
  round: 'Fight',
  shop: 'Shop',
  curse: 'Curse',
  happening: 'Event',
  boss: 'Boss',
};

const RAIL_NODE_GLYPHS: Record<NodeKind, string> = {
  round: '◆',
  shop: '¤',
  curse: '✕',
  happening: '?',
  boss: '☠',
};

interface RailFloor {
  level: number;
  kind: NodeKind | 'start';
  bossId?: BossId;
  /** A floor can hold both a fight and an event. */
  hasEvent: boolean;
}

/** Collapse the nodes on one floor into a single ladder entry. */
function railFloorAt(view: RunView, level: number): RailFloor | null {
  if (level === 0) return { level, kind: 'start', hasEvent: false };
  if (level < 0) return null;
  const nodes = view.nodes.filter((node) => node.level === level);
  if (nodes.length === 0) return null;
  const primary = nodes.find((node) => node.kind === 'boss')
    ?? nodes.find((node) => node.kind === 'round')
    ?? nodes.find((node) => node.kind === 'curse')
    ?? nodes.find((node) => node.kind === 'shop')
    ?? nodes.find((node) => node.kind === 'happening');
  if (!primary) return null;
  return {
    level,
    kind: primary.kind,
    bossId: primary.boss,
    hasEvent: primary.kind !== 'happening' && nodes.some((node) => node.kind === 'happening'),
  };
}

function railFloorName(floor: RailFloor): string {
  if (floor.kind === 'start') return 'Run start';
  if (floor.kind === 'boss') {
    return (floor.bossId ? BOSS_BY_ID.get(floor.bossId)?.name : undefined) ?? 'Boss';
  }
  return RAIL_NODE_LABELS[floor.kind];
}

function railFloorGlyph(floor: RailFloor): string {
  if (floor.kind === 'start') return '·';
  if (floor.kind === 'boss') return bossSigil(floor.bossId);
  return RAIL_NODE_GLYPHS[floor.kind];
}

function railFloorTip(floor: RailFloor): string {
  const name = railFloorName(floor);
  return floor.hasEvent ? `${name} + event` : name;
}

/** Zig-zag anchors, top to bottom: +3, +2, +1, current, one behind. */
const RAIL_NODE_POINTS = [
  { x: 222, y: 17 },
  { x: 36, y: 37 },
  { x: 198, y: 70 },
  { x: 52, y: 92 },
  { x: 204, y: 112 },
];

function renderLevelBadge(view: RunView): string {
  const maxLevel = view.nodes.reduce((max, node) => Math.max(max, node.level ?? 0), view.level);
  const slots = [3, 2, 1, 0, -1].map((offset) => {
    const level = view.level + offset;
    if (level < 0 || level > maxLevel || (level === 0 && view.level !== 0)) return null;
    return railFloorAt(view, level);
  });
  const visible = slots.flatMap((floor, slot) => (
    floor ? [{ floor, slot, point: RAIL_NODE_POINTS[slot] }] : []
  ));

  const segments = visible.slice(1).map((entry, index) => {
    const previous = visible[index - 1]?.point ?? visible[index].point;
    const from = visible[index].point;
    const to = entry.point;
    const next = visible[index + 2]?.point ?? to;
    // Catmull-Rom control points keep the curve flowing through each node.
    const cp1x = from.x + (to.x - previous.x) / 3.5;
    const cp1y = from.y + (to.y - previous.y) / 3.5;
    const cp2x = to.x - (next.x - from.x) / 3.5;
    const cp2y = to.y - (next.y - from.y) / 3.5;
    const state = entry.slot === 4 ? 'past' : 'future';
    return `<path class="rail-path ${state}" d="M${from.x} ${from.y}C${cp1x} ${cp1y} ${cp2x} ${cp2y} ${to.x} ${to.y}" />`;
  }).join('');

  const nodes = slots.map((floor, index) => {
    if (!floor) return '<g class="rail-node is-empty" aria-hidden="true"></g>';
    const point = RAIL_NODE_POINTS[index];
    const current = index === 3;
    const state = current ? 'current' : index > 3 ? 'past' : 'future';
    const radius = current ? 15 : floor.kind === 'boss' ? 13 : 11;
    const glyph = railFloorGlyph(floor);
    const tip = railFloorTip(floor);
    return `<g class="rail-node ${state} kind-${floor.kind}${floor.hasEvent ? ' has-event' : ''}"
      data-level="${floor.level}"
      data-tip="${escapeHtml(tip)}"
      tabindex="0"
      role="img"
      aria-label="${escapeHtml(tip)}"${current ? ' aria-current="step"' : ''}>
      ${current ? `<circle class="rail-node-halo" cx="${point.x}" cy="${point.y}" r="${radius + 7}" />
      <circle class="rail-node-core" cx="${point.x}" cy="${point.y}" r="${radius - 5}" />` : ''}
      <circle class="rail-node-dot" cx="${point.x}" cy="${point.y}" r="${radius}" />
      <text class="rail-node-glyph" x="${point.x}" y="${point.y}" dy="0.35em" text-anchor="middle">${glyph}</text>
      ${floor.hasEvent ? `<circle class="rail-node-event" cx="${point.x + radius * 0.68}" cy="${point.y - radius * 0.68}" r="3.4" />` : ''}
    </g>`;
  }).join('');

  const summary = slots.flatMap((floor) => {
    if (!floor) return [];
    const state = floor.level === view.level
      ? ', current'
      : floor.level < view.level ? ', cleared' : '';
    return [`${railFloorTip(floor)}${state}`];
  }).join(', ');

  return `<div class="rail-level" aria-label="Current level ${view.level} of ${maxLevel}">
    <div class="rail-level-top">
      <span class="rail-level-kicker">FLOOR</span>
      <span class="rail-level-value">${view.level}<i>/${maxLevel}</i></span>
    </div>
    <svg class="rail-map" viewBox="0 0 252 128" role="group" aria-label="${escapeHtml(`Nearby floors: ${summary}`)}">
      ${segments}
      ${nodes}
    </svg>
  </div>`;
}

function renderPlayerVitals(view: RunView): string {
  const pct = Math.max(0, Math.min(100, (view.hp / Math.max(1, view.maxHp)) * 100));
  const armorPct = Math.max(0, Math.min(100, (view.armor / Math.max(1, view.maxArmor)) * 100));
  const playerDef = CHARACTER_BY_ID.get(view.character);
  const playerLabel = playerDef?.name ?? 'The Soldier';
  return `<div class="mini-player">
    <div class="fighter-head">
      <span class="fighter-name">${escapeHtml(playerLabel.toUpperCase())}</span>
      <b class="hp-numbers">${view.hp}<em>/${view.maxHp}</em></b>
    </div>
    <div class="big-hp" role="progressbar" aria-label="HP" aria-valuemin="0" aria-valuemax="${view.maxHp}" aria-valuenow="${view.hp}">
      <i style="width:${pct}%"></i>
      <span class="hp-gloss"></span>
    </div>
    <div class="armor-line" tabindex="0" data-tip="${escapeHtml(ARMOR_TIP)}" aria-label="${escapeHtml(ARMOR_TIP)}">
      <span class="armor-bar" role="progressbar" aria-label="Armor" aria-valuemin="0" aria-valuemax="${view.maxArmor}" aria-valuenow="${view.armor}">
        <i style="width:${armorPct}%"></i>
      </span>
      <span class="armor-text">ARMOR ${view.armor}/${view.maxArmor}</span>
    </div>
  </div>`;
}

function renderBattleRail(view: RunView, bossId?: string): string {
  const phase = view.phase;
  const enemy = arenaEnemy(view, bossId);
  const board = phase.kind === 'round' ? phase.board : null;
  const stateEntries = board ? Object.entries(board.bossState) : [];
  const low = view.hp <= view.maxHp * 0.3;
  const hit = Boolean(
    damageFx?.showOverlay && damageFx.hpLost > 0 && performance.now() - damageFx.at < 600,
  );
  const enemyIsOrc = view.act === 0 && !bossId;
  const now = performance.now();
  const walkDelay = -((now - spritesStartedAt) % WALK_MS);
  const attackElapsed = arenaAttack ? Math.max(0, now - arenaAttack.startedAt) : 0;
  const attackActive = Boolean(arenaAttack && attackElapsed < ATTACK_MS);
  const playerAttacking = attackActive && arenaAttack?.who === 'player';
  const orcDead = enemyIsOrc && orcDeathStartedAt !== null;
  const orcDeathElapsed = orcDead ? Math.max(0, now - (orcDeathStartedAt ?? now)) : 0;
  const orcDeathDelay = -Math.min(orcDeathElapsed, DEATH_MS - 1);
  const enemyAttacking = attackActive && arenaAttack?.who === 'enemy' && !orcDead;
  const playerSprite = characterSprite(view.character);
  const playerDef = CHARACTER_BY_ID.get(view.character);
  const playerLabel = playerDef?.name ?? 'The Soldier';
  const facts = board
    ? [
        board.freeGuessesLeft > 0 ? `<span class="fact">FREE ${board.freeGuessesLeft}</span>` : '',
        board.shielded ? `<span class="fact shield">IMMUNE ${formatTime(board.shieldMsLeft)}</span>` : '',
        board.gauntletTotal > 1 ? `<span class="fact gauntlet">PUZZLE ${board.gauntletIndex + 1}/${board.gauntletTotal}</span>` : '',
        view.items.some((item) => item.id === 'loose-tongue' && item.equipped) ? `<span class="fact free-speech">ANY WORD</span>` : '',
      ].filter(Boolean).join('')
    : '';

  return `
  <aside class="panel battle-rail ${low ? 'critical' : ''} ${hit ? 'hit' : ''}" style="--enemy:${enemy.color}" aria-label="Battle status">
    ${board ? renderTimer(view, board) : ''}
    ${board ? guessDamageHtml(board) : ''}
    <section class="mini-arena ${phase.kind === 'summary' ? 'settled' : ''}">
      <div class="mini-sky" aria-hidden="true"></div>
      <div class="mini-head">
        <span class="fighter-name">${escapeHtml(enemy.name)}</span>
        <span class="threat-tag">${enemy.boss ? 'BOSS' : 'HOSTILE'}</span>
      </div>
      ${bossStateChips(stateEntries)}
      <div class="mini-stage">
        <div class="mini-side player-side">
          <div class="sprite player-sprite">
            <i
              class="character-sprite ${characterPortraitClass(view.character)} ${playerAttacking ? 'attacking' : ''}"
              role="img"
              aria-label="${escapeHtml(playerLabel)}"
              style="${spriteStyle(playerSprite)};--walk-delay:${walkDelay}ms;--attack-delay:-${attackElapsed}ms"
            ></i>
          </div>
          <span class="mini-label">YOU</span>
        </div>
        <div class="mini-center">
          <span class="mini-phase">${phaseLabel(view)}</span>
          <div class="mini-vs"><span>VS</span></div>
        </div>
        <div class="mini-side enemy-side ${(hit || (enemyAttacking && !enemyIsOrc)) ? 'attacking' : ''}">
          <div class="sprite enemy-sprite">
            ${enemyIsOrc
              ? `<i
                  class="character-sprite orc ${orcDead ? 'dead' : enemyAttacking ? 'attacking' : ''}"
                  role="img"
                  aria-label="The Orc"
                  style="--walk:url('${orcWalk}');--attack:url('${orcAttack}');--death:url('${orcDeath}');--walk-delay:${walkDelay}ms;--attack-delay:-${attackElapsed}ms;--death-delay:${orcDeathDelay}ms"
                ></i>`
              : enemySprite(bossId)}
          </div>
          <span class="mini-label">${enemy.boss ? 'BOSS' : 'FOE'}</span>
        </div>
      </div>
      ${renderPlayerVitals(view)}
    </section>
    ${facts ? `<div class="mini-facts">${facts}</div>` : ''}
  </aside>`;
}

function renderShopRail(view: RunView): string {
  return `<aside class="panel shop-rail" aria-label="Shop">
    <div class="shop-rail-head">
      <span class="panel-kicker">SHOP</span>
      <b class="shop-rail-gold">🪙 ${view.gold}</b>
    </div>
    ${renderPlayerVitals(view)}
  </aside>`;
}

function renderCurseRail(view: RunView): string {
  return `<aside class="panel curse-rail" aria-label="Curse floor">
    <div class="shop-rail-head">
      <span class="panel-kicker">CURSE</span>
      <b class="shop-rail-floor">FLOOR ${view.level}</b>
    </div>
    ${renderPlayerVitals(view)}
  </aside>`;
}

function renderChronicle(): string {
  if (chronicleEntries.length === 0) {
    return `<div class="chronicle"><p class="empty-note">No actions recorded yet.</p></div>`;
  }
  const rows = chronicleEntries.slice().reverse().map((entry) => `
    <div class="chronicle-entry ${entry.kind}">
      <span class="chronicle-level">L${entry.level}</span>
      <span class="chronicle-text">${escapeHtml(entry.text)}</span>
    </div>`).join('');
  return `<div class="chronicle" aria-label="Run chronicle" aria-live="polite">${rows}</div>`;
}

function renderSidePanel(view: RunView): string {
  const stacks = new Map<string, { spell: SpellView; count: number }>();
  for (const spell of view.spells) {
    const entry = stacks.get(spell.id);
    if (entry) entry.count += 1;
    else stacks.set(spell.id, { spell, count: 1 });
  }
  const spells = stacks.size
    ? [...stacks.values()].map(({ spell, count }) => renderSpell(view, spell, count)).join('')
    : `<p class="empty-note">No spells. Food and item triggers make them.</p>`;

  const blacklist = view.blacklist.length
    ? view.blacklist.map((word, index) => `<li><span>${String(index + 1).padStart(2, '0')}</span>${escapeHtml(word)}</li>`).join('')
    : `<li class="empty"><span>—</span>empty</li>`;

  const hasList = view.curses.some((curse) => curse.id === 'the-list');
  const blacklistTip = 'Blacklisted words can never be guessed again. The List adds the first guess of every round, and blacklisted words are never chosen as future answers. No limit.';

  const curseChips = view.curses.map((curse) => {
    const def = CURSE_BY_ID.get(curse.id);
    const detail = curse.rules.length > 0
      ? curse.rules.join('\n')
      : def?.description ?? '';
    const tip = `${curse.name}${curse.stacks > 1 ? ` ×${curse.stacks}` : ''}\n${detail}`;
    return `<div class="curse-chip" tabindex="0" data-tip="${escapeHtml(tip)}" aria-label="${escapeHtml(tip)}"><b>${escapeHtml(curse.name)}</b>${curse.stacks > 1 ? `<em>×${curse.stacks}</em>` : ''}<span>${escapeHtml(curse.tags.join(' · '))}</span></div>`;
  }).join('');

  return `
  <aside class="panel side-panel">
    <section>
      <div class="panel-head"><span class="panel-kicker">SPELLS</span><span class="count">${view.spells.length}</span></div>
      <div class="spell-list">${spells}</div>
    </section>
    <section class="floorplan-panel">
      ${renderLevelBadge(view)}
    </section>
    <section>
      <div class="panel-head"><span class="panel-kicker">CURSES</span><span class="count">${view.curses.length}</span></div>
      <div class="curse-list">
        ${view.curses.length
          ? curseChips
          : `<p class="empty-note">No curses yet. The first draft comes after level 2.</p>`}
      </div>
    </section>
    ${hasList ? `<section class="blacklist-panel" tabindex="0" data-tip="${escapeHtml(blacklistTip)}" aria-label="${escapeHtml(blacklistTip)}">
      <div class="panel-head"><span class="panel-kicker">BLACKLIST</span><span class="count">${view.blacklist.length}</span></div>
      <ol class="blacklist">${blacklist}</ol>
    </section>` : ''}
    ${(view.collectedReveals.length || view.revealed.length || view.purged.length) ? `<section>
      ${view.collectedReveals.length ? `<div class="revealed collected">
        <span class="panel-kicker">COLLECTED LETTERS</span>
        <div>${view.collectedReveals.map((letter) => `<span class="letter-chip" tabindex="0" data-tip="Permanently revealed for the rest of the run">${escapeHtml(letter.toUpperCase())}</span>`).join('')}</div>
      </div>` : ''}
      ${view.revealed.length ? `<div class="revealed">
        <span class="panel-kicker">${view.phase.kind === 'round' || view.phase.kind === 'summary' ? 'REVEALED THIS PUZZLE' : 'REVEALED'}</span>
        <div>${view.revealed.map(({ letter, status }) => `<span class="reveal-chip ${status}"><b>${escapeHtml(letter.toUpperCase())}</b><em>${status === 'present' ? 'IN WORD' : 'RULED OUT'}</em></span>`).join('')}</div>
      </div>` : ''}
      ${view.purged.length ? `<div class="purged" tabindex="0" data-tip="${escapeHtml(PURGED_TIP)}" aria-label="${escapeHtml(PURGED_TIP)}"><span class="panel-kicker">PURGED</span><div>${view.purged.map((letter) => `<span class="letter-chip" tabindex="0" data-tip="${escapeHtml(PURGED_TIP)}">${escapeHtml(letter.toUpperCase())}</span>`).join('')}</div></div>` : ''}
    </section>` : ''}
  </aside>`;
}

function renderItemsPanel(view: RunView): string {
  const items = view.items.length
    ? view.items.map((item) => renderItem(view, item)).join('')
    : `<p class="empty-note">No items yet. Shops and the Curse Broker fix that.</p>`;
  const bagged = view.items.filter((item) => !item.equipped && item.slots > 0).length;
  return `
  <aside class="panel items-panel">
    <section class="rail-items">
      <div class="panel-head">
        <span class="panel-kicker">ITEMS</span>
        <span class="count">${view.slots.used}/${view.slots.total}${bagged ? ` · ${bagged} BAG` : ''}</span>
      </div>
      <div class="item-list">${items}</div>
    </section>
    <div class="seedline">SEED ${escapeHtml(host.current?.seed ?? '')}</div>
  </aside>`;
}

function renderItem(view: RunView, item: ItemView): string {
  const def = ITEM_BY_ID.get(item.id);
  const name = def?.name ?? item.id;
  const description = def?.dynamicDescription?.(item.data) ?? def?.description ?? '';
  const data = Object.entries(item.data)
    .filter(([key, value]) => (
      (value !== 0 || key === 'fed')
      && !key.startsWith('_')
      && key !== 'used'
      && key !== 'paid'
    ))
    .map(([key, value]) => (
      `<span class="data-chip">${escapeHtml(key === 'fed' ? 'FED' : key)} ${value}</span>`
    ))
    .join('');
  const spent = def?.initial?.used !== undefined && (item.data.used ?? 0) > 0;
  const usedThisRound = Boolean(def?.onUse) && (item.data._uses ?? 0) > 0;
  const usable = Boolean(def?.onUse);
  const rarity = !item.equipped && item.slots > 0
    ? 'BAG'
    : def?.rarity === 'rare'
      ? 'RELIC'
      : def?.rarity === 'uncommon'
        ? 'UNCOMMON'
        : def?.kind === 'consumable'
          ? 'USE'
          : 'GEAR';
  const rarityClass = def?.rarity === 'rare'
    ? 'rare'
    : def?.rarity === 'uncommon' ? 'uncommon' : '';
  return `
  <article class="item-card ${rarityClass} ${spent ? 'spent' : ''} ${!item.equipped && item.slots > 0 ? 'in-bag' : ''}" data-tip="${escapeHtml(description)}">
    <div class="item-top">
      <span class="item-emoji" aria-hidden="true">${itemIcon(item.id)}</span>
      <b>${escapeHtml(name)}</b>
      ${spent ? `<span class="item-state">SPENT</span>` : ''}
      ${usedThisRound ? `<span class="item-state">USED</span>` : ''}
      <span class="tag">${rarity}</span>
    </div>
    <p>${glossaryText(description)}</p>
    ${data ? `<div class="data-row">${data}</div>` : ''}
    ${!item.equipped && item.slots > 0 ? `<p class="bag-note">In the bag. Equip it in a shop.</p>` : ''}
    ${usable ? `<button class="btn tiny" data-action="use" data-id="${escapeHtml(item.instance)}" ${usedThisRound ? 'disabled' : ''}>${usedThisRound ? 'USED' : 'USE'}</button>` : ''}
  </article>`;
}

function renderSpell(view: RunView, spell: SpellView, count: number): string {
  const def = SPELL_BY_ID.get(spell.id);
  const name = def?.name ?? spell.id;
  const description = def?.description ?? '';
  const canCast = def ? def.usable === 'any' || view.phase.kind === 'round' : false;
  return `
  <article class="spell-card">
    <div class="item-top">
      <span class="item-emoji" aria-hidden="true">${spellIcon(spell.id)}</span>
      <b>${escapeHtml(name)}</b>
      ${count > 1 ? `<span class="stack-badge">×${count}</span>` : ''}
      <span class="tag">SPELL</span>
    </div>
    <p>${glossaryText(description)}</p>
    <button class="btn tiny" data-action="cast" data-id="${escapeHtml(spell.instance)}" ${canCast ? '' : 'disabled'}>CAST</button>
  </article>`;
}

function tileRow(
  letters: string[],
  tiles?: string[],
  extraClass = '',
): string {
  const cells = Array.from({ length: 5 }, (_, index) => {
    const letter = letters[index] ?? '';
    const status = tiles?.[index] ?? '';
    const symbol = status === 'correct' ? '✓' : status === 'present' ? '•' : status === 'hit' ? '~' : status === 'hidden' ? '?' : '';
    return `<div class="tile ${status || 'empty'} ${extraClass}">
      <span class="tile-letter">${escapeHtml(letter)}</span>
      ${symbol ? `<span class="tile-mark">${symbol}</span>` : ''}
    </div>`;
  }).join('');
  return `<div class="board-row">${cells}</div>`;
}

function renderBoard(board: BoardView): string {
  const rows: string[] = [];
  const guesses = board.guesses;
  const totalRows = Math.max(6, guesses.length + 1);

  // The engine starts multiplying damage at this row. Short Fuse moves the
  // boundary earlier; the divider is purely visual and never changes behavior.
  const firstMultiplied = Math.max(0, 5 - board.damageRampEarly);
  const dividerTip = 'Damage is multiplied after this guess, and any remaining free guesses are lost. '
    + 'Wrong guesses below take ×2 damage, then ×3, ×4 and so on.'
    + (board.damageRampEarly > 0 ? ' Short Fuse moved this line earlier.' : '');

  for (let index = 0; index < totalRows; index++) {
    if (index === firstMultiplied) {
      rows.push(`<div class="board-divider" tabindex="0" data-tip="${escapeHtml(dividerTip)}" aria-label="${escapeHtml(dividerTip)}">
        <span class="board-divider-mark" aria-hidden="true">!</span>
        <span class="board-divider-rule" aria-hidden="true"></span>
        <span class="board-divider-icon" aria-hidden="true">⚔️</span>
        <span class="board-divider-rule" aria-hidden="true"></span>
        <span class="board-divider-mark" aria-hidden="true">!</span>
      </div>`);
    }
    if (index < guesses.length) {
      const guess = guesses[index];
      const counts = guess.counts
        ? `<div class="counts">${guess.counts.correct} in place · ${guess.counts.present} misplaced</div>`
        : '';
      rows.push(tileRow(guess.word.split(''), guess.tiles) + counts);
    } else if (index === guesses.length) {
      rows.push(tileRow(input.split(''), undefined, 'input'));
    } else {
      rows.push(tileRow([]));
    }
  }

  return `
  <div class="board">${rows.join('')}</div>
  ${renderKeyboard(board)}`;
}

function renderKeyboard(board: BoardView): string {
  const rows = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
  return `<div class="keyboard">${rows.map((row, rowIndex) => {
    const keys = row.split('').map((letter) => {
      const status = board.keyboard[letter] ?? '';
      const hint = board.hints[letter];
      const hinted = hint ? 'hinted' : '';
      const title = status === 'purged'
        ? `${letter.toUpperCase()} · purged, can't be manually guessed`
        : status === 'hidden'
          ? `${letter.toUpperCase()} · hidden by a vision curse`
          : hint === 'present'
            ? `${letter.toUpperCase()} · revealed in the answer`
            : hint === 'absent'
              ? `${letter.toUpperCase()} · revealed not in the answer`
              : letter.toUpperCase();
      return `<button class="key ${status} ${hinted}" data-action="key" data-letter="${letter}" title="${title}" ${status === 'purged' ? 'disabled' : ''}>${letter}</button>`;
    }).join('');
    const tail = rowIndex === 2
      ? `<button class="key wide del" data-action="del" aria-label="Delete">DEL</button><button class="key wide enter" data-action="submit">ENTER</button>`
      : '';
    return `<div class="key-row">${keys}${tail}</div>`;
  }).join('')}</div>`;
}

function renderSummary(view: RunView, phase: Extract<PhaseView, { kind: 'summary' }>): string {
  const boss = phase.boss ? BOSS_BY_ID.get(phase.boss) : undefined;
  const miniboss = phase.boss === 'miniboss';
  const title = phase.outcome === 'solved' ? 'SOLVED' : phase.outcome === 'timeout' ? "TIME'S UP" : 'YOU DIED';
  const answers = phase.answers && phase.answers.length > 1
    ? `<div class="answer-list">${phase.answers.map((answer) => `<span>${escapeHtml(answer.toUpperCase())}</span>`).join('')}</div>`
    : '';
  return `
  <div class="phase-card summary ${phase.outcome}">
    <p class="panel-kicker">${boss
      ? `${miniboss ? 'MINIBOSS' : 'BOSS'} · ${escapeHtml(boss.name)}`
      : 'ROUND OVER'}</p>
    <h2>${title}</h2>
    <div class="answer-reveal">${escapeHtml(phase.answer.toUpperCase())}</div>
    ${answers}
    <div class="summary-facts">
      <div><b>${phase.guesses}</b><span>guesses</span></div>
      <div><b>${formatTime(phase.elapsedMs)}</b><span>on the clock</span></div>
      <div><b>${phase.outcome === 'solved' ? 'YES' : 'NO'}</b><span>solved</span></div>
      <div class="gold-fact"><b>+${phase.gold}</b><span>gold</span></div>
    </div>
    <p class="muted">${phase.outcome === 'solved'
      ? miniboss
        ? 'The Miniboss is down. You gain an item slot and a full heal. Choose your reward.'
        : boss
          ? 'The Floor Boss is down. Continue to finish the run.'
          : 'The round is clear. Choose a reward and keep moving.'
      : phase.outcome === 'timeout'
        ? 'The clock took its cut, but the encounter still paid. No reward this time. The run continues if you do.'
        : 'The run is over. The save is gone.'}</p>
    ${phase.outcome !== 'died' ? `<button class="btn primary big" data-action="continue">${phase.rewardPending ? 'CLAIM REWARD →' : 'NEXT NODE →'}</button>` : ''}
  </div>`;
}

function renderReward(phase: Extract<PhaseView, { kind: 'reward' }>): string {
  const boss = phase.boss;
  const miniboss = phase.miniboss === true;
  return `
  <div class="phase-card reward ${boss || miniboss ? 'boss-reward' : ''}">
    <p class="panel-kicker">${miniboss ? 'MINIBOSS REWARD' : boss ? 'BOSS RELIC' : 'REWARD'}</p>
    <h2>${miniboss ? 'Choose your prize' : boss ? 'Claim a relic' : 'Take one'}</h2>
    <p class="muted">${miniboss
      ? 'Pick one: a rare meal or a rare relic. You already gained an item slot and a full heal.'
      : boss
        ? 'Rare passives. Each relic uses an item slot and lasts for the rest of the run.'
        : 'Coins plus a spell or a meal. Rarely, a find.'}</p>
    <div class="reward-grid">
      ${phase.options.map((option) => {
        const icon = option.kind === 'item'
          ? itemIcon(option.def ?? '')
          : option.kind === 'spell'
            ? spellIcon(option.def ?? '')
            : option.kind === 'eat'
              ? foodIcon(option.def ?? '')
              : '🪙';
        const isRelic = option.kind === 'item' && option.rarity === 'rare';
        const tag = isRelic
          ? 'RELIC'
          : option.rarity === 'uncommon' ? 'UNCOMMON' : option.kind.toUpperCase();
        const rarityClass = isRelic
          ? 'rare'
          : option.rarity === 'uncommon' ? 'uncommon' : '';
        return `
        <button class="reward-card ${option.kind} ${rarityClass}" data-action="reward" data-id="${escapeHtml(option.id)}">
          <span class="reward-icon" aria-hidden="true">${icon}</span>
          <span class="tag">${tag}</span>
          <b>${escapeHtml(option.label)}</b>
          <span>${glossaryText(option.description)}</span>
        </button>`;
      }).join('')}
    </div>
  </div>`;
}

function offerInfo(offer: Offer): { name: string; description: string; slots: number; icon: string } {
  if (offer.kind === 'item') {
    const def = ITEM_BY_ID.get(offer.def);
    return {
      name: def?.name ?? offer.def,
      description: def?.description ?? '',
      slots: def?.slots ?? (def?.kind === 'gear' ? 1 : 0),
      icon: itemIcon(offer.def),
    };
  }
  if (offer.kind === 'spell') {
    const def = SPELL_BY_ID.get(offer.def);
    return { name: def?.name ?? offer.def, description: def?.description ?? '', slots: 0, icon: spellIcon(offer.def) };
  }
  const def = FOOD_BY_ID.get(offer.def);
  return { name: def?.name ?? offer.def, description: def?.description ?? '', slots: 0, icon: foodIcon(offer.def) };
}

function renderCurse(phase: Extract<PhaseView, { kind: 'curse' }>): string {
  const bossTotal = phase.total ?? 3;
  const bossStep = bossTotal - (phase.remaining ?? 1) + 1;
  return `
  <div class="phase-card curse-draft">
    <p class="panel-kicker">${phase.boss
      ? `BOSS PREP · CURSE ${bossStep}/${bossTotal}`
      : phase.starting ? 'STARTING CURSE' : 'CURSE DRAFT'}</p>
    <h2>${phase.boss ? 'Choose a curse for the fight' : 'Choose a burden'}</h2>
    <p class="muted">${phase.boss
      ? 'The boss waits. Take this burden, then face what comes next.'
      : 'Every curse here affects every future encounter. You must take one.'}</p>
    <div class="curse-grid">
      ${phase.options.map((id) => {
        const def = CURSE_BY_ID.get(id);
        if (!def) return '';
        return `
        <button class="curse-card" data-action="curse" data-id="${escapeHtml(def.id)}" style="--enemy:${bossColor(def.art)}">
          <div class="curse-card-art" aria-hidden="true">${enemyArt(def.art)}</div>
          <span class="tag">${def.tags.join(' · ').toUpperCase()}</span>
          <b>${escapeHtml(def.name)}</b>
          <p>${escapeHtml(def.description)}</p>
          <ul>${def.rules.map((rule) => `<li>${escapeHtml(rule)}</li>`).join('')}</ul>
          <span class="curse-take">TAKE THIS CURSE →</span>
        </button>`;
      }).join('')}
    </div>
  </div>`;
}

function renderCurseRemovalModal(view: RunView): string {
  if (view.pendingCurseRemoval <= 0) return '';
  return `
  <div class="modal">
    <div class="modal-card">
      <p class="panel-kicker">CURSE REMOVAL</p>
      <h2>Choose one burden</h2>
      <p class="muted">One stack is removed. Permanent stat losses already suffered are not refunded.</p>
      <div class="curse-removal-list">
        ${view.curses.map((curse) => `
          <button class="btn" data-action="remove-curse" data-id="${escapeHtml(curse.id)}">
            ${escapeHtml(curse.name)}${curse.stacks > 1 ? ` ×${curse.stacks}` : ''}
          </button>
        `).join('')}
      </div>
    </div>
  </div>`;
}

function renderShopChoice(): string {
  return `
  <div class="phase-card shop-choice">
    <p class="panel-kicker">A LIGHT IN THE ROAD</p>
    <h2>Shop or rest?</h2>
    <p class="muted">A merchant has set out a stall beside an inn. The inn might leave you time for both.</p>
    <div class="shop-choice-grid">
      <button class="shop-choice-card" data-action="choose" data-id="shop">
        <span class="choice-glyph" aria-hidden="true">🛒</span>
        <b>Shop</b>
        <span>Spend gold on items, food, and spells. Rerolls start at 1g.</span>
      </button>
      <button class="shop-choice-card" data-action="choose" data-id="inn">
        <span class="choice-glyph" aria-hidden="true">🛏️</span>
        <b>Inn</b>
        <span>Gain +4 max HP, then heal to full. 30% chance the shop stays open.</span>
      </button>
    </div>
    <p class="hint">The inn grants +4 max HP and heals you to full. 30% of the time, you can visit the shop afterward.</p>
  </div>`;
}

function renderShop(view: RunView, phase: Extract<PhaseView, { kind: 'shop' }>): string {
  const coupon = phase.purchases === 0
    ? view.items.reduce((max, item) => {
      const def = ITEM_BY_ID.get(item.id);
      return item.equipped && def?.shopDiscount
        ? Math.max(max, def.shopDiscount)
        : max;
    }, 0)
    : 0;
  const offers = phase.offers.length
    ? phase.offers.map((offer) => {
      const info = offerInfo(offer);
      const applies = offer.kind === 'item' || offer.kind === 'eat';
      const finalPrice = Math.max(1, offer.price - (applies ? coupon : 0));
      const cannotAfford = view.gold < finalPrice;
      const def = offer.kind === 'item'
        ? ITEM_BY_ID.get(offer.def)
        : offer.kind === 'eat' ? FOOD_BY_ID.get(offer.def) : undefined;
      const rarity = def?.shopRarity ?? def?.rarity;
      const isRare = rarity === 'rare';
      const isRelic = offer.kind === 'item' && isRare;
      const isUncommon = !isRare && rarity === 'uncommon';
      const tag = isRelic
        ? offer.sale ? 'RELIC · 50% OFF' : 'RELIC'
        : isRare
          ? offer.sale ? 'RARE · 50% OFF' : 'RARE'
          : isUncommon
            ? offer.sale ? 'UNCOMMON · 50% OFF' : 'UNCOMMON'
            : offer.sale ? 'SALE · 50% OFF' : KIND_LABELS[offer.kind];
      const price = offer.sale && offer.originalPrice
        ? `<s>${offer.originalPrice} G</s> ${finalPrice} G`
        : applies && coupon > 0
          ? `<s>${offer.price} G</s> ${finalPrice} G`
          : `${offer.price} G`;
      return `
      <article class="offer-card ${cannotAfford ? 'unavailable' : ''} ${offer.sale ? 'sale' : ''} ${isRare ? 'rare' : isUncommon ? 'uncommon' : ''}">
        <div class="offer-top">
          <span class="item-emoji" aria-hidden="true">${info.icon}</span>
          <span class="tag">${tag}</span>
        </div>
        <h3>${escapeHtml(info.name)}</h3>
        <p>${glossaryText(info.description)}</p>
        <button class="btn primary" data-action="buy" data-id="${escapeHtml(offer.id)}" ${cannotAfford ? 'disabled' : ''}>${price}</button>
      </article>`;
    }).join('')
    : `<p class="empty-note">The shelves are bare. Reroll or leave.</p>`;

  const canSell = !view.curses.some((curse) => curse.id === 'chained');
  const sellable = view.items.length
    ? view.items.map((item) => {
      const def = ITEM_BY_ID.get(item.id);
      const description = def?.dynamicDescription?.(item.data) ?? def?.description ?? '';
      return `<div class="sell-row"><span class="sell-name" tabindex="0" data-tip="${escapeHtml(description)}">${itemIcon(item.id)} ${escapeHtml(def?.name ?? item.id)}</span><button class="btn tiny" data-action="sell" data-id="${escapeHtml(item.instance)}" ${canSell ? '' : 'disabled'}>SELL ${item.sellValue} G</button></div>`;
    }).join('')
    : `<p class="empty-note">Nothing to sell.</p>`;

  const gear = view.items.filter((item) => item.slots > 0);
  const equippedGear = gear.filter((item) => item.equipped);
  const bagged = gear.filter((item) => !item.equipped);
  const freeSlots = Math.max(0, view.slots.total - equippedGear.length);

  const chips = (items: ItemView[], inSlot: boolean) => items.map((item) => {
    const def = ITEM_BY_ID.get(item.id);
    return `<div class="loadout-chip ${inSlot ? 'equipped' : 'bagged'}" draggable="true"
      data-item="${escapeHtml(item.instance)}"
      data-action="${inSlot ? 'unequip' : 'equip'}" data-id="${escapeHtml(item.instance)}"
      data-tip="${escapeHtml(def?.description ?? '')}"
      title="${inSlot ? 'Drag to the bag or click to unequip' : 'Drag to a slot or click to equip'}">
      <span class="item-emoji" aria-hidden="true">${itemIcon(item.id)}</span>
      <b>${escapeHtml(def?.name ?? item.id)}</b>
    </div>`;
  }).join('');

  const slots = [
    ...chips(equippedGear, true),
    ...Array.from({ length: freeSlots }, () => `<div class="slot-socket" data-drop="slot"><span>EMPTY</span></div>`),
  ].join('');

  const loadout = `
    <div class="loadout">
      <div class="loadout-head">
        <span class="panel-kicker">LOADOUT</span>
        <span class="count">${view.slots.used}/${view.slots.total} SLOTS</span>
      </div>
      <p class="hint">This shop is where you rearrange gear. Drag a piece between the slots and the bag, or click it.</p>
      <div class="slot-grid" data-drop="slot">${slots}</div>
      <div class="bag-zone" data-drop="bag">
        <span class="panel-kicker">BAG${bagged.length ? ` · ${bagged.length}` : ''}</span>
        ${bagged.length
          ? `<div class="bag-grid">${chips(bagged, false)}</div>`
          : `<p class="empty-note">Nothing in the bag. Drag a piece here to switch it off.</p>`}
      </div>
    </div>`;

  return `
  <div class="phase-card shop">
    ${coupon > 0 ? `<p class="hint coupon-hint">Coupon Book: the first item or food purchase costs ${coupon} less.</p>` : ''}
    <div class="offer-grid">${offers}</div>
    <div class="shop-actions">
      <button class="btn" data-action="reroll">REROLL · ${phase.rerollCost} G</button>
      <button class="btn ghost" data-action="continue">LEAVE →</button>
    </div>
    ${loadout}
    <div class="sell-box">
      <p class="panel-kicker">SELL ITEMS${canSell ? '' : ' · CHAINED'}</p>
      ${sellable}
    </div>
    <p class="hint">Shops carry items, foods, and one wildcard slot. Curses can remove slots. Food is eaten on purchase and takes no slot. One item is always half price, and each reroll costs double the last. Relics are very rare items.</p>
  </div>`;
}

function happeningPreviews(
  phase: Extract<PhaseView, { kind: 'happening' }>,
  optionId: string,
): string {
  if (phase.happening === 'hollow-pocket' && optionId === 'gamble') {
    const curse = phase.previewCurse ? CURSE_BY_ID.get(phase.previewCurse) : undefined;
    const curseTip = curse ? `${curse.name}\n${curse.rules.join('\n')}` : 'One random eligible curse.';
    return `<div class="preview-row">
      <span class="preview-chip curse" tabindex="0" data-tip="${escapeHtml(curseTip)}">
        <span class="preview-icon" aria-hidden="true">?</span>
        50% - ${escapeHtml(curse?.name ?? 'Random curse')}
      </span>
    </div>`;
  }
  if (phase.happening === 'forbidden-feast' && optionId === 'eat') {
    const food = phase.previewFood ? FOOD_BY_ID.get(phase.previewFood) : undefined;
    const curse = phase.previewCurse ? CURSE_BY_ID.get(phase.previewCurse) : undefined;
    const foodTip = food ? `${food.name}\n${food.description}` : 'One random rare food.';
    const curseTip = curse ? `${curse.name}\n${curse.rules.join('\n')}` : 'One random eligible curse.';
    return `<div class="preview-row">
      <span class="preview-chip" tabindex="0" data-tip="${escapeHtml(foodTip)}">
        <span class="preview-icon" aria-hidden="true">${food ? foodIcon(food.id) : '??'}</span>
        RARE - ${escapeHtml(food?.name ?? 'Random rare food')}
      </span>
      <span class="preview-chip curse" tabindex="0" data-tip="${escapeHtml(curseTip)}">
        <span class="preview-icon" aria-hidden="true">?</span>
        50% - ${escapeHtml(curse?.name ?? 'Random curse')}
      </span>
    </div>`;
  }
  if (phase.happening !== 'the-bargain' || optionId !== 'draw') return '';
  const item = phase.previewItem ? ITEM_BY_ID.get(phase.previewItem) : undefined;
  const curse = phase.previewCurse ? CURSE_BY_ID.get(phase.previewCurse) : undefined;
  const itemTip = item ? `${item.name}\n${item.description}` : 'One random available item.';
  const curseTip = curse ? `${curse.name}\n${curse.rules.join('\n')}` : 'One random eligible curse.';
  return `<div class="preview-row">
    <span class="preview-chip" tabindex="0" data-tip="${escapeHtml(itemTip)}">
      <span class="preview-icon" aria-hidden="true">${item ? itemIcon(item.id) : '🎁'}</span>
      60% · ${escapeHtml(item?.name ?? 'Random item')}
    </span>
    <span class="preview-chip curse" tabindex="0" data-tip="${escapeHtml(curseTip)}">
      <span class="preview-icon" aria-hidden="true">✦</span>
      40% · ${escapeHtml(curse?.name ?? 'Random curse')}
    </span>
  </div>`;
}

function renderHappening(phase: Extract<PhaseView, { kind: 'happening' }>): string {
  const def = HAPPENING_BY_ID.get(phase.happening);
  const resolved = phase.resolved;
  return `
  <div class="phase-card happening">
    <p class="panel-kicker">AN INTERRUPTION</p>
    <h2>${escapeHtml(def?.name ?? phase.happening)}</h2>
    <p class="happening-desc">${glossaryText(def?.description ?? '')}</p>
    ${resolved
      ? `<div class="resolution ${resolved.success ? 'good' : 'bad'}">${escapeHtml(resolved.text)}</div><button class="btn primary big" data-action="continue">CONTINUE →</button>`
      : `<div class="option-list">
        ${phase.options.map((option) => `
          <article class="happening-option ${option.locked ? 'locked' : ''}">
            <div>
              <b>${escapeHtml(option.label)}</b>
              <p>${glossaryText(option.description)}</p>
              ${happeningPreviews(phase, option.id)}
              ${option.requiresSpell
                ? `<span class="warn">${option.locked
                  ? `NEEDS ${escapeHtml((SPELL_BY_ID.get(option.requiresSpell)?.name ?? option.requiresSpell).toUpperCase())}`
                  : 'TRADES ONE SPELL'}</span>`
                : option.requiresAnySpell
                  ? `<span class="warn">${option.locked ? 'NEEDS A SPELL' : 'TRADES A RANDOM SPELL'}</span>`
                  : ''}
              ${option.costGold ? `<span class="warn">Costs ${option.costGold} gold${option.fallbackPct ? ` · or ${Math.round(option.fallbackPct * 100)}% of your gold` : ''}</span>` : ''}
            </div>
            <div class="odds">
              ${option.outcomes.map((outcome) => `<span>${outcome.chancePct}% · ${escapeHtml(outcome.text)}</span>`).join('')}
            </div>
            <button class="btn" data-action="choose" data-id="${escapeHtml(option.id)}" ${option.locked ? 'disabled' : ''}>CHOOSE</button>
          </article>`).join('')}
      </div>`}
  </div>`;
}

function renderOver(phase: Extract<PhaseView, { kind: 'over' }>): string {
  const victory = phase.result === 'victory';
  const stats = phase.stats;
  const ascension = host.current?.ascension ?? 0;
  const unlocked = readMeta().ascension;
  const ascNote = victory
    ? unlocked > ascension
      ? `ASCENSION ${unlocked} UNLOCKED`
      : ascension > 0
        ? `ASCENSION ${ascension} CLEARED`
        : ''
    : ascension > 0
      ? `ASCENSION ${ascension}`
      : '';
  const missed = phase.answers && phase.answers.length > 1
    ? `<div class="answer-list">${phase.answers.map((answer) => `<span>${escapeHtml(answer.toUpperCase())}</span>`).join('')}</div>`
    : '';
  const reveal = !victory && phase.answer
    ? `<div class="over-answer">
        <span class="over-answer-label">${missed ? 'THE PUZZLES YOU MISSED' : 'THE WORD YOU MISSED'}</span>
        ${missed || `<b>${escapeHtml(phase.answer.toUpperCase())}</b>`}
      </div>`
    : '';
  const equipped = (phase.equippedItems ?? []).map((id) => {
    const def = ITEM_BY_ID.get(id);
    const name = def?.name ?? id;
    return { name, tip: `${name}\n${def?.description ?? ''}` };
  });
  const deathCharacter = host.current?.character ?? 'runner';
  const deathSprite = characterSprite(deathCharacter);
  const deathLabel = CHARACTER_BY_ID.get(deathCharacter)?.name ?? 'The Soldier';
  const deathElapsed = playerDeathStartedAt === null ? DEATH_MS : performance.now() - playerDeathStartedAt;
  const deathDelay = -Math.max(0, Math.min(deathElapsed, DEATH_MS));
  const defeatFighter = victory
    ? ''
    : `<div class="over-fighter" aria-hidden="true">
        <i class="character-sprite ${characterPortraitClass(deathCharacter)} dead" aria-label="${escapeHtml(deathLabel)}" style="${spriteStyle(deathSprite)};--death-delay:${deathDelay}ms"></i>
      </div>`;
  return `
  <div class="over-screen ${victory ? 'victory' : 'defeat'}">
    ${defeatFighter}
    <p class="kicker">RUN OVER</p>
    <h1>${victory ? 'THE LIST IS YOURS' : 'THE LIST CLOSES'}</h1>
    <p class="tagline">${victory
      ? 'Fifty floors. Every curse. The words you gave up are the ones that carried you.'
      : 'The word that ended you is written below. It will not be so kind next time.'}</p>
    ${ascNote ? `<p class="ascension-result">${ascNote}</p>` : ''}
    ${reveal}
    <div class="stats-grid">
      <div><b>${stats.rounds}</b><span>rounds</span></div>
      <div><b>${stats.guesses}</b><span>guesses</span></div>
      <div><b>${stats.bosses}</b><span>bosses</span></div>
      <div><b>${stats.goldEarned}</b><span>gold earned</span></div>
      <div><b>${stats.damageTaken}</b><span>damage taken</span></div>
      <div><b>${stats.timeouts}</b><span>timeouts</span></div>
    </div>
    ${equipped.length > 0 ? `<div class="over-loadout">
      <span class="over-answer-label">EQUIPPED AT THE END</span>
      <div>${equipped.map((entry) => `<span tabindex="0" data-tip="${escapeHtml(entry.tip)}">${escapeHtml(entry.name)}</span>`).join('')}</div>
    </div>` : ''}
    <div class="over-actions">
      <button class="btn primary big" data-action="new-run" data-character="${escapeHtml(deathCharacter)}">NEW RUN</button>
      <button class="btn ghost big" data-action="stats">STATS</button>
      <button class="btn ghost big" data-action="title">TITLE</button>
    </div>
    <p class="hint">The active save was deleted. Meta record remains.</p>
  </div>`;
}

function renderDamageTutorial(): string {
  return `
  <div class="modal damage-tutorial">
    <div class="modal-card">
      <p class="panel-kicker">DAMAGE</p>
      <h2>The monster hits back</h2>
      <p class="muted">Your first guess each round is free. After that, every wrong guess is a <b>Hit (HP damage)</b>: the monster attacks you.</p>
      <p class="muted">From the <b>6th guess</b> in a round onward, each wrong guess deals an increasing amount of damage. A correct guess never hurts you, and autoguesses are always free.</p>
      <p class="muted">Armor soaks damage first. Only what gets through reaches HP.</p>
      <button class="tutorial-check ${damageTutorialMute ? 'checked' : ''}" data-action="toggle-damage-tutorial-mute" role="checkbox" aria-checked="${damageTutorialMute}">
        <span class="tutorial-box" aria-hidden="true">${damageTutorialMute ? '✓' : ''}</span>
        Don't remind me
      </button>
      <button class="btn primary big" data-action="dismiss-damage-tutorial">GOT IT</button>
    </div>
  </div>`;
}

function renderPurgeModal(view: RunView): string {
  if (view.pendingPurge <= 0) return '';
  const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');
  const setup = view.phase.kind === 'purge';
  const purgeLabel = `${view.pendingPurge} purge${view.pendingPurge === 1 ? '' : 's'} pending`;
  return `
  <div class="modal">
    <div class="modal-card">
      <p class="panel-kicker">${setup ? 'BEFORE THE FIRST FLOOR' : 'LETTER PURGE'}</p>
      <h2>${setup ? `Erase ${view.pendingPurge} letter${view.pendingPurge === 1 ? '' : 's'}` : 'Erase a letter'}</h2>
      <p class="muted">${setup ? 'No word has been drawn yet, so every letter is fair game. ' : ''}The letter will never appear in a future answer, and you can never manually guess it again. Autoguesses can still use it. Choose carefully. If a purge would leave no legal words, a random purged letter is restored.</p>
      <div class="purge-grid">
        ${letters.map((letter) => `<button class="purge-key ${view.purged.includes(letter) ? 'used' : ''}" data-action="purge" data-letter="${letter}" ${view.purged.includes(letter) ? 'disabled' : ''}>${letter.toUpperCase()}</button>`).join('')}
      </div>
      <p class="hint">${purgeLabel}. ${setup ? 'The run begins after the last purge.' : 'The clock is paused while this is open.'}</p>
    </div>
  </div>`;
}

function renderBossIntro(view: RunView, phase: Extract<PhaseView, { kind: 'bossIntro' }>): string {
  const boss = BOSS_BY_ID.get(phase.boss);
  if (!boss) return '';
  const timer = boss.timerFromCurse ? 'CURSED CLOCK' : boss.timerMs === null ? 'NO TIMER' : formatTime(boss.timerMs);
  const damage = boss.noGuessDamage
    ? 'NO GUESS DAMAGE'
    : boss.damageBonus
      ? `BASE DAMAGE +${boss.damageBonus}`
      : `BASE HIT ${boss.damage ?? 3}`;
  return `
  <div class="phase-card boss-intro" style="--enemy:${bossColor(boss.id)}">
    <p class="panel-kicker">BOSS ENCOUNTER · ACT ${roman(view.act + 1)}</p>
    <div class="boss-intro-art" aria-hidden="true">${enemyArt(boss.id)}</div>
    <h1>${escapeHtml(boss.name)}</h1>
    <p class="boss-intro-desc">${escapeHtml(boss.description)}</p>
    <div class="boss-intro-facts">
      <span>${damage}</span>
      <span>${timer}</span>
      <span>${boss.gauntlet ? `${boss.gauntlet.puzzles} WORDS` : 'ONE WORD'}</span>
    </div>
    <section class="boss-rulebox">
      <h3>WHAT CHANGES</h3>
      <ul>${boss.rules.map((rule) => `<li>${glossaryText(rule)}</li>`).join('')}</ul>
    </section>
    <button class="btn primary big" data-action="continue">FACE IT →</button>
  </div>`;
}

function phasePanel(view: RunView): string {
  const phase = view.phase;
  switch (phase.kind) {
    case 'purge':
      return `<section class="phase-card purge-setup">
        <p class="panel-kicker">BEFORE THE FIRST FLOOR</p>
        <h2>Erase what you can</h2>
        <p class="muted">No word has been drawn yet. Choose every letter to purge before the run begins.</p>
      </section>`;
    case 'round':
      return `<section class="board-panel">${renderBoard(phase.board)}</section>`;
    case 'summary':
      return renderSummary(view, phase);
    case 'reward':
      return renderReward(phase);
    case 'bossIntro':
      return renderBossIntro(view, phase);
    case 'curse':
      return renderCurse(phase);
    case 'shop':
      return renderShop(view, phase);
    case 'shopChoice':
      return renderShopChoice();
    case 'happening':
      return renderHappening(phase);
    case 'over':
      return renderOver(phase);
    default:
      return '';
  }
}

function renderPauseOverlay(view: RunView): string {
  const clocked = view.curses.some((curse) => curse.id === 'clock');
  const title = clocked ? 'The clock is stopped' : 'Nothing is moving';
  const body = clocked
    ? 'Take your time. Nothing moves until you come back.'
    : 'Take a breath. The list can wait.';
  return `
  <div class="pause-overlay">
    <div class="pause-card">
      <span class="pause-icon" aria-hidden="true">⏸</span>
      <p class="panel-kicker">PAUSED</p>
      <h2>${title}</h2>
      <p class="muted">${body}</p>
      <div class="pause-actions">
        <button class="btn primary big" data-action="unpause">RESUME</button>
        <button class="btn ghost" data-action="help">RULES</button>
      </div>
      <div class="pause-chronicle">
        <div class="panel-head">
          <span class="panel-kicker">CHRONICLE</span>
          <span class="count">${chronicleEntries.length}</span>
        </div>
        ${renderChronicle()}
      </div>
      <p class="hint">Space or Esc also resumes.</p>
    </div>
  </div>`;
}

function renderRun(view: RunView): string {
  const phase = view.phase;
  const bossId = phase.kind === 'round' || phase.kind === 'summary' || phase.kind === 'bossIntro'
    ? phase.boss
    : undefined;
  const over = phase.kind === 'over';
  const tense =
    phase.kind === 'round' &&
    phase.board.remainingMs !== null &&
    phase.board.remainingMs > 0 &&
    phase.board.remainingMs <= 15_000;

  return `
  <div class="shell ${shake ? 'shake' : ''} ${tense ? 'tense' : ''}">
    ${tense ? `<div class="danger-vignette" aria-hidden="true"></div>` : ''}
    ${renderTopbar(view)}
    ${over
      ? `<main class="over-layout">${phasePanel(view)}</main>`
      : `<main class="layout">
          <div class="rail-column">
            ${phase.kind === 'shop'
              ? `${renderShopRail(view)}${renderItemsPanel(view)}`
              : phase.kind === 'curse'
                ? `${renderCurseRail(view)}${renderItemsPanel(view)}`
                : `${renderBattleRail(view, bossId)}${renderItemsPanel(view)}`}
          </div>
          <section class="center-column">${phasePanel(view)}</section>
          ${renderSidePanel(view)}
        </main>`}
    ${damageTutorialOpen && !over ? renderDamageTutorial() : ''}
    ${renderPurgeModal(view)}
    ${renderCurseRemovalModal(view)}
    ${paused && !over ? renderPauseOverlay(view) : ''}
  </div>`;
}

function syncMetaUnlocks(): void {
  const meta = readMeta();
  const unlocked = [
    (meta.foodCounts['double-cheeseburger'] ?? 0) >= 3 ? 'gourmand' : null,
    meta.purgedCount >= 6 ? 'purgamist' : null,
    (meta.purchases.necronomicon ?? 0) >= 1 ? 'necromancer' : null,
  ].filter((id): id is string => Boolean(id));
  for (const id of unlocked) {
    if (unlockCharacter(id)) queueCharacterUnlock(id);
  }
}

syncMetaUnlocks();
render();
trackGameLoaded(hasSave(), readMeta().runs);
