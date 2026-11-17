const ITEM_ICONS: Record<string, string> = {
  hourglass: '⏳',
  'early-bird': '🐦',
  'hat-trick': '🎩',
  brace: '🦾',
  bloom: '🌱',
  'patch-kit': '🩹',
  'four-leaf-clover': '🍀',
  'doggy-bag': '🐶',
  bottomless: '🍽️',
  'head-start': '🏃',
  quickdraw: '🤠',
  daredevil: '😈',
  encore: '🔁',
  tally: '🧮',
  'iron-hide': '🛡️',
  'rabbit-foot': '🐇',
  scattershot: '🎯',
  'grey-matter': '🧠',
  'deja-vu': '🔁',
  'compound-interest': '📈',
  'midas-touch': '🪙',
  photosynthesis: '🌿',
  'vampire-teeth': '🧛',
  siphon: '🩸',
  placebo: '💊',
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
  sundial: '☀️',
  'glass-cannon': '💥',
  'loose-tongue': '👅',
  'waste-basket': '🗑️',
  'mimic-mouth': '👄',
  'dead-letter': '✉️',
  'vowel-tithe': '🔠',
  'second-hand': '⏲️',
  'cracked-orb': '🔮',
  'sticky-fingers': '🖐️',
  'nest-egg': '🪺',
  'oracle-skull': '💀',
  'thorn-crown': '👑',
  'echo-chamber': '🕳️',
  'phoenix-egg': '🥚',
  'chrono-anchor': '⚓',
  'speed-dial': '📞',
  'gilded-fork': '🍴',
  'vowel-sigil': '🔮',
  'warding-idol': '🗿',
  'loaded-dice': '🎲',
  'field-kit': '🧭',
  'field-dressing': '🩹',
  'pen-club': '🖊️',
  trailblazer: '🗺️',
  bulwark: '🧱',
  'scrap-collector': '♻️',
  'boss-aegis': '🏰',
  spellplate: '🔷',
  'mending-plate': '💠',
  'harvest-charm': '🌾',
  'tithe-box': '🪙',
  'life-savings': '🏦',
  'growth-chart': '📊',
  'stopped-clock': '⏱️',
  'second-stomach': '🍽️',
  preserves: '🫙',
  'time-lattice': '🧩',
  'omen-loom': '🔮',
  'mercy-ledger': '📗',
  'ward-engine': '🔰',
  deadline: '⏰',
  'ticking-fee': '🕰️',
  'second-skin': '🦺',
  'double-blind': '🎯',
  'pawn-ticket': '🎫',
  miser: '🧾',
  'coupon-book': '🎟️',
  contrapuntal: '🎼',
  'trophy-room': '🏛️',
  'loyalty-card': '💳',
  bookend: '🔖',
  'last-cast': '🪄',
  'empty-hand': '✋',
  'bulk-order': '🛒',
  'solo-note': '🎵',
  'tally-lens': '🧮',
  'meal-timer': '🍽️',
  'plate-timer': '🛡️',
  'off-road': '🚙',
  'clean-slate': '🧼',
  shortcut: '⚡',
  'growth-spurt': '🌱',
  counterweight: '⚖️',
  'acquired-taste': '👅',
  'ritual-circle': '🔯',
  potluck: '🥘',
};

const SPELL_ICONS: Record<string, string> = {
  'time-freeze': '❄️',
  omen: '👁️',
  heal: '❤️‍🩹',
  restore: '🧹',
  immunity: '🛡️',
  'phone-friend': '📞',
  purge: '🧽',
};

const FOOD_ICONS: Record<string, string> = {
  snack: '🍫',
  feast: '🍗',
  candy: '🍬',
  coffee: '☕',
  'mystery-stew': '🍲',
  'hearty-meal': '🍖',
  'bone-broth': '🥣',
  'iron-ration': '🥫',
  'honey-cake': '🍰',
  'overtime-tea': '🍵',
  vitality: '❤️',
  plating: '🛡️',
  chronos: '⏳',
  satchel: '🎒',
  bounty: '💰',
  'b-file': '🅱️',
  'x-ray': '🩻',
  'q-tip': '🧵',
  'gg-gum': '🍬',
  'i-spy': '🔍',
  'reveal-the-d': '🌼',
  'yin-yang': '☯️',
  gumdrop: '🍭',
  'bitter-root': '🌿',
  inkcap: '🍄',
  'purge-the-d': '♀️',
  'old-mcdonald': '🚜',
};

const BOSS_SIGILS: Record<string, string> = {
  editor: '✎',
  sleeper: '☾',
  censor: '▣',
  auditor: '∑',
  'vowel-fog': '◌',
  monochrome: '◐',
  gauntlet: '⟳',
  horde: '⁂',
};

const BOSS_COLORS: Record<string, string> = {
  editor: '#e7b85a',
  sleeper: '#8b6bd9',
  censor: '#df615a',
  auditor: '#58b4c6',
  'vowel-fog': '#4fbf87',
  monochrome: '#c9c0d8',
  gauntlet: '#e07a4f',
  horde: '#9ec95a',
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

export function bossSigil(id?: string): string {
  return id ? BOSS_SIGILS[id] ?? '☠' : '·';
}

export function bossColor(id?: string): string {
  return (id && BOSS_COLORS[id]) || '#e7b85a';
}

/** Large side-view runner used in the battle arena. Faces right. */
export function playerSprite(hpPct: number, hit = false): string {
  const hurt = hpPct <= 0.3;
  return `
  <svg class="sprite-svg player-svg ${hit ? 'is-hit' : ''}" viewBox="0 0 180 180" role="img" aria-label="The runner">
    <ellipse class="art-shadow" cx="90" cy="164" rx="48" ry="8" />
    <path class="art-scarf" d="M66 78C46 72 24 78 8 98c19-6 36-4 50 4Z" />
    <path class="art-cloak" d="M100 34c-23 2-40 21-44 46-2 13-2 27-1 41 1 10 7 16 17 16h46c10 0 17-6 17-17l-2-39c-3-25-13-40-33-47Z" />
    <path class="art-cloak-dark" d="M78 104c6 19 19 31 40 37l-3 14H59l-2-23c2-17 9-25 21-28Z" />
    <path class="art-hood" d="M100 32c-17 2-29 15-29 33 0 14 8 25 23 27 13 2 23-7 25-19 2-17-4-31-19-41Z" />
    <path class="art-face" d="M94 52c10 0 18 8 18 18 0 9-6 16-15 17-8 1-14-6-14-15 0-11 3-19 11-20Z" />
    <g class="art-eyes">
      ${hurt
        ? `<path d="M97 61l9 8M106 61l-9 8" />`
        : `<circle class="art-eye" cx="104" cy="66" r="2.6" />`}
    </g>
    <path class="art-belt" d="M60 108l53 4 1 7-53-4Z" />
    <circle class="art-buckle" cx="90" cy="112" r="4" />
    <path class="art-arm" d="M110 94c10 2 17 8 21 16l-9 7c-4-7-9-11-16-13Z" />
    <path class="art-blade" d="M128 108 172 72l6 7-43 39Z" />
    <path class="art-hilt" d="M122 116l18-16" />
  </svg>`;
}

/** Large side-view monster used in the battle arena. Faces left. */
export function enemySprite(bossId?: string): string {
  const color = bossColor(bossId);
  const eyes = bossId === 'sleeper'
    ? `<path class="enemy-eye-line" d="M64 60q8-7 16 0M88 60q8-7 16 0" />`
    : bossId === 'auditor'
      ? `<circle class="enemy-eye-main" cx="72" cy="58" r="6" /><circle class="enemy-eye" cx="96" cy="56" r="4" />`
      : `<ellipse class="enemy-eye-main" cx="72" cy="58" rx="8" ry="7" /><ellipse class="enemy-eye" cx="98" cy="56" rx="4" ry="4" />`;
  return `
  <svg class="sprite-svg enemy-svg" viewBox="0 0 180 180" role="img" aria-label="The opposition" style="--enemy:${color}">
    <ellipse class="art-shadow" cx="98" cy="164" rx="54" ry="9" />
    <path class="enemy-aura" d="M102 12c35 4 53 34 51 69-2 33-21 56-47 61-25 5-47-9-53-33-2-8-1-16 2-24-8-6-12-15-12-25 6 4 12 4 18 0-8-7-12-16-11-27 7 7 15 9 24 6-3-10 1-20 10-25 5-3 12-4 18-2Z" />
    <path class="enemy-body" d="M104 26c23 2 37 23 36 49-1 21-10 36-25 45-10 7-22 8-33 3-9-4-15-12-16-22-1-6 0-11 3-15-7-3-11-9-12-16 6 2 11 1 15-3-4-5-6-11-4-17 5 4 10 5 15 2-2-8 2-15 9-19 4-2 8-3 12-3Z" />
    <path class="enemy-horn" d="M94 26C82 12 66 6 48 6c14 8 22 16 26 28" />
    <path class="enemy-horn" d="M120 24c0-12 6-20 18-24-6 12-6 20-4 28" />
    <path class="enemy-brow" d="M56 46q14-10 30-4M90 46q8-5 16-2" />
    <g class="enemy-eyes">${eyes}</g>
    <path class="enemy-mouth" d="M50 92c10 8 24 12 40 10l4 12c-18 6-36 0-48-10Z" />
    <path class="enemy-teeth" d="M56 94l4 10 6-9 4 10 6-9 5 10 6-9 4 9" />
    <path class="enemy-spike" d="M126 88l20-14-8 20 18-6-24 18" />
    <path class="enemy-claw" d="M58 136c-8 6-12 12-14 20M68 142c-4 8-6 14-6 18" />
    <text class="enemy-sigil" x="126" y="150" text-anchor="middle">${bossSigil(bossId)}</text>
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
