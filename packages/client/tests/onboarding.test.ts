import { describe, it, expect } from "vitest";
import { shouldShowCoachmarks, markCoachmarksSeen } from "../src/onboarding.js";

function mockStorage(): Pick<Storage, "getItem" | "setItem"> {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  };
}

describe("coachmark gating", () => {
  it("shows on first match, suppresses on the second", () => {
    const storage = mockStorage();
    expect(shouldShowCoachmarks(storage)).toBe(true); // first practice match
    markCoachmarksSeen(storage);
    expect(shouldShowCoachmarks(storage)).toBe(false); // second match: suppressed
  });

  it("independent storages do not share the seen flag", () => {
    const a = mockStorage();
    const b = mockStorage();
    markCoachmarksSeen(a);
    expect(shouldShowCoachmarks(a)).toBe(false);
    expect(shouldShowCoachmarks(b)).toBe(true);
  });
});
