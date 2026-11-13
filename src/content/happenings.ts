import { defineHappening, type HappeningDef } from '../core/types';

export const HAPPENINGS: HappeningDef[] = [
  defineHappening({
    id: 'word-eater',
    name: 'The Word Eater',
    description: 'A squat little thing with too many teeth. It is hungry for words.',
    options: [
      {
        id: 'feed',
        label: 'Feed it two words',
        description: '60%: remove 2 blacklist words. 40%: add 2.',
        outcomes: [
          { chancePct: 60, text: 'It spits two blacklisted words back at you.', effects: [{ type: 'blacklistRemoveRandom', count: 2 }] },
          { chancePct: 40, text: 'It eats two words and burps them onto your list.', effects: [{ type: 'blacklistAddRandom', count: 2 }] },
        ],
      },
      {
        id: 'leave',
        label: 'Back away',
        description: 'Nothing happens.',
        outcomes: [{ chancePct: 100, text: 'You leave the Word Eater to its meal.', effects: [] }],
      },
    ],
  }),
  defineHappening({
    id: 'scavenger',
    name: 'The Scavenger',
    description: 'A hooded figure offers you a deal from a bag of dented parts.',
    options: [
      {
        id: 'reach',
        label: 'Reach into the bag',
        description: '50%: +1 slot. 50%: −6 HP.',
        outcomes: [
          { chancePct: 50, text: 'You find a sturdy strap. +1 item slot.', effects: [{ type: 'slots', delta: 1 }] },
          { chancePct: 50, text: 'Something bites you. −6 HP.', effects: [{ type: 'damage', amount: 6 }] },
        ],
      },
      { id: 'leave', label: 'Decline', description: 'Nothing happens.', outcomes: [{ chancePct: 100, text: 'The Scavenger shrugs.', effects: [] }] },
    ],
  }),
  defineHappening({
    id: 'clockmaker',
    name: 'The Clockmaker',
    description: 'A workshop full of ticking things. Some of them are wrong on purpose.',
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
        costGold: 5,
        outcomes: [{ chancePct: 100, text: 'The bottle is warm. A new spell is yours.', effects: [{ type: 'giveSpell', spell: 'random' }] }],
      },
      {
        id: 'armor',
        label: 'Buy a dented plate',
        description: '+1 max armor.',
        costGold: 7,
        outcomes: [{ chancePct: 100, text: 'The plate is ugly, but it will hold. +1 armor.', effects: [{ type: 'maxArmor', delta: 1 }] }],
      },
      { id: 'leave', label: 'Leave', description: 'Nothing happens.', outcomes: [{ chancePct: 100, text: 'You leave with your gold.', effects: [] }] },
    ],
  }),
  defineHappening({
    id: 'ink-stain',
    name: 'The Ink Stain',
    description: 'A spilled pot of ink is writing a sentence without a hand.',
    options: [
      {
        id: 'read',
        label: 'Read the sentence',
        description: '60%: random spell. 40%: add a blacklist word.',
        outcomes: [
          { chancePct: 60, text: 'The ink spells out something useful. A new spell.', effects: [{ type: 'giveSpell', spell: 'random' }] },
          { chancePct: 40, text: 'The sentence is your name. The list grows.', effects: [{ type: 'blacklistAddRandom', count: 1 }] },
        ],
      },
      {
        id: 'smear',
        label: 'Smear it across the page',
        description: 'Remove one blacklist word.',
        outcomes: [{ chancePct: 100, text: 'The ink runs. One word is gone from the list.', effects: [{ type: 'blacklistRemoveRandom', count: 1 }] }],
      },
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
        description: '50%: +1 slot. 50%: −4 HP.',
        outcomes: [
          { chancePct: 50, text: 'A leather strap comes up with the root. +1 item slot.', effects: [{ type: 'slots', delta: 1 }] },
          { chancePct: 50, text: 'The root pulls back. −4 HP.', effects: [{ type: 'damage', amount: 4 }] },
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
    description: 'A cart of dented gear and half-eaten meals. The owner does not look up.',
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
        description: '70%: remove a blacklist word. 30%: add one.',
        outcomes: [
          { chancePct: 70, text: 'The echo comes back cleaner than it went in.', effects: [{ type: 'blacklistRemoveRandom', count: 1 }] },
          { chancePct: 30, text: 'Something else answers. A word joins the list.', effects: [{ type: 'blacklistAddRandom', count: 1 }] },
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
        description: '55%: random spell. 45%: −5 HP.',
        outcomes: [
          { chancePct: 55, text: 'The red ink rewrites something in your favour. A spell.', effects: [{ type: 'giveSpell', spell: 'random' }] },
          { chancePct: 45, text: 'The red ink finds a flaw. −5 HP.', effects: [{ type: 'damage', amount: 5 }] },
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
        description: '6 gold: purge one letter.',
        costGold: 6,
        outcomes: [{ chancePct: 100, text: 'The letter is gone. So is every word that needed it.', effects: [{ type: 'pendingPurge', count: 1 }] }],
      },
      {
        id: 'two',
        label: 'Erase two letters',
        description: '14 gold: purge two letters.',
        costGold: 14,
        outcomes: [{ chancePct: 100, text: 'Two letters disappear under the fluid.', effects: [{ type: 'pendingPurge', count: 2 }] }],
      },
      { id: 'leave', label: 'Leave the paperwork', description: 'Nothing happens.', outcomes: [{ chancePct: 100, text: 'The clerk stamps something and forgets you.', effects: [] }] },
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
];

export const HAPPENING_BY_ID = new Map(HAPPENINGS.map((h) => [h.id, h]));
