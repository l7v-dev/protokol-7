import { type LogEvent, MetadataLogEventSchema } from "./log-event";

export class OtlpRejectedBatchError extends Error {}

async function acknowledgement(
  response: Response
): Promise<{ partialSuccess?: { rejectedLogRecords?: string | number } }> {
  if (!response.body) throw new OtlpRejectedBatchError("Missing collector acknowledgement.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 65536)
        throw new OtlpRejectedBatchError("Collector acknowledgement exceeds 64 KiB.");
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    if (error instanceof OtlpRejectedBatchError) throw error;
    throw new OtlpRejectedBatchError("Invalid collector acknowledgement.");
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}

function attribute(key: string, value: string | number) {
  return {
    key,
    value: typeof value === "number" ? { intValue: String(value) } : { stringValue: value },
  };
}

export function otlpLogs(events: LogEvent[]) {
  return {
    resourceLogs: events.map((input) => {
      const event = MetadataLogEventSchema.parse(input);
      return {
        resource: {
          attributes: [
            attribute("service.name", event.service_name),
            attribute("service.version", event.service_version),
            attribute("deployment.environment.name", event.deployment_env),
          ],
        },
        scopeLogs: [
          {
            scope: { name: "protokol-7.metadata" },
            logRecords: [
              {
                timeUnixNano: String(BigInt(Date.parse(event.timestamp)) * 1_000_000n),
                observedTimeUnixNano: String(
                  BigInt(Date.parse(event.observed_timestamp)) * 1_000_000n
                ),
                severityNumber: event.severity_number,
                severityText: event.severity_text,
                body: { stringValue: event.body },
                traceId: event.trace_id,
                spanId: event.span_id,
                attributes: Object.entries(event)
                  .filter(([key, value]) => key.startsWith("blueprint_") && value !== undefined)
                  .map(([key, value]) =>
                    attribute(key.replaceAll("_", "."), value as string | number)
                  ),
              },
            ],
          },
        ],
      };
    }),
  };
}

/** Local collector transport; failed or partial acknowledgements never advance a durable cursor. */
export async function exportOtlpLogs(
  events: LogEvent[],
  endpoint = "http://127.0.0.1:4318/v1/logs"
) {
  const url = new URL(endpoint);
  if (
    url.protocol !== "http:" ||
    url.hostname !== "127.0.0.1" ||
    url.pathname !== "/v1/logs" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error("OTLP endpoint must be a local collector logs URL.");
  if (events.length > 100) throw new Error("OTLP batch exceeds 100 records.");
  if (!events.length) return;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(otlpLogs(events)),
    redirect: "error",
    signal: AbortSignal.timeout(2000),
  });
  if (response.status !== 200) {
    await response.body?.cancel();
    if ([429, 502, 503, 504].includes(response.status))
      throw new Error("Collector did not accept the log batch.");
    throw new OtlpRejectedBatchError("Collector rejected the log batch without retry.");
  }
  const result = await acknowledgement(response);
  if (!result || typeof result !== "object" || Array.isArray(result))
    throw new OtlpRejectedBatchError("Invalid collector acknowledgement.");
  const partial = result.partialSuccess;
  if (partial !== undefined && (!partial || typeof partial !== "object" || Array.isArray(partial)))
    throw new OtlpRejectedBatchError("Invalid collector acknowledgement.");
  const rejected = partial?.rejectedLogRecords ?? 0;
  if (
    !/^(0|[1-9][0-9]*)$/.test(String(rejected)) ||
    (typeof rejected !== "number" && typeof rejected !== "string")
  )
    throw new OtlpRejectedBatchError("Invalid collector acknowledgement.");
  if (BigInt(rejected) !== 0n) throw new OtlpRejectedBatchError("Collector rejected log records.");
}
