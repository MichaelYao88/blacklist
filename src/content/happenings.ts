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
        description: 'It may cough up two names from your blacklist — or add two new ones.',
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
        description: '50%: +1 item slot. 50%: take 6 damage.',
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
        description: '70%: +15s per future round. 30%: −10s per future round.',
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
        description: 'Gain a random spell. Lose 8 HP.',
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
        description: 'Heal and trigger any on-eat effects.',
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
        id: 'capacity',
        label: 'Buy a bigger book',
        description: '+2 blacklist capacity.',
        costGold: 4,
        outcomes: [{ chancePct: 100, text: 'The book grows heavier. +2 blacklist capacity.', effects: [{ type: 'blacklistCapacity', delta: 2 }] }],
      },
      {
        id: 'armor',
        label: 'Buy a dented plate',
        description: '+1 max armor charge.',
        costGold: 7,
        outcomes: [{ chancePct: 100, text: 'The plate is ugly, but it will hold. +1 armor.', effects: [{ type: 'maxArmor', delta: 1 }] }],
      },
      { id: 'leave', label: 'Leave', description: 'Nothing happens.', outcomes: [{ chancePct: 100, text: 'You leave with your gold.', effects: [] }] },
    ],
  }),
];

export const HAPPENING_BY_ID = new Map(HAPPENINGS.map((h) => [h.id, h]));
