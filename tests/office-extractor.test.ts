import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deflateRawSync } from "node:zlib";
import { OfficeExtractor } from "../src/extractors/office-extractor";

function createMockZip(files: Record<string, string>): Buffer {
  const parts: Buffer[] = [];
  for (const [name, content] of Object.entries(files)) {
    const rawData = Buffer.from(content, "utf8");
    const compressedData = deflateRawSync(rawData);
    const nameBuf = Buffer.from(name, "utf8");

    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0); // signature
    header.writeUInt16LE(20, 4); // version
    header.writeUInt16LE(0, 6); // flags
    header.writeUInt16LE(8, 8); // compression: deflate
    header.writeUInt16LE(0, 10); // mod time
    header.writeUInt16LE(0, 12); // mod date
    header.writeUInt32LE(0, 14); // crc32
    header.writeUInt32LE(compressedData.length, 18);
    header.writeUInt32LE(rawData.length, 22);
    header.writeUInt16LE(nameBuf.length, 26);
    header.writeUInt16LE(0, 28); // extra field length

    parts.push(header, nameBuf, compressedData);
  }
  return Buffer.concat(parts);
}

describe("OfficeExtractor - Word (.docx) and Excel (.xlsx) Extraction", () => {
  it("extracts text, metadata, and tables from valid DOCX payload", () => {
    const documentXml = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Architecture Review Document</w:t></w:r></w:p>
    <w:p><w:r><w:t>Protokol-7 provides high-performance data extraction.</w:t></w:r></w:p>
    <w:tbl>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Component</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Status</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Engine</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Operational</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
  </w:body>
</w:document>`;

    const coreXml = `<?xml version="1.0" encoding="UTF-8"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <dc:title>Q3 Architecture Summary</dc:title>
  <dc:creator>Enterprise Architect</dc:creator>
</cp:coreProperties>`;

    const docxZip = createMockZip({
      "word/document.xml": documentXml,
      "docProps/core.xml": coreXml,
    });

    const result = OfficeExtractor.extractDocx(docxZip);

    assert.equal(result.metadata.title, "Q3 Architecture Summary");
    assert.equal(result.metadata.author, "Enterprise Architect");
    assert.ok(result.fullText.includes("Architecture Review Document"));
    assert.ok(result.fullText.includes("Protokol-7 provides high-performance data extraction."));
    assert.equal(result.paragraphs.length, 2);
    assert.equal(result.markdownTables.length, 1);
    assert.ok(result.markdownTables[0].includes("| Component | Status |"));
    assert.ok(result.markdownTables[0].includes("| Engine | Operational |"));
    assert.ok(result.totalCharacters > 50);
    assert.ok(result.totalWords > 10);
  });

  it("throws descriptive error when word/document.xml is missing", () => {
    const invalidDocx = createMockZip({
      "something_else.xml": "<xml></xml>",
    });

    assert.throws(
      () => OfficeExtractor.extractDocx(invalidDocx),
      /Invalid DOCX archive: Missing 'word\/document.xml'/
    );
  });

  it("extracts shared strings, cell values, and formatted tables from XLSX", () => {
    const workbookXml = `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheets>
    <sheet name="PerformanceMetrics" sheetId="1"/>
  </sheets>
</workbook>`;

    const sharedStringsXml = `<?xml version="1.0" encoding="UTF-8"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <si><t>Metric</t></si>
  <si><t>Measurement</t></si>
  <si><t>Throughput</t></si>
  <si><t>Latency</t></si>
</sst>`;

    const sheet1Xml = `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1">
      <c r="A1" t="s"><v>0</v></c>
      <c r="B1" t="s"><v>1</v></c>
    </row>
    <row r="2">
      <c r="A2" t="s"><v>2</v></c>
      <c r="B2"><v>15000</v></c>
    </row>
    <row r="3">
      <c r="A3" t="s"><v>3</v></c>
      <c r="B3"><v>3.8ms</v></c>
    </row>
  </sheetData>
</worksheet>`;

    const xlsxZip = createMockZip({
      "xl/workbook.xml": workbookXml,
      "xl/sharedStrings.xml": sharedStringsXml,
      "xl/worksheets/sheet1.xml": sheet1Xml,
    });

    const result = OfficeExtractor.extractXlsx(xlsxZip);

    assert.equal(result.sheets.length, 1);
    const sheet = result.sheets[0];
    assert.equal(sheet.sheetName, "PerformanceMetrics");
    assert.equal(sheet.rowCount, 2);
    assert.equal(sheet.columnCount, 2);
    assert.equal(sheet.records[0].Metric, "Throughput");
    assert.equal(sheet.records[0].Measurement, "15000");
    assert.equal(sheet.records[1].Metric, "Latency");
    assert.equal(sheet.records[1].Measurement, "3.8ms");
    assert.ok(sheet.markdownTable?.includes("| Throughput | 15000 |"));
    assert.ok(result.fullText.includes("### Sheet: PerformanceMetrics"));
  });
});
