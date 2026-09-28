import assert from "node:assert/strict";
import * as http from "node:http";
import { describe, it } from "node:test";
import { KapActor } from "../src/actors/corpus/kap-actor";
import type { ActorTask } from "../src/api/types";

(process.env as Record<string, string | undefined>).NODE_ENV = "test";

const MOCK_KAP_JSON = [
  {
    disclosureIndex: "123456",
    stockCodes: "THYAO",
    companyTitle: "TÜRK HAVA YOLLARI A.O.",
    publishDate: "15.03.2024 18:30:00",
    disclosureClass: "ÖDA",
    ruleTypeTerm: "Özel Durum Açıklaması (Genel)",
    summaryTitle: "Yeni Uçak Alımı ve Filo Genişleme Planı",
    summary: "Şirketimiz Yönetim Kurulu tarafından filo yenileme planı onaylanmıştır.",
    text: "Ortaklığımız Yönetim Kurulu, büyüme hedefleri doğrultusunda 20 adet yeni nesil geniş gövde yolcu uçağının satın alınmasına karar vermiştir.",
    url: "https://www.kap.org.tr/tr/Bildirim/123456",
  },
  {
    disclosureIndex: "123457",
    stockCodes: "ASELS",
    companyTitle: "ASELSAN ELEKTRONİK SANAYİ VE TİCARET A.Ş.",
    publishDate: "15.03.2024 17:15:00",
    disclosureClass: "FR",
    ruleTypeTerm: "Finansal Rapor",
    summaryTitle: "2023 Yılı 4. Çeyrek Finansal Raporları",
    summary: "2023 yılı konsolide finansal tablolar ve bağımsız denetim raporu.",
    text: "Şirketimizin 01.01.2023 - 31.12.2023 hesap dönemine ait finansal raporları kamuoyunun bilgisine sunulmuştur.",
    url: "https://www.kap.org.tr/tr/Bildirim/123457",
  },
];

const MOCK_KAP_HTML = `
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <title>KAP Bildirimleri</title>
</head>
<body>
  <table>
    <tbody>
      <tr>
        <td>14.03.2024 15:45</td>
        <td>GARAN</td>
        <td>T. GARANTİ BANKASI A.Ş.</td>
        <td>Özel Durum Açıklaması</td>
        <td><a href="/tr/Bildirim/123458">Sermaye Artırımı ve Bedelsiz Pay İhracı</a></td>
      </tr>
      <tr>
        <td>14.03.2024 14:10</td>
        <td>KCHOL</td>
        <td>KOÇ HOLDİNG A.Ş.</td>
        <td>Genel Kurul Bildirimi</td>
        <td><a href="/tr/Bildirim/123459">Olağan Genel Kurul Toplantı Sonucu</a></td>
      </tr>
    </tbody>
  </table>
</body>
</html>
`;

describe("KapActor", () => {
  it("initializes with correct actorType and description", () => {
    const actor = new KapActor();
    assert.equal(actor.actorType, "kap");
    assert.ok(actor.description.length > 0);
  });

  it("builds correct endpoint URLs from options", () => {
    const actor = new KapActor();

    // Company ticker endpoint
    const urlTicker = actor.buildEndpointUrl(undefined, {
      companyTicker: "THYAO",
    });
    assert.equal(urlTicker, "https://www.kap.org.tr/tr/api/member-disclosures/THYAO");

    // General disclosures search endpoint
    const urlQuery = actor.buildEndpointUrl(undefined, {
      query: "sermaye artırımı",
      disclosureType: "oda",
      limit: 15,
    });
    assert.ok(urlQuery.includes("kap.org.tr/tr/api/disclosures"));
    assert.ok(urlQuery.includes("q=sermaye+art%C4%B1r%C4%B1m%C4%B1"));
    assert.ok(urlQuery.includes("type=oda"));
    assert.ok(urlQuery.includes("limit=15"));

    // Direct targetUrl bypass
    const direct = actor.buildEndpointUrl("https://www.kap.org.tr/tr/Bildirim/999999");
    assert.equal(direct, "https://www.kap.org.tr/tr/Bildirim/999999");
  });

  it("blocks SSRF attempts to private or cloud metadata IPs", async () => {
    const actor = new KapActor();
    const task: ActorTask = {
      taskId: "test-ssrf-kap-1",
      actorType: "kap",
      targetUrl: "http://169.254.169.254/latest/meta-data",
    };

    const result = await actor.run(task, { task, startTime: Date.now() });
    assert.equal(result.status, "failed");
    assert.equal(result.statusCode, 403);
    assert.ok(result.errorMessage?.includes("SSRF"));
  });

  it("extracts and parses JSON disclosure records", async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(MOCK_KAP_JSON));
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const port = (server.address() as { port: number }).port;
    const mockUrl = `http://127.0.0.1:${port}/api/disclosures`;

    try {
      const actor = new KapActor();
      const task: ActorTask = {
        taskId: "test-kap-json",
        actorType: "kap",
        targetUrl: mockUrl,
      };

      const result = await actor.run(task, { task, startTime: Date.now() });
      assert.equal(result.status, "completed");
      assert.equal(result.statusCode, 200);
      assert.ok(result.data);

      const data = result.data;
      assert.equal(data.totalCount, 2);
      assert.equal(data.disclosures.length, 2);

      const d1 = data.disclosures[0];
      assert.equal(d1.id, "123456");
      assert.equal(d1.companyTicker, "THYAO");
      assert.equal(d1.companyName, "TÜRK HAVA YOLLARI A.O.");
      assert.equal(d1.publishDate, "15.03.2024 18:30:00");
      assert.ok(d1.subject?.includes("Yeni Uçak Alımı"));
      assert.ok(d1.content?.includes("geniş gövde"));
      assert.equal(d1.url, "https://www.kap.org.tr/tr/Bildirim/123456");

      // Verify Markdown summary
      assert.ok(data.markdown?.includes("# Kamuoyu Aydınlatma Platformu (KAP) Bildirimleri"));
      assert.ok(data.markdown?.includes("THYAO"));
      assert.ok(data.markdown?.includes("TÜRK HAVA YOLLARI A.O."));
    } finally {
      server.close();
    }
  });

  it("extracts and parses HTML disclosure table rows", async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(MOCK_KAP_HTML);
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const port = (server.address() as { port: number }).port;
    const mockUrl = `http://127.0.0.1:${port}/disclosures`;

    try {
      const actor = new KapActor();
      const task: ActorTask = {
        taskId: "test-kap-html",
        actorType: "kap",
        targetUrl: mockUrl,
      };

      const result = await actor.run(task, { task, startTime: Date.now() });
      assert.equal(result.status, "completed");
      assert.ok(result.data);

      const data = result.data;
      assert.equal(data.totalCount, 2);

      const d1 = data.disclosures[0];
      assert.equal(d1.id, "123458");
      assert.equal(d1.companyTicker, "GARAN");
      assert.ok(d1.companyName.includes("GARANTİ"));
      assert.ok(d1.subject?.includes("Sermaye Artırımı"));

      const d2 = data.disclosures[1];
      assert.equal(d2.id, "123459");
      assert.equal(d2.companyTicker, "KCHOL");
      assert.ok(d2.subject?.includes("Genel Kurul"));
    } finally {
      server.close();
    }
  });

  it("filters disclosures by companyTicker and query with Turkish diacritic normalization", async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(MOCK_KAP_JSON));
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const port = (server.address() as { port: number }).port;
    const mockUrl = `http://127.0.0.1:${port}/api/disclosures`;

    try {
      const actor = new KapActor();
      const task: ActorTask = {
        taskId: "test-kap-filter",
        actorType: "kap",
        targetUrl: mockUrl,
        options: {
          kapOptions: {
            companyTicker: "asels",
            query: "finansal",
          },
        },
      };

      const result = await actor.run(task, { task, startTime: Date.now() });
      assert.equal(result.status, "completed");
      assert.ok(result.data);
      assert.equal(result.data.totalCount, 1);
      assert.equal(result.data.disclosures[0].companyTicker, "ASELS");
      assert.ok(result.data.disclosures[0].companyName.includes("ASELSAN"));
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
    const mockUrl = `http://127.0.0.1:${port}/error`;

    try {
      const actor = new KapActor();
      const task: ActorTask = {
        taskId: "test-kap-503",
        actorType: "kap",
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
