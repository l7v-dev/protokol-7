/**
 * Mistral AI Document OCR Connector.
 * Uses Mistral OCR API (v1/ocr) to extract high-fidelity markdown
 * representations of document pages.
 */

import type { IOcrConnector, OcrPageResult, OcrRequest, OcrResult } from "../types";

export interface MistralOcrOptions {
  apiKey?: string;
  endpoint?: string;
  model?: string;
  timeoutMs?: number;
}

export class MistralOcrConnector implements IOcrConnector {
  public readonly name = "mistral";

  private readonly apiKey?: string;
  private readonly endpoint: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(options?: MistralOcrOptions) {
    this.apiKey = options?.apiKey || process.env.MISTRAL_API_KEY;
    this.endpoint = options?.endpoint || "https://api.mistral.ai/v1/ocr";
    this.model = options?.model || "mistral-ocr-latest";
    this.timeoutMs = options?.timeoutMs ?? 30000;
  }

  public async isAvailable(): Promise<boolean> {
    return Boolean(this.apiKey || process.env.MISTRAL_API_KEY);
  }

  public async extract(request: OcrRequest): Promise<OcrResult> {
    const imageBase64 = this.resolveImageBase64(request);
    if (!imageBase64) {
      throw new Error("MistralOcrConnector requires either imageBuffer or imageBase64.");
    }

    const key = this.apiKey || process.env.MISTRAL_API_KEY;
    if (!key) {
      throw new Error("MistralOcrConnector requires a valid MISTRAL_API_KEY.");
    }

    const mime = request.mimeType || "image/png";
    const dataUrl = `data:${mime};base64,${imageBase64}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const payload = {
        model: this.model,
        document: {
          type: "image_url",
          image_url: dataUrl,
        },
      };

      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(
          `Mistral OCR API failed with status ${response.status}: ${response.statusText}`
        );
      }

      interface MistralApiResponse {
        pages?: Array<{
          index?: number;
          markdown?: string;
        }>;
      }

      const json = (await response.json()) as MistralApiResponse;
      const rawPages = json.pages || [];

      const pages: OcrPageResult[] = rawPages.map((p, idx) => ({
        pageNumber: (p.index ?? idx) + 1,
        text: (p.markdown || "").trim(),
      }));

      const fullText = pages.map((p) => p.text).join("\n\n");
      const totalChars = pages.reduce((acc, p) => acc + p.text.length, 0);
      const totalWords = fullText.length > 0 ? fullText.split(/\s+/).length : 0;

      return {
        connectorName: this.name,
        text: fullText,
        pages,
        totalCharacters: totalChars,
        totalWords,
        metadata: {
          model: this.model,
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
}
