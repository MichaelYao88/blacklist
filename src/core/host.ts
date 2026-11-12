import type { Command, Core, GameEvent, RunState, RunView } from './types';

/**
 * Storage is injected so the host stays platform-agnostic.
 * Web: localStorage. React Native: AsyncStorage. Unity: PlayerPrefs.
 * Tests: an in-memory object.
 */
export interface SaveStore {
  load(): string | null;
  save(json: string): void;
  clear(): void;
}

export interface CoreHostOptions {
  core: Core;
  store: SaveStore;
}

/**
 * A tiny adapter around a Core. It owns the one active-run save slot:
 * every completed step is persisted; a finished run (win or loss) clears it.
 */
export class CoreHost {
  private readonly core: Core;
  private readonly store: SaveStore;
  private state: RunState | null = null;

  constructor(options: CoreHostOptions) {
    this.core = options.core;
    this.store = options.store;
  }

  get current(): RunState | null {
    return this.state;
  }

  get hasRun(): boolean {
    return this.state !== null;
  }

  /** Start a fresh run, replacing any active save. */
  start(seed: string, ascension = 0): GameEvent[] {
    const result = this.core.newRun({ seed, ascension });
    this.state = result.state;
    this.store.save(this.core.serialize(result.state));
    return result.events;
  }

  /** Restore the active run from storage, if any. */
  resume(): GameEvent[] {
    const json = this.store.load();
    if (!json) return [];
    const state = this.core.deserialize(json);
    if (!state || state.over) {
      this.store.clear();
      this.state = null;
      return [];
    }
    this.state = state;
    return [];
  }

  discard(): void {
    this.state = null;
    this.store.clear();
  }

  dispatch(command: Command): GameEvent[] {
    if (!this.state) return [];
    const result = this.core.step(this.state, command);
    this.state = result.state;
    if (result.state.over) {
      this.store.clear();
    } else {
      this.store.save(this.core.serialize(result.state));
    }
    return result.events;
  }

  view(): RunView | null {
    return this.state ? this.core.view(this.state) : null;
  }
}

/** An in-memory store, useful for tests and headless simulations. */
export class MemoryStore implements SaveStore {
  private value: string | null = null;

  load(): string | null {
    return this.value;
  }

  save(json: string): void {
    this.value = json;
  }

  clear(): void {
    this.value = null;
  }
}
