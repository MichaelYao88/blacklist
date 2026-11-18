# BLACKLIST

A word roguelike about the words you can never say again.

A 50-level curse run. The blacklist and the clock start disabled. Every two levels you choose one of two permanent curses, and those curses become the difficulty. Levels 47–49 are curse floors, and level 50 is a final boss made of three back-to-back rounds. One active save, and defeat wipes it.

**Play:** https://michaelayao88.github.io/blacklist/

![BLACKLIST](docs/preview.png)

---

## What is in the vertical slice

- Wordle-style scoring with duplicate-letter handling
- A 50-level curse run: no bosses until level 50, no starting clock, no starting blacklist
- Round loop: `round → 40% event → shop`, then `round → 40% event → curse`
- Curse drafts offer 2 choices after every 2 levels; levels 47-49 are curse floors
- Curse drafts draw from the normal weighted pool; there is no special first-draft rule
- Hover or focus a curse in the HUD to read its rules
- 50 is the final boss: three rounds back-to-back with no intermission
- Base encounter damage is **3 + the total number of curse stacks**; Heavy Hand still multiplies it
- The blacklist is disabled and hidden until **The List** curse is taken; The List is a single curse, never stacks, and arrives stocked with the first guess from every earlier round
- The clock is disabled until **The Clock** curse is taken; the first stack gives 5:00
- The Clockmaker event only appears once The Clock exists
- **Phone a Friend** delivers a one- or two-word catchphrase, quietly adds 5 seconds, and spams his words across the screen
- Curse Collector, Witch Charm, Curse Bulwark and Reliquary trigger on gaining a curse ("Whenever you gain a curse: Gain …")
- Ascension A1/A2 draft 1/2 starting curses
- Shops with rerolls that double in price: three items, two foods and one wildcard; one item is always 50% off
- Five item slots by default. Only equipped gear is active, and each shop has a drag-and-drop loadout
- **Loose Tongue**, a rare relic that lets you guess five-letter nonsense for free-form probes
- Spells stack by type and come from food, item triggers and the shop wildcard slot
- **Restore** clears the blacklist and refills armor; **Contrapuntal** turns into a random relic if you cast all six spell types
- Happenings with visible odds and persistent consequences
- Short item, spell and offer text with hover tooltips for keywords like armor, reveal, ruled out, free guesses, blacklist, relic and timeout
- Revealed letters stay marked on the keyboard and in a Revealed panel for the puzzle; random reveals lean toward letters that are not in the answer; letter-reveal foods are permanent for the run
- Every finished encounter pays gold; solves offer coins, usually a spell, and only rarely gear or a meal
- Opening shields such as **Head Start** and **Quickdraw** make guesses in their window count as free guesses
- Relics are very rare ordinary items, no longer boss rewards
- Defeat reveals the answer you missed (all of them, on the final boss)
- 98 items (80 shop items + 18 rare relics), 6 spells, 38 foods and 16 happenings
- New foods include **U-nagi**, **Empty Calories**, **One Bo Hue**, **Die Coke**, the **Overhealer** pair, and tradeoff meals that move HP, armor and slots around
- Every run starts with one random spell
- **Hat Trick** is a common item: solve in 3 guesses for 5 gold, then 7, 9, and so on (+2 per trigger); its card shows the live payout
- **Field Kit** reveals exactly 4 letters that are not in the word; **Doggy Bag** reveals 2 and queues another after every food
- Letter foods cover B, G, X, Q, I, D, and Y+N; a letter food stops appearing once all its letters are permanently revealed
- New solve rewards: **Brace** (+2 max armor), **Bloom** (+5 max HP, +1 per trigger), **Patch Kit** (heal 30% of max HP +1)
- **Four-Leaf Clover** has a 20% chance of a random spell when you eat or cast
- **Bottomless** starts at +4 max armor; eating food has a 20% chance of +1 max armor
- **Big Belt** gains +1 item slot every 5 eats or solves
- **Pen Club** pays a random 1-5 gold for guesses starting with PEN; **Gourmand** gains +1 max HP on eat or spell cast
- **Old McDonald** is an expensive relic: EIEIO is guessed for free at round start
- Shops can show up to 2 copies of the same entry; sell rows are hoverable
- Solve gold is 8 for 3 guesses or fewer, otherwise a random 5-8
- **The Endless Table** fires every on-eat effect 7 times or pays 7 gold
- **Tally Lens** is guaranteed in a shop after a vision curse and shows correct/misplaced counts
- **The Tax** halves encounter gold and is unique; **The Curse Broker** charges 12g for a relic or 15g to remove a curse
- The run path rail is gone; the current level stays in the battle rail
- Purge is an event (The Redaction) and rare foods; not a spell
- One exact-state autosave slot. Defeat clears it. Victory clears it and updates meta stats.
- A **STATS** page tracks run history (last 50 runs), win rate, best level, average solve time, favorite items and curses, play time, gold and damage totals
- The top bar shows gold and area; the current level lives in the battle rail, not a level counter
- Clock-gated items such as **Ticking Fee** never appear in shops or rewards until **The Clock** curse exists
- Compact battle rail on the left: round timer with a hover tooltip for timeout damage, a wrong-guess damage chip, a side-view mini arena with the runner facing the act's monster (or boss), player HP and armor
- Damage numbers slam into the centre of the screen as `N damage`, with a block message when armor or immunity eats the hit
- Spells and the blacklist sit on the right, with items below them
- Pause (Space or Esc), independent music/SFX mutes, synthesized SFX, keyboard and on-screen keyboard, colorblind symbols, reduced-motion-friendly CSS
- Soundtrack opens every run on Dark Synthwave and rerolls to a random regular track every 7 levels (repeats allowed). Click the **MUSIC** control to cycle manually. More Power is reserved for the final boss and is not in the carousel. Music sits below the SFX mix.

Not in this version: daily seeds, Ascension above A2, dordle grids, Antiwordle, liar clues, Green Warden. The state and seed plumbing is already there for those.

---

## Music

Music defaults to **Dark Synthwave**. Click the **MUSIC** control on the title screen or top bar to cycle through the eight regular tracks; the mute button is separate. **More Power** is locked to the final boss and is not available in the carousel.

**Liborio Conti** — free to use, no attribution required, via [no-copyright-music.com](https://www.no-copyright-music.com/):

- More Power
- Chip Tunes (Chiptune)
- Dark Score
- Drums (Upbeat Drums)
- Dangerous

**Sub_Clair** — via [Pixabay](https://pixabay.com/users/sub_clair-55456531/) under the Pixabay Content License:

- Dark
- Dark Synthwave

**echoes_of_lumen** — via [Pixabay](https://pixabay.com/users/echoes_of_lumen-56361169/) under the Pixabay Content License:

- Neon Synthwave Vibe

**DELOSound** — via [Pixabay](https://pixabay.com/users/delosound-46524562/) under the Pixabay Content License:

- Synthwave Retro 80s

---

## Run rules

| Thing | Value |
|---|---|
| Starting HP | 16 |
| Starting armor | 2 points |
| Starting item slots | 5 (only equipped gear counts; relics use one slot each) |
| Free guesses per round | 1, plus every guess made inside a timed shield |
| Starting gold | 10 |
| Starting spells | 1 random spell |
| Blacklist | disabled until The List curse; unlimited once active |
| Normal timer | none until The Clock curse |
| Clock curse | first stack 5:00, each later stack −20%, floor 0:30 |
| Final boss | 3 rounds, shared clock if active |
| Base damage | `3 + total curse stacks`, then Heavy Hand and other modifiers apply |
| Paid guess damage | curse-scaled base, modified only by curses |
| Final boss damage | 3 base plus curses |
| Timeout damage | `2 × guess hit + ceil(maxHp × 0.3)`, bypasses armor, ends the round |
| Armor | a pool that soaks damage point-for-point before HP; refills each round |
| Solve gold | `8` on a solve in 3 guesses or fewer, else random `5-8`, plus `solveGoldBonus` (Midas Touch can double any gain) |
| Timeout gold | `1`; a death pays nothing |
| Solve reward | a flat 5 gold plus a spell (65%) or food (35%); gear is an 8% find |
| Relic source | very rare shop/reward finds and the Curse Broker |
| Shop reroll | starts at 2 gold, doubles after each use |

### Ascension

Ascension is only starting curses.

| Level | Modifier |
|---|---|
| A1 | Draft 1 extra curse before level 1 |
| A2 | Draft 2 extra curses before level 1 |

Beating a run unlocks the next Ascension, up to A2.

The answer pool excludes the blacklist, already-used answers and purged letters.

---

## Development

```bash
npm install
npm run dev        # Vite dev server
npm test           # core + headless UI tests
npm run build      # typecheck + production build
npm run preview    # preview the production build
```

The site deploys automatically from `main` through `.github/workflows/pages.yml`.

---

## Architecture

The core is a pure reducer:

```ts
step(state, command) → { state, events }
view(state) → RunView
```

- `src/core/` has no DOM, browser, content or framework imports.
- Time only arrives through `tick` commands.
- Randomness only comes from the seeded RNG stored in `RunState`.
- State is plain JSON. No `Date.now`, `Math.random`, `structuredClone`, `Set`/`Map` in serialized state.
- The UI replays events and renders absolute post-change views.
- Boss presentation masks are applied inside the core, so a client cannot accidentally reveal the truth.

```
src/
  core/        portable engine, types, RNG, scoring, host adapter
  content/     items, spells, curses, final boss, foods, happenings
  data/        generated word lists
  ui/          vanilla DOM client
  game.ts      core instance wired to content
```

### Reusing the core

The web client is one adapter around `CoreHost`:

```ts
import { createCore } from './core/engine';
import { CONTENT } from './content';

const core = createCore(CONTENT);
const result = core.newRun({ seed: 'daily-2026-01-01' });
const view = core.view(result.state);
```

For React, keep the same core and replace `src/ui/`. For Unity, run the compiled JS through a JS runtime, or port the reducer using `src/core/types.ts`, `src/content/` and the command/event contract as the specification. There are no rule rewrites required.

`src/core/host.ts` provides an injectable `SaveStore`; the web app uses `localStorage`, tests use `MemoryStore`.

The purity test in `tests/engine.test.ts` fails if any file under `src/core/` touches browser globals or ambient randomness.

---

## Word data

- Answer and allowed-guess lists: [cfreshman's Wordle lists](https://gist.github.com/cfreshman/a03ef2cba789d8cf00c08f767e0fad7b) (answers) and [allowed guesses](https://gist.github.com/cfreshman/cdcdf777450c5b5301e439061d29694c).
- Profanity and slur filtering is applied when generating `src/data/answers.json` and `src/data/valid.json`.
- `src/data/hard.json` is generated by `scripts/build-hard.mjs` using a deterministic letter-frequency/duplicate-letter heuristic. It is a difficulty ranking, not a full solver.
- The Phone a Friend list is original joke vocabulary, not game data.

Run `node scripts/build-hard.mjs` after changing the answer list.

---

## License

The code is **source-available** under the [PolyForm Noncommercial License 1.0.0](LICENSE), not open source.

- Free for personal, educational, research, hobby, and other noncommercial use.
- **Commercial use requires a separate written license.** See [COMMERCIAL.md](COMMERCIAL.md).
- Music, audio, and word-data terms are listed separately in [NOTICE](NOTICE).
- Versions published before 17 November 2026 were released under MIT; those copies remain under MIT as recorded in the repository history.

Commercial terms are negotiable, including flat fees or revenue sharing. Open an issue with the subject **Commercial license** to start a conversation.
