/**
 * Test Suite: Scheduled Jobs REST API, Cron Engine, and MCP Tool Endpoints.
 */

import assert from "node:assert/strict";
import http from "node:http";
import { after, before, describe, it } from "node:test";
import { RegistryDatabase } from "../src/api/registry-database";
import { JobRouter } from "../src/api/routers/job-router";
import { createServer } from "../src/api/server";
import { ProtokolMcpServer } from "../src/mcp/protokol-mcp-server";
import { ScheduleBroker } from "../src/pipeline/schedule-broker";

describe("Scheduled Jobs REST API & MCP Integration", () => {
  let server: http.Server;
  let baseUrl: string;
  let mcpServer: ProtokolMcpServer;
  const createdJobIds: string[] = [];

  before(async () => {
    server = createServer();
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const addr = server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${addr.port}`;
    mcpServer = new ProtokolMcpServer();
  });

  after(async () => {
    // Clean up created jobs
    for (const jobId of createdJobIds) {
      try {
        await fetch(`${baseUrl}/api/v1/jobs/${encodeURIComponent(jobId)}`, {
          method: "DELETE",
        });
      } catch {
        // ignore cleanup errors
      }
    }
    mcpServer.close();

    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it("POST /api/v1/jobs/schedule rejects missing or invalid cronExpression with 400", async () => {
    const res1 = await fetch(`${baseUrl}/api/v1/jobs/schedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(res1.status, 400);
    const data1 = (await res1.json()) as { success: boolean; code: string };
    assert.equal(data1.success, false);
    assert.equal(data1.code, "INVALID_CRON_EXPRESSION");

    const res2 = await fetch(`${baseUrl}/api/v1/jobs/schedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cronExpression: "0 0 *" }),
    });
    assert.equal(res2.status, 400);
    const data2 = (await res2.json()) as { success: boolean; code: string };
    assert.equal(data2.success, false);
    assert.equal(data2.code, "INVALID_CRON_EXPRESSION");
  });

  it("POST /api/v1/jobs/schedule rejects payload without pipeline or actor with 400", async () => {
    const res = await fetch(`${baseUrl}/api/v1/jobs/schedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cronExpression: "*/5 * * * *" }),
    });
    assert.equal(res.status, 400);
    const data = (await res.json()) as { success: boolean; code: string };
    assert.equal(data.success, false);
    assert.equal(data.code, "INVALID_JOB_PAYLOAD");
  });

  it("POST /api/v1/jobs/schedule blocks path traversal with 403", async () => {
    const res = await fetch(`${baseUrl}/api/v1/jobs/schedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cronExpression: "0 12 * * *",
        pipeline: { filePath: "../../etc/passwd" },
      }),
    });
    assert.equal(res.status, 403);
    const data = (await res.json()) as { success: boolean; code: string };
    assert.equal(data.success, false);
    assert.equal(data.code, "PATH_TRAVERSAL_DETECTED");
  });

  it("POST /api/v1/jobs/schedule returns 404 for non-existent pipeline filePath", async () => {
    const res = await fetch(`${baseUrl}/api/v1/jobs/schedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cronExpression: "0 12 * * *",
        pipeline: { filePath: "examples/pipelines/not-exist.yaml" },
      }),
    });
    assert.equal(res.status, 404);
    const data = (await res.json()) as { success: boolean; code: string };
    assert.equal(data.success, false);
    assert.equal(data.code, "PIPELINE_FILE_NOT_FOUND");
  });

  it("POST /api/v1/jobs/schedule rejects unregistered actor with 400", async () => {
    const res = await fetch(`${baseUrl}/api/v1/jobs/schedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cronExpression: "0 12 * * *",
        actor: { actorName: "non_existent_actor" },
      }),
    });
    assert.equal(res.status, 400);
    const data = (await res.json()) as { success: boolean; code: string };
    assert.equal(data.success, false);
    assert.equal(data.code, "UNKNOWN_ACTOR");
  });

  it("POST /api/v1/jobs/schedule schedules a pipeline job successfully", async () => {
    const yaml = `
name: scheduled-api-corpus
version: 1
actor:
  id: cheerio-scraper
  config:
    targetUrl: "https://example.com"
output:
  format: jsonl
storage:
  backend: local
`;
    const res = await fetch(`${baseUrl}/api/v1/jobs/schedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobId: "job_test_pipeline_schedule",
        cronExpression: "*/15 * * * *",
        description: "Quarter-hourly corpus collection",
        pipeline: { yaml },
      }),
    });

    assert.equal(res.status, 201);
    const data = (await res.json()) as {
      success: boolean;
      jobId: string;
      cronExpression: string;
      running: boolean;
      targetType: string;
    };
    assert.equal(data.success, true);
    assert.equal(data.jobId, "job_test_pipeline_schedule");
    assert.equal(data.cronExpression, "*/15 * * * *");
    assert.equal(data.running, true);
    assert.equal(data.targetType, "pipeline");
    createdJobIds.push(data.jobId);
  });

  it("POST /api/v1/jobs/schedule schedules an actor job successfully", async () => {
    const res = await fetch(`${baseUrl}/api/v1/jobs/schedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobId: "job_test_actor_schedule",
        cronExpression: "0 4 * * 1",
        description: "Weekly arXiv digest",
        actor: {
          actorName: "arxiv",
          input: { query: "cat:cs.AI", maxResults: 10 },
        },
      }),
    });

    assert.equal(res.status, 201);
    const data = (await res.json()) as {
      success: boolean;
      jobId: string;
      targetType: string;
    };
    assert.equal(data.success, true);
    assert.equal(data.jobId, "job_test_actor_schedule");
    assert.equal(data.targetType, "actor");
    createdJobIds.push(data.jobId);
  });

  it("GET /api/v1/jobs lists all scheduled jobs", async () => {
    const res = await fetch(`${baseUrl}/api/v1/jobs`);
    assert.equal(res.status, 200);
    const data = (await res.json()) as {
      success: boolean;
      count: number;
      jobs: Array<{ id: string; cronExpression: string; running: boolean }>;
    };
    assert.equal(data.success, true);
    assert.ok(data.count >= 2);
    const ids = data.jobs.map((j) => j.id);
    assert.ok(ids.includes("job_test_pipeline_schedule"));
    assert.ok(ids.includes("job_test_actor_schedule"));
  });

  it("GET /api/v1/jobs/:id returns single scheduled job details", async () => {
    const res = await fetch(`${baseUrl}/api/v1/jobs/job_test_pipeline_schedule`);
    assert.equal(res.status, 200);
    const data = (await res.json()) as {
      success: boolean;
      job: { id: string; cronExpression: string; running: boolean; description?: string };
    };
    assert.equal(data.success, true);
    assert.equal(data.job.id, "job_test_pipeline_schedule");
    assert.equal(data.job.cronExpression, "*/15 * * * *");
    assert.equal(data.job.running, true);
    assert.equal(data.job.description, "Quarter-hourly corpus collection");
  });

  it("GET /api/v1/jobs/:id returns 404 for unknown job ID", async () => {
    const res = await fetch(`${baseUrl}/api/v1/jobs/non_existent_job_xyz`);
    assert.equal(res.status, 404);
    const data = (await res.json()) as { success: boolean; code: string };
    assert.equal(data.success, false);
    assert.equal(data.code, "JOB_NOT_FOUND");
  });

  it("DELETE /api/v1/jobs/:id cancels and stops scheduled job", async () => {
    const res = await fetch(`${baseUrl}/api/v1/jobs/job_test_pipeline_schedule`, {
      method: "DELETE",
    });
    assert.equal(res.status, 200);
    const data = (await res.json()) as { success: boolean; jobId: string; stopped: boolean };
    assert.equal(data.success, true);
    assert.equal(data.jobId, "job_test_pipeline_schedule");
    assert.equal(data.stopped, true);

    // Verify status is stopped
    const verifyRes = await fetch(`${baseUrl}/api/v1/jobs/job_test_pipeline_schedule`);
    assert.equal(verifyRes.status, 200);
    const verifyData = (await verifyRes.json()) as { job: { running: boolean } };
    assert.equal(verifyData.job.running, false);
  });

  it("POST /api/v1/jobs/:id/stop stops scheduled job via POST alias", async () => {
    const res = await fetch(`${baseUrl}/api/v1/jobs/job_test_actor_schedule/stop`, {
      method: "POST",
    });
    assert.equal(res.status, 200);
    const data = (await res.json()) as { success: boolean; jobId: string; stopped: boolean };
    assert.equal(data.success, true);
    assert.equal(data.jobId, "job_test_actor_schedule");
    assert.equal(data.stopped, true);
  });

  it("DELETE /api/v1/jobs/:id returns 404 for non-existent job", async () => {
    const res = await fetch(`${baseUrl}/api/v1/jobs/definitely_not_a_job`, {
      method: "DELETE",
    });
    assert.equal(res.status, 404);
    const data = (await res.json()) as { success: boolean; code: string };
    assert.equal(data.success, false);
    assert.equal(data.code, "JOB_NOT_FOUND");
  });

  it("MCP tool 'schedule_job' validates and registers cron job", async () => {
    const res = await mcpServer.processRequest({
      jsonrpc: "2.0",
      id: "mcp-schedule-1",
      method: "tools/call",
      params: {
        name: "schedule_job",
        arguments: {
          jobId: "mcp_job_corpus_sync",
          cronExpression: "0 0 * * *",
          description: "Nightly MCP sync",
          actor: {
            actorName: "cheerio-scraper",
            input: { targetUrl: "https://example.com" },
          },
        },
      },
    });

    assert.ok(res);
    assert.equal(res.id, "mcp-schedule-1");
    const result = res.result as {
      content: Array<{ type: string; text: string }>;
      isError?: boolean;
    };
    assert.equal(result.isError, undefined);
    const parsed = JSON.parse(result.content[0].text) as {
      success: boolean;
      jobId: string;
      running: boolean;
    };
    assert.equal(parsed.success, true);
    assert.equal(parsed.jobId, "mcp_job_corpus_sync");
    assert.equal(parsed.running, true);
  });

  it("MCP tool 'list_jobs' returns active scheduled jobs", async () => {
    const res = await mcpServer.processRequest({
      jsonrpc: "2.0",
      id: "mcp-list-jobs",
      method: "tools/call",
      params: {
        name: "list_jobs",
        arguments: {},
      },
    });

    assert.ok(res);
    const result = res.result as {
      content: Array<{ type: string; text: string }>;
    };
    const parsed = JSON.parse(result.content[0].text) as {
      count: number;
      jobs: Array<{ id: string }>;
    };
    assert.ok(parsed.count >= 1);
    assert.ok(parsed.jobs.some((j) => j.id === "mcp_job_corpus_sync"));
  });

  it("MCP tool 'cancel_job' stops active job", async () => {
    const res = await mcpServer.processRequest({
      jsonrpc: "2.0",
      id: "mcp-cancel-job",
      method: "tools/call",
      params: {
        name: "cancel_job",
        arguments: {
          jobId: "mcp_job_corpus_sync",
        },
      },
    });

    assert.ok(res);
    const result = res.result as {
      content: Array<{ type: string; text: string }>;
      isError?: boolean;
    };
    assert.equal(result.isError, undefined);
    const parsed = JSON.parse(result.content[0].text) as {
      success: boolean;
      stopped: boolean;
    };
    assert.equal(parsed.success, true);
    assert.equal(parsed.stopped, true);
  });

  it("restores active jobs with actor config on JobRouter restart", async () => {
    const db = new RegistryDatabase({ inMemory: true });
    const broker1 = new ScheduleBroker({ db });
    const router1 = new JobRouter(broker1, undefined, db);
    assert.ok(router1);

    broker1.scheduleJob("restart_test_job", "0 5 * * *", async () => {}, 60000, {
      actorConfig: {
        actorName: "cheerio-scraper",
        input: { targetUrl: "https://example.com/test" },
      },
    });

    assert.equal(broker1.hasJob("restart_test_job"), true);
    const persisted = db.listScheduledJobs().find((j) => j.id === "restart_test_job");
    assert.ok(persisted);
    assert.equal(persisted?.running, true);
    assert.equal(persisted?.actorConfig?.actorName, "cheerio-scraper");

    // Simulate process shutdown
    broker1.stopJob("restart_test_job"); // stops timer
    // re-enable running in db to test server restart recovery
    db.setScheduledJobRunning("restart_test_job", true);

    // Simulate service restart with fresh broker and router
    const broker2 = new ScheduleBroker({ db });
    const router2 = new JobRouter(broker2, undefined, db);
    assert.ok(router2);

    assert.equal(broker2.hasJob("restart_test_job"), true);
    const restoredJob = broker2.getActiveJobs().find((j) => j.id === "restart_test_job");
    assert.ok(restoredJob);
    assert.equal(restoredJob?.cronExpression, "0 5 * * *");
    assert.equal(restoredJob?.running, true);
    assert.equal(restoredJob?.actorConfig?.actorName, "cheerio-scraper");

    broker2.stopAll();
    db.close();
  });
});
