import test from "node:test";
import assert from "node:assert/strict";
import { BrowserSessionManager } from "@/browser-session-manager";
import { BrowserPool } from "@/browser-pool";

test("BrowserSessionManager creates and manages browser sessions and tabs", async () => {
  const sessionId = "test-session-" + Date.now();

  try {
    // 1. Create or get session
    const session = await BrowserSessionManager.getOrCreateSession(sessionId);
    assert.ok(session);
    assert.equal(session.sessionId, sessionId);
    assert.ok(session.context);
    assert.equal(session.tabs.size, 1);

    const initialTabId = session.activeTabId;
    assert.ok(initialTabId);

    // 2. Create a second tab
    const secondTab = await BrowserSessionManager.createTab(sessionId, "about:blank");
    assert.ok(secondTab);
    assert.equal(session.tabs.size, 2);
    assert.equal(session.activeTabId, secondTab.tabId);

    // 3. List tabs
    const tabs = await BrowserSessionManager.listTabs(sessionId);
    assert.equal(tabs.length, 2);
    assert.equal(tabs[0].id, initialTabId);
    assert.equal(tabs[1].id, secondTab.tabId);

    // 4. Switch tab
    const switchedPage = await BrowserSessionManager.switchTab(sessionId, initialTabId);
    assert.ok(switchedPage);
    assert.equal(session.activeTabId, initialTabId);

    // 5. Close tab
    const closeRes = await BrowserSessionManager.closeTab(sessionId, secondTab.tabId);
    assert.ok(closeRes);
    assert.equal(session.tabs.size, 1);
    assert.equal(session.activeTabId, initialTabId);

    // 6. Inspect active page
    const activePage = await BrowserSessionManager.getActivePage(sessionId);
    assert.ok(activePage);
    assert.equal(activePage.isClosed(), false);
  } finally {
    // 7. Close session
    await BrowserSessionManager.closeSession(sessionId);
    const tabsAfterClose = await BrowserSessionManager.listTabs(sessionId);
    assert.equal(tabsAfterClose.length, 0);
    await BrowserPool.shutdown();
  }
});
