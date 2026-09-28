import assert from "node:assert/strict";
import * as http from "node:http";
import { describe, it } from "node:test";
import { ResmiGazeteActor } from "../src/actors/corpus/resmi-gazete-actor";
import type { ActorTask } from "../src/api/types";

(process.env as Record<string, string | undefined>).NODE_ENV = "test";

const MOCK_RESMI_GAZETE_HTML = `
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <title>Resmî Gazete - 15 Mart 2024 CUMA - Sayı : 32490</title>
</head>
<body>
  <div class="fihrist">
    <div class="tarih_sayi">
      <span>15 Mart 2024 CUMA</span>
      <span>Sayı : 32490</span>
    </div>

    <div class="bolum">
      <h2>YÜRÜTME VE İDARE BÖLÜMÜ</h2>
      <h3>KANUNLAR</h3>
      <p>
        <a href="/eskiler/2024/03/20240315-1.htm">7499 Sayılı Ceza Muhakemesi Kanunu ile Bazı Kanunlarda Değişiklik Yapılmasına Dair Kanun</a>
      </p>

      <h3>CUMHURBAŞKANI KARARLARI</h3>
      <p>
        <a href="/eskiler/2024/03/20240315-2.pdf">Cumhurbaşkanı Kararı (Karar Sayısı: 8250)</a>
      </p>

      <h3>YÖNETMELİKLER</h3>
      <p>
        <a href="/eskiler/2024/03/20240315-3.htm">Afet ve Acil Durum Yönetimi Başkanlığı Hizmet İçi Eğitim Yönetmeliği</a>
      </p>
    </div>

    <div class="bolum">
      <h2>YARGI BÖLÜMÜ</h2>
      <h3>ANAYASA MAHKEMESİ KARARLARI</h3>
      <p>
        <a href="/eskiler/2024/03/20240315-4.htm">Anayasa Mahkemesinin 15/1/2024 Tarihli ve E: 2023/105, K: 2024/12 Sayılı Kararı</a>
      </p>
    </div>
  </div>
</body>
</html>
`;

describe("ResmiGazeteActor", () => {
  it("initializes with correct actorType and description", () => {
    const actor = new ResmiGazeteActor();
    assert.equal(actor.actorType, "resmi-gazete");
    assert.ok(actor.description.length > 0);
  });

  it("builds correct endpoint URLs from dates and targets", () => {
    const actor = new ResmiGazeteActor();

    assert.equal(
      actor.buildEndpointUrl(undefined, { date: "2024-03-15" }),
      "https://www.resmigazete.gov.tr/eskiler/2024/03/20240315.htm"
    );

    assert.equal(
      actor.buildEndpointUrl(undefined, { date: "20230101" }),
      "https://www.resmigazete.gov.tr/eskiler/2023/01/20230101.htm"
    );

    assert.equal(
      actor.buildEndpointUrl("https://www.resmigazete.gov.tr/eskiler/2024/03/custom.htm"),
      "https://www.resmigazete.gov.tr/eskiler/2024/03/custom.htm"
    );

    assert.equal(actor.buildEndpointUrl(), "https://www.resmigazete.gov.tr");
  });

  it("blocks SSRF attempts to private or cloud metadata IPs", async () => {
    const actor = new ResmiGazeteActor();
    const task: ActorTask = {
      taskId: "test-ssrf-1",
      actorType: "resmi-gazete",
      targetUrl: "http://169.254.169.254/latest/meta-data",
    };

    const result = await actor.run(task, { task, startTime: Date.now() });
    assert.equal(result.status, "failed");
    assert.equal(result.statusCode, 403);
    assert.ok(result.errorMessage?.includes("SSRF"));
  });

  it("extracts daily bulletin and parses structured legislation items", async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(MOCK_RESMI_GAZETE_HTML);
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const port = (server.address() as { port: number }).port;
    const mockUrl = `http://127.0.0.1:${port}/eskiler/2024/03/20240315.htm`;

    try {
      const actor = new ResmiGazeteActor();
      const task: ActorTask = {
        taskId: "test-rg-extract-1",
        actorType: "resmi-gazete",
        targetUrl: mockUrl,
        options: {
          resmiGazeteOptions: {
            date: "2024-03-15",
          },
        },
      };

      const result = await actor.run(task, { task, startTime: Date.now() });
      assert.equal(result.status, "completed");
      assert.equal(result.statusCode, 200);
      assert.ok(result.data);

      const data = result.data;
      assert.equal(data.date, "2024-03-15");
      assert.equal(data.issueNumber, 32490);
      assert.equal(data.isRepeated, false);
      assert.equal(data.totalItems, 4);

      // Verify item 1: Kanun
      const kanun = data.items.find((i) => i.title.includes("7499"));
      assert.ok(kanun);
      assert.equal(kanun.actNumber, "7499");
      assert.ok(kanun.url.includes("20240315-1.htm"));

      // Verify item 2: Karar with PDF
      const karar = data.items.find((i) => i.title.includes("8250"));
      assert.ok(karar);
      assert.equal(karar.actNumber, "8250");
      assert.ok(karar.pdfUrl?.endsWith(".pdf"));

      // Verify markdown summary
      assert.ok(data.markdown?.includes("# T.C. Resmî Gazete"));
      assert.ok(data.markdown?.includes("Sayı: 32490"));
      assert.ok(data.markdown?.includes("7499"));
    } finally {
      server.close();
    }
  });

  it("filters items by category correctly", async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(MOCK_RESMI_GAZETE_HTML);
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const port = (server.address() as { port: number }).port;
    const mockUrl = `http://127.0.0.1:${port}/eskiler/2024/03/20240315.htm`;

    try {
      const actor = new ResmiGazeteActor();
      const task: ActorTask = {
        taskId: "test-rg-cat-filter",
        actorType: "resmi-gazete",
        targetUrl: mockUrl,
        options: {
          resmiGazeteOptions: {
            category: "yonetmelik",
          },
        },
      };

      const result = await actor.run(task, { task, startTime: Date.now() });
      assert.equal(result.status, "completed");
      assert.ok(result.data);
      assert.equal(result.data.totalItems, 1);
      assert.ok(result.data.items[0].title.includes("Yönetmeliği"));
    } finally {
      server.close();
    }
  });

  it("filters items by query keyword", async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(MOCK_RESMI_GAZETE_HTML);
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const port = (server.address() as { port: number }).port;
    const mockUrl = `http://127.0.0.1:${port}/eskiler/2024/03/20240315.htm`;

    try {
      const actor = new ResmiGazeteActor();
      const task: ActorTask = {
        taskId: "test-rg-query-filter",
        actorType: "resmi-gazete",
        targetUrl: mockUrl,
        options: {
          resmiGazeteOptions: {
            query: "Anayasa",
          },
        },
      };

      const result = await actor.run(task, { task, startTime: Date.now() });
      assert.equal(result.status, "completed");
      assert.ok(result.data);
      assert.equal(result.data.totalItems, 1);
      assert.ok(result.data.items[0].title.includes("Anayasa Mahkemesinin"));
    } finally {
      server.close();
    }
  });

  it("handles upstream HTTP error responses gracefully", async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(503, { "Content-Type": "text/plain" });
      res.end("Service Unavailable");
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const port = (server.address() as { port: number }).port;
    const mockUrl = `http://127.0.0.1:${port}/eskiler/error.htm`;

    try {
      const actor = new ResmiGazeteActor();
      const task: ActorTask = {
        taskId: "test-rg-error-503",
        actorType: "resmi-gazete",
        targetUrl: mockUrl,
      };

      const result = await actor.run(task, { task, startTime: Date.now() });
      assert.equal(result.status, "failed");
      assert.equal(result.statusCode, 503);
      assert.ok(result.errorMessage?.includes("503"));
    } finally {
      server.close();
    }
  });
});
