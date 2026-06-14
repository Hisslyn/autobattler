import { describe, it, expect } from "vitest";
import { computeGain } from "../src/audio/manager.js";
import { SFX_SPECS, SFX_NAMES, EVENT_SFX, castSfx, type SfxName } from "../src/audio/sfx.js";
import {
  phaseToMusicState, stateToMood, resolveMusicSource, musicFilePaths, sfxFilePaths,
  crossfadeGains, nextUnlockState, becameUnlocked, type MusicState,
} from "../src/audio/director.js";
import { midiToFreq, degreeToMidi, dueSteps, MOODS } from "../src/audio/music.js";
import type { AbilityFxKind } from "../src/combat/player.js";

describe("audio bus gain math", () => {
  it("multiplies master by channel volume", () => {
    expect(computeGain(1, 1, false)).toBe(1);
    expect(computeGain(0.5, 0.5, false)).toBe(0.25);
    expect(computeGain(0.8, 0.5, false)).toBeCloseTo(0.4);
  });

  it("mute forces gain to 0 regardless of volumes", () => {
    expect(computeGain(1, 1, true)).toBe(0);
    expect(computeGain(0.7, 0.9, true)).toBe(0);
  });

  it("clamps out-of-range volumes into [0,1]", () => {
    expect(computeGain(5, 1, false)).toBe(1);
    expect(computeGain(-2, 0.5, false)).toBe(0);
    expect(computeGain(1, 3, false)).toBe(1);
  });
});

describe("crossfade math", () => {
  it("is all-out at 0 and all-in at 1", () => {
    expect(crossfadeGains(0)).toEqual({ out: expect.closeTo(1, 5), in: expect.closeTo(0, 5) });
    expect(crossfadeGains(1)).toEqual({ out: expect.closeTo(0, 5), in: expect.closeTo(1, 5) });
  });

  it("is equal-power at the midpoint (constant combined loudness)", () => {
    const { out, in: gin } = crossfadeGains(0.5);
    expect(out).toBeCloseTo(Math.SQRT1_2, 5);
    expect(gin).toBeCloseTo(Math.SQRT1_2, 5);
    expect(out * out + gin * gin).toBeCloseTo(1, 5);
  });

  it("clamps progress outside [0,1]", () => {
    expect(crossfadeGains(-1)).toEqual(crossfadeGains(0));
    expect(crossfadeGains(2)).toEqual(crossfadeGains(1));
  });
});

describe("music director state→track resolution", () => {
  it("maps match phases to music states", () => {
    expect(phaseToMusicState("PLANNING")).toBe("planning");
    expect(phaseToMusicState("COMBAT")).toBe("combat");
    expect(phaseToMusicState("RESOLUTION")).toBe("combat");
    expect(phaseToMusicState("???")).toBe("planning");
  });

  it("backs every state with a generative mood (results underscores like menu)", () => {
    expect(stateToMood("menu")).toBe("menu");
    expect(stateToMood("results")).toBe("menu");
    expect(stateToMood("planning")).toBe("planning");
    expect(stateToMood("combat")).toBe("combat");
  });

  it("plays the file when present, else the generative version", () => {
    const states: MusicState[] = ["menu", "planning", "combat", "results"];
    for (const s of states) {
      expect(resolveMusicSource(s, true)).toBe("file");
      expect(resolveMusicSource(s, false)).toBe("generative");
    }
  });

  it("resolves per-state file slots (mp3 then ogg) under /audio/music", () => {
    expect(musicFilePaths("combat")).toEqual(["/audio/music/combat.mp3", "/audio/music/combat.ogg"]);
    expect(musicFilePaths("menu", "/cdn")).toEqual(["/cdn/music/menu.mp3", "/cdn/music/menu.ogg"]);
  });

  it("resolves per-event SFX override slots (mp3 then ogg) under /audio/sfx", () => {
    expect(sfxFilePaths("buy")).toEqual(["/audio/sfx/buy.mp3", "/audio/sfx/buy.ogg"]);
    expect(sfxFilePaths("crit", "/cdn")).toEqual(["/cdn/sfx/crit.mp3", "/cdn/sfx/crit.ogg"]);
  });
});

describe("SFX coverage map", () => {
  it("resolves every UI/combat/economy event to a defined spec", () => {
    for (const name of Object.values(EVENT_SFX)) {
      expect(SFX_SPECS[name as SfxName]).toBeDefined();
    }
  });

  it("gives every named SFX at least one synth voice", () => {
    for (const name of SFX_NAMES) {
      expect(SFX_SPECS[name].voices.length).toBeGreaterThan(0);
    }
  });

  it("maps every ability kind to a defined cast sound", () => {
    const kinds: AbilityFxKind[] = ["magic_damage", "burn", "shield", "buff", "stealth"];
    for (const k of kinds) expect(SFX_SPECS[castSfx(k)]).toBeDefined();
  });

  it("references only defined specs and covers the whole palette", () => {
    const referenced = new Set(Object.values(EVENT_SFX));
    for (const name of SFX_NAMES) expect(referenced.has(name)).toBe(true);
  });
});

describe("autoplay unlock state", () => {
  it("unlocks only once the context is running", () => {
    expect(nextUnlockState("locked", "suspended")).toBe("locked");
    expect(nextUnlockState("locked", null)).toBe("locked");
    expect(nextUnlockState("locked", "running")).toBe("unlocked");
  });

  it("is sticky once unlocked (a later suspend stays unlocked)", () => {
    expect(nextUnlockState("unlocked", "suspended")).toBe("unlocked");
    expect(nextUnlockState("unlocked", "closed")).toBe("unlocked");
  });

  it("fires the start edge exactly on locked→unlocked", () => {
    expect(becameUnlocked("locked", "unlocked")).toBe(true);
    expect(becameUnlocked("locked", "locked")).toBe(false);
    expect(becameUnlocked("unlocked", "unlocked")).toBe(false);
  });
});

describe("generative music helpers", () => {
  it("converts MIDI to equal-tempered frequency", () => {
    expect(midiToFreq(69)).toBeCloseTo(440, 5);
    expect(midiToFreq(57)).toBeCloseTo(220, 5);
    expect(midiToFreq(81)).toBeCloseTo(880, 5);
  });

  it("resolves scale degrees across octaves", () => {
    const scale = [0, 2, 3, 5, 7, 8, 10]; // A minor
    expect(degreeToMidi(57, scale, 0)).toBe(57);
    expect(degreeToMidi(57, scale, 7)).toBe(69); // wraps up an octave
    expect(degreeToMidi(57, scale, -1)).toBe(55); // wraps down (B below → A? -1 → 10-12)
  });

  it("schedules only grid steps within the lookahead window and advances the cursor", () => {
    const { times, nextTime } = dueSteps(10, 9.95, 0.12, 0.05);
    expect(times).toEqual([10, 10.05]);
    expect(nextTime).toBeCloseTo(10.1, 5);
  });

  it("catches up a far-behind cursor without spinning", () => {
    const { times } = dueSteps(0, 100, 0.1, 0.05);
    expect(times[0]).toBe(100); // starts at now, not 0
    expect(times.length).toBeLessThan(5);
  });

  it("orders mood intensity (menu calm → combat tense) and silences menu percussion", () => {
    expect(MOODS.combat.bpm).toBeGreaterThan(MOODS.planning.bpm);
    expect(MOODS.planning.bpm).toBeGreaterThan(MOODS.menu.bpm);
    expect(MOODS.menu.percGain).toBe(0);
    expect(MOODS.combat.percGain).toBeGreaterThan(0);
  });
});
