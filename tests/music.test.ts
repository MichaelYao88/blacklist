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

  it('only rerolls on five-level milestones and never picks the boss track', () => {
    music.beginRun();
    music.setLevel(4);
    expect(music.currentName).toContain('Dark Synthwave');

    music.setLevel(5);
    const atFive = music.currentName;
    expect(atFive).not.toContain('More Power');

    music.setLevel(6);
    expect(music.currentName).toBe(atFive);

    for (const level of [10, 15, 20, 25, 30, 35, 40, 45, 50]) {
      music.setLevel(level);
      expect(music.currentName).not.toContain('More Power');
    }
  });
});
