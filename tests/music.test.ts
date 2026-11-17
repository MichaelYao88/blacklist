// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { music } from '../src/ui/music';

describe('run music', () => {
  it('starts every run on Dark Synthwave', () => {
    music.cycleTrack();
    expect(music.currentName).not.toContain('Dark Synthwave');
    music.beginRun();
    expect(music.currentName).toContain('Dark Synthwave');
  });

  it('only rerolls on seven-level milestones and never picks the boss track', () => {
    music.beginRun();
    music.setLevel(6);
    expect(music.currentName).toContain('Dark Synthwave');

    music.setLevel(7);
    const atSeven = music.currentName;
    expect(atSeven).not.toContain('More Power');

    music.setLevel(8);
    expect(music.currentName).toBe(atSeven);

    for (const level of [14, 21, 28, 35, 42, 49]) {
      music.setLevel(level);
      expect(music.currentName).not.toContain('More Power');
    }
  });
});
