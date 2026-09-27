/**
 * ClinicalTrialsActor - Clinical research study protocol and trial registry actor.
 * Interfaces with ClinicalTrials.gov API v2 (official NIH/NLM registry of 480k+ studies)
 * to harvest trial metadata, eligibility criteria, interventions, and outcomes.
 */

import type {
  ActorResult,
  ActorRunContext,
  ActorTask,
  ClinicalStudySummary,
  ClinicalTrialsActorResult,
  ClinicalTrialsActorTaskOptions,
  IActor,
} from "../api/types";
import { safeRedirectFetch } from "../network/safe-redirect-fetcher";
import { SSRFGuard } from "../network/ssrf-guard";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;
const CLINICAL_TRIALS_API_BASE = "https://clinicaltrials.gov/api/v2/studies";

interface RawStudyProtocol {
  protocolSection?: {
    identificationModule?: {
      nctId?: string;
      briefTitle?: string;
      officialTitle?: string;
      organization?: { fullName?: string };
    };
    statusModule?: {
      overallStatus?: string;
      startDateStruct?: { date?: string };
      completionDateStruct?: { date?: string };
    };
    sponsorCollaboratorsModule?: {
      leadSponsor?: { name?: string };
    };
    descriptionModule?: {
      briefSummary?: string;
      detailedDescription?: string;
    };
    conditionsModule?: {
      conditions?: string[];
    };
    designModule?: {
      studyType?: string;
      phases?: string[];
    };
    armsInterventionsModule?: {
      interventions?: Array<{
        type?: string;
        name?: string;
        description?: string;
      }>;
    };
    eligibilityModule?: {
      eligibilityCriteria?: string;
      healthyVolunteers?: boolean;
      sex?: string;
      minimumAge?: string;
      maximumAge?: string;
    };
    outcomesModule?: {
      primaryOutcomes?: Array<{
        measure?: string;
        description?: string;
        timeFrame?: string;
      }>;
    };
  };
}

interface RawClinicalTrialsResponse {
  studies?: RawStudyProtocol[];
  protocolSection?: RawStudyProtocol["protocolSection"];
  totalCount?: number;
  nextPageToken?: string;
}

export class ClinicalTrialsActor implements IActor<ClinicalTrialsActorResult> {
  readonly actorType = "clinical-trials" as const;
  readonly description =
    "Queries ClinicalTrials.gov API v2 for clinical trial protocols, eligibility criteria, and interventions.";

  async run(
    task: ActorTask,
    context: ActorRunContext
  ): Promise<ActorResult<ClinicalTrialsActorResult>> {
    const startTime = context?.startTime || Date.now();
    const options: ClinicalTrialsActorTaskOptions = task.options?.clinicalTrialsOptions || {};
    const timeoutMs = options.timeoutMs || task.options?.timeoutMs || DEFAULT_TIMEOUT_MS;
    const allowLocalNetwork = process.env.NODE_ENV === "test";

    try {
      if (
        task.targetUrl &&
        (task.targetUrl.startsWith("http://") || task.targetUrl.startsWith("https://"))
      ) {
        const initialSsrfCheck = await SSRFGuard.validateUrlWithDns(task.targetUrl, {
          allowLocalNetwork,
        });

        if (!initialSsrfCheck.valid) {
          return {
            taskId: task.taskId,
            actorType: this.actorType,
            status: "failed",
            statusCode: 403,
            errorMessage: `SSRF validation failed: ${initialSsrfCheck.reason}`,
            executionDurationMs: Date.now() - startTime,
          };
        }
      }

      const requestUrl = this.buildRequestUrl(task, options);

      const ssrfCheck = await SSRFGuard.validateUrlWithDns(requestUrl, {
        allowLocalNetwork,
      });

      if (!ssrfCheck.valid) {
        return {
          taskId: task.taskId,
          actorType: this.actorType,
          status: "failed",
          statusCode: 403,
          errorMessage: `SSRF validation failed: ${ssrfCheck.reason}`,
          executionDurationMs: Date.now() - startTime,
        };
      }

      const response = await safeRedirectFetch(requestUrl, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": "protokol-7/1.0.0 (ClinicalTrials Actor)",
        },
        timeoutMs,
        allowLocalNetwork,
      });

      if (!response.ok) {
        return {
          taskId: task.taskId,
          actorType: this.actorType,
          status: "failed",
          statusCode: response.status,
          errorMessage: `ClinicalTrials API returned HTTP ${response.status}: ${response.statusText}`,
          executionDurationMs: Date.now() - startTime,
        };
      }

      const rawJson = (await response.json()) as RawClinicalTrialsResponse;

      let rawStudies: RawStudyProtocol[] = [];
      let totalCount = 0;

      if (Array.isArray(rawJson.studies)) {
        rawStudies = rawJson.studies;
        totalCount = rawJson.totalCount || rawStudies.length;
      } else if (rawJson.protocolSection) {
        rawStudies = [{ protocolSection: rawJson.protocolSection }];
        totalCount = 1;
      }

      const studies: ClinicalStudySummary[] = rawStudies
        .map((s) => this.normalizeStudy(s))
        .filter((s): s is ClinicalStudySummary => Boolean(s.nctId));

      const markdown = this.synthesizeMarkdown(studies, totalCount);

      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "completed",
        statusCode: 200,
        data: {
          totalCount,
          nextPageToken: rawJson.nextPageToken,
          studies,
          queryUrl: requestUrl,
          markdown,
        },
        executionDurationMs: Date.now() - startTime,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "failed",
        statusCode: 500,
        errorMessage: `ClinicalTrialsActor execution failed: ${errorMsg}`,
        executionDurationMs: Date.now() - startTime,
      };
    }
  }

  private buildRequestUrl(task: ActorTask, options: ClinicalTrialsActorTaskOptions): string {
    const rawTarget = (task.targetUrl || "").trim();

    let baseUrl = CLINICAL_TRIALS_API_BASE;
    if (rawTarget.startsWith("http://") || rawTarget.startsWith("https://")) {
      baseUrl = rawTarget;
    }

    const nctMatch =
      (options.nctId || rawTarget).match(/\b(NCT\d{8})\b/i) ||
      (options.query || "").match(/\b(NCT\d{8})\b/i);

    if (nctMatch && !baseUrl.includes(nctMatch[1].toUpperCase())) {
      const nctId = nctMatch[1].toUpperCase();
      return baseUrl.endsWith("/studies")
        ? `${baseUrl}/${nctId}`
        : `${CLINICAL_TRIALS_API_BASE}/${nctId}`;
    }

    const url = new URL(baseUrl);
    const searchTerm = options.query || (!rawTarget.startsWith("http") ? rawTarget : "") || "";
    if (searchTerm) {
      url.searchParams.set("query.term", searchTerm);
    }

    if (options.condition) {
      url.searchParams.set("query.cond", options.condition);
    }

    if (options.intervention) {
      url.searchParams.set("query.intr", options.intervention);
    }

    if (options.status) {
      const statuses = Array.isArray(options.status) ? options.status.join("|") : options.status;
      url.searchParams.set("filter.overallStatus", statuses);
    }

    const pageSize = Math.min(Math.max(options.pageSize || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
    url.searchParams.set("pageSize", String(pageSize));

    if (options.pageToken) {
      url.searchParams.set("pageToken", options.pageToken);
    }

    return url.toString();
  }

  private normalizeStudy(raw: RawStudyProtocol): ClinicalStudySummary {
    const ps = raw.protocolSection || {};
    const idMod = ps.identificationModule || {};
    const statusMod = ps.statusModule || {};
    const sponsorMod = ps.sponsorCollaboratorsModule || {};
    const descMod = ps.descriptionModule || {};
    const condMod = ps.conditionsModule || {};
    const designMod = ps.designModule || {};
    const armsMod = ps.armsInterventionsModule || {};
    const eligMod = ps.eligibilityModule || {};

    const nctId = idMod.nctId || "";
    const briefTitle = idMod.briefTitle || "Untitled Study";

    const interventions = Array.isArray(armsMod.interventions)
      ? armsMod.interventions.map((i) => i.name).filter((name): name is string => Boolean(name))
      : undefined;

    return {
      nctId,
      briefTitle,
      officialTitle: idMod.officialTitle,
      leadSponsor: sponsorMod.leadSponsor?.name || idMod.organization?.fullName,
      overallStatus: statusMod.overallStatus,
      conditions: condMod.conditions,
      interventions,
      briefSummary: descMod.briefSummary,
      eligibilityCriteria: eligMod.eligibilityCriteria,
      phases: designMod.phases,
      studyType: designMod.studyType,
      startDate: statusMod.startDateStruct?.date,
      completionDate: statusMod.completionDateStruct?.date,
      studyUrl: `https://clinicaltrials.gov/study/${nctId}`,
    };
  }

  private synthesizeMarkdown(studies: ClinicalStudySummary[], totalCount: number): string {
    const lines: string[] = [];
    lines.push(`# Clinical Trials Registry Results`);
    lines.push(`Total Matching Studies: ${totalCount}`);
    lines.push(`Retrieved Studies: ${studies.length}`);
    lines.push("");

    for (const s of studies) {
      lines.push(`## [${s.nctId}] ${s.briefTitle}`);
      lines.push(`- **Status**: ${s.overallStatus || "Unknown"}`);
      if (s.leadSponsor) lines.push(`- **Sponsor**: ${s.leadSponsor}`);
      if (s.phases && s.phases.length > 0) lines.push(`- **Phases**: ${s.phases.join(", ")}`);
      if (s.studyType) lines.push(`- **Study Type**: ${s.studyType}`);
      if (s.conditions && s.conditions.length > 0)
        lines.push(`- **Conditions**: ${s.conditions.join(", ")}`);
      if (s.interventions && s.interventions.length > 0)
        lines.push(`- **Interventions**: ${s.interventions.join(", ")}`);
      if (s.startDate) lines.push(`- **Start Date**: ${s.startDate}`);
      lines.push(`- **Link**: ${s.studyUrl}`);
      lines.push("");

      if (s.briefSummary) {
        lines.push("### Summary");
        lines.push(s.briefSummary.trim());
        lines.push("");
      }

      if (s.eligibilityCriteria) {
        lines.push("### Eligibility Criteria");
        lines.push(s.eligibilityCriteria.trim());
        lines.push("");
      }

      lines.push("---");
      lines.push("");
    }

    return lines.join("\n").trim();
  }
}
