import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { PipedreamExecutor } from "../src/pipeline/execution/pipedream-executor";
import { RemoteHttpExecutor } from "../src/pipeline/execution/remote-http-executor";
import { PipelineRunner } from "../src/pipeline/pipeline-runner";
import { isCronMatch, matchCronField, ScheduleBroker } from "../src/pipeline/schedule-broker";
import { PipelineError, parsePipelineYaml } from "../src/pipeline/schema";
import { GoogleDriveStorage } from "../src/pipeline/storage/google-drive-storage";

describe("Scheduler & Remote Execution (Phase 3)", () => {
  describe("Cron Matching Engine", () => {
    it("matches cron field wildcard, step, list, and range expressions", () => {
      assert.equal(matchCronField("*", 15, 0, 59), true);
      assert.equal(matchCronField("*/5", 25, 0, 59), true);
      assert.equal(matchCronField("*/5", 26, 0, 59), false);
      assert.equal(matchCronField("1,15,30", 15, 0, 59), true);
      assert.equal(matchCronField("1,15,30", 16, 0, 59), false);
      assert.equal(matchCronField("10-20", 15, 0, 59), true);
      assert.equal(matchCronField("10-20", 25, 0, 59), false);
      assert.equal(matchCronField("7", 7, 0, 59), true);
      assert.equal(matchCronField("7", 8, 0, 59), false);
    });

    it("evaluates 5-field cron matches against exact dates", () => {
      // 2026-09-26 14:30:00 (Saturday = 6, September = 9, Day = 26)
      const targetDate = new Date(2026, 8, 26, 14, 30, 0);

      assert.equal(isCronMatch("30 14 26 9 6", targetDate), true);
      assert.equal(isCronMatch("*/15 14 * * *", targetDate), true);
      assert.equal(isCronMatch("* * * * *", targetDate), true);
      assert.equal(isCronMatch("0 14 * * *", targetDate), false);
    });

    it("throws PipelineError on invalid cron expressions with wrong field counts", () => {
      assert.throws(
        () => isCronMatch("0 12 * *"),
        (err: unknown) => {
          assert.ok(err instanceof PipelineError);
          assert.equal(err.code, "INVALID_CRON_EXPRESSION");
          return true;
        }
      );
    });
  });

  describe("Schedule Broker", () => {
    it("manages scheduled job lifecycle and cancellation", () => {
      const broker = new ScheduleBroker();
      let executionCount = 0;

      const job = broker.scheduleJob(
        "test-cron-job",
        "* * * * *",
        () => {
          executionCount++;
        },
        50000
      );

      assert.equal(broker.hasJob("test-cron-job"), true);
      const active = broker.getActiveJobs();
      assert.equal(active.length, 1);
      assert.equal(active[0].id, "test-cron-job");
      assert.equal(active[0].cronExpression, "* * * * *");

      job.stop();
      assert.equal(broker.hasJob("test-cron-job"), false);
      assert.equal(broker.getActiveJobs().length, 0);
      assert.equal(executionCount, 0);
    });
  });

  describe("Remote HTTP Executor", () => {
    it("dispatches execution over HTTP with Bearer authentication and parses response", async () => {
      let capturedUrl = "";
      let capturedHeaders: Record<string, string> = {};
      let capturedBody = "";

      const mockFetch: typeof fetch = async (url, init) => {
        capturedUrl = String(url);
        capturedHeaders = (init?.headers as Record<string, string>) || {};
        capturedBody = String(init?.body || "");

        return new Response(
          JSON.stringify({
            runId: "remote-run-999",
            items: [{ id: "doc-1", title: "Remote item" }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      };

      const executor = new RemoteHttpExecutor({
        endpoint: "https://remote.protokol7.io",
        token: "secret-bearer-token",
        fetchFn: mockFetch,
      });

      const res = await executor.run("wikimedia", { title: "Artificial Intelligence" });

      assert.equal(res.success, true);
      assert.equal(res.itemCount, 1);
      assert.equal(capturedUrl, "https://remote.protokol7.io/api/v1/store/actors/wikimedia/run");
      assert.equal(capturedHeaders.Authorization, "Bearer secret-bearer-token");
      assert.ok(capturedBody.includes("Artificial Intelligence"));
    });

    it("handles remote HTTP 500 error gracefully without throwing", async () => {
      const mockFetch: typeof fetch = async () => {
        return new Response("Internal Server Error", { status: 500 });
      };

      const executor = new RemoteHttpExecutor({
        endpoint: "https://remote.protokol7.io",
        fetchFn: mockFetch,
      });

      const res = await executor.run("wikimedia", { title: "Error" });
      assert.equal(res.success, false);
      assert.match(res.error || "", /Remote execution returned HTTP 500/);
    });

    it("handles remote network failures gracefully", async () => {
      const mockFetch: typeof fetch = async () => {
        throw new Error("DNS resolution failed");
      };

      const executor = new RemoteHttpExecutor({
        endpoint: "https://invalid.endpoint",
        fetchFn: mockFetch,
      });

      const res = await executor.run("wikimedia", {});
      assert.equal(res.success, false);
      assert.match(res.error || "", /DNS resolution failed/);
    });
  });

  describe("Pipedream Executor", () => {
    it("dispatches task to Pipedream webhook with authentication", async () => {
      let capturedUrl = "";
      let capturedHeaders: Record<string, string> = {};

      const mockFetch: typeof fetch = async (url, init) => {
        capturedUrl = String(url);
        capturedHeaders = (init?.headers as Record<string, string>) || {};
        return new Response(JSON.stringify([{ success: true }]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      };

      const executor = new PipedreamExecutor({
        webhookUrl: "https://eo123.pipedream.net",
        token: "pd-auth-token",
        fetchFn: mockFetch,
      });

      const res = await executor.run("wikimedia", { title: "Pipedream" });
      assert.equal(res.success, true);
      assert.equal(capturedUrl, "https://eo123.pipedream.net");
      assert.equal(capturedHeaders.Authorization, "Bearer pd-auth-token");
    });
  });

  describe("Google Drive Storage Driver", () => {
    it("uploads artifact and formats drive:// URI with SHA-256 hash", async () => {
      let capturedRequestBody: Record<string, unknown> = {};

      const mockDriveClient = {
        files: {
          create: async (params: {
            requestBody: Record<string, unknown>;
            media: { mimeType: string; body: unknown };
          }) => {
            capturedRequestBody = params.requestBody;
            return {
              data: {
                id: "drive-file-id-abc-123",
                name: params.requestBody.name as string,
                md5Checksum: "mock-md5",
              },
            };
          },
        },
      };

      const storage = new GoogleDriveStorage({
        folderId: "folder_1BxiMV_test",
        driveClient: mockDriveClient as never,
      });

      const payload = Buffer.from("google drive article data", "utf8");
      const expectedHash = createHash("sha256").update(payload).digest("hex");

      const receipt = await storage.upload("dump.jsonl", payload);

      assert.equal(receipt.backend, "drive");
      assert.equal(receipt.bytesWritten, payload.length);
      assert.equal(receipt.checksumSha256, expectedHash);
      assert.equal(receipt.uri, "drive://folder_1BxiMV_test/dump.jsonl#drive-file-id-abc-123");
      assert.equal(capturedRequestBody.name, "dump.jsonl");
      assert.deepEqual(capturedRequestBody.parents, ["folder_1BxiMV_test"]);
    });
  });

  describe("PipelineRunner Orchestration with Phase 3 Targets", () => {
    it("executes pipeline with remote-http execution target and google drive storage", async () => {
      const mockFetch: typeof fetch = async () => {
        return new Response(
          JSON.stringify({
            items: [{ title: "Remote Article", content: "Extracted remotely" }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      };

      const remoteExecutor = new RemoteHttpExecutor({
        endpoint: "https://cloud.protokol7.io",
        fetchFn: mockFetch,
      });

      const mockDriveClient = {
        files: {
          create: async (params: { requestBody: { name: string } }) => ({
            data: { id: "gdrive-999", name: params.requestBody.name },
          }),
        },
      };

      const driveStorage = new GoogleDriveStorage({
        folderId: "gdrive-folder-target",
        driveClient: mockDriveClient as never,
      });

      const runner = new PipelineRunner({
        executor: remoteExecutor,
        storageBackends: { drive: driveStorage },
      });

      const yaml = `
name: remote-to-drive-pipeline
actor:
  id: wikimedia
  config:
    title: "Orchestration"
execution:
  target: remote-http
  endpoint: "https://cloud.protokol7.io"
output:
  format: jsonl
storage:
  backend: drive
  folder_id: "gdrive-folder-target"
`;

      const result = await runner.runYaml(yaml);

      assert.equal(result.status, "succeeded");
      assert.equal(result.pipelineName, "remote-to-drive-pipeline");
      assert.equal(result.itemCount, 1);
      assert.ok(result.receipt);
      assert.equal(result.receipt.backend, "drive");
      assert.ok(result.receipt.uri.startsWith("drive://gdrive-folder-target/"));
    });

    it("schedules pipeline execution and validates cron expression", () => {
      const runner = new PipelineRunner();

      const yaml = `
name: scheduled-daily-wiki
actor:
  id: wikimedia
  config:
    title: "Daily"
schedule:
  type: cron
  expression: "0 2 * * *"
`;

      const config = runner.getScheduleBroker();
      const parsedConfig = parsePipelineYaml(yaml);
      const scheduled = runner.scheduleConfig(parsedConfig, 50000);

      assert.equal(config.hasJob("scheduled-daily-wiki"), true);
      scheduled.stop();
      assert.equal(config.hasJob("scheduled-daily-wiki"), false);
    });
  });
});
