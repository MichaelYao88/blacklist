// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { MUSIC_TRACKS, music } from '../src/ui/music';

describe('run music', () => {
  it('includes the new Pixabay synthwave track', () => {
    const ids = MUSIC_TRACKS.map((track) => track.id);
    expect(ids).not.toContain('neon-synthwave-vibe');
    expect(ids).not.toContain('upbeat-drums');
    expect(ids).toContain('synthwave-retro-80s');
    expect(ids).toContain('golden-gun');
    expect(ids).toContain('dark-electronic');
    expect(ids).toContain('dark-trap');
    expect(ids).toContain('trap-instrumental');
    expect(ids).toContain('trap-beat');
    expect(ids).toContain('rap-trap-instrumental');
    expect(MUSIC_TRACKS.find((track) => track.id === 'synthwave-retro-80s')?.name)
      .toContain('DELOSound');
  });

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

    for (const level of [14, 21, 28, 35]) {
      music.setLevel(level);
      expect(music.currentName).not.toContain('More Power');
    }
  });
});
