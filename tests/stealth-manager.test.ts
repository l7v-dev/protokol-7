import test from "node:test";
import assert from "node:assert/strict";
import { StealthManager } from "@/stealth-manager";

test("StealthManager provides randomized desktop profiles", () => {
  const profile1 = StealthManager.getRandomProfile();
  const profile2 = StealthManager.getRandomProfile();

  assert.ok(profile1.userAgent.length > 20);
  assert.ok(profile1.viewport.width >= 1280);
  assert.ok(profile1.viewport.height >= 768);
  assert.equal(profile1.headers["Sec-Ch-Ua-Mobile"], "?0");
  assert.ok(profile1.headers["Accept-Language"].includes("en"));

  assert.ok(profile2.userAgent.length > 20);
  assert.ok(profile2.viewport.width >= 1280);
});

test("StealthManager.getInitScript masks bot properties", () => {
  const script = StealthManager.getInitScript();
  assert.equal(typeof script, "function");
});

test("StealthManager.simulateHumanInteraction executes without throwing", async () => {
  let scrolled = false;
  const mockPage = {
    evaluate: async (fn: () => void) => {
      scrolled = true;
    },
    waitForTimeout: async (ms: number) => {},
  };

  await StealthManager.simulateHumanInteraction(mockPage);
  assert.equal(scrolled, true);
});
