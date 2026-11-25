// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { game } from '../src/game';

function saved(): ReturnType<typeof game.deserialize> {
  const json = localStorage.getItem('blacklist.run.v1');
  return json ? game.deserialize(json) : null;
}

describe('happening option confirm', () => {
  let root: HTMLElement;

  beforeAll(async () => {
    localStorage.clear();
    const { state } = game.newRun({ seed: 'confirm-happening', character: 'runner' });
    state.phase = 'happening';
    state.happening = {
      id: 'scavenger',
      options: [{
        id: 'leave',
        label: 'Decline',
        description: 'Nothing happens.',
        outcomes: [{ chancePct: 100, text: 'The Scavenger shrugs.' }],
      }],
    };
    localStorage.setItem('blacklist.run.v1', game.serialize(state));

    document.body.innerHTML = '<div id="app"></div>';
    await import('../src/ui/app');
    root = document.getElementById('app') as HTMLElement;
    root.querySelector<HTMLElement>('[data-action="resume"]')!.click();
  });

  it('selects the option first and resolves on the second tap', () => {
    const choose = root.querySelector<HTMLElement>('[data-action="select-happening"][data-id="leave"]');
    expect(choose?.textContent?.trim()).toBe('CHOOSE');
    choose!.click();
    expect(saved()?.happening?.resolved).toBeUndefined();
    expect(saved()?.phase).toBe('happening');

    const confirm = root.querySelector<HTMLElement>('[data-action="confirm-happening"][data-id="leave"]');
    expect(confirm?.textContent?.trim()).toBe('CONFIRM');
    confirm!.click();
    expect(saved()?.happening?.resolved?.option).toBe('leave');
  });
});
