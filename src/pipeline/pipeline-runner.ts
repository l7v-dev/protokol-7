/**
 * Master Pipeline Runner & Orchestrator.
 * Coordinates validation, actor resolution, execution target dispatch, output processing, and storage routing.
 */

import { ActorResolver } from "./actor-resolver";
import type { ExecutionTarget } from "./execution";
import { LocalExecutor } from "./execution/local-executor";
import { BufferedSink, type OutputSink } from "./output-sink";
import type { OutputProcessor } from "./processors";
import { CsvWriter } from "./processors/csv-writer";
import { JsonlWriter } from "./processors/jsonl-writer";
import { ParquetPacker } from "./processors/parquet-packer";
import { PassthroughWriter } from "./processors/passthrough-writer";
import {
  loadPipelineConfigFile,
  type PipelineConfig,
  PipelineError,
  parsePipelineYaml,
} from "./schema";
import type { StorageBackend, StorageReceipt } from "./storage";
import { LocalStorage } from "./storage/local-storage";

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
  processors?: Record<string, OutputProcessor>;
  storageBackends?: Record<string, StorageBackend>;
}

export class PipelineRunner {
  private readonly actorResolver: ActorResolver;
  private readonly defaultExecutor: ExecutionTarget;
  private readonly processors: Map<string, OutputProcessor> = new Map();
  private readonly storageBackends: Map<string, StorageBackend> = new Map();
  private readonly runHistory: PipelineRunResult[] = [];
  private readonly failedRuns: PipelineRunResult[] = [];

  constructor(options?: PipelineRunnerOptions) {
    this.actorResolver = options?.actorResolver || new ActorResolver();
    this.defaultExecutor = options?.executor || new LocalExecutor();

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

  registerProcessor(processor: OutputProcessor): void {
    this.processors.set(processor.format, processor);
  }

  registerStorage(storage: StorageBackend): void {
    this.storageBackends.set(storage.backend, storage);
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
      // 1. Resolve and validate actor
      this.actorResolver.resolve(config.actor.id, config.actor.config);

      // 2. Select execution target
      const executor = this.resolveExecutor(config.execution?.target);

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
      const storageBackendType = config.storage?.backend || "local";
      const storage = this.storageBackends.get(storageBackendType);
      if (!storage) {
        throw new PipelineError(
          `Unsupported storage backend '${storageBackendType}'. Registered backends: ${Array.from(this.storageBackends.keys()).join(", ")}`,
          "UNSUPPORTED_STORAGE_BACKEND"
        );
      }

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

  private resolveExecutor(target?: string): ExecutionTarget {
    if (!target || target === "local") {
      return this.defaultExecutor;
    }
    throw new PipelineError(
      `Execution target '${target}' is not yet supported in Phase 1 (Local execution available).`,
      "TARGET_NOT_IMPLEMENTED"
    );
  }

  getRunHistory(): PipelineRunResult[] {
    return [...this.runHistory];
  }

  getFailedRuns(): PipelineRunResult[] {
    return [...this.failedRuns];
  }
}
