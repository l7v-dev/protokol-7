#!/usr/bin/env node
/**
 * Command-line entrypoint for running pipeline configurations.
 * Usage: npm run pipeline -- --config pipeline.yaml [--schedule]
 */

import { resolve } from "node:path";
import { PipelineRunner } from "./pipeline-runner";
import { loadPipelineConfigFile } from "./schema";

function parseArgs(args: string[]): {
  configPath?: string;
  schedule: boolean;
  showHelp: boolean;
} {
  let configPath: string | undefined;
  let schedule = false;
  let showHelp = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--config" || arg === "-c") {
      configPath = args[i + 1];
      i++;
    } else if (arg === "--schedule" || arg === "-s") {
      schedule = true;
    } else if (arg === "--help" || arg === "-h") {
      showHelp = true;
    }
  }

  return { configPath, schedule, showHelp };
}

function printHelp(): void {
  console.log(`
Usage: npm run pipeline -- --config <path-to-yaml> [options]

Options:
  -c, --config <path>   Path to the YAML pipeline configuration file (required)
  -s, --schedule        Run in scheduled daemon mode using the cron expression from YAML
  -h, --help            Show this help manual

Examples:
  npm run pipeline -- --config pipeline.yaml
  npm run pipeline -- -c examples/pipelines/wikimedia-sample.yaml --schedule
`);
}

async function main(): Promise<void> {
  const { configPath, schedule, showHelp } = parseArgs(process.argv.slice(2));

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

  if (schedule) {
    console.log(`[INFO] Initializing scheduled pipeline daemon for: ${absoluteConfigPath}`);
    const config = loadPipelineConfigFile(absoluteConfigPath);

    if (config.schedule?.type !== "cron" || !config.schedule.expression) {
      console.error(
        "[ERROR] Scheduled execution requires schedule.type='cron' and a valid 'expression' in the YAML configuration."
      );
      process.exit(1);
    }

    const job = runner.scheduleConfig(config);
    console.log(
      `[SCHEDULED] Pipeline '${config.name}' active with cron: ${config.schedule.expression}`
    );
    console.log("[INFO] Press Ctrl+C to terminate scheduler daemon.");

    const shutdown = () => {
      console.log("[INFO] Shutting down scheduler daemon...");
      job.stop();
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
    return;
  }

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
