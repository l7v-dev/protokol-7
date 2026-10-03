/**
 * Control Router & HTTP Control Plane Tests — protokol-7
 *
 * Verifies job submission, retrieval, source registration, and lease reaping
 * through the HTTP REST API router.
 */

import assert from "node:assert/strict";
import * as http from "node:http";
import { after, before, describe, it } from "node:test";
import { createServer } from "../src/api/server.js";

describe("Control Plane HTTP REST API Suite", () => {
  let server: http.Server;
  let baseUrl: string;

  before(async () => {
    server = createServer();
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        if (typeof addr === "object" && addr) {
          baseUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("should create a job via POST /api/v1/control/jobs and retrieve it via GET", async () => {
    const postRes = await fetch(`${baseUrl}/api/v1/control/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operation: "download",
        idempotencyKey: `rest-job-${Date.now()}`,
        input: { url: "https://example.com/asset.pdf" },
        maxAttempts: 3,
      }),
    });

    assert.equal(postRes.status, 201);
    const postData = (await postRes.json()) as {
      success: boolean;
      job: { id: string; operation: string; status: string };
    };
    assert.equal(postData.success, true);
    assert.ok(postData.job.id);
    assert.equal(postData.job.operation, "download");
    assert.equal(postData.job.status, "pending");

    const getRes = await fetch(`${baseUrl}/api/v1/control/jobs/${postData.job.id}`);
    assert.equal(getRes.status, 200);
    const getData = (await getRes.json()) as {
      success: boolean;
      job: { id: string; status: string };
    };
    assert.equal(getData.success, true);
    assert.equal(getData.job.id, postData.job.id);
  });

  it("should reject job creation when required parameters are missing", async () => {
    const res = await fetch(`${baseUrl}/api/v1/control/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operation: "download",
        // missing idempotencyKey and input
      }),
    });

    assert.equal(res.status, 400);
    const data = (await res.json()) as { success: boolean; error: string; code: string };
    assert.equal(data.success, false);
    assert.equal(data.code, "MISSING_IDEMPOTENCY_KEY");
  });

  it("should return 404 for non-existent job ID", async () => {
    const res = await fetch(`${baseUrl}/api/v1/control/jobs/non-existent-uuid`);
    assert.equal(res.status, 404);
    const data = (await res.json()) as { success: boolean; code: string };
    assert.equal(data.success, false);
    assert.equal(data.code, "JOB_NOT_FOUND");
  });

  it("should create and fetch a source descriptor via /api/v1/control/sources", async () => {
    const postRes = await fetch(`${baseUrl}/api/v1/control/sources`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "test-academic-source",
        descriptor: {
          method: "rest",
          purpose: "Academic research corpus",
          budget: { max_requests: 1000, max_bytes: 1048576, max_seconds: 3600 },
        },
        enabled: true,
      }),
    });

    assert.equal(postRes.status, 201);
    const postData = (await postRes.json()) as {
      success: boolean;
      source: { id: string; name: string };
    };
    assert.equal(postData.success, true);
    assert.ok(postData.source.id);
    assert.equal(postData.source.name, "test-academic-source");

    const getRes = await fetch(`${baseUrl}/api/v1/control/sources/${postData.source.id}`);
    assert.equal(getRes.status, 200);
    const getData = (await getRes.json()) as {
      success: boolean;
      source: { id: string; name: string };
    };
    assert.equal(getData.success, true);
    assert.equal(getData.source.name, "test-academic-source");
  });

  it("should trigger lease reaping via POST /api/v1/control/leases/reap", async () => {
    const res = await fetch(`${baseUrl}/api/v1/control/leases/reap`, {
      method: "POST",
    });

    assert.equal(res.status, 200);
    const data = (await res.json()) as {
      success: boolean;
      reaped: { expiredJobs: number; expiredOutbox: number };
    };
    assert.equal(data.success, true);
    assert.equal(typeof data.reaped.expiredJobs, "number");
    assert.equal(typeof data.reaped.expiredOutbox, "number");
  });
});
