// @vitest-environment happy-dom
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const FORBIDDEN = /requestFullscreen|webkitRequestFullscreen|orientation\.lock|lockPortraitOrientation/;
const TEXT_EXTENSIONS = /\.(?:ts|tsx|js|jsx|css|html|json|webmanifest)$/;

function collectTextFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      files.push(...collectTextFiles(path));
    } else if (TEXT_EXTENSIONS.test(entry)) {
      files.push(path);
    }
  }
  return files;
}

afterEach(() => {
  delete (window.screen as unknown as { orientation?: unknown }).orientation;
});

describe('no fullscreen or orientation lock', () => {
  it('does not request fullscreen or lock orientation anywhere in production source', () => {
    const files = [...collectTextFiles('src'), 'index.html', 'public/manifest.webmanifest'];
    for (const file of files) {
      const contents = readFileSync(file, 'utf8');
      expect(contents, file).not.toMatch(FORBIDDEN);
    }
  });

  it('ships a manifest without a portrait orientation and no screen-orientation meta', () => {
    const html = readFileSync('index.html', 'utf8');
    expect(html).toContain('rel="manifest"');
    expect(html).toContain('manifest.webmanifest');
    expect(html).not.toContain('screen-orientation');

    const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8')) as {
      name?: string;
      display?: string;
      orientation?: string;
      theme_color?: string;
    };
    expect(manifest.orientation).not.toBe('portrait');
    expect(manifest.display).toBe('standalone');
    expect(manifest.name).toContain('BLACKLIST');
    expect(manifest.theme_color).toBe('#0d0b12');
  });

  it('does not call screen.orientation.lock on the first app click', async () => {
    const lock = vi.fn();
    Object.defineProperty(window.screen, 'orientation', {
      configurable: true,
      value: { lock },
    });
    localStorage.clear();
    document.body.innerHTML = '<div id="app"></div>';
    vi.resetModules();
    await import('../src/ui/app');
    const app = document.getElementById('app') as HTMLElement;
    app.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(lock).not.toHaveBeenCalled();
  });
});
