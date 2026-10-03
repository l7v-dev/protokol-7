import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, before, describe, it } from "node:test";
import { LocalObjectStore, R2ObjectStore } from "../src/storage/adapters/index.js";

describe("ObjectStore Adapters Conformance Suite", () => {
  let tempDir: string;
  let localStore: LocalObjectStore;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "p7-object-store-test-"));
    localStore = new LocalObjectStore({
      baseDir: tempDir,
      providerId: "test-local",
      container: "test-container",
    });
  });

  after(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  async function* toAsyncIterable(data: Buffer): AsyncIterable<Uint8Array> {
    yield new Uint8Array(data);
  }

  async function streamToBuffer(stream: AsyncIterable<Uint8Array>): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  describe("LocalObjectStore", () => {
    it("reports correct storage capabilities", () => {
      assert.equal(localStore.capabilities.ranged_read, true);
      assert.equal(localStore.capabilities.conditional_create, true);
      assert.equal(localStore.capabilities.multipart, false);
    });

    it("puts stream and retrieves head metadata accurately", async () => {
      const data = Buffer.from("protokol-7 lakehouse test content");
      const ref = await localStore.putStream("bronze/samples/file1.txt", toAsyncIterable(data));

      assert.equal(ref.provider_id, "test-local");
      assert.equal(ref.container, "test-container");
      assert.equal(ref.key, "bronze/samples/file1.txt");
      assert.equal(ref.bytes, data.length);
      assert.match(ref.sha256, /^[0-9a-f]{64}$/);

      const headRef = await localStore.head(ref);
      assert.equal(headRef.sha256, ref.sha256);
      assert.equal(headRef.bytes, ref.bytes);
    });

    it("reads full content and executes ranged reads", async () => {
      const data = Buffer.from("0123456789abcdef");
      const ref = await localStore.putStream(
        "bronze/samples/range-test.bin",
        toAsyncIterable(data)
      );

      // Full read
      const fullBuffer = await streamToBuffer(localStore.openStream(ref));
      assert.equal(fullBuffer.toString("utf-8"), "0123456789abcdef");

      // Ranged read: bytes 2 to 6 exclusive ("2345")
      const rangeBuffer = await streamToBuffer(
        localStore.openStream(ref, { start: 2, endExclusive: 6 })
      );
      assert.equal(rangeBuffer.toString("utf-8"), "2345");
    });

    it("ensures idempotency when putting identical content to same key", async () => {
      const data = Buffer.from("idempotent content");
      const ref1 = await localStore.putStream(
        "bronze/samples/idempotent.txt",
        toAsyncIterable(data)
      );
      const ref2 = await localStore.putStream(
        "bronze/samples/idempotent.txt",
        toAsyncIterable(data)
      );

      assert.equal(ref1.sha256, ref2.sha256);
      assert.equal(ref1.bytes, ref2.bytes);
    });

    it("rejects immutable overwrite when putting different content to existing key", async () => {
      const original = Buffer.from("original content");
      const altered = Buffer.from("altered content");

      await localStore.putStream("bronze/samples/conflict.txt", toAsyncIterable(original));

      await assert.rejects(async () => {
        await localStore.putStream("bronze/samples/conflict.txt", toAsyncIterable(altered));
      }, /ImmutableConflict/);
    });

    it("blocks path traversal and directory escape attempts", async () => {
      const badData = Buffer.from("malicious");

      await assert.rejects(async () => {
        await localStore.putStream("../escaped.txt", toAsyncIterable(badData));
      }, /SecurityInvariantViolation/);

      await assert.rejects(async () => {
        await localStore.putStream("/absolute/escaped.txt", toAsyncIterable(badData));
      }, /SecurityInvariantViolation/);

      await assert.rejects(async () => {
        await localStore.putStream("bronze/../../outside.txt", toAsyncIterable(badData));
      }, /SecurityInvariantViolation/);
    });

    it("lists pages with cursor pagination", async () => {
      await localStore.putStream("list-test/a.txt", toAsyncIterable(Buffer.from("a")));
      await localStore.putStream("list-test/b.txt", toAsyncIterable(Buffer.from("b")));
      await localStore.putStream("list-test/c.txt", toAsyncIterable(Buffer.from("c")));

      const page1 = await localStore.listPage("list-test");
      assert.ok(page1.items.length >= 3);
      assert.ok(page1.items.some((i) => i.key === "list-test/a.txt"));
    });

    it("deletes object when requested", async () => {
      const ref = await localStore.putStream(
        "bronze/samples/to-delete.txt",
        toAsyncIterable(Buffer.from("temp"))
      );
      assert.equal(await localStore.exists(ref.key), true);

      await localStore.delete(ref);
      assert.equal(await localStore.exists(ref.key), false);
    });
  });

  describe("R2ObjectStore", () => {
    it("reports correct cloud capabilities", () => {
      const r2Store = new R2ObjectStore({
        container: "sample-bucket",
        accountId: "0123456789abcdef",
        accessKeyId: "mock-key",
        secretAccessKey: "mock-secret",
      });

      assert.equal(r2Store.capabilities.multipart, true);
      assert.equal(r2Store.capabilities.ranged_read, true);
      assert.equal(r2Store.capabilities.versioning, true);
      assert.equal(r2Store.capabilities.presign, true);
    });

    it("throws when neither endpoint nor accountId is provided", () => {
      assert.throws(() => {
        new R2ObjectStore({
          container: "sample-bucket",
          accessKeyId: "mock-key",
          secretAccessKey: "mock-secret",
        });
      }, /InvalidConfiguration/);
    });
  });
});
