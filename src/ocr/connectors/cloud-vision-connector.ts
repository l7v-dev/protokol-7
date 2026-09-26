/**
 * Google Cloud Vision OCR Connector.
 * Uses Google Cloud Vision REST API (DOCUMENT_TEXT_DETECTION)
 * with API Key or Application Default Credentials.
 */

import type { IOcrConnector, OcrPageResult, OcrRequest, OcrResult } from "../types";

export interface CloudVisionOptions {
  apiKey?: string;
  endpoint?: string;
  timeoutMs?: number;
}

export class CloudVisionOcrConnector implements IOcrConnector {
  public readonly name = "cloud-vision";

  private readonly apiKey?: string;
  private readonly endpoint: string;
  private readonly timeoutMs: number;

  constructor(options?: CloudVisionOptions) {
    this.apiKey = options?.apiKey || process.env.GOOGLE_VISION_API_KEY;
    this.endpoint = options?.endpoint || "https://vision.googleapis.com/v1/images:annotate";
    this.timeoutMs = options?.timeoutMs ?? 25000;
  }

  public async isAvailable(): Promise<boolean> {
    return Boolean(
      this.apiKey || process.env.GOOGLE_VISION_API_KEY || process.env.GOOGLE_APPLICATION_CREDENTIALS
    );
  }

  public async extract(request: OcrRequest): Promise<OcrResult> {
    const imageBase64 = this.resolveImageBase64(request);
    if (!imageBase64) {
      throw new Error("CloudVisionOcrConnector requires either imageBuffer or imageBase64.");
    }

    const key = this.apiKey || process.env.GOOGLE_VISION_API_KEY;
    if (!key) {
      throw new Error("CloudVisionOcrConnector requires a valid Google Vision API key.");
    }

    const targetUrl = `${this.endpoint}?key=${encodeURIComponent(key)}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const payload = {
        requests: [
          {
            image: { content: imageBase64 },
            features: [
              {
                type: "DOCUMENT_TEXT_DETECTION",
                maxResults: 1,
              },
            ],
            imageContext: request.language ? { languageHints: [request.language] } : undefined,
          },
        ],
      };

      const response = await fetch(targetUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(
          `Google Cloud Vision API failed with status ${response.status}: ${response.statusText}`
        );
      }

      interface VisionApiResponse {
        responses?: Array<{
          fullTextAnnotation?: { text?: string };
          textAnnotations?: Array<{ description?: string; confidence?: number }>;
          error?: { message?: string };
        }>;
      }

      const json = (await response.json()) as VisionApiResponse;
      const firstResponse = json.responses?.[0];

      if (firstResponse?.error?.message) {
        throw new Error(`Google Cloud Vision API error: ${firstResponse.error.message}`);
      }

      const extractedText =
        firstResponse?.fullTextAnnotation?.text ||
        firstResponse?.textAnnotations?.[0]?.description ||
        "";

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
          confidence: firstResponse?.textAnnotations?.[0]?.confidence,
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
