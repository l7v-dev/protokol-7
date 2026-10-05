import { z } from "zod";

const sha256 = z.string().regex(/^[0-9a-f]{64}$/);
export const DecontaminationConfigSchema = z
  .object({
    enabled: z.boolean().default(true),
    canonicalization_version: z.string().min(1),
    evaluation_snapshot_ids: z.array(z.string().min(1)).min(1),
    evaluation_hashes: z.array(sha256),
  })
  .strict();
export type DecontaminationConfig = z.infer<typeof DecontaminationConfigSchema>;

export interface DecontaminationReport {
  algorithm: "exact-sha256";
  canonicalizationVersion: string;
  evaluationSnapshotIds: string[];
  trainCount: number;
  overlapCount: number;
  remainingOverlapCount: number;
}

/** A frozen evaluation index is compared only with explicitly labelled train records. */
export class DecontaminateFilter {
  private readonly config: DecontaminationConfig;
  private readonly evaluationHashes: Set<string>;

  constructor(config: DecontaminationConfig) {
    this.config = DecontaminationConfigSchema.parse(config);
    this.evaluationHashes = new Set(this.config.evaluation_hashes);
  }

  partition<T extends Record<string, unknown>>(records: T[]) {
    const retained: T[] = [];
    const quarantined: T[] = [];
    let trainCount = 0;
    for (const record of records) {
      if (record.split === "validation" || record.split === "test") {
        retained.push(record);
        continue;
      }
      if (record.split !== "train")
        throw new Error("Decontamination requires an explicit train/evaluation split.");
      if (record.canonicalization_version !== this.config.canonicalization_version) {
        throw new Error("Canonicalization versions do not match the frozen evaluation index.");
      }
      const hash = sha256.parse(record.normalized_sha256 ?? record.document_id);
      trainCount++;
      if (this.evaluationHashes.has(hash))
        quarantined.push({ ...record, contamination_status: "exact_overlap" });
      else retained.push({ ...record, contamination_status: "no_exact_overlap" });
    }
    const report: DecontaminationReport = {
      algorithm: "exact-sha256",
      canonicalizationVersion: this.config.canonicalization_version,
      evaluationSnapshotIds: [...this.config.evaluation_snapshot_ids],
      trainCount,
      overlapCount: quarantined.length,
      remainingOverlapCount: retained.filter(
        (record) =>
          record.split === "train" &&
          this.evaluationHashes.has(String(record.normalized_sha256 ?? record.document_id))
      ).length,
    };
    return { retained, quarantined, report };
  }
}
