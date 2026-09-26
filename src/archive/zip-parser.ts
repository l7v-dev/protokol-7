import { inflateRawSync } from "node:zlib";

export interface ZipEntryData {
  path: string;
  compressedSize: number;
  uncompressedSize: number;
  compressionMethod: number;
  isDirectory: boolean;
  data: Buffer;
}

export class ZipParser {
  private static readonly LOCAL_FILE_HEADER_SIG = 0x04034b50;
  private static readonly CENTRAL_DIRECTORY_SIG = 0x02014b50;

  /**
   * Parses a ZIP archive buffer into individual file entries.
   * Supports Stored (0) and Deflated (8) entries using native Node.js zlib.
   */
  public static parse(buffer: Buffer): ZipEntryData[] {
    // Attempt parsing via Central Directory first (most accurate for streamed archives)
    const centralEntries = ZipParser.parseCentralDirectory(buffer);
    if (centralEntries.length > 0) {
      return centralEntries;
    }

    // Fallback: parse through Local File Headers
    return ZipParser.parseLocalHeaders(buffer);
  }

  private static parseLocalHeaders(buffer: Buffer): ZipEntryData[] {
    const entries: ZipEntryData[] = [];
    let offset = 0;

    while (offset < buffer.length - 30) {
      const signature = buffer.readUInt32LE(offset);
      if (signature !== ZipParser.LOCAL_FILE_HEADER_SIG) {
        break;
      }

      const compressionMethod = buffer.readUInt16LE(offset + 8);
      const compressedSize = buffer.readUInt32LE(offset + 18);
      const uncompressedSize = buffer.readUInt32LE(offset + 22);
      const fileNameLength = buffer.readUInt16LE(offset + 26);
      const extraFieldLength = buffer.readUInt16LE(offset + 28);

      const fileNameStart = offset + 30;
      const fileName = buffer
        .toString("utf8", fileNameStart, fileNameStart + fileNameLength)
        .replace(/\\/g, "/");

      const isDirectory = fileName.endsWith("/");
      const dataStart = fileNameStart + fileNameLength + extraFieldLength;
      const dataEnd = dataStart + compressedSize;

      let fileData = Buffer.alloc(0);
      if (!isDirectory && dataEnd <= buffer.length) {
        const rawSlice = buffer.subarray(dataStart, dataEnd);
        if (compressionMethod === 0) {
          fileData = rawSlice;
        } else if (compressionMethod === 8) {
          try {
            fileData = inflateRawSync(rawSlice);
          } catch {
            fileData = Buffer.alloc(0);
          }
        }
      }

      entries.push({
        path: fileName,
        compressedSize,
        uncompressedSize,
        compressionMethod,
        isDirectory,
        data: fileData,
      });

      offset = dataEnd;
    }

    return entries;
  }

  private static parseCentralDirectory(buffer: Buffer): ZipEntryData[] {
    const entries: ZipEntryData[] = [];
    let offset = 0;

    // Scan for central directory entries (0x02014b50)
    while (offset < buffer.length - 46) {
      const signature = buffer.readUInt32LE(offset);
      if (signature === ZipParser.CENTRAL_DIRECTORY_SIG) {
        const compressionMethod = buffer.readUInt16LE(offset + 10);
        const compressedSize = buffer.readUInt32LE(offset + 20);
        const uncompressedSize = buffer.readUInt32LE(offset + 24);
        const fileNameLength = buffer.readUInt16LE(offset + 28);
        const extraFieldLength = buffer.readUInt16LE(offset + 30);
        const commentLength = buffer.readUInt16LE(offset + 32);
        const localHeaderOffset = buffer.readUInt32LE(offset + 42);

        const fileNameStart = offset + 46;
        const fileName = buffer
          .toString("utf8", fileNameStart, fileNameStart + fileNameLength)
          .replace(/\\/g, "/");

        const isDirectory = fileName.endsWith("/");

        // Extract data using local header offset
        let fileData = Buffer.alloc(0);
        if (!isDirectory && localHeaderOffset < buffer.length - 30) {
          const localSig = buffer.readUInt32LE(localHeaderOffset);
          if (localSig === ZipParser.LOCAL_FILE_HEADER_SIG) {
            const localNameLen = buffer.readUInt16LE(localHeaderOffset + 26);
            const localExtraLen = buffer.readUInt16LE(localHeaderOffset + 28);
            const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
            const dataEnd = dataStart + compressedSize;

            if (dataEnd <= buffer.length) {
              const rawSlice = buffer.subarray(dataStart, dataEnd);
              if (compressionMethod === 0) {
                fileData = rawSlice;
              } else if (compressionMethod === 8) {
                try {
                  fileData = inflateRawSync(rawSlice);
                } catch {
                  fileData = Buffer.alloc(0);
                }
              }
            }
          }
        }

        entries.push({
          path: fileName,
          compressedSize,
          uncompressedSize,
          compressionMethod,
          isDirectory,
          data: fileData,
        });

        offset += 46 + fileNameLength + extraFieldLength + commentLength;
      } else {
        offset++;
      }
    }

    return entries;
  }
}
