import path from "node:path";

export class ArchiveSecurityError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ArchiveSecurityError";
    this.code = code;
  }
}

export interface ArchiveGuardOptions {
  maxTotalBytes?: number;
  maxFiles?: number;
  maxCompressionRatio?: number;
}

export class ArchiveGuard {
  public static readonly DEFAULT_MAX_TOTAL_BYTES = 100 * 1024 * 1024; // 100 MB
  public static readonly DEFAULT_MAX_FILES = 500;
  public static readonly DEFAULT_MAX_RATIO = 100;

  /**
   * Enforces strict Zip Slip defense preventing path traversal attacks.
   * Rejects relative parents (".."), absolute root paths, drive letters, and null bytes.
   */
  public static validatePath(rawPath: string): string {
    if (!rawPath || typeof rawPath !== "string") {
      throw new ArchiveSecurityError(
        "INVALID_ENTRY_PATH",
        "Archive entry path must be a non-empty string."
      );
    }

    // Check null bytes
    if (rawPath.includes("\0")) {
      throw new ArchiveSecurityError(
        "ZIP_SLIP_NULL_BYTE",
        `Null byte detected in entry path: "${rawPath}".`
      );
    }

    // Standardize to POSIX forward slashes
    const normalizedSlashes = rawPath.replace(/\\/g, "/");

    // Block Windows drive letters (e.g. C:, D:)
    if (/^[a-zA-Z]:/.test(normalizedSlashes)) {
      throw new ArchiveSecurityError(
        "ZIP_SLIP_DRIVE_LETTER",
        `Drive letter detected in entry path: "${rawPath}".`
      );
    }

    // Block absolute root paths
    if (normalizedSlashes.startsWith("/")) {
      throw new ArchiveSecurityError(
        "ZIP_SLIP_ABSOLUTE_PATH",
        `Absolute path detected in entry path: "${rawPath}".`
      );
    }

    // Normalize path
    const normalized = path.posix.normalize(normalizedSlashes);

    // Block path traversal components
    if (
      normalized === ".." ||
      normalized.startsWith("../") ||
      normalized.includes("/../") ||
      normalized.endsWith("/..")
    ) {
      throw new ArchiveSecurityError(
        "ZIP_SLIP_PATH_TRAVERSAL",
        `Path traversal attempt detected in entry: "${rawPath}".`
      );
    }

    return normalized;
  }

  /**
   * Enforces Zip Bomb volumetric constraints on total uncompressed payload and file count.
   */
  public static checkBombLimits(
    currentTotalBytes: number,
    addedBytes: number,
    fileCount: number,
    options: ArchiveGuardOptions = {}
  ): void {
    const maxTotalBytes = options.maxTotalBytes ?? ArchiveGuard.DEFAULT_MAX_TOTAL_BYTES;
    const maxFiles = options.maxFiles ?? ArchiveGuard.DEFAULT_MAX_FILES;

    if (currentTotalBytes + addedBytes > maxTotalBytes) {
      throw new ArchiveSecurityError(
        "ZIP_BOMB_MAX_SIZE_EXCEEDED",
        `Archive uncompressed size (${currentTotalBytes + addedBytes} bytes) exceeds maximum security threshold (${maxTotalBytes} bytes).`
      );
    }

    if (fileCount > maxFiles) {
      throw new ArchiveSecurityError(
        "ZIP_BOMB_MAX_FILES_EXCEEDED",
        `Archive file count (${fileCount}) exceeds maximum threshold (${maxFiles} files).`
      );
    }
  }

  /**
   * Enforces compression ratio check to guard against recursive or highly compressed zip bombs.
   */
  public static checkCompressionRatio(
    uncompressedSize: number,
    compressedSize: number,
    options: ArchiveGuardOptions = {}
  ): void {
    const maxRatio = options.maxCompressionRatio ?? ArchiveGuard.DEFAULT_MAX_RATIO;

    if (compressedSize > 0 && uncompressedSize > 1024 * 1024) {
      const ratio = uncompressedSize / compressedSize;
      if (ratio > maxRatio) {
        throw new ArchiveSecurityError(
          "ZIP_BOMB_RATIO_EXCEEDED",
          `Excessive compression ratio detected (${ratio.toFixed(1)}:1 > ${maxRatio}:1). Potential decompression bomb.`
        );
      }
    }
  }
}
