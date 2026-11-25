// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { game } from '../src/game';
import {
  BOSSES,
  CHARACTERS,
  CONTENT,
  CURSE_BY_ID,
  CURSES,
  FOODS,
  HAPPENING_BY_ID,
  HAPPENINGS,
  ITEMS,
  SPELLS,
} from '../src/content';
import { glossaryText } from '../src/ui/glossary';

function stringsFromContent(): string[] {
  const strings: Array<string | undefined> = [];
  for (const item of ITEMS) {
    strings.push(item.name, item.description);
    try {
      strings.push(item.dynamicDescription?.({}));
    } catch {
      // Some dynamic descriptions need live data. Static text is enough here.
    }
  }
  for (const spell of SPELLS) strings.push(spell.name, spell.description);
  for (const food of FOODS) strings.push(food.name, food.description);
  for (const boss of BOSSES) strings.push(boss.name, boss.description, ...boss.rules);
  for (const curse of CURSES) {
    strings.push(curse.name, curse.description, ...curse.rules);
  }
  for (const happening of HAPPENINGS) {
    strings.push(happening.name, happening.description);
    for (const option of happening.options) {
      strings.push(option.label, option.description);
      for (const outcome of option.outcomes) strings.push(outcome.text);
    }
  }
  for (const character of CHARACTERS) {
    strings.push(character.name, character.tagline, character.description, character.unlockHint);
  }
  return strings.filter((value): value is string => typeof value === 'string');
}

function expectNoRelic(text: string, label: string): void {
  expect(text, label).not.toMatch(/relic/i);
}

function scanDom(root: HTMLElement, label: string): void {
  expectNoRelic(root.textContent ?? '', label);
  for (const element of root.querySelectorAll<HTMLElement>('[data-tip], [title], [aria-label]')) {
    for (const attribute of ['data-tip', 'title', 'aria-label']) {
      const value = element.getAttribute(attribute);
      if (value) expectNoRelic(value, `${label} ${attribute}`);
    }
  }
}

async function renderWithSave(
  state: ReturnType<typeof game.newRun>['state'],
): Promise<HTMLElement> {
  document.body.innerHTML = '<div id="app"></div>';
  localStorage.clear();
  localStorage.setItem('blacklist.run.v1', game.serialize(state));
  vi.resetModules();
  await import('../src/ui/app');
  const root = document.getElementById('app') as HTMLElement;
  root.querySelector<HTMLElement>('[data-action="resume"]')!.click();
  return root;
}

describe('player-facing relic wording', () => {
  it('never appears in content strings, glossary text, or README prose', () => {
    const strings = stringsFromContent();
    for (const text of strings) expectNoRelic(text, text);
    expect(CURSE_BY_ID.size).toBeGreaterThan(0);
    expect(CONTENT.items.length).toBeGreaterThan(0);
    expect(glossaryText('relic')).not.toContain('class="kw"');
    expectNoRelic(readFileSync('README.md', 'utf8'), 'README');
  });

  it('never appears in rendered shop, reward, or event DOM', async () => {
    const shop = game.newRun({ seed: 'wording-shop' }).state;
    shop.phase = 'shop';
    shop.shop = {
      offers: [
        { id: 'o0', kind: 'item', def: 'x-marks', price: 5 },
        { id: 'o1', kind: 'eat', def: 'snack', price: 3 },
        { id: 'o2', kind: 'spell', def: 'heal', price: 4 },
      ],
      rerollCost: 1,
      rerolls: 0,
      purchases: 0,
      visit: 0,
      foodOffers: 1,
      foodsBought: 0,
    };
    scanDom(await renderWithSave(shop), 'shop');

    const reward = game.newRun({ seed: 'wording-reward' }).state;
    reward.phase = 'reward';
    reward.reward = {
      options: [
        {
          id: 'item:x-marks',
          kind: 'item',
          def: 'x-marks',
          label: 'X Marks',
          description: 'A player guess with X: +1 gold and +1 max armor.',
          rarity: 'common',
        },
        {
          id: 'eat:snack',
          kind: 'eat',
          def: 'snack',
          label: 'Snack',
          description: 'Recover 5 HP. No slot.',
        },
      ],
      boss: false,
    };
    scanDom(await renderWithSave(reward), 'reward');

    const event = game.newRun({ seed: 'wording-event' }).state;
    const def = HAPPENING_BY_ID.get('curse-broker')!;
    event.phase = 'happening';
    event.happening = {
      id: def.id,
      options: def.options.map((option) => ({
        id: option.id,
        label: option.label,
        description: option.description,
        costGold: option.costGold,
        outcomes: option.outcomes.map((outcome) => ({
          chancePct: outcome.chancePct,
          text: outcome.text,
        })),
      })),
    };
    scanDom(await renderWithSave(event), 'event');
  });
});
