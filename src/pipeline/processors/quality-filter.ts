/**
 * Quality Filter Processor.
 * Implements FineWeb and Gopher heuristic metrics and filtering gates:
 * word count, symbol ratio, character distribution, and line repetition.
 */

export interface QualityMetrics {
  charCount: number;
  wordCount: number;
  estimatedTokens: number;
  symbolRatio: number;
  alphaRatio: number;
  duplicateLineFraction: number;
  ellipsisLineFraction: number;
  meanWordLength: number;
}

export interface QualityGateConfig {
  minWords?: number;
  maxWords?: number;
  minCharCount?: number;
  maxSymbolRatio?: number;
  minAlphaRatio?: number;
  maxDuplicateLineFraction?: number;
  maxEllipsisLineFraction?: number;
  action?: "drop" | "flag";
  contentFieldNames?: string[];
}

export interface QualityEvaluationResult {
  passed: boolean;
  reasons: string[];
  metrics: QualityMetrics;
}

const DEFAULT_GATE_CONFIG: Required<QualityGateConfig> = {
  minWords: 30,
  maxWords: 500000,
  minCharCount: 100,
  maxSymbolRatio: 0.2,
  minAlphaRatio: 0.6,
  maxDuplicateLineFraction: 0.35,
  maxEllipsisLineFraction: 0.3,
  action: "drop",
  contentFieldNames: ["content", "markdown", "text", "body", "rawContent"],
};

export class QualityFilter {
  private readonly config: Required<QualityGateConfig>;

  constructor(config?: QualityGateConfig) {
    this.config = { ...DEFAULT_GATE_CONFIG, ...config };
  }

  /**
   * Calculates comprehensive FineWeb / Gopher heuristic quality metrics for a text.
   */
  calculateMetrics(text: string): QualityMetrics {
    if (!text || text.trim().length === 0) {
      return {
        charCount: 0,
        wordCount: 0,
        estimatedTokens: 0,
        symbolRatio: 0,
        alphaRatio: 0,
        duplicateLineFraction: 0,
        ellipsisLineFraction: 0,
        meanWordLength: 0,
      };
    }

    const trimmed = text.trim();
    const charCount = trimmed.length;
    const words = trimmed.split(/\s+/).filter(Boolean);
    const wordCount = words.length;
    const estimatedTokens = Math.ceil(charCount / 4);

    // Alpha and symbol counting
    let alphaCount = 0;
    let symbolCount = 0;
    let totalWordLength = 0;

    for (let i = 0; i < charCount; i++) {
      // Letters (ASCII + Latin extended / basic Unicode check)
      const ch = trimmed[i];
      if (/\p{L}/u.test(ch)) {
        alphaCount++;
      } else if (/[!@#$%^&*()_+=[\]{};':"\\|,.<>/?~`§±]/.test(ch)) {
        symbolCount++;
      }
    }

    for (const w of words) {
      totalWordLength += w.length;
    }

    const alphaRatio = charCount > 0 ? alphaCount / charCount : 0;
    const symbolRatio = charCount > 0 ? symbolCount / charCount : 0;
    const meanWordLength = wordCount > 0 ? totalWordLength / wordCount : 0;

    // Line analysis: repetition and ellipses
    const lines = trimmed
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    let duplicateLineFraction = 0;
    let ellipsisLineFraction = 0;

    if (lines.length > 0) {
      const seen = new Set<string>();
      let duplicateCount = 0;
      let ellipsisCount = 0;

      for (const line of lines) {
        if (seen.has(line)) {
          duplicateCount++;
        } else {
          seen.add(line);
        }

        if (line.endsWith("...") || line.endsWith("…")) {
          ellipsisCount++;
        }
      }

      duplicateLineFraction = duplicateCount / lines.length;
      ellipsisLineFraction = ellipsisCount / lines.length;
    }

    return {
      charCount,
      wordCount,
      estimatedTokens,
      symbolRatio: Number(symbolRatio.toFixed(4)),
      alphaRatio: Number(alphaRatio.toFixed(4)),
      duplicateLineFraction: Number(duplicateLineFraction.toFixed(4)),
      ellipsisLineFraction: Number(ellipsisLineFraction.toFixed(4)),
      meanWordLength: Number(meanWordLength.toFixed(2)),
    };
  }

  /**
   * Evaluates text against configured Quality Gate criteria.
   */
  evaluate(text: string): QualityEvaluationResult {
    const metrics = this.calculateMetrics(text);
    const reasons: string[] = [];

    if (metrics.wordCount < this.config.minWords) {
      reasons.push(
        `Word count (${metrics.wordCount}) below minimum threshold (${this.config.minWords})`
      );
    }

    if (metrics.wordCount > this.config.maxWords) {
      reasons.push(
        `Word count (${metrics.wordCount}) exceeds maximum threshold (${this.config.maxWords})`
      );
    }

    if (metrics.charCount < this.config.minCharCount) {
      reasons.push(
        `Character count (${metrics.charCount}) below minimum threshold (${this.config.minCharCount})`
      );
    }

    if (metrics.symbolRatio > this.config.maxSymbolRatio) {
      reasons.push(
        `Symbol ratio (${metrics.symbolRatio}) exceeds maximum threshold (${this.config.maxSymbolRatio})`
      );
    }

    if (metrics.alphaRatio < this.config.minAlphaRatio) {
      reasons.push(
        `Alpha ratio (${metrics.alphaRatio}) below minimum threshold (${this.config.minAlphaRatio})`
      );
    }

    if (metrics.duplicateLineFraction > this.config.maxDuplicateLineFraction) {
      reasons.push(
        `Duplicate line fraction (${metrics.duplicateLineFraction}) exceeds maximum threshold (${this.config.maxDuplicateLineFraction})`
      );
    }

    if (metrics.ellipsisLineFraction > this.config.maxEllipsisLineFraction) {
      reasons.push(
        `Ellipsis line fraction (${metrics.ellipsisLineFraction}) exceeds maximum threshold (${this.config.maxEllipsisLineFraction})`
      );
    }

    return {
      passed: reasons.length === 0,
      reasons,
      metrics,
    };
  }

  /**
   * Processes a document item through the quality gate.
   * If action is 'drop' and item fails, returns null.
   * If action is 'flag', attaches quality evaluation metadata to item.
   */
  processItem<T extends Record<string, unknown>>(item: T): T | null {
    let text = "";
    for (const field of this.config.contentFieldNames) {
      if (typeof item[field] === "string" && item[field]) {
        text = item[field] as string;
        break;
      }
    }

    const evaluation = this.evaluate(text);

    if (!evaluation.passed && this.config.action === "drop") {
      return null;
    }

    const output = { ...item } as Record<string, unknown>;
    output.quality_metrics = evaluation.metrics;
    output.quality_passed = evaluation.passed;
    if (!evaluation.passed) {
      output.quality_veto_reasons = evaluation.reasons;
    }

    return output as T;
  }

  /**
   * Filters an array of items according to the configured quality gate.
   */
  filterBatch<T extends Record<string, unknown>>(items: T[]): T[] {
    const passed: T[] = [];
    for (const it of items) {
      const result = this.processItem(it);
      if (result !== null) {
        passed.push(result);
      }
    }
    return passed;
  }
}
