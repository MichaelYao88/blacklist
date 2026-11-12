import { CONTENT } from './content';
import { createCore } from './core/engine';

/** The playable game. A React or Unity client can consume the same instance. */
export const game = createCore(CONTENT);

export { createCore };
export * from './core/types';
export { CoreHost, MemoryStore } from './core/host';
export type { SaveStore, CoreHostOptions } from './core/host';
