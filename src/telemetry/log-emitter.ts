import { randomBytes } from "node:crypto";
import type { ManifestStatus } from "../../contracts/provenance";
import { getDefaultRegistryDatabase, type RegistryDatabase } from "../api/registry-database";
import {
  type LogEvent,
  type LogSeverity,
  MetadataLogEventSchema,
  SEVERITY_NUMBERS,
} from "./log-event";

export interface LogEventInput {
  eventName: string;
  severity: LogSeverity;
  traceId?: string;
  spanId?: string;
  runId?: string;
  agentId?: string;
  skillId?: string;
  status?: ManifestStatus;
  durationMs?: number;
}

export interface LogEmitterOptions {
  db?: RegistryDatabase;
  serviceName?: string;
  serviceVersion?: string;
  deploymentEnv?: string;
}

export class LogEmitter {
  constructor(private readonly options: LogEmitterOptions = {}) {}

  emit(input: LogEventInput): LogEvent {
    if (!/^[a-zA-Z][a-zA-Z0-9_.-]{0,127}$/.test(input.eventName)) {
      throw new Error("Log event name must be a metadata identifier.");
    }
    const timestamp = new Date().toISOString();
    // Content-bearing body, URL and metadata inputs are deliberately absent.
    const fields: Record<string, unknown> = {
      schema_version: "log-event.v1",
      timestamp,
      observed_timestamp: timestamp,
      event_name: input.eventName,
      severity_text: input.severity,
      severity_number: SEVERITY_NUMBERS[input.severity],
      body: input.eventName,
      trace_id: input.traceId ?? randomBytes(16).toString("hex"),
      span_id: input.spanId ?? randomBytes(8).toString("hex"),
      service_name: this.options.serviceName ?? "protokol-7",
      service_version:
        this.options.serviceVersion ?? process.env.npm_package_version ?? "unversioned",
      deployment_env: this.options.deploymentEnv ?? process.env.NODE_ENV ?? "development",
      content_capture: false,
      blueprint_run_id: input.runId,
      blueprint_agent_id: input.agentId,
      blueprint_skill_id: input.skillId,
      blueprint_status: input.status,
      blueprint_duration_ms: input.durationMs,
    };
    for (const key of Object.keys(fields)) {
      if (fields[key] === undefined) {
        delete fields[key];
      }
    }
    const event = MetadataLogEventSchema.parse(fields);
    (this.options.db ?? getDefaultRegistryDatabase()).recordOtelLogEvent(event);
    return event;
  }
}
