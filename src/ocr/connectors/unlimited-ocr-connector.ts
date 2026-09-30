/**
 * Baidu Unlimited-OCR Vision Connector.
 * Connects to a vLLM or OpenAI-compatible server running baidu/Unlimited-OCR
 * for long-horizon multi-page PDF document and table parsing.
 */

import type { IOcrConnector, OcrPageResult, OcrRequest, OcrResult } from "../types";

export interface UnlimitedOcrOptions {
  endpoint?: string;
  model?: string;
  timeoutMs?: number;
  apiKey?: string;
}

export class UnlimitedOcrConnector implements IOcrConnector {
  public readonly name = "unlimited-ocr";

  private readonly endpoint: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly apiKey?: string;

  private static readonly DEFAULT_PROMPT = "<image>document parsing.";

  constructor(options?: UnlimitedOcrOptions) {
    const rawEndpoint =
      options?.endpoint || process.env.UNLIMITED_OCR_ENDPOINT || "http://127.0.0.1:8000";
    this.endpoint = rawEndpoint.replace(/\/+$/, "");
    this.model = options?.model || process.env.UNLIMITED_OCR_MODEL || "baidu/Unlimited-OCR";
    this.timeoutMs = options?.timeoutMs ?? 60000;
    this.apiKey = options?.apiKey || process.env.UNLIMITED_OCR_API_KEY;
  }

  public async isAvailable(): Promise<boolean> {
    try {
      const pingUrl = `${this.endpoint}/v1/models`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const headers: Record<string, string> = {};
      if (this.apiKey) {
        headers.Authorization = `Bearer ${this.apiKey}`;
      }

      const response = await fetch(pingUrl, {
        method: "GET",
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch {
      return false;
    }
  }

  public async extract(request: OcrRequest): Promise<OcrResult> {
    const imageBase64 = this.resolveImageBase64(request);
    if (!imageBase64) {
      throw new Error("UnlimitedOcrConnector requires either imageBuffer or imageBase64.");
    }

    const prompt = request.prompt || UnlimitedOcrConnector.DEFAULT_PROMPT;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (this.apiKey) {
        headers.Authorization = `Bearer ${this.apiKey}`;
      }

      const response = await fetch(`${this.endpoint}/v1/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:image/png;base64,${imageBase64}`,
                  },
                },
              ],
            },
          ],
          max_tokens: 4096,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(
          `Unlimited-OCR endpoint returned HTTP ${response.status}: ${response.statusText}`
        );
      }

      const json = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };

      const extractedText = (json.choices?.[0]?.message?.content || "").trim();
      const words = extractedText.length > 0 ? extractedText.split(/\s+/).length : 0;

      const pageResult: OcrPageResult = {
        pageNumber: 1,
        text: extractedText,
      };

      return {
        connectorName: this.name,
        text: extractedText,
        pages: [pageResult],
        totalCharacters: extractedText.length,
        totalWords: words,
        metadata: {
          model: this.model,
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
}
