import assert from "node:assert/strict";
import * as http from "node:http";
import test from "node:test";
import { ClinicalTrialsActor } from "../src/actors/clinical-trials-actor";

(process.env as Record<string, string | undefined>).NODE_ENV = "test";

const MOCK_CLINICAL_TRIALS_SEARCH_JSON = {
  totalCount: 1,
  nextPageToken: "cursor-token-123",
  studies: [
    {
      protocolSection: {
        identificationModule: {
          nctId: "NCT04567890",
          briefTitle: "Phase 3 Trial of Pembrolizumab in Melanoma",
          officialTitle:
            "A Randomized Phase 3 Study Evaluating Pembrolizumab versus Placebo in Advanced Melanoma",
          organization: { fullName: "Merck Sharp & Dohme LLC" },
        },
        statusModule: {
          overallStatus: "RECRUITING",
          startDateStruct: { date: "2021-03-01" },
          completionDateStruct: { date: "2025-12-31" },
        },
        sponsorCollaboratorsModule: {
          leadSponsor: { name: "Merck Sharp & Dohme LLC" },
        },
        descriptionModule: {
          briefSummary:
            "The purpose of this study is to evaluate the safety and efficacy of pembrolizumab.",
          detailedDescription: "Detailed study protocol description goes here.",
        },
        conditionsModule: {
          conditions: ["Melanoma", "Skin Cancer"],
        },
        designModule: {
          studyType: "INTERVENTIONAL",
          phases: ["PHASE3"],
        },
        armsInterventionsModule: {
          interventions: [
            {
              type: "DRUG",
              name: "Pembrolizumab",
              description: "200 mg IV every 3 weeks",
            },
          ],
        },
        eligibilityModule: {
          eligibilityCriteria:
            "Inclusion Criteria:\n- Confirmed melanoma\nExclusion Criteria:\n- Active autoimmune disease",
          healthyVolunteers: false,
          sex: "ALL",
          minimumAge: "18 Years",
        },
        outcomesModule: {
          primaryOutcomes: [
            {
              measure: "Progression-Free Survival",
              description: "Assessed via RECIST 1.1",
              timeFrame: "Up to 24 months",
            },
          ],
        },
      },
    },
  ],
};

const MOCK_SINGLE_STUDY_JSON = {
  protocolSection: MOCK_CLINICAL_TRIALS_SEARCH_JSON.studies[0].protocolSection,
};

test("ClinicalTrialsActor searches and normalizes clinical study records", async () => {
  let interceptedQuery: string | null = null;
  let interceptedCond: string | null = null;
  let interceptedStatus: string | null = null;

  const server = http.createServer((req, res) => {
    const parsed = new URL(req.url || "", "http://127.0.0.1");
    interceptedQuery = parsed.searchParams.get("query.term");
    interceptedCond = parsed.searchParams.get("query.cond");
    interceptedStatus = parsed.searchParams.get("filter.overallStatus");

    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(MOCK_CLINICAL_TRIALS_SEARCH_JSON));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const targetUrl = `http://127.0.0.1:${port}/api/v2/studies`;

  try {
    const actor = new ClinicalTrialsActor();
    const result = await actor.run(
      {
        taskId: "test-ct-1",
        actorType: "clinical-trials",
        targetUrl,
        options: {
          clinicalTrialsOptions: {
            query: "pembrolizumab",
            condition: "melanoma",
            status: "RECRUITING",
            pageSize: 5,
          },
        },
      },
      {
        task: { taskId: "test-ct-1", actorType: "clinical-trials", targetUrl },
        startTime: Date.now(),
      }
    );

    assert.equal(result.status, "completed");
    assert.equal(result.statusCode, 200);
    assert.ok(result.data);
    assert.equal(result.data.totalCount, 1);
    assert.equal(result.data.nextPageToken, "cursor-token-123");
    assert.equal(result.data.studies.length, 1);

    const study = result.data.studies[0];
    assert.equal(study.nctId, "NCT04567890");
    assert.equal(study.briefTitle, "Phase 3 Trial of Pembrolizumab in Melanoma");
    assert.equal(study.overallStatus, "RECRUITING");
    assert.equal(study.leadSponsor, "Merck Sharp & Dohme LLC");
    assert.deepEqual(study.conditions, ["Melanoma", "Skin Cancer"]);
    assert.deepEqual(study.interventions, ["Pembrolizumab"]);
    assert.ok(study.briefSummary?.includes("evaluate the safety and efficacy"));
    assert.equal(interceptedQuery, "pembrolizumab");
    assert.equal(interceptedCond, "melanoma");
    assert.equal(interceptedStatus, "RECRUITING");
    assert.ok(result.data.markdown?.includes("# Clinical Trials Registry Results"));
    assert.ok(result.data.markdown?.includes("[NCT04567890]"));
  } finally {
    server.close();
  }
});

test("ClinicalTrialsActor handles direct single NCT study lookup", async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(MOCK_SINGLE_STUDY_JSON));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const targetUrl = `http://127.0.0.1:${port}/api/v2/studies/NCT04567890`;

  try {
    const actor = new ClinicalTrialsActor();
    const result = await actor.run(
      {
        taskId: "test-ct-2",
        actorType: "clinical-trials",
        targetUrl,
        options: {
          clinicalTrialsOptions: {
            nctId: "NCT04567890",
          },
        },
      },
      {
        task: { taskId: "test-ct-2", actorType: "clinical-trials", targetUrl },
        startTime: Date.now(),
      }
    );

    assert.equal(result.status, "completed");
    assert.equal(result.statusCode, 200);
    assert.ok(result.data);
    assert.equal(result.data.studies.length, 1);
    assert.equal(result.data.studies[0].nctId, "NCT04567890");
    assert.equal(result.data.studies[0].overallStatus, "RECRUITING");
  } finally {
    server.close();
  }
});

test("ClinicalTrialsActor blocks SSRF private addresses", async () => {
  const actor = new ClinicalTrialsActor();
  const prevEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";

  try {
    const result = await actor.run(
      {
        taskId: "test-ct-ssrf",
        actorType: "clinical-trials",
        targetUrl: "http://192.168.1.1/api/v2/studies",
      },
      {
        task: {
          taskId: "test-ct-ssrf",
          actorType: "clinical-trials",
          targetUrl: "http://192.168.1.1/api/v2/studies",
        },
        startTime: Date.now(),
      }
    );

    assert.equal(result.status, "failed");
    assert.equal(result.statusCode, 403);
    assert.ok(result.errorMessage?.includes("SSRF validation failed"));
  } finally {
    process.env.NODE_ENV = prevEnv;
  }
});
