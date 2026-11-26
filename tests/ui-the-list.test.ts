// @vitest-environment happy-dom
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { game } from '../src/game';
import { CONTENT } from '../src/content';
import { summarizeWordList } from '../src/core/wordcount';
import { restoreAppIntervals, stopAppIntervals } from './helpers/appIntervals';

const originalMatchMedia = window.matchMedia;

function setMobileMatchMedia(matches: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

function listItem() {
  return {
    instance: 'i-list-ui',
    id: 'the-list-glossary',
    data: {},
    equipped: true,
  };
}

async function boot(
  mobile: boolean,
  seed: string,
  seedRun: (state: ReturnType<typeof game.newRun>['state']) => void,
): Promise<HTMLElement> {
  stopAppIntervals();
  setMobileMatchMedia(mobile);
  localStorage.clear();
  const { state } = game.newRun({ seed, character: 'runner' });
  state.round!.answer = 'crane';
  state.round!.remainingMs = null;
  state.round!.timerStartMs = null;
  seedRun(state);
  localStorage.setItem('blacklist.run.v1', game.serialize(state));
  document.body.innerHTML = '<div id="app"></div>';
  vi.resetModules();
  await import('../src/ui/app');
  const root = document.getElementById('app') as HTMLElement;
  root.querySelector<HTMLElement>('[data-action="resume"]')!.click();
  return root;
}

function typeInto(root: HTMLElement, value: string): void {
  const input = root.querySelector<HTMLInputElement>('[data-list-input]')!;
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('Purgamanual UI', () => {
  let root: HTMLElement;

  beforeAll(async () => {
    root = await boot(false, 'list-ui', (state) => {
      state.items.push(listItem());
      state.round!.hints = { q: 'absent', z: 'absent' };
      state.purged = ['x'];
    });
  });

  function openList(): void {
    root.querySelector<HTMLElement>('[data-action="open-list"]')!.click();
  }

  function listInput(): HTMLInputElement {
    return root.querySelector<HTMLInputElement>('[data-list-input]')!;
  }

  function expectSummary(letters: string[]): void {
    const expected = summarizeWordList(CONTENT.answers, letters);
    const result = root.querySelector<HTMLElement>('.list-result')!;
    expect(result.dataset.listCount).toBe(String(expected.count));
    expect(result.dataset.listSample).toBe(expected.sample);
  }

  it('shows an OPEN button on the item card', () => {
    const card = [...root.querySelectorAll<HTMLElement>('.item-card')]
      .find((entry) => entry.textContent?.includes('Purgamanual'));
    const open = card?.querySelector<HTMLElement>('[data-action="open-list"]');
    expect(open?.textContent).toContain('OPEN');
    expect(card?.querySelector('[data-action="use"]')).toBeNull();
  });

  it('prefills the input with the default excluded letters', () => {
    openList();
    expect(root.querySelector('.list-modal')).not.toBeNull();
    expect(listInput().value).toBe('QXZ');
    expect(root.querySelector('[data-action="list-add"]')).toBeNull();
    expect(root.querySelector('.list-chip')).toBeNull();
    expect(root.querySelector<HTMLElement>('.list-result')?.textContent)
      .toContain('Without Q, X, Z there are');
    expectSummary(['q', 'x', 'z']);
  });

  it('updates the count and sample live as letters are typed', () => {
    openList();
    typeInto(root, `${listInput().value}A`);
    expect(listInput().value).toBe('QXZA');
    expectSummary(['a', 'q', 'x', 'z']);

    const result = root.querySelector<HTMLElement>('.list-result')!;
    expect(result.textContent).toContain('Sample:');
  });

  it('removes a prefilled letter when it is deleted', () => {
    openList();
    typeInto(root, listInput().value.slice(0, -1));
    expect(listInput().value).toBe('QX');
    expect(root.querySelector<HTMLElement>('.list-result')?.textContent)
      .toContain('Without Q, X there are');
    expectSummary(['q', 'x']);
  });

  it('restores the default prefill and result on RESET', () => {
    openList();
    typeInto(root, 'QXA');
    expect(listInput().value).toBe('QXA');
    root.querySelector<HTMLElement>('[data-action="list-reset"]')!.click();
    expect(listInput().value).toBe('QXZ');
    expectSummary(['q', 'x', 'z']);
  });

  it('says when no words remain', () => {
    openList();
    typeInto(root, 'abcdefghijklmnopqrstuvwxyz');
    expect(root.querySelector<HTMLElement>('.list-result')?.textContent)
      .toContain('Without A, B, C');
    expect(root.querySelector<HTMLElement>('.list-result')?.textContent)
      .toContain('there are no possible words.');
    expect(root.querySelector<HTMLElement>('.list-result')?.textContent)
      .not.toContain('Sample:');
    expect(root.querySelector<HTMLElement>('.list-result')?.dataset.listSample).toBe('');
    root.querySelector<HTMLElement>('[data-action="dismiss-list"]')!.click();
    expect(root.querySelector('.list-modal')).toBeNull();
  });
});

describe('Purgamanual mobile tab', () => {
  it('appends a fourth 📜 tab with the expected offsets and z-order', async () => {
    const root = await boot(true, 'list-mobile-tabs', (state) => {
      state.spells = [{ instance: 's-omen', id: 'omen' }];
      state.items = [
        { instance: 'i-necro', id: 'necronomicon', data: { fed: 0, _uses: 0 }, equipped: true },
        { instance: 'i-parrot', id: 'evil-parrot', data: { readyAt: 0, _suggestions: 0, _freeUsed: 0 }, equipped: true },
        listItem(),
      ];
    });
    const tabs = [...root.querySelectorAll<HTMLElement>('.mobile-item-tab')];
    expect(tabs).toHaveLength(3);
    expect(tabs.map((tab) => tab.dataset.action)).toEqual(['toggle-necro', 'toggle-parrot', 'toggle-list']);
    const listTab = root.querySelector<HTMLElement>('[data-action="toggle-list"]')!;
    expect(listTab.textContent).toContain('📜');
    expect(listTab.textContent).not.toContain('Purgamanual');
    expect(listTab.getAttribute('aria-label')).toBe('Purgamanual');
    expect(listTab.getAttribute('title')).toBe('Purgamanual');
    expect(root.querySelector<HTMLElement>('[data-action="toggle-spells"]')?.style.getPropertyValue('--tab-offset'))
      .toBe('0px');
    expect(root.querySelector<HTMLElement>('[data-action="toggle-necro"]')?.style.getPropertyValue('--tab-offset'))
      .toBe('82px');
    expect(root.querySelector<HTMLElement>('[data-action="toggle-parrot"]')?.style.getPropertyValue('--tab-offset'))
      .toBe('122px');
    expect(listTab.style.getPropertyValue('--tab-offset')).toBe('162px');
    expect(root.querySelector<HTMLElement>('[data-action="toggle-necro"]')?.style.getPropertyValue('--tab-z'))
      .toBe('62');
    expect(root.querySelector<HTMLElement>('[data-action="toggle-parrot"]')?.style.getPropertyValue('--tab-z'))
      .toBe('61');
    expect(listTab.style.getPropertyValue('--tab-z')).toBe('60');
  });

  it('opens the list drawer and its modal without disturbing other drawers', async () => {
    const root = await boot(true, 'list-mobile-drawer', (state) => {
      state.spells = [{ instance: 's-omen', id: 'omen' }];
      state.items = [
        { instance: 'i-parrot', id: 'evil-parrot', data: { readyAt: 0, _suggestions: 0, _freeUsed: 0 }, equipped: true },
        listItem(),
      ];
    });
    root.querySelector<HTMLElement>('[data-action="toggle-list"]')!.click();
    expect(root.querySelector('.mobile-item[data-mobile-item="list"]')?.classList.contains('open'))
      .toBe(true);
    expect(root.querySelector('.mobile-item[data-mobile-item="parrot"]')?.classList.contains('open'))
      .toBe(false);
    expect(root.querySelector('.mobile-item[data-mobile-item="list"] [data-action="open-list"]'))
      .not.toBeNull();

    root.querySelector<HTMLElement>('[data-action="toggle-parrot"]')!.click();
    expect(root.querySelector('.mobile-item[data-mobile-item="list"]')?.classList.contains('open'))
      .toBe(false);
    expect(root.querySelector('.mobile-item[data-mobile-item="parrot"]')?.classList.contains('open'))
      .toBe(true);

    root.querySelector<HTMLElement>('[data-action="toggle-list"]')!.click();
    root.querySelector<HTMLElement>('[data-action="open-list"]')!.click();
    expect(root.querySelector('.list-modal')).not.toBeNull();
    expect(root.querySelector<HTMLElement>('.mobile-item[data-mobile-item="list"]')?.classList.contains('open'))
      .toBe(false);
    root.querySelector<HTMLElement>('[data-action="dismiss-list"]')!.click();
  });

  it('has no list tab when the item is not owned', async () => {
    const root = await boot(true, 'list-mobile-absent', (state) => {
      state.items = [];
    });
    expect(root.querySelector('[data-action="toggle-list"]')).toBeNull();
  });
});

afterAll(() => {
  restoreAppIntervals();
  window.matchMedia = originalMatchMedia;
});
