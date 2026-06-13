import type { IncomingMessage, ServerResponse } from "node:http";
import type { Repository } from "./db/index.js";

const MAX_BODY = 4096;
const LEADERBOARD_MAX = 200;
const HISTORY_MAX = 100;

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString();
      if (body.length > MAX_BODY) {
        reject(new Error("body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function bearerToken(req: IncomingMessage): string | null {
  const header = req.headers["authorization"];
  if (typeof header !== "string" || !header.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length);
}

/**
 * Minimal HTTP API sharing the WS port: POST /auth/guest, GET /leaderboard,
 * GET /profile, GET /history. Returns true if the request was handled.
 */
export function createHttpHandler(repo: Repository) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? "/", "http://localhost");

    try {
      if (req.method === "OPTIONS") {
        sendJson(res, 204, {});
        return;
      }

      if (req.method === "POST" && url.pathname === "/auth/guest") {
        let parsed: unknown;
        try {
          parsed = JSON.parse(await readBody(req));
        } catch {
          sendJson(res, 400, { error: "invalid JSON body" });
          return;
        }
        const body = parsed as Record<string, unknown>;
        if (typeof body["deviceId"] !== "string" || body["deviceId"].length === 0) {
          sendJson(res, 400, { error: "deviceId required" });
          return;
        }
        const name = typeof body["name"] === "string" && body["name"].trim() !== ""
          ? body["name"].trim().slice(0, 24)
          : undefined;
        const { accountId, token } = name !== undefined
          ? await repo.createGuest(body["deviceId"], name)
          : await repo.createGuest(body["deviceId"]);
        const profile = await repo.getProfile(accountId);
        sendJson(res, 200, { accountId, token, profile });
        return;
      }

      if (req.method === "GET" && url.pathname === "/leaderboard") {
        const n = Math.min(LEADERBOARD_MAX, Math.max(1, Number(url.searchParams.get("n") ?? 50) || 50));
        sendJson(res, 200, { leaderboard: await repo.leaderboard(n) });
        return;
      }

      if (req.method === "GET" && (url.pathname === "/profile" || url.pathname === "/history")) {
        const token = bearerToken(req);
        const account = token ? await repo.findByToken(token) : null;
        if (!account) {
          sendJson(res, 401, { error: "UNAUTHENTICATED" });
          return;
        }
        if (url.pathname === "/profile") {
          sendJson(res, 200, { profile: await repo.getProfile(account.accountId) });
        } else {
          const limit = Math.min(HISTORY_MAX, Math.max(1, Number(url.searchParams.get("limit") ?? 20) || 20));
          sendJson(res, 200, { history: await repo.matchHistory(account.accountId, limit) });
        }
        return;
      }

      sendJson(res, 404, { error: "not found" });
    } catch (err) {
      console.error("[http] error handling", req.method, url.pathname, err);
      sendJson(res, 500, { error: "internal error" });
    }
  };
}
