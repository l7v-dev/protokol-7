import { createHash } from "node:crypto";
import { z } from "zod";
import type { ReleaseReview } from "./types";

const evidenceUri = z.string().url();
const reviewSchema = z
  .object({
    snapshotId: z.string().min(1),
    manifestSha256: z.string().regex(/^[0-9a-f]{64}$/),
    gates: z
      .object({
        schema: z.literal(true),
        quality: z.literal(true),
        privacy: z.literal(true),
        contamination: z.literal(true),
        rights: z.literal(true),
      })
      .strict(),
    evidence: z
      .object({
        schema: evidenceUri,
        quality: evidenceUri,
        privacy: evidenceUri,
        contamination: evidenceUri,
        rights: evidenceUri,
      })
      .strict(),
    reviewedBy: z.string().trim().min(1),
    reviewedAt: z.string().datetime({ offset: true }),
  })
  .strict();

/** Reviewers attest gate evidence; this boundary does not run quality or rights audits. */
export function validateReleaseReview(review: ReleaseReview, manifestJson: string): void {
  reviewSchema.parse(review);
  const createdAt = JSON.parse(manifestJson).createdAt;
  if (typeof createdAt === "string" && Date.parse(review.reviewedAt) < Date.parse(createdAt)) {
    throw new Error("Review predates the candidate snapshot.");
  }
  if (Date.parse(review.reviewedAt) > Date.now())
    throw new Error("Review timestamp is in the future.");
  if (createHash("sha256").update(manifestJson).digest("hex") !== review.manifestSha256) {
    throw new Error("Review does not match the immutable snapshot manifest.");
  }
}
