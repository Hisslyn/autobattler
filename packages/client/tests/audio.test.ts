import { describe, it, expect } from "vitest";
import { computeGain } from "../src/audio/manager.js";
import { SFX_SPECS, SFX_NAMES, EVENT_SFX, castSfx, type SfxName } from "../src/audio/sfx.js";
import {
  phaseToMusicState, stateToMood, resolveMusicSource, musicFilePaths, sfxFilePaths,
  crossfadeGains, nextUnlockState, becameUnlocked, type MusicState,
} from "../src/audio/director.js";
import {
  midiToFreq, degreeToMidi, dueSteps, MOODS, PROGRESSIONS, MIX,
  triad, progressionFor, generateMotif, varyMotif, voiceLead, type MusicMood,
} from "../src/audio/music.js";
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

describe("chord progressions per state", () => {
  const moods: MusicMood[] = ["menu", "planning", "combat"];

  it("stacks a diatonic triad (root, third, fifth) from a root degree", () => {
    expect(triad(0)).toEqual([0, 2, 4]);
    expect(triad(5)).toEqual([5, 7, 9]);
  });

  it("gives each state a distinct moving progression of expected roots", () => {
    expect(PROGRESSIONS.menu).toEqual([0, 5, 2, 6]); // i VI III VII
    expect(PROGRESSIONS.planning).toEqual([0, 3, 5, 4]); // i iv VI V
    expect(PROGRESSIONS.combat).toEqual([0, 6, 5, 4]); // i VII VI v
    // moving, not a static single chord
    for (const m of moods) expect(new Set(PROGRESSIONS[m]).size).toBeGreaterThan(1);
  });

  it("each progression is 4 bars (divides evenly into the loop) and resolves home", () => {
    for (const m of moods) {
      const roots = PROGRESSIONS[m];
      expect(roots.length).toBe(4);
      expect(roots[0]).toBe(0); // starts on the tonic so the loop seam resolves
    }
  });

  it("progressionFor builds the bar-by-bar triads from the roots", () => {
    expect(progressionFor("menu")).toEqual([
      [0, 2, 4], [5, 7, 9], [2, 4, 6], [6, 8, 10],
    ]);
    for (const m of moods) {
      const prog = progressionFor(m);
      expect(prog.length).toBe(MOODS[m].progression.length);
      prog.forEach((chord, i) => expect(chord).toEqual(MOODS[m].progression[i]));
    }
  });
});

describe("seeded melodic motif", () => {
  it("is deterministic for a given seed (same seed → same notes)", () => {
    expect(generateMotif(0x4d, 8)).toEqual(generateMotif(0x4d, 8));
    expect(generateMotif(123, 12)).toEqual(generateMotif(123, 12));
  });

  it("yields a different phrase for a different seed", () => {
    expect(generateMotif(1, 8)).not.toEqual(generateMotif(2, 8));
  });

  it("has the requested length and only step/skip degrees or rests", () => {
    const motif = generateMotif(0x9c, 8);
    expect(motif.length).toBe(8);
    for (const n of motif) {
      if (n === null) continue;
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(-6);
      expect(n).toBeLessThanOrEqual(10);
    }
    // a motif is more than rests
    expect(motif.filter((n) => n !== null).length).toBeGreaterThan(0);
  });

  it("varies deterministically per loop pass (same pass → same variation)", () => {
    const motif = generateMotif(0x4d, 8);
    expect(varyMotif(motif, 3)).toEqual(varyMotif(motif, 3));
    expect(varyMotif(motif, 1)).not.toEqual(varyMotif(motif, 2));
  });

  it("states the theme plainly on pass 0 and keeps the same length", () => {
    const motif = generateMotif(0x4d, 8);
    expect(varyMotif(motif, 0)).toEqual(motif);
    expect(varyMotif(motif, 0)).not.toBe(motif); // a copy, not the same ref
    for (const p of [0, 1, 5, 12]) expect(varyMotif(motif, p).length).toBe(motif.length);
  });
});

describe("voice-leading", () => {
  const scale = [0, 2, 3, 5, 7, 8, 10];

  it("returns the plain voicing when there is no previous chord", () => {
    expect(voiceLead([], [0, 2, 4], 57, scale)).toEqual([57, 60, 64]);
  });

  it("moves to the nearest octave of each tone (small total motion, no big leaps)", () => {
    const prev = voiceLead([], [0, 2, 4], 57, scale); // A C E
    const next = voiceLead(prev, [5, 0, 2], 57, scale); // F-rooted chord
    // every voiced note stays close to some previous note (stepwise/shared)
    for (const n of next) {
      const nearest = Math.min(...prev.map((p) => Math.abs(p - n)));
      expect(nearest).toBeLessThanOrEqual(7);
    }
    expect([...next]).toEqual([...next].sort((a, b) => a - b));
  });
});

describe("mixing gain table", () => {
  const moods: MusicMood[] = ["menu", "planning", "combat"];

  it("keeps every layer gain in (0,1] (perc may be 0 when silenced)", () => {
    for (const m of moods) {
      const mix = MIX[m];
      for (const [layer, g] of Object.entries(mix)) {
        if (layer === "perc" && g === 0) continue;
        expect(g).toBeGreaterThan(0);
        expect(g).toBeLessThanOrEqual(1);
      }
    }
  });

  it("seats the lead above the pad and never lets percussion dominate", () => {
    for (const m of moods) {
      const mix = MIX[m];
      expect(mix.lead).toBeGreaterThan(mix.pad);
      expect(mix.perc).toBeLessThan(mix.lead);
      expect(mix.perc).toBeLessThanOrEqual(mix.pad);
    }
    expect(MIX.menu.perc).toBe(0); // menu has no percussion layer
  });
});
