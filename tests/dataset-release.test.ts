import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";
import { RegistryDatabase } from "../src/api/registry-database";
import { DatasetPublisher } from "../src/dataset/dataset-publisher";
import type { ReleaseReview } from "../src/dataset/types";
import { TextNormalizer } from "../src/pipeline/processors/text-normalizer";
import { buildArtifactPrefix } from "../src/pipeline/storage/artifact-path";

async function fixture(
  test: (
    db: RegistryDatabase,
    publisher: DatasetPublisher,
    dir: string,
    snapshotId: string
  ) => void | Promise<void>
) {
  const dir = mkdtempSync(join(tmpdir(), "dataset-release-"));
  const db = new RegistryDatabase({ dbPath: join(dir, "catalog.sqlite") });
  const publisher = new DatasetPublisher({
    registryDb: db,
    defaultOutputDir: join(dir, "snapshots"),
  });
  try {
    const shard = join(dir, "shard.parquet");
    writeFileSync(shard, "fixture shard");
    const result = await publisher.publishSnapshot({
      datasetName: "review_corpus",
      version: "1.0.0",
      filePaths: [shard],
      runId: "11111111-1111-4111-8111-111111111111",
      traceId: "a".repeat(32),
      gitCommit: "b".repeat(40),
    });
    await test(db, publisher, dir, result.snapshotId);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

function review(db: RegistryDatabase, snapshotId: string): ReleaseReview {
  return {
    snapshotId,
    manifestSha256: db.getSnapshotManifestHash(snapshotId)!,
    gates: { schema: true, quality: true, privacy: true, contamination: true, rights: true },
    evidence: {
      schema: "file:///audits/schema.json",
      quality: "file:///audits/quality.json",
      privacy: "file:///audits/privacy.json",
      contamination: "file:///audits/contamination.json",
      rights: "file:///audits/rights.json",
    },
    reviewedBy: "reviewer",
    reviewedAt: new Date().toISOString(),
  };
}

describe("Dataset release gates", () => {
  it("creates a candidate with provenance, statistics and a dataset card", async () =>
    fixture((db, publisher, dir, id) => {
      const snapshot = publisher.getSnapshot(id)!;
      assert.equal(snapshot.releaseState, "candidate");
      assert.equal(snapshot.runId, "11111111-1111-4111-8111-111111111111");
      assert.equal(snapshot.traceId, "a".repeat(32));
      assert.equal(snapshot.gitCommit, "b".repeat(40));
      const stats = JSON.parse(
        readFileSync(join(dir, "snapshots", "review_corpus_1.0.0", "statistics.json"), "utf8")
      );
      assert.equal(stats.totalShards, 1);
      assert.equal(stats.tokenCountMethod, "estimate");
      assert.equal(stats.languageDistribution.status, "unavailable");
      assert.equal(stats.qualityMetrics.status, "unavailable");
      assert.equal(readFileSync(snapshot.manifestUri, "utf8"), snapshot.manifestJson);
      assert.match(
        readFileSync(join(dir, "snapshots", "review_corpus_1.0.0", "README.md"), "utf8"),
        /Candidate snapshot/
      );
      assert.equal(db.getRunLineage(snapshot.runId!).snapshots[0].snapshotId, id);
      assert.equal(publisher.getLineage(id)?.releaseState, "candidate");
    }));

  for (const gate of ["schema", "quality", "privacy", "contamination", "rights"] as const) {
    it(`blocks failed ${gate} gate without changing state`, async () =>
      fixture((db, publisher, _dir, id) => {
        const input = review(db, id);
        input.gates[gate] = false;
        assert.throws(() => publisher.releaseSnapshot(input));
        assert.equal(publisher.getSnapshot(id)?.releaseState, "candidate");
        assert.equal(db.getDatasetReleaseGates(id), undefined);
        assert.equal(db.getDatasetReleaseReview(id), undefined);
      }));
  }

  it("rejects missing evidence, reviewer and stale hashes", async () =>
    fixture((db, publisher, _dir, id) => {
      const noEvidence = review(db, id);
      noEvidence.evidence.privacy = "";
      assert.throws(() => publisher.releaseSnapshot(noEvidence));
      const noReviewer = review(db, id);
      noReviewer.reviewedBy = " ";
      assert.throws(() => publisher.releaseSnapshot(noReviewer));
      const stale = review(db, id);
      stale.manifestSha256 = "0".repeat(64);
      assert.throws(() => publisher.releaseSnapshot(stale), /immutable/);
      const future = review(db, id);
      future.reviewedAt = new Date(Date.now() + 60000).toISOString();
      assert.throws(() => publisher.releaseSnapshot(future), /future/);
      assert.equal(publisher.getSnapshot(id)?.releaseState, "candidate");
    }));

  it("persists a complete review and preserves the immutable manifest", async () =>
    fixture((db, publisher, _dir, id) => {
      const input = review(db, id);
      const before = publisher.getSnapshot(id)!.manifestJson;
      assert.equal(publisher.releaseSnapshot(input).releaseState, "released");
      assert.equal(db.getDatasetReleaseGates(id)?.privacyGate, true);
      assert.equal(db.getDatasetReleaseReview(id)?.manifestSha256, input.manifestSha256);
      assert.equal(publisher.getSnapshot(id)!.manifestJson, before);
      assert.throws(() => publisher.releaseSnapshot(input), /candidate/);
      assert.throws(() => db.recordDatasetSnapshot(publisher.getSnapshot(id)!), /UNIQUE/);
      assert.equal(db.getDatasetReleaseGates(id)?.releaseState, "released");
    }));

  it("rolls back gates and state when evidence persistence fails", async () =>
    fixture((db, publisher, dir, id) => {
      const raw = new DatabaseSync(join(dir, "catalog.sqlite"));
      try {
        raw.exec(
          "CREATE TRIGGER fail_review BEFORE INSERT ON dataset_release_reviews BEGIN SELECT RAISE(ABORT, 'evidence write failed'); END;"
        );
      } finally {
        raw.close();
      }
      assert.throws(() => publisher.releaseSnapshot(review(db, id)), /evidence write failed/);
      assert.equal(publisher.getSnapshot(id)?.releaseState, "candidate");
      assert.equal(db.getDatasetReleaseGates(id), undefined);
      assert.equal(db.getDatasetReleaseReview(id), undefined);
    }));

  it("rejects overwriting an existing dataset version", async () =>
    fixture(async (_db, publisher, dir) => {
      await assert.rejects(
        publisher.publishSnapshot({
          datasetName: "review_corpus",
          version: "1.0.0",
          filePaths: [join(dir, "shard.parquet")],
        }),
        /already exists/
      );
    }));

  it("reserves namespaces atomically and rejects output-directory reuse", async () =>
    fixture(async (db, publisher, dir, id) => {
      const original = publisher.getSnapshot(id)!;
      const before = readFileSync(original.manifestUri, "utf8");
      await assert.rejects(
        publisher.publishSnapshot({
          datasetName: "other_corpus",
          version: "2.0.0",
          filePaths: [join(dir, "shard.parquet")],
          outputDir: join(dir, "snapshots", "review_corpus_1.0.0"),
        }),
        /already exists/
      );
      assert.equal(readFileSync(original.manifestUri, "utf8"), before);
      const results = await Promise.allSettled(
        [1, 2].map(() =>
          publisher.publishSnapshot({
            datasetName: "concurrent_corpus",
            version: "1.0.0",
            filePaths: [join(dir, "shard.parquet")],
          })
        )
      );
      assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
      assert.equal(db.listDatasetSnapshots("concurrent_corpus").length, 1);
    }));

  it("returns persisted document occurrences and their source lineage", async () =>
    fixture((db, publisher, _dir, id) => {
      const snapshot = publisher.getSnapshot(id)!;
      db.recordDocumentProvenance({
        documentId: "c".repeat(64),
        canonicalizationVersion: "text-normalizer.v1",
        language: "tr",
        piiStatus: "unchecked",
        split: "unassigned",
        rightsStatus: "unknown",
        createdAt: new Date().toISOString(),
      });
      db.recordDocumentOccurrence(
        {
          documentId: "c".repeat(64),
          sourceId: "fixture-source",
          sourceRecordId: "article-1",
          sourceUri: "https://example.org/article/1",
          acquiredAt: new Date().toISOString(),
          rawArtifactId: "raw-1",
        },
        snapshot.runId!
      );
      const lineage = db.getRunLineage(snapshot.runId!);
      assert.equal(lineage.occurrences[0].source_id, "fixture-source");
      assert.equal(lineage.documents[0].rights_status, "unknown");
      assert.equal(db.getRunLineage("22222222-2222-4222-8222-222222222222").occurrences.length, 0);
    }));

  it("records path tiers without inferring a tier for legacy replicas", async () =>
    fixture((db) => {
      const shard = db.listDatasetShards("review_corpus")[0];
      db.recordStorageReplica({
        replicaId: "r1",
        shardId: shard.shardId,
        storageProvider: "local",
        remoteUri: "file:///curated/shard",
        remoteSha256Hash: shard.sha256Hash,
        remoteSizeBytes: shard.sizeBytes,
        syncStatus: "VERIFIED",
        pathTier: "curated",
      });
      assert.equal(db.listStorageReplicas(shard.shardId)[0].pathTier, "curated");
    }));
});

describe("Canonicalization policy identity", () => {
  it("records NFKC policy and changes its identity with transformation options", () => {
    const normalizer = new TextNormalizer();
    const result = normalizer.processItem({ text: "  Ａ\r\nB  " });
    assert.equal(result.item.text, "A\nB");
    assert.equal(
      (result.item as Record<string, unknown>).canonicalization_version,
      normalizer.canonicalizationVersion
    );
    assert.notEqual(
      new TextNormalizer({ nfkc: false }).canonicalizationVersion,
      normalizer.canonicalizationVersion
    );
    assert.equal(new TextNormalizer().canonicalizationVersion, normalizer.canonicalizationVersion);
    assert.equal(normalizer.processItem({ id: 1 }).canonicalizationVersion, undefined);
  });
});

describe("Artifact path convention", () => {
  it("builds tier prefixes and rejects traversal", () => {
    assert.equal(buildArtifactPrefix("raw", "source/run/file.pdf"), "raw/source/run/file.pdf");
    assert.equal(
      buildArtifactPrefix("datasets", "corpus/v1/manifest.json"),
      "datasets/corpus/v1/manifest.json"
    );
    for (const path of ["../file", "/absolute", "a//b", "a/./b", "a\\b"])
      assert.throws(() => buildArtifactPrefix("raw", path));
  });
});
