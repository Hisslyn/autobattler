export interface AuthProfile {
  accountId: string;
  name: string;
  mmr: number;
}

export interface AuthState {
  accountId: string;
  token: string;
  profile: AuthProfile;
}

const KEY_DEVICE = "ab.deviceId";
const KEY_TOKEN = "ab.token";

/**
 * Guest auth at boot: deviceId + token persist in localStorage. Reuses a stored
 * token (validated via GET /profile) or registers a new guest ("Guest" by
 * default; renamed later in Settings). Returns null when the server is
 * unreachable, so offline Practice still works — Online/Profile/Leaderboard
 * surface the missing auth themselves.
 */
export async function bootAuth(httpBase: string): Promise<AuthState | null> {
  let deviceId = localStorage.getItem(KEY_DEVICE);
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem(KEY_DEVICE, deviceId);
  }

  const storedToken = localStorage.getItem(KEY_TOKEN);
  if (storedToken) {
    try {
      const profile = await fetchProfile(httpBase, storedToken);
      return { accountId: profile.accountId, token: storedToken, profile };
    } catch {
      /* stale token or server offline; try to (re)register below */
    }
  }

  try {
    const res = await fetch(`${httpBase}/auth/guest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId, name: "Guest" }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { accountId: string; token: string; profile: AuthProfile };
    localStorage.setItem(KEY_TOKEN, data.token);
    return data;
  } catch {
    return null; // server unreachable
  }
}

export async function fetchLeaderboard(httpBase: string, n = 50): Promise<AuthProfile[]> {
  const res = await fetch(`${httpBase}/leaderboard?n=${n}`);
  if (!res.ok) throw new Error(`leaderboard failed: ${res.status}`);
  const { leaderboard } = (await res.json()) as { leaderboard: AuthProfile[] };
  return leaderboard;
}

export interface MatchHistoryEntry {
  matchId: string;
  dataVersion: string;
  endedAt: number;
  seat: number;
  placement: number;
  mmrBefore: number | null;
  mmrAfter: number | null;
}

export async function fetchProfile(httpBase: string, token: string): Promise<AuthProfile> {
  const res = await fetch(`${httpBase}/profile`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`profile failed: ${res.status}`);
  return ((await res.json()) as { profile: AuthProfile }).profile;
}

export async function fetchHistory(httpBase: string, token: string, limit = 20): Promise<MatchHistoryEntry[]> {
  const res = await fetch(`${httpBase}/history?limit=${limit}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`history failed: ${res.status}`);
  return ((await res.json()) as { history: MatchHistoryEntry[] }).history;
}

/** Change the player name via the authenticated endpoint. Throws on rejection. */
export async function patchName(httpBase: string, token: string, name: string): Promise<AuthProfile> {
  const res = await fetch(`${httpBase}/profile`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name }),
  });
  const body = (await res.json().catch(() => ({}))) as { profile?: AuthProfile; error?: string };
  if (!res.ok) throw new Error(body.error ?? `rename failed: ${res.status}`);
  return body.profile!;
}
