import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ActorResolver } from "../src/pipeline/actor-resolver";
import { PipelineError } from "../src/pipeline/schema";

describe("Actor Resolver", () => {
  const resolver = new ActorResolver();

  it("lists available actors from manifests", () => {
    const list = resolver.listAvailableActors();
    assert.ok(list.length >= 18);
    assert.ok(list.includes("wikimedia"));
    assert.ok(list.includes("cheerio-scraper"));
    assert.ok(list.includes("arxiv"));
  });

  it("confirms existence of registered actors with has()", () => {
    assert.equal(resolver.has("wikimedia"), true);
    assert.equal(resolver.has("cheerio-scraper"), true);
    assert.equal(resolver.has("non-existent-actor"), false);
  });

  it("successfully resolves valid actor configuration", () => {
    const resolved = resolver.resolve("cheerio-scraper", {
      targetUrl: "https://example.com",
    });
    assert.equal(resolved.actorId, "cheerio-scraper");
    assert.equal(resolved.actorType, "cheerio-scraper");
    assert.ok(resolved.manifest);
  });

  it("throws PipelineError when actor is not found", () => {
    assert.throws(
      () => resolver.resolve("invalid-fake-actor", {}),
      (err: unknown) => {
        assert.ok(err instanceof PipelineError);
        assert.equal(err.code, "ACTOR_NOT_FOUND");
        assert.match(err.message, /Actor not registered in catalog/);
        return true;
      }
    );
  });

  it("throws PipelineError when required configuration parameter is missing", () => {
    assert.throws(
      () => resolver.resolve("cheerio-scraper", {}),
      (err: unknown) => {
        assert.ok(err instanceof PipelineError);
        assert.equal(err.code, "MISSING_REQUIRED_CONFIG");
        assert.match(err.message, /targetUrl/);
        return true;
      }
    );
  });
});
