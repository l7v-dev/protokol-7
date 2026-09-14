import assert from "node:assert/strict";
import * as http from "node:http";
import test from "node:test";
import { BrowserPool } from "@/browser-pool";
import { InteractiveBrowserController } from "@/interactive-browser-controller";

(process.env as Record<string, string | undefined>).NODE_ENV = "test";

test("InteractiveBrowserController executes actions against live server", async () => {
  // 1. Create mock HTTP server
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`
      <!DOCTYPE html>
      <html>
        <head><title>Interactive Controller Test</title></head>
        <body style="min-height: 2000px;">
          <h1 id="heading">Interactive Controller</h1>
          <input id="test-input" type="text" placeholder="Type here" />
          <button id="test-button" onclick="document.getElementById('status').textContent = 'Clicked!'">Click Target</button>
          <select id="test-select">
            <option value="opt1">Option 1</option>
            <option value="opt2">Option 2</option>
          </select>
          <div id="status">Idle</div>
          <div style="margin-top: 1000px;" id="bottom-marker">Bottom Marker</div>
        </body>
      </html>
    `);
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  const testUrl = `http://127.0.0.1:${address.port}`;

  const sessionId = `controller-test-${Date.now()}`;

  try {
    // 2. Navigate
    const navResult = await InteractiveBrowserController.navigate(sessionId, testUrl, {
      captureScreenshot: true,
    });
    assert.equal(navResult.success, true);
    assert.equal(navResult.action, "navigate");
    assert.equal(navResult.title, "Interactive Controller Test");
    assert.ok(navResult.elementCount >= 3);
    assert.ok(navResult.screenshotBase64);
    assert.ok(navResult.elementManifest);

    // 3. Type into input
    const typeResult = await InteractiveBrowserController.type(
      sessionId,
      { selector: "#test-input" },
      "Hello World",
      { captureScreenshot: false }
    );
    assert.equal(typeResult.success, true);

    // 4. Click button
    const clickResult = await InteractiveBrowserController.click(
      sessionId,
      { selector: "#test-button" },
      { captureScreenshot: false }
    );
    assert.equal(clickResult.success, true);

    // Verify status updated in DOM
    const evalResult = await InteractiveBrowserController.evaluate(
      sessionId,
      "document.getElementById('status').textContent"
    );
    assert.equal(evalResult.extractedContent, "Clicked!");

    // 5. Select dropdown option
    const selectResult = await InteractiveBrowserController.selectOption(
      sessionId,
      { selector: "#test-select" },
      "opt2",
      { captureScreenshot: false }
    );
    assert.equal(selectResult.success, true);

    // 6. Scroll down and up
    const scrollDownResult = await InteractiveBrowserController.scroll(sessionId, "down", 300, {
      captureScreenshot: false,
    });
    assert.equal(scrollDownResult.success, true);

    const scrollUpResult = await InteractiveBrowserController.scroll(sessionId, "up", 300, {
      captureScreenshot: false,
    });
    assert.equal(scrollUpResult.success, true);

    // 7. Extract content
    const extractResult = await InteractiveBrowserController.extractContent(sessionId, "#heading");
    assert.equal(extractResult.success, true);
    assert.ok(extractResult.extractedContent?.includes("Interactive Controller"));

    // 8. Capture screenshot with SoM badges
    const screenshotResult = await InteractiveBrowserController.screenshot(sessionId, true);
    assert.equal(screenshotResult.success, true);
    assert.ok(screenshotResult.screenshotBase64);

    // 9. Tab management through controller
    const tabResult = await InteractiveBrowserController.createTab(sessionId, "about:blank");
    assert.equal(tabResult.success, true);
    assert.equal(tabResult.tabs.length, 2);

    const switchResult = await InteractiveBrowserController.switchTab(
      sessionId,
      tabResult.tabs[0].id
    );
    assert.equal(switchResult.success, true);
    assert.equal(switchResult.activeTabId, tabResult.tabs[0].id);
  } finally {
    await InteractiveBrowserController.closeSession(sessionId);
    await BrowserPool.shutdown();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
