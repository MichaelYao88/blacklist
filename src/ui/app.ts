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
  FOOD_BY_ID,
  HAPPENING_BY_ID,
  ITEM_BY_ID,
  SPELL_BY_ID,
  UPGRADE_BY_ID,
} from '../content';
import { LocalStore, hasSave, readMeta, recordOutcome, recordStart } from './store';
import { describeEvent, escapeHtml, formatTime, reasonText, roman } from './format';

const app = document.getElementById('app');
if (!app) throw new Error('Missing #app root');

const host = new CoreHost({ core: game, store: new LocalStore() });

type Screen = 'title' | 'run' | 'help';
interface Notice {
  text: string;
  kind: 'info' | 'good' | 'bad';
}
interface ChronicleLine {
  text: string;
  kind: 'info' | 'good' | 'bad';
}

let screen: Screen = 'title';
let input = '';
let notice: Notice | null = null;
let noticeTimer: number | undefined;
let chronicle: ChronicleLine[] = [];
let shake = false;
let shakeTimer: number | undefined;
let lastTick = performance.now();

const SIGILS: Record<string, string> = {
  editor: '✎',
  sleeper: '☾',
  censor: '▣',
  auditor: '∑',
  'vowel-fog': '◌',
  monochrome: '◐',
  gauntlet: '⟳',
};

const KIND_LABELS: Record<Offer['kind'], string> = {
  item: 'ITEM',
  spell: 'SPELL',
  eat: 'FOOD',
  upgrade: 'UPGRADE',
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

function flashDamage(): void {
  shake = true;
  if (shakeTimer) window.clearTimeout(shakeTimer);
  shakeTimer = window.setTimeout(() => {
    shake = false;
    render();
  }, 320);
}

function eventKind(event: GameEvent): ChronicleLine['kind'] {
  if (
    event.type === 'damageTaken' ||
    event.type === 'timeExpired' ||
    event.type === 'runEnded'
  ) {
    if (event.type === 'runEnded' && event.result === 'victory') return 'good';
    if (event.type === 'damageTaken' && event.dealt === 0) return 'info';
    return 'bad';
  }
  if (
    event.type === 'healed' ||
    event.type === 'goldChanged' ||
    event.type === 'puzzleSolved' ||
    event.type === 'rewardChosen' ||
    event.type === 'spellGained' ||
    event.type === 'itemAcquired'
  ) {
    return 'good';
  }
  return 'info';
}

function processEvents(events: GameEvent[]): void {
  for (const event of events) {
    const text = describeEvent(event);
    if (text) chronicle.unshift({ text, kind: eventKind(event) });
    chronicle = chronicle.slice(0, 50);

    if (event.type === 'guessRejected') notify(reasonText(event.reason), 'bad');
    if (event.type === 'shopRejected') notify(event.reason, 'bad');
    if (event.type === 'spellRejected') notify(event.reason, 'bad');
    if (event.type === 'message') notify(event.text, 'info');
    if (event.type === 'happeningResolved') notify(event.text, event.success ? 'good' : 'bad');
    if (event.type === 'damageTaken' && event.dealt > 0) flashDamage();
    if (event.type === 'timeExpired') notify("TIME'S UP", 'bad');
    if (event.type === 'puzzleSolved') notify(`Puzzle ${event.index}/${event.total} solved`, 'good');
    if (event.type === 'runEnded') {
      const view = host.view();
      recordOutcome(event.result, view?.act ?? 0);
      notify(
        event.result === 'victory' ? 'THE LIST IS YOURS' : 'THE LIST CLOSES',
        event.result === 'victory' ? 'good' : 'bad',
      );
    }
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
  const events = host.start(seed);
  recordStart();
  screen = 'run';
  input = '';
  chronicle = [];
  notice = null;
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
  chronicle = [{ text: 'Active run restored.', kind: 'info' }];
  notice = null;
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

app.addEventListener('click', (event) => {
  const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-action]');
  if (!target) return;
  event.preventDefault();
  const action = target.dataset.action;
  switch (action) {
    case 'new-run':
      startNewRun();
      break;
    case 'resume':
      resumeRun();
      break;
    case 'help':
      screen = 'help';
      render();
      break;
    case 'back':
      screen = host.hasRun ? 'run' : 'title';
      render();
      break;
    case 'title':
      screen = 'title';
      render();
      break;
    case 'abandon': {
      if (!window.confirm('Abandon this run? The save will be wiped.')) return;
      host.discard();
      screen = 'title';
      chronicle = [];
      input = '';
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
    case 'choose':
      dispatchCommand({ type: 'choose', optionId: target.dataset.id ?? '' });
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

window.addEventListener('keydown', (event) => {
  if (screen !== 'run') return;
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const view = host.view();
  if (!view) return;

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
  if (screen !== 'run' || document.hidden) return;
  const view = host.view();
  if (!view || view.phase.kind !== 'round') return;
  if (view.pendingPurge > 0) return;
  const events = host.dispatch({ type: 'tick', dtMs: dt });
  if (events.length > 0) processEvents(events);
  render();
}, 1_000);

// ── rendering ──────────────────────────────────────────────────────────────

function render(): void {
  const view = host.view();
  if (screen === 'run' && !view) screen = 'title';

  if (screen === 'title') {
    app!.innerHTML = renderTitle();
  } else if (screen === 'help') {
    app!.innerHTML = renderHelp();
  } else {
    app!.innerHTML = renderRun(view as RunView);
  }
  app!.insertAdjacentHTML('beforeend', noticeHtml());
}

function noticeHtml(): string {
  if (!notice) return '';
  return `<div class="toast ${notice.kind}">${escapeHtml(notice.text)}</div>`;
}

function renderTitle(): string {
  const meta = readMeta();
  const saved = hasSave();
  const metaLine = meta.runs > 0
    ? `<p class="meta-line">${meta.wins} win${meta.wins === 1 ? '' : 's'} · ${meta.runs} run${meta.runs === 1 ? '' : 's'} · furthest Act ${roman(Math.max(1, meta.bestAct))}</p>`
    : `<p class="meta-line">A fresh list. Nothing written yet.</p>`;

  return `
  <div class="title-screen">
    <div class="title-mark" aria-hidden="true">
      <span class="ring r1"></span>
      <span class="ring r2"></span>
      <span class="ring r3"></span>
      <span class="mark-letter">B</span>
    </div>
    <p class="kicker">A WORD ROGUELIKE</p>
    <h1 class="logo">BLACK<span>LIST</span></h1>
    <p class="tagline">Every word you guess is a word you can never guess again.</p>
    <div class="title-actions">
      <button class="btn primary big" data-action="new-run">NEW RUN</button>
      ${saved ? `<button class="btn big" data-action="resume">CONTINUE</button>` : ''}
      <button class="btn ghost big" data-action="help">HOW TO PLAY</button>
    </div>
    <div class="title-facts">
      <div><b>3</b><span>acts</span></div>
      <div><b>16</b><span>blacklist slots</span></div>
      <div><b>6</b><span>bosses</span></div>
      <div><b>2</b><span>free guesses</span></div>
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
      <p class="tagline">Solve the word. Pay for every guess past the first two. Do not run out of time or health.</p>
    </div>
    <div class="rules-grid">
      <article class="rule-card">
        <h3>The blacklist</h3>
        <p>Every word you enter is added to a 16-word blacklist. You can never guess those words again. When the list is full, the oldest word is evicted. The answer is always picked from words that are not on the list.</p>
      </article>
      <article class="rule-card">
        <h3>Damage</h3>
        <p>Your first <b>2 guesses</b> each round are free. After that, a guess costs <b>1 + act</b> damage, plus 1 for each paid guess you already made. Solving the word does not make the bill disappear.</p>
      </article>
      <article class="rule-card">
        <h3>Armor</h3>
        <p>Armor is a charge, not a percentage. One charge absorbs an entire damage event — even a boss hit. Charges refill at the start of every round. Timeout damage ignores armor.</p>
      </article>
      <article class="rule-card">
        <h3>The clock</h3>
        <p>Normal rounds start generous and get shorter as you clear rounds. If the clock reaches zero, you take <b>35% of max HP + 5</b> and the round ends. Bosses have no timer. The Gauntlet is the exception: three puzzles, one shared 150-second clock.</p>
      </article>
      <article class="rule-card">
        <h3>Items & spells</h3>
        <p>Items take slots unless they are food or consumables. Spells take no slots and are one-use. Some items grow stronger as you solve, eat, cast, or hold them. Some items hand you spells when a condition is met.</p>
      </article>
      <article class="rule-card">
        <h3>Bosses</h3>
        <p>Each act ends with a boss that changes how much of the board you are allowed to see. The Editor hides suffixes. The Censor uses the hardest answers. The Gauntlet asks for three solves on one clock.</p>
      </article>
      <article class="rule-card">
        <h3>The run</h3>
        <p>Three acts. Five nodes per act: two rounds, a shop or happening, another round, then a boss. Solve a round to pick one of three rewards. Defeat wipes the save. Victory keeps your meta record.</p>
      </article>
      <article class="rule-card">
        <h3>Controls</h3>
        <p>Type letters, <b>Backspace</b> to delete, <b>Enter</b> to submit. You can also click the on-screen keyboard. Spells and usable items are on the right. The purge modal accepts any letter.</p>
      </article>
    </div>
    <div class="help-actions">
      <button class="btn primary" data-action="back">GOT IT</button>
    </div>
  </div>`;
}

function renderTopbar(view: RunView): string {
  const hpPct = Math.max(0, Math.min(100, (view.hp / Math.max(1, view.maxHp)) * 100));
  const low = view.hp <= view.maxHp * 0.3;
  return `
  <header class="topbar">
    <div class="brand">BLACKLIST</div>
    <div class="top-stats">
      <div class="hp-stat ${low ? 'low' : ''}" title="Hit points">
        <span class="stat-label">HP</span>
        <div class="hp-bar"><i style="width:${hpPct}%"></i></div>
        <b>${view.hp}/${view.maxHp}</b>
      </div>
      <div class="chip-stat" title="Armor charges">◈ <b>${view.armor}</b><span>/${view.maxArmor}</span></div>
      <div class="chip-stat gold" title="Gold">¤ <b>${view.gold}</b></div>
      <div class="chip-stat" title="Act">ACT ${roman(view.act + 1)}</div>
    </div>
    <div class="top-actions">
      <button class="btn tiny ghost" data-action="help">RULES</button>
      <button class="btn tiny danger" data-action="abandon">ABANDON</button>
    </div>
  </header>`;
}

function renderPath(view: RunView): string {
  const chips = view.nodes.map((node, index) => {
    const done = index < view.nodeIndex;
    const current = index === view.nodeIndex;
    const boss = node.boss ? BOSS_BY_ID.get(node.boss) : undefined;
    const icon = node.kind === 'boss' ? '☠' : node.kind === 'shop' ? '$' : node.kind === 'happening' ? '?' : '•';
    const label = boss ? boss.name : node.kind === 'round' ? 'Round' : node.kind === 'shop' ? 'Shop' : 'Happening';
    const classes = ['path-chip', node.kind, done ? 'done' : '', current ? 'current' : ''].filter(Boolean).join(' ');
    return `<span class="${classes}" title="Act ${Math.floor(index / 5) + 1} · ${escapeHtml(label)}">
      <i>${icon}</i><em>${index + 1}</em>
    </span>`;
  }).join('');
  return `<nav class="path" aria-label="Run path"><span class="path-label">PATH</span>${chips}</nav>`;
}

function renderBossPanel(view: RunView, bossId?: string): string {
  const board = view.phase.kind === 'round' ? view.phase.board : null;
  const boss = bossId ? BOSS_BY_ID.get(bossId) : undefined;
  const stateEntries = board ? Object.entries(board.bossState) : [];

  if (!boss) {
    return `
    <aside class="panel boss-panel empty">
      <p class="panel-kicker">THE OPPOSITION</p>
      <div class="boss-sigil">·</div>
      <h2>Act ${roman(view.act + 1)}</h2>
      <p class="muted">The next word is already waiting. No boss in this node.</p>
      <div class="seedline">SEED ${escapeHtml(host.current?.seed ?? '')}</div>
    </aside>`;
  }

  return `
  <aside class="panel boss-panel">
    <p class="panel-kicker">THE OPPOSITION</p>
    <div class="boss-sigil">${SIGILS[boss.id] ?? '☠'}</div>
    <h2>${escapeHtml(boss.name)}</h2>
    <p class="muted">${escapeHtml(boss.description)}</p>
    ${stateEntries.length > 0 ? `<div class="boss-state">${stateEntries.map(([key, value]) => `<span>${escapeHtml(key) === 'woke' ? (value ? 'AWAKE' : 'ASLEEP') : `${escapeHtml(key)} ${value}`}</span>`).join('')}</div>` : ''}
    <div class="seedline">SEED ${escapeHtml(host.current?.seed ?? '')}</div>
  </aside>`;
}

function renderSidePanel(view: RunView): string {
  const items = view.items.length
    ? view.items.map((item) => renderItem(view, item)).join('')
    : `<p class="empty-note">No items yet. Shops and bosses fix that.</p>`;

  const spells = view.spells.length
    ? view.spells.map((spell) => renderSpell(view, spell)).join('')
    : `<p class="empty-note">No spells. Some items give them on a condition.</p>`;

  const blacklist = view.blacklist.length
    ? view.blacklist.map((word, index) => `<li><span>${String(index + 1).padStart(2, '0')}</span>${escapeHtml(word)}</li>`).join('')
    : `<li class="empty"><span>—</span>empty</li>`;

  return `
  <aside class="panel side-panel">
    <section>
      <div class="panel-head"><span class="panel-kicker">ITEMS</span><span class="count">${view.slots.used}/${view.slots.total}</span></div>
      <div class="item-list">${items}</div>
    </section>
    <section>
      <div class="panel-head"><span class="panel-kicker">SPELLS</span><span class="count">${view.spells.length}</span></div>
      <div class="spell-list">${spells}</div>
    </section>
    <section>
      <div class="panel-head"><span class="panel-kicker">BLACKLIST</span><span class="count">${view.blacklist.length}/${view.blacklistCapacity}</span></div>
      <ol class="blacklist">${blacklist}</ol>
      ${view.purged.length ? `<div class="purged"><span class="panel-kicker">PURGED</span><div>${view.purged.map((letter) => `<span class="letter-chip">${escapeHtml(letter.toUpperCase())}</span>`).join('')}</div></div>` : ''}
    </section>
  </aside>`;
}

function renderItem(view: RunView, item: ItemView): string {
  const def = ITEM_BY_ID.get(item.id);
  const name = def?.name ?? item.id;
  const description = def?.description ?? '';
  const data = Object.entries(item.data)
    .filter(([, value]) => value !== 0)
    .map(([key, value]) => `<span class="data-chip">${escapeHtml(key)} ${value}</span>`)
    .join('');
  const usable = Boolean(def?.onUse);
  return `
  <article class="item-card">
    <div class="item-top"><b>${escapeHtml(name)}</b><span class="tag">${def?.kind === 'consumable' ? 'USE' : 'GEAR'}</span></div>
    <p>${escapeHtml(description)}</p>
    ${data ? `<div class="data-row">${data}</div>` : ''}
    ${usable ? `<button class="btn tiny" data-action="use" data-id="${escapeHtml(item.instance)}">USE</button>` : ''}
  </article>`;
}

function renderSpell(view: RunView, spell: SpellView): string {
  const def = SPELL_BY_ID.get(spell.id);
  const name = def?.name ?? spell.id;
  const description = def?.description ?? '';
  const canCast = def ? def.usable === 'any' || view.phase.kind === 'round' : false;
  return `
  <article class="spell-card">
    <div class="item-top"><b>${escapeHtml(name)}</b><span class="tag">SPELL</span></div>
    <p>${escapeHtml(description)}</p>
    <button class="btn tiny" data-action="cast" data-id="${escapeHtml(spell.instance)}" ${canCast ? '' : 'disabled'}>CAST</button>
  </article>`;
}

function tileRow(letters: string[], tiles?: string[], extraClass = ''): string {
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

function renderBoard(view: RunView, board: BoardView): string {
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

  const time = board.remainingMs === null ? '∞' : formatTime(board.remainingMs);
  const timeLabel = board.remainingMs === null ? 'NO LIMIT' : board.timerFrozen ? 'FROZEN' : 'TIME';
  const pct = board.remainingMs === null || !board.timerStartMs
    ? 100
    : Math.max(0, Math.min(100, (board.remainingMs / board.timerStartMs) * 100));
  const urgent = board.remainingMs !== null && board.remainingMs <= 10_000;
  const gauntlet = board.gauntletTotal > 1
    ? `<span class="fact gauntlet">PUZZLE ${board.gauntletIndex + 1}/${board.gauntletTotal}</span>`
    : '';

  return `
  <div class="round-head">
    <div class="timer ${urgent ? 'urgent' : ''} ${board.timerFrozen ? 'frozen' : ''}">
      <span class="timer-label">${timeLabel}</span>
      <b>${time}</b>
      <div class="timer-bar"><i style="width:${pct}%"></i></div>
    </div>
    <div class="round-facts">
      <span class="fact">FREE ${board.freeGuessesLeft}</span>
      <span class="fact ${board.nextGuessDamage > 0 ? 'danger' : ''}">NEXT HIT ${board.nextGuessDamage}</span>
      <span class="fact">RAW HIT ${board.rawNextGuessDamage}</span>
      ${gauntlet}
    </div>
  </div>
  <div class="board">${rows.join('')}</div>
  ${renderKeyboard(board)}
  ${renderChronicle()}`;
}

function renderKeyboard(board: BoardView): string {
  const rows = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
  return `<div class="keyboard">${rows.map((row, rowIndex) => {
    const keys = row.split('').map((letter) => {
      const status = board.keyboard[letter] ?? '';
      return `<button class="key ${status}" data-action="key" data-letter="${letter}" title="${letter.toUpperCase()}" ${status === 'purged' ? 'disabled' : ''}>${letter}</button>`;
    }).join('');
    const tail = rowIndex === 2
      ? `<button class="key wide" data-action="del">DEL</button><button class="key wide enter" data-action="submit">ENTER</button>`
      : '';
    return `<div class="key-row">${keys}${tail}</div>`;
  }).join('')}</div>`;
}

function renderChronicle(): string {
  if (chronicle.length === 0) {
    return `<div class="chronicle"><span class="panel-kicker">CHRONICLE</span><p class="empty-note">The list is empty. It will not stay that way.</p></div>`;
  }
  return `<div class="chronicle"><span class="panel-kicker">CHRONICLE</span><ul>${chronicle.slice(0, 7).map((line) => `<li class="${line.kind}">${escapeHtml(line.text)}</li>`).join('')}</ul></div>`;
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
    </div>
    <p class="muted">${phase.outcome === 'solved'
      ? 'The word goes on the blacklist with every other guess. Choose a reward and keep moving.'
      : phase.outcome === 'timeout'
        ? 'The clock took its cut. No reward. The run continues if you do.'
        : 'The run is over. The save is gone.'}</p>
    ${phase.outcome !== 'died' ? `<button class="btn primary big" data-action="continue">${phase.rewardPending ? 'CLAIM REWARD →' : 'NEXT NODE →'}</button>` : ''}
  </div>`;
}

function renderReward(phase: Extract<PhaseView, { kind: 'reward' }>): string {
  return `
  <div class="phase-card reward">
    <p class="panel-kicker">${phase.boss ? 'BOSS REWARD' : 'REWARD'}</p>
    <h2>Take one</h2>
    <p class="muted">Rewards are permanent for this run.</p>
    <div class="reward-grid">
      ${phase.options.map((option) => `
        <button class="reward-card ${option.kind}" data-action="reward" data-id="${escapeHtml(option.id)}">
          <span class="tag">${option.kind.toUpperCase()}</span>
          <b>${escapeHtml(option.label)}</b>
          <span>${escapeHtml(option.description)}</span>
        </button>`).join('')}
    </div>
  </div>`;
}

function offerInfo(offer: Offer): { name: string; description: string; slots: number } {
  if (offer.kind === 'item') {
    const def = ITEM_BY_ID.get(offer.def);
    return {
      name: def?.name ?? offer.def,
      description: def?.description ?? '',
      slots: def?.slots ?? (def?.kind === 'gear' ? 1 : 0),
    };
  }
  if (offer.kind === 'spell') {
    const def = SPELL_BY_ID.get(offer.def);
    return { name: def?.name ?? offer.def, description: def?.description ?? '', slots: 0 };
  }
  if (offer.kind === 'eat') {
    const def = FOOD_BY_ID.get(offer.def);
    return { name: def?.name ?? offer.def, description: def?.description ?? '', slots: 0 };
  }
  const def = UPGRADE_BY_ID.get(offer.def);
  return { name: def?.name ?? offer.def, description: def?.description ?? '', slots: 0 };
}

function renderShop(view: RunView, phase: Extract<PhaseView, { kind: 'shop' }>): string {
  const offers = phase.offers.length
    ? phase.offers.map((offer) => {
      const info = offerInfo(offer);
      const noRoom = info.slots > 0 && view.slots.used + info.slots > view.slots.total;
      const cannotAfford = view.gold < offer.price;
      return `
      <article class="offer-card ${cannotAfford || noRoom ? 'unavailable' : ''}">
        <span class="tag">${KIND_LABELS[offer.kind]}</span>
        <h3>${escapeHtml(info.name)}</h3>
        <p>${escapeHtml(info.description)}</p>
        ${noRoom ? `<span class="warn">No free slots</span>` : ''}
        <button class="btn primary" data-action="buy" data-id="${escapeHtml(offer.id)}" ${cannotAfford || noRoom ? 'disabled' : ''}>${offer.price} G</button>
      </article>`;
    }).join('')
    : `<p class="empty-note">The shelves are bare. Reroll or leave.</p>`;

  const sellable = view.items.map((item) => {
    const def = ITEM_BY_ID.get(item.id);
    return `<div class="sell-row"><span>${escapeHtml(def?.name ?? item.id)}</span><button class="btn tiny" data-action="sell" data-id="${escapeHtml(item.instance)}">SELL ${item.sellValue} G</button></div>`;
  }).join('');

  return `
  <div class="phase-card shop">
    <div class="shop-head">
      <div>
        <p class="panel-kicker">SHOP</p>
        <h2>Spend it or lose it</h2>
      </div>
      <div class="chip-stat gold">¤ <b>${view.gold}</b></div>
    </div>
    <div class="offer-grid">${offers}</div>
    <div class="shop-actions">
      <button class="btn" data-action="reroll">REROLL · ${phase.rerollCost} G</button>
      <button class="btn ghost" data-action="continue">LEAVE →</button>
    </div>
    ${sellable ? `<details class="sell-box"><summary>Sell items</summary>${sellable}</details>` : ''}
    <p class="hint">Food is eaten on purchase and takes no slot. Items do.</p>
  </div>`;
}

function renderHappening(phase: Extract<PhaseView, { kind: 'happening' }>): string {
  const def = HAPPENING_BY_ID.get(phase.happening);
  const resolved = phase.resolved;
  return `
  <div class="phase-card happening">
    <p class="panel-kicker">AN INTERRUPTION</p>
    <h2>${escapeHtml(def?.name ?? phase.happening)}</h2>
    <p class="happening-desc">${escapeHtml(def?.description ?? '')}</p>
    <div class="option-list">
      ${phase.options.map((option) => `
        <article class="happening-option ${resolved ? 'resolved' : ''}">
          <div>
            <b>${escapeHtml(option.label)}</b>
            <p>${escapeHtml(option.description)}</p>
            ${option.costGold ? `<span class="warn">Costs ${option.costGold} gold</span>` : ''}
          </div>
          <div class="odds">
            ${option.outcomes.map((outcome) => `<span>${outcome.chancePct}% · ${escapeHtml(outcome.text)}</span>`).join('')}
          </div>
          <button class="btn" data-action="choose" data-id="${escapeHtml(option.id)}" ${resolved ? 'disabled' : ''}>CHOOSE</button>
        </article>`).join('')}
    </div>
    ${resolved ? `<div class="resolution ${resolved.success ? 'good' : 'bad'}">${escapeHtml(resolved.text)}</div><button class="btn primary big" data-action="continue">CONTINUE →</button>` : ''}
  </div>`;
}

function renderOver(phase: Extract<PhaseView, { kind: 'over' }>): string {
  const victory = phase.result === 'victory';
  const stats = phase.stats;
  return `
  <div class="over-screen ${victory ? 'victory' : 'defeat'}">
    <p class="kicker">RUN OVER</p>
    <h1>${victory ? 'THE LIST IS YOURS' : 'THE LIST CLOSES'}</h1>
    <p class="tagline">${victory
      ? 'Three acts. Every boss. The words you gave up are the ones that carried you.'
      : 'Somewhere on the list is the word that ended you. It will be there next time.'}</p>
    <div class="stats-grid">
      <div><b>${stats.rounds}</b><span>rounds</span></div>
      <div><b>${stats.guesses}</b><span>guesses</span></div>
      <div><b>${stats.bosses}</b><span>bosses</span></div>
      <div><b>${stats.goldEarned}</b><span>gold earned</span></div>
      <div><b>${stats.damageTaken}</b><span>damage taken</span></div>
      <div><b>${stats.timeouts}</b><span>timeouts</span></div>
    </div>
    <div class="over-actions">
      <button class="btn primary big" data-action="new-run">NEW RUN</button>
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
      <p class="muted">The letter will never appear in a future answer, and you can never guess it again. Choose carefully.</p>
      <div class="purge-grid">
        ${letters.map((letter) => `<button class="purge-key ${view.purged.includes(letter) ? 'used' : ''}" data-action="purge" data-letter="${letter}" ${view.purged.includes(letter) ? 'disabled' : ''}>${letter.toUpperCase()}</button>`).join('')}
      </div>
      <p class="hint">${view.pendingPurge} purge${view.pendingPurge === 1 ? '' : 's'} pending. The clock is paused while this is open.</p>
    </div>
  </div>`;
}

function phasePanel(view: RunView): string {
  const phase = view.phase;
  switch (phase.kind) {
    case 'round':
      return `<section class="board-panel">${renderBoard(view, phase.board)}</section>`;
    case 'summary':
      return renderSummary(view, phase);
    case 'reward':
      return renderReward(phase);
    case 'shop':
      return renderShop(view, phase);
    case 'happening':
      return renderHappening(phase);
    case 'over':
      return renderOver(phase);
    default:
      return '';
  }
}

function renderRun(view: RunView): string {
  const phase = view.phase;
  const bossId = phase.kind === 'round' || phase.kind === 'summary' ? phase.boss : undefined;
  const over = phase.kind === 'over';

  return `
  <div class="shell ${shake ? 'shake' : ''}">
    ${renderTopbar(view)}
    ${renderPath(view)}
    ${over
      ? `<main class="over-layout">${phasePanel(view)}</main>`
      : `<main class="layout">
          ${renderBossPanel(view, bossId)}
          <section class="center-column">${phasePanel(view)}</section>
          ${renderSidePanel(view)}
        </main>`}
    ${renderPurgeModal(view)}
  </div>`;
}

render();
