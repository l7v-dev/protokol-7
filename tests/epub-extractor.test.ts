import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deflateRawSync } from "node:zlib";
import { ArchiveSecurityError } from "../src/archive/archive-guard";
import { EpubExtractor } from "../src/extractors/epub-extractor";

function createMockEpubZip(files: Record<string, string>): Buffer {
  const parts: Buffer[] = [];
  for (const [name, content] of Object.entries(files)) {
    const rawData = Buffer.from(content, "utf8");
    const compressedData = deflateRawSync(rawData);
    const nameBuf = Buffer.from(name, "utf8");

    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0); // Local file header signature
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0, 6);
    header.writeUInt16LE(8, 8); // Deflate
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(0, 12);
    header.writeUInt32LE(0, 14);
    header.writeUInt32LE(compressedData.length, 18);
    header.writeUInt32LE(rawData.length, 22);
    header.writeUInt16LE(nameBuf.length, 26);
    header.writeUInt16LE(0, 28);

    parts.push(header, nameBuf, compressedData);
  }
  return Buffer.concat(parts);
}

function buildStandardMockEpub(): Record<string, string> {
  return {
    mimetype: "application/epub+zip",
    "META-INF/container.xml": `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`,
    "OEBPS/content.opf": `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="pub-id" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Test Bilim Dergisi</dc:title>
    <dc:creator>Dr. Ada Lovelace</dc:creator>
    <dc:creator>Prof. Alan Turing</dc:creator>
    <dc:identifier id="pub-id">urn:isbn:978-0-123456-47-2</dc:identifier>
    <dc:language>tr</dc:language>
    <dc:publisher>Protokol Yayinlari</dc:publisher>
    <dc:date>2026-09-26</dc:date>
    <dc:description>Bilimsel ve teknik arastirma dergisi e-kitap formati.</dc:description>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="chap1" href="chapters/chapter1.xhtml" media-type="application/xhtml+xml"/>
    <item id="chap2" href="chapters/chapter2.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="chap1"/>
    <itemref idref="chap2"/>
  </spine>
</package>`,
    "OEBPS/nav.xhtml": `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Icindekiler</title></head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>Icindekiler</h1>
    <ol>
      <li><a href="chapters/chapter1.xhtml">Bolum 1: Kuantum Hesaplama</a>
        <ol>
          <li><a href="chapters/chapter1.xhtml#qubits">Kubitler ve Durumlar</a></li>
        </ol>
      </li>
      <li><a href="chapters/chapter2.xhtml">Bolum 2: Yapay Zeka Sistemleri</a></li>
    </ol>
  </nav>
</body>
</html>`,
    "OEBPS/chapters/chapter1.xhtml": `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Bolum 1: Kuantum Hesaplama</title></head>
<body>
  <h1>Bolum 1: Kuantum Hesaplama</h1>
  <p>Kuantum mekanigi kurallarina dayanan bilgi isleme prensipleri.</p>
  <h2 id="qubits">Kubitler ve Durumlar</h2>
  <p>Superpozisyon ve dolasiklik ozellikleri sergileyen iki seviyeli sistemler.</p>
  <table>
    <thead><tr><th>Tur</th><th>Fiziksel Sistem</th></tr></thead>
    <tbody><tr><td>Superiletken</td><td>Transmon Qubit</td></tr></tbody>
  </table>
  <script>alert('harmful')</script>
</body>
</html>`,
    "OEBPS/chapters/chapter2.xhtml": `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Bolum 2: Yapay Zeka Sistemleri</title></head>
<body>
  <h1>Bolum 2: Yapay Zeka Sistemleri</h1>
  <p>Bilisel mimariler ve otonom ajan koordinasyonu hakkinda analiz.</p>
  <ul>
    <li>Prefrontal korteks karar yonetimi</li>
    <li>Hipokampus bellek saklama</li>
  </ul>
</body>
</html>`,
  };
}

describe("EpubExtractor - Zero-Dependency EPUB 2/3 Extraction Engine", () => {
  it("extracts Dublin Core metadata and identifiers accurately", () => {
    const zipBuf = createMockEpubZip(buildStandardMockEpub());
    const result = EpubExtractor.extract(zipBuf);

    assert.equal(result.metadata.publicationTitle, "Test Bilim Dergisi");
    assert.deepEqual(result.metadata.authors, ["Dr. Ada Lovelace", "Prof. Alan Turing"]);
    assert.equal(result.metadata.publisher, "Protokol Yayinlari");
    assert.equal(result.metadata.language, "tr");
    assert.equal(result.metadata.publicationDate, "2026-09-26");
    assert.equal(result.metadata.isbn, "978-0-123456-47-2");
    assert.equal(
      result.metadata.description,
      "Bilimsel ve teknik arastirma dergisi e-kitap formati."
    );
  });

  it("extracts hierarchical Table of Contents from EPUB 3 Navigation Document", () => {
    const zipBuf = createMockEpubZip(buildStandardMockEpub());
    const result = EpubExtractor.extract(zipBuf);

    assert.equal(result.tableOfContents.length, 2);

    const firstItem = result.tableOfContents[0];
    assert.equal(firstItem.title, "Bolum 1: Kuantum Hesaplama");
    assert.equal(firstItem.level, 1);
    assert.equal(firstItem.href, "OEBPS/chapters/chapter1.xhtml");
    assert.ok(firstItem.children);
    assert.equal(firstItem.children?.length, 1);
    assert.equal(firstItem.children?.[0].title, "Kubitler ve Durumlar");
    assert.equal(firstItem.children?.[0].level, 2);

    const secondItem = result.tableOfContents[1];
    assert.equal(secondItem.title, "Bolum 2: Yapay Zeka Sistemleri");
    assert.equal(secondItem.level, 1);
    assert.equal(secondItem.href, "OEBPS/chapters/chapter2.xhtml");
  });

  it("extracts hierarchical Table of Contents from EPUB 2 NCX Document", () => {
    const files = buildStandardMockEpub();
    delete files["OEBPS/nav.xhtml"];

    files["OEBPS/content.opf"] = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>EPUB2 Klasik Kitap</dc:title>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="c1" href="chapters/chapter1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine toc="ncx">
    <itemref idref="c1"/>
  </spine>
</package>`;

    files["OEBPS/toc.ncx"] = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <navMap>
    <navPoint id="np-1" playOrder="1">
      <navLabel><text>NCX Bolum 1</text></navLabel>
      <content src="chapters/chapter1.xhtml"/>
      <navPoint id="np-1-1" playOrder="2">
        <navLabel><text>NCX Alt Baslik 1.1</text></navLabel>
        <content src="chapters/chapter1.xhtml#sub"/>
      </navPoint>
    </navPoint>
  </navMap>
</ncx>`;

    const zipBuf = createMockEpubZip(files);
    const result = EpubExtractor.extract(zipBuf);

    assert.equal(result.tableOfContents.length, 1);
    assert.equal(result.tableOfContents[0].title, "NCX Bolum 1");
    assert.equal(result.tableOfContents[0].level, 1);
    assert.equal(result.tableOfContents[0].children?.length, 1);
    assert.equal(result.tableOfContents[0].children?.[0].title, "NCX Alt Baslik 1.1");
    assert.equal(result.tableOfContents[0].children?.[0].level, 2);
  });

  it("extracts chapters in spine linear reading order and converts to GFM markdown", () => {
    const zipBuf = createMockEpubZip(buildStandardMockEpub());
    const result = EpubExtractor.extract(zipBuf);

    assert.equal(result.totalChapters, 2);
    assert.equal(result.chapters.length, 2);

    const chap1 = result.chapters[0];
    assert.equal(chap1.id, "chap1");
    assert.equal(chap1.title, "Bolum 1: Kuantum Hesaplama");
    assert.ok(chap1.markdownContent.includes("# Bolum 1: Kuantum Hesaplama"));
    assert.ok(chap1.markdownContent.includes("## Kubitler ve Durumlar"));
    assert.ok(chap1.markdownContent.includes("| Tur | Fiziksel Sistem |"));
    assert.ok(chap1.markdownContent.includes("| Superiletken | Transmon Qubit |"));
    // Verify script tags were stripped
    assert.ok(!chap1.markdownContent.includes("alert"));
    assert.ok(!chap1.markdownContent.includes("harmful"));
    assert.ok(chap1.wordCount > 10);
    assert.ok(chap1.characterCount > 50);

    const chap2 = result.chapters[1];
    assert.equal(chap2.id, "chap2");
    assert.equal(chap2.title, "Bolum 2: Yapay Zeka Sistemleri");
    assert.ok(chap2.markdownContent.includes("Prefrontal korteks karar yonetimi"));

    // Verify aggregated metrics
    assert.equal(result.totalWords, chap1.wordCount + chap2.wordCount);
    assert.equal(result.totalCharacters, chap1.characterCount + chap2.characterCount);
    assert.ok(result.fullText.includes("# Bolum 1: Kuantum Hesaplama"));
    assert.ok(result.fullText.includes("# Bolum 2: Yapay Zeka Sistemleri"));
  });

  it("respects maxChapters constraint", () => {
    const zipBuf = createMockEpubZip(buildStandardMockEpub());
    const result = EpubExtractor.extract(zipBuf, { maxChapters: 1 });

    assert.equal(result.totalChapters, 1);
    assert.equal(result.chapters.length, 1);
    assert.equal(result.chapters[0].title, "Bolum 1: Kuantum Hesaplama");
  });

  it("rejects invalid buffer payloads", () => {
    assert.throws(() => EpubExtractor.extract(Buffer.alloc(10)), /Invalid EPUB payload/);
  });

  it("rejects invalid mimetype if present", () => {
    const files = buildStandardMockEpub();
    files.mimetype = "application/pdf";
    const zipBuf = createMockEpubZip(files);

    assert.throws(() => EpubExtractor.extract(zipBuf), /Invalid EPUB mimetype/);
  });

  it("rejects EPUB missing container.xml descriptor", () => {
    const files = buildStandardMockEpub();
    delete files["META-INF/container.xml"];
    const zipBuf = createMockEpubZip(files);

    assert.throws(() => EpubExtractor.extract(zipBuf), /Missing 'META-INF\/container\.xml'/);
  });

  it("rejects EPUB referencing non-existent rootfile package", () => {
    const files = buildStandardMockEpub();
    delete files["OEBPS/content.opf"];
    const zipBuf = createMockEpubZip(files);

    assert.throws(
      () => EpubExtractor.extract(zipBuf),
      /Rootfile package 'OEBPS\/content\.opf'.*not found/
    );
  });

  it("enforces Zip Slip path traversal defense on malicious entry names", () => {
    const files = buildStandardMockEpub();
    files["../../etc/shadow"] = "root:x:0:0:root:/root:/bin/bash";
    const zipBuf = createMockEpubZip(files);

    assert.throws(
      () => EpubExtractor.extract(zipBuf),
      (err: unknown) => err instanceof ArchiveSecurityError
    );
  });
});
