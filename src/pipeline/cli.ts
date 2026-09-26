#!/usr/bin/env node
/**
 * Command-line entrypoint for running pipeline configurations.
 * Usage: npm run pipeline -- --config pipeline.yaml
 */

import { resolve } from "node:path";
import { PipelineRunner } from "./pipeline-runner";

function parseArgs(args: string[]): { configPath?: string; showHelp: boolean } {
  let configPath: string | undefined;
  let showHelp = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--config" || arg === "-c") {
      configPath = args[i + 1];
      i++;
    } else if (arg === "--help" || arg === "-h") {
      showHelp = true;
    }
  }

  return { configPath, showHelp };
}

function printHelp(): void {
  console.log(`
Usage: npm run pipeline -- --config <path-to-yaml>

Options:
  -c, --config <path>   Path to the YAML pipeline configuration file (required)
  -h, --help            Show this help manual

Examples:
  npm run pipeline -- --config pipeline.yaml
  npm run pipeline -- -c examples/pipelines/wikimedia-tr.yaml
`);
}

async function main(): Promise<void> {
  const { configPath, showHelp } = parseArgs(process.argv.slice(2));

  if (showHelp) {
    printHelp();
    process.exit(0);
  }

  if (!configPath) {
    console.error("[ERROR] Missing required option: --config <path>");
    printHelp();
    process.exit(1);
  }

  const absoluteConfigPath = resolve(process.cwd(), configPath);
  const runner = new PipelineRunner();

  console.log(`[INFO] Executing pipeline configuration: ${absoluteConfigPath}`);
  const result = await runner.runFile(absoluteConfigPath);

  if (result.status === "succeeded") {
    console.log("[SUCCESS] Pipeline completed successfully.");
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  } else {
    console.error(`[FAILURE] Pipeline failed: ${result.error}`);
    console.error(JSON.stringify(result, null, 2));
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== "test") {
  main().catch((err) => {
    console.error("[FATAL] Uncaught error during pipeline CLI execution:", err);
    process.exit(1);
  });
}
