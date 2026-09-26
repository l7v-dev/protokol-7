/**
 * Local Storage Backend implementation writing artifacts into pool root directory.
 */

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import type { StorageBackend, StorageReceipt } from "./index";

export class LocalStorage implements StorageBackend {
  readonly backend = "local";
  private readonly baseDir: string;

  constructor(options?: { baseDir?: string }) {
    if (options?.baseDir) {
      this.baseDir = isAbsolute(options.baseDir) ? options.baseDir : resolve(options.baseDir);
    } else if (process.env.PROTOKOL_POOL_ROOT) {
      this.baseDir = process.env.PROTOKOL_POOL_ROOT;
    } else {
      this.baseDir = resolve("data/pool");
    }
  }

  async upload(fileName: string, data: Buffer, prefix = ""): Promise<StorageReceipt> {
    const targetDir = prefix ? join(this.baseDir, prefix) : this.baseDir;
    mkdirSync(targetDir, { recursive: true });

    const filePath = join(targetDir, fileName);
    writeFileSync(filePath, data);

    const hash = createHash("sha256").update(data).digest("hex");

    return {
      backend: "local",
      uri: filePath,
      bytesWritten: data.length,
      checksumSha256: hash,
      timestamp: new Date().toISOString(),
    };
  }

  getBaseDir(): string {
    return this.baseDir;
  }
}
