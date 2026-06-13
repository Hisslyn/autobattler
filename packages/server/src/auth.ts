import { createHmac } from "node:crypto";

// HMAC-signed opaque token: base64url(accountId).base64url(hmac(accountId)).
// AUTH_SECRET from env; dev default is fine for local play, not production.
const SECRET = process.env["AUTH_SECRET"] ?? "dev-secret-change-me";

function hmac(payload: string): string {
  return createHmac("sha256", SECRET).update(payload).digest("base64url");
}

export function signToken(accountId: string): string {
  return `${Buffer.from(accountId).toString("base64url")}.${hmac(accountId)}`;
}

/** Returns the accountId if the signature is valid, else null. */
export function verifyToken(token: string): string | null {
  const dot = token.indexOf(".");
  if (dot < 0) return null;
  let accountId: string;
  try {
    accountId = Buffer.from(token.slice(0, dot), "base64url").toString();
  } catch {
    return null;
  }
  return token === signToken(accountId) ? accountId : null;
}
