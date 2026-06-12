import { describe, it, expect } from "vitest";
import { hexDistance, hexAstar, hexNeighbors, inBounds, COLS, ROWS } from "../src/hex.js";
import { mulberry32 } from "../src/prng.js";
import type { HexCoord } from "../src/hex.js";

const key = (c: HexCoord) => c.r * COLS + c.q;

describe("hexDistance", () => {
  it("same cell is 0", () => {
    expect(hexDistance({ q: 0, r: 0 }, { q: 0, r: 0 })).toBe(0);
  });

  it("adjacent cells are 1", () => {
    expect(hexDistance({ q: 0, r: 0 }, { q: 1, r: 0 })).toBe(1);
    expect(hexDistance({ q: 0, r: 0 }, { q: 0, r: 1 })).toBe(1);
    expect(hexDistance({ q: 0, r: 0 }, { q: -1, r: 1 })).toBe(1);
  });

  it("known distances", () => {
    expect(hexDistance({ q: 0, r: 0 }, { q: 3, r: 0 })).toBe(3);
    expect(hexDistance({ q: 0, r: 0 }, { q: 2, r: 2 })).toBe(4);
    expect(hexDistance({ q: 1, r: 2 }, { q: 4, r: 5 })).toBe(6);
  });

  it("symmetric", () => {
    expect(hexDistance({ q: 2, r: 3 }, { q: 5, r: 1 })).toBe(
      hexDistance({ q: 5, r: 1 }, { q: 2, r: 3 })
    );
  });
});

describe("hexNeighbors", () => {
  it("corner cell has fewer neighbors", () => {
    const nb = hexNeighbors({ q: 0, r: 0 });
    expect(nb.every(inBounds)).toBe(true);
    expect(nb.length).toBeLessThan(6);
  });

  it("center cell has 6 neighbors", () => {
    const nb = hexNeighbors({ q: 3, r: 4 });
    expect(nb.length).toBe(6);
  });
});

describe("hexAstar", () => {
  it("returns empty path for same start/goal", () => {
    expect(hexAstar({ q: 0, r: 0 }, { q: 0, r: 0 }, new Set())).toEqual([]);
  });

  it("finds direct path length 1 to neighbor", () => {
    const path = hexAstar({ q: 0, r: 0 }, { q: 1, r: 0 }, new Set());
    expect(path.length).toBe(1);
    expect(path[0]).toEqual({ q: 1, r: 0 });
  });

  it("finds path around obstacle", () => {
    // Block q=1,r=0 (key = 0*7+1=1)
    const blocked = new Set<number>([1]);
    const path = hexAstar({ q: 0, r: 0 }, { q: 2, r: 0 }, blocked);
    expect(path.length).toBeGreaterThan(0);
    // Path should not include blocked cell
    expect(path.some((c) => c.q === 1 && c.r === 0)).toBe(false);
  });

  it("blocked (occupied) goal at range is still pathable up to the goal", () => {
    const goal = { q: 3, r: 3 };
    const blocked = new Set<number>([key(goal)]); // standard occupied-goal exemption
    const path = hexAstar({ q: 0, r: 0 }, goal, blocked);
    expect(path.length).toBeGreaterThan(0);
    expect(path[path.length - 1]).toEqual(goal);
    // No step except the goal itself enters a blocked hex
    for (const step of path.slice(0, -1)) {
      expect(blocked.has(key(step))).toBe(false);
    }
  });

  it("fully-walled start returns exactly the empty path", () => {
    // Block all of row r=1: every route from row 0 to rows >= 2 crosses it
    const blocked = new Set<number>();
    for (let q = 0; q < COLS; q++) blocked.add(key({ q, r: 1 }));
    expect(hexAstar({ q: 0, r: 0 }, { q: 3, r: 5 }, blocked)).toEqual([]);
  });

  it("path never enters occupied hexes across random seeded boards", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const prng = mulberry32(seed);
      const blocked = new Set<number>();
      for (let i = 0; i < 15; i++) blocked.add(prng() % (COLS * ROWS));
      const free: HexCoord[] = [];
      for (let r = 0; r < ROWS; r++) {
        for (let q = 0; q < COLS; q++) {
          if (!blocked.has(key({ q, r }))) free.push({ q, r });
        }
      }
      const start = free[prng() % free.length]!;
      let goal = free[prng() % free.length]!;
      if (key(goal) === key(start)) goal = free[(free.indexOf(goal) + 1) % free.length]!;

      const path = hexAstar(start, goal, blocked);
      let prev = start;
      for (const step of path) {
        expect(blocked.has(key(step)), `seed ${seed}: step into occupied hex`).toBe(false);
        expect(hexDistance(prev, step), `seed ${seed}: non-adjacent step`).toBe(1);
        expect(inBounds(step)).toBe(true);
        prev = step;
      }
      if (path.length > 0) expect(path[path.length - 1]).toEqual(goal);
    }
  });

  it("path does not revisit cells", () => {
    const path = hexAstar({ q: 0, r: 0 }, { q: 4, r: 4 }, new Set());
    const keys = path.map(key);
    const unique = new Set(keys);
    expect(unique.size).toBe(keys.length);
  });
});
