/**
 * Actor Resolver for pipeline orchestration.
 * Validates actor existence in the store catalog and verifies required configuration inputs.
 */

import { ACTOR_MANIFESTS, type ActorManifest } from "../actors/actor-manifests";
import type { ActorType } from "../core/types";
import { PipelineError } from "./schema";

export interface ResolvedActor {
  manifest: ActorManifest;
  actorType: ActorType;
  actorId: string;
}

export class ActorResolver {
  private readonly manifests: Record<string, ActorManifest>;

  constructor(customManifests?: Record<string, ActorManifest>) {
    this.manifests = customManifests || ACTOR_MANIFESTS;
  }

  /**
   * Resolves actor by ID, verifying existence and checking input schema requirements.
   */
  resolve(actorId: string, inputConfig: Record<string, unknown> = {}): ResolvedActor {
    const manifest = this.manifests[actorId];
    if (!manifest) {
      const available = Object.keys(this.manifests).sort().join(", ");
      throw new PipelineError(
        `Actor not registered in catalog: '${actorId}'. Available actors: ${available}`,
        "ACTOR_NOT_FOUND",
        { actorId, availableCount: Object.keys(this.manifests).length }
      );
    }

    const requiredFields = manifest.inputSchema.required || [];
    for (const field of requiredFields) {
      const val = inputConfig[field];
      if (val === undefined || val === null || val === "") {
        throw new PipelineError(
          `Missing required configuration parameter '${field}' for actor '${actorId}'.`,
          "MISSING_REQUIRED_CONFIG",
          { actorId, field, requiredFields }
        );
      }
    }

    return {
      manifest,
      actorType: manifest.actorType,
      actorId,
    };
  }

  has(actorId: string): boolean {
    return Boolean(this.manifests[actorId]);
  }

  listAvailableActors(): string[] {
    return Object.keys(this.manifests).sort();
  }
}
