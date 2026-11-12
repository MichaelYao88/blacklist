const ITEM_ICONS: Record<string, string> = {
  hourglass: '⏳',
  'early-bird': '🐦',
  'hard-hat': '⛑️',
  'iron-hide': '🛡️',
  'rabbit-foot': '🐇',
  scattershot: '🎯',
  'grey-matter': '🧠',
  'deja-vu': '🔁',
  'b-file': '🅱️',
  'x-ray': '🩻',
  'q-tip': '🧵',
  'compound-interest': '📈',
  photosynthesis: '🌿',
  'vampire-teeth': '🧛',
  siphon: '🩸',
  gourmand: '🍽️',
  spellbook: '📖',
  'trophy-hunter': '🏆',
  'lucky-charm': '🍀',
  necronomicon: '📕',
  'piggy-bank': '🐷',
  metronome: '🎵',
  overachiever: '⭐',
  'time-dilation': '⏱️',
  'second-wind': '🌬️',
  'black-market-ledger': '📒',
  'purge-token': '🧽',
  'boss-trophy': '🥇',
  'fast-learner': '🎓',
  untouchable: '✨',
  'feast-of-ideas': '💡',
  spellhoarder: '🗃️',
  'blacklist-scholar': '🎩',
  ouroboros: '🐍',
  sundial: '☀️',
  'glass-cannon': '💥',
  'oracle-skull': '💀',
  'thorn-crown': '👑',
  'echo-chamber': '🕳️',
  'phoenix-egg': '🥚',
  'chrono-anchor': '⚓',
  'midas-relic': '🏺',
  'vowel-sigil': '🔮',
  'blacklist-idol': '🗿',
  'loaded-dice': '🎲',
};

const SPELL_ICONS: Record<string, string> = {
  'time-freeze': '❄️',
  omen: '👁️',
  heal: '❤️‍🩹',
  restore: '🧹',
  immunity: '🛡️',
  'phone-friend': '📞',
  'time-warp': '⏩',
  purge: '🧽',
};

const FOOD_ICONS: Record<string, string> = {
  snack: '🍫',
  feast: '🍗',
  candy: '🍬',
  coffee: '☕',
};

const UPGRADE_ICONS: Record<string, string> = {
  vitality: '❤️',
  plating: '🛡️',
  chronos: '⏳',
  satchel: '🎒',
  ledger: '📓',
};

const BOSS_SIGILS: Record<string, string> = {
  editor: '✎',
  sleeper: '☾',
  censor: '▣',
  auditor: '∑',
  'vowel-fog': '◌',
  monochrome: '◐',
  gauntlet: '⟳',
};

const BOSS_COLORS: Record<string, string> = {
  editor: '#e7b85a',
  sleeper: '#8b6bd9',
  censor: '#df615a',
  auditor: '#58b4c6',
  'vowel-fog': '#4fbf87',
  monochrome: '#c9c0d8',
  gauntlet: '#e07a4f',
};

export function itemIcon(id: string): string {
  return ITEM_ICONS[id] ?? '🎒';
}

export function spellIcon(id: string): string {
  return SPELL_ICONS[id] ?? '✨';
}

export function foodIcon(id: string): string {
  return FOOD_ICONS[id] ?? '🍽️';
}

export function upgradeIcon(id: string): string {
  return UPGRADE_ICONS[id] ?? '⬆️';
}

export function bossSigil(id?: string): string {
  return id ? BOSS_SIGILS[id] ?? '☠' : '·';
}

export function bossColor(id?: string): string {
  return (id && BOSS_COLORS[id]) || '#e7b85a';
}

/** One hooded runner. The UI changes the face when HP gets low. */
export function playerArt(hpPct: number): string {
  const hurt = hpPct <= 0.3;
  return `
  <svg class="player-svg" viewBox="0 0 120 120" role="img" aria-label="The runner">
    <ellipse class="art-shadow" cx="60" cy="108" rx="34" ry="7" />
    <path class="art-cloak" d="M60 20c-19 0-31 18-31 47v28c0 5 4 8 9 8h44c5 0 9-3 9-8V67c0-29-12-47-31-47Z" />
    <path class="art-cloak-dark" d="M42 66c0 18 6 28 18 35 12-7 18-17 18-35-6 6-11 9-18 9s-12-3-18-9Z" />
    <path class="art-hood" d="M60 22c-13 0-22 11-22 25 0 12 7 22 22 22s22-10 22-22c0-14-9-25-22-25Z" />
    <path class="art-face" d="M48 47c0-8 5-14 12-14s12 6 12 14c0 9-5 15-12 15s-12-6-12-15Z" />
    <g class="art-eyes">
      ${hurt
        ? `<path d="M52 46l6 6M58 46l-6 6M64 46l6 6M70 46l-6 6" />`
        : `<circle cx="56" cy="47" r="1.8" /><circle cx="64" cy="47" r="1.8" />`}
    </g>
    <path class="art-belt" d="M42 84h36v6H42Z" />
    <circle class="art-buckle" cx="60" cy="87" r="3.4" />
    <path class="art-blade" d="M86 58l4 2-16 35-4-2Z" />
    <path class="art-hilt" d="M70 88l13 6" />
  </svg>`;
}

/** A generic enemy silhouette, tinted per boss. */
export function enemyArt(bossId?: string): string {
  const color = bossColor(bossId);
  const eyes = bossId === 'auditor'
    ? `<circle cx="45" cy="52" r="5" /><circle cx="75" cy="52" r="5" />`
    : bossId === 'sleeper'
      ? `<path d="M38 52q7 6 14 0" /><path d="M68 52q7 6 14 0" />`
      : `<ellipse cx="45" cy="52" rx="6" ry="7" /><ellipse cx="75" cy="52" rx="6" ry="7" />`;

  return `
  <svg class="enemy-svg" viewBox="0 0 120 120" role="img" aria-label="The opposition" style="--enemy:${color}">
    <ellipse class="art-shadow" cx="60" cy="108" rx="36" ry="7" />
    <path class="enemy-aura" d="M60 12c28 0 46 22 46 51 0 28-20 43-46 43S14 91 14 63c0-29 18-51 46-51Z" />
    <path class="enemy-body" d="M60 18c22 0 36 18 36 42 0 19-9 30-18 37 3-12 4-22 1-28-8 8-16 12-28 12s-20-4-28-12c-3 6-2 16 1 28-9-7-18-18-18-37 0-24 14-42 36-42Z" />
    <path class="enemy-horn" d="M28 34 18 16l20 8M92 34l10-18-20 8" />
    <path class="enemy-brow" d="M32 38c8-6 17-7 28-3M88 38c-8-6-17-7-28-3" />
    <g class="enemy-eyes">${eyes}</g>
    <path class="enemy-mouth" d="M34 76c4 9 13 14 26 14s22-5 26-14c-8 3-16 4-26 4s-18-1-26-4Z" />
    <path class="enemy-teeth" d="M42 82l4 8 4-8 4 9 4-9 4 9 4-9 4 8 4-8" />
    <text class="enemy-sigil" x="60" y="102" text-anchor="middle">${bossSigil(bossId)}</text>
  </svg>`;
}
