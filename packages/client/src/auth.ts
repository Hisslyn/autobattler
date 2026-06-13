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
 * Guest auth: deviceId + token persist in localStorage. First launch prompts
 * for a name and registers via POST /auth/guest; later launches reuse the
 * stored token (validated via GET /profile, falling back to re-register).
 */
export async function ensureAuth(httpBase: string): Promise<AuthState> {
  let deviceId = localStorage.getItem(KEY_DEVICE);
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem(KEY_DEVICE, deviceId);
  }

  const storedToken = localStorage.getItem(KEY_TOKEN);
  if (storedToken) {
    const res = await fetch(`${httpBase}/profile`, {
      headers: { Authorization: `Bearer ${storedToken}` },
    });
    if (res.ok) {
      const { profile } = (await res.json()) as { profile: AuthProfile };
      return { accountId: profile.accountId, token: storedToken, profile };
    }
  }

  // First launch (or stale token): prompt for a name and register
  const name = (window.prompt("Choose a player name", "Guest") ?? "Guest").trim() || "Guest";
  const res = await fetch(`${httpBase}/auth/guest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId, name }),
  });
  if (!res.ok) throw new Error(`auth failed: ${res.status}`);
  const data = (await res.json()) as { accountId: string; token: string; profile: AuthProfile };
  localStorage.setItem(KEY_TOKEN, data.token);
  return data;
}

export async function fetchLeaderboard(httpBase: string, n = 50): Promise<AuthProfile[]> {
  const res = await fetch(`${httpBase}/leaderboard?n=${n}`);
  if (!res.ok) throw new Error(`leaderboard failed: ${res.status}`);
  const { leaderboard } = (await res.json()) as { leaderboard: AuthProfile[] };
  return leaderboard;
}
