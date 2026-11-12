// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';

describe('browser UI', () => {
  let root: HTMLElement;

  beforeAll(async () => {
    document.body.innerHTML = '<div id="app"></div>';
    localStorage.clear();
    await import('../src/ui/app');
    root = document.getElementById('app') as HTMLElement;
  });

  it('renders the title screen', () => {
    expect(root.textContent).toContain('BLACKLIST');
    expect(root.textContent).toContain('NEW RUN');
    expect(root.querySelector('.title-mark')).not.toBeNull();
  });

  it('starts a run and accepts a guess from the on-screen keyboard', () => {
    const newRun = root.querySelector<HTMLElement>('[data-action="new-run"]');
    expect(newRun).not.toBeNull();
    newRun!.click();

    expect(root.textContent).toContain('PATH');
    expect(root.querySelector('.board')).not.toBeNull();
    expect(localStorage.getItem('blacklist.run.v1')).toBeTruthy();

    for (const letter of 'slate') {
      const key = root.querySelector<HTMLElement>(`[data-action="key"][data-letter="${letter}"]`);
      expect(key).not.toBeNull();
      key!.click();
    }

    const submit = root.querySelector<HTMLElement>('[data-action="submit"]');
    expect(submit).not.toBeNull();
    submit!.click();

    const scored =
      root.querySelector('.tile.correct') ??
      root.querySelector('.tile.present') ??
      root.querySelector('.tile.absent') ??
      root.querySelector('.answer-reveal');
    expect(scored).not.toBeNull();
  });

  it('opens the rules screen and returns to the run', () => {
    const rules = root.querySelector<HTMLElement>('[data-action="help"]');
    expect(rules).not.toBeNull();
    rules!.click();
    expect(root.textContent).toContain('How to play');

    const back = root.querySelector<HTMLElement>('[data-action="back"]');
    expect(back).not.toBeNull();
    back!.click();
    expect(root.textContent).toContain('PATH');
  });
});
