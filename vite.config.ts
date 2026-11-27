import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative asset URLs. One build loads on GitHub Pages (`/blacklist/`)
  // and inside an itch.io iframe at whatever path itch serves.
  base: './',
  build: {
    target: 'es2020',
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});
