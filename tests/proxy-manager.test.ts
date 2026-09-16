import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ProxyManager } from "../src/network/proxy-manager";

describe("ProxyManager - Proxy Pool & Rotation Engine", () => {
  it("adds proxies from URL strings and config objects", () => {
    const manager = new ProxyManager();
    manager.addProxy("http://user1:pass1@proxy1.example.com:8080");
    manager.addProxy({
      server: "http://proxy2.example.com:3128",
      username: "user2",
      password: "pass2",
    });

    assert.equal(manager.size(), 2);
    const healthy = manager.getHealthyProxies();
    assert.equal(healthy.length, 2);
    assert.equal(healthy[0].server, "http://proxy1.example.com:8080");
    assert.equal(healthy[0].username, "user1");
  });

  it("rotates proxies using round-robin strategy", () => {
    const manager = new ProxyManager();
    manager.addProxy("http://proxy1.example.com:8080");
    manager.addProxy("http://proxy2.example.com:8080");

    const p1 = manager.getProxy({ strategy: "round-robin" });
    const p2 = manager.getProxy({ strategy: "round-robin" });
    const p3 = manager.getProxy({ strategy: "round-robin" });

    assert.equal(p1?.server, "http://proxy1.example.com:8080");
    assert.equal(p2?.server, "http://proxy2.example.com:8080");
    assert.equal(p3?.server, "http://proxy1.example.com:8080");
  });

  it("enforces domain-sticky proxy affinity", () => {
    const manager = new ProxyManager();
    manager.addProxy("http://proxy1.example.com:8080");
    manager.addProxy("http://proxy2.example.com:8080");

    const p1 = manager.getProxy({ domain: "target.com", strategy: "sticky-domain" });
    const p2 = manager.getProxy({ domain: "target.com", strategy: "sticky-domain" });
    const p3 = manager.getProxy({ domain: "other.com", strategy: "sticky-domain" });

    assert.ok(p1);
    assert.equal(p1?.server, p2?.server);
    assert.ok(p3);
  });

  it("quarantines failing proxies after threshold exceeded", () => {
    const manager = new ProxyManager({ maxConsecutiveFailures: 2, quarantineDurationMs: 10000 });
    const p1 = manager.addProxy("http://proxy1.example.com:8080");
    const p2 = manager.addProxy("http://proxy2.example.com:8080");

    manager.recordFailure(p1);
    assert.equal(manager.getHealthyProxies().length, 2);

    manager.recordFailure(p1);
    // p1 quarantined
    const healthy = manager.getHealthyProxies();
    assert.equal(healthy.length, 1);
    assert.equal(healthy[0].server, p2.server);

    // Recording success on p1 restores it
    manager.recordSuccess(p1);
    assert.equal(manager.getHealthyProxies().length, 2);
  });
});
