/**
 * Core type declarations and contracts for the OCR subsystem.
 * Standardizes request, response, and connector abstractions.
 */

export type OcrConnectorType =
  | "local-llm"
  | "cloud-vision"
  | "mistral"
  | "tesseract"
  | "generic-http";

export interface OcrRequest {
  imageBuffer?: Buffer;
  imageBase64?: string;
  mimeType?: string;
  language?: string;
  prompt?: string;
  options?: Record<string, unknown>;
}

export interface OcrPageResult {
  pageNumber: number;
  text: string;
  confidence?: number;
  detectedLanguage?: string;
}

export interface OcrResult {
  connectorName: string;
  text: string;
  pages: OcrPageResult[];
  totalCharacters: number;
  totalWords: number;
  metadata?: Record<string, unknown>;
}

export interface IOcrConnector {
  readonly name: string;
  isAvailable(): Promise<boolean>;
  extract(request: OcrRequest): Promise<OcrResult>;
}
