/**
 * Master Pipeline Runner & Orchestrator.
 * Coordinates validation, actor resolution, execution target dispatch, output processing, and storage routing.
 */

import { ActorResolver } from "./actor-resolver";
import { ConnectorRegistry } from "./connectors/connector-registry";
import { resolveEnvString } from "./connectors/env-resolver";
import type { ExecutionTarget } from "./execution";
import { LocalExecutor } from "./execution/local-executor";
import { PipedreamExecutor } from "./execution/pipedream-executor";
import { RemoteHttpExecutor } from "./execution/remote-http-executor";
import { BufferedSink, type OutputSink } from "./output-sink";
import type { OutputProcessor } from "./processors";
import { CsvWriter } from "./processors/csv-writer";
import { JsonlWriter } from "./processors/jsonl-writer";
import { ParquetPacker } from "./processors/parquet-packer";
import { PassthroughWriter } from "./processors/passthrough-writer";
import { ScheduleBroker } from "./schedule-broker";
import {
  type ConnectorConfig,
  loadPipelineConfigFile,
  type PipelineConfig,
  PipelineError,
  parsePipelineYaml,
} from "./schema";
import type { StorageBackend, StorageReceipt } from "./storage";
import { B2Storage } from "./storage/b2-storage";
import { GoogleDriveStorage } from "./storage/google-drive-storage";
import { LocalStorage } from "./storage/local-storage";
import { R2Storage } from "./storage/r2-storage";
import { S3Storage } from "./storage/s3-storage";

export interface PipelineRunResult {
  runId: string;
  pipelineName: string;
  actorId: string;
  status: "succeeded" | "failed";
  itemCount: number;
  durationMs: number;
  receipt?: StorageReceipt;
  error?: string;
  startedAt: string;
  completedAt: string;
}

export interface PipelineRunnerOptions {
  actorResolver?: ActorResolver;
  executor?: ExecutionTarget;
  executors?: Record<string, ExecutionTarget>;
  connectorRegistry?: ConnectorRegistry;
  connectors?: Record<string, ConnectorConfig>;
  processors?: Record<string, OutputProcessor>;
  storageBackends?: Record<string, StorageBackend>;
  scheduleBroker?: ScheduleBroker;
}

export class PipelineRunner {
  private readonly actorResolver: ActorResolver;
  private readonly defaultExecutor: ExecutionTarget;
  private readonly executors: Map<string, ExecutionTarget> = new Map();
  private readonly connectorRegistry: ConnectorRegistry;
  private readonly scheduleBroker: ScheduleBroker;
  private readonly processors: Map<string, OutputProcessor> = new Map();
  private readonly storageBackends: Map<string, StorageBackend> = new Map();
  private readonly runHistory: PipelineRunResult[] = [];
  private readonly failedRuns: PipelineRunResult[] = [];

  constructor(options?: PipelineRunnerOptions) {
    this.actorResolver = options?.actorResolver || new ActorResolver();
    this.defaultExecutor = options?.executor || new LocalExecutor();
    this.connectorRegistry =
      options?.connectorRegistry || new ConnectorRegistry(options?.connectors);
    this.scheduleBroker = options?.scheduleBroker || new ScheduleBroker();

    this.registerExecutor(this.defaultExecutor);
    if (options?.executors) {
      for (const [, exec] of Object.entries(options.executors)) {
        this.registerExecutor(exec);
      }
    }

    // Register processors
    this.registerProcessor(new JsonlWriter());
    this.registerProcessor(new PassthroughWriter());
    this.registerProcessor(new CsvWriter());
    this.registerProcessor(new ParquetPacker());

    if (options?.processors) {
      for (const [key, p] of Object.entries(options.processors)) {
        this.processors.set(key, p);
      }
    }

    // Register default storage
    this.registerStorage(new LocalStorage());

    if (options?.storageBackends) {
      for (const [key, s] of Object.entries(options.storageBackends)) {
        this.storageBackends.set(key, s);
      }
    }
  }

  registerExecutor(executor: ExecutionTarget): void {
    this.executors.set(executor.name, executor);
  }

  registerProcessor(processor: OutputProcessor): void {
    this.processors.set(processor.format, processor);
  }

  registerStorage(storage: StorageBackend): void {
    this.storageBackends.set(storage.backend, storage);
  }

  registerConnector(name: string, config: ConnectorConfig): void {
    this.connectorRegistry.register(name, config);
  }

  /**
   * Schedules a recurring pipeline using its configured cron expression.
   */
  scheduleConfig(config: PipelineConfig, checkIntervalMs?: number): { stop: () => void } {
    if (config.schedule?.type !== "cron" || !config.schedule.expression) {
      throw new PipelineError(
        `Cannot schedule pipeline '${config.name}' without schedule.type='cron' and a valid expression.`,
        "INVALID_SCHEDULE_CONFIG"
      );
    }

    return this.scheduleBroker.scheduleJob(
      config.name,
      config.schedule.expression,
      async () => {
        await this.runConfig(config);
      },
      checkIntervalMs
    );
  }

  getScheduleBroker(): ScheduleBroker {
    return this.scheduleBroker;
  }

  /**
   * Executes a pipeline configuration loaded from a YAML file.
   */
  async runFile(filePath: string): Promise<PipelineRunResult> {
    try {
      const config = loadPipelineConfigFile(filePath);
      return await this.runConfig(config);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const failedResult: PipelineRunResult = {
        runId: `run_init_error_${Date.now()}`,
        pipelineName: "unresolved_pipeline",
        actorId: "unknown",
        status: "failed",
        itemCount: 0,
        durationMs: 0,
        error: message,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };
      this.failedRuns.push(failedResult);
      this.runHistory.push(failedResult);
      return failedResult;
    }
  }

  /**
   * Executes a pipeline configuration parsed from a YAML string.
   */
  async runYaml(yamlString: string): Promise<PipelineRunResult> {
    try {
      const config = parsePipelineYaml(yamlString);
      return await this.runConfig(config);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const failedResult: PipelineRunResult = {
        runId: `run_yaml_error_${Date.now()}`,
        pipelineName: "unresolved_pipeline",
        actorId: "unknown",
        status: "failed",
        itemCount: 0,
        durationMs: 0,
        error: message,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };
      this.failedRuns.push(failedResult);
      this.runHistory.push(failedResult);
      return failedResult;
    }
  }

  /**
   * Orchestrates the complete pipeline run loop.
   * Catches errors gracefully and records them into failedRuns without throwing unhandled exceptions.
   */
  async runConfig(config: PipelineConfig): Promise<PipelineRunResult> {
    const startedAt = new Date().toISOString();
    const startTime = Date.now();
    const runId = `run_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    try {
      // 0. Register any config-level connectors
      if (config.connectors) {
        for (const [name, connectorConfig] of Object.entries(config.connectors)) {
          this.connectorRegistry.register(name, connectorConfig);
        }
      }

      // 1. Resolve and validate actor
      this.actorResolver.resolve(config.actor.id, config.actor.config);

      // 2. Select execution target
      const executor = this.resolveExecutor(config);

      // 3. Execute actor and populate sink
      const execResult = await executor.run(config.actor.id, config.actor.config);
      if (!execResult.success) {
        throw new PipelineError(
          `Actor execution failed: ${execResult.error || "Unknown execution error"}`,
          "ACTOR_EXECUTION_FAILED"
        );
      }

      const sink: OutputSink = new BufferedSink();
      sink.write(execResult.items);
      sink.close();

      // 4. Select output processor
      const outputFormat = config.output?.format || "jsonl";
      const processor = this.processors.get(outputFormat);
      if (!processor) {
        throw new PipelineError(
          `Unsupported output format '${outputFormat}'. Registered formats: ${Array.from(this.processors.keys()).join(", ")}`,
          "UNSUPPORTED_OUTPUT_FORMAT"
        );
      }

      const fileBaseName = `${config.name}_${new Date().toISOString().replace(/[:.]/g, "-")}`;
      const processedOutput = await processor.process(sink.getItems(), fileBaseName);

      // 5. Select storage backend and upload
      const storage = this.resolveStorageBackend(config);
      const prefix = config.storage?.prefix || "";
      const receipt = await storage.upload(
        processedOutput.fileName,
        processedOutput.buffer,
        prefix
      );

      const completedResult: PipelineRunResult = {
        runId,
        pipelineName: config.name,
        actorId: config.actor.id,
        status: "succeeded",
        itemCount: processedOutput.rowCount,
        durationMs: Date.now() - startTime,
        receipt,
        startedAt,
        completedAt: new Date().toISOString(),
      };

      this.runHistory.push(completedResult);
      return completedResult;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const failedResult: PipelineRunResult = {
        runId,
        pipelineName: config.name,
        actorId: config.actor?.id || "unknown",
        status: "failed",
        itemCount: 0,
        durationMs: Date.now() - startTime,
        error: message,
        startedAt,
        completedAt: new Date().toISOString(),
      };

      this.failedRuns.push(failedResult);
      this.runHistory.push(failedResult);
      return failedResult;
    }
  }

  private resolveExecutor(config: PipelineConfig): ExecutionTarget {
    const target = config.execution?.target || "local";

    // 1. Explicitly registered or injected executor takes priority
    if (this.executors.has(target)) {
      return this.executors.get(target)!;
    }

    if (target === "local") {
      return this.defaultExecutor;
    }

    if (target === "remote-http") {
      const endpoint = config.execution?.endpoint;
      if (!endpoint) {
        throw new PipelineError(
          "Execution target 'remote-http' requires an 'endpoint' URL in execution configuration.",
          "MISSING_REMOTE_ENDPOINT"
        );
      }
      const token = config.execution?.token ? resolveEnvString(config.execution.token) : undefined;
      return new RemoteHttpExecutor({ endpoint, token });
    }

    if (target === "pipedream") {
      const webhookUrl = config.execution?.endpoint;
      if (!webhookUrl) {
        throw new PipelineError(
          "Execution target 'pipedream' requires an 'endpoint' (webhook URL) in execution configuration.",
          "MISSING_PIPEDREAM_ENDPOINT"
        );
      }
      const token = config.execution?.token ? resolveEnvString(config.execution.token) : undefined;
      return new PipedreamExecutor({ webhookUrl, token });
    }

    throw new PipelineError(
      `Unsupported execution target '${target}'. Available targets: local, remote-http, pipedream.`,
      "TARGET_NOT_IMPLEMENTED"
    );
  }

  private resolveStorageBackend(config: PipelineConfig): StorageBackend {
    const backendType = config.storage?.backend || "local";

    // 1. Explicitly registered custom storage backend takes priority
    if (backendType !== "local" && this.storageBackends.has(backendType)) {
      return this.storageBackends.get(backendType)!;
    }

    if (backendType === "local") {
      if (config.storage?.destination_path) {
        return new LocalStorage({ baseDir: config.storage.destination_path });
      }
      return this.storageBackends.get("local") || new LocalStorage();
    }

    // 2. Google Drive storage backend
    if (backendType === "drive") {
      const connectorName = config.storage?.connector;
      let folderId = config.storage?.folder_id;
      let credentialsJson: string | Record<string, unknown> | undefined;
      let keyFile: string | undefined;

      if (connectorName) {
        const connector = this.connectorRegistry.resolve(connectorName);
        folderId = folderId || connector.folder_id;
        credentialsJson = connector.token || connector.secret_access_key;
        keyFile = connector.endpoint;
      }

      return new GoogleDriveStorage({
        folderId,
        credentialsJson,
        keyFile,
      });
    }

    // 3. Cloud storage backends (S3, R2, B2)
    if (backendType === "s3" || backendType === "r2" || backendType === "b2") {
      const connectorName = config.storage?.connector;
      if (!connectorName) {
        throw new PipelineError(
          `Storage backend '${backendType}' requires a 'connector' name specified in storage configuration.`,
          "MISSING_CONNECTOR_NAME",
          { backend: backendType }
        );
      }

      const connector = this.connectorRegistry.resolve(connectorName);
      const bucket = connector.bucket || config.storage?.destination_path;

      if (!bucket) {
        throw new PipelineError(
          `Storage backend '${backendType}' requires a bucket defined either in connector '${connectorName}' or storage 'destination_path'.`,
          "MISSING_STORAGE_BUCKET",
          { connector: connectorName }
        );
      }

      const credentials =
        connector.access_key_id && connector.secret_access_key
          ? {
              accessKeyId: connector.access_key_id,
              secretAccessKey: connector.secret_access_key,
            }
          : undefined;

      switch (backendType) {
        case "s3":
          return new S3Storage({
            bucket,
            region: connector.region,
            endpoint: connector.endpoint,
            credentials,
          });
        case "r2":
          return new R2Storage({
            bucket,
            accountId: connector.account_id,
            region: connector.region,
            endpoint: connector.endpoint,
            credentials,
          });
        case "b2":
          return new B2Storage({
            bucket,
            region: connector.region,
            endpoint: connector.endpoint,
            credentials,
          });
      }
    }

    // 4. Fallback for custom registered backend
    if (this.storageBackends.has(backendType)) {
      return this.storageBackends.get(backendType)!;
    }

    throw new PipelineError(
      `Unsupported storage backend '${backendType}'. Registered backends: ${Array.from(this.storageBackends.keys()).join(", ")}`,
      "UNSUPPORTED_STORAGE_BACKEND"
    );
  }

  getRunHistory(): PipelineRunResult[] {
    return [...this.runHistory];
  }

  getFailedRuns(): PipelineRunResult[] {
    return [...this.failedRuns];
  }
}
