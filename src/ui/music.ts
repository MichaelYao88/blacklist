import morePower from '../assets/audio/more-power.mp3?url';
import chiptune from '../assets/audio/chiptune.mp3?url';
import darkScore from '../assets/audio/dark-score.mp3?url';
import upbeatDrums from '../assets/audio/upbeat-drums.mp3?url';
import dangerous from '../assets/audio/dangerous.mp3?url';
import dark from '../assets/audio/dark.mp3?url';
import darkSynthwave from '../assets/audio/dark-synthwave.mp3?url';

export type MusicTrack =
  | 'more-power'
  | 'chiptune'
  | 'dark-score'
  | 'upbeat-drums'
  | 'dangerous'
  | 'dark'
  | 'dark-synthwave';

export interface MusicTrackInfo {
  id: MusicTrack;
  name: string;
  src: string;
}

export const MUSIC_TRACKS: MusicTrackInfo[] = [
  { id: 'more-power', name: 'More Power', src: morePower },
  { id: 'chiptune', name: 'Chip Tunes', src: chiptune },
  { id: 'dark-score', name: 'Dark Score', src: darkScore },
  { id: 'upbeat-drums', name: 'Drums', src: upbeatDrums },
  { id: 'dangerous', name: 'Dangerous', src: dangerous },
  { id: 'dark', name: 'Dark · Sub_Clair', src: dark },
  { id: 'dark-synthwave', name: 'Dark Synthwave · Sub_Clair', src: darkSynthwave },
];

const TRACK_BY_ID = new Map(MUSIC_TRACKS.map((track) => [track.id, track]));
const MUSIC_KEY = 'blacklist.music.v1';

function isTrack(value: string | null): value is MusicTrack {
  return value !== null && TRACK_BY_ID.has(value as MusicTrack);
}

class Music {
  private audio: HTMLAudioElement | null = null;
  private selected: MusicTrack | null = 'dark-score';
  private volume = 0.11;
  private muted = false;
  private boss = false;
  private unlocked = false;

  constructor() {
    try {
      const raw = localStorage.getItem(MUSIC_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { track?: string | null; muted?: boolean };
        if (parsed.track === null) {
          this.selected = null;
        } else if (isTrack(parsed.track ?? null)) {
          this.selected = parsed.track as MusicTrack;
        } else {
          this.selected = 'dark-score';
        }
        this.muted = Boolean(parsed.muted);
      }
    } catch {
      // Use the defaults.
    }
  }

  get selectedTrack(): MusicTrack | null {
    return this.selected;
  }

  get bossActive(): boolean {
    return this.boss && this.selected !== null;
  }

  get mutedState(): boolean {
    return this.muted;
  }

  get currentName(): string {
    if (this.boss && this.selected) return 'More Power · boss';
    if (!this.selected) return 'Off';
    return TRACK_BY_ID.get(this.selected)?.name ?? 'Off';
  }

  setTrack(track: MusicTrack | 'off'): void {
    this.selected = track === 'off' ? null : track;
    this.persist();
    this.sync();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    this.persist();
    this.sync();
    return this.muted;
  }

  setBoss(active: boolean): void {
    if (this.boss === active) return;
    this.boss = active;
    this.sync();
  }

  /** Browsers require a gesture before audio can start. */
  unlock(): void {
    this.unlocked = true;
    this.sync();
  }

  pause(): void {
    this.audio?.pause();
  }

  resume(): void {
    this.sync();
  }

  private persist(): void {
    try {
      localStorage.setItem(MUSIC_KEY, JSON.stringify({
        track: this.selected,
        muted: this.muted,
      }));
    } catch {
      // Ignore private mode.
    }
  }

  private sync(): void {
    if (typeof window === 'undefined') return;
    const track = this.boss && this.selected ? 'more-power' : this.selected;
    if (!track || this.muted || !this.unlocked) {
      this.audio?.pause();
      return;
    }
    const info = TRACK_BY_ID.get(track);
    if (!info) return;
    const audio = this.ensure();
    if (audio.dataset.track !== track) {
      audio.dataset.track = track;
      audio.src = info.src;
      audio.currentTime = 0;
      audio.load();
    }
    if (audio.paused) {
      void audio.play().catch(() => {
        // The next gesture will retry.
      });
    }
  }

  private ensure(): HTMLAudioElement {
    if (this.audio) return this.audio;
    const audio = new Audio();
    audio.loop = true;
    audio.preload = 'auto';
    audio.volume = this.volume;
    audio.setAttribute('aria-hidden', 'true');
    this.audio = audio;
    return audio;
  }
}

export const music = new Music();
