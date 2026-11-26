// Test-only guard for files that boot src/ui/app more than once.
//
// Each `await import('../src/ui/app')` after `vi.resetModules()` creates a new
// app instance that registers its own window.setInterval game tick, and the old
// instances are never disposed. A stale instance keeps ticking and autosaves ITS
// run to the same localStorage key, so if its tick lands while the next test is
// importing (slow on CI), the new app resumes the OLD test's state. Call
// stopAppIntervals() at the start of every boot to silence the previous instances.
const live = new Set<number>();
const realSetInterval = window.setInterval;

window.setInterval = ((handler: () => void, timeout?: number) => {
  const id = realSetInterval(handler, timeout);
  live.add(id);
  return id;
}) as typeof window.setInterval;

export function stopAppIntervals(): void {
  for (const id of live) window.clearInterval(id);
  live.clear();
}

export function restoreAppIntervals(): void {
  stopAppIntervals();
  window.setInterval = realSetInterval;
}
