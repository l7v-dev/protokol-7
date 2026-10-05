import { z } from "zod";

export const PiiStatusSchema = z.enum(["unchecked", "clear", "redacted", "quarantined"]);

/** Missing status remains unchecked; serialization never performs or implies a PII audit. */
export function withPiiStatus(records: unknown[]): Record<string, unknown>[] {
  return records.map((record) => {
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      throw new Error("Parquet records must be objects.");
    }
    const fields = record as Record<string, unknown>;
    return {
      ...fields,
      pii_status: PiiStatusSchema.parse(
        fields.pii_status === undefined ? "unchecked" : fields.pii_status
      ),
    };
  });
}
