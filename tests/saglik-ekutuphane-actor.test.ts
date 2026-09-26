import assert from "node:assert/strict";
import * as http from "node:http";
import test from "node:test";
import { SaglikEkutuphaneActor } from "../src/actors/saglik-ekutuphane-actor";
import { createServer } from "../src/server";

(process.env as Record<string, string | undefined>).NODE_ENV = "test";

const MOCK_LIST_HTML = `
<!DOCTYPE html>
<html>
<head><title>Kitaplar - Saglik Bakanligi</title></head>
<body>
  <div class="list-container">
    <a href="/Yayin/101" title="Birinci Basamak Saglik Kilavuzu">Birinci Basamak Saglik Kilavuzu</a>
    <a href="/Yayin/102" title="Asi Takvimi El Kitabi">Asi Takvimi El Kitabi</a>
    <a href="/Yayin/103" title="Halk Sagligi Raporu 2024">Halk Sagligi Raporu 2024</a>
  </div>
</body>
</html>
`;

const MOCK_DETAIL_HTML = `
<!DOCTYPE html>
<html>
<head><title>Yayin Detayi</title></head>
<body>
  <h2><strong>Birinci Basamak Saglik Kilavuzu</strong></h2>
  <div id="yayinDetay">
    <p>Yayınlayan: T.C. Saglik Bakanligi</p>
    <p>Basım Yılı: 2024</p>
    <p>Dili: Turkce</p>
    <p>Sayfa Sayısı: 120</p>
    <p>Dosya Adı: saglik_kilavuz_2024.pdf</p>
    <p>Boyut: 2.5 MB</p>
  </div>
  <a href="/Eklenti/101" class="btn btn-download">Indir</a>
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
(Saglik Kilavuzu Metni) Tj
ET
endstream
endobj
5 0 obj<</Title (Saglik Kilavuzu)/Author (Bakanlik)>>endobj
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

test("SaglikEkutuphaneActor lists publications from category", async () => {
  const server = http.createServer((req, res) => {
    if (req.url?.includes("/YayinTur/Kitap")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(MOCK_LIST_HTML);
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const targetUrl = `http://127.0.0.1:${port}`;

  try {
    const actor = new SaglikEkutuphaneActor();
    const result = await actor.run(
      {
        taskId: "test-saglik-list",
        actorType: "saglik-ekutuphane",
        targetUrl,
        options: {
          saglikEkutuphaneOptions: {
            action: "list",
            category: "books",
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
    assert.equal(result.data.totalItems, 3);
    assert.equal(result.data.items[0].id, 101);
    assert.equal(result.data.items[0].title, "Birinci Basamak Saglik Kilavuzu");
    assert.ok(result.data.items[0].detailUrl.includes("/Yayin/101"));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("SaglikEkutuphaneActor fetches publication detail metadata and PDF text", async () => {
  const server = http.createServer((req, res) => {
    if (req.url?.includes("/Yayin/101")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(MOCK_DETAIL_HTML);
    } else if (req.url?.includes("/Eklenti/101")) {
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

  try {
    const actor = new SaglikEkutuphaneActor();
    const result = await actor.run(
      {
        taskId: "test-saglik-detail",
        actorType: "saglik-ekutuphane",
        targetUrl,
        options: {
          saglikEkutuphaneOptions: {
            action: "extract",
            publicationId: 101,
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
    assert.equal(result.data.totalItems, 1);

    const item = result.data.items[0];
    assert.equal(item.id, 101);
    assert.equal(item.title, "Birinci Basamak Saglik Kilavuzu");
    assert.equal(item.publisher, "T.C. Saglik Bakanligi");
    assert.equal(item.year, "2024");
    assert.equal(item.pageCount, 120);
    assert.equal(item.fileSizeBytes, 2621440); // 2.5 MB
    assert.ok(item.extractedText?.includes("Saglik Kilavuzu"));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("SaglikEkutuphaneActor blocks SSRF requests to cloud metadata", async () => {
  const prevEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";

  try {
    const actor = new SaglikEkutuphaneActor();
    const result = await actor.run(
      {
        taskId: "test-ssrf-saglik",
        actorType: "saglik-ekutuphane",
        targetUrl: "http://169.254.169.254/latest/meta-data",
        options: {
          saglikEkutuphaneOptions: {
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

test("POST /api/v1/saglik-ekutuphane executes correctly via server router", async () => {
  const upstream = http.createServer((req, res) => {
    if (req.url?.includes("/YayinTur/Makale")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<html><body><a href="/Yayin/555">COVID-19 Klinik Kilavuzu</a></body></html>`);
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
    const resp = await fetch(`http://127.0.0.1:${appPort}/api/v1/saglik-ekutuphane`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetUrl: `http://127.0.0.1:${upstreamPort}`,
        action: "list",
        category: "articles",
      }),
    });

    assert.equal(resp.status, 200);
    const data = (await resp.json()) as {
      success: boolean;
      data: { totalItems: number; items: Array<{ id: number; title: string }> };
    };

    assert.equal(data.success, true);
    assert.equal(data.data.totalItems, 1);
    assert.equal(data.data.items[0].id, 555);
    assert.equal(data.data.items[0].title, "COVID-19 Klinik Kilavuzu");
  } finally {
    await new Promise<void>((resolve) => app.close(() => resolve()));
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  }
});
