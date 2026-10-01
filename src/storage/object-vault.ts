/**
 * Object Vault Subsystem — protokol-7
 *
 * Provides deterministic, categorized, and content-addressed file system storage
 * for binary assets (images, videos, documents, audio, and archives).
 * Default vault root: ~/protokol-object-vault (or process.env.PROTOKOL_OBJECT_VAULT_PATH).
 *
 * Partition hierarchy:
 * <VAULT_ROOT>/<actor_name>/<target_id>/<media_category>/<filename>
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { appendFile, mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export type MediaCategory = "images" | "videos" | "thumbnails" | "documents" | "audio" | "raw";

export interface ObjectVaultOptions {
  vaultRoot?: string;
}

export interface StoredObjectMetadata {
  actor: string;
  targetId: string;
  category: MediaCategory;
  filename: string;
  sourceUrl?: string;
  mimeType?: string;
  sizeBytes: number;
  sha256: string;
  storedAt: number;
  relativePath: string;
  absolutePath: string;
}

export interface StoreObjectOptions {
  actor: string;
  targetId: string;
  category: MediaCategory;
  filename: string;
  sourceUrl?: string;
  mimeType?: string;
  overwrite?: boolean;
}

export class ObjectVault {
  readonly vaultRoot: string;

  constructor(options?: ObjectVaultOptions) {
    this.vaultRoot =
      options?.vaultRoot ||
      process.env.PROTOKOL_OBJECT_VAULT_PATH ||
      join(homedir(), "protokol-object-vault");

    if (!existsSync(this.vaultRoot)) {
      mkdirSync(this.vaultRoot, { recursive: true });
    }
  }

  /**
   * Resolves the deterministic storage path for an asset.
   */
  resolvePath(
    actor: string,
    targetId: string,
    category: MediaCategory,
    filename: string
  ): {
    absolutePath: string;
    relativePath: string;
    directory: string;
  } {
    const sanitizedActor = actor.toLowerCase().replace(/[^a-z0-9_-]/g, "_");
    const sanitizedTarget = targetId.toLowerCase().replace(/[^a-z0-9_.-]/g, "_");
    const sanitizedCategory = category.toLowerCase();
    const sanitizedFilename = filename.replace(/[/\\?%*:|"<>]/g, "_");

    const relativePath = join(
      sanitizedActor,
      sanitizedTarget,
      sanitizedCategory,
      sanitizedFilename
    );
    const absolutePath = join(this.vaultRoot, relativePath);
    const directory = dirname(absolutePath);

    return { absolutePath, relativePath, directory };
  }

  /**
   * Checks whether an asset already exists in the vault.
   */
  hasAsset(actor: string, targetId: string, category: MediaCategory, filename: string): boolean {
    const { absolutePath } = this.resolvePath(actor, targetId, category, filename);
    return existsSync(absolutePath) && statSync(absolutePath).size > 0;
  }

  /**
   * Saves an in-memory buffer directly into the vault.
   */
  async saveBuffer(
    buffer: Buffer | Uint8Array,
    options: StoreObjectOptions
  ): Promise<StoredObjectMetadata> {
    const { absolutePath, relativePath, directory } = this.resolvePath(
      options.actor,
      options.targetId,
      options.category,
      options.filename
    );

    if (!options.overwrite && existsSync(absolutePath) && statSync(absolutePath).size > 0) {
      const stats = statSync(absolutePath);
      const existingData = readFileSync(absolutePath);
      const hash = createHash("sha256").update(existingData).digest("hex");
      return {
        actor: options.actor,
        targetId: options.targetId,
        category: options.category,
        filename: options.filename,
        sourceUrl: options.sourceUrl,
        mimeType: options.mimeType,
        sizeBytes: stats.size,
        sha256: hash,
        storedAt: Math.floor(stats.mtimeMs / 1000),
        relativePath,
        absolutePath,
      };
    }

    await mkdir(directory, { recursive: true });

    const tempPath = `${absolutePath}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await writeFile(tempPath, buffer);

    const hash = createHash("sha256").update(buffer).digest("hex");
    await rename(tempPath, absolutePath);

    const metadata: StoredObjectMetadata = {
      actor: options.actor,
      targetId: options.targetId,
      category: options.category,
      filename: options.filename,
      sourceUrl: options.sourceUrl,
      mimeType: options.mimeType,
      sizeBytes: buffer.byteLength,
      sha256: hash,
      storedAt: Math.floor(Date.now() / 1000),
      relativePath,
      absolutePath,
    };

    await this.appendManifestLedger(metadata);
    return metadata;
  }

  /**
   * Downloads a remote HTTP/HTTPS resource and writes it directly to the vault.
   */
  async downloadAsset(
    url: string,
    options: StoreObjectOptions,
    customHeaders?: Record<string, string>
  ): Promise<StoredObjectMetadata> {
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      throw new Error(`Invalid URL scheme for asset download: "${url}". Only HTTP(S) supported.`);
    }

    const { absolutePath, relativePath, directory } = this.resolvePath(
      options.actor,
      options.targetId,
      options.category,
      options.filename
    );

    // Skip if already downloaded and valid
    if (!options.overwrite && existsSync(absolutePath)) {
      const stats = statSync(absolutePath);
      if (stats.size > 0) {
        const existingData = readFileSync(absolutePath);
        const hash = createHash("sha256").update(existingData).digest("hex");
        return {
          actor: options.actor,
          targetId: options.targetId,
          category: options.category,
          filename: options.filename,
          sourceUrl: url,
          mimeType: options.mimeType,
          sizeBytes: stats.size,
          sha256: hash,
          storedAt: Math.floor(stats.mtimeMs / 1000),
          relativePath,
          absolutePath,
        };
      }
    }

    await mkdir(directory, { recursive: true });

    const headers: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      Accept: "*/*",
      ...customHeaders,
    };

    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(
        `Failed to download asset from ${url}: HTTP ${response.status} ${response.statusText}`
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const detectedMime = response.headers.get("content-type") || options.mimeType;

    const tempPath = `${absolutePath}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      await writeFile(tempPath, buffer);
      const hash = createHash("sha256").update(buffer).digest("hex");
      await rename(tempPath, absolutePath);

      const metadata: StoredObjectMetadata = {
        actor: options.actor,
        targetId: options.targetId,
        category: options.category,
        filename: options.filename,
        sourceUrl: url,
        mimeType: detectedMime || undefined,
        sizeBytes: buffer.byteLength,
        sha256: hash,
        storedAt: Math.floor(Date.now() / 1000),
        relativePath,
        absolutePath,
      };

      await this.appendManifestLedger(metadata);
      return metadata;
    } catch (err) {
      if (existsSync(tempPath)) {
        await unlink(tempPath).catch(() => {});
      }
      throw err;
    }
  }

  /**
   * Appends an asset record to the target's manifest.jsonl ledger.
   */
  private async appendManifestLedger(metadata: StoredObjectMetadata): Promise<void> {
    const targetDir = join(
      this.vaultRoot,
      metadata.actor.toLowerCase().replace(/[^a-z0-9_-]/g, "_"),
      metadata.targetId.toLowerCase().replace(/[^a-z0-9_.-]/g, "_")
    );
    const ledgerFile = join(targetDir, "manifest.jsonl");

    try {
      await mkdir(targetDir, { recursive: true });
      const line = `${JSON.stringify(metadata)}\n`;
      await appendFile(ledgerFile, line, "utf8");
    } catch {
      // Manifest append is non-fatal
    }
  }
}
