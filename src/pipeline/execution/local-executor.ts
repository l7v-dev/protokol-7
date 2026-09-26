/**
 * Local Execution Target for pipeline runner.
 * Dispatches tasks directly to local actor registry instances.
 */

import { ACTOR_MANIFESTS } from "../../actors/actor-manifests";
import { type ActorRegistry, createDefaultActorRegistry } from "../../actors/actor-registry";
import type { ActorRunContext, ActorTask } from "../../core/types";
import { PipelineError } from "../schema";
import type { ExecutionResult, ExecutionTarget } from "./index";

export type CustomActorRunner = (
  actorId: string,
  config: Record<string, unknown>
) => Promise<unknown>;

export class LocalExecutor implements ExecutionTarget {
  readonly name = "local";
  private readonly registry: ActorRegistry;
  private readonly customRunner?: CustomActorRunner;

  constructor(options?: { registry?: ActorRegistry; customRunner?: CustomActorRunner }) {
    this.registry = options?.registry || createDefaultActorRegistry();
    this.customRunner = options?.customRunner;
  }

  async run(actorId: string, config: Record<string, unknown>): Promise<ExecutionResult> {
    const startTime = Date.now();

    if (this.customRunner) {
      try {
        const rawOutput = await this.customRunner(actorId, config);
        const items = this.normalizeItems(rawOutput);
        return {
          success: true,
          items,
          itemCount: items.length,
          durationMs: Date.now() - startTime,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          items: [],
          itemCount: 0,
          durationMs: Date.now() - startTime,
          error: message,
        };
      }
    }

    const manifest = ACTOR_MANIFESTS[actorId];
    if (!manifest) {
      throw new PipelineError(
        `Manifest not found for actor '${actorId}' in local executor`,
        "ACTOR_MANIFEST_NOT_FOUND"
      );
    }

    const actor = this.registry.get(manifest.actorType);
    if (!actor) {
      throw new PipelineError(
        `Actor instance not found in registry for actor type '${manifest.actorType}'`,
        "ACTOR_INSTANCE_NOT_FOUND"
      );
    }

    const taskId = `pipeline-run-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const task: ActorTask = {
      taskId,
      actorType: manifest.actorType,
      targetUrl: typeof config.targetUrl === "string" ? config.targetUrl : "",
      selectors: config.selectors as Record<string, string> | undefined,
      options: {
        timeoutMs: typeof config.timeoutMs === "number" ? config.timeoutMs : 30000,
        waitForSelector:
          typeof config.waitForSelector === "string" ? config.waitForSelector : undefined,
        captureScreenshot: Boolean(config.captureScreenshot),
        blockAssets: config.blockAssets !== false,
        extractTables: config.extractTables !== false,
        extractJsonLd: config.extractJsonLd !== false,
        crawlerOptions: config.crawlerOptions as object | undefined,
        pdfOptions: config.pdfOptions as object | undefined,
        serpOptions: (config.serpOptions ||
          (config.query ? { query: config.query, maxResults: config.maxResults } : undefined)) as
          | object
          | undefined,
        arxivOptions: (config.arxivOptions ||
          (config.searchQuery || config.idList ? config : undefined)) as object | undefined,
        wikimediaOptions: (config.wikimediaOptions ||
          (config.title || config.lang || config.action || config.query ? config : undefined)) as
          | object
          | undefined,
        openalexOptions: (config.openalexOptions ||
          (config.searchQuery || config.doi ? config : undefined)) as object | undefined,
        stackExchangeOptions: (config.stackExchangeOptions ||
          (config.query || config.site ? config : undefined)) as object | undefined,
        gutenbergOptions: (config.gutenbergOptions ||
          (config.searchQuery || config.bookId ? config : undefined)) as object | undefined,
        europePmcOptions: (config.europePmcOptions || (config.query ? config : undefined)) as
          | object
          | undefined,
        ietfRfcOptions: (config.ietfRfcOptions ||
          (config.rfcNumber || config.query ? config : undefined)) as object | undefined,
        saglikEkutuphaneOptions: config.saglikEkutuphaneOptions as object | undefined,
        ktbEkitapOptions: config.ktbEkitapOptions as object | undefined,
      },
    };

    const context: ActorRunContext = {
      task,
      startTime: Date.now(),
    };

    try {
      const actorResult = await actor.run(task, context);
      if (actorResult.status === "failed") {
        return {
          success: false,
          items: [],
          itemCount: 0,
          durationMs: Date.now() - startTime,
          error: actorResult.errorMessage || "Actor execution failed",
        };
      }

      const rawOutput = actorResult.data !== undefined ? actorResult.data : actorResult;
      const items = this.normalizeItems(rawOutput);
      return {
        success: true,
        items,
        itemCount: items.length,
        durationMs: Date.now() - startTime,
        metadata: {
          taskId,
          actorType: manifest.actorType,
          statusCode: actorResult.statusCode,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        items: [],
        itemCount: 0,
        durationMs: Date.now() - startTime,
        error: message,
      };
    }
  }

  private normalizeItems(rawOutput: unknown): unknown[] {
    if (Array.isArray(rawOutput)) {
      return rawOutput;
    }
    if (rawOutput && typeof rawOutput === "object") {
      const obj = rawOutput as Record<string, unknown>;
      if (Array.isArray(obj.items)) {
        return obj.items;
      }
      if (Array.isArray(obj.results)) {
        return obj.results;
      }
      if (Array.isArray(obj.articles)) {
        return obj.articles;
      }
      if (Array.isArray(obj.questions)) {
        return obj.questions;
      }
      return [obj];
    }
    if (rawOutput !== undefined && rawOutput !== null) {
      return [rawOutput];
    }
    return [];
  }
}
