# BLACKLIST

A word roguelike about the burdens you choose.

A 50-level curse run. The blacklist and the clock start disabled. Every two levels you choose one of three permanent curses, and those curses become the difficulty. Levels 47-49 are curse floors, and level 50 is a final boss made of three back-to-back rounds. One active save, and defeat wipes it.

**Play:** https://michaelayao88.github.io/blacklist/

![BLACKLIST](docs/preview.png)

---

## What is in the vertical slice

- Wordle-style scoring with duplicate-letter handling
- A 50-level curse run: no bosses until level 50, no starting clock, no starting blacklist
- Round loop: `round → 55% event → shop`, then `round → 55% event → curse`
- Curse drafts offer 2 choices after every 2 levels; levels 47-49 are curse floors
- Curse drafts draw from the weighted pool; The List and The Clock get a 3x weight until they first appear in a draft, then normal
- Curse drafts use the same rarity floors as shops (40% rare and below, 45% uncommon and below, 15% common only), but do not display rarity. A common curse becomes uncommon for the rest of the run after it is offered or selected
- Hover or focus a curse in the HUD to read its rules
- 50 is the final boss: three rounds back-to-back with no intermission. Bosses ignore the **Second Wind** curse
- **Second Wind** is a curse: after you solve a word, a second word appears with one free guess
- The Toll is only offered through level 40; The Tax and The Chained are only offered through level 20
- Base encounter damage is **3 + 1.3 per curse stack, rounded down**, plus **+1 for every 60 gold spent this run**; Heavy Hand multiplies the base by **1.5 per stack**
- Vision curses are usually rare. **Take the L** is common, while **Hard R**, **Without the D**, and **IP Theft** are uncommon; the first/second/third/fourth/fifth position curses hide their tile **50% of the time**
- The blacklist is disabled and hidden until **The List** curse is taken; The List is a single curse, never stacks, and arrives stocked with the first guess from every earlier round
- The clock is disabled until **The Clock** curse is taken; the first stack gives 5:00 and each further stack shrinks it by 40%. If the clock reaches zero, the run ends immediately
- The Clockmaker event only appears once The Clock exists
- **Phone a Friend** delivers a one- or two-word catchphrase, quietly adds 5 seconds, and spams his words across the screen; the **Pizza Pzazz** set shows a pizza/sparkle callout instead of the word spam. If purges leave fewer than three two-word phrases available, he falls back to single words
- **Time Freeze** gives a free, unobscured guess that does not count towards solve-count items (Hat Trick, Bloom, Growth Spurt, etc.); Time Freeze and Immunity lock until your next guess
- Within-X solve items count **player guesses only**; solve gold is a random 4-8, independent of guess count and auto-guesses
- Curse Collector, Curse Bulwark and Reliquary trigger on gaining a curse ("Whenever you gain a curse: Gain …"). Curse Collector grants +6 max HP and heals 6
- Ascension A1/A2 draft 1/2 starting curses
- Shops with rerolls that start at 1g and double in price: three items, two foods and one wildcard; the wildcard is always food or a spell, never an item, and one random offer is always 50% off. When your item slots are full, one gear offer is replaced by food
- Every spell offered in a shop has a 4g base price; the half-price sale can land on it
- Four item slots by default. Only equipped gear is active, and each shop has a drag-and-drop loadout
- **Loose Tongue**, a 12g uncommon item that lets you guess five-letter nonsense for free-form probes
- Spells stack by type and come from food, item triggers and the shop wildcard slot
- **Restore** clears the blacklist, refills armor, and ignores vision curses — including position curses — for the rest of the round; **Contrapuntal** turns into a random relic if you cast all six spell types
- Happenings with visible odds and persistent consequences
- **Know the Letter** offers two random letters and permanently reveals the one you pick; **Purge the Letter** offers three random letters and permanently purges one
- Short item, spell and offer text with hover tooltips for keywords like armor, reveal, ruled out, free guesses, blacklist, relic and timeout
- Revealed letters stay marked on the keyboard and in a Revealed panel for the puzzle; random reveals lean toward letters that are not in the answer; letter-reveal foods are permanent for the run
- Vision-hidden letters show the hatched hidden key on the keyboard; reveals and rule-outs take priority over that layer
- Every finished encounter pays gold; solves offer coins, usually a spell, and only rarely gear or a meal
- Opening shields such as **Head Start** (8s, common) and **Quickdraw** (12s, uncommon) make guesses in their window count as free guesses and show a floating timer banner with the remaining seconds
- Rarity uses cumulative floors: 40% pulls from rare, uncommon or common, 45% pulls from uncommon or common, and 15% pulls from common only. If a tier is empty, it falls back to the entire pool
- Relics you currently own will not appear again in shops or rewards. They are rare ordinary items, no longer boss rewards
- Defeat reveals the answer you missed (all of them, on the final boss)
- 103 items (96 shop items + 7 rare relics), 6 spells, 84 foods and 30 happenings
- New foods include **U-nagi**, **Donut Holes**, **One Bo Hue**, **Die Coke**, the **Overhealer** pair, and tradeoff meals that move HP, armor and slots around
- Every run starts with one random spell
- **Hat Trick** is a common item: solve in 3 guesses for 5 gold, then 7, 9, and so on (+2 per trigger); its card shows the live payout
- **Field Kit** reveals exactly 4 letters that are not in the word; **Doggy Bag** reveals 2 and queues another after every food
- Letter foods cover A, B, C, D, E, F, G, H, I, J, K, L, O, P, Q, T, U, W, X, and Y+N; every letter food is rare, unique, and stops appearing once all its letters are permanently revealed. A-Steak and B-Fsteak reveal whether their letter is in the answer
- New solve rewards: **Brace** (6g, +1 max armor), **Bloom** (+5 max HP, +1 per trigger), **Patch Kit** (heal 30% of max HP +1)
- **Four-Leaf Clover** has a 20% chance of a random spell when you eat or cast
- **Nest Egg** pays 3 gold whenever a shop opens
- **Frozen Durian** grants +1 Time Freeze every 3 foods eaten or solves
- **Muffin Tin** is a 3g uncommon food: in that shop, each food eaten gives +1 max armor per Muffin Tin eaten, but a tin does not count itself; the armor is permanent and the counting stops when you leave
- **Chilaquiles** is a 2g food that doubles the next two sales
- **Spell Pepper** is a 3g food that doubles your next spell
- Every shop node offers a choice: visit the shop, or rest at the inn to gain +8 max HP, heal to full HP, and move on
- **Hearty Stew** is a 4g food that grants 1-2 casts of Heal; **Hagelslag** gives +3 max HP and heals 20% of missing HP
- **Bulwark** is an 8g item: every 10 damage blocked by armor, autocast a random spell
- **Ricochet** is a 7g item: every 10 armor lost, autoguess a random word
- **Scattershot** autoguesses once per round after a guess sharing no letters with the previous guess
- **Yellow1** autoguesses on your player guess with exactly one yellow and no green; **Green1** does the same for exactly one green and no yellow. Neither has a round limit, and neither counts ally or auto-guesses
- **Deadline** grants +1 free guess as soon as the clock drops below 30s each round
- **Second Hand** and **Counterclockwise** (formerly Engine) are 8g items that cross-cast spells on cast at 80%
- **Last Cast** only reacts to spells you cast manually; autocast spells never trigger it
- **Genie Summon** is an 8g uncommon item: after your 3rd player guess each round, autocast a random spell
- **Combustion Engine** is a 10g uncommon item with a 3x appearance weight: after you autocast a spell, it has a 30% chance to autocast a random spell. It does not retrigger itself, and autocast chains cap at 10 spells per step
- **Encore** now costs 7g
- **Panacea Pouch** (formerly Spellhoarder) is a 9g item: every 3rd spell cast casts Heal
- **Omen** ignores letters whose only revealing tile was hidden by a position curse, so it can still find them
- **Vowel Tithe** is an 8g item: each spell cast has a 25% chance to cast Omen
- **Wild Magic** is a 9g item: each spell cast has a 25% chance to cast a random spell and a 25% chance to autoguess a random word
- **Acquired Taste** is a 7g uncommon item: each different food you eat this run gives +4 max HP
- Item triggers show a compact proc pop-up with the actual result (for example **Yellow1** calling an autoguess or **Grey Market** paying gold); item procs queue 2 seconds apart and stay up 3 seconds longer; once-per-round items show **SPENT** after they fire
- The revealed-letter panel persists between screens; in shops it is labelled **REVEALED**
- On desktop the item list sits under the battle rail on the left; on mobile it stays at the bottom of the sidebar
- **Grey Market** is a 7g item: every all-grey guess pays 2 gold, whether you made it or an ally did; an all-dark guess that pays nothing hides a letter
- **Photosynthesis** is a 10g item: on solve, +2 max HP and heal 20% max HP
- **Stopped Clock** is a 6g item: casting Time Freeze grants +5 max HP, once per round
- **Adrenaline** is a 10g item: dropping below 50% HP grants +1 max HP and +1 max armor, re-arming after healing above 50%
- **Gold Standard** is an 8g item: every gold gain gives +1 more gold
- **Guardian Angel** is an 8g item: after every 10 HP damage taken, autocast Immunity
- **Immunity** blocks the next hurting guess and any guess for 4 seconds after it
- **Mending Plate** is a rare item: +1 max armor per 8 HP healed
- **Bounty** is a 9g rare food: +1 gold per solve
- **Necronomicon** is a rare item: when you cast Omen, reveal 2 random letters, plus 1 more for every 13 max HP paid to the book; every 13 reveals autocasts Omen and costs 3 max HP
- **Growth Spurt** gives +3 max HP when you solve in 4 guesses or fewer
- **Growth Chart** is an 8g item: every 3 max HP gained grants +1 Time Freeze
- **Midas Touch** has a 30% chance to double every gold gain
- **Oracle Skull** is a 12g uncommon item: every heal autocasts Omen
- **Loyalty Card** is a 12g uncommon item: +1 item slot after every 10 shop purchases
- **Placebo** is a 4g item that heals exactly 1 HP on each player guess
- **Pen Club** pays a random 1-5 gold for guesses starting with PEN; **Gourmand** gains +1 max HP on eat or spell cast
- **Old McDonald's** is a 15g unique food: EIEIO is guessed for free at the start of every round
- Shops can show up to 2 copies of the same entry; sell rows are hoverable
- Solve gold is a random 4-8 per solve, independent of guess count
- **The Endless Table** fires every on-eat effect 7 times or pays 7 gold
- **Tally Lens** is a 12g common-rarity unique item with an uncommon shop banner and a 3x appearance weight while a vision curse is active; it is no longer guaranteed in a shop and shows correct/misplaced counts. **Tally** is never offered while you already own one
- **Encore** is unique and appears three times as often as an average common item; **Poppy Seeds** is a 6g common-rarity food that shows an uncommon shop banner
- **Without U** is a 3g common-rarity unique food that permanently purges U and shows an uncommon shop banner; **Purge the D** is also common-rarity with an uncommon shop banner
- **Reveal the D** is a 16g rare food; **Pay Respects to F** is an 8g common-rarity food with an uncommon banner that permanently purges F
- **A-Steak** is an 11g rare food that reveals whether A is in the answer every round
- **Black Market Ledger** is an 8g item: every shop purchase or event arrival has a 40% chance to add a random spell
- **The Spellbroker** event trades your spells for permanent value: Omen or Phone a Friend becomes a random permanent letter, Heal becomes +10 max HP and a 10 HP heal, and Immunity or Restore becomes +5 armor
- **The Spell Tithe** event trades one random spell for either permanent knowledge of a specific letter or a permanent purge of a specific letter; the trades are locked when you have no spells
- **Fortune Cookie** is a 1g food with a hidden 5× appearance weight: it queues one autoguess for the next round
- **Oracle's Banquet** is a 28g rare unique food: it permanently autoguesses at the start of every round
- **Tally** counts every guess, including ally and autoguesses
- **Harvest Charm**, **Empty Mouth**, **Empty Orb**, **Empty Phone**, **Detour**, **Dark Echo**, **Black Eye**, **Palindrome**, **Oasis 15**, **Shellshock**, **Echo Chamber**, **Panic Button**, and **Wild Magic** are the new autoguess/autocast items
- **Black Eye** is an 8g item: a hit that deals HP damage has an 80% chance to autoguess a random word; **Thorn Crown** is a 14g item with an 80% chance to autocast a random spell instead
- **Turtle Shell** is an 8g item that halves every hit armor does not soak; **Pain au Chocolat** is a 14g rare unique food that halves only the first such hit
- **Second Skin** is a 9g uncommon item: the first time armor hits 0 each round, restore half your max armor
- **Moon Cake** is a 25g rare unique food: autocast Omen at the start of every round
- **Empty Orb** is a 7g item that autocasts Omen when a round starts with no spells; **Empty Phone** is the 9g Phone a Friend version
- **Enoki** is a 4g food: +3 max HP and one autoguess next round
- **Corn** is a 3g food: +2 max HP and reveals C, O, R and N for the next round only
- **Iron Ration** is a 12g rare food: +2 max armor. **One Bo Hue** and **Plating** are uncommon; **Taco Pizza Party** is rare
- **Clean Slate** gives +1 max HP or +1 max armor at random when its condition triggers, once per round
- **Double Dip** is Kase's new name; it keeps the +1 max armor and queued-answer effect
- **The Naked Curse** removes all max armor; curse drafts offer two choices
- Blacklisted words are never chosen as round targets; if a late run runs out of legal targets, the List releases one
- The run-over screen and run history record the items you had equipped, and the stats page shows them per run
- Random guesses pull from a 214-word pool chosen for non-native speakers, including **patsy**, **wharf**, **rajah**, **guppy**, **glyph**, **lymph**, **gaunt**, **jaunt**, **vaunt**, **lurid**, **torus**, **bough**, **caput**, **etude**, and **butte**; **Dark Echo** avoids letters from your first guess
- Every spell cast plays an animated pop-up, including item autocasts; spell pop-ups appear 2 seconds apart, and every pop-up stays visible for 5 seconds
- **Cyrniki** is a 3g food: heal 50% of missing HP, then 50% a spell / 50% a shop reroll
- **Babification** removes a random curse, but you must choose between resetting item slots or max armor to their starting values
- **Triggerless** is a common level-20+ curse: item and food autoguesses and round-start guesses fail 50% of the time
- **Regurgitation** is an uncommon level-20+ curse: food reveals fail 50% of the time
- **The Tax** reduces encounter gold by 40% and is unique; **The Sleeper** adds +2 damage per revealed letter in your first player guess, per stack; **The Curse Broker** charges 12g for a relic or 15g to remove a random curse; **The Confessional** sells 45/75/100% random curse removal for 5/10/15g
- **The Detour** offers a slot, or a trip to the Time Bakery for +8 max HP and a Time Freeze; **The Crossroads** offers a shop or a Heal plus Time Freeze; **The Trade** trades gold for a slot, a slot for gold, or two Heal spells
- The Soldier and Orc idle in their walk loops; free guesses and the winning guess play the Soldier's attack, other guesses alternate Orc → Soldier, a fatal guess is always the Orc, and the Orc collapses from the winning blow and stays down until the next round starts
- Defeat drops the Soldier into their death animation on the run-over screen
- The pause menu includes a color-coded **CHRONICLE** of gameplay actions: guesses, rounds, damage, spells, item triggers, gold, food, shop purchases and curses
- Purge is an event (The Redaction) and foods (Poppy Seeds, rare Inkcap, Purge the D, Pay Respects to F); its rest option triggers an eat and a 10% random curse removal
- One exact-state autosave slot. Defeat clears it. Victory clears it and updates meta stats.
- A **STATS** page tracks run history (last 50 runs), win rate, best level, average solve time, favorite items and curses, play time, gold and damage totals
- The top bar shows gold and area; the current level lives in the battle rail, not a level counter
- Clock-gated items such as **Ticking Fee** never appear in shops or rewards until **The Clock** curse exists
- Compact battle rail on the left: round timer with a hover tooltip for the time limit, a wrong-guess damage chip, a side-view mini arena with your character facing the act's monster (or boss), player HP and armor
- Damage numbers slam into the centre of the screen as `N damage`, with a block message when armor or immunity eats the hit
- Spells and the blacklist sit on the right; the item list sits under the battle rail on desktop and at the bottom of the right column on mobile
- Pause (Space or Esc), independent music/SFX mutes, synthesized SFX, keyboard and on-screen keyboard, colorblind symbols, reduced-motion-friendly CSS
- Soundtrack opens every run on Dark Synthwave and rerolls to a random regular track every 7 levels (repeats allowed). Click the **MUSIC** control to cycle manually. More Power is reserved for the final boss and is not in the carousel. Music sits below the SFX mix.

Not in this version: daily seeds, Ascension above A2, dordle grids, Antiwordle, liar clues, Green Warden. The state and seed plumbing is already there for those.

---

## Music

Music defaults to **Dark Synthwave**. Click the **MUSIC** control on the title screen or top bar to cycle through the twelve regular tracks; the mute button is separate. **More Power** is locked to the final boss and is not available in the carousel.

**Liborio Conti** — free to use, no attribution required, via [no-copyright-music.com](https://www.no-copyright-music.com/):

- More Power
- Chip Tunes (Chiptune)
- Dark Score
- Dangerous

**Sub_Clair** — via [Pixabay](https://pixabay.com/users/sub_clair-55456531/) under the Pixabay Content License:

- Dark
- Dark Synthwave
- Trap Instrumental
- Rap Trap Instrumental

**SlimeyFox** — via [Pixabay](https://pixabay.com/users/slimeyfox-6041778/) under the Pixabay Content License:

- HyperMafia Golden Gun

**alex-morgan** — via [Pixabay](https://pixabay.com/users/alex-morgan-54692529/) under the Pixabay Content License:

- Dark Electronic

**APALONBeats** — via [Pixabay](https://pixabay.com/users/apalonbeats-54803662/) under the Pixabay Content License:

- Dark Trap

**JonasBlakewood** — via [Pixabay](https://pixabay.com/users/jonasblakewood-48502311/) under the Pixabay Content License:

- Trap - Trap Beat

**DELOSound** — via [Pixabay](https://pixabay.com/users/delosound-46524562/) under the Pixabay Content License:

- Synthwave Retro 80s

## Characters

- **The Soldier** is the default: 15 HP, 5 armor, no starting gear or curses.
- **The Pathfinder** unlocks when The Soldier reaches the first curse screen. They start with **Head Start**, **The List** curse, 14 HP and 3 armor.
- **The Necromancer** unlocks after buying the **Necronomicon** once from a shop. They start with the **Necronomicon**, **The Sleeper** curse, 40 HP and 2 armor.
- **The Purgamist** unlocks after buying 3 **Inkcap** across any runs. They start with **The Toll** curse, 12 HP, 4 armor and purge 3 letters of your choice before the first round.
- **The Gourmand** unlocks after buying 3 **Double Cheeseburgers** across any runs. They start with **Potluck**, **Porcupine's Dilemma** curse, 25 HP and 2 armor.
- **The Farmer** unlocks after winning any run. They start with the **Harvest Charm** (character-only, not found in shops), 20 HP and no armor.
- **The Empty Armor** unlocks after winning a run on **Ascension 1**. It starts with **Bulwark**, 1 HP and 11 armor.
- **The Werewolf** unlocks after winning a run on **Ascension 2**. It starts with **Dark Echo**, **Thorn Crown**, **Weak Plate** curse, 40 HP and no armor.
- Once any character is unlocked, the title screen shows all eight character cards (locked cards list their unlock hint). Unlocks persist across runs and a large popup announces each new character.

## Sprites

The Soldier and Orc sprites are from **Tiny RPG Character Asset Pack 01** by [Zerie](https://zerie.itch.io/tiny-rpg-character-asset-pack), used under the pack's free asset license. The Pathfinder (Maze Runner) uses the **Sci-Fi Hero** pack by [Printer Not Found](https://printer-not-found.itch.io/sci-fi-hero) (CC0). The Necromancer is from [CreativeKind's Necromancer (Free)](https://creativekind.itch.io/necromancer-free), and the Farmer is from [Kettoman's free farmer base pack](https://kettoman.itch.io/free-pixel-character-base-pack-32x32-top-down-farmer-animations). The Purgamist uses the **Kitsune** sprite and the Gourmand uses the **Karasu** (Tengu) sprite from **Free Yokai Pixel Sprite Sheets** by [Free Game Assets / CraftPix](https://free-game-assets.itch.io/free-yokai-pixel-sprite-sheets), used under the pack's free asset license. The Empty Armor uses the dark knight from [Free Fantasy Knight](https://free-game-assets.itch.io/free-fantasy-knight), and the Werewolf uses the dark blue non-default variant from [Free Werewolf Sprite Sheets](https://free-game-assets.itch.io/free-werewolf-sprite-sheets-pixel-art), both by Free Game Assets / CraftPix under their free asset licenses. The character assets are included only as part of this game and may not be extracted or redistributed as standalone assets.

---

## Run rules

| Thing | Value |
|---|---|
| Starting HP | 15 for The Soldier; preset characters override this |
| Starting armor | 5 points for The Soldier; preset characters override this |
| Starting item slots | 4 (only equipped gear counts; relics use one slot each) |
| Free guesses per round | 1, plus every guess made inside a timed shield |
| Starting gold | 12 |
| Starting spells | 1 random spell |
| Blacklist | disabled until The List curse; unlimited once active |
| Normal timer | none until The Clock curse |
| Clock curse | first stack 5:00, each later stack -40%, floor 0:30 |
| Final boss | 3 rounds, shared clock if active |
| Base damage | `3 + floor(1.3 × total curse stacks) + floor(gold spent / 60)`, then Heavy Hand and other modifiers apply |
| Paid guess damage | curse-scaled base, modified only by curses |
| Final boss damage | 3 base plus curses |
| Timeout | ends the run immediately; armor, immunity and revives cannot prevent it |
| Armor | a pool that soaks damage point-for-point before HP; refills each round |
| Solve gold | random `4-8`, plus `solveGoldBonus` (Midas Touch can double any gain) |
| Timeout gold | none; running out of time ends the run |
| Solve reward | a flat 5 gold plus a spell (65%) or food (35%); gear is an 8% find |
| Relic source | rare-tier shop/reward finds and the Curse Broker; owned relics never appear again |
| Shop reroll | starts at 1 gold, doubles after each use |

### Ascension

Ascension is only starting curses.

| Level | Modifier |
|---|---|
| A1 | Draft 1 extra curse before level 1 |
| A2 | Draft 2 extra curses before level 1 |

Beating a run unlocks the next Ascension, up to A2.

The answer pool excludes the blacklist, already-used answers and purged letters. If purging would leave no legal answer, the game restores a random purged letter and explains why.

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
