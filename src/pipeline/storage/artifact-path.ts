import type { ArtifactPathTier } from "../../../contracts/provenance";

/** Object-store keys begin with their processing tier; opaque Drive IDs retain explicit metadata. */
export function buildArtifactPrefix(tier: ArtifactPathTier, relativePath: string): string {
  if (
    !["raw", "staging", "parsed", "normalized", "curated", "quarantine", "datasets"].includes(tier)
  ) {
    throw new Error("Invalid artifact path tier.");
  }
  const segments = relativePath.split("/");
  if (
    segments.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        segment.includes("\\") ||
        [...segment].some((char) => char.charCodeAt(0) < 32)
    )
  ) {
    throw new Error("Artifact path must contain relative, non-traversing segments.");
  }
  return `${tier}/${relativePath}`;
}
