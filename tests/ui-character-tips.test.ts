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

  it('shows the Pathfinder spam tip when selected', () => {
    root.querySelector<HTMLElement>('[data-action="character"][data-id="pathfinder"]')!.click();
    const tip = root.querySelector<HTMLElement>('.character-tip');
    expect(tip).not.toBeNull();
    expect(tip?.textContent).toContain('PATHFINDER TIP');
    expect(tip?.textContent).toContain('4 words');
    expect(tip?.textContent).toContain('TUBES');
    expect(tip?.textContent).toContain('GATED');
  });

  it('shows the Purgamist Y-vowel tip when selected', () => {
    root.querySelector<HTMLElement>('[data-action="character"][data-id="purgamist"]')!.click();
    const tip = root.querySelector<HTMLElement>('.character-tip');
    expect(tip?.textContent).toContain('PURGAMIST TIP');
    expect(tip?.textContent).toContain('14');
    expect(tip?.textContent).toContain('Y');
  });

  it('hides the tip for other characters', () => {
    root.querySelector<HTMLElement>('[data-action="character"][data-id="runner"]')!.click();
    expect(root.querySelector('.character-tip')).toBeNull();
  });
});
