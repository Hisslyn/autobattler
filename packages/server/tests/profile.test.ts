import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import { createHttpHandler, validateName } from "../src/http.js";
import { MemoryRepository } from "../src/db/memory.js";

describe("validateName", () => {
  it("accepts 2-16 chars of the allowed charset (trimmed)", () => {
    expect(validateName("Al")).toBe("Al");
    expect(validateName("  Spaced Name  ")).toBe("Spaced Name");
    expect(validateName("a_b-c 1")).toBe("a_b-c 1");
    expect(validateName("Sixteen_chars_16")).toBe("Sixteen_chars_16");
  });
  it("rejects too short, too long, bad charset, non-strings", () => {
    expect(validateName("A")).toBeNull();
    expect(validateName("seventeen_chars_x")).toBeNull();
    expect(validateName("bad!name")).toBeNull();
    expect(validateName("emoji😀")).toBeNull();
    expect(validateName(42)).toBeNull();
    expect(validateName(undefined)).toBeNull();
  });
});

describe("PATCH /profile integration", () => {
  let server: Server;
  let base: string;
  let repo: MemoryRepository;
  let token: string;
  let accountId: string;

  beforeAll(async () => {
    repo = new MemoryRepository();
    const created = await repo.createGuest("patch-dev-1", "Original");
    token = created.token;
    accountId = created.accountId;
    const handler = createHttpHandler(repo);
    server = createServer((req, res) => void handler(req, res));
    await new Promise<void>((r) => server.listen(0, r));
    const addr = server.address() as { port: number };
    base = `http://localhost:${addr.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
    await repo.close();
  });

  it("requires auth", async () => {
    const res = await fetch(`${base}/profile`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Nope" }),
    });
    expect(res.status).toBe(401);
  });

  it("rejects invalid names with a typed error", async () => {
    const res = await fetch(`${base}/profile`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: "x" }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("INVALID_NAME");
    // unchanged
    expect((await repo.getProfile(accountId))!.name).toBe("Original");
  });

  it("persists a valid change, reflected in subsequent GET /profile", async () => {
    const patch = await fetch(`${base}/profile`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: "  Renamed  " }),
    });
    expect(patch.status).toBe(200);
    expect((await patch.json()).profile.name).toBe("Renamed");

    const get = await fetch(`${base}/profile`, { headers: { Authorization: `Bearer ${token}` } });
    expect((await get.json()).profile.name).toBe("Renamed");
  });
});
