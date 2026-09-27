/**
 * Deduplication Engine.
 * Implements Exact Hash (SHA-256) and Near-Duplicate (64-bit SimHash) detection.
 */

import { createHash } from "node:crypto";

export interface DedupConfig {
  exact?: boolean;
  nearDuplicate?: boolean;
  maxHammingDistance?: number;
  action?: "drop" | "flag";
  contentFieldNames?: string[];
}

export interface DedupResult {
  isDuplicate: boolean;
  duplicateType?: "exact" | "near";
  matchHash?: string;
  hammingDistance?: number;
  simHashHex?: string;
}

const DEFAULT_DEDUP_CONFIG: Required<DedupConfig> = {
  exact: true,
  nearDuplicate: false,
  maxHammingDistance: 8,
  action: "drop",
  contentFieldNames: ["normalized_sha256", "raw_sha256", "content", "markdown", "text"],
};

export class DedupFilter {
  private readonly config: Required<DedupConfig>;
  private readonly seenExactHashes = new Set<string>();
  private readonly seenSimHashes: Array<{ hash: bigint; id: string }> = [];

  constructor(config?: DedupConfig) {
    this.config = { ...DEFAULT_DEDUP_CONFIG, ...config };
  }

  /**
   * Resets the seen fingerprints.
   */
  reset(): void {
    this.seenExactHashes.clear();
    this.seenSimHashes.length = 0;
  }

  /**
   * Computes a 64-bit FNV-1a hash of a token string.
   */
  private fnv1a64(str: string): bigint {
    let hash = 0xcbf29ce484222325n;
    const prime = 0x100000001b3n;

    for (let i = 0; i < str.length; i++) {
      hash ^= BigInt(str.charCodeAt(i));
      hash = (hash * prime) & 0xffffffffffffffffn;
    }
    return hash;
  }

  /**
   * Computes 64-bit SimHash fingerprint for text using word 3-grams.
   */
  computeSimHash(text: string): bigint {
    const words = text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, "")
      .split(/\s+/)
      .filter((w) => w.length > 0);

    if (words.length === 0) {
      return 0n;
    }

    const vector = new Int32Array(64);

    // Generate word 3-grams or single words if text is short
    const tokens: string[] = [];
    if (words.length < 3) {
      tokens.push(...words);
    } else {
      for (let i = 0; i <= words.length - 3; i++) {
        tokens.push(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
      }
    }

    for (const token of tokens) {
      const tokenHash = this.fnv1a64(token);
      for (let bit = 0; bit < 64; bit++) {
        if ((tokenHash >> BigInt(bit)) & 1n) {
          vector[bit]++;
        } else {
          vector[bit]--;
        }
      }
    }

    let fingerprint = 0n;
    for (let bit = 0; bit < 64; bit++) {
      if (vector[bit] > 0) {
        fingerprint |= 1n << BigInt(bit);
      }
    }

    return fingerprint;
  }

  /**
   * Computes the bitwise Hamming distance between two 64-bit SimHashes.
   */
  hammingDistance(a: bigint, b: bigint): number {
    let xor = a ^ b;
    let dist = 0;
    while (xor > 0n) {
      dist += Number(xor & 1n);
      xor >>= 1n;
    }
    return dist;
  }

  /**
   * Extracts or computes exact SHA-256 fingerprint and text content from item.
   */
  private extractFingerprints(item: Record<string, unknown>): {
    exactHash: string;
    text: string;
  } {
    if (typeof item.normalized_sha256 === "string" && item.normalized_sha256) {
      return {
        exactHash: item.normalized_sha256,
        text: (item.content || item.markdown || item.text || "") as string,
      };
    }
    if (typeof item.raw_sha256 === "string" && item.raw_sha256) {
      return {
        exactHash: item.raw_sha256,
        text: (item.content || item.markdown || item.text || "") as string,
      };
    }

    for (const f of this.config.contentFieldNames) {
      if (typeof item[f] === "string" && item[f]) {
        const text = item[f] as string;
        const hash = createHash("sha256").update(text, "utf8").digest("hex");
        return { exactHash: hash, text };
      }
    }

    const fallbackJson = JSON.stringify(item);
    const hash = createHash("sha256").update(fallbackJson).digest("hex");
    return { exactHash: hash, text: fallbackJson };
  }

  /**
   * Checks whether an item is an exact or near duplicate.
   */
  evaluate(item: Record<string, unknown>, itemId = ""): DedupResult {
    const { exactHash, text } = this.extractFingerprints(item);

    // 1. Exact Deduplication
    if (this.config.exact) {
      if (this.seenExactHashes.has(exactHash)) {
        return {
          isDuplicate: true,
          duplicateType: "exact",
          matchHash: exactHash,
        };
      }
    }

    // 2. Near-Duplicate Detection (SimHash)
    let simHashHex: string | undefined;
    if (this.config.nearDuplicate && text.length >= 50) {
      const currentSimHash = this.computeSimHash(text);
      simHashHex = currentSimHash.toString(16).padStart(16, "0");

      for (const entry of this.seenSimHashes) {
        const distance = this.hammingDistance(currentSimHash, entry.hash);
        if (distance <= this.config.maxHammingDistance) {
          return {
            isDuplicate: true,
            duplicateType: "near",
            matchHash: entry.id,
            hammingDistance: distance,
            simHashHex,
          };
        }
      }

      this.seenSimHashes.push({ hash: currentSimHash, id: exactHash || itemId });
    }

    // Register exact hash if unique
    if (this.config.exact) {
      this.seenExactHashes.add(exactHash);
    }

    return {
      isDuplicate: false,
      simHashHex,
    };
  }

  /**
   * Filters an array of items, eliminating duplicates according to policy.
   */
  filterBatch<T extends Record<string, unknown>>(items: T[]): T[] {
    const output: T[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const dedupResult = this.evaluate(item, `item_${i}`);

      if (dedupResult.isDuplicate && this.config.action === "drop") {
        continue;
      }

      const cloned = { ...item } as Record<string, unknown>;
      if (dedupResult.simHashHex) {
        cloned.simhash_64 = dedupResult.simHashHex;
      }
      if (dedupResult.isDuplicate) {
        cloned.is_duplicate = true;
        cloned.duplicate_type = dedupResult.duplicateType;
        cloned.duplicate_match = dedupResult.matchHash;
      }

      output.push(cloned as T);
    }

    return output;
  }
}
