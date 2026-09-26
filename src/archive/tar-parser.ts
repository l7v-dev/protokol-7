export interface TarEntry {
  path: string;
  size: number;
  isDirectory: boolean;
  data: Buffer;
  mtime?: number;
}

export class TarParser {
  private static readonly BLOCK_SIZE = 512;

  /**
   * Parses a POSIX ustar TAR archive buffer into individual entries.
   * Zero external dependencies.
   */
  public static parse(buffer: Buffer): TarEntry[] {
    const entries: TarEntry[] = [];
    let offset = 0;

    while (offset + TarParser.BLOCK_SIZE <= buffer.length) {
      const headerBlock = buffer.subarray(offset, offset + TarParser.BLOCK_SIZE);

      // Check for zero block (end of archive)
      if (TarParser.isZeroBlock(headerBlock)) {
        // Look ahead for second zero block or end
        break;
      }

      // 1. File Name (bytes 0 - 99)
      const rawName = TarParser.readNullTerminatedString(headerBlock, 0, 100);

      // 2. File Size (bytes 124 - 135, octal string)
      const rawSizeStr = TarParser.readNullTerminatedString(headerBlock, 124, 12);
      const size = Number.parseInt(rawSizeStr.trim(), 8);
      const validSize = Number.isNaN(size) || size < 0 ? 0 : size;

      // 3. Type Flag (byte 156)
      const typeFlag = String.fromCharCode(headerBlock[156]);
      const isDirectory = typeFlag === "5" || rawName.endsWith("/");

      // 4. USTAR Prefix for extended paths (bytes 345 - 499)
      const ustarPrefix = TarParser.readNullTerminatedString(headerBlock, 345, 155);
      const fullPath = ustarPrefix ? `${ustarPrefix}/${rawName}` : rawName;

      // 5. Data Blocks
      offset += TarParser.BLOCK_SIZE;

      let fileData = Buffer.alloc(0);
      if (!isDirectory && validSize > 0) {
        const dataEnd = offset + validSize;
        if (dataEnd <= buffer.length) {
          fileData = buffer.subarray(offset, dataEnd);
        }
      }

      // Next header is aligned to 512-byte block boundary
      const padding =
        (TarParser.BLOCK_SIZE - (validSize % TarParser.BLOCK_SIZE)) % TarParser.BLOCK_SIZE;
      offset += validSize + padding;

      if (fullPath.length > 0) {
        entries.push({
          path: fullPath,
          size: validSize,
          isDirectory,
          data: fileData,
        });
      }
    }

    return entries;
  }

  private static isZeroBlock(block: Buffer): boolean {
    for (let i = 0; i < block.length; i++) {
      if (block[i] !== 0) return false;
    }
    return true;
  }

  private static readNullTerminatedString(buf: Buffer, start: number, len: number): string {
    const slice = buf.subarray(start, start + len);
    const nullIdx = slice.indexOf(0);
    const end = nullIdx === -1 ? slice.length : nullIdx;
    return slice.toString("utf8", 0, end).trim();
  }
}
