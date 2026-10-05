import { z } from "zod";

export const SEVERITY_NUMBERS = { DEBUG: 5, INFO: 9, WARN: 13, ERROR: 17 } as const;
export type LogSeverity = keyof typeof SEVERITY_NUMBERS;

export const LogEventSchema = z
  .object({
    schema_version: z.literal("log-event.v1"),
    timestamp: z.string().datetime({ offset: true }),
    observed_timestamp: z.string().datetime({ offset: true }),
    event_name: z.string().min(1),
    severity_text: z.enum(["DEBUG", "INFO", "WARN", "ERROR"]),
    severity_number: z.union([z.literal(5), z.literal(9), z.literal(13), z.literal(17)]),
    body: z.string().min(1),
    trace_id: z.string().regex(/^(?!0{32}$)[0-9a-f]{32}$/),
    span_id: z.string().regex(/^(?!0{16}$)[0-9a-f]{16}$/),
    service_name: z.string().min(1),
    service_version: z.string().min(1),
    deployment_env: z.string().min(1),
    content_capture: z.literal(false),
    blueprint_run_id: z
      .string()
      .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
      .optional(),
    blueprint_agent_id: z.string().min(1).optional(),
    blueprint_skill_id: z.string().min(1).optional(),
    blueprint_status: z.enum(["success", "partial", "failed", "aborted"]).optional(),
    blueprint_duration_ms: z.number().int().nonnegative().optional(),
  })
  .strict()
  .refine((event) => event.severity_number === SEVERITY_NUMBERS[event.severity_text], {
    message: "Log severity fields do not match.",
  });

export type LogEvent = z.infer<typeof LogEventSchema>;
export const MetadataLogEventSchema = LogEventSchema.refine(
  (event) => {
    const identifier = /^[a-zA-Z0-9][a-zA-Z0-9_.+-]{0,127}$/;
    return (
      /^[a-zA-Z][a-zA-Z0-9_.-]{0,127}$/.test(event.event_name) &&
      event.body === event.event_name &&
      [
        event.service_name,
        event.service_version,
        event.deployment_env,
        event.blueprint_agent_id,
        event.blueprint_skill_id,
      ].every((value) => value === undefined || identifier.test(value))
    );
  },
  { message: "Only metadata identifiers may be persisted in logs." }
);

export interface StoredLogEvent extends LogEvent {
  event_id: number;
}
