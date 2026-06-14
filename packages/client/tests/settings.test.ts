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
    expect(loaded.defaultSpeed).toBe(1);
    expect(loaded.muted).toBe(DEFAULT_SETTINGS.muted);
  });

  it("survives corrupt JSON", () => {
    const s = mockStorage();
    s.setItem("ab.settings", "{not json");
    expect(loadSettings(s)).toEqual(DEFAULT_SETTINGS);
  });
});
