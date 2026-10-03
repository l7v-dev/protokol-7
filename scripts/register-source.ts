/**
 * Control Plane Source Onboarding and Job Enqueue CLI — protokol-7
 *
 * Validates source descriptors against JSON Schema, registers the source
 * into the SQLite control plane ledger, and optionally enqueues partitioned harvest jobs.
 * Conforms to RFC 03 (Workers, Transaction and Control Plane) and RFC 13 (Source Onboarding Protocol).
 */

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { SqliteLedgerRepository } from "../src/storage/ledger/sqlite-ledger-repository.js";
import { badge, banner, divider, panel } from "../src/utils/terminal-theme.js";

interface CliOptions {
  sourcePath: string;
  dbPath: string;
  enqueuePartitions: boolean;
  startYear: number;
  endYear: number;
}

function parseCliArgs(args: string[]): CliOptions {
  let sourcePath = "contracts/source-descriptors/dergipark.json";
  let dbPath = process.env.LEDGER_DB_PATH || "data/catalogs/control_plane.sqlite";
  let enqueuePartitions = false;
  let startYear = 1970;
  let endYear = new Date().getFullYear();

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--source" && args[i + 1]) {
      sourcePath = args[++i];
    } else if (arg === "--db-path" && args[i + 1]) {
      dbPath = args[++i];
    } else if (arg === "--enqueue-partitions") {
      enqueuePartitions = true;
    } else if (arg === "--start-year" && args[i + 1]) {
      startYear = parseInt(args[++i], 10);
    } else if (arg === "--end-year" && args[i + 1]) {
      endYear = parseInt(args[++i], 10);
    }
  }

  return { sourcePath, dbPath, enqueuePartitions, startYear, endYear };
}

function validateSchema(descriptor: Record<string, unknown>, schemaPath: string): void {
  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
  const required = schema.required as string[];
  for (const field of required) {
    if (descriptor[field] === undefined) {
      throw new Error(`Descriptor missing required schema field: '${field}'`);
    }
  }
}

async function main(): Promise<void> {
  const options = parseCliArgs(process.argv.slice(2));

  console.log(banner("SOURCE ONBOARDING & JOB ENQUEUE", "RFC 03 & RFC 13 CONTROL PLANE"));

  const fullSourcePath = path.resolve(options.sourcePath);
  if (!fs.existsSync(fullSourcePath)) {
    console.error(badge("ERROR", `Source descriptor not found at: ${fullSourcePath}`));
    process.exit(1);
  }

  const descriptorRaw = fs.readFileSync(fullSourcePath, "utf-8");
  const descriptor = JSON.parse(descriptorRaw);

  const schemaPath = path.resolve("contracts/source-descriptor.schema.json");
  validateSchema(descriptor, schemaPath);

  console.log(
    panel("SOURCE DESCRIPTOR METADATA", [
      ["Source ID", String(descriptor.source_id)],
      ["Name", String(descriptor.name)],
      ["Method", String(descriptor.method)],
      ["Record Type", String(descriptor.record_type)],
      ["Rights Status", String(descriptor.rights_status)],
      ["Database", path.resolve(options.dbPath)],
    ])
  );
  console.log(divider());

  const ledger = new SqliteLedgerRepository({ dbPath: options.dbPath });

  await ledger.createSource({
    id: descriptor.source_id,
    name: descriptor.name,
    descriptor,
    enabled: true,
  });

  console.log(
    badge("OK", `Source '${descriptor.source_id}' registered successfully in control plane ledger.`)
  );

  if (options.enqueuePartitions && descriptor.source_id === "dergipark") {
    console.log(
      badge(
        "INFO",
        `Generating auto-partitions for DergiPark (${options.startYear}..${options.endYear})...`
      )
    );

    const pyCmd = `.venv/bin/python -c "
import json
from pipelines.api_stream.dergipark.partitioner import DergiParkPartitioner
parts = DergiParkPartitioner.generate_date_partitions(${options.startYear}, ${options.endYear}, 'auto')
print(json.dumps(parts))
"`;

    let partitionsJson = "[]";
    try {
      partitionsJson = execSync(pyCmd, { encoding: "utf-8" }).trim();
    } catch (e) {
      console.error(badge("ERROR", `Failed to generate partitions via Python: ${e}`));
      process.exit(1);
    }

    const partitions = JSON.parse(partitionsJson) as Array<{
      partition_id: string;
      from_date: string;
      until_date: string;
      label: string;
    }>;

    console.log(badge("INFO", `Enqueueing ${partitions.length} date partition harvest jobs...`));

    let enqueued = 0;
    for (const part of partitions) {
      const idempotencyKey = `job_dergipark_harvest_${part.partition_id}`;
      try {
        await ledger.createJob({
          operation: "dergipark_harvest",
          idempotencyKey,
          input: {
            partitionId: part.partition_id,
            fromDate: part.from_date,
            untilDate: part.until_date,
            label: part.label,
          },
          maxAttempts: 5,
        });
        enqueued++;
      } catch (err: unknown) {
        console.error(
          badge(
            "ERROR",
            `Failed to register job for ${part.partition_id}: ${err instanceof Error ? err.message : String(err)}`
          )
        );
      }
    }

    console.log(badge("OK", `Enqueued ${enqueued} harvest jobs in control plane ledger.`));
  }

  ledger.close();
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(badge("ERROR", `Fatal error during source onboarding: ${msg}`));
  process.exit(1);
});
