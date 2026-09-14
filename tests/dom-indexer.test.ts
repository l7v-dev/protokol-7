import assert from "node:assert/strict";
import test from "node:test";
import { BrowserPool } from "@/browser-pool";
import { BrowserSessionManager } from "@/browser-session-manager";
import { DOMIndexer } from "@/dom-indexer";

test("DOMIndexer indexes interactable elements and generates semantic manifest", async () => {
  const sessionId = `dom-indexer-test-${Date.now()}`;

  try {
    const page = await BrowserSessionManager.getActivePage(sessionId);

    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <head><title>SoM Test Page</title></head>
        <body>
          <header>
            <nav>
              <a href="/home" id="nav-home">Home Link</a>
              <a href="/about">About Us</a>
            </nav>
          </header>
          <main>
            <h1>Test Form Header</h1>
            <form action="/submit" method="POST">
              <label for="username">Username</label>
              <input type="text" id="username" name="user_name" placeholder="Enter username" />
              
              <label for="pwd">Password</label>
              <input type="password" id="pwd" name="user_pass" />

              <button type="submit" id="btn-submit">Submit Form</button>
            </form>
            <div role="button" aria-label="Custom Action">Click Me</div>
            <div style="display: none;"><button>Hidden Button</button></div>
          </main>
        </body>
      </html>
    `);

    // 1. Index elements
    const indexResult = await DOMIndexer.indexPage(page);
    assert.ok(indexResult);
    assert.equal(indexResult.totalCount, 6); // 2 links, 2 inputs, 1 submit button, 1 role="button"
    assert.equal(indexResult.elements.length, 6);

    // Verify elements are properly indexed
    const linkEl = indexResult.elements.find((e) => e.id === "nav-home");
    assert.ok(linkEl);
    assert.equal(linkEl.tag, "a");
    assert.equal(linkEl.text, "Home Link");
    assert.equal(linkEl.href, "/home");

    const inputEl = indexResult.elements.find((e) => e.id === "username");
    assert.ok(inputEl);
    assert.equal(inputEl.tag, "input");
    assert.equal(inputEl.placeholder, "Enter username");

    // Verify manifest
    assert.ok(indexResult.manifest.includes("Found 6 interactable elements:"));
    assert.ok(indexResult.manifest.includes('[1] <a id="nav-home" href="/home"> Home Link'));
    assert.ok(indexResult.manifest.includes('placeholder="Enter username"'));

    // 2. Inject Badges
    await DOMIndexer.injectBadges(page, indexResult.elements);
    const containerExists = await page.evaluate(() => {
      const el = document.getElementById("agent-smith-som-container");
      return !!el && el.children.length === 6;
    });
    assert.equal(containerExists, true);

    // 3. Remove Badges
    await DOMIndexer.removeBadges(page);
    const containerRemoved = await page.evaluate(() => {
      return !document.getElementById("agent-smith-som-container");
    });
    assert.equal(containerRemoved, true);
  } finally {
    await BrowserSessionManager.closeSession(sessionId);
    await BrowserPool.shutdown();
  }
});
