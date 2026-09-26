/**
 * Generic HTTP OCR Connector.
 * Integrates with proprietary, self-hosted, or third-party OCR microservices
 * via standard HTTP POST contracts.
 */

import type { IOcrConnector, OcrPageResult, OcrRequest, OcrResult } from "../types";

export interface GenericHttpOcrOptions {
  endpoint?: string;
  apiKey?: string;
  headers?: Record<string, string>;
  textJsonPath?: string;
  timeoutMs?: number;
}

export class GenericHttpOcrConnector implements IOcrConnector {
  public readonly name = "generic-http";

  private readonly endpoint?: string;
  private readonly apiKey?: string;
  private readonly headers: Record<string, string>;
  private readonly textJsonPath: string;
  private readonly timeoutMs: number;

  constructor(options?: GenericHttpOcrOptions) {
    this.endpoint = options?.endpoint || process.env.GENERIC_OCR_ENDPOINT;
    this.apiKey = options?.apiKey || process.env.GENERIC_OCR_API_KEY;
    this.headers = options?.headers || {};
    this.textJsonPath = options?.textJsonPath || "text";
    this.timeoutMs = options?.timeoutMs ?? 30000;
  }

  public async isAvailable(): Promise<boolean> {
    return Boolean(this.endpoint);
  }

  public async extract(request: OcrRequest): Promise<OcrResult> {
    if (!this.endpoint) {
      throw new Error("GenericHttpOcrConnector requires an endpoint URL.");
    }

    const imageBase64 = this.resolveImageBase64(request);
    if (!imageBase64) {
      throw new Error("GenericHttpOcrConnector requires either imageBuffer or imageBase64.");
    }

    const reqHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      ...this.headers,
    };

    if (this.apiKey) {
      reqHeaders.Authorization = `Bearer ${this.apiKey}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const payload = {
        image: imageBase64,
        mimeType: request.mimeType || "image/png",
        language: request.language,
        options: request.options,
      };

      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: reqHeaders,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(
          `Generic HTTP OCR endpoint failed with status ${response.status}: ${response.statusText}`
        );
      }

      const json = (await response.json()) as Record<string, unknown>;
      const extractedText = this.extractTextByPath(json, this.textJsonPath);

      const cleanText = extractedText.trim();
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
          endpoint: this.endpoint,
        },
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private resolveImageBase64(request: OcrRequest): string | undefined {
    if (request.imageBase64) {
      return request.imageBase64.replace(/^data:image\/\w+;base64,/, "");
    }
    if (request.imageBuffer) {
      return request.imageBuffer.toString("base64");
    }
    return undefined;
  }

  private extractTextByPath(obj: Record<string, unknown>, pathStr: string): string {
    if (typeof obj[pathStr] === "string") {
      return obj[pathStr] as string;
    }
    if (typeof obj.text === "string") return obj.text;
    if (typeof obj.content === "string") return obj.content;
    if (typeof obj.markdown === "string") return obj.markdown;

    // Dot-notation traversal
    const parts = pathStr.split(".");
    let current: unknown = obj;
    for (const part of parts) {
      if (current && typeof current === "object" && part in (current as Record<string, unknown>)) {
        current = (current as Record<string, unknown>)[part];
      } else {
        return "";
      }
    }
    return typeof current === "string" ? current : JSON.stringify(current || "");
  }
}
