export type PiiStatus = "unchecked" | "clear" | "redacted" | "quarantined";
export type DocumentRightsStatus = "approved" | "unknown" | "blocked";
export type ReleaseState = "candidate" | "released" | "withdrawn";
export type ArtifactPathTier =
  | "raw"
  | "staging"
  | "parsed"
  | "normalized"
  | "curated"
  | "quarantine"
  | "datasets";
export type ManifestStatus = "success" | "partial" | "failed" | "aborted";
export type SourceVerificationLevel =
  | "not_checked"
  | "index_evidence"
  | "page_fetched"
  | "docs_inspected"
  | "sample_tested"
  | "downloaded";

export interface PipelineRunManifestRecord {
  manifestId: string;
  runId: string;
  parentRunId?: string;
  traceId: string;
  pipeline: string;
  startedAt: string;
  finishedAt?: string;
  status: ManifestStatus;
  agentId: string;
  agentVersion: string;
  skillId?: string;
  skillVersion?: string;
  skillSha256?: string;
  gitCommit?: string;
  dependencyLockSha256?: string;
  configSha256: string;
  countsJson: string;
  qualityJson: string;
  checkpointCommitted: boolean;
  errorsJson: string;
  createdAt: string;
}

export interface DocumentProvenanceRecord {
  documentId: string;
  canonicalizationVersion: string;
  language: string;
  piiStatus: PiiStatus;
  split: "train" | "validation" | "test" | "unassigned";
  rightsLicense?: string;
  rightsEvidenceUri?: string;
  rightsReviewedAt?: string;
  rightsAllowedPurposes?: string;
  rightsStatus: DocumentRightsStatus;
  createdAt: string;
}

export interface DocumentOccurrenceRecord {
  occurrenceId?: number;
  documentId: string;
  sourceId: string;
  sourceRecordId: string;
  sourceUri: string;
  acquiredAt: string;
  rawArtifactId: string;
}

export interface DatasetReleaseGateRecord {
  gateId: string;
  snapshotId: string;
  schemaGate: boolean;
  qualityGate: boolean;
  privacyGate: boolean;
  contaminationGate: boolean;
  rightsGate: boolean;
  releaseState: ReleaseState;
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
}

export interface SourceVerificationEvidenceRecord {
  evidenceId?: number;
  sourceId: string;
  verificationLevel: SourceVerificationLevel;
  uri: string;
  checkedAt: string;
  finding: string;
}
