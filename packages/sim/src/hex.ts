export interface HexCoord {
  q: number;
  r: number;
}

export const COLS = 7;
export const ROWS = 8;

export function hexDistance(a: HexCoord, b: HexCoord): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) >> 1;
}

export function hexNeighbors(h: HexCoord): HexCoord[] {
  const dirs: HexCoord[] = [
    { q: 1, r: 0 },
    { q: -1, r: 0 },
    { q: 0, r: 1 },
    { q: 0, r: -1 },
    { q: 1, r: -1 },
    { q: -1, r: 1 },
  ];
  return dirs
    .map((d) => ({ q: h.q + d.q, r: h.r + d.r }))
    .filter(inBounds);
}

export function inBounds(h: HexCoord): boolean {
  return h.q >= 0 && h.q < COLS && h.r >= 0 && h.r < ROWS;
}

function hexKey(h: HexCoord): number {
  return h.r * COLS + h.q;
}

export function hexAstar(
  start: HexCoord,
  goal: HexCoord,
  blocked: Set<number>
): HexCoord[] {
  const startKey = hexKey(start);
  const goalKey = hexKey(goal);

  if (startKey === goalKey) return [];

  const open = new Set<number>([startKey]);
  const cameFrom = new Map<number, number>();
  const gScore = new Map<number, number>([[startKey, 0]]);
  const fScore = new Map<number, number>([[startKey, hexDistance(start, goal)]]);

  const keyToCoord = new Map<number, HexCoord>([[startKey, start], [goalKey, goal]]);

  while (open.size > 0) {
    let currentKey = -1;
    let bestF = Infinity;
    for (const k of open) {
      const f = fScore.get(k) ?? Infinity;
      if (f < bestF) {
        bestF = f;
        currentKey = k;
      }
    }

    if (currentKey === goalKey) {
      const path: HexCoord[] = [];
      let cur = currentKey;
      while (cameFrom.has(cur)) {
        const coord = keyToCoord.get(cur);
        if (coord !== undefined) path.unshift(coord);
        cur = cameFrom.get(cur)!;
      }
      return path;
    }

    open.delete(currentKey);
    const currentCoord = keyToCoord.get(currentKey)!;

    for (const nb of hexNeighbors(currentCoord)) {
      const nbKey = hexKey(nb);
      if (blocked.has(nbKey) && nbKey !== goalKey) continue;

      const tentativeG = (gScore.get(currentKey) ?? Infinity) + 1;
      if (tentativeG < (gScore.get(nbKey) ?? Infinity)) {
        cameFrom.set(nbKey, currentKey);
        gScore.set(nbKey, tentativeG);
        fScore.set(nbKey, tentativeG + hexDistance(nb, goal));
        keyToCoord.set(nbKey, nb);
        open.add(nbKey);
      }
    }
  }

  return [];
}
