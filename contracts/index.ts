/**
 * Core System Contracts — protokol-7
 *
 * Defines canonical data contracts, storage interfaces, and schema references
 * compliant with Protokol-7 Developer Package V3 specification.
 */

import type { SourceVerificationLevel } from "./provenance.js";

export * from "./ledger.js";
export * from "./provenance.js";
export * from "./storage.js";

export interface SourceDescriptorBudget {
  max_requests: number;
  max_bytes: number;
  max_seconds: number;
}

export interface SourceDescriptorPagination {
  mode: "none" | "page" | "offset" | "cursor" | "resumption_token" | "watermark";
  checkpoint_after_durable_commit: true;
}

export type IngestionMethod =
  | "bulk"
  | "rest"
  | "graphql"
  | "oai_pmh"
  | "feed"
  | "http"
  | "browser"
  | "file"
  | "database"
  | "cdc"
  | "stream"
  | "semantic"
  | "geo"
  | "repository"
  | "media"
  | "partner";

export interface SourceVerificationEvidence {
  verification_level: SourceVerificationLevel;
  uri: string;
  checked_at: string;
  finding: string;
}

export interface SourceStreamDescriptor {
  name: string;
  record_type: string;
  primary_key: string[];
  cursor_field?: string;
  schema_uri?: string;
}

/** Declarative policy; runtime enforcement is a separate middleware concern. */
export interface SourceAgentPermissions {
  read: string[];
  write: string[];
  delete: boolean;
  shell: boolean;
}

export interface SourceDescriptor {
  source_id: string;
  name: string;
  method: IngestionMethod;
  adapter_version: string;
  record_type: string;
  external_id_field: string;
  pagination: SourceDescriptorPagination;
  budget: SourceDescriptorBudget;
  purpose: string;
  rights_status: "approved" | "pending" | "denied";
  retention_policy_id: string;
  verification_level?: SourceVerificationLevel;
  evidence?: SourceVerificationEvidence[];
  streams?: SourceStreamDescriptor[];
  agent_permissions?: SourceAgentPermissions;
}

export interface JobNotification {
  schema_version: 1;
  event_id: string;
  job_id: string;
  operation: "download" | "extract" | "ocr" | "normalize" | "publish" | "embed" | "export";
  trace_id: string;
}
