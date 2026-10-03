/**
 * Control Plane and Task Ledger HTTP Router — protokol-7
 *
 * Exposes control plane operations, job submission, status inspection,
 * and source onboarding over HTTP REST.
 * Conforms to RFC 03 (Workers, Transaction and Control Plane).
 */

import type http from "node:http";
import type { LedgerRepository } from "../../../contracts/index.js";
import { SqliteLedgerRepository } from "../../storage/ledger/sqlite-ledger-repository.js";

export interface CreateJobRequestBody {
  operation: string;
  idempotencyKey: string;
  input: Record<string, unknown>;
  maxAttempts?: number;
  documentId?: string;
}

export interface CreateSourceRequestBody {
  name: string;
  descriptor: Record<string, unknown>;
  enabled?: boolean;
}

function sendJson(res: http.ServerResponse, statusCode: number, data: unknown): void {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  });
  res.end(JSON.stringify(data));
}

function sendError(
  res: http.ServerResponse,
  statusCode: number,
  code: string,
  message: string,
  remedy: string
): void {
  sendJson(res, statusCode, {
    success: false,
    error: message,
    code,
    remedy,
    timestamp: new Date().toISOString(),
  });
}

export class ControlRouter {
  private readonly ledger: LedgerRepository;

  constructor(ledger?: LedgerRepository) {
    this.ledger =
      ledger ||
      new SqliteLedgerRepository({
        dbPath: process.env.LEDGER_DB_PATH || "data/catalogs/control_plane.sqlite",
      });
  }

  getLedger(): LedgerRepository {
    return this.ledger;
  }

  async handleCreateJob(res: http.ServerResponse, body: CreateJobRequestBody): Promise<void> {
    if (!body || typeof body !== "object") {
      sendError(
        res,
        400,
        "INVALID_BODY",
        "Request body must be a JSON object",
        "Provide a valid JSON payload"
      );
      return;
    }

    if (!body.operation || typeof body.operation !== "string") {
      sendError(
        res,
        400,
        "MISSING_OPERATION",
        "Missing required 'operation' string parameter",
        "Provide 'operation' in request body"
      );
      return;
    }

    if (!body.idempotencyKey || typeof body.idempotencyKey !== "string") {
      sendError(
        res,
        400,
        "MISSING_IDEMPOTENCY_KEY",
        "Missing required 'idempotencyKey' string parameter",
        "Provide 'idempotencyKey' in request body"
      );
      return;
    }

    if (!body.input || typeof body.input !== "object") {
      sendError(
        res,
        400,
        "INVALID_INPUT",
        "Field 'input' must be an object",
        "Provide 'input' parameter in request body"
      );
      return;
    }

    try {
      const job = await this.ledger.createJob({
        operation: body.operation,
        idempotencyKey: body.idempotencyKey,
        input: body.input,
        maxAttempts: body.maxAttempts,
        documentId: body.documentId,
      });

      sendJson(res, 201, {
        success: true,
        job,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      sendError(
        res,
        500,
        "JOB_CREATION_FAILED",
        `Failed to create job: ${msg}`,
        "Retry with valid parameters"
      );
    }
  }

  async handleGetJob(res: http.ServerResponse, jobId: string): Promise<void> {
    if (!jobId) {
      sendError(
        res,
        400,
        "MISSING_JOB_ID",
        "Job ID must be specified in the URL path",
        "Provide job ID"
      );
      return;
    }

    try {
      const job = await this.ledger.getJob(jobId);
      if (!job) {
        sendError(res, 404, "JOB_NOT_FOUND", `Job '${jobId}' was not found`, "Verify job ID");
        return;
      }

      sendJson(res, 200, {
        success: true,
        job,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      sendError(
        res,
        500,
        "JOB_FETCH_FAILED",
        `Failed to fetch job: ${msg}`,
        "Check ledger connectivity"
      );
    }
  }

  async handleCreateSource(res: http.ServerResponse, body: CreateSourceRequestBody): Promise<void> {
    if (!body || typeof body !== "object") {
      sendError(
        res,
        400,
        "INVALID_BODY",
        "Request body must be a JSON object",
        "Provide a valid JSON payload"
      );
      return;
    }

    if (!body.name || typeof body.name !== "string") {
      sendError(res, 400, "MISSING_NAME", "Missing required 'name' parameter", "Provide 'name'");
      return;
    }

    if (!body.descriptor || typeof body.descriptor !== "object") {
      sendError(
        res,
        400,
        "MISSING_DESCRIPTOR",
        "Field 'descriptor' must be an object",
        "Provide 'descriptor'"
      );
      return;
    }

    try {
      const source = await this.ledger.createSource({
        name: body.name,
        descriptor: body.descriptor,
        enabled: body.enabled ?? true,
      });

      sendJson(res, 201, {
        success: true,
        source,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      sendError(
        res,
        500,
        "SOURCE_CREATION_FAILED",
        `Failed to create source: ${msg}`,
        "Retry with valid descriptor"
      );
    }
  }

  async handleGetSource(res: http.ServerResponse, sourceId: string): Promise<void> {
    if (!sourceId) {
      sendError(
        res,
        400,
        "MISSING_SOURCE_ID",
        "Source ID must be specified in the URL path",
        "Provide source ID"
      );
      return;
    }

    try {
      const source = await this.ledger.getSource(sourceId);
      if (!source) {
        sendError(
          res,
          404,
          "SOURCE_NOT_FOUND",
          `Source '${sourceId}' was not found`,
          "Verify source ID"
        );
        return;
      }

      sendJson(res, 200, {
        success: true,
        source,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      sendError(
        res,
        500,
        "SOURCE_FETCH_FAILED",
        `Failed to fetch source: ${msg}`,
        "Check ledger connectivity"
      );
    }
  }

  async handleReapLeases(res: http.ServerResponse): Promise<void> {
    try {
      const result = await this.ledger.reapExpiredLeases();
      sendJson(res, 200, {
        success: true,
        reaped: result,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      sendError(
        res,
        500,
        "REAP_FAILED",
        `Failed to reap expired leases: ${msg}`,
        "Check ledger status"
      );
    }
  }
}
