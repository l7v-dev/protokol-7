/**
 * Dataset Router and Controller for Protokol-7.
 * Manages dataset snapshot publishing, training manifest generation,
 * shard catalog lookups, and versioned dataset lineage.
 */

import type http from "node:http";
import { DatasetPublisher } from "../dataset/dataset-publisher";
import type { PublishDatasetOptions } from "../dataset/types";
import { getDefaultRegistryDatabase, type RegistryDatabase } from "./registry-database";

function sendJson(res: http.ServerResponse, statusCode: number, data: unknown): void {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
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

export class DatasetRouter {
  private readonly publisher: DatasetPublisher;
  private readonly registryDb: RegistryDatabase;

  constructor(publisher?: DatasetPublisher, registryDb?: RegistryDatabase) {
    this.registryDb = registryDb ?? getDefaultRegistryDatabase();
    this.publisher = publisher || new DatasetPublisher({ registryDb: this.registryDb });
  }

  getPublisher(): DatasetPublisher {
    return this.publisher;
  }

  /**
   * POST /api/v1/datasets/publish
   * Publishes a versioned dataset snapshot and generates verified training manifest.json.
   */
  async handlePublishDataset(res: http.ServerResponse, body: PublishDatasetOptions): Promise<void> {
    if (!body?.datasetName || typeof body.datasetName !== "string") {
      sendError(
        res,
        400,
        "INVALID_DATASET_PAYLOAD",
        "Payload must contain a valid 'datasetName' string.",
        "Provide a JSON object with at least { datasetName: 'my_dataset' }."
      );
      return;
    }

    try {
      const result = await this.publisher.publishSnapshot(body);
      sendJson(res, 201, {
        success: true,
        snapshotId: result.snapshotId,
        datasetName: result.datasetName,
        version: result.version,
        manifestUri: result.manifestUri,
        statistics: result.manifest.statistics,
        splits: result.splits,
        remoteReceipt: result.remoteReceipt,
        createdAt: result.manifest.createdAt,
      });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      if (errorMsg.includes("Path traversal")) {
        sendError(
          res,
          403,
          "PATH_TRAVERSAL_DETECTED",
          errorMsg,
          "Specify an output directory within project boundaries."
        );
        return;
      }
      sendError(
        res,
        500,
        "DATASET_PUBLISH_FAILED",
        errorMsg,
        "Verify that shards exist or that provided file paths and credentials are valid."
      );
    }
  }

  /**
   * GET /api/v1/datasets
   * Lists all datasets in the catalog with shard count and latest snapshot summary.
   */
  handleListDatasets(res: http.ServerResponse): void {
    try {
      const datasets = this.registryDb.listDatasets();
      const enriched = datasets.map((ds) => {
        const shards = this.registryDb.listDatasetShards(ds.name, 1000);
        const latestSnapshot = this.registryDb.getLatestDatasetSnapshot(ds.name);
        return {
          ...ds,
          shardCount: shards.length,
          totalSizeBytes: shards.reduce((sum, s) => sum + s.sizeBytes, 0),
          totalRecordCount: shards.reduce((sum, s) => sum + s.recordCount, 0),
          latestSnapshot: latestSnapshot
            ? {
                snapshotId: latestSnapshot.snapshotId,
                version: latestSnapshot.version,
                totalRecords: latestSnapshot.totalRecordCount,
                totalBytes: latestSnapshot.totalSizeBytes,
                manifestUri: latestSnapshot.manifestUri,
                createdAt: latestSnapshot.createdAt,
              }
            : null,
        };
      });

      sendJson(res, 200, {
        success: true,
        count: enriched.length,
        datasets: enriched,
      });
    } catch (err: unknown) {
      sendError(
        res,
        500,
        "DATASETS_QUERY_FAILED",
        err instanceof Error ? err.message : String(err),
        "Ensure database connection is healthy."
      );
    }
  }

  /**
   * GET /api/v1/datasets/:name
   * Retrieves dataset catalog information, its registered shards, and available snapshots.
   */
  handleGetDataset(res: http.ServerResponse, datasetName: string): void {
    try {
      const name = decodeURIComponent(datasetName).trim().toLowerCase();
      const dataset = this.registryDb.getDataset(`ds_${name}`);
      const shards = this.registryDb.listDatasetShards(name, 1000);
      const snapshots = this.registryDb.listDatasetSnapshots(name, 50);

      if (!dataset && shards.length === 0 && snapshots.length === 0) {
        sendError(
          res,
          404,
          "DATASET_NOT_FOUND",
          `Dataset '${name}' was not found in catalog.`,
          "Ensure datasetName is correctly spelled or publish a new snapshot."
        );
        return;
      }

      sendJson(res, 200, {
        success: true,
        dataset: dataset || {
          datasetId: `ds_${name}`,
          name,
          sourcePlatform: "corpus_pipeline",
          licenseGroup: "permissive_commercial",
          defaultLanguage: "und",
          createdAt: snapshots[0]?.createdAt || new Date().toISOString(),
        },
        shards: {
          count: shards.length,
          totalSizeBytes: shards.reduce((sum, s) => sum + s.sizeBytes, 0),
          totalRecordCount: shards.reduce((sum, s) => sum + s.recordCount, 0),
          items: shards,
        },
        snapshots: {
          count: snapshots.length,
          items: snapshots.map((s) => ({
            snapshotId: s.snapshotId,
            version: s.version,
            shardCount: s.shardCount,
            totalRecordCount: s.totalRecordCount,
            totalSizeBytes: s.totalSizeBytes,
            totalTokensEstimated: s.totalTokensEstimated,
            manifestUri: s.manifestUri,
            createdAt: s.createdAt,
          })),
        },
      });
    } catch (err: unknown) {
      sendError(
        res,
        500,
        "DATASET_QUERY_FAILED",
        err instanceof Error ? err.message : String(err),
        "Verify database accessibility."
      );
    }
  }

  /**
   * GET /api/v1/datasets/:name/snapshots
   * Lists snapshots for a dataset.
   */
  handleListSnapshots(res: http.ServerResponse, datasetName: string): void {
    try {
      const name = decodeURIComponent(datasetName).trim().toLowerCase();
      const snapshots = this.registryDb.listDatasetSnapshots(name, 100);

      sendJson(res, 200, {
        success: true,
        datasetName: name,
        count: snapshots.length,
        snapshots: snapshots.map((s) => ({
          snapshotId: s.snapshotId,
          version: s.version,
          shardCount: s.shardCount,
          totalRecordCount: s.totalRecordCount,
          totalSizeBytes: s.totalSizeBytes,
          totalTokensEstimated: s.totalTokensEstimated,
          manifestUri: s.manifestUri,
          createdAt: s.createdAt,
        })),
      });
    } catch (err: unknown) {
      sendError(
        res,
        500,
        "SNAPSHOTS_QUERY_FAILED",
        err instanceof Error ? err.message : String(err),
        "Verify database integrity."
      );
    }
  }

  /**
   * GET /api/v1/datasets/:name/snapshots/:snapshotId
   * Retrieves single snapshot details and parsed manifest.
   */
  handleGetSnapshot(res: http.ServerResponse, _datasetName: string, snapshotId: string): void {
    try {
      const id = decodeURIComponent(snapshotId).trim();
      const snapshot = this.registryDb.getDatasetSnapshot(id);

      if (!snapshot) {
        sendError(
          res,
          404,
          "SNAPSHOT_NOT_FOUND",
          `Dataset snapshot with ID '${id}' was not found.`,
          "Check the snapshotId from /api/v1/datasets/:name/snapshots."
        );
        return;
      }

      let parsedManifest = null;
      try {
        parsedManifest = JSON.parse(snapshot.manifestJson);
      } catch {
        // Fallback to raw json if parse fails
      }

      sendJson(res, 200, {
        success: true,
        snapshot: {
          snapshotId: snapshot.snapshotId,
          datasetName: snapshot.datasetName,
          version: snapshot.version,
          splits: JSON.parse(snapshot.splitsJson || "{}"),
          shardCount: snapshot.shardCount,
          totalRecordCount: snapshot.totalRecordCount,
          totalSizeBytes: snapshot.totalSizeBytes,
          totalTokensEstimated: snapshot.totalTokensEstimated,
          manifestUri: snapshot.manifestUri,
          createdAt: snapshot.createdAt,
        },
        manifest: parsedManifest,
      });
    } catch (err: unknown) {
      sendError(
        res,
        500,
        "SNAPSHOT_RETRIEVAL_FAILED",
        err instanceof Error ? err.message : String(err),
        "Verify database connectivity."
      );
    }
  }

  /**
   * GET /api/v1/datasets/:name/manifest
   * Retrieves the raw Training Dataset Manifest for the latest snapshot of the dataset.
   */
  handleGetLatestManifest(res: http.ServerResponse, datasetName: string): void {
    try {
      const name = decodeURIComponent(datasetName).trim().toLowerCase();
      const latestSnapshot = this.registryDb.getLatestDatasetSnapshot(name);

      if (!latestSnapshot) {
        sendError(
          res,
          404,
          "MANIFEST_NOT_FOUND",
          `No snapshot or manifest found for dataset '${name}'.`,
          "Publish a dataset snapshot first via POST /api/v1/datasets/publish."
        );
        return;
      }

      let parsedManifest = null;
      try {
        parsedManifest = JSON.parse(latestSnapshot.manifestJson);
      } catch {
        sendError(
          res,
          500,
          "MANIFEST_CORRUPT",
          "Manifest JSON in storage could not be parsed.",
          "Re-publish the dataset snapshot."
        );
        return;
      }

      sendJson(res, 200, parsedManifest);
    } catch (err: unknown) {
      sendError(
        res,
        500,
        "MANIFEST_QUERY_FAILED",
        err instanceof Error ? err.message : String(err),
        "Check database status."
      );
    }
  }
}
