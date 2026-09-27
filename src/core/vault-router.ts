/**
 * src/core/vault-router.ts
 *
 * HTTP Controller for Cold Vault offline storage packaging and verification.
 * Routes: /api/v1/vault/*
 */

import type http from "node:http";
import { isAbsolute, normalize, resolve } from "node:path";
import { ColdVaultExporter } from "../vault/cold-vault-exporter";
import type { ColdVaultExportOptions } from "../vault/types";
import { getDefaultRegistryDatabase, type RegistryDatabase } from "./registry-database";

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
  remedy: string,
  retryable = false,
  details?: unknown
): void {
  sendJson(res, statusCode, {
    success: false,
    error: message,
    code,
    retryable,
    remedy,
    timestamp: new Date().toISOString(),
    ...(details !== undefined ? { details } : {}),
  });
}

const FORBIDDEN_ROOTS = ["/etc", "/sys", "/proc", "/boot", "/dev", "/root"];

export class VaultRouter {
  private readonly exporter: ColdVaultExporter;
  private readonly db: RegistryDatabase;

  constructor(exporter?: ColdVaultExporter, db?: RegistryDatabase) {
    this.db = db ?? getDefaultRegistryDatabase();
    this.exporter = exporter ?? new ColdVaultExporter(this.db);
  }

  getExporter(): ColdVaultExporter {
    return this.exporter;
  }

  /**
   * Validates path traversal and system directory restrictions.
   */
  private validateVolumePath(pathInput: string): {
    valid: boolean;
    resolvedPath: string;
    error?: string;
  } {
    if (!pathInput || typeof pathInput !== "string") {
      return { valid: false, resolvedPath: "", error: "volumeRoot must be a non-empty string." };
    }

    const trimmed = pathInput.trim();
    if (trimmed.includes("..")) {
      return {
        valid: false,
        resolvedPath: "",
        error: `Path traversal pattern '..' is forbidden in volume path: '${trimmed}'`,
      };
    }

    const rootDir = process.cwd();
    const resolvedPath = normalize(isAbsolute(trimmed) ? trimmed : resolve(rootDir, trimmed));

    for (const forbidden of FORBIDDEN_ROOTS) {
      if (resolvedPath === forbidden || resolvedPath.startsWith(`${forbidden}/`)) {
        return {
          valid: false,
          resolvedPath,
          error: `Access to system directory '${forbidden}' is forbidden.`,
        };
      }
    }

    return { valid: true, resolvedPath };
  }

  /**
   * POST /api/v1/vault/export
   * Exports dataset shards and manifest to cold vault volume.
   */
  async handleExport(res: http.ServerResponse, body: ColdVaultExportOptions): Promise<void> {
    if (!body?.datasetName || typeof body.datasetName !== "string") {
      sendError(
        res,
        400,
        "INVALID_EXPORT_PAYLOAD",
        "'datasetName' (string) is required to export to cold vault.",
        "Provide a valid datasetName registered in the dataset catalog."
      );
      return;
    }

    const pathCheck = this.validateVolumePath(body.volumeRoot);
    if (!pathCheck.valid) {
      sendError(
        res,
        403,
        "PATH_TRAVERSAL_DETECTED",
        pathCheck.error || "Forbidden volume path.",
        "Specify a valid relative path within workspace or an external mount root."
      );
      return;
    }

    try {
      const receipt = await this.exporter.exportDataset({
        ...body,
        volumeRoot: pathCheck.resolvedPath,
      });

      sendJson(res, 201, {
        success: true,
        receipt,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("not found")) {
        sendError(res, 404, "DATASET_NOT_FOUND", msg, "Check dataset name and snapshot status.");
      } else if (msg.includes("checksum mismatch")) {
        sendError(res, 500, "CHECKSUM_MISMATCH", msg, "Source shard was corrupted on disk.");
      } else {
        sendError(res, 500, "EXPORT_FAILED", msg, "Check filesystem permissions and volume path.");
      }
    }
  }

  /**
   * POST /api/v1/vault/verify
   * Cryptographically verifies volume files against checksums/SHA256SUMS.
   */
  async handleVerify(res: http.ServerResponse, body: { volumeRoot: string }): Promise<void> {
    const pathCheck = this.validateVolumePath(body?.volumeRoot);
    if (!pathCheck.valid) {
      sendError(
        res,
        403,
        "PATH_TRAVERSAL_DETECTED",
        pathCheck.error || "Forbidden volume path.",
        "Specify a valid volume directory."
      );
      return;
    }

    try {
      const result = await this.exporter.verifyVolume(pathCheck.resolvedPath);
      sendJson(res, 200, {
        success: true,
        verification: result,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      sendError(res, 500, "VERIFICATION_FAILED", msg, "Ensure volume directory is accessible.");
    }
  }

  /**
   * GET /api/v1/vault/inspect?volumeRoot=...
   * Inspects volume metadata from volume.json.
   */
  handleInspect(res: http.ServerResponse, volumeRoot: string): void {
    const pathCheck = this.validateVolumePath(volumeRoot);
    if (!pathCheck.valid) {
      sendError(
        res,
        403,
        "PATH_TRAVERSAL_DETECTED",
        pathCheck.error || "Forbidden volume path.",
        "Provide a valid volume root path."
      );
      return;
    }

    const volumeInfo = this.exporter.inspectVolume(pathCheck.resolvedPath);
    if (!volumeInfo) {
      sendError(
        res,
        404,
        "VOLUME_NOT_FOUND",
        `No volume metadata (volume.json) found at '${volumeRoot}'.`,
        "Initialize volume or export a dataset to this path first."
      );
      return;
    }

    sendJson(res, 200, {
      success: true,
      volume: volumeInfo,
    });
  }
}
