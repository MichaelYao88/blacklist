// @vitest-environment happy-dom
import { afterAll, describe, expect, it, vi } from 'vitest';
import { game } from '../src/game';

const originalMatchMedia = window.matchMedia;
const liveIntervals = new Set<number>();
const realSetInterval = window.setInterval;
window.setInterval = ((handler: () => void, timeout?: number) => {
  const id = realSetInterval(handler, timeout);
  liveIntervals.add(id);
  return id;
}) as typeof window.setInterval;

function stopAppIntervals(): void {
  for (const id of liveIntervals) window.clearInterval(id);
  liveIntervals.clear();
}

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

function mockRect(element: HTMLElement, top: number, bottom: number): void {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      top,
      bottom,
      height: bottom - top,
      width: 120,
      left: 0,
      right: 120,
      x: 0,
      y: top,
      toJSON: () => ({}),
    }),
  });
}

function saved(): ReturnType<typeof game.deserialize> {
  const json = localStorage.getItem('blacklist.run.v1');
  return json ? game.deserialize(json) : null;
}

async function boot(mobile: boolean, seed: string, seedRun: (state: ReturnType<typeof game.newRun>['state']) => void): Promise<HTMLElement> {
  stopAppIntervals();
  setMobileMatchMedia(mobile);
  localStorage.clear();
  const { state } = game.newRun({ seed, character: 'runner' });
  state.round!.answer = 'crane';
  state.round!.remainingMs = 300_000;
  state.round!.timerStartMs = 300_000;
  state.spells = [
    { instance: 's-omen', id: 'omen' },
    { instance: 's-heal', id: 'heal' },
  ];
  seedRun(state);
  localStorage.setItem('blacklist.run.v1', game.serialize(state));

  document.body.innerHTML = '<div id="app"></div>';
  vi.resetModules();
  await import('../src/ui/app');
  const root = document.getElementById('app') as HTMLElement;
  root.querySelector<HTMLElement>('[data-action="resume"]')!.click();
  return root;
}

function giveParrotAndNecro(state: ReturnType<typeof game.newRun>['state']): void {
  state.items = state.items.filter((item) => item.id !== 'evil-parrot');
  state.items.push(
    {
      instance: 'i-round3-parrot',
      id: 'evil-parrot',
      data: { readyAt: 0, _suggestions: 0, _freeUsed: 0 },
      equipped: true,
    },
    {
      instance: 'i-round3-necro',
      id: 'necronomicon',
      data: { fed: 0, _uses: 0 },
      equipped: true,
    },
  );
  state.gold = 10;
  state.hp = 100;
  state.maxHp = 100;
  state.armor = 0;
  state.maxArmor = 0;
  state.round!.freeLeft = 0;
  state.round!.baseDamage = 3;
}

describe('mobile parrot and Necronomicon tabs', () => {
  let root: HTMLElement;

  it('boots with both items in a fight', async () => {
    root = await boot(true, 'mobile-round3-items', giveParrotAndNecro);
    const tabs = root.querySelectorAll<HTMLElement>('.mobile-item-tab');
    expect(tabs).toHaveLength(2);
    const spellsTab = root.querySelector<HTMLElement>('.mobile-spells-tab');
    const parrotTab = root.querySelector<HTMLElement>('[data-action="toggle-parrot"]');
    const necroTab = root.querySelector<HTMLElement>('[data-action="toggle-necro"]');
    expect(tabs[0]).toBe(necroTab);
    expect(tabs[1]).toBe(parrotTab);
    expect(parrotTab?.textContent).toContain('🦜');
    expect(parrotTab?.textContent).not.toContain('PARROT');
    expect(necroTab?.textContent).toContain('📕');
    expect(necroTab?.textContent).not.toContain('NECRO');
    expect(parrotTab?.getAttribute('aria-label')).toContain('Evil Parrot');
    expect(parrotTab?.getAttribute('title')).toContain('Evil Parrot');
    expect(necroTab?.getAttribute('aria-label')).toContain('Necronomicon');
    expect(necroTab?.getAttribute('title')).toContain('Necronomicon');
    expect(spellsTab?.style.getPropertyValue('--tab-offset')).toBe('0px');
    expect(necroTab?.style.getPropertyValue('--tab-offset')).toBe('82px');
    expect(parrotTab?.style.getPropertyValue('--tab-offset')).toBe('122px');
    expect(spellsTab?.style.getPropertyValue('--tab-z')).toBe('63');
    expect(necroTab?.style.getPropertyValue('--tab-z')).toBe('62');
    expect(parrotTab?.style.getPropertyValue('--tab-z')).toBe('61');
    expect(root.querySelector('.mobile-item')?.classList.contains('open')).toBe(false);
  });

  it('floats the damage calculation when the rail copy scrolls out of view', () => {
    const original = root.querySelector<HTMLElement>('.battle-rail .guess-damage');
    const floatRoot = document.getElementById('mobile-damage-root') as HTMLElement;
    expect(original).not.toBeNull();
    expect(floatRoot).not.toBeNull();
    expect(floatRoot.querySelector('.guess-damage-value')?.textContent).toContain('3');

    mockRect(original!, 30, 110);
    window.dispatchEvent(new Event('scroll'));
    expect(floatRoot.classList.contains('is-visible')).toBe(false);

    mockRect(original!, -140, -40);
    window.dispatchEvent(new Event('scroll'));
    expect(floatRoot.classList.contains('is-visible')).toBe(true);
    expect(floatRoot.querySelector('.guess-damage-label')?.textContent)
      .toContain('INCOMING DAMAGE');
    expect(floatRoot.querySelector('.guess-damage-value')?.textContent).toContain('3');

    mockRect(original!, 40, 120);
    window.dispatchEvent(new Event('scroll'));
    expect(floatRoot.classList.contains('is-visible')).toBe(false);
  });

  it('floats HP and armor before the whole player block leaves the screen', () => {
    const original = root.querySelector<HTMLElement>('.battle-rail .mini-player .big-hp');
    const floatRoot = document.getElementById('mobile-vitals-root') as HTMLElement;
    expect(original).not.toBeNull();
    expect(floatRoot).not.toBeNull();
    expect(floatRoot.textContent).toContain('100/100');
    expect(floatRoot.textContent).toContain('ARMOR 0/0');

    mockRect(original!, 60, 70);
    window.dispatchEvent(new Event('scroll'));
    expect(floatRoot.classList.contains('is-visible')).toBe(false);

    // The HP bar is still technically on screen but no longer readable.
    mockRect(original!, -8, 32);
    window.dispatchEvent(new Event('scroll'));
    expect(floatRoot.classList.contains('is-visible')).toBe(true);
    expect(floatRoot.textContent).toContain('100/100');
    expect(floatRoot.textContent).toContain('ARMOR 0/0');

    mockRect(original!, -140, -40);
    window.dispatchEvent(new Event('scroll'));
    expect(floatRoot.classList.contains('is-visible')).toBe(true);

    mockRect(original!, 40, 120);
    window.dispatchEvent(new Event('scroll'));
    expect(floatRoot.classList.contains('is-visible')).toBe(false);
  });

  it('opens one drawer at a time and closes on scrim or tab', () => {
    root.querySelector<HTMLElement>('[data-action="toggle-parrot"]')!.click();
    expect(root.querySelector('.mobile-item[data-mobile-item="parrot"]')?.classList.contains('open'))
      .toBe(true);
    expect(root.querySelector('.mobile-item[data-mobile-item="necro"]')?.classList.contains('open'))
      .toBe(false);
    expect(root.querySelector('.mobile-spells')?.classList.contains('open')).toBe(false);
    expect(root.querySelector('.mobile-item[data-mobile-item="parrot"] .item-card')?.textContent)
      .toContain('Evil Parrot');

    root.querySelector<HTMLElement>('[data-action="toggle-necro"]')!.click();
    expect(root.querySelector('.mobile-item[data-mobile-item="necro"]')?.classList.contains('open'))
      .toBe(true);
    expect(root.querySelector('.mobile-item[data-mobile-item="parrot"]')?.classList.contains('open'))
      .toBe(false);

    root.querySelector<HTMLElement>('[data-action="toggle-spells"]')!.click();
    expect(root.querySelector('.mobile-spells')?.classList.contains('open')).toBe(true);
    expect(root.querySelector('.mobile-item[data-mobile-item="necro"]')?.classList.contains('open'))
      .toBe(false);

    root.querySelector<HTMLElement>('[data-action="close-spells"]')!.click();
    root.querySelector<HTMLElement>('[data-action="toggle-necro"]')!.click();
    expect(root.querySelector('.mobile-item[data-mobile-item="necro"]')?.classList.contains('open'))
      .toBe(true);
    root.querySelector<HTMLElement>('[data-action="close-necro"]')!.click();
    expect(root.querySelector('.mobile-item[data-mobile-item="necro"]')?.classList.contains('open'))
      .toBe(false);

    root.querySelector<HTMLElement>('[data-action="toggle-parrot"]')!.click();
    expect(root.querySelector('.mobile-item[data-mobile-item="parrot"]')?.classList.contains('open'))
      .toBe(true);
    root.querySelector<HTMLElement>('[data-action="toggle-parrot"]')!.click();
    expect(root.querySelector('.mobile-item[data-mobile-item="parrot"]')?.classList.contains('open'))
      .toBe(false);
  });

  it('raises an open tab above the other tabs', () => {
    const z = (selector: string) => Number(
      root.querySelector<HTMLElement>(selector)?.style.getPropertyValue('--tab-z') ?? 0,
    );

    root.querySelector<HTMLElement>('[data-action="toggle-parrot"]')!.click();
    expect(z('[data-action="toggle-parrot"]')).toBeGreaterThan(z('[data-action="toggle-necro"]'));
    expect(z('[data-action="toggle-parrot"]')).toBeGreaterThan(z('[data-action="toggle-spells"]'));

    root.querySelector<HTMLElement>('[data-action="toggle-necro"]')!.click();
    expect(z('[data-action="toggle-necro"]')).toBeGreaterThan(z('[data-action="toggle-parrot"]'));
    expect(z('[data-action="toggle-necro"]')).toBeGreaterThan(z('[data-action="toggle-spells"]'));

    root.querySelector<HTMLElement>('[data-action="toggle-spells"]')!.click();
    expect(z('[data-action="toggle-spells"]')).toBeGreaterThan(z('[data-action="toggle-necro"]'));
    expect(z('[data-action="toggle-spells"]')).toBeGreaterThan(z('[data-action="toggle-parrot"]'));

    root.querySelector<HTMLElement>('[data-action="toggle-spells"]')!.click();
  });

  it('uses the existing item actions from inside the drawers', () => {
    root.querySelector<HTMLElement>('[data-action="toggle-parrot"]')!.click();
    const goldBefore = saved()?.gold ?? 0;
    const parrotUse = root.querySelector<HTMLButtonElement>(
      '.mobile-item[data-mobile-item="parrot"] [data-action="use"]',
    );
    expect(parrotUse).not.toBeNull();
    expect(parrotUse?.disabled).toBe(false);
    parrotUse!.click();
    expect(saved()?.gold).toBe(goldBefore - 1);
    expect(root.querySelector('.mobile-item[data-mobile-item="parrot"]')?.classList.contains('open'))
      .toBe(true);

    root.querySelector<HTMLElement>('[data-action="toggle-necro"]')!.click();
    const maxHpBefore = saved()?.maxHp ?? 0;
    const necroUse = root.querySelector<HTMLButtonElement>(
      '.mobile-item[data-mobile-item="necro"] [data-action="use"]',
    );
    expect(necroUse).not.toBeNull();
    expect(necroUse?.disabled).toBe(false);
    necroUse!.click();
    expect(saved()?.maxHp).toBeLessThan(maxHpBefore);
    const usedNecro = root.querySelector<HTMLButtonElement>(
      '.mobile-item[data-mobile-item="necro"] [data-action="use"]',
    );
    expect(usedNecro?.disabled).toBe(true);
    expect(usedNecro?.textContent).toContain('USED');
  });
});

describe('mobile item tabs only render for owned items', () => {
  it('hides both tabs when neither item is in the inventory', async () => {
    const root = await boot(true, 'mobile-round3-empty', (state) => {
      state.items = [];
    });
    expect(root.querySelectorAll('.mobile-item-tab')).toHaveLength(0);
    expect(root.querySelector('[data-action="toggle-parrot"]')).toBeNull();
    expect(root.querySelector('[data-action="toggle-necro"]')).toBeNull();
    expect(root.querySelector('.mobile-spells-tab')).not.toBeNull();
  });

  it('shows only the tab for the item that is actually owned', async () => {
    const root = await boot(true, 'mobile-round3-necro-only', (state) => {
      state.items = [
        {
          instance: 'i-round3-only-necro',
          id: 'necronomicon',
          data: { fed: 0, _uses: 0 },
          equipped: true,
        },
      ];
    });
    expect(root.querySelector('[data-action="toggle-parrot"]')).toBeNull();
    const necroTab = root.querySelector<HTMLElement>('[data-action="toggle-necro"]');
    expect(necroTab).not.toBeNull();
    expect(necroTab?.style.getPropertyValue('--tab-offset')).toBe('82px');
    expect(necroTab?.style.getPropertyValue('--tab-z')).toBe('62');
  });

  it('moves the parrot up under the spells tab when the book is missing', async () => {
    const root = await boot(true, 'mobile-round3-parrot-with-spells', (state) => {
      state.items = [
        {
          instance: 'i-round3-only-parrot',
          id: 'evil-parrot',
          data: { readyAt: 0, _suggestions: 0, _freeUsed: 0 },
          equipped: true,
        },
      ];
    });
    const parrotTab = root.querySelector<HTMLElement>('[data-action="toggle-parrot"]');
    expect(parrotTab?.style.getPropertyValue('--tab-offset')).toBe('82px');
    expect(parrotTab?.style.getPropertyValue('--tab-z')).toBe('61');
  });

  it('starts the parrot at the top when it is the only tab', async () => {
    const root = await boot(true, 'mobile-round3-parrot-only', (state) => {
      state.spells = [];
      state.items = [
        {
          instance: 'i-round3-only-parrot',
          id: 'evil-parrot',
          data: { readyAt: 0, _suggestions: 0, _freeUsed: 0 },
          equipped: true,
        },
      ];
    });
    const parrotTab = root.querySelector<HTMLElement>('[data-action="toggle-parrot"]');
    expect(root.querySelector('.mobile-spells-tab')).toBeNull();
    expect(parrotTab?.style.getPropertyValue('--tab-offset')).toBe('0px');
  });
});

describe('desktop stays free of the mobile item shortcuts and float', () => {
  it('does not render item tabs, drawers, or the floating damage box', async () => {
    const root = await boot(false, 'desktop-round3-items', giveParrotAndNecro);
    expect(root.querySelector('.mobile-item')).toBeNull();
    expect(root.querySelector('.mobile-spells')).toBeNull();
    expect(document.querySelector('#mobile-damage-root .guess-damage')).toBeNull();
    expect(document.querySelector('#mobile-vitals-root .mobile-vitals')).toBeNull();
    expect(root.querySelector('.battle-rail .guess-damage')).not.toBeNull();
  });
});

afterAll(() => {
  stopAppIntervals();
  window.setInterval = realSetInterval;
  window.matchMedia = originalMatchMedia;
});

describe('mobile spells tab only renders when spells exist', () => {
  it('hides the spells tab, drawer, and scrim with no spells and stacks item tabs from the top', async () => {
    const root = await boot(true, 'mobile-round4-no-spells', (state) => {
      state.spells = [];
      giveParrotAndNecro(state);
    });
    expect(root.querySelector('.mobile-spells-tab')).toBeNull();
    expect(root.querySelector('.mobile-spells')).toBeNull();
    expect(document.querySelector('.mobile-spells-scrim')).toBeNull();
    const tabs = root.querySelectorAll<HTMLElement>('.mobile-item-tab');
    expect(tabs).toHaveLength(2);
    expect(tabs[0].getAttribute('data-action')).toBe('toggle-necro');
    expect(tabs[1].getAttribute('data-action')).toBe('toggle-parrot');
    expect(tabs[0].style.getPropertyValue('--tab-offset')).toBe('0px');
    expect(tabs[1].style.getPropertyValue('--tab-offset')).toBe('40px');
    expect(tabs[0].style.getPropertyValue('--tab-z')).toBe('62');
    expect(tabs[1].style.getPropertyValue('--tab-z')).toBe('61');
  });

  it('renders the spells tab when at least one spell exists', async () => {
    const root = await boot(true, 'mobile-round4-with-spells', (state) => {
      state.spells = [{ instance: 's-round4-omen', id: 'omen' }];
    });
    expect(root.querySelector('.mobile-spells-tab')).not.toBeNull();
    expect(root.querySelector('.mobile-spells')).not.toBeNull();
  });
});
