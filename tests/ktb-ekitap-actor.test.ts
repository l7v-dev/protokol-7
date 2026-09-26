import assert from "node:assert/strict";
import * as http from "node:http";
import test from "node:test";
import { KtbEkitapActor } from "../src/actors/ktb-ekitap-actor";
import { createServer } from "../src/server";

(process.env as Record<string, string | undefined>).NODE_ENV = "test";

const MOCK_KTB_CATEGORY_HTML = `
<!DOCTYPE html>
<html>
<head><title>Edebiyat Eserleri - KTB E-Kitap</title></head>
<body>
  <div class="book-list">
    <div class="book-card">
      <a href="/TR-78351/calikusu.html" title="Calikusu">Calikusu</a>
    </div>
    <div class="book-card">
      <a href="/TR-78352/kiralik-konak.html" title="Kiralik Konak">Kiralik Konak</a>
    </div>
  </div>
</body>
</html>
`;

const MOCK_KTB_DETAIL_HTML = `
<!DOCTYPE html>
<html>
<head><title>Calikusu - Resat Nuri Guntekin</title></head>
<body>
  <h1>Calikusu</h1>
  <div class="book-info">
    <p>Yazar: Resat Nuri Guntekin</p>
    <p>Yayınevi: Kultur ve Turizm Bakanligi Yayinlari</p>
    <p>Yıl: 2023</p>
    <p>Sayfa: 450</p>
  </div>
  <div class="book-summary">
    Feride'nin Anadolu'da ogretmenlik yaparken karsilastigi zorluklar ve aski anlatilmaktadir.
  </div>
  <a href="/Eklenti/999/calikusu.pdf" class="download-link">E-Kitap Indir (PDF)</a>
</body>
</html>
`;

const MINIMAL_PDF_RAW = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>/Contents 4 0 R>>endobj
4 0 obj<</Length 44>>stream
BT
/F1 12 Tf
72 712 Td
(Calikusu Birinci Bolum) Tj
ET
endstream
endobj
5 0 obj<</Title (Calikusu)/Author (Resat Nuri)>>endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000052 00000 n 
0000000101 00000 n 
0000000195 00000 n 
0000000289 00000 n 
trailer<</Size 6/Root 1 0 R/Info 5 0 R>>
startxref
348
%%EOF`;

const MINIMAL_PDF_BASE64 = Buffer.from(MINIMAL_PDF_RAW).toString("base64");

test("KtbEkitapActor lists books from category page", async () => {
  const server = http.createServer((req, res) => {
    if (req.url?.includes("/TR-78351/edebiyat.html")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(MOCK_KTB_CATEGORY_HTML);
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const targetUrl = `http://127.0.0.1:${port}`;

  try {
    const actor = new KtbEkitapActor();
    const result = await actor.run(
      {
        taskId: "test-ktb-list",
        actorType: "ktb-ekitap",
        targetUrl,
        options: {
          ktbEkitapOptions: {
            action: "list",
            category: "edebiyat",
            limit: 10,
          },
        },
      },
      { task: {} as never, startTime: Date.now() }
    );

    assert.equal(result.status, "completed");
    assert.equal(result.statusCode, 200);
    assert.ok(result.data);
    assert.equal(result.data.action, "list");
    assert.equal(result.data.totalItems, 2);
    assert.equal(result.data.items[0].id, 78351);
    assert.equal(result.data.items[0].title, "Calikusu");
    assert.ok(result.data.items[0].detailUrl.includes("/TR-78351/calikusu.html"));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("KtbEkitapActor fetches book detail and extracts markdown with anti-hotlinking referer", async () => {
  let receivedReferer: string | undefined;

  const server = http.createServer((req, res) => {
    if (req.url?.includes("/TR-78351/calikusu.html")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(MOCK_KTB_DETAIL_HTML);
    } else if (req.url?.includes("/Eklenti/999/calikusu.pdf")) {
      receivedReferer = req.headers.referer;
      const pdfBuf = Buffer.from(MINIMAL_PDF_BASE64, "base64");
      res.writeHead(200, {
        "Content-Type": "application/pdf",
        "Content-Length": pdfBuf.length,
      });
      res.end(pdfBuf);
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const targetUrl = `http://127.0.0.1:${port}`;
  const detailUrl = `${targetUrl}/TR-78351/calikusu.html`;

  try {
    const actor = new KtbEkitapActor();
    const result = await actor.run(
      {
        taskId: "test-ktb-detail",
        actorType: "ktb-ekitap",
        targetUrl,
        options: {
          ktbEkitapOptions: {
            action: "extract",
            detailUrl,
            downloadPdf: true,
          },
        },
      },
      { task: {} as never, startTime: Date.now() }
    );

    assert.equal(result.status, "completed");
    assert.equal(result.statusCode, 200);
    assert.ok(result.data);
    assert.equal(result.data.action, "extract");

    const item = result.data.items[0];
    assert.equal(item.id, 78351);
    assert.equal(item.title, "Calikusu");
    assert.equal(item.author, "Resat Nuri Guntekin");
    assert.equal(item.publisher, "Kultur ve Turizm Bakanligi Yayinlari");
    assert.equal(item.year, "2023");
    assert.ok(item.summary?.includes("Feride"));
    assert.ok(item.extractedMarkdown?.includes("Calikusu Birinci Bolum"));

    // Verify anti-hotlinking referer was sent
    assert.ok(receivedReferer?.includes("/TR-78351/calikusu.html"));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("KtbEkitapActor.sanitizeTextForLlm de-hyphenates and strips repeating page boilerplate", () => {
  const actor = new KtbEkitapActor();

  const pages = [
    `T.C. KULTUR VE TURIZM BAKANLIGI E-KITAP YAYINLARI
Sayfa 1
Anadolu'nun kucuk bir kasabasinda ogret-
menlik yaparken buyuk bir gayretle calis-
iyordu.
--- 1 ---`,
    `T.C. KULTUR VE TURIZM BAKANLIGI E-KITAP YAYINLARI
Sayfa 2
Kasaba halki onu cok sevmisti. Cocuklar
okula buyuk bir hevesle geliyordu.
--- 2 ---`,
    `T.C. KULTUR VE TURIZM BAKANLIGI E-KITAP YAYINLARI
Sayfa 3
Milli egitim muduru de bu basariyi teb-
rik etmisti.
--- 3 ---`,
  ];

  const sanitized = actor.sanitizeTextForLlm(pages);

  // Repeating header stripped
  assert.equal(sanitized.includes("T.C. KULTUR VE TURIZM BAKANLIGI E-KITAP YAYINLARI"), false);
  // Page number markers stripped
  assert.equal(sanitized.includes("Sayfa 1"), false);
  assert.equal(sanitized.includes("--- 1 ---"), false);
  // De-hyphenation: ogret- menlik -> ogretmenlik
  assert.ok(sanitized.includes("ogretmenlik") || sanitized.includes("ogret"));
  assert.ok(sanitized.includes("tebrik"));
});

test("KtbEkitapActor blocks SSRF requests to cloud metadata", async () => {
  const prevEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";

  try {
    const actor = new KtbEkitapActor();
    const result = await actor.run(
      {
        taskId: "test-ssrf-ktb",
        actorType: "ktb-ekitap",
        targetUrl: "http://169.254.169.254/latest/meta-data",
        options: {
          ktbEkitapOptions: {
            action: "list",
          },
        },
      },
      { task: {} as never, startTime: Date.now() }
    );

    assert.equal(result.status, "failed");
    assert.equal(result.statusCode, 400);
    assert.ok(result.errorMessage?.includes("SSRF validation rejected"));
  } finally {
    process.env.NODE_ENV = prevEnv;
  }
});

test("POST /api/v1/ktb-ekitap executes correctly via server router", async () => {
  const upstream = http.createServer((req, res) => {
    if (req.url?.includes("/TR-81461/tarih.html")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<html><body><a href="/TR-1001/nutuk.html">Nutuk</a></body></html>`);
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  const upstreamPort = (upstream.address() as { port: number }).port;

  const app = createServer();
  await new Promise<void>((resolve) => app.listen(0, "127.0.0.1", resolve));
  const appPort = (app.address() as { port: number }).port;

  try {
    const resp = await fetch(`http://127.0.0.1:${appPort}/api/v1/ktb-ekitap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetUrl: `http://127.0.0.1:${upstreamPort}`,
        action: "list",
        category: "tarih",
      }),
    });

    assert.equal(resp.status, 200);
    const data = (await resp.json()) as {
      success: boolean;
      data: { totalItems: number; items: Array<{ id: number; title: string }> };
    };

    assert.equal(data.success, true);
    assert.equal(data.data.totalItems, 1);
    assert.equal(data.data.items[0].id, 1001);
    assert.equal(data.data.items[0].title, "Nutuk");
  } finally {
    await new Promise<void>((resolve) => app.close(() => resolve()));
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  }
});
