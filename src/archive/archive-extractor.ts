import crypto from "node:crypto";
import { gunzipSync } from "node:zlib";
import { ContextGuard } from "../core/context-guard";
import type {
  ArchiveEntryResult,
  ArchiveExtractorResult,
  ArchiveExtractorTaskOptions,
  ArchiveFormat,
} from "../core/types";
import { ArchiveGuard } from "./archive-guard";
import { TarParser } from "./tar-parser";
import { ZipParser } from "./zip-parser";

export class ArchiveExtractor {
  private static readonly MIME_TYPE_MAP: Record<string, string> = {
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    csv: "text/csv",
    tsv: "text/tab-separated-values",
    txt: "text/plain",
    log: "text/plain",
    json: "application/json",
    jsonl: "application/json",
    ndjson: "application/json",
    yaml: "text/yaml",
    yml: "text/yaml",
    xml: "application/xml",
    html: "text/html",
    md: "text/markdown",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    zip: "application/zip",
    tar: "application/x-tar",
    gz: "application/gzip",
  };

  /**
   * Identifies archive format and safely decompresses entries while enforcing
   * Zip Slip path traversal and Zip Bomb volumetric guards.
   */
  public static extract(
    buffer: Buffer,
    options: ArchiveExtractorTaskOptions = {}
  ): ArchiveExtractorResult {
    const format = ArchiveExtractor.detectFormat(buffer, options.format);

    const entries: ArchiveEntryResult[] = [];
    let totalUncompressedBytes = 0;
    let fileCount = 0;

    switch (format) {
      case "zip": {
        const rawEntries = ZipParser.parse(buffer);
        for (const item of rawEntries) {
          if (item.isDirectory) continue;

          // 1. Path Traversal Guard (Zip Slip)
          const safePath = ArchiveGuard.validatePath(item.path);

          // 2. Compression Ratio Guard
          ArchiveGuard.checkCompressionRatio(item.uncompressedSize, item.compressedSize, {
            maxCompressionRatio: 100,
          });

          // 3. Volumetric Bomb Guard
          ArchiveGuard.checkBombLimits(totalUncompressedBytes, item.data.length, fileCount + 1, {
            maxTotalBytes: options.maxTotalBytes,
            maxFiles: options.maxFiles,
          });

          totalUncompressedBytes += item.data.length;
          fileCount++;

          const sha256 = crypto.createHash("sha256").update(item.data).digest("hex");
          const mimeType = ArchiveExtractor.detectMimeType(safePath);
          const textPreview =
            options.extractTextPreviews && ArchiveExtractor.isTextMime(mimeType)
              ? ArchiveExtractor.generatePreview(item.data, options.previewLength || 250)
              : undefined;

          entries.push({
            path: safePath,
            size: item.data.length,
            compressedSize: item.compressedSize,
            mimeType,
            sha256,
            textPreview,
          });
        }
        break;
      }

      case "tar": {
        const rawEntries = TarParser.parse(buffer);
        for (const item of rawEntries) {
          if (item.isDirectory) continue;

          const safePath = ArchiveGuard.validatePath(item.path);

          ArchiveGuard.checkBombLimits(totalUncompressedBytes, item.data.length, fileCount + 1, {
            maxTotalBytes: options.maxTotalBytes,
            maxFiles: options.maxFiles,
          });

          totalUncompressedBytes += item.data.length;
          fileCount++;

          const sha256 = crypto.createHash("sha256").update(item.data).digest("hex");
          const mimeType = ArchiveExtractor.detectMimeType(safePath);
          const textPreview =
            options.extractTextPreviews && ArchiveExtractor.isTextMime(mimeType)
              ? ArchiveExtractor.generatePreview(item.data, options.previewLength || 250)
              : undefined;

          entries.push({
            path: safePath,
            size: item.data.length,
            compressedSize: item.size,
            mimeType,
            sha256,
            textPreview,
          });
        }
        break;
      }

      case "tar.gz": {
        const gunzipped = gunzipSync(buffer);
        const rawEntries = TarParser.parse(gunzipped);
        for (const item of rawEntries) {
          if (item.isDirectory) continue;

          const safePath = ArchiveGuard.validatePath(item.path);

          ArchiveGuard.checkBombLimits(totalUncompressedBytes, item.data.length, fileCount + 1, {
            maxTotalBytes: options.maxTotalBytes,
            maxFiles: options.maxFiles,
          });

          totalUncompressedBytes += item.data.length;
          fileCount++;

          const sha256 = crypto.createHash("sha256").update(item.data).digest("hex");
          const mimeType = ArchiveExtractor.detectMimeType(safePath);
          const textPreview =
            options.extractTextPreviews && ArchiveExtractor.isTextMime(mimeType)
              ? ArchiveExtractor.generatePreview(item.data, options.previewLength || 250)
              : undefined;

          entries.push({
            path: safePath,
            size: item.data.length,
            compressedSize: item.size,
            mimeType,
            sha256,
            textPreview,
          });
        }
        break;
      }

      case "gz": {
        const gunzipped = gunzipSync(buffer);
        const safePath = "decompressed_payload";
        ArchiveGuard.checkBombLimits(totalUncompressedBytes, gunzipped.length, 1, {
          maxTotalBytes: options.maxTotalBytes,
          maxFiles: options.maxFiles,
        });

        totalUncompressedBytes = gunzipped.length;
        fileCount = 1;

        const sha256 = crypto.createHash("sha256").update(gunzipped).digest("hex");
        const mimeType = "application/octet-stream";
        const textPreview = options.extractTextPreviews
          ? ArchiveExtractor.generatePreview(gunzipped, options.previewLength || 250)
          : undefined;

        entries.push({
          path: safePath,
          size: gunzipped.length,
          compressedSize: buffer.length,
          mimeType,
          sha256,
          textPreview,
        });
        break;
      }

      case "rar": {
        // RAR header detected: unrar binary bridge or reporting
        entries.push({
          path: "archive.rar",
          size: buffer.length,
          compressedSize: buffer.length,
          mimeType: "application/vnd.rar",
          sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
          textPreview: "[RAR archive detected]",
        });
        fileCount = 1;
        totalUncompressedBytes = buffer.length;
        break;
      }

      default: {
        throw new Error("Unsupported or unrecognized archive format signature.");
      }
    }

    return {
      format,
      totalFiles: entries.length,
      totalUncompressedBytes,
      entries,
      securityCheckPassed: true,
    };
  }

  public static detectFormat(buffer: Buffer, explicitFormat?: ArchiveFormat): ArchiveFormat {
    if (explicitFormat && explicitFormat !== "unknown") {
      return explicitFormat;
    }

    if (buffer.length >= 4) {
      // ZIP: 0x50, 0x4B, 0x03, 0x04
      if (buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) {
        return "zip";
      }

      // GZIP: 0x1F, 0x8B
      if (buffer[0] === 0x1f && buffer[1] === 0x8b) {
        // Check if decompressed payload is TAR
        try {
          const sample = gunzipSync(buffer.subarray(0, Math.min(buffer.length, 65536)));
          if (sample.length >= 262 && sample.toString("ascii", 257, 262) === "ustar") {
            return "tar.gz";
          }
        } catch {
          // If partial gunzip fails, inspect full or default to gz
        }
        return "gz";
      }

      // RAR: 0x52 0x61 0x72 0x21 (Rar!)
      if (buffer[0] === 0x52 && buffer[1] === 0x61 && buffer[2] === 0x72 && buffer[3] === 0x21) {
        return "rar";
      }
    }

    // TAR: inspect offset 257 for 'ustar'
    if (buffer.length >= 262) {
      const magic = buffer.toString("ascii", 257, 262);
      if (magic === "ustar") {
        return "tar";
      }
    }

    return "unknown";
  }

  private static detectMimeType(filePath: string): string {
    const ext = filePath.split(".").pop()?.toLowerCase() || "";
    return ArchiveExtractor.MIME_TYPE_MAP[ext] || "application/octet-stream";
  }

  private static isTextMime(mimeType: string): boolean {
    return (
      mimeType.startsWith("text/") ||
      mimeType === "application/json" ||
      mimeType === "application/xml"
    );
  }

  private static generatePreview(data: Buffer, len: number): string {
    const sample = data.subarray(0, Math.min(data.length, len * 2)).toString("utf8");
    return ContextGuard.stripInvisibleUnicode(sample.slice(0, len));
  }
}
