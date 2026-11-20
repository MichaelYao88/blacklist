import { game, CoreHost } from '../game';
import type {
  BoardView,
  Command,
  GameEvent,
  ItemView,
  Offer,
  PhaseView,
  RunView,
  SpellView,
} from '../game';
import {
  BOSS_BY_ID,
  CURSE_BY_ID,
  FOOD_BY_ID,
  HAPPENING_BY_ID,
  ITEM_BY_ID,
  SPELL_BY_ID,
} from '../content';
import { LocalStore, hasSave, readMeta, recordRun, recordStart } from './store';
import { escapeHtml, formatTime, reasonText, roman } from './format';
import { glossaryText } from './glossary';
import {
  bossColor,
  enemyArt,
  enemySprite,
  foodIcon,
  itemIcon,
  spellIcon,
} from './icons';
import runnerWalk from '../assets/sprites/runner-walk.png';
import runnerAttack from '../assets/sprites/runner-attack.png';
import orcWalk from '../assets/sprites/orc-walk.png';
import orcAttack from '../assets/sprites/orc-attack.png';
import orcDeath from '../assets/sprites/orc-death.png';
import runnerDeath from '../assets/sprites/runner-death.png';
import { sfx } from './audio';
import { music } from './music';
import { ASCENSION_MAX, ascensionSummary } from '../core/ascension';

const app = document.getElementById('app');
if (!app) throw new Error('Missing #app root');

// Damage feedback lives outside the main render tree so unrelated re-renders
// (timer ticks, shake cleanup) cannot restart its animation mid-flight.
const fxRoot = document.createElement('div');
fxRoot.id = 'fx-root';
document.body.appendChild(fxRoot);

// Phone a Friend spams his chosen words behind the rest of the UI.
const phraseRoot = document.createElement('div');
phraseRoot.id = 'phrase-root';
document.body.appendChild(phraseRoot);

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
const COUNTDOWN_MS = 2_400;
let selectedAscension = 0;

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
  damageSeq += 1;
  damageFx = { id: damageSeq, hpLost, armorSpent, incoming, at: performance.now() };
  shake = hpLost > 0;
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

function processEvents(events: GameEvent[]): void {
  let playerGuessed = false;
  let playerFreeGuess = false;
  let solvedByPlayer = false;
  let playerDied = false;
  for (const event of events) {
    logGameEvent(event);
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
    if (event.type === 'message') notify(event.text, 'info');
    if (event.type === 'spellCast') showSpellPopup(event.spell.id, Boolean(event.auto));
    if (event.type === 'itemProc') showProc(event.item, event.text);
    if (event.type === 'happeningResolved') notify(event.text, event.success ? 'good' : 'bad');
    if (event.type === 'damageTaken') {
      if (event.hp <= 0) playerDied = true;
      if (event.dealt > 0 || event.armorUsed > 0) {
        flashDamage(event.dealt, event.armorUsed, event.incoming);
        sfx.play(event.dealt > 0 ? 'hit' : 'armor');
      } else if (event.incoming > 0) {
        flashDamage(0, 0, event.incoming);
        sfx.play('block');
      }
    }
    if (event.type === 'guessScored' && event.by === 'player') {
      playerGuessed = true;
      if (event.free) playerFreeGuess = true;
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
    }
  }

  if (playerDied) {
    triggerArenaAttack('enemy');
  } else if (playerGuessed) {
    triggerArenaAttack(playerFreeGuess || solvedByPlayer ? 'player' : undefined);
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

function startNewRun(): void {
  if (hasSave() && !host.current?.over) {
    const ok = window.confirm('Start a new run? Your active run will be lost.');
    if (!ok) return;
  }
  const seed = `bl-${Date.now().toString(36)}-${Math.floor(Math.random() * 1_000_000).toString(36)}`;
  const events = host.start(seed, selectedAscension);
  music.beginRun();
  recordStart();
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
  clearProcFeed();
  clearSpellPopups();
  clearChronicle();
  heartbeatSecond = -1;
  processEvents(events);
  lastTick = performance.now();
  render();
}

function resumeRun(): void {
  host.resume();
  if (!host.hasRun) {
    notify('No active run found.', 'bad');
    render();
    return;
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
  clearProcFeed();
  clearSpellPopups();
  clearChronicle();
  logChronicle('info', 'Run resumed');
  heartbeatSecond = -1;
  countdownUntil = 0;
  music.resume();
  lastTick = performance.now();
  render();
}

function addLetter(letter: string): void {
  if (screen !== 'run') return;
  const view = host.view();
  if (!view || view.phase.kind !== 'round' || view.pendingPurge > 0) return;
  if (view.purged.includes(letter.toLowerCase())) return;
  if (input.length >= 5) return;
  input += letter.toLowerCase();
  render();
}

function submitGuess(): void {
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
      startNewRun();
      break;
    case 'ascension':
      selectedAscension = Math.max(0, Math.min(ASCENSION_MAX, Number(target.dataset.level) || 0));
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
      screen = host.hasRun ? 'run' : 'title';
      paused = false;
      lastTick = performance.now();
      render();
      break;
    case 'title':
      screen = 'title';
      lastTick = performance.now();
      render();
      break;
    case 'abandon': {
      if (!window.confirm('Abandon this run? The save will be wiped.')) return;
      host.discard();
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
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const view = host.view();
  if (!view) return;

  if (event.key === 'Escape' || event.key === ' ') {
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

  if (view.pendingPurge > 0) {
    if (/^[a-z]$/i.test(event.key)) {
      event.preventDefault();
      dispatchCommand({ type: 'purgeLetter', letter: event.key.toLowerCase() });
    }
    return;
  }

  if (view.phase.kind !== 'round') return;
  if (/^[a-z]$/i.test(event.key)) {
    event.preventDefault();
    addLetter(event.key);
  } else if (event.key === 'Backspace') {
    event.preventDefault();
    input = input.slice(0, -1);
    render();
  } else if (event.key === 'Enter') {
    event.preventDefault();
    submitGuess();
  }
});

window.setInterval(() => {
  const now = performance.now();
  const dt = now - lastTick;
  lastTick = now;
  if (screen !== 'run' || document.hidden || paused) return;
  const view = host.view();
  if (!view || view.phase.kind !== 'round') {
    heartbeatSecond = -1;
    return;
  }
  // The clock does not start until the countdown ends.
  if (now < countdownUntil) {
    render();
    return;
  }
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

  const quickdraw = view.items.some((item) => item.id === 'quickdraw' && item.equipped);
  const headStart = view.items.some((item) => item.id === 'head-start' && item.equipped);
  const total = quickdraw ? 12_000 : headStart ? 8_000 : Math.max(1_000, left);
  const label = quickdraw ? 'Quickdraw!' : headStart ? 'Head Start!' : 'Opening Shield!';

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

// ── keyword tooltips ───────────────────────────────────────────────────────

let tipEl: HTMLDivElement | null = null;
let tipTarget: HTMLElement | null = null;

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
    ${ascensionPicker}
    <div class="title-facts">
      <div><b>50</b><span>levels</span></div>
      <div><b>2</b><span>curse choices</span></div>
      <div><b>3</b><span>base damage</span></div>
      <div><b>1</b><span>free guess</span></div>
    </div>
    ${metaLine}
    <p class="title-foot">BLACKLIST · v0.1 · a pure-core word roguelike</p>
  </div>`;
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
        <p>Fifty levels. The loop is <b>round → event chance → shop</b>, then <b>round → event chance → curse</b>. Levels 47–49 are curse floors, and level 50 is the final boss. You must choose one of two curses every time a curse is offered.</p>
      </article>
      <article class="rule-card">
        <h3>Damage</h3>
        <p>Your first guess each round is free. Wrong paid guesses take <b>3 damage</b> before curses. Damage never grows with level; only curses change it. A correct guess never hurts you.</p>
      </article>
      <article class="rule-card">
        <h3>Armor</h3>
        <p>Armor is a pool of damage reduction. Each point soaks one point of an incoming hit before HP is touched. The pool refills at the start of every round. If the clock reaches zero, the run ends regardless of armor.</p>
      </article>
      <article class="rule-card">
        <h3>The clock</h3>
        <p>There is no clock until you take <b>The Clock</b> curse. The first stack gives 5:00; each later stack cuts 40%. Reveal-time items show a count-up timer, while clock rounds show a count-down. If the clock reaches zero, the run ends immediately.</p>
      </article>
      <article class="rule-card">
        <h3>Curses</h3>
        <p>Curses are permanent rules. Vision curses hide tiles or letters; others change damage, shops, healing, slots, HP, gold or the clock. Some stack; boolean vision curses are one copy each. <b>Tally Lens</b> reveals correct/misplaced counts after the first vision curse.</p>
      </article>
      <article class="rule-card">
        <h3>Items & spells</h3>
        <p>Items work only while equipped. Spells stack. <b>Time Warp is gone</b>; Time Freeze stops the clock, or makes the next guess free when there is no clock. Time-based foods and remaining-time items are gated until The Clock is taken.</p>
      </article>
      <article class="rule-card">
        <h3>Ascension</h3>
        <p>Ascension only adds starting curses. A1 drafts one curse before level 1; A2 drafts two.</p>
      </article>
      <article class="rule-card">
        <h3>Controls</h3>
        <p>Type letters, <b>Backspace</b> to delete, <b>Enter</b> to submit. <b>Space</b> or <b>Esc</b> pauses. Click the <b>MUSIC</b> name to cycle tracks; the mute button is separate. More Power only plays for the final boss.</p>
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
  const favorites = topEntries(meta.itemCounts);
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
        <p class="panel-kicker">MOST EQUIPPED</p>
        ${favorites.length
          ? `<ol class="favorite-list">${favorites.map(([id, count]) => `<li><span>${escapeHtml(ITEM_BY_ID.get(id)?.name ?? id)}</span><b>${count}</b></li>`).join('')}</ol>`
          : `<p class="empty-note">No completed runs yet.</p>`}
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
      <div class="chip-stat gold" title="Gold">¤ <b>${view.gold}</b></div>
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
                  : 'THE LIST';
}

function damageOverlayHtml(): string {
  if (!damageFx) return '';
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
  const value = safe ? 0 : board.rawNextGuessDamage;
  return `<div class="guess-damage ${safe ? 'safe' : ''}" title="Damage a wrong guess deals once your free guesses and shield are gone.">
    <span>WRONG GUESS</span>
    <b>${safe ? 'FREE' : `${value} damage`}</b>
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
  return `<div class="timer ${urgent ? 'urgent' : ''} ${board.timerFrozen ? 'frozen' : ''}" title="${countUp ? 'No clock limit. Time is shown because an equipped item cares about it.' : 'When this reaches zero the run ends.'}">
    <span class="timer-label">${label}</span>
    <b>${time}</b>
    <div class="timer-bar"><i style="width:${pct}%"></i></div>
  </div>`;
}

function renderBattleRail(view: RunView, bossId?: string): string {
  const phase = view.phase;
  const enemy = arenaEnemy(view, bossId);
  const board = phase.kind === 'round' ? phase.board : null;
  const stateEntries = board ? Object.entries(board.bossState) : [];
  const pct = Math.max(0, Math.min(100, (view.hp / Math.max(1, view.maxHp)) * 100));
  const armorPct = Math.max(0, Math.min(100, (view.armor / Math.max(1, view.maxArmor)) * 100));
  const low = view.hp <= view.maxHp * 0.3;
  const hit = Boolean(damageFx && damageFx.hpLost > 0 && performance.now() - damageFx.at < 600);
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
  const facts = board
    ? [
        `<span class="fact">FREE ${board.freeGuessesLeft}</span>`,
        board.shielded ? `<span class="fact shield">SHIELD ${formatTime(board.shieldMsLeft)}</span>` : '',
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
              class="character-sprite runner ${playerAttacking ? 'attacking' : ''}"
              role="img"
              aria-label="The Runner"
              style="--walk:url('${runnerWalk}');--attack:url('${runnerAttack}');--walk-delay:${walkDelay}ms;--attack-delay:-${attackElapsed}ms"
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
      <div class="mini-player">
        <div class="fighter-head">
          <span class="fighter-name">THE RUNNER</span>
          <b class="hp-numbers">${view.hp}<em>/${view.maxHp}</em></b>
        </div>
        <div class="big-hp" role="progressbar" aria-label="HP" aria-valuemin="0" aria-valuemax="${view.maxHp}" aria-valuenow="${view.hp}">
          <i style="width:${pct}%"></i>
          <span class="hp-gloss"></span>
        </div>
        <div class="armor-line" title="Armor soaks damage point-for-point before HP. It refills each round. Running out of time ends the run.">
          <span class="armor-bar" role="progressbar" aria-label="Armor" aria-valuemin="0" aria-valuemax="${view.maxArmor}" aria-valuenow="${view.armor}">
            <i style="width:${armorPct}%"></i>
          </span>
          <span class="armor-text">ARMOR ${view.armor}/${view.maxArmor}</span>
        </div>
      </div>
    </section>
    ${facts ? `<div class="mini-facts">${facts}</div>` : ''}
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
    ${(view.revealed.length || view.purged.length) ? `<section>
      ${view.revealed.length ? `<div class="revealed">
        <span class="panel-kicker">${view.phase.kind === 'round' || view.phase.kind === 'summary' ? 'REVEALED THIS PUZZLE' : 'REVEALED'}</span>
        <div>${view.revealed.map(({ letter, status }) => `<span class="reveal-chip ${status}"><b>${escapeHtml(letter.toUpperCase())}</b><em>${status === 'present' ? 'IN WORD' : 'RULED OUT'}</em></span>`).join('')}</div>
      </div>` : ''}
      ${view.purged.length ? `<div class="purged"><span class="panel-kicker">PURGED</span><div>${view.purged.map((letter) => `<span class="letter-chip">${escapeHtml(letter.toUpperCase())}</span>`).join('')}</div></div>` : ''}
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
    .filter(([key, value]) => value !== 0 && !key.startsWith('_') && key !== 'used')
    .map(([key, value]) => `<span class="data-chip">${escapeHtml(key)} ${value}</span>`)
    .join('');
  const spent = def?.initial?.used !== undefined && (item.data.used ?? 0) > 0;
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
      <span class="tag">${rarity}</span>
    </div>
    <p>${glossaryText(description)}</p>
    ${data ? `<div class="data-row">${data}</div>` : ''}
    ${!item.equipped && item.slots > 0 ? `<p class="bag-note">In the bag. Equip it in a shop.</p>` : ''}
    ${usable ? `<button class="btn tiny" data-action="use" data-id="${escapeHtml(item.instance)}">USE</button>` : ''}
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
  for (let index = 0; index < totalRows; index++) {
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
      const title = status === 'hidden'
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
  const title = phase.outcome === 'solved' ? 'SOLVED' : phase.outcome === 'timeout' ? "TIME'S UP" : 'YOU DIED';
  const answers = phase.answers && phase.answers.length > 1
    ? `<div class="answer-list">${phase.answers.map((answer) => `<span>${escapeHtml(answer.toUpperCase())}</span>`).join('')}</div>`
    : '';
  return `
  <div class="phase-card summary ${phase.outcome}">
    <p class="panel-kicker">${boss ? `BOSS · ${escapeHtml(boss.name)}` : 'ROUND OVER'}</p>
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
      ? boss
        ? 'The final boss is down. Continue to finish the run.'
        : 'The round is clear. Choose a reward and keep moving.'
      : phase.outcome === 'timeout'
        ? 'The clock took its cut, but the encounter still paid. No reward this time. The run continues if you do.'
        : 'The run is over. The save is gone.'}</p>
    ${phase.outcome !== 'died' ? `<button class="btn primary big" data-action="continue">${phase.rewardPending ? 'CLAIM REWARD →' : 'NEXT NODE →'}</button>` : ''}
  </div>`;
}

function renderReward(phase: Extract<PhaseView, { kind: 'reward' }>): string {
  const boss = phase.boss;
  return `
  <div class="phase-card reward ${boss ? 'boss-reward' : ''}">
    <p class="panel-kicker">${boss ? 'BOSS RELIC' : 'REWARD'}</p>
    <h2>${boss ? 'Claim a relic' : 'Take one'}</h2>
    <p class="muted">${boss
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
              : '¤';
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
  return `
  <div class="phase-card curse-draft">
    <p class="panel-kicker">${phase.starting ? 'STARTING CURSE' : 'CURSE DRAFT'}</p>
    <h2>Choose a burden</h2>
    <p class="muted">Every curse here affects every future encounter. You must take one.</p>
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

function renderShopChoice(phase: Extract<PhaseView, { kind: 'shopChoice' }>): string {
  const rest = phase.heal > 0
    ? `Recover ${phase.heal} HP and leave at full health. The shop closes.`
    : 'You are already at full health. Resting moves on.';
  return `
  <div class="phase-card shop-choice">
    <p class="panel-kicker">A LIGHT IN THE ROAD</p>
    <h2>Shop or rest?</h2>
    <p class="muted">A merchant has set out a stall beside an inn. You only have time for one.</p>
    <div class="shop-choice-grid">
      <button class="shop-choice-card" data-action="choose" data-id="shop">
        <span class="choice-glyph" aria-hidden="true">🛒</span>
        <b>Shop</b>
        <span>Spend gold on items, food, and spells. Rerolls start at 1g.</span>
      </button>
      <button class="shop-choice-card" data-action="choose" data-id="inn">
        <span class="choice-glyph" aria-hidden="true">🛏️</span>
        <b>Inn</b>
        <span>${rest}</span>
      </button>
    </div>
    <p class="hint">The inn heals you to full. The shop does not.</p>
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
    <div class="shop-head">
      <div>
        <p class="panel-kicker">SHOP</p>
        <h2>Spend it or lose it</h2>
      </div>
      <div class="chip-stat gold">¤ <b>${view.gold}</b></div>
    </div>
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
    <div class="option-list">
      ${phase.options.map((option) => `
        <article class="happening-option ${resolved ? 'resolved' : ''} ${option.locked ? 'locked' : ''}">
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
          <button class="btn" data-action="choose" data-id="${escapeHtml(option.id)}" ${resolved || option.locked ? 'disabled' : ''}>CHOOSE</button>
        </article>`).join('')}
    </div>
    ${resolved ? `<div class="resolution ${resolved.success ? 'good' : 'bad'}">${escapeHtml(resolved.text)}</div><button class="btn primary big" data-action="continue">CONTINUE →</button>` : ''}
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
  const deathElapsed = playerDeathStartedAt === null ? DEATH_MS : performance.now() - playerDeathStartedAt;
  const deathDelay = -Math.max(0, Math.min(deathElapsed, DEATH_MS));
  const defeatFighter = victory
    ? ''
    : `<div class="over-fighter" aria-hidden="true">
        <i class="character-sprite runner dead" style="--death:url('${runnerDeath}');--death-delay:${deathDelay}ms"></i>
      </div>`;
  return `
  <div class="over-screen ${victory ? 'victory' : 'defeat'}">
    ${defeatFighter}
    <p class="kicker">RUN OVER</p>
    <h1>${victory ? 'THE LIST IS YOURS' : 'THE LIST CLOSES'}</h1>
    <p class="tagline">${victory
      ? 'Fifty levels. Every curse. The words you gave up are the ones that carried you.'
      : 'The word that ended you is written below. It will not be so kind next time.'}</p>
    ${ascNote ? `<p class="ascension-result">${ascNote}</p>` : ''}
    ${reveal}
    <div class="stats-grid">
      <div><b>${stats.rounds}</b><span>rounds</span></div>
      <div><b>${stats.guesses}</b><span>guesses</span></div>
      <div><b>${stats.bosses}</b><span>final boss</span></div>
      <div><b>${stats.goldEarned}</b><span>gold earned</span></div>
      <div><b>${stats.damageTaken}</b><span>damage taken</span></div>
      <div><b>${stats.timeouts}</b><span>timeouts</span></div>
    </div>
    ${equipped.length > 0 ? `<div class="over-loadout">
      <span class="over-answer-label">EQUIPPED AT THE END</span>
      <div>${equipped.map((entry) => `<span tabindex="0" data-tip="${escapeHtml(entry.tip)}">${escapeHtml(entry.name)}</span>`).join('')}</div>
    </div>` : ''}
    <div class="over-actions">
      <button class="btn primary big" data-action="new-run">NEW RUN</button>
      <button class="btn ghost big" data-action="stats">STATS</button>
      <button class="btn ghost big" data-action="title">TITLE</button>
    </div>
    <p class="hint">The active save was deleted. Meta record remains.</p>
  </div>`;
}

function renderPurgeModal(view: RunView): string {
  if (view.pendingPurge <= 0) return '';
  const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');
  return `
  <div class="modal">
    <div class="modal-card">
      <p class="panel-kicker">LETTER PURGE</p>
      <h2>Erase a letter</h2>
      <p class="muted">The letter will never appear in a future answer, and you can never guess it again. Choose carefully. If a purge would leave no legal words, a random purged letter is restored.</p>
      <div class="purge-grid">
        ${letters.map((letter) => `<button class="purge-key ${view.purged.includes(letter) ? 'used' : ''}" data-action="purge" data-letter="${letter}" ${view.purged.includes(letter) ? 'disabled' : ''}>${letter.toUpperCase()}</button>`).join('')}
      </div>
      <p class="hint">${view.pendingPurge} purge${view.pendingPurge === 1 ? '' : 's'} pending. The clock is paused while this is open.</p>
    </div>
  </div>`;
}

function renderBossIntro(view: RunView, phase: Extract<PhaseView, { kind: 'bossIntro' }>): string {
  const boss = BOSS_BY_ID.get(phase.boss);
  if (!boss) return '';
  const timer = boss.timerFromCurse ? 'CURSED CLOCK' : boss.timerMs === null ? 'NO TIMER' : formatTime(boss.timerMs);
  const damage = boss.noGuessDamage
    ? 'NO GUESS DAMAGE'
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
      <span>${boss.gauntlet ? `${boss.gauntlet.puzzles} PUZZLES` : 'ONE WORD'}</span>
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
      return renderShopChoice(phase);
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
  const now = performance.now();
  const count = phase.kind === 'round' && !paused && now < countdownUntil
    ? Math.max(1, Math.ceil((countdownUntil - now) / 800))
    : 0;

  return `
  <div class="shell ${shake ? 'shake' : ''} ${tense ? 'tense' : ''}">
    ${tense ? `<div class="danger-vignette" aria-hidden="true"></div>` : ''}
    ${renderTopbar(view)}
    ${over
      ? `<main class="over-layout">${phasePanel(view)}</main>`
      : `<main class="layout">
          <div class="rail-column">
            ${renderBattleRail(view, bossId)}
            ${renderItemsPanel(view)}
          </div>
          <section class="center-column">${phasePanel(view)}</section>
          ${renderSidePanel(view)}
        </main>`}
    ${renderPurgeModal(view)}
    ${renderCurseRemovalModal(view)}
    ${count > 0 ? `<div class="countdown-overlay" aria-live="assertive">
        <div class="countdown-card">
          <span class="countdown-kicker">LEVEL ${view.level}</span>
          <b class="countdown-number" data-count="${count}">${count}</b>
          <span class="countdown-label">READ THE LIST</span>
        </div>
      </div>` : ''}
    ${paused && !over ? renderPauseOverlay(view) : ''}
  </div>`;
}

render();
