type OrientationLock = (orientation: string) => Promise<void> | void;

type OrientationLike = {
  lock?: OrientationLock;
};

type LockableScreen = Screen & {
  orientation?: OrientationLike;
  lockOrientation?: OrientationLock;
  webkitLockOrientation?: OrientationLock;
  mozLockOrientation?: OrientationLock;
  msLockOrientation?: OrientationLock;
};

function swallowRejection(result: unknown): void {
  if (result && typeof (result as Promise<void>).catch === 'function') {
    (result as Promise<void>).catch(() => undefined);
  }
}

/**
 * Ask the browser to keep the page in portrait. Orientation lock normally
 * only works while the page is fullscreen and from a user gesture, so every
 * failure (unsupported API, rejected promise, iframe restrictions) is ignored.
 */
export function lockPortraitOrientation(): void {
  try {
    if (typeof screen === 'undefined' || !screen) return;
    const target = screen as LockableScreen;
    const orientation = target.orientation;
    const attempts: Array<{ owner: unknown; lock: OrientationLock }> = [];
    if (orientation && typeof orientation.lock === 'function') {
      attempts.push({ owner: orientation, lock: orientation.lock });
    }
    const aliases = [
      'lockOrientation',
      'webkitLockOrientation',
      'mozLockOrientation',
      'msLockOrientation',
    ] as const;
    for (const name of aliases) {
      const lock = target[name];
      if (typeof lock === 'function') attempts.push({ owner: target, lock });
    }
    for (const { owner, lock } of attempts) {
      swallowRejection(lock.call(owner, 'portrait'));
    }
  } catch {
    // Orientation lock is a best-effort hint; never let it break the game.
  }
}
