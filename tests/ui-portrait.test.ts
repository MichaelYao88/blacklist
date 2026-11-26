// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { lockPortraitOrientation } from '../src/ui/orientation';

type MutableScreen = {
  orientation?: { lock: (orientation: string) => Promise<void> | void };
  lockOrientation?: unknown;
  webkitLockOrientation?: unknown;
  mozLockOrientation?: unknown;
  msLockOrientation?: unknown;
};

function mutableScreen(): MutableScreen {
  return window.screen as unknown as MutableScreen;
}

function mockOrientation(lock: (orientation: string) => Promise<void> | void): void {
  Object.defineProperty(window.screen, 'orientation', {
    configurable: true,
    value: { lock },
  });
}

afterEach(() => {
  const target = mutableScreen();
  delete target.orientation;
  delete target.lockOrientation;
  delete target.webkitLockOrientation;
  delete target.mozLockOrientation;
  delete target.msLockOrientation;
});

describe('portrait orientation hints', () => {
  it('does not throw when the orientation lock API is missing', () => {
    expect(() => lockPortraitOrientation()).not.toThrow();
  });

  it('requests portrait and swallows a rejected lock', async () => {
    const lock = vi.fn(() => Promise.reject(new Error('not allowed')));
    mockOrientation(lock);
    expect(() => lockPortraitOrientation()).not.toThrow();
    expect(lock).toHaveBeenCalledWith('portrait');
    await Promise.resolve();
  });

  it('falls back to a webkit lock alias', () => {
    const lock = vi.fn();
    Object.defineProperty(window.screen, 'webkitLockOrientation', {
      configurable: true,
      value: lock,
    });
    lockPortraitOrientation();
    expect(lock).toHaveBeenCalledWith('portrait');
  });

  it('locks portrait immediately after a mocked fullscreen request', () => {
    const lock = vi.fn();
    mockOrientation(lock);
    const requestFullscreen = vi.fn(() => Promise.resolve());
    requestFullscreen();
    lockPortraitOrientation();
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
    expect(lock).toHaveBeenCalledWith('portrait');
  });

  it('requests portrait on the first app click', async () => {
    const lock = vi.fn();
    mockOrientation(lock);
    localStorage.clear();
    document.body.innerHTML = '<div id="app"></div>';
    vi.resetModules();
    await import('../src/ui/app');
    const app = document.getElementById('app') as HTMLElement;
    app.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(lock).toHaveBeenCalledWith('portrait');
  });

  it('ships portrait orientation in the viewport hints and web manifest', () => {
    const html = readFileSync('index.html', 'utf8');
    expect(html).toContain('rel="manifest"');
    expect(html).toContain('manifest.webmanifest');
    expect(html).toMatch(/name="screen-orientation"\s+content="portrait"/);

    const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8')) as {
      name?: string;
      orientation?: string;
      theme_color?: string;
    };
    expect(manifest.orientation).toBe('portrait');
    expect(manifest.name).toContain('BLACKLIST');
    expect(manifest.theme_color).toBe('#0d0b12');
  });
});
