import { describe, it, expect } from "vitest";
import { loadSettings, saveSettings, DEFAULT_SETTINGS, type Settings } from "../src/settings.js";

function mockStorage(): Pick<Storage, "getItem" | "setItem"> & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  };
}

describe("settings persistence", () => {
  it("returns defaults when storage is empty", () => {
    expect(loadSettings(mockStorage())).toEqual(DEFAULT_SETTINGS);
  });

  it("defaults combat speed to 0.25x (quarter the old 1x pace)", () => {
    expect(DEFAULT_SETTINGS.defaultSpeed).toBe(0.25);
    expect(loadSettings(mockStorage()).defaultSpeed).toBe(0.25);
  });

  it("accepts each supported combat speed (0.25 / 0.5 / 1 / 2)", () => {
    for (const speed of [0.25, 0.5, 1, 2] as const) {
      const s = mockStorage();
      s.setItem("ab.settings", JSON.stringify({ defaultSpeed: speed }));
      expect(loadSettings(s).defaultSpeed).toBe(speed);
    }
  });

  it("round-trips a full settings object", () => {
    const s = mockStorage();
    const custom: Settings = {
      masterVolume: 0.3,
      sfxVolume: 0.1,
      musicVolume: 0.9,
      muted: true,
      musicEnabled: false,
      defaultSpeed: 2,
      reducedMotion: true,
    };
    saveSettings(s, custom);
    expect(loadSettings(s)).toEqual(custom);
  });

  it("clamps out-of-range volumes and coerces bad fields to defaults", () => {
    const s = mockStorage();
    s.setItem("ab.settings", JSON.stringify({ masterVolume: 5, sfxVolume: -2, defaultSpeed: 7, muted: "yes" }));
    const loaded = loadSettings(s);
    expect(loaded.masterVolume).toBe(1);
    expect(loaded.sfxVolume).toBe(0);
    expect(loaded.defaultSpeed).toBe(DEFAULT_SETTINGS.defaultSpeed);
    expect(loaded.muted).toBe(DEFAULT_SETTINGS.muted);
  });

  it("survives corrupt JSON", () => {
    const s = mockStorage();
    s.setItem("ab.settings", "{not json");
    expect(loadSettings(s)).toEqual(DEFAULT_SETTINGS);
  });
});
