// First-Practice-match coachmarks: shown once, gated by a localStorage flag.
// A full scripted tutorial match is out of scope (see design-notes.md).

const KEY = "ab.coachmarksSeen";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

/** True only until markCoachmarksSeen has been called (persisted). */
export function shouldShowCoachmarks(storage: StorageLike): boolean {
  try {
    return storage.getItem(KEY) !== "1";
  } catch {
    return false;
  }
}

export function markCoachmarksSeen(storage: StorageLike): void {
  try {
    storage.setItem(KEY, "1");
  } catch {
    /* storage unavailable; ignore */
  }
}

/** Target rectangle in design space (390×844), matching the match scene layout. */
export interface CoachmarkStep {
  id: string;
  title: string;
  body: string;
  rect: { x: number; y: number; w: number; h: number };
}

// Rects approximate the regions laid out in scenes/match.ts (design coords).
export const COACHMARK_STEPS: CoachmarkStep[] = [
  { id: "shop", title: "Shop", body: "Tap a unit card to buy it. Three copies merge into a 2-star.", rect: { x: 6, y: 520, w: 320, h: 72 } },
  { id: "reroll", title: "Reroll", body: "Spend gold to refresh the shop with new units.", rect: { x: 326, y: 520, w: 58, h: 26 } },
  { id: "buyxp", title: "Buy XP", body: "Buy XP to level up — higher levels unlock better units and more board slots.", rect: { x: 326, y: 550, w: 58, h: 26 } },
  { id: "bench", title: "Bench", body: "Bought units land here. Drag them onto the board to field them.", rect: { x: 40, y: 470, w: 300, h: 36 } },
  { id: "board", title: "Board", body: "Your fighters. Position matters — drag units between hexes, then Ready up.", rect: { x: 20, y: 265, w: 350, h: 200 } },
];
