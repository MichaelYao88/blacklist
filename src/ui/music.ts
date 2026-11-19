import morePower from '../assets/audio/more-power.mp3?url';
import chiptune from '../assets/audio/chiptune.mp3?url';
import darkScore from '../assets/audio/dark-score.mp3?url';
import dangerous from '../assets/audio/dangerous.mp3?url';
import dark from '../assets/audio/dark.mp3?url';
import darkSynthwave from '../assets/audio/dark-synthwave.mp3?url';
import synthwaveRetro80s from '../assets/audio/synthwave-retro-80s.mp3?url';
import goldenGun from '../assets/audio/golden-gun.mp3?url';
import darkElectronic from '../assets/audio/dark-electronic.mp3?url';
import darkTrap from '../assets/audio/dark-trap.mp3?url';
import trapInstrumental from '../assets/audio/trap-instrumental.mp3?url';
import trapBeat from '../assets/audio/trap-beat.mp3?url';
import rapTrapInstrumental from '../assets/audio/rap-trap-instrumental.mp3?url';

export type MusicTrack =
  | 'more-power'
  | 'chiptune'
  | 'dark-score'
  | 'dangerous'
  | 'dark'
  | 'dark-synthwave'
  | 'synthwave-retro-80s'
  | 'golden-gun'
  | 'dark-electronic'
  | 'dark-trap'
  | 'trap-instrumental'
  | 'trap-beat'
  | 'rap-trap-instrumental';

export interface MusicTrackInfo {
  id: MusicTrack;
  name: string;
  src: string;
}

export const MUSIC_TRACKS: MusicTrackInfo[] = [
  { id: 'more-power', name: 'More Power', src: morePower },
  { id: 'chiptune', name: 'Chip Tunes', src: chiptune },
  { id: 'dark-score', name: 'Dark Score', src: darkScore },
  { id: 'dangerous', name: 'Dangerous', src: dangerous },
  { id: 'dark', name: 'Dark · Sub_Clair', src: dark },
  { id: 'dark-synthwave', name: 'Dark Synthwave · Sub_Clair', src: darkSynthwave },
  { id: 'synthwave-retro-80s', name: 'Synthwave Retro 80s · DELOSound', src: synthwaveRetro80s },
  { id: 'golden-gun', name: 'Golden Gun · SlimeyFox', src: goldenGun },
  { id: 'dark-electronic', name: 'Dark Electronic · alex-morgan', src: darkElectronic },
  { id: 'dark-trap', name: 'Dark Trap · APALONBeats', src: darkTrap },
  { id: 'trap-instrumental', name: 'Trap Instrumental · Sub_Clair', src: trapInstrumental },
  { id: 'trap-beat', name: 'Trap Beat · JonasBlakewood', src: trapBeat },
  { id: 'rap-trap-instrumental', name: 'Rap Trap Instrumental · Sub_Clair', src: rapTrapInstrumental },
];

const TRACK_BY_ID = new Map(MUSIC_TRACKS.map((track) => [track.id, track]));
const CAROUSEL = MUSIC_TRACKS.filter((track) => track.id !== 'more-power');
const MUSIC_KEY = 'blacklist.music.v2';
const DEFAULT_TRACK: MusicTrack = 'dark-synthwave';

class Music {
  private audio: HTMLAudioElement | null = null;
  private volume = 0.11;
  private muted = false;
  private selected: MusicTrack = DEFAULT_TRACK;
  private boss = false;
  private unlocked = false;
  private lastMilestone = 0;

  constructor() {
    try {
      const raw = localStorage.getItem(MUSIC_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { track?: string; muted?: boolean };
        if (parsed.track && TRACK_BY_ID.has(parsed.track as MusicTrack)) {
          this.selected = parsed.track as MusicTrack;
        }
        this.muted = Boolean(parsed.muted);
      }
    } catch {
      // Use defaults.
    }
  }

  get bossActive(): boolean {
    return this.boss;
  }

  get mutedState(): boolean {
    return this.muted;
  }

  get currentName(): string {
    if (this.boss) return 'More Power · final boss';
    return TRACK_BY_ID.get(this.selected)?.name ?? 'Dark Synthwave';
  }

  cycleTrack(): void {
    const index = CAROUSEL.findIndex((track) => track.id === this.selected);
    this.selected = CAROUSEL[(index + 1) % CAROUSEL.length].id;
    this.persist();
    this.sync();
  }

  /** Every run opens on Dark Synthwave, then drifts every five levels. */
  beginRun(): void {
    this.selected = DEFAULT_TRACK;
    this.lastMilestone = 0;
    this.persist();
    this.sync();
  }

  /** Swap to a random regular track at levels 7, 14, 21 and so on. */
  setLevel(level: number): void {
    const milestone = Math.floor(level / 7) * 7;
    if (milestone <= 0 || milestone === this.lastMilestone) return;
    this.lastMilestone = milestone;
    this.selected = CAROUSEL[Math.floor(Math.random() * CAROUSEL.length)].id;
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
    if (this.muted || !this.unlocked) {
      this.audio?.pause();
      return;
    }
    const info = TRACK_BY_ID.get(this.boss ? 'more-power' : this.selected);
    if (!info) return;
    const audio = this.ensure();
    if (audio.dataset.track !== info.id) {
      audio.dataset.track = info.id;
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
