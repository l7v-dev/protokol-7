/**
 * Environment Variable Resolver for Connector Configuration.
 * Extracts and resolves ${ENV_VAR} tokens safely against the execution environment.
 */

import { PipelineError } from "../schema";

const ENV_VAR_REGEX = /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/;

/**
 * Resolves a single string if it represents an environment variable reference (${VAR_NAME}).
 * Throws PipelineError if the referenced environment variable is not defined or empty.
 */
export function resolveEnvString(value: string, env: NodeJS.ProcessEnv = process.env): string {
  const match = value.match(ENV_VAR_REGEX);
  if (!match) {
    return value;
  }

  const varName = match[1];
  const envVal = env[varName];

  if (envVal === undefined || envVal === "") {
    throw new PipelineError(
      `Required environment variable '${varName}' is not defined or is empty in the runtime environment.`,
      "MISSING_ENV_VAR",
      { varName }
    );
  }

  return envVal;
}

/**
 * Resolves all environment variable references within a connector configuration dictionary.
 */
export function resolveConnectorConfig<T extends Record<string, unknown>>(
  rawConfig: T,
  env: NodeJS.ProcessEnv = process.env
): T {
  const resolved: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(rawConfig)) {
    if (typeof value === "string") {
      resolved[key] = resolveEnvString(value, env);
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      resolved[key] = resolveConnectorConfig(value as Record<string, unknown>, env);
    } else {
      resolved[key] = value;
    }
  }

  return resolved as T;
}
