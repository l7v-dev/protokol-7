import assert from "node:assert/strict";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import type { BrowserContext } from "playwright";
import { SessionVault, type StoredSessionState } from "../src/browser/session-vault";

describe("SessionVault - Playwright Session State Persistence", () => {
  const testDir = join(__dirname, ".tmp-session-vault-test");
  const validStatePath = join(testDir, "sub-dir", "valid-state.json");
  const invalidStatePath = join(testDir, "invalid-state.json");

  const mockState: StoredSessionState = {
    cookies: [
      {
        name: "session_token",
        value: "abc123xyz",
        domain: ".example.com",
        path: "/",
        expires: 1750000000,
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
      },
    ],
    origins: [
      {
        origin: "https://example.com",
        localStorage: [{ name: "theme", value: "dark" }],
      },
    ],
  };

  before(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    mkdirSync(testDir, { recursive: true });
  });

  after(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("checks state existence correctly with hasState()", () => {
    assert.equal(SessionVault.hasState(validStatePath), false);
  });

  it("saves state to disk creating nested directories when needed", async () => {
    const mockContext = {
      storageState: async () => mockState,
    } as unknown as BrowserContext;

    const saved = await SessionVault.saveState(mockContext, validStatePath);
    assert.deepEqual(saved, mockState);
    assert.equal(SessionVault.hasState(validStatePath), true);
  });

  it("loads valid stored state correctly", () => {
    const loaded = SessionVault.loadState(validStatePath);
    assert.ok(loaded);
    assert.equal(loaded?.cookies.length, 1);
    assert.equal(loaded?.cookies[0].name, "session_token");
    assert.equal(loaded?.cookies[0].value, "abc123xyz");
    assert.equal(loaded?.origins.length, 1);
    assert.equal(loaded?.origins[0].localStorage[0].value, "dark");
  });

  it("returns undefined for non-existent state file", () => {
    const loaded = SessionVault.loadState(join(testDir, "non-existent.json"));
    assert.equal(loaded, undefined);
  });

  it("returns undefined for corrupted or invalid JSON files", () => {
    writeFileSync(invalidStatePath, "not a valid json string {", "utf8");
    const loadedCorrupted = SessionVault.loadState(invalidStatePath);
    assert.equal(loadedCorrupted, undefined);

    writeFileSync(invalidStatePath, JSON.stringify({ wrongKey: true }), "utf8");
    const loadedMalformed = SessionVault.loadState(invalidStatePath);
    assert.equal(loadedMalformed, undefined);
  });
});
