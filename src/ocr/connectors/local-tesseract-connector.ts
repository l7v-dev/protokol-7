/**
 * Local Tesseract OCR CLI Connector.
 * Executes the host machine's tesseract binary via child_process if available.
 */

import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import type { IOcrConnector, OcrPageResult, OcrRequest, OcrResult } from "../types";

const execFileAsync = promisify(execFile);

export interface LocalTesseractOptions {
  binaryPath?: string;
  defaultLanguage?: string;
  timeoutMs?: number;
}

export class LocalTesseractOcrConnector implements IOcrConnector {
  public readonly name = "tesseract";

  private readonly binaryPath: string;
  private readonly defaultLanguage: string;
  private readonly timeoutMs: number;

  constructor(options?: LocalTesseractOptions) {
    this.binaryPath = options?.binaryPath || process.env.TESSERACT_BINARY_PATH || "tesseract";
    this.defaultLanguage = options?.defaultLanguage || "eng";
    this.timeoutMs = options?.timeoutMs ?? 20000;
  }

  public async isAvailable(): Promise<boolean> {
    try {
      const { stdout } = await execFileAsync(this.binaryPath, ["--version"], {
        timeout: 3000,
      });
      return stdout.toLowerCase().includes("tesseract");
    } catch {
      return false;
    }
  }

  public async extract(request: OcrRequest): Promise<OcrResult> {
    const buffer = this.resolveImageBuffer(request);
    if (!buffer) {
      throw new Error("LocalTesseractOcrConnector requires imageBuffer or imageBase64.");
    }

    const tempDir = os.tmpdir();
    const tempInput = path.join(
      tempDir,
      `tess_in_${Date.now()}_${Math.random().toString(36).slice(2)}.png`
    );

    await fs.promises.writeFile(tempInput, buffer);

    try {
      const lang = request.language || this.defaultLanguage;
      const { stdout } = await execFileAsync(this.binaryPath, [tempInput, "stdout", "-l", lang], {
        timeout: this.timeoutMs,
      });

      const cleanText = (stdout || "").trim();
      const words = cleanText.length > 0 ? cleanText.split(/\s+/).length : 0;

      const pageResult: OcrPageResult = {
        pageNumber: 1,
        text: cleanText,
      };

      return {
        connectorName: this.name,
        text: cleanText,
        pages: [pageResult],
        totalCharacters: cleanText.length,
        totalWords: words,
        metadata: {
          binaryPath: this.binaryPath,
          language: lang,
        },
      };
    } finally {
      await fs.promises.unlink(tempInput).catch(() => {});
    }
  }

  private resolveImageBuffer(request: OcrRequest): Buffer | undefined {
    if (request.imageBuffer) {
      return request.imageBuffer;
    }
    if (request.imageBase64) {
      const cleanBase64 = request.imageBase64.replace(/^data:image\/\w+;base64,/, "");
      return Buffer.from(cleanBase64, "base64");
    }
    return undefined;
  }
}
