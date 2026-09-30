/**
 * OCR Connector Registry and Fallback Orchestrator.
 * Manages registered OCR connectors (Local LLM Vision, Cloud Vision, Mistral, Tesseract, Generic HTTP)
 * and coordinates automatic fallback execution.
 */

import { CloudVisionOcrConnector } from "./connectors/cloud-vision-connector";
import { GenericHttpOcrConnector } from "./connectors/generic-http-connector";
import { LocalLlmVisionOcrConnector } from "./connectors/local-llm-vision-connector";
import { LocalTesseractOcrConnector } from "./connectors/local-tesseract-connector";
import { MistralOcrConnector } from "./connectors/mistral-ocr-connector";
import { UnlimitedOcrConnector } from "./connectors/unlimited-ocr-connector";
import type { IOcrConnector, OcrPageResult, OcrRequest, OcrResult } from "./types";

export class NoAvailableOcrConnectorError extends Error {
  constructor(message = "No available OCR connector could process the request.") {
    super(message);
    this.name = "NoAvailableOcrConnectorError";
  }
}

export class OcrConnectorRegistry {
  private readonly connectors = new Map<string, IOcrConnector>();

  private readonly defaultFallbackOrder: string[] = [
    "unlimited-ocr",
    "local-llm",
    "cloud-vision",
    "mistral",
    "tesseract",
    "generic-http",
  ];

  constructor() {
    this.registerDefaults();
  }

  private registerDefaults(): void {
    this.register(new UnlimitedOcrConnector());
    this.register(new LocalLlmVisionOcrConnector());
    this.register(new CloudVisionOcrConnector());
    this.register(new MistralOcrConnector());
    this.register(new LocalTesseractOcrConnector());
    this.register(new GenericHttpOcrConnector());
  }

  public register(connector: IOcrConnector): void {
    this.connectors.set(connector.name, connector);
  }

  public unregister(name: string): boolean {
    return this.connectors.delete(name);
  }

  public get(name: string): IOcrConnector | undefined {
    return this.connectors.get(name);
  }

  public list(): string[] {
    return Array.from(this.connectors.keys());
  }

  public async getAvailable(): Promise<string[]> {
    const available: string[] = [];
    for (const [name, connector] of this.connectors.entries()) {
      try {
        if (await connector.isAvailable()) {
          available.push(name);
        }
      } catch {
        // Connector is offline or unavailable
      }
    }
    return available;
  }

  /**
   * Executes OCR on a single request with preferred connector selection and automatic fallback.
   */
  public async executeOcr(request: OcrRequest, preferredConnector?: string): Promise<OcrResult> {
    const candidates: string[] = [];

    if (preferredConnector) {
      if (this.connectors.has(preferredConnector)) {
        candidates.push(preferredConnector);
      } else {
        throw new Error(
          `Requested OCR connector "${preferredConnector}" is not registered. Available: ${this.list().join(", ")}`
        );
      }
    }

    // Append remaining connectors in fallback order
    for (const name of this.defaultFallbackOrder) {
      if (!candidates.includes(name) && this.connectors.has(name)) {
        candidates.push(name);
      }
    }

    let lastError: Error | null = null;

    for (const name of candidates) {
      const connector = this.connectors.get(name);
      if (!connector) continue;

      try {
        const isReady = await connector.isAvailable();
        if (!isReady) continue;

        return await connector.extract(request);
      } catch (err) {
        lastError = err as Error;
        // Proceed to next fallback connector
      }
    }

    throw new NoAvailableOcrConnectorError(
      `OCR extraction failed across all candidates [${candidates.join(", ")}]. Last error: ${lastError?.message || "None were available."}`
    );
  }

  /**
   * Performs multi-page OCR across an array of page image buffers.
   */
  public async executeMultiPageOcr(
    pageImages: Buffer[],
    preferredConnector?: string,
    options?: Record<string, unknown>
  ): Promise<OcrResult> {
    if (pageImages.length === 0) {
      throw new Error("No page images provided for multi-page OCR.");
    }

    const pages: OcrPageResult[] = [];
    let connectorName = "unknown";

    for (let i = 0; i < pageImages.length; i++) {
      const pageBuffer = pageImages[i];
      const pageResult = await this.executeOcr(
        {
          imageBuffer: pageBuffer,
          mimeType: "image/png",
          options,
        },
        preferredConnector
      );

      connectorName = pageResult.connectorName;
      pages.push({
        pageNumber: i + 1,
        text: pageResult.text,
      });
    }

    const fullText = pages.map((p) => p.text).join("\n\n");
    const totalChars = pages.reduce((acc, p) => acc + p.text.length, 0);
    const totalWords = fullText.length > 0 ? fullText.split(/\s+/).length : 0;

    return {
      connectorName,
      text: fullText,
      pages,
      totalCharacters: totalChars,
      totalWords,
      metadata: {
        totalPagesProcessed: pageImages.length,
      },
    };
  }
}

export const globalOcrRegistry = new OcrConnectorRegistry();
