// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';

describe('character selection tips', () => {
  let root: HTMLElement;

  beforeAll(async () => {
    localStorage.clear();
    localStorage.setItem('blacklist.meta.v1', JSON.stringify({
      characters: ['runner', 'pathfinder', 'purgamist'],
    }));
    document.body.innerHTML = '<div id="app"></div>';
    await import('../src/ui/app');
    root = document.getElementById('app') as HTMLElement;
  });

  it('opens the Pathfinder tip as a modal', () => {
    root.querySelector<HTMLElement>('[data-action="character"][data-id="pathfinder"]')!.click();
    const modal = root.querySelector<HTMLElement>('.character-tip-modal');
    expect(modal).not.toBeNull();
    expect(modal?.textContent).toContain('PATHFINDER TIP');
    expect(modal?.textContent).toContain('four words');
    expect(modal?.textContent).toContain('TUBES');
    expect(modal?.textContent).toContain('GATED');

    root.querySelector<HTMLElement>('[data-action="dismiss-character-tip"]')!.click();
    expect(root.querySelector('.character-tip-modal')).toBeNull();
  });

  it('opens the Purgamist tip as a modal', () => {
    root.querySelector<HTMLElement>('[data-action="character"][data-id="purgamist"]')!.click();
    const modal = root.querySelector<HTMLElement>('.character-tip-modal');
    expect(modal?.textContent).toContain('PURGAMIST TIP');
    expect(modal?.textContent).toContain('14');
    expect(modal?.textContent).toContain('Y');
  });

  it('does not open a tip for other characters', () => {
    root.querySelector<HTMLElement>('[data-action="character"][data-id="runner"]')!.click();
    expect(root.querySelector('.character-tip-modal')).toBeNull();
  });
});
