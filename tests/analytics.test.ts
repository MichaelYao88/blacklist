// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import {
  ANALYTICS_EVENTS,
  GAUNTLET_FLOORS,
  RUN_REF_KEY,
  analyticsEnabled,
  clearRunRef,
  detectSite,
  isDoNotTrack,
  loadRunRef,
  sanitizeProperties,
  saveRunRef,
  shouldTrack,
  trackGameLoaded,
  trackRunStarted,
} from '../src/ui/analytics';

describe('analytics site', () => {
  it('treats an itch.zone embed as itch', () => {
    expect(detectSite({
      hostname: 'html-classic.itch.zone',
      referrer: 'https://michaelyao.itch.io/blacklist',
    })).toBe('itch');
  });

  it('treats an itch.io referrer as itch when the file host is somewhere else', () => {
    expect(detectSite({
      hostname: 'cdn.example.com',
      referrer: 'https://itch.io/embed/123',
    })).toBe('itch');
  });

  it('treats a parent itch.io frame as itch', () => {
    expect(detectSite({
      hostname: 'cdn.example.com',
      referrer: '',
      ancestorHosts: ['michaelyao.itch.io'],
    })).toBe('itch');
  });

  it('treats GitHub Pages as github-pages', () => {
    expect(detectSite({
      hostname: 'michaelyao88.github.io',
      referrer: '',
    })).toBe('github-pages');
  });

  it('does not treat a lookalike host as itch', () => {
    expect(detectSite({ hostname: 'notitch.io', referrer: '' })).toBe('other');
    expect(detectSite({ hostname: 'itch.io.evil.example', referrer: '' })).toBe('other');
    expect(detectSite({ hostname: 'evilitch.io', referrer: '' })).toBe('other');
    expect(detectSite({
      hostname: 'example.com',
      referrer: 'https://michaelyao88.github.io/blacklist/',
    })).toBe('other');
  });

  it('labels local previews separately', () => {
    expect(detectSite({ hostname: 'localhost', referrer: '' })).toBe('local');
    expect(detectSite({ hostname: 'HTML.ITCH.ZONE.', referrer: '' })).toBe('itch');
  });
});

describe('analytics consent and payload', () => {
  it('tracks only production players who have not set Do Not Track', () => {
    expect(shouldTrack({ prod: true, test: false, doNotTrack: false })).toBe(true);
    expect(shouldTrack({ prod: true, test: true, doNotTrack: false })).toBe(false);
    expect(shouldTrack({ prod: false, test: false, doNotTrack: false })).toBe(false);
    expect(shouldTrack({ prod: true, test: false, doNotTrack: true })).toBe(false);
    expect(shouldTrack({ prod: true, test: false, doNotTrack: false, failed: true })).toBe(false);
  });

  it('recognizes the Do Not Track signals', () => {
    expect(isDoNotTrack('1')).toBe(true);
    expect(isDoNotTrack('yes')).toBe(true);
    expect(isDoNotTrack('0')).toBe(false);
    expect(isDoNotTrack(null)).toBe(false);
    expect(isDoNotTrack('unspecified')).toBe(false);
  });

  it('drops typed words and stamps the site on every payload', () => {
    expect(sanitizeProperties({
      word: 'slate',
      guess: 'crane',
      answer: 'fuzzy',
      text: 'hello',
      seed: 'daily',
      $el_text: 'Q',
      level: 27,
      result: 'won',
      site: 'github-pages',
    }, 'itch')).toEqual({
      level: 27,
      result: 'won',
      site: 'itch',
      platform: 'itch',
    });
  });

  it('lists only the game events the client is allowed to send', () => {
    expect([...ANALYTICS_EVENTS]).toEqual([
      'game_loaded',
      'run_started',
      'run_ended',
      'run_resumed',
      'run_abandoned',
      'boss_reached',
      'event_choice',
    ]);
  });

  it('matches the engine gauntlet length', async () => {
    const engine = await readFile('src/core/engine.ts', 'utf8');
    const match = engine.match(/const MAX_LEVEL = (\d+);/);
    expect(match?.[1]).toBe(String(GAUNTLET_FLOORS));
  });
});

describe('analytics during tests', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('stays disabled and does not write a run ref', () => {
    expect(analyticsEnabled()).toBe(false);
    expect(() => trackGameLoaded(true, 2)).not.toThrow();
    expect(() => trackRunStarted({ runNumber: 1, character: 'runner', ascension: 0 })).not.toThrow();
    expect(localStorage.getItem(RUN_REF_KEY)).toBeNull();
    expect(localStorage.getItem('blacklist.run.v1')).toBeNull();
    expect(localStorage.getItem('blacklist.meta.v1')).toBeNull();
  });

  it('round-trips the anonymous run ref used to join events', () => {
    saveRunRef({ id: 'run-123', number: 4 });
    expect(loadRunRef()).toEqual({ id: 'run-123', number: 4 });
    clearRunRef();
    expect(loadRunRef()).toBeNull();
    localStorage.setItem(RUN_REF_KEY, '{not json');
    expect(loadRunRef()).toBeNull();
    localStorage.setItem(RUN_REF_KEY, JSON.stringify({ id: 4, number: 'nope' }));
    expect(loadRunRef()).toBeNull();
  });
});

describe('deploy config', () => {
  it('keeps a relative Vite base for GitHub Pages and itch.io', async () => {
    const config = await readFile('vite.config.ts', 'utf8');
    expect(config).toMatch(/base:\s*'\.\/'/);
  });

  it('keeps the GitHub Pages workflow', async () => {
    const pages = await readFile('.github/workflows/pages.yml', 'utf8');
    expect(pages).toContain('actions/deploy-pages');
    expect(pages).toContain('npm run build');
    expect(pages).toContain('branches: [main]');
  });

  it('publishes a root index.html zip to the html5 channel and skips when credentials are missing', async () => {
    const itch = await readFile('.github/workflows/itch.yml', 'utf8');
    expect(itch).toContain('branches: [main]');
    expect(itch).toContain('secrets.BUTLER_API_KEY');
    expect(itch).toContain('vars.ITCH_USER');
    expect(itch).toContain('vars.ITCH_GAME');
    expect(itch).not.toContain('secrets.ITCH_USER');
    expect(itch).not.toContain('secrets.ITCH_GAME');
    expect(itch).toContain('butler push itch-html5.zip');
    expect(itch).toContain(':html5');
    expect(itch).toContain('index.html');
    expect(itch).toContain('skip=true');
  });
});
