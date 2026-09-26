/**
 * Output Sink implementations for collecting and streaming pipeline data.
 */

export interface OutputSink {
  write(items: unknown[]): Promise<void> | void;
  close(): Promise<void> | void;
  getItems(): unknown[];
  getItemCount(): number;
  getByteLength(): number;
}

/**
 * Buffered sink accumulating raw items in memory.
 */
export class BufferedSink implements OutputSink {
  private readonly items: unknown[] = [];
  private totalBytes = 0;

  write(newItems: unknown[]): void {
    for (const item of newItems) {
      this.items.push(item);
      this.totalBytes += Buffer.byteLength(JSON.stringify(item), "utf8");
    }
  }

  close(): void {
    // No-op for in-memory buffer
  }

  getItems(): unknown[] {
    return this.items;
  }

  getItemCount(): number {
    return this.items.length;
  }

  getByteLength(): number {
    return this.totalBytes;
  }
}

/**
 * Streaming sink for pipeline outputs.
 */
export class StreamSink implements OutputSink {
  private readonly items: unknown[] = [];
  private totalBytes = 0;
  private isClosed = false;

  write(newItems: unknown[]): void {
    if (this.isClosed) {
      throw new Error("Cannot write to closed StreamSink");
    }
    for (const item of newItems) {
      this.items.push(item);
      this.totalBytes += Buffer.byteLength(JSON.stringify(item), "utf8");
    }
  }

  close(): void {
    this.isClosed = true;
  }

  getItems(): unknown[] {
    return this.items;
  }

  getItemCount(): number {
    return this.items.length;
  }

  getByteLength(): number {
    return this.totalBytes;
  }
}
