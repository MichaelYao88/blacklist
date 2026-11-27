import { defineHappening, type HappeningDef } from '../core/types';

export const HAPPENINGS: HappeningDef[] = [
  defineHappening({
    id: 'scavenger',
    name: 'The Scavenger',
    description: 'A hooded figure offers you a deal from a bag of dented parts.',
    options: [
      {
        id: 'reach',
        label: 'Reach into the bag',
        description: '40%: +1 slot. 60%: −10 HP.',
        outcomes: [
          { chancePct: 40, text: 'You find a sturdy strap. +1 item slot.', effects: [{ type: 'slots', delta: 1 }] },
          { chancePct: 60, text: 'Something bites you. −10 HP.', effects: [{ type: 'damage', amount: 10 }] },
        ],
      },
      { id: 'leave', label: 'Decline', description: 'Nothing happens.', outcomes: [{ chancePct: 100, text: 'The Scavenger shrugs.', effects: [] }] },
    ],
  }),
  defineHappening({
    id: 'clockmaker',
    name: 'The Clockmaker',
    description: 'A workshop full of ticking things. Some of them are wrong on purpose.',
    requiresClock: true,
    options: [
      {
        id: 'tune',
        label: 'Tune the clock',
        description: '70%: +15s per round. 30%: −10s per round.',
        outcomes: [
          { chancePct: 70, text: 'The clock sings. +15s per round.', effects: [{ type: 'timeBonus', ms: 15_000 }] },
          { chancePct: 30, text: 'The clock laughs. −10s per round.', effects: [{ type: 'timeBonus', ms: -10_000 }] },
        ],
      },
      { id: 'leave', label: 'Leave it ticking', description: 'Nothing happens.', outcomes: [{ chancePct: 100, text: 'You back out of the workshop.', effects: [] }] },
    ],
  }),
  defineHappening({
    id: 'blood-pact',
    name: 'The Blood Pact',
    description: 'A page of red ink. The signature line is already warm.',
    options: [
      {
        id: 'sign',
        label: 'Sign in blood',
        description: 'Random spell. −8 HP.',
        outcomes: [
          { chancePct: 100, text: 'The ink drinks. A new spell appears.', effects: [{ type: 'damage', amount: 8 }, { type: 'giveSpell', spell: 'random' }] },
        ],
      },
      { id: 'leave', label: 'Put the pen down', description: 'Nothing happens.', outcomes: [{ chancePct: 100, text: 'The page folds itself shut.', effects: [] }] },
    ],
  }),
  defineHappening({
    id: 'merchant-gamble',
    name: "Merchant's Gamble",
    description: 'A merchant with a cup and three rattling dice. He is definitely cheating.',
    options: [
      {
        id: 'play',
        label: 'Pay 5 gold and roll',
        description: '60%: a random item. 40%: nothing.',
        costGold: 5,
        outcomes: [
          { chancePct: 60, text: 'The dice come up. You win an item.', effects: [{ type: 'addRandomItem' }] },
          { chancePct: 40, text: 'The merchant smiles. The dice were loaded.', effects: [] },
        ],
      },
      { id: 'leave', label: 'Walk away', description: 'Nothing happens.', outcomes: [{ chancePct: 100, text: 'The merchant looks disappointed.', effects: [] }] },
    ],
  }),
  defineHappening({
    id: 'feast',
    name: 'The Long Table',
    description: 'A table that goes on further than the room should allow. Everyone is eating.',
    options: [
      {
        id: 'eat',
        label: 'Sit down and eat',
        description: 'Eat: heal and trigger on-eat items.',
        outcomes: [{ chancePct: 100, text: 'You eat until the room stops spinning.', effects: [{ type: 'eat', food: 'feast' }] }],
      },
      { id: 'leave', label: 'Keep walking', description: 'Nothing happens.', outcomes: [{ chancePct: 100, text: 'You keep walking.', effects: [] }] },
    ],
  }),
  defineHappening({
    id: 'black-market',
    name: 'The Black Market',
    description: 'A stall that sells things with the labels scratched off.',
    options: [
      {
        id: 'spell',
        label: 'Buy a bottled spell',
        description: 'Gain a random spell.',
        costGold: 1,
        outcomes: [{ chancePct: 100, text: 'The bottle is warm. A new spell is yours.', effects: [{ type: 'giveSpell', spell: 'random' }] }],
      },
      {
        id: 'armor',
        label: 'Buy a dented plate',
        description: '+1 max armor.',
        costGold: 5,
        outcomes: [{ chancePct: 100, text: 'The plate is ugly, but it will hold. +1 armor.', effects: [{ type: 'maxArmor', delta: 1 }] }],
      },
      { id: 'leave', label: 'Leave', description: 'Nothing happens.', outcomes: [{ chancePct: 100, text: 'You leave with your gold.', effects: [] }] },
    ],
  }),
  defineHappening({
    id: 'letter-garden',
    name: 'The Letter Garden',
    description: 'Rows of letters grow out of dark soil. Something is buried under them.',
    options: [
      {
        id: 'pull',
        label: 'Pull a root',
        description: '50%: +1 slot. 50%: −{level} HP.',
        outcomes: [
          { chancePct: 50, text: 'A leather strap comes up with the root. +1 item slot.', effects: [{ type: 'slots', delta: 1 }] },
          { chancePct: 50, text: 'The root pulls back. −{level} HP.', effects: [{ type: 'damageLevel' }] },
        ],
      },
      {
        id: 'eat',
        label: 'Eat a letter',
        description: 'Recover 6 HP and trigger on-eat items.',
        outcomes: [{ chancePct: 100, text: 'It tastes like copper and rain.', effects: [{ type: 'heal', amount: 6 }, { type: 'eatRandom' }] }],
      },
    ],
  }),
  defineHappening({
    id: 'scrap-cart',
    name: 'The Scrap Cart',
    description: 'A cart of dented items and half-eaten meals. The owner does not look up.',
    options: [
      {
        id: 'gear',
        label: 'Buy a random item',
        description: '8 gold: random item.',
        costGold: 8,
        outcomes: [{ chancePct: 100, text: 'You dig something out of the pile.', effects: [{ type: 'addRandomItem' }] }],
      },
      {
        id: 'meal',
        label: 'Buy a random meal',
        description: '4 gold: eat a random food.',
        costGold: 4,
        outcomes: [{ chancePct: 100, text: 'You eat whatever is in the bowl.', effects: [{ type: 'eatRandom' }] }],
      },
      { id: 'leave', label: 'Walk past', description: 'Nothing happens.', outcomes: [{ chancePct: 100, text: 'The cart creaks on.', effects: [] }] },
    ],
  }),
  defineHappening({
    id: 'echo-well',
    name: 'The Echo Well',
    description: 'A well that repeats the last thing you dropped in, in your own voice.',
    options: [
      {
        id: 'listen',
        label: 'Lower the bucket',
        description: '60%: random spell. 40%: −3 HP.',
        outcomes: [
          { chancePct: 60, text: 'The echo comes back shaped like a spell.', effects: [{ type: 'giveSpell', spell: 'random' }] },
          { chancePct: 40, text: 'Something else answers. It bites. −3 HP.', effects: [{ type: 'damage', amount: 3 }] },
        ],
      },
      {
        id: 'coins',
        label: 'Throw in coins',
        description: '3 gold. 60%: gain 9 gold. 40%: nothing.',
        costGold: 3,
        outcomes: [
          { chancePct: 60, text: 'The well returns your coins with interest.', effects: [{ type: 'gold', amount: 9 }] },
          { chancePct: 40, text: 'The well keeps them. Rude.', effects: [] },
        ],
      },
    ],
  }),
  defineHappening({
    id: 'revisor',
    name: 'The Revisor',
    description: 'A thin figure with a red pen and no face to speak of.',
    options: [
      {
        id: 'accept',
        label: 'Accept the edits',
        description: '70%: two random spells. 30%: -5 HP.',
        outcomes: [
          {
            chancePct: 70,
            text: 'The red ink rewrites something in your favour. Two spells.',
            effects: [
              { type: 'giveSpell', spell: 'random' },
              { type: 'giveSpell', spell: 'random' },
            ],
          },
          { chancePct: 30, text: 'The red ink finds a flaw. -5 HP.', effects: [{ type: 'damage', amount: 5 }] },
        ],
      },
      {
        id: 'refuse',
        label: 'Refuse the edits',
        description: '+3 gold and move on.',
        outcomes: [{ chancePct: 100, text: 'You keep the original draft. It is worth something.', effects: [{ type: 'gold', amount: 3 }] }],
      },
    ],
  }),
  defineHappening({
    id: 'redaction',
    name: 'The Redaction',
    description: 'A clerk with a bottle of correction fluid and no interest in your opinion.',
    options: [
      {
        id: 'one',
        label: 'Erase one letter',
        description: '5 gold: purge one letter.',
        costGold: 5,
        outcomes: [{ chancePct: 100, text: 'The letter is gone. So is every word that needed it.', effects: [{ type: 'pendingPurge', count: 1 }] }],
      },
      {
        id: 'two',
        label: 'Erase two letters',
        description: '10 gold: purge two letters.',
        costGold: 10,
        outcomes: [{ chancePct: 100, text: 'Two letters disappear under the fluid.', effects: [{ type: 'pendingPurge', count: 2 }] }],
      },
      {
        id: 'rest',
        label: 'Rest and let your items work',
        description: 'Trigger one eat. 10% chance to remove a random curse.',
        outcomes: [{
          chancePct: 100,
          text: 'You rest. Something in your pack shifts, and a burden may slip away.',
          effects: [
            { type: 'eatBurst', count: 1 },
            { type: 'removeRandomCurse', chancePct: 10 },
          ],
        }],
      },
      { id: 'leave', label: 'Leave the paperwork', description: 'Nothing happens.', outcomes: [{ chancePct: 100, text: 'The clerk stamps something and forgets you.', effects: [] }] },
    ],
  }),
  defineHappening({
    id: 'confessional',
    name: 'The Confessional',
    description: 'A quiet booth with three prices and one promise: maybe.',
    requiresCurseCount: 1,
    options: [
      {
        id: 'small',
        label: 'Small offering',
        description: '5 gold: 45% chance to remove a random curse.',
        costGold: 5,
        outcomes: [
          { chancePct: 45, text: 'A weight lifts. One curse is gone.', effects: [{ type: 'removeRandomCurse' }] },
          { chancePct: 55, text: 'The booth stays silent. Nothing is removed.', effects: [] },
        ],
      },
      {
        id: 'large',
        label: 'Large offering',
        description: '10 gold: 75% chance to remove a random curse.',
        costGold: 10,
        outcomes: [
          { chancePct: 75, text: 'The burden breaks. One curse is gone.', effects: [{ type: 'removeRandomCurse' }] },
          { chancePct: 25, text: 'The booth takes the gold and offers nothing.', effects: [] },
        ],
      },
      {
        id: 'everything',
        label: 'Everything you have',
        description: '15 gold: remove a random curse.',
        costGold: 15,
        outcomes: [
          { chancePct: 100, text: 'The burden breaks. One curse is gone.', effects: [{ type: 'removeRandomCurse' }] },
        ],
      },
      { id: 'leave', label: 'Walk away', description: 'Nothing happens.', outcomes: [{ chancePct: 100, text: 'You leave the booth empty-handed.', effects: [] }] },
    ],
  }),
  defineHappening({
    id: 'detour',
    name: 'The Detour',
    description: 'A side road, a bakery sign, and a pocket that was not there before.',
    options: [
      {
        id: 'slot',
        label: 'Take the extra pocket',
        description: '+1 item slot.',
        outcomes: [{ chancePct: 100, text: 'You find room for one more thing.', effects: [{ type: 'slots', delta: 1 }] }],
      },
      {
        id: 'bakery',
        label: 'Visit the Time Bakery',
        description: '+8 max HP and a Time Freeze spell.',
        outcomes: [{
          chancePct: 100,
          text: 'The bakery sells you a slice of tomorrow and a little borrowed time.',
          effects: [
            { type: 'maxHp', delta: 8 },
            { type: 'giveSpell', spell: 'time-freeze' },
          ],
        }],
      },
    ],
  }),
  defineHappening({
    id: 'crossroads',
    name: 'The Crossroads',
    description: 'A shop on one road and a quiet fire on the other.',
    options: [
      {
        id: 'shop',
        label: 'Take the shop road',
        description: 'Open a shop right now.',
        outcomes: [{ chancePct: 100, text: 'You follow the lanterns to a shop.', effects: [{ type: 'openShop' }] }],
      },
      {
        id: 'rest',
        label: 'Rest by the fire',
        description: 'Gain a Heal spell and a Time Freeze spell.',
        outcomes: [{
          chancePct: 100,
          text: 'You rest, and the fire leaves two spells in the ashes.',
          effects: [
            { type: 'giveSpell', spell: 'heal' },
            { type: 'giveSpell', spell: 'time-freeze' },
          ],
        }],
      },
    ],
  }),
  defineHappening({
    id: 'trade',
    name: 'The Trade',
    description: 'A merchant with three ways to balance the scales.',
    options: [
      {
        id: 'buy-slot',
        label: 'Buy a slot',
        description: 'Lose 10 gold: +1 item slot.',
        costGold: 10,
        outcomes: [{ chancePct: 100, text: 'Coins change hands. Your loadout grows.', effects: [{ type: 'slots', delta: 1 }] }],
      },
      {
        id: 'sell-slot',
        label: 'Sell a slot',
        description: 'Lose 1 item slot: gain 20 gold.',
        outcomes: [{ chancePct: 100, text: 'You trade carrying room for a heavy purse.', effects: [{ type: 'slots', delta: -1 }, { type: 'gold', amount: 20 }] }],
      },
      {
        id: 'heal',
        label: 'Take the heals',
        description: 'Gain two Heal spells.',
        outcomes: [{ chancePct: 100, text: 'The merchant wraps two poultices in paper.', effects: [{ type: 'giveSpell', spell: 'heal' }, { type: 'giveSpell', spell: 'heal' }] }],
      },
    ],
  }),
  defineHappening({
    id: 'bone-dice',
    name: 'Bone Dice',
    description: 'Two dice carved from something that used to answer questions.',
    options: [
      {
        id: 'roll',
        label: 'Roll for a spell',
        description: '50%: random spell. 50%: −4 HP.',
        outcomes: [
          { chancePct: 50, text: 'Double six. A spell falls out of the cup.', effects: [{ type: 'giveSpell', spell: 'random' }] },
          { chancePct: 50, text: 'Snake eyes. Something bites your hand. −4 HP.', effects: [{ type: 'damage', amount: 4 }] },
        ],
      },
      {
        id: 'leave',
        label: 'Leave the dice alone',
        description: 'Nothing happens.',
        outcomes: [{ chancePct: 100, text: 'They keep rattling after you leave.', effects: [] }],
      },
    ],
  }),
  defineHappening({
    id: 'curse-broker',
    name: 'The Curse Broker',
    description: 'A quiet stall with a ledger full of other people’s burdens.',
    requiresCurseCount: 1,
    options: [
      {
        id: 'relic',
        label: 'Buy a rare item',
        description: '12 gold. The item uses 1 item slot.',
        costGold: 12,
        outcomes: [{
          chancePct: 100,
          text: 'He slides a rare item across the counter.',
          effects: [{ type: 'addRandomRelic' }],
        }],
      },
      {
        id: 'remove',
        label: 'Remove a random curse',
        description: '15 gold.',
        costGold: 15,
        outcomes: [{
          chancePct: 100,
          text: 'He uncorks one burden and lets it evaporate.',
          effects: [{ type: 'removeRandomCurse' }],
        }],
      },
      {
        id: 'leave',
        label: 'Leave',
        description: 'Nothing happens.',
        outcomes: [{ chancePct: 100, text: 'The broker closes the ledger.', effects: [] }],
      },
    ],
  }),
  defineHappening({
    id: 'babification',
    name: 'Babification',
    description: 'A nursery rhyme crawls into your ears. The room gets bigger, or you do.',
    requiresCurseCount: 1,
    options: [
      {
        id: 'slots',
        label: 'Give up your pockets',
        description: 'Remove a random curse. Item slots drop to their starting value.',
        outcomes: [{
          chancePct: 100,
          text: 'Your items spill out as the pack shrinks to a child-size satchel.',
          effects: [
            { type: 'removeRandomCurse' },
            { type: 'resetSlotsToStart' },
          ],
        }],
      },
      {
        id: 'armor',
        label: 'Give up your plating',
        description: 'Remove a random curse. Max armor drops to its starting value.',
        outcomes: [{
          chancePct: 100,
          text: 'The plate peels away like a milk tooth, leaving only the frame you were born with.',
          effects: [
            { type: 'removeRandomCurse' },
            { type: 'resetArmorToStart' },
          ],
        }],
      },
    ],
  }),
  defineHappening({
    id: 'the-bargain',
    name: 'The Bargain',
    description: 'Two objects on a table. One is help. One is a new rule.',
    weight: 2,
    options: [
      {
        id: 'draw',
        label: 'Draw one',
        description: '60%: random item. 40%: random curse.',
        outcomes: [
          {
            chancePct: 60,
            text: 'Something small and useful is on the table.',
            effects: [{ type: 'addPreviewItem' }],
          },
          {
            chancePct: 40,
            text: 'Something permanent and unpleasant is on the table.',
            effects: [{ type: 'addPreviewCurse' }],
          },
        ],
      },
      {
        id: 'leave',
        label: 'Walk away',
        description: 'Nothing happens.',
        outcomes: [{ chancePct: 100, text: 'You leave both where they lie.', effects: [] }],
      },
    ],
  }),
  defineHappening({
    id: 'the-scales',
    name: 'The Scales',
    description: 'A scale with two pans. One holds what you could become; the other holds what you have.',
    options: [
      {
        id: 'grow',
        label: 'Tip the scale',
        description: 'Double max HP. Current HP is halved.',
        outcomes: [{
          chancePct: 100,
          text: 'The pan drops. Your body stretches to fit a larger life.',
          effects: [
            { type: 'maxHpMultiply', factor: 2 },
            { type: 'hpMultiply', factor: 0.5 },
          ],
        }],
      },
      {
        id: 'plate',
        label: 'Take the small plate',
        description: '+1 max armor.',
        outcomes: [{
          chancePct: 100,
          text: 'A thin plate fits under your coat.',
          effects: [{ type: 'maxArmor', delta: 1 }],
        }],
      },
    ],
  }),
  defineHappening({
    id: 'sanctuary',
    name: 'The Sanctuary',
    description: 'A quiet room with a bed in one corner and a sturdy shelf in the other.',
    options: [
      {
        id: 'rest',
        label: 'Sleep until whole',
        description: 'Heal to full HP.',
        outcomes: [{
          chancePct: 100,
          text: 'You wake up whole, and the room is already forgetting you.',
          effects: [{ type: 'healPercent', percent: 100 }],
        }],
      },
      {
        id: 'shelf',
        label: 'Take the shelf',
        description: '+1 item slot.',
        outcomes: [{
          chancePct: 100,
          text: 'You break the shelf down into a sturdy carrying frame.',
          effects: [{ type: 'slots', delta: 1 }],
        }],
      },
    ],
  }),
  defineHappening({
    id: 'kind-stranger',
    name: 'The Kind Stranger',
    description: 'A traveler holds out two hands: medicine in one, a purse in the other.',
    options: [
      {
        id: 'medicine',
        label: 'Take the medicine',
        description: 'Gain two Heal spells.',
        outcomes: [{
          chancePct: 100,
          text: 'The poultices are warm and smell faintly of rain.',
          effects: [
            { type: 'giveSpell', spell: 'heal' },
            { type: 'giveSpell', spell: 'heal' },
          ],
        }],
      },
      {
        id: 'purse',
        label: 'Take the purse',
        description: 'Gain 8 gold.',
        outcomes: [{
          chancePct: 100,
          text: 'The purse is heavier than it looked.',
          effects: [{ type: 'gold', amount: 8 }],
        }],
      },
    ],
  }),
  defineHappening({
    id: 'stone-door',
    name: 'The Stone Door',
    description: 'A door carved with a heartbeat. A shop sign points the other way.',
    options: [
      {
        id: 'heart',
        label: 'Press your hand to the door',
        description: '+6 max HP.',
        outcomes: [{
          chancePct: 100,
          text: 'The stone beats once, and something in you beats back harder.',
          effects: [{ type: 'maxHp', delta: 6 }],
        }],
      },
      {
        id: 'shop',
        label: 'Follow the shop sign',
        description: 'Open a shop right now.',
        outcomes: [{
          chancePct: 100,
          text: 'The sign leads to a shelf that was not there a moment ago.',
          effects: [{ type: 'openShop' }],
        }],
      },
    ],
  }),
  defineHappening({
    id: 'coin-box',
    name: 'The Coin Box',
    description: 'A locked box with two prices scratched into the lid.',
    options: [
      {
        id: 'heal',
        label: 'Buy the poultices',
        description: '1 gold: two Heal spells.',
        costGold: 1,
        outcomes: [{
          chancePct: 100,
          text: 'The box opens on two warm paper packets.',
          effects: [
            { type: 'giveSpell', spell: 'heal' },
            { type: 'giveSpell', spell: 'heal' },
          ],
        }],
      },
      {
        id: 'slot',
        label: 'Buy the pocket',
        description: '10 gold: +1 item slot.',
        costGold: 10,
        outcomes: [{
          chancePct: 100,
          text: 'The box opens on a folded pocket with room to spare.',
          effects: [{ type: 'slots', delta: 1 }],
        }],
      },
    ],
  }),
  defineHappening({
    id: 'red-ledger',
    name: 'The Red Ledger',
    description: 'A ledger open to two entries. One is written in green ink, the other in red.',
    options: [
      {
        id: 'heal',
        label: 'Take the green entry',
        description: 'Gain a Heal spell.',
        outcomes: [{
          chancePct: 100,
          text: 'The green ink spreads into your hands and closes over them.',
          effects: [{ type: 'giveSpell', spell: 'heal' }],
        }],
      },
      {
        id: 'gold',
        label: 'Take the red entry',
        description: 'Lose 6 HP: gain 6 gold.',
        outcomes: [{
          chancePct: 100,
          text: 'The red ink takes its price, and the ledger pays in coins.',
          effects: [
            { type: 'damage', amount: 6, ignoreArmor: true },
            { type: 'gold', amount: 6 },
          ],
        }],
      },
    ],
  }),
  defineHappening({
    id: 'endless-table',
    name: 'The Endless Table',
    description: 'Dishes keep arriving. Nobody is eating.',
    options: [
      {
        id: 'eat',
        label: 'Eat everything',
        description: 'Trigger every on-eat effect 7 times.',
        outcomes: [{
          chancePct: 100,
          text: 'Seven courses later, your items are still working.',
          effects: [{ type: 'eatBurst', count: 7 }],
        }],
      },
      {
        id: 'gold',
        label: 'Take the tip jar',
        description: 'Gain 7 gold.',
        outcomes: [{
          chancePct: 100,
          text: 'Seven coins, still warm.',
          effects: [{ type: 'gold', amount: 7 }],
        }],
      },
    ],
  }),
  defineHappening({
    id: 'purge-the-letter',
    name: 'Purge the Letter',
    description: 'Two letters are listed for erasure. You may remove one.',
    options: [
      {
        id: 'leave',
        label: 'Set the list down',
        description: 'Nothing happens.',
        outcomes: [{ chancePct: 100, text: 'The list stays as it was.', effects: [] }],
      },
    ],
  }),
  defineHappening({
    id: 'spell-tithe',
    name: 'The Spell Tithe',
    description: 'A quiet collector offers knowledge or erasure. Both cost one random spell from your list.',
    options: [
      {
        id: 'leave',
        label: 'Keep your spells',
        description: 'Nothing happens.',
        outcomes: [{ chancePct: 100, text: 'The collector closes the ledger.', effects: [] }],
      },
    ],
  }),
  defineHappening({
    id: 'spellbroker',
    name: 'The Spellbroker',
    description: 'A merchant with ink-stained cuffs and no interest in gold. He only wants the spells you carry.',
    options: [
      {
        id: 'omen',
        label: 'Trade Omen',
        description: 'Lose Omen. Permanently learn a random letter.',
        requiresSpell: 'omen',
        outcomes: [{
          chancePct: 100,
          text: 'He folds the Omen into his sleeve and marks a new letter in your book.',
          effects: [
            { type: 'removeSpell', spell: 'omen' },
            { type: 'revealPermanentRandom' },
          ],
        }],
      },
      {
        id: 'phone-friend',
        label: 'Trade Phone a Friend',
        description: 'Lose Phone a Friend. Permanently learn a random letter.',
        requiresSpell: 'phone-friend',
        outcomes: [{
          chancePct: 100,
          text: 'He keeps the phone. In return, one more letter is yours for good.',
          effects: [
            { type: 'removeSpell', spell: 'phone-friend' },
            { type: 'revealPermanentRandom' },
          ],
        }],
      },
      {
        id: 'heal',
        label: 'Trade Heal',
        description: 'Lose Heal. Gain +10 max HP and heal 10 HP.',
        requiresSpell: 'heal',
        outcomes: [{
          chancePct: 100,
          text: 'He takes the Heal and leaves you with a sturdier body.',
          effects: [
            { type: 'removeSpell', spell: 'heal' },
            { type: 'maxHp', delta: 10 },
            { type: 'heal', amount: 10 },
          ],
        }],
      },
      {
        id: 'immunity',
        label: 'Trade Immunity',
        description: 'Lose Immunity. Gain +5 armor.',
        requiresSpell: 'immunity',
        outcomes: [{
          chancePct: 100,
          text: 'He pockets the Immunity and straps a plate over your ribs.',
          effects: [
            { type: 'removeSpell', spell: 'immunity' },
            { type: 'maxArmor', delta: 5 },
            { type: 'armor', delta: 5 },
          ],
        }],
      },
      {
        id: 'restore',
        label: 'Trade Restore',
        description: 'Lose Restore. Gain +5 armor.',
        requiresSpell: 'restore',
        outcomes: [{
          chancePct: 100,
          text: 'He takes Restore and leaves you with five more plates.',
          effects: [
            { type: 'removeSpell', spell: 'restore' },
            { type: 'maxArmor', delta: 5 },
            { type: 'armor', delta: 5 },
          ],
        }],
      },
      {
        id: 'leave',
        label: 'Keep your spells',
        description: 'Nothing happens.',
        outcomes: [{ chancePct: 100, text: 'The merchant bows and steps aside.', effects: [] }],
      },
    ],
  }),
  defineHappening({
    id: 'hollow-pocket',
    name: 'The Hollow Pocket',
    description: 'A hand offers to lighten your load, or to reach into a darker pocket.',
    options: [
      {
        id: 'slot',
        label: 'Give up a slot',
        description: '-1 item slot.',
        outcomes: [{
          chancePct: 100,
          text: 'You hand over part of your kit and feel the space close behind it.',
          effects: [{ type: 'slots', delta: -1 }],
        }],
      },
      {
        id: 'gamble',
        label: 'Reach into the dark',
        description: '50%: gain a specific random curse. 50%: nothing happens.',
        outcomes: [
          {
            chancePct: 50,
            text: 'The pocket is empty.',
            effects: [],
          },
          {
            chancePct: 50,
            text: 'Something cold closes around your hand.',
            effects: [{ type: 'addPreviewCurse' }],
          },
        ],
      },
    ],
  }),
  defineHappening({
    id: 'forbidden-feast',
    name: 'The Forbidden Feast',
    description: 'A rare dish under a silver cover. Something under the table waits for payment.',
    options: [
      {
        id: 'eat',
        label: 'Eat the rare food',
        description: 'Gain a specific random rare food. 50%: also gain a specific random curse.',
        outcomes: [
          {
            chancePct: 50,
            text: 'The meal is worth it.',
            effects: [{ type: 'addPreviewFood' }],
          },
          {
            chancePct: 50,
            text: 'The meal is worth it. Something follows you.',
            effects: [
              { type: 'addPreviewFood' },
              { type: 'addPreviewCurse' },
            ],
          },
        ],
      },
      {
        id: 'leave',
        label: 'Walk away',
        description: 'Nothing happens.',
        outcomes: [{ chancePct: 100, text: 'You leave the cover where it lies.', effects: [] }],
      },
    ],
  }),
  defineHappening({
    id: 'flesh-market',
    name: 'The Flesh Market',
    description: 'A butcher with a ledger instead of a cleaver. He pays by the pound.',
    options: [
      {
        id: 'hp',
        label: 'Sell half your max HP',
        description: 'Lose half your max HP. Gain 2 gold per max HP lost.',
        outcomes: [{
          chancePct: 100,
          text: 'You sign, and the butcher measures you twice.',
          effects: [],
        }],
      },
      {
        id: 'armor',
        label: 'Sell all your armor',
        description: 'Lose all your max armor. Gain 4 gold per max armor lost.',
        outcomes: [{
          chancePct: 100,
          text: 'The butcher weighs the plate and pays without a word.',
          effects: [],
        }],
      },
      {
        id: 'leave',
        label: 'Leave',
        description: 'Nothing happens.',
        outcomes: [{ chancePct: 100, text: 'You keep your body to yourself.', effects: [] }],
      },
    ],
  }),
  defineHappening({
    id: 'toll-collector',
    name: 'The Toll Collector',
    description: 'A thin man waits beside the road with a ledger and an empty hand. Every road has a debt.',
    options: [
      {
        id: 'pay',
        label: 'Pay 11 gold',
        description: 'Settle the debt and walk on.',
        costGold: 11,
        outcomes: [{
          chancePct: 100,
          text: 'He counts the coins twice, closes the ledger, and steps aside.',
          effects: [],
        }],
      },
      {
        id: 'refuse',
        label: 'Refuse: draft an extra curse',
        description: 'Keep your gold. The debt is written as a permanent curse.',
        outcomes: [{
          chancePct: 100,
          text: 'He writes the debt into your curses. Choose one.',
          effects: [],
        }],
      },
    ],
  }),
  defineHappening({
    id: 'peddlers-table',
    name: "The Peddler's Table",
    description: 'Three objects wait on a scrap of velvet. The peddler taps one, then another, and says nothing.',
    options: [
      {
        id: 'red-amulet',
        label: 'Take the Red Amulet',
        description: 'A warm red stone that stirs when powerful things fall. It may matter later.',
        outcomes: [{
          chancePct: 100,
          text: 'You take the amulet. It is warmer than it should be.',
          effects: [{ type: 'addItem', item: 'red-amulet' }],
        }],
      },
      {
        id: 'silver-key',
        label: 'Take the Silver Key',
        description: 'An ornate key with no lock in sight. It may matter later.',
        outcomes: [{
          chancePct: 100,
          text: 'You take the key. It is cold and perfectly balanced.',
          effects: [{ type: 'addItem', item: 'silver-key' }],
        }],
      },
      {
        id: 'nonsensical-map',
        label: 'Take the Nonsensical Map',
        description: 'A map of impossible places. It may matter later.',
        outcomes: [{
          chancePct: 100,
          text: 'You take the map. A route folds itself toward you.',
          effects: [{ type: 'addItem', item: 'nonsensical-map' }],
        }],
      },
    ],
  }),
  defineHappening({
    id: 'unredaction',
    name: 'The Unredaction',
    description: 'A clerk with a bottle of white ink and a list of everything you crossed out.',
    options: [
      {
        id: 'curse',
        label: 'Take a curse instead',
        description: 'Draft a curse. The letters stay erased.',
        outcomes: [{
          chancePct: 100,
          text: 'You sign the curse. The white ink stays capped.',
          effects: [],
        }],
      },
    ],
  }),
];

export const HAPPENING_BY_ID = new Map(HAPPENINGS.map((h) => [h.id, h]));
