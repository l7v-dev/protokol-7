export interface TabularParseOptions {
  delimiter?: string;
  hasHeaders?: boolean;
  maxRows?: number;
}

export interface TabularParseResult {
  headers: string[];
  rows: string[][];
  records: Array<Record<string, string>>;
  rowCount: number;
  columnCount: number;
  markdownTable: string;
  detectedDelimiter: string;
}

export class TabularExtractor {
  private static readonly DELIMITER_CANDIDATES = [",", "\t", ";", "|"];

  /**
   * Parses CSV / TSV text content complying with RFC 4180, supporting quoted
   * fields with embedded commas, line breaks, and escaped quotes.
   */
  public static parse(content: string, options: TabularParseOptions = {}): TabularParseResult {
    const rawText = content.trim();
    if (!rawText) {
      return {
        headers: [],
        rows: [],
        records: [],
        rowCount: 0,
        columnCount: 0,
        markdownTable: "",
        detectedDelimiter: options.delimiter || ",",
      };
    }

    const delimiter = options.delimiter || TabularExtractor.detectDelimiter(rawText);
    const parsedRows = TabularExtractor.tokenizeRfc4180(rawText, delimiter);

    if (parsedRows.length === 0) {
      return {
        headers: [],
        rows: [],
        records: [],
        rowCount: 0,
        columnCount: 0,
        markdownTable: "",
        detectedDelimiter: delimiter,
      };
    }

    const hasHeaders = options.hasHeaders !== false;
    let headers: string[];
    let dataRows: string[][];

    if (hasHeaders) {
      headers = parsedRows[0].map((h, i) => h.trim() || `column_${i + 1}`);
      dataRows = parsedRows.slice(1);
    } else {
      const maxCols = Math.max(...parsedRows.map((r) => r.length));
      headers = Array.from({ length: maxCols }, (_, i) => `column_${i + 1}`);
      dataRows = parsedRows;
    }

    if (options.maxRows && options.maxRows > 0) {
      dataRows = dataRows.slice(0, options.maxRows);
    }

    const records: Array<Record<string, string>> = dataRows.map((row) => {
      const record: Record<string, string> = {};
      for (let i = 0; i < headers.length; i++) {
        record[headers[i]] = (row[i] || "").trim();
      }
      return record;
    });

    const markdownTable = TabularExtractor.renderMarkdown(headers, dataRows);

    return {
      headers,
      rows: dataRows,
      records,
      rowCount: dataRows.length,
      columnCount: headers.length,
      markdownTable,
      detectedDelimiter: delimiter,
    };
  }

  private static detectDelimiter(sample: string): string {
    const lines = sample
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .slice(0, 10);

    if (lines.length === 0) return ",";

    let bestDelimiter = ",";
    let bestScore = -1;

    for (const cand of TabularExtractor.DELIMITER_CANDIDATES) {
      const counts = lines.map((line) => line.split(cand).length - 1);
      const firstCount = counts[0];
      if (firstCount === 0) continue;

      // Check consistency across sampled lines
      const allEqual = counts.every((c) => c === firstCount);
      if (allEqual && firstCount > bestScore) {
        bestScore = firstCount;
        bestDelimiter = cand;
      }
    }

    return bestDelimiter;
  }

  private static tokenizeRfc4180(input: string, delimiter: string): string[][] {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentCell = "";
    let insideQuotes = false;

    let i = 0;
    while (i < input.length) {
      const char = input[i];

      if (insideQuotes) {
        if (char === '"') {
          if (i + 1 < input.length && input[i + 1] === '"') {
            // Escaped quote ("")
            currentCell += '"';
            i += 2;
            continue;
          }
          // Closing quote
          insideQuotes = false;
          i++;
          continue;
        }
        currentCell += char;
        i++;
      } else {
        if (char === '"') {
          insideQuotes = true;
          i++;
        } else if (char === delimiter) {
          currentRow.push(currentCell);
          currentCell = "";
          i++;
        } else if (char === "\r") {
          if (i + 1 < input.length && input[i + 1] === "\n") {
            i++;
          }
          currentRow.push(currentCell);
          rows.push(currentRow);
          currentRow = [];
          currentCell = "";
          i++;
        } else if (char === "\n") {
          currentRow.push(currentCell);
          rows.push(currentRow);
          currentRow = [];
          currentCell = "";
          i++;
        } else {
          currentCell += char;
          i++;
        }
      }
    }

    if (currentCell.length > 0 || currentRow.length > 0) {
      currentRow.push(currentCell);
      rows.push(currentRow);
    }

    // Filter out trailing empty rows
    return rows.filter((r) => r.length > 0 && r.some((c) => c.trim().length > 0));
  }

  private static renderMarkdown(headers: string[], rows: string[][]): string {
    if (headers.length === 0) return "";

    const escapeCell = (val: string): string => val.replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");

    const headerLine = `| ${headers.map(escapeCell).join(" | ")} |`;
    const separatorLine = `| ${headers.map(() => "---").join(" | ")} |`;

    const dataLines = rows.map((row) => {
      const cells = headers.map((_, i) => escapeCell(row[i] || ""));
      return `| ${cells.join(" | ")} |`;
    });

    return [headerLine, separatorLine, ...dataLines].join("\n");
  }
}
