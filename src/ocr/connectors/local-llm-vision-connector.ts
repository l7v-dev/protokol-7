/**
 * Local Multimodal Vision LLM OCR Connector.
 * Interfaces with locally running vision models (Ollama, llama.cpp, vLLM, LocalAI)
 * supporting models like llama3.2-vision, qwen2.5-vl, minicpm-v.
 */

import type { IOcrConnector, OcrPageResult, OcrRequest, OcrResult } from "../types";

export interface LocalLlmVisionOptions {
  endpoint?: string;
  model?: string;
  timeoutMs?: number;
  apiType?: "ollama" | "openai-compatible";
}

export class LocalLlmVisionOcrConnector implements IOcrConnector {
  public readonly name = "local-llm";

  private readonly endpoint: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly apiType: "ollama" | "openai-compatible";

  private static readonly DEFAULT_SYSTEM_PROMPT =
    "Transcribe all text, headings, tabular structures, and data from this document image accurately into clean Markdown format. Preserve layout, column alignment, and list hierarchies. Do not include conversational filler or chat preamble.";

  constructor(options?: LocalLlmVisionOptions) {
    const rawEndpoint =
      options?.endpoint || process.env.LOCAL_LLM_VISION_ENDPOINT || "http://127.0.0.1:11434";
    this.endpoint = rawEndpoint.replace(/\/+$/, "");
    this.model = options?.model || process.env.LOCAL_LLM_VISION_MODEL || "llama3.2-vision";
    this.timeoutMs = options?.timeoutMs ?? 30000;
    this.apiType =
      options?.apiType || (this.endpoint.includes("11434") ? "ollama" : "openai-compatible");
  }

  public async isAvailable(): Promise<boolean> {
    try {
      const pingUrl =
        this.apiType === "ollama" ? `${this.endpoint}/api/tags` : `${this.endpoint}/v1/models`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const response = await fetch(pingUrl, {
        method: "GET",
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
      throw new Error("LocalLlmVisionOcrConnector requires either imageBuffer or imageBase64.");
    }

    const prompt = request.prompt || LocalLlmVisionOcrConnector.DEFAULT_SYSTEM_PROMPT;

    const extractedText =
      this.apiType === "ollama"
        ? await this.callOllamaApi(imageBase64, prompt)
        : await this.callOpenAiCompatibleApi(imageBase64, prompt);

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
        model: this.model,
        endpoint: this.endpoint,
        apiType: this.apiType,
      },
    };
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

  private async callOllamaApi(imageBase64: string, prompt: string): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.endpoint}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          stream: false,
          messages: [
            {
              role: "user",
              content: prompt,
              images: [imageBase64],
            },
          ],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Ollama API returned HTTP ${response.status}: ${response.statusText}`);
      }

      const json = (await response.json()) as { message?: { content?: string } };
      return json.message?.content || "";
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async callOpenAiCompatibleApi(imageBase64: string, prompt: string): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.endpoint}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(
          `OpenAI-compatible Vision endpoint returned HTTP ${response.status}: ${response.statusText}`
        );
      }

      const json = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      return json.choices?.[0]?.message?.content || "";
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
