import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ArchiveGuard, ArchiveSecurityError } from "../src/archive/archive-guard";

describe("ArchiveGuard - Zip Slip and Zip Bomb Security Boundaries", () => {
  describe("Path Traversal (Zip Slip) Defense", () => {
    it("permits standard clean relative paths", () => {
      assert.equal(ArchiveGuard.validatePath("data/reports/q1.csv"), "data/reports/q1.csv");
      assert.equal(ArchiveGuard.validatePath("readme.txt"), "readme.txt");
      assert.equal(ArchiveGuard.validatePath("sub/folder/file.json"), "sub/folder/file.json");
    });

    it("rejects paths containing null bytes", () => {
      assert.throws(
        () => ArchiveGuard.validatePath("legit.txt\0/../../evil.sh"),
        (err: unknown) => err instanceof ArchiveSecurityError && err.code === "ZIP_SLIP_NULL_BYTE"
      );
    });

    it("rejects Windows drive letters", () => {
      assert.throws(
        () => ArchiveGuard.validatePath("C:/Windows/System32/calc.exe"),
        (err: unknown) =>
          err instanceof ArchiveSecurityError && err.code === "ZIP_SLIP_DRIVE_LETTER"
      );
    });

    it("rejects absolute paths starting with forward slash", () => {
      assert.throws(
        () => ArchiveGuard.validatePath("/etc/passwd"),
        (err: unknown) =>
          err instanceof ArchiveSecurityError && err.code === "ZIP_SLIP_ABSOLUTE_PATH"
      );
    });

    it("rejects path traversal attempting to escape root", () => {
      const maliciousPaths = [
        "../secret.key",
        "../../etc/shadow",
        "nested/../../escape.txt",
        "sub/dir/../../../pwned",
        "..",
      ];

      for (const malPath of maliciousPaths) {
        assert.throws(
          () => ArchiveGuard.validatePath(malPath),
          (err: unknown) =>
            err instanceof ArchiveSecurityError && err.code === "ZIP_SLIP_PATH_TRAVERSAL",
          `Should have blocked: ${malPath}`
        );
      }
    });
  });

  describe("Zip Bomb Volumetric Defense", () => {
    it("rejects archives exceeding maximum total uncompressed byte threshold", () => {
      assert.throws(
        () =>
          ArchiveGuard.checkBombLimits(100 * 1024 * 1024, 1, 10, {
            maxTotalBytes: 100 * 1024 * 1024,
          }),
        (err: unknown) =>
          err instanceof ArchiveSecurityError && err.code === "ZIP_BOMB_MAX_SIZE_EXCEEDED"
      );
    });

    it("rejects archives exceeding maximum file count threshold", () => {
      assert.throws(
        () =>
          ArchiveGuard.checkBombLimits(1024, 1024, 501, {
            maxFiles: 500,
          }),
        (err: unknown) =>
          err instanceof ArchiveSecurityError && err.code === "ZIP_BOMB_MAX_FILES_EXCEEDED"
      );
    });

    it("detects and rejects suspicious decompression compression ratios", () => {
      // 100 MB uncompressed from 500 KB compressed -> 200:1 ratio (> 100:1 threshold)
      const compressedSize = 500 * 1024;
      const uncompressedSize = 100 * 1024 * 1024;

      assert.throws(
        () =>
          ArchiveGuard.checkCompressionRatio(uncompressedSize, compressedSize, {
            maxCompressionRatio: 100,
          }),
        (err: unknown) =>
          err instanceof ArchiveSecurityError && err.code === "ZIP_BOMB_RATIO_EXCEEDED"
      );
    });
  });
});
