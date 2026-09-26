import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deflateRawSync, gzipSync } from "node:zlib";
import { ArchiveExtractor } from "../src/archive/archive-extractor";
import { ArchiveSecurityError } from "../src/archive/archive-guard";

function createMockZip(files: Record<string, string>): Buffer {
  const parts: Buffer[] = [];
  for (const [name, content] of Object.entries(files)) {
    const rawData = Buffer.from(content, "utf8");
    const compressedData = deflateRawSync(rawData);
    const nameBuf = Buffer.from(name, "utf8");

    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0, 6);
    header.writeUInt16LE(8, 8);
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(0, 12);
    header.writeUInt32LE(0, 14);
    header.writeUInt32LE(compressedData.length, 18);
    header.writeUInt32LE(rawData.length, 22);
    header.writeUInt16LE(nameBuf.length, 26);
    header.writeUInt16LE(0, 28);

    parts.push(header, nameBuf, compressedData);
  }
  return Buffer.concat(parts);
}

function createMockTar(files: Record<string, string>): Buffer {
  const blocks: Buffer[] = [];
  for (const [name, content] of Object.entries(files)) {
    const dataBuf = Buffer.from(content, "utf8");
    const header = Buffer.alloc(512);

    header.write(name, 0, Math.min(name.length, 99), "utf8");
    header.write("0000644\0", 100, 8, "ascii");
    header.write("0000000\0", 108, 8, "ascii");
    header.write("0000000\0", 116, 8, "ascii");
    const sizeOctal = `${dataBuf.length.toString(8).padStart(11, "0")}\0`;
    header.write(sizeOctal, 124, 12, "ascii");
    header.write("00000000000\0", 136, 12, "ascii");
    header.write("0", 156, 1, "ascii");
    header.write("ustar\0", 257, 6, "ascii");
    header.write("00", 263, 2, "ascii");

    header.fill(32, 148, 156);
    let checksum = 0;
    for (let i = 0; i < 512; i++) {
      checksum += header[i];
    }
    const checkOctal = `${checksum.toString(8).padStart(6, "0")}\0 `;
    header.write(checkOctal, 148, 8, "ascii");

    blocks.push(header);
    blocks.push(dataBuf);

    const paddingLen = (512 - (dataBuf.length % 512)) % 512;
    if (paddingLen > 0) {
      blocks.push(Buffer.alloc(paddingLen));
    }
  }

  blocks.push(Buffer.alloc(1024));
  return Buffer.concat(blocks);
}

describe("ArchiveExtractor - Multi-format Safe Archive Decompression", () => {
  it("extracts entries from ZIP archive with SHA-256 and text previews", () => {
    const zipBuf = createMockZip({
      "dataset/report.csv": "col1,col2\nval1,val2",
      "dataset/readme.txt": "Dataset documentation and usage instructions.",
    });

    const result = ArchiveExtractor.extract(zipBuf, {
      extractTextPreviews: true,
    });

    assert.equal(result.format, "zip");
    assert.equal(result.totalFiles, 2);
    assert.equal(result.entries.length, 2);
    assert.equal(result.securityCheckPassed, true);

    const csvEntry = result.entries.find((e) => e.path === "dataset/report.csv");
    assert.ok(csvEntry);
    assert.equal(csvEntry.mimeType, "text/csv");
    assert.ok(csvEntry.sha256.length === 64);
    assert.ok(csvEntry.textPreview?.includes("val1,val2"));

    const txtEntry = result.entries.find((e) => e.path === "dataset/readme.txt");
    assert.ok(txtEntry);
    assert.equal(txtEntry.mimeType, "text/plain");
    assert.ok(txtEntry.textPreview?.includes("Dataset documentation"));
  });

  it("extracts entries from POSIX ustar TAR archive", () => {
    const tarBuf = createMockTar({
      "package/info.json": '{"name":"protokol-7","version":"1.0.0"}',
      "package/notes.md": "# Release Notes\n\nAll features active.",
    });

    const result = ArchiveExtractor.extract(tarBuf, {
      extractTextPreviews: true,
    });

    assert.equal(result.format, "tar");
    assert.equal(result.totalFiles, 2);
    assert.equal(result.entries[0].path, "package/info.json");
    assert.equal(result.entries[0].mimeType, "application/json");
    assert.ok(result.entries[0].textPreview?.includes('"protokol-7"'));
  });

  it("extracts compressed TAR.GZ archive", () => {
    const tarBuf = createMockTar({
      "logs/app.log": "2026-09-26T12:00:00Z [INFO] Service started",
    });
    const tgzBuf = gzipSync(tarBuf);

    const result = ArchiveExtractor.extract(tgzBuf, {
      extractTextPreviews: true,
    });

    assert.equal(result.format, "tar.gz");
    assert.equal(result.totalFiles, 1);
    assert.equal(result.entries[0].path, "logs/app.log");
    assert.ok(result.entries[0].textPreview?.includes("Service started"));
  });

  it("extracts standalone GZIP file", () => {
    const rawContent = "Single compressed file stream.";
    const gzBuf = gzipSync(Buffer.from(rawContent, "utf8"));

    const result = ArchiveExtractor.extract(gzBuf, {
      extractTextPreviews: true,
    });

    assert.equal(result.format, "gz");
    assert.equal(result.totalFiles, 1);
    assert.ok(result.entries[0].textPreview?.includes("Single compressed file"));
  });

  it("detects RAR signature and reports archive entry", () => {
    const rarHeader = Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00]);

    const result = ArchiveExtractor.extract(rarHeader);
    assert.equal(result.format, "rar");
    assert.equal(result.totalFiles, 1);
    assert.equal(result.entries[0].mimeType, "application/vnd.rar");
  });

  it("aborts and throws ArchiveSecurityError on Zip Slip attempt", () => {
    const evilZip = createMockZip({
      "../../../../etc/passwd": "root:x:0:0:root:/root:/bin/bash",
    });

    assert.throws(
      () => ArchiveExtractor.extract(evilZip),
      (err: unknown) =>
        err instanceof ArchiveSecurityError && err.code === "ZIP_SLIP_PATH_TRAVERSAL"
    );
  });

  it("aborts when maxTotalBytes threshold is exceeded", () => {
    const largeZip = createMockZip({
      "file1.txt": "x".repeat(10_000),
    });

    assert.throws(
      () => ArchiveExtractor.extract(largeZip, { maxTotalBytes: 5_000 }),
      (err: unknown) =>
        err instanceof ArchiveSecurityError && err.code === "ZIP_BOMB_MAX_SIZE_EXCEEDED"
    );
  });
});
