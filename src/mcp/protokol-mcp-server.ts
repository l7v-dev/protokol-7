/**
 * src/mcp/protokol-mcp-server.ts
 *
 * Protokol-7 Native Stdio Model Context Protocol (MCP) Server.
 * Exposes scraping, document distillation, and crawling actors
 * to AI agent clients (Claude Desktop, Cursor, Antigravity, Cline)
 * using standard JSON-RPC 2.0 over standard I/O (stdio).
 */

import { randomUUID } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import readline from "node:readline";
import { ACTOR_MANIFESTS, type ActorManifest } from "../actors/actor-manifests";
import { ActorRegistry, createDefaultActorRegistry } from "../actors/actor-registry";
import { getDefaultRegistryDatabase } from "../api/registry-database";
import { globalRunRegistry } from "../api/run-registry";
import type {
  ActorTask,
  ActorType,
  ApiExtractorTaskOptions,
  ArchiveExtractorTaskOptions,
  ArxivActorTaskOptions,
  ClinicalTrialsActorTaskOptions,
  CodeEvalActorTaskOptions,
  CourtListenerActorTaskOptions,
  DergiParkActorTaskOptions,
  DevDocsActorTaskOptions,
  DocumentExtractorTaskOptions,
  EpubExtractorTaskOptions,
  EurLexActorTaskOptions,
  EuropePmcActorTaskOptions,
  GithubActorTaskOptions,
  GutenbergActorTaskOptions,
  HackerNewsActorTaskOptions,
  HuggingFaceDatasetsActorTaskOptions,
  IetfRfcActorTaskOptions,
  InternetArchiveActorTaskOptions,
  InternetPhilActorTaskOptions,
  KapActorTaskOptions,
  KtbEkitapTaskOptions,
  LeanMathlibActorTaskOptions,
  LessWrongActorTaskOptions,
  LibreTextsActorTaskOptions,
  MathReasoningActorTaskOptions,
  MetamathActorTaskOptions,
  MitOcwActorTaskOptions,
  NetworkInterceptorTaskOptions,
  OpenAlexActorTaskOptions,
  OpenFdaActorTaskOptions,
  OpenReviewActorTaskOptions,
  OpenStaxActorTaskOptions,
  OpenTextbookActorTaskOptions,
  PapersWithCodeActorTaskOptions,
  PdfDocumentTaskOptions,
  PhilPapersActorTaskOptions,
  ProofWikiActorTaskOptions,
  ResmiGazeteActorTaskOptions,
  RosettaCodeActorTaskOptions,
  SaglikEkutuphaneTaskOptions,
  SecEdgarActorTaskOptions,
  SemanticScholarActorTaskOptions,
  SerpSearchTaskOptions,
  SoftwareHeritageActorTaskOptions,
  StackExchangeActorTaskOptions,
  StanfordPhilActorTaskOptions,
  WikibooksActorTaskOptions,
  WikidataActorTaskOptions,
  WikimediaActorTaskOptions,
  WikinewsActorTaskOptions,
  WikipediaActorTaskOptions,
  WikiquoteActorTaskOptions,
  WikisourceActorTaskOptions,
  WikispeciesActorTaskOptions,
  WikiversityActorTaskOptions,
  WikivoyageActorTaskOptions,
  WiktionaryActorTaskOptions,
  YargitayActorTaskOptions,
  YoutubeTranscriptsActorTaskOptions,
} from "../api/types";
import { DatasetPublisher } from "../dataset/dataset-publisher";
import type { PublishDatasetOptions, SplitRatios } from "../dataset/types";
import { PipelineRunner, type PipelineRunResult } from "../pipeline/pipeline-runner";
import { ScheduleBroker } from "../pipeline/schedule-broker";
import type { PipelineConfig } from "../pipeline/schema";
import { ColdVaultExporter } from "../vault/cold-vault-exporter";

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id?: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

const POOL_ROOT = process.env.PROTOKOL_POOL_ROOT || "/home/l7v/protokol-data-pool";

export class ProtokolMcpServer {
  private readonly registry: ActorRegistry;
  private readonly toolToManifestMap = new Map<string, ActorManifest>();
  private readonly scheduleBroker: ScheduleBroker;
  private rl?: readline.Interface;

  constructor(registry?: ActorRegistry) {
    this.registry = registry || createDefaultActorRegistry();
    this.scheduleBroker = new ScheduleBroker();
    for (const manifest of Object.values(ACTOR_MANIFESTS)) {
      if (manifest.mcpTool?.name) {
        this.toolToManifestMap.set(manifest.mcpTool.name, manifest);
      }
    }
  }

  getTools() {
    const actorTools = Array.from(this.toolToManifestMap.values()).map((m) => ({
      name: m.mcpTool.name,
      description: m.mcpTool.description,
      inputSchema: m.mcpTool.inputSchema,
    }));

    const pipelineTools = [
      {
        name: "run_pipeline",
        description:
          "Executes a declarative YAML pipeline to acquire, normalize, quality filter, deduplicate, and shard LLM dataset items to local or cloud storage.",
        inputSchema: {
          type: "object",
          properties: {
            yaml: {
              type: "string",
              description: "Raw YAML pipeline definition string.",
            },
            filePath: {
              type: "string",
              description:
                "Relative path to a YAML pipeline template, e.g. 'examples/pipelines/corpus-parquet-sample.yaml'.",
            },
            config: {
              type: "object",
              description: "Parsed JSON pipeline configuration object.",
            },
          },
        },
      },
      {
        name: "list_pipelines",
        description:
          "Lists available pre-configured YAML pipeline templates in examples/pipelines/ and recent pipeline execution records.",
        inputSchema: {
          type: "object",
          properties: {
            limit: {
              type: "number",
              description: "Maximum number of recent runs to return (default: 20).",
            },
          },
        },
      },
    ];

    const datasetTools = [
      {
        name: "publish_dataset",
        description:
          "Seals filtered corpus shards into a versioned training dataset snapshot with cryptographic SHA-256 checksums, train/val/test splits, and a verified manifest.json.",
        inputSchema: {
          type: "object",
          required: ["datasetName"],
          properties: {
            datasetName: {
              type: "string",
              description:
                "Technical name of the dataset to publish (e.g. 'arxiv_math', 'tr_corpus').",
            },
            version: {
              type: "string",
              description:
                "Optional semantic version or snapshot tag. Defaults to current date (e.g. '2026.09.27.1').",
            },
            filePaths: {
              type: "array",
              items: { type: "string" },
              description:
                "Optional list of local shard files to register and include in the snapshot.",
            },
            shardIds: {
              type: "array",
              items: { type: "string" },
              description: "Optional list of pre-registered shard IDs to include in the snapshot.",
            },
            splitRatios: {
              type: "object",
              properties: {
                train: {
                  type: "number",
                  description: "Proportion for training split (default: 0.8).",
                },
                validation: {
                  type: "number",
                  description: "Proportion for validation split (default: 0.1).",
                },
                test: {
                  type: "number",
                  description: "Proportion for testing split (default: 0.1).",
                },
              },
              description: "Split proportions for deterministic partitioning.",
            },
            outputDir: {
              type: "string",
              description:
                "Optional relative output directory to write manifest.json and checksums.sha256.",
            },
            connectorName: {
              type: "string",
              description: "Optional storage connector name (S3/R2/B2) for uploading the manifest.",
            },
            licenseGroup: {
              type: "string",
              enum: [
                "permissive_commercial",
                "non_commercial_research",
                "public_domain",
                "restricted",
              ],
              description: "License category for the training dataset.",
            },
          },
        },
      },
      {
        name: "list_datasets",
        description:
          "Lists all datasets in the catalog, including registered shard counts, total records, byte size, and latest snapshot status.",
        inputSchema: {
          type: "object",
          properties: {
            limit: {
              type: "number",
              description: "Maximum number of dataset entries to return (default: 50).",
            },
          },
        },
      },
      {
        name: "get_dataset_manifest",
        description:
          "Retrieves the full, verified training dataset manifest (manifest.json) with split distributions, file checksums, and token metrics for a dataset or snapshot ID.",
        inputSchema: {
          type: "object",
          required: ["identifier"],
          properties: {
            identifier: {
              type: "string",
              description:
                "Dataset technical name or snapshot ID (e.g. 'arxiv_math' or 'dss_...').",
            },
          },
        },
      },
    ];

    const jobTools = [
      {
        name: "schedule_job",
        description:
          "Schedules a recurring pipeline or actor task using a 5-part cron expression with SQLite ACID tracking.",
        inputSchema: {
          type: "object",
          required: ["cronExpression"],
          properties: {
            jobId: {
              type: "string",
              description: "Optional custom unique identifier for the job.",
            },
            cronExpression: {
              type: "string",
              description:
                "Standard 5-part cron expression (minute hour day-of-month month day-of-week), e.g. '0 0 * * *'.",
            },
            pipeline: {
              type: "object",
              description: "Pipeline configuration to run when cron triggers.",
              properties: {
                yaml: {
                  type: "string",
                  description: "Raw YAML pipeline definition string.",
                },
                filePath: {
                  type: "string",
                  description: "Workspace-relative path to a pipeline YAML file.",
                },
                config: {
                  type: "object",
                  description: "Direct pipeline configuration object.",
                },
              },
            },
            actor: {
              type: "object",
              description: "Direct actor extraction task to run when cron triggers.",
              properties: {
                actorName: {
                  type: "string",
                  description: "Name of the actor, e.g. 'arxiv', 'pubmed'.",
                },
                input: {
                  type: "object",
                  description: "Task input parameters for the actor.",
                },
              },
            },
            description: {
              type: "string",
              description: "Optional human-readable description for the job.",
            },
            checkIntervalMs: {
              type: "number",
              description: "Interval in milliseconds to check cron schedule (default: 60000).",
            },
          },
        },
      },
      {
        name: "list_jobs",
        description:
          "Lists all scheduled cron jobs from memory and persistent SQLite registry with run counts and last execution timestamps.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "cancel_job",
        description: "Cancels and stops an active scheduled cron job by its identifier.",
        inputSchema: {
          type: "object",
          required: ["jobId"],
          properties: {
            jobId: {
              type: "string",
              description: "Unique identifier of the scheduled job to cancel.",
            },
          },
        },
      },
    ];

    const vaultTools = [
      {
        name: "export_cold_vault",
        description:
          "Exports sealed dataset shards and verified manifest to a cold vault volume adhering to Btrfs/SHA256SUMS standard.",
        inputSchema: {
          type: "object",
          required: ["datasetName", "volumeRoot"],
          properties: {
            datasetName: {
              type: "string",
              description: "Technical name of the dataset to export (e.g. 'arxiv_math').",
            },
            volumeRoot: {
              type: "string",
              description:
                "Target cold vault volume filesystem root directory (e.g. 'data/cold_vault/VOL-001' or '/mnt/coldvault/VOL-2026-001').",
            },
            version: {
              type: "string",
              description: "Optional snapshot version. Defaults to latest snapshot.",
            },
            volumeLabel: {
              type: "string",
              description: "Optional label for the cold storage volume.",
            },
            filesystem: {
              type: "string",
              enum: ["btrfs", "ext4", "other"],
              description: "Filesystem type of the volume (default: 'btrfs').",
            },
            copyMode: {
              type: "string",
              enum: ["copy", "hardlink"],
              description: "Transfer mode (default: 'copy').",
            },
            verifyChecksums: {
              type: "boolean",
              description:
                "Whether to verify cryptographic SHA-256 hashes during copy (default: true).",
            },
          },
        },
      },
      {
        name: "verify_cold_vault",
        description:
          "Cryptographically verifies all files on a cold vault storage volume against its checksums/SHA256SUMS ledger.",
        inputSchema: {
          type: "object",
          required: ["volumeRoot"],
          properties: {
            volumeRoot: {
              type: "string",
              description: "Directory path of the cold vault volume to verify.",
            },
          },
        },
      },
    ];

    return [...actorTools, ...pipelineTools, ...datasetTools, ...jobTools, ...vaultTools];
  }

  getScheduleBroker(): ScheduleBroker {
    return this.scheduleBroker;
  }

  async processRequest(request: JsonRpcRequest): Promise<JsonRpcResponse | null> {
    const { id, method, params } = request;

    switch (method) {
      case "initialize": {
        return {
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: {
              tools: {},
              resources: {
                subscribe: true,
                listChanged: true,
              },
            },
            serverInfo: {
              name: "protokol-7-mcp",
              version: "1.0.0",
            },
          },
        };
      }

      case "notifications/initialized": {
        return null;
      }

      case "ping": {
        return {
          jsonrpc: "2.0",
          id,
          result: {},
        };
      }

      case "tools/list": {
        return {
          jsonrpc: "2.0",
          id,
          result: {
            tools: this.getTools(),
          },
        };
      }

      case "tools/call": {
        const toolName = params?.name as string;
        const toolArgs = (params?.arguments as Record<string, unknown>) || {};

        if (toolName === "run_pipeline") {
          const yaml = toolArgs.yaml as string | undefined;
          const filePath = toolArgs.filePath as string | undefined;
          const config = toolArgs.config as PipelineConfig | undefined;

          if (!yaml && !filePath && !config) {
            return {
              jsonrpc: "2.0",
              id,
              result: {
                content: [
                  {
                    type: "text",
                    text: "[ERROR] At least one of 'yaml', 'filePath', or 'config' must be provided to run_pipeline.",
                  },
                ],
                isError: true,
              },
            };
          }

          try {
            const runner = new PipelineRunner();
            let result: PipelineRunResult;
            if (filePath) {
              const rootDir = process.cwd();
              const resolved = resolve(rootDir, filePath);
              if (!resolved.startsWith(rootDir) || resolved.includes("..")) {
                throw new Error("Access outside workspace directory is forbidden.");
              }
              result = await runner.runFile(resolved);
            } else if (yaml) {
              result = await runner.runYaml(yaml);
            } else {
              result = await runner.runConfig(config!);
            }

            return {
              jsonrpc: "2.0",
              id,
              result: {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(result, null, 2),
                  },
                ],
                isError: result.status === "failed",
              },
            };
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return {
              jsonrpc: "2.0",
              id,
              result: {
                content: [{ type: "text", text: `[ERROR] Pipeline execution failed: ${msg}` }],
                isError: true,
              },
            };
          }
        }

        if (toolName === "list_pipelines") {
          const pipelinesDir = join(process.cwd(), "examples", "pipelines");
          const templates: string[] = [];
          if (existsSync(pipelinesDir)) {
            templates.push(
              ...readdirSync(pipelinesDir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
            );
          }
          const db = getDefaultRegistryDatabase();
          const runs = db ? db.listPipelineExecutions(Number(toolArgs.limit) || 20) : [];

          return {
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({ templates, recentRuns: runs }, null, 2),
                },
              ],
            },
          };
        }

        if (toolName === "publish_dataset") {
          const datasetName = toolArgs.datasetName as string;
          if (!datasetName) {
            return {
              jsonrpc: "2.0",
              id,
              result: {
                content: [
                  {
                    type: "text",
                    text: "[ERROR] 'datasetName' is required to publish a dataset.",
                  },
                ],
                isError: true,
              },
            };
          }
          try {
            const publisher = new DatasetPublisher();
            const result = await publisher.publishSnapshot({
              datasetName,
              version: toolArgs.version as string | undefined,
              filePaths: toolArgs.filePaths as string[] | undefined,
              shardIds: toolArgs.shardIds as string[] | undefined,
              splitRatios: toolArgs.splitRatios as SplitRatios | undefined,
              outputDir: toolArgs.outputDir as string | undefined,
              connectorName: toolArgs.connectorName as string | undefined,
              licenseGroup: toolArgs.licenseGroup as PublishDatasetOptions["licenseGroup"],
            });
            return {
              jsonrpc: "2.0",
              id,
              result: {
                content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
              },
            };
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return {
              jsonrpc: "2.0",
              id,
              result: {
                content: [{ type: "text", text: `[ERROR] Failed to publish dataset: ${msg}` }],
                isError: true,
              },
            };
          }
        }

        if (toolName === "list_datasets") {
          const db = getDefaultRegistryDatabase();
          const datasets = db ? db.listDatasets() : [];
          const enriched = datasets.map((ds) => {
            const shards = db ? db.listDatasetShards(ds.name, 500) : [];
            const latestSnapshot = db ? db.getLatestDatasetSnapshot(ds.name) : undefined;
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

          return {
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({ count: enriched.length, datasets: enriched }, null, 2),
                },
              ],
            },
          };
        }

        if (toolName === "get_dataset_manifest") {
          const identifier = toolArgs.identifier as string;
          if (!identifier) {
            return {
              jsonrpc: "2.0",
              id,
              result: {
                content: [
                  {
                    type: "text",
                    text: "[ERROR] 'identifier' (dataset name or snapshot ID) is required.",
                  },
                ],
                isError: true,
              },
            };
          }
          const publisher = new DatasetPublisher();
          const manifest = publisher.getManifest(identifier);
          if (!manifest) {
            return {
              jsonrpc: "2.0",
              id,
              result: {
                content: [
                  {
                    type: "text",
                    text: `[ERROR] Manifest not found for identifier: '${identifier}'.`,
                  },
                ],
                isError: true,
              },
            };
          }
          return {
            jsonrpc: "2.0",
            id,
            result: {
              content: [{ type: "text", text: JSON.stringify(manifest, null, 2) }],
            },
          };
        }

        if (toolName === "schedule_job") {
          const cronExpression = toolArgs.cronExpression as string;
          if (!cronExpression || typeof cronExpression !== "string") {
            return {
              jsonrpc: "2.0",
              id,
              result: {
                content: [
                  {
                    type: "text",
                    text: "[ERROR] 'cronExpression' (string) is required to schedule a job.",
                  },
                ],
                isError: true,
              },
            };
          }

          const pipeline = toolArgs.pipeline as
            | { yaml?: string; filePath?: string; config?: PipelineConfig }
            | undefined;
          const actor = toolArgs.actor as
            | { actorName: string; input?: Record<string, unknown> }
            | undefined;

          if (!pipeline && !actor) {
            return {
              jsonrpc: "2.0",
              id,
              result: {
                content: [
                  {
                    type: "text",
                    text: "[ERROR] Scheduled job requires either a 'pipeline' or an 'actor' specification.",
                  },
                ],
                isError: true,
              },
            };
          }

          let resolvedFilePath: string | undefined;
          if (pipeline?.filePath) {
            const rootDir = process.cwd();
            const targetPath = resolve(rootDir, pipeline.filePath);
            if (!targetPath.startsWith(rootDir) || targetPath.includes("..")) {
              return {
                jsonrpc: "2.0",
                id,
                result: {
                  content: [
                    {
                      type: "text",
                      text: `[ERROR] Access to path '${pipeline.filePath}' outside workspace root is forbidden.`,
                    },
                  ],
                  isError: true,
                },
              };
            }
            if (!existsSync(targetPath)) {
              return {
                jsonrpc: "2.0",
                id,
                result: {
                  content: [
                    {
                      type: "text",
                      text: `[ERROR] Pipeline template file '${pipeline.filePath}' not found.`,
                    },
                  ],
                  isError: true,
                },
              };
            }
            resolvedFilePath = targetPath;
          }

          if (actor?.actorName && !this.registry.has(actor.actorName as ActorType)) {
            return {
              jsonrpc: "2.0",
              id,
              result: {
                content: [
                  {
                    type: "text",
                    text: `[ERROR] Actor '${actor.actorName}' is not registered in the system registry.`,
                  },
                ],
                isError: true,
              },
            };
          }

          const jobId =
            (toolArgs.jobId as string | undefined)?.trim() ||
            `job_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

          const handler = async () => {
            if (pipeline) {
              const runner = new PipelineRunner();
              if (resolvedFilePath) {
                await runner.runFile(resolvedFilePath);
              } else if (pipeline.yaml) {
                await runner.runYaml(pipeline.yaml);
              } else if (pipeline.config) {
                await runner.runConfig(pipeline.config);
              }
            } else if (actor) {
              const actorInstance = this.registry.get(actor.actorName as ActorType);
              if (actorInstance) {
                const input = actor.input || {};
                const targetUrl =
                  typeof input.targetUrl === "string"
                    ? input.targetUrl
                    : typeof input.query === "string"
                      ? input.query
                      : typeof input.searchQuery === "string"
                        ? input.searchQuery
                        : "";
                const task: ActorTask = {
                  taskId: `task_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
                  actorType: actor.actorName as ActorType,
                  targetUrl,
                  options: input,
                };
                await actorInstance.run(task, { task, startTime: Date.now() });
              }
            }
          };

          try {
            this.scheduleBroker.scheduleJob(
              jobId,
              cronExpression,
              handler,
              (toolArgs.checkIntervalMs as number) || 60000
            );

            return {
              jsonrpc: "2.0",
              id,
              result: {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(
                      {
                        success: true,
                        jobId,
                        cronExpression,
                        running: true,
                        targetType: pipeline ? "pipeline" : "actor",
                        description: toolArgs.description,
                      },
                      null,
                      2
                    ),
                  },
                ],
              },
            };
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return {
              jsonrpc: "2.0",
              id,
              result: {
                content: [{ type: "text", text: `[ERROR] Failed to schedule job: ${msg}` }],
                isError: true,
              },
            };
          }
        }

        if (toolName === "list_jobs") {
          const activeJobs = this.scheduleBroker.getActiveJobs();
          const activeMap = new Map<string, unknown>();
          for (const j of activeJobs) {
            activeMap.set(j.id, j);
          }

          const db = getDefaultRegistryDatabase();
          const dbJobs = db ? db.listScheduledJobs() : [];
          const combined: unknown[] = [];
          const seenIds = new Set<string>();

          for (const dj of dbJobs) {
            seenIds.add(dj.id);
            const isActive = activeMap.has(dj.id);
            combined.push({
              ...dj,
              running: isActive ? true : dj.running,
              activeInMemory: isActive,
            });
          }

          for (const aj of activeJobs) {
            if (!seenIds.has(aj.id)) {
              combined.push({
                ...aj,
                activeInMemory: true,
              });
            }
          }

          return {
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({ count: combined.length, jobs: combined }, null, 2),
                },
              ],
            },
          };
        }

        if (toolName === "cancel_job") {
          const jobId = toolArgs.jobId as string;
          if (!jobId) {
            return {
              jsonrpc: "2.0",
              id,
              result: {
                content: [
                  {
                    type: "text",
                    text: "[ERROR] 'jobId' is required to cancel a job.",
                  },
                ],
                isError: true,
              },
            };
          }

          const stopped = this.scheduleBroker.stopJob(jobId);
          const db = getDefaultRegistryDatabase();
          if (!stopped) {
            const dbJob = db?.getScheduledJob(jobId);
            if (!dbJob) {
              return {
                jsonrpc: "2.0",
                id,
                result: {
                  content: [
                    {
                      type: "text",
                      text: `[ERROR] Scheduled job '${jobId}' not found or already inactive.`,
                    },
                  ],
                  isError: true,
                },
              };
            }
            db?.setScheduledJobRunning(jobId, false);
          }

          return {
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      success: true,
                      jobId,
                      stopped: true,
                      message: `Scheduled job '${jobId}' was stopped and deactivated.`,
                    },
                    null,
                    2
                  ),
                },
              ],
            },
          };
        }

        if (toolName === "export_cold_vault") {
          const datasetName = toolArgs.datasetName as string;
          const volumeRoot = toolArgs.volumeRoot as string;
          if (!datasetName || !volumeRoot) {
            return {
              jsonrpc: "2.0",
              id,
              result: {
                content: [
                  {
                    type: "text",
                    text: "[ERROR] 'datasetName' and 'volumeRoot' are required to export to cold vault.",
                  },
                ],
                isError: true,
              },
            };
          }

          if (volumeRoot.includes("..")) {
            return {
              jsonrpc: "2.0",
              id,
              result: {
                content: [
                  {
                    type: "text",
                    text: "[ERROR] Path traversal pattern '..' is forbidden in volumeRoot.",
                  },
                ],
                isError: true,
              },
            };
          }

          try {
            const exporter = new ColdVaultExporter();
            const receipt = await exporter.exportDataset({
              datasetName,
              volumeRoot,
              version: toolArgs.version as string | undefined,
              volumeLabel: toolArgs.volumeLabel as string | undefined,
              filesystem: toolArgs.filesystem as "btrfs" | "ext4" | "other" | undefined,
              copyMode: toolArgs.copyMode as "copy" | "hardlink" | undefined,
              verifyChecksums: toolArgs.verifyChecksums !== false,
            });

            return {
              jsonrpc: "2.0",
              id,
              result: {
                content: [{ type: "text", text: JSON.stringify(receipt, null, 2) }],
              },
            };
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return {
              jsonrpc: "2.0",
              id,
              result: {
                content: [{ type: "text", text: `[ERROR] Failed to export to cold vault: ${msg}` }],
                isError: true,
              },
            };
          }
        }

        if (toolName === "verify_cold_vault") {
          const volumeRoot = toolArgs.volumeRoot as string;
          if (!volumeRoot) {
            return {
              jsonrpc: "2.0",
              id,
              result: {
                content: [
                  {
                    type: "text",
                    text: "[ERROR] 'volumeRoot' is required to verify cold vault volume.",
                  },
                ],
                isError: true,
              },
            };
          }

          if (volumeRoot.includes("..")) {
            return {
              jsonrpc: "2.0",
              id,
              result: {
                content: [
                  {
                    type: "text",
                    text: "[ERROR] Path traversal pattern '..' is forbidden in volumeRoot.",
                  },
                ],
                isError: true,
              },
            };
          }

          try {
            const exporter = new ColdVaultExporter();
            const verification = await exporter.verifyVolume(volumeRoot);
            return {
              jsonrpc: "2.0",
              id,
              result: {
                content: [{ type: "text", text: JSON.stringify(verification, null, 2) }],
              },
            };
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return {
              jsonrpc: "2.0",
              id,
              result: {
                content: [{ type: "text", text: `[ERROR] Failed to verify cold vault: ${msg}` }],
                isError: true,
              },
            };
          }
        }

        const manifest = this.toolToManifestMap.get(toolName);

        if (!manifest) {
          return {
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: `[ERROR] Unknown tool: ${toolName}`,
                },
              ],
              isError: true,
            },
          };
        }

        const actor = this.registry.get(manifest.actorType as ActorType);
        if (!actor) {
          return {
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: `[ERROR] No registered actor implementation for type: ${manifest.actorType}`,
                },
              ],
              isError: true,
            },
          };
        }

        const targetUrl =
          (toolArgs.targetUrl as string) ||
          (toolArgs.query as string) ||
          (toolArgs.searchQuery as string) ||
          "";

        const task: ActorTask = {
          taskId: `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          actorType: manifest.actorType as ActorType,
          targetUrl,
          selectors: toolArgs.selectors as Record<string, string> | undefined,
          options: {
            ...toolArgs,
            arxivOptions:
              manifest.actorType === "arxiv"
                ? (toolArgs as unknown as ArxivActorTaskOptions)
                : undefined,
            serpOptions:
              manifest.actorType === "serp-search"
                ? (toolArgs as unknown as SerpSearchTaskOptions)
                : undefined,
            apiOptions:
              manifest.actorType === "api-extractor"
                ? (toolArgs as unknown as ApiExtractorTaskOptions)
                : undefined,
            pdfOptions:
              manifest.actorType === "pdf-document"
                ? (toolArgs as unknown as PdfDocumentTaskOptions)
                : undefined,
            wikimediaOptions:
              manifest.actorType === "wikimedia"
                ? (toolArgs as unknown as WikimediaActorTaskOptions)
                : undefined,
            wikipediaOptions:
              manifest.actorType === "wikipedia" || manifest.actorType === "wikimedia"
                ? (toolArgs as unknown as WikipediaActorTaskOptions)
                : undefined,
            openalexOptions:
              manifest.actorType === "openalex"
                ? (toolArgs as unknown as OpenAlexActorTaskOptions)
                : undefined,
            stackExchangeOptions:
              manifest.actorType === "stack-exchange"
                ? (toolArgs as unknown as StackExchangeActorTaskOptions)
                : undefined,
            gutenbergOptions:
              manifest.actorType === "gutenberg"
                ? (toolArgs as unknown as GutenbergActorTaskOptions)
                : undefined,
            europePmcOptions:
              manifest.actorType === "europe-pmc"
                ? (toolArgs as unknown as EuropePmcActorTaskOptions)
                : undefined,
            ietfRfcOptions:
              manifest.actorType === "ietf-rfc"
                ? (toolArgs as unknown as IetfRfcActorTaskOptions)
                : undefined,
            saglikEkutuphaneOptions:
              manifest.actorType === "saglik-ekutuphane"
                ? (toolArgs as unknown as SaglikEkutuphaneTaskOptions)
                : undefined,
            ktbEkitapOptions:
              manifest.actorType === "ktb-ekitap"
                ? (toolArgs as unknown as KtbEkitapTaskOptions)
                : undefined,
            networkInterceptorOptions:
              manifest.actorType === "network-interceptor"
                ? (toolArgs as unknown as NetworkInterceptorTaskOptions)
                : undefined,
            documentOptions:
              manifest.actorType === "document-extractor"
                ? (toolArgs as unknown as DocumentExtractorTaskOptions)
                : undefined,
            archiveOptions:
              manifest.actorType === "archive-extractor"
                ? (toolArgs as unknown as ArchiveExtractorTaskOptions)
                : undefined,
            epubOptions:
              manifest.actorType === "epub-extractor"
                ? (toolArgs as unknown as EpubExtractorTaskOptions)
                : undefined,
            dergiParkOptions:
              manifest.actorType === "dergipark"
                ? (toolArgs as unknown as DergiParkActorTaskOptions)
                : undefined,
            internetArchiveOptions:
              manifest.actorType === "internet-archive"
                ? (toolArgs as unknown as InternetArchiveActorTaskOptions)
                : undefined,
            clinicalTrialsOptions:
              manifest.actorType === "clinical-trials"
                ? (toolArgs as unknown as ClinicalTrialsActorTaskOptions)
                : undefined,
            openFdaOptions:
              manifest.actorType === "open-fda"
                ? (toolArgs as unknown as OpenFdaActorTaskOptions)
                : undefined,
            secEdgarOptions:
              manifest.actorType === "sec-edgar"
                ? (toolArgs as unknown as SecEdgarActorTaskOptions)
                : undefined,
            courtListenerOptions:
              manifest.actorType === "court-listener"
                ? (toolArgs as unknown as CourtListenerActorTaskOptions)
                : undefined,
            softwareHeritageOptions:
              manifest.actorType === "software-heritage"
                ? (toolArgs as unknown as SoftwareHeritageActorTaskOptions)
                : undefined,
            eurLexOptions:
              manifest.actorType === "eur-lex"
                ? (toolArgs as unknown as EurLexActorTaskOptions)
                : undefined,
            openstaxOptions:
              manifest.actorType === "openstax"
                ? (toolArgs as unknown as OpenStaxActorTaskOptions)
                : undefined,
            mitOcwOptions:
              manifest.actorType === "mit-ocw"
                ? (toolArgs as unknown as MitOcwActorTaskOptions)
                : undefined,
            resmiGazeteOptions:
              manifest.actorType === "resmi-gazete"
                ? (toolArgs as unknown as ResmiGazeteActorTaskOptions)
                : undefined,
            yargitayOptions:
              manifest.actorType === "yargitay"
                ? (toolArgs as unknown as YargitayActorTaskOptions)
                : undefined,
            kapOptions:
              manifest.actorType === "kap"
                ? (toolArgs as unknown as KapActorTaskOptions)
                : undefined,
            githubOptions:
              manifest.actorType === "github"
                ? (toolArgs as unknown as GithubActorTaskOptions)
                : undefined,
            openreviewOptions:
              manifest.actorType === "openreview"
                ? (toolArgs as unknown as OpenReviewActorTaskOptions)
                : undefined,
            hackerNewsOptions:
              manifest.actorType === "hacker-news"
                ? (toolArgs as unknown as HackerNewsActorTaskOptions)
                : undefined,
            huggingfaceDatasetsOptions:
              manifest.actorType === "huggingface-datasets"
                ? (toolArgs as unknown as HuggingFaceDatasetsActorTaskOptions)
                : undefined,
            mathReasoningOptions:
              manifest.actorType === "math-reasoning"
                ? (toolArgs as unknown as MathReasoningActorTaskOptions)
                : undefined,
            codeEvalOptions:
              manifest.actorType === "code-eval"
                ? (toolArgs as unknown as CodeEvalActorTaskOptions)
                : undefined,
            proofWikiOptions:
              manifest.actorType === "proofwiki"
                ? (toolArgs as unknown as ProofWikiActorTaskOptions)
                : undefined,
            leanMathlibOptions:
              manifest.actorType === "lean-mathlib"
                ? (toolArgs as unknown as LeanMathlibActorTaskOptions)
                : undefined,
            lessWrongOptions:
              manifest.actorType === "lesswrong"
                ? (toolArgs as unknown as LessWrongActorTaskOptions)
                : undefined,
            youtubeTranscriptsOptions:
              manifest.actorType === "youtube-transcripts"
                ? (toolArgs as unknown as YoutubeTranscriptsActorTaskOptions)
                : undefined,
            wikisourceOptions:
              manifest.actorType === "wikisource"
                ? (toolArgs as unknown as WikisourceActorTaskOptions)
                : undefined,
            wiktionaryOptions:
              manifest.actorType === "wiktionary"
                ? (toolArgs as unknown as WiktionaryActorTaskOptions)
                : undefined,
            wikiquoteOptions:
              manifest.actorType === "wikiquote"
                ? (toolArgs as unknown as WikiquoteActorTaskOptions)
                : undefined,
            wikibooksOptions:
              manifest.actorType === "wikibooks"
                ? (toolArgs as unknown as WikibooksActorTaskOptions)
                : undefined,
            wikiversityOptions:
              manifest.actorType === "wikiversity"
                ? (toolArgs as unknown as WikiversityActorTaskOptions)
                : undefined,
            wikivoyageOptions:
              manifest.actorType === "wikivoyage"
                ? (toolArgs as unknown as WikivoyageActorTaskOptions)
                : undefined,
            wikinewsOptions:
              manifest.actorType === "wikinews"
                ? (toolArgs as unknown as WikinewsActorTaskOptions)
                : undefined,
            wikispeciesOptions:
              manifest.actorType === "wikispecies"
                ? (toolArgs as unknown as WikispeciesActorTaskOptions)
                : undefined,
            wikidataOptions:
              manifest.actorType === "wikidata"
                ? (toolArgs as unknown as WikidataActorTaskOptions)
                : undefined,
            stanfordPhilOptions:
              manifest.actorType === "stanford-phil"
                ? (toolArgs as unknown as StanfordPhilActorTaskOptions)
                : undefined,
            internetPhilOptions:
              manifest.actorType === "internet-phil"
                ? (toolArgs as unknown as InternetPhilActorTaskOptions)
                : undefined,
            metamathOptions:
              manifest.actorType === "metamath"
                ? (toolArgs as unknown as MetamathActorTaskOptions)
                : undefined,
            philpapersOptions:
              manifest.actorType === "philpapers"
                ? (toolArgs as unknown as PhilPapersActorTaskOptions)
                : undefined,
            devdocsOptions:
              manifest.actorType === "devdocs"
                ? (toolArgs as unknown as DevDocsActorTaskOptions)
                : undefined,
            rosettaCodeOptions:
              manifest.actorType === "rosetta-code"
                ? (toolArgs as unknown as RosettaCodeActorTaskOptions)
                : undefined,
            papersWithCodeOptions:
              manifest.actorType === "papers-with-code"
                ? (toolArgs as unknown as PapersWithCodeActorTaskOptions)
                : undefined,
            libretextsOptions:
              manifest.actorType === "libretexts"
                ? (toolArgs as unknown as LibreTextsActorTaskOptions)
                : undefined,
            openTextbookOptions:
              manifest.actorType === "open-textbook"
                ? (toolArgs as unknown as OpenTextbookActorTaskOptions)
                : undefined,
            semanticScholarOptions:
              manifest.actorType === "semantic-scholar"
                ? (toolArgs as unknown as SemanticScholarActorTaskOptions)
                : undefined,
          },
        };

        try {
          const runResult = await actor.run(task, { task, startTime: Date.now() });
          if (runResult.status !== "completed") {
            return {
              jsonrpc: "2.0",
              id,
              result: {
                content: [
                  {
                    type: "text",
                    text: `[ERROR] Actor execution failed: ${runResult.errorMessage || "Unknown execution error"}`,
                  },
                ],
                isError: true,
              },
            };
          }

          const outputText =
            typeof runResult.data === "string"
              ? runResult.data
              : JSON.stringify(runResult.data, null, 2);

          return {
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: outputText,
                },
              ],
              isError: false,
            },
          };
        } catch (execErr) {
          const errorMsg = execErr instanceof Error ? execErr.message : String(execErr);
          return {
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: `[ERROR] Unexpected error during actor execution: ${errorMsg}`,
                },
              ],
              isError: true,
            },
          };
        }
      }

      case "resources/list": {
        const runs = globalRunRegistry.listRuns(50);
        const resources = [
          {
            uri: "quarantine://items",
            name: "Quarantined Vetoed Audit Items",
            description: "Audit trail of quarantined and vetoed datasets and shards",
            mimeType: "application/json",
          },
          ...runs.map((r) => ({
            uri: `run://${r.runId}`,
            name: `Execution Run ${r.runId} (${r.actorName})`,
            description: `Status: ${r.status}, startedAt: ${r.startedAt}`,
            mimeType: "application/json",
          })),
        ];

        return {
          jsonrpc: "2.0",
          id,
          result: {
            resources,
          },
        };
      }

      case "resources/read": {
        const uri = params?.uri as string | undefined;
        if (!uri || typeof uri !== "string") {
          return {
            jsonrpc: "2.0",
            id,
            error: {
              code: -32602,
              message: "Invalid params: Missing required 'uri' parameter.",
            },
          };
        }

        if (uri === "quarantine://items" || uri === "quarantine://") {
          const items = this.getQuarantineItems();
          return {
            jsonrpc: "2.0",
            id,
            result: {
              contents: [
                {
                  uri,
                  mimeType: "application/json",
                  text: JSON.stringify(items, null, 2),
                },
              ],
            },
          };
        }

        if (uri.startsWith("quarantine://")) {
          const target = uri.slice("quarantine://".length);
          const auditPath = join(POOL_ROOT, "quarantine_vetoed", target, "veto_audit.json");
          if (existsSync(auditPath)) {
            try {
              const content = readFileSync(auditPath, "utf8");
              return {
                jsonrpc: "2.0",
                id,
                result: {
                  contents: [
                    {
                      uri,
                      mimeType: "application/json",
                      text: content,
                    },
                  ],
                },
              };
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              return {
                jsonrpc: "2.0",
                id,
                error: {
                  code: -32603,
                  message: `Failed to read quarantine file: ${msg}`,
                },
              };
            }
          }
          return {
            jsonrpc: "2.0",
            id,
            error: {
              code: -32002,
              message: `Resource not found: '${uri}'`,
            },
          };
        }

        if (uri.startsWith("run://")) {
          const runId = uri.slice("run://".length);
          const run = globalRunRegistry.getRun(runId);
          if (!run) {
            return {
              jsonrpc: "2.0",
              id,
              error: {
                code: -32002,
                message: `Resource not found: No execution run with id '${runId}' found.`,
              },
            };
          }

          return {
            jsonrpc: "2.0",
            id,
            result: {
              contents: [
                {
                  uri,
                  mimeType: "application/json",
                  text: JSON.stringify(run, null, 2),
                },
              ],
            },
          };
        }

        return {
          jsonrpc: "2.0",
          id,
          error: {
            code: -32002,
            message: `Resource not found: Unsupported resource URI scheme '${uri}'`,
          },
        };
      }

      case "resources/subscribe":
      case "resources/unsubscribe": {
        return {
          jsonrpc: "2.0",
          id,
          result: {},
        };
      }

      default: {
        return {
          jsonrpc: "2.0",
          id,
          error: {
            code: -32601,
            message: `Method not found: ${method}`,
          },
        };
      }
    }
  }

  start(
    input: NodeJS.ReadableStream = process.stdin,
    output: NodeJS.WritableStream = process.stdout
  ) {
    this.rl = readline.createInterface({
      input,
      output,
      terminal: false,
    });

    this.rl.on("line", async (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      let parsed: JsonRpcRequest;
      try {
        parsed = JSON.parse(trimmed);
      } catch (_parseErr) {
        output.write(
          `${JSON.stringify({
            jsonrpc: "2.0",
            id: null,
            error: {
              code: -32700,
              message: "Parse error: Invalid JSON payload",
            },
          })}\n`
        );
        return;
      }

      const response = await this.processRequest(parsed);
      if (response !== null) {
        output.write(`${JSON.stringify(response)}\n`);
      }
    });

    return this;
  }

  private getQuarantineItems(): unknown[] {
    const quarantineDir = join(POOL_ROOT, "quarantine_vetoed");
    const items: unknown[] = [];
    if (existsSync(quarantineDir)) {
      try {
        const entries = readdirSync(quarantineDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const auditPath = join(quarantineDir, entry.name, "veto_audit.json");
            if (existsSync(auditPath)) {
              try {
                const audit = JSON.parse(readFileSync(auditPath, "utf8"));
                items.push(audit);
              } catch {
                // ignore corrupted audit file
              }
            }
          }
        }
      } catch {
        // ignore read error
      }
    }
    return items;
  }

  close() {
    this.scheduleBroker.stopAll();
    if (this.rl) {
      this.rl.close();
      this.rl = undefined;
    }
  }
}

// Direct execution entrypoint
const isMainModule =
  Boolean(process.argv[1]) &&
  (process.argv[1].endsWith("/protokol-mcp-server.ts") ||
    process.argv[1].endsWith("/protokol-mcp-server.js"));

if (isMainModule) {
  const server = new ProtokolMcpServer();
  server.start();
}
