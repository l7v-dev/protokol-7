import { inflateRawSync } from "node:zlib";
import type { DocumentSpreadsheetSheet } from "../api/types";

export interface ZipEntry {
  path: string;
  compressedSize: number;
  uncompressedSize: number;
  compressionMethod: number;
  data: Buffer;
}

export interface DocxExtractionResult {
  fullText: string;
  totalCharacters: number;
  totalWords: number;
  paragraphs: string[];
  markdownTables: string[];
  metadata: {
    title?: string;
    author?: string;
    lastModifiedBy?: string;
    created?: string;
    modified?: string;
  };
}

export interface XlsxExtractionResult {
  fullText: string;
  totalCharacters: number;
  totalWords: number;
  sheets: DocumentSpreadsheetSheet[];
  metadata: {
    title?: string;
    author?: string;
    created?: string;
  };
}

export class OfficeExtractor {
  /**
   * Unpacks raw ZIP entries using standard Central Directory and Local Header parsers.
   * Zero external dependencies using native Node.js zlib.
   */
  public static readZipEntries(buffer: Buffer): Map<string, Buffer> {
    const entries = new Map<string, Buffer>();
    let offset = 0;

    // Fast-path: iterate Local File Headers (signature: 0x04034b50)
    while (offset < buffer.length - 30) {
      const signature = buffer.readUInt32LE(offset);
      if (signature !== 0x04034b50) {
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

      const dataStart = fileNameStart + fileNameLength + extraFieldLength;
      const dataEnd = dataStart + compressedSize;

      if (dataEnd <= buffer.length) {
        const rawSlice = buffer.subarray(dataStart, dataEnd);
        let decompressed: Buffer;

        if (compressionMethod === 0) {
          decompressed = rawSlice;
        } else if (compressionMethod === 8) {
          try {
            decompressed = inflateRawSync(rawSlice);
          } catch {
            decompressed = Buffer.alloc(0);
          }
        } else {
          decompressed = Buffer.alloc(0);
        }

        if (decompressed.length > 0 || uncompressedSize === 0) {
          entries.set(fileName, decompressed);
        }
      }

      offset = dataEnd;
    }

    return entries;
  }

  /**
   * Extracts text, paragraphs, tables, and metadata from Microsoft Word (.docx) documents.
   */
  public static extractDocx(buffer: Buffer): DocxExtractionResult {
    const zipEntries = OfficeExtractor.readZipEntries(buffer);
    const documentXml = zipEntries.get("word/document.xml");

    if (!documentXml) {
      throw new Error("Invalid DOCX archive: Missing 'word/document.xml' component.");
    }

    const xmlStr = documentXml.toString("utf8");

    // 1. Extract metadata from docProps/core.xml if present
    const metadata: DocxExtractionResult["metadata"] = {};
    const coreXml = zipEntries.get("docProps/core.xml");
    if (coreXml) {
      const coreStr = coreXml.toString("utf8");
      metadata.title = OfficeExtractor.extractXmlTagValue(coreStr, "dc:title");
      metadata.author = OfficeExtractor.extractXmlTagValue(coreStr, "dc:creator");
      metadata.lastModifiedBy = OfficeExtractor.extractXmlTagValue(coreStr, "cp:lastModifiedBy");
      metadata.created = OfficeExtractor.extractXmlTagValue(coreStr, "dcterms:created");
      metadata.modified = OfficeExtractor.extractXmlTagValue(coreStr, "dcterms:modified");
    }

    // 2. Extract tables (<w:tbl>...</w:tbl>)
    const markdownTables: string[] = [];
    const tblMatches = xmlStr.matchAll(/<w:tbl[\s>][\s\S]*?<\/w:tbl>/g);
    for (const tblMatch of tblMatches) {
      const tableXml = tblMatch[0];
      const tableMarkdown = OfficeExtractor.parseDocxTable(tableXml);
      if (tableMarkdown) {
        markdownTables.push(tableMarkdown);
      }
    }

    // 3. Extract text paragraphs (<w:p>...</w:p>) outside tables
    const nonTableXml = xmlStr.replace(/<w:tbl[\s>][\s\S]*?<\/w:tbl>/g, "");
    const paragraphs: string[] = [];
    const pMatches = nonTableXml.matchAll(/<w:p[\s>][\s\S]*?<\/w:p>/g);
    for (const pMatch of pMatches) {
      const pXml = pMatch[0];
      const pText = OfficeExtractor.extractTextFromP(pXml);
      if (pText.length > 0) {
        paragraphs.push(pText);
      }
    }

    const combinedParts: string[] = [];
    if (paragraphs.length > 0) {
      combinedParts.push(paragraphs.join("\n\n"));
    }
    if (markdownTables.length > 0) {
      combinedParts.push(markdownTables.join("\n\n"));
    }

    const fullText = combinedParts.join("\n\n");
    const totalCharacters = fullText.length;
    const totalWords = totalCharacters > 0 ? fullText.trim().split(/\s+/).length : 0;

    return {
      fullText,
      totalCharacters,
      totalWords,
      paragraphs,
      markdownTables,
      metadata,
    };
  }

  /**
   * Extracts sheets, cell values, and formatted tables from Microsoft Excel (.xlsx) spreadsheets.
   */
  public static extractXlsx(buffer: Buffer): XlsxExtractionResult {
    const zipEntries = OfficeExtractor.readZipEntries(buffer);

    // 1. Shared Strings Table (xl/sharedStrings.xml)
    const sharedStrings: string[] = [];
    const sharedStringsXml = zipEntries.get("xl/sharedStrings.xml");
    if (sharedStringsXml) {
      const strXml = sharedStringsXml.toString("utf8");
      const siMatches = strXml.matchAll(/<si[\s>][\s\S]*?<\/si>/g);
      for (const siMatch of siMatches) {
        const textValues: string[] = [];
        const tMatches = siMatch[0].matchAll(/<t(?:\s+[^>]*)?>([\s\S]*?)<\/t>/g);
        for (const tMatch of tMatches) {
          textValues.push(OfficeExtractor.decodeXmlEntities(tMatch[1]));
        }
        sharedStrings.push(textValues.join(""));
      }
    }

    // 2. Discover Sheet Names from xl/workbook.xml
    const sheetNameMap = new Map<string, string>();
    const workbookXml = zipEntries.get("xl/workbook.xml");
    if (workbookXml) {
      const wbStr = workbookXml.toString("utf8");
      const sheetMatches = wbStr.matchAll(
        /<sheet\s+[^>]*name="([^"]+)"[^>]*sheetId="([^"]+)"[^>]*\/>/g
      );
      for (const sMatch of sheetMatches) {
        const name = sMatch[1];
        const id = sMatch[2];
        sheetNameMap.set(`sheet${id}`, name);
      }
    }

    // 3. Parse Worksheet Files (xl/worksheets/sheet*.xml)
    const sheets: DocumentSpreadsheetSheet[] = [];
    const sheetFiles = Array.from(zipEntries.keys())
      .filter((k) => k.startsWith("xl/worksheets/sheet") && k.endsWith(".xml"))
      .sort();

    for (const sheetPath of sheetFiles) {
      const fileId = sheetPath.replace("xl/worksheets/", "").replace(".xml", "");
      const sheetName = sheetNameMap.get(fileId) || fileId;
      const sheetXml = zipEntries.get(sheetPath)?.toString("utf8") || "";

      const rawGrid: string[][] = [];
      const rowMatches = sheetXml.matchAll(/<row\s+[^>]*>([\s\S]*?)<\/row>/g);

      for (const rMatch of rowMatches) {
        const rowContent = rMatch[1];
        const rowCells: string[] = [];
        const cellMatches = rowContent.matchAll(/<c\s+([^>]*)>([\s\S]*?)<\/c>/g);

        for (const cMatch of cellMatches) {
          const attrs = cMatch[1];
          const inner = cMatch[2];
          const isSharedString = attrs.includes('t="s"');

          let cellVal = "";
          const vMatch = inner.match(/<v>([\s\S]*?)<\/v>/);
          if (vMatch) {
            const rawVal = vMatch[1].trim();
            if (isSharedString) {
              const idx = Number.parseInt(rawVal, 10);
              cellVal = !Number.isNaN(idx) && sharedStrings[idx] ? sharedStrings[idx] : rawVal;
            } else {
              cellVal = rawVal;
            }
          } else {
            const isMatch = inner.match(/<t[^>]*>([\s\S]*?)<\/t>/);
            if (isMatch) {
              cellVal = OfficeExtractor.decodeXmlEntities(isMatch[1]);
            }
          }

          rowCells.push(cellVal);
        }

        if (rowCells.some((c) => c.trim().length > 0)) {
          rawGrid.push(rowCells);
        }
      }

      if (rawGrid.length > 0) {
        const headers = rawGrid[0].map((h, i) => h.trim() || `col_${i + 1}`);
        const dataRows = rawGrid.slice(1);
        const records: Array<Record<string, unknown>> = dataRows.map((row) => {
          const rec: Record<string, unknown> = {};
          for (let i = 0; i < headers.length; i++) {
            rec[headers[i]] = row[i] || "";
          }
          return rec;
        });

        const markdownTable = OfficeExtractor.renderGridToMarkdown(headers, dataRows);

        sheets.push({
          sheetName,
          rowCount: dataRows.length,
          columnCount: headers.length,
          records,
          markdownTable,
        });
      }
    }

    const fullTextParts: string[] = [];
    for (const sheet of sheets) {
      if (sheet.markdownTable) {
        fullTextParts.push(`### Sheet: ${sheet.sheetName}\n\n${sheet.markdownTable}`);
      }
    }

    const fullText = fullTextParts.join("\n\n");
    const totalCharacters = fullText.length;
    const totalWords = totalCharacters > 0 ? fullText.trim().split(/\s+/).length : 0;

    return {
      fullText,
      totalCharacters,
      totalWords,
      sheets,
      metadata: {},
    };
  }

  private static extractTextFromP(pXml: string): string {
    const textPieces: string[] = [];
    const tMatches = pXml.matchAll(/<w:t(?:\s+[^>]*)?>([\s\S]*?)<\/w:t>/g);
    for (const tMatch of tMatches) {
      textPieces.push(OfficeExtractor.decodeXmlEntities(tMatch[1]));
    }
    return textPieces.join("").trim();
  }

  private static parseDocxTable(tableXml: string): string {
    const rows: string[][] = [];
    const trMatches = tableXml.matchAll(/<w:tr[\s>][\s\S]*?<\/w:tr>/g);

    for (const trMatch of trMatches) {
      const rowXml = trMatch[0];
      const cells: string[] = [];
      const tcMatches = rowXml.matchAll(/<w:tc[\s>][\s\S]*?<\/w:tc>/g);

      for (const tcMatch of tcMatches) {
        const cellXml = tcMatch[0];
        const cellText = OfficeExtractor.extractTextFromP(cellXml);
        cells.push(cellText);
      }

      if (cells.length > 0) {
        rows.push(cells);
      }
    }

    if (rows.length === 0) return "";

    const headers = rows[0].map((h, i) => h || `Col ${i + 1}`);
    const dataRows = rows.slice(1);

    return OfficeExtractor.renderGridToMarkdown(headers, dataRows);
  }

  private static renderGridToMarkdown(headers: string[], dataRows: string[][]): string {
    if (headers.length === 0) return "";

    const escapeCell = (c: string) => c.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");

    const headerRow = `| ${headers.map(escapeCell).join(" | ")} |`;
    const separatorRow = `| ${headers.map(() => "---").join(" | ")} |`;
    const rows = dataRows.map((r) => {
      const padded = headers.map((_, i) => escapeCell(r[i] || ""));
      return `| ${padded.join(" | ")} |`;
    });

    return [headerRow, separatorRow, ...rows].join("\n");
  }

  private static extractXmlTagValue(xml: string, tagName: string): string | undefined {
    const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i");
    const match = xml.match(regex);
    return match ? OfficeExtractor.decodeXmlEntities(match[1].trim()) : undefined;
  }

  private static decodeXmlEntities(str: string): string {
    return str
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
  }
}
