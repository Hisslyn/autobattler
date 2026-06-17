// Client preferences persisted in localStorage. Gameplay-affecting prefs
// (defaultSpeed, reducedMotion) are read by the match scene; volumes/mute are
// read by the audio manager. The player name is NOT here — it lives server-side
// and is changed via PATCH /profile.

// 0.25 is the new experienced default (quarter the old 1x pace); 0.5 and 1 are
// faster options. "1x" keeps its prior meaning everywhere.
export type PlaybackSpeedPref = 0.25 | 0.5 | 1 | 2;

export interface Settings {
  masterVolume: number; // 0..1
  sfxVolume: number; // 0..1
  musicVolume: number; // 0..1
  muted: boolean;
  musicEnabled: boolean; // explicit music on/off, independent of volume
  defaultSpeed: PlaybackSpeedPref;
  reducedMotion: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  masterVolume: 0.7,
  sfxVolume: 0.8,
  musicVolume: 0.5,
  muted: false,
  musicEnabled: true,
  defaultSpeed: 0.25,
  reducedMotion: false,
};

const KEY = "ab.settings";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function clamp01(n: unknown, fallback: number): number {
  return typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;
}

/** Parse persisted settings, merging onto defaults and clamping ranges. */
export function loadSettings(storage: StorageLike): Settings {
  let raw: Partial<Settings> = {};
  try {
    const s = storage.getItem(KEY);
    if (s) raw = JSON.parse(s) as Partial<Settings>;
  } catch {
    raw = {};
  }
  return {
    masterVolume: clamp01(raw.masterVolume, DEFAULT_SETTINGS.masterVolume),
    sfxVolume: clamp01(raw.sfxVolume, DEFAULT_SETTINGS.sfxVolume),
    musicVolume: clamp01(raw.musicVolume, DEFAULT_SETTINGS.musicVolume),
    muted: typeof raw.muted === "boolean" ? raw.muted : DEFAULT_SETTINGS.muted,
    musicEnabled: typeof raw.musicEnabled === "boolean" ? raw.musicEnabled : DEFAULT_SETTINGS.musicEnabled,
    defaultSpeed: raw.defaultSpeed === 2 ? 2 : raw.defaultSpeed === 1 ? 1 : raw.defaultSpeed === 0.5 ? 0.5 : 0.25,
    reducedMotion: typeof raw.reducedMotion === "boolean" ? raw.reducedMotion : DEFAULT_SETTINGS.reducedMotion,
  };
}

export function saveSettings(storage: StorageLike, settings: Settings): void {
  try {
    storage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* storage unavailable (private mode); ignore */
  }
}

/** Live, persisted settings holder with change notification. */
export class SettingsStore {
  private settings: Settings;
  private listeners = new Set<(s: Settings) => void>();

  constructor(private storage: StorageLike = localStorage) {
    this.settings = loadSettings(storage);
  }

  get(): Settings {
    return this.settings;
  }

  update(patch: Partial<Settings>): void {
    this.settings = { ...this.settings, ...patch };
    saveSettings(this.storage, this.settings);
    for (const l of this.listeners) l(this.settings);
  }

  subscribe(fn: (s: Settings) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
