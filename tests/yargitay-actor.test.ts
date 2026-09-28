import assert from "node:assert/strict";
import * as http from "node:http";
import { describe, it } from "node:test";
import { YargitayActor } from "../src/actors/corpus/yargitay-actor";
import type { ActorTask } from "../src/api/types";

(process.env as Record<string, string | undefined>).NODE_ENV = "test";

const MOCK_YARGITAY_JSON = {
  data: [
    {
      id: "yrg-101",
      daire: "1. Hukuk Dairesi",
      esasNo: "2022/1001",
      kararNo: "2023/500",
      kararTarihi: "15/02/2023",
      hukukAlani: "Hukuk",
      konu: "Tapu İptali ve Tescil",
      ozet: "Muris muvazaası iddiasına dayalı tapu iptali ve tescil davasında ispat yükü davacıya aittir.",
      metin:
        "Dava, muris muvazaası hukuksal nedenine dayalı tapu iptali ve tescil isteğine ilişkindir. Mahkemece davanın kabulüne karar verilmiş ise de toplanan deliller hüküm kurmaya elverişli değildir.",
    },
    {
      id: "yrg-102",
      daire: "Ceza Genel Kurulu",
      esasNo: "2021/450",
      kararNo: "2022/120",
      kararTarihi: "10/05/2022",
      hukukAlani: "Ceza",
      konu: "Nitelikli Yağma",
      ozet: "Sanığın eyleminin yağma suçunun nitelikli halini oluşturup oluşturmadığının değerlendirilmesi.",
      metin: "Uyuşmazlık, sanığa atılı yağma suçunun unsurlarının oluşup oluşmadığına ilişkindir.",
    },
  ],
};

const MOCK_YARGITAY_HTML = `
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <title>Yargıtay Emsal Karar Arama</title>
</head>
<body>
  <table class="table">
    <thead>
      <tr>
        <th>Daire</th>
        <th>Esas No</th>
        <th>Karar No</th>
        <th>Karar Tarihi</th>
        <th>Özet</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>2. Hukuk Dairesi</td>
        <td>2023/1234</td>
        <td>2023/5678</td>
        <td>20/06/2023</td>
        <td>Boşanma davasında kusur belirlemesi ve yoksulluk nafakası takdiri.</td>
      </tr>
      <tr>
        <td>3. Ceza Dairesi</td>
        <td>2022/888</td>
        <td>2023/999</td>
        <td>12/04/2023</td>
        <td>Uyuşturucu madde ticareti yapma suçu ve delil değerlendirmesi.</td>
      </tr>
    </tbody>
  </table>
</body>
</html>
`;

describe("YargitayActor", () => {
  it("initializes with correct actorType and description", () => {
    const actor = new YargitayActor();
    assert.equal(actor.actorType, "yargitay");
    assert.ok(actor.description.length > 0);
  });

  it("builds correct endpoint URLs from options", () => {
    const actor = new YargitayActor();

    // Default to Yargitay
    const urlYargitay = actor.buildEndpointUrl(undefined, {
      query: "tapu iptali",
      chamber: "1. Hukuk Dairesi",
    });
    assert.ok(urlYargitay.includes("karararama.yargitay.gov.tr"));
    assert.ok(urlYargitay.includes("q=tapu+iptali"));
    assert.ok(urlYargitay.includes("daire=1.+Hukuk+Dairesi"));

    // Danistay court option
    const urlDanistay = actor.buildEndpointUrl(undefined, {
      court: "danistay",
      caseNumber: "2021/100",
    });
    assert.ok(urlDanistay.includes("karararama.danistay.gov.tr"));
    assert.ok(urlDanistay.includes("esasNo=2021%2F100"));

    // Direct targetUrl bypass
    const direct = actor.buildEndpointUrl("https://karararama.yargitay.gov.tr/custom/decision/123");
    assert.equal(direct, "https://karararama.yargitay.gov.tr/custom/decision/123");
  });

  it("blocks SSRF attempts to private or cloud metadata IPs", async () => {
    const actor = new YargitayActor();
    const task: ActorTask = {
      taskId: "test-ssrf-yargitay-1",
      actorType: "yargitay",
      targetUrl: "http://169.254.169.254/latest/meta-data",
    };

    const result = await actor.run(task, { task, startTime: Date.now() });
    assert.equal(result.status, "failed");
    assert.equal(result.statusCode, 403);
    assert.ok(result.errorMessage?.includes("SSRF"));
  });

  it("extracts and parses JSON decision records", async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(MOCK_YARGITAY_JSON));
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const port = (server.address() as { port: number }).port;
    const mockUrl = `http://127.0.0.1:${port}/api/kararlar`;

    try {
      const actor = new YargitayActor();
      const task: ActorTask = {
        taskId: "test-yargitay-json",
        actorType: "yargitay",
        targetUrl: mockUrl,
      };

      const result = await actor.run(task, { task, startTime: Date.now() });
      assert.equal(result.status, "completed");
      assert.equal(result.statusCode, 200);
      assert.ok(result.data);

      const data = result.data;
      assert.equal(data.totalCount, 2);
      assert.equal(data.court, "Yargıtay");
      assert.equal(data.decisions.length, 2);

      const d1 = data.decisions[0];
      assert.equal(d1.chamber, "1. Hukuk Dairesi");
      assert.equal(d1.caseNumber, "2022/1001");
      assert.equal(d1.decisionNumber, "2023/500");
      assert.equal(d1.decisionDate, "15/02/2023");
      assert.equal(d1.legalArea, "Hukuk");
      assert.ok(d1.summary?.includes("Muris muvazaası"));
      assert.ok(d1.fullText?.includes("toplanan deliller"));

      // Verify Markdown presentation
      assert.ok(data.markdown?.includes("# Yargıtay Emsal İçtihat Kararları"));
      assert.ok(data.markdown?.includes("1. Hukuk Dairesi"));
      assert.ok(data.markdown?.includes("Muris muvazaası"));
    } finally {
      server.close();
    }
  });

  it("extracts and parses HTML decision table rows", async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(MOCK_YARGITAY_HTML);
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const port = (server.address() as { port: number }).port;
    const mockUrl = `http://127.0.0.1:${port}/karararama`;

    try {
      const actor = new YargitayActor();
      const task: ActorTask = {
        taskId: "test-yargitay-html",
        actorType: "yargitay",
        targetUrl: mockUrl,
      };

      const result = await actor.run(task, { task, startTime: Date.now() });
      assert.equal(result.status, "completed");
      assert.ok(result.data);

      const data = result.data;
      assert.equal(data.totalCount, 2);

      const d1 = data.decisions[0];
      assert.equal(d1.chamber, "2. Hukuk Dairesi");
      assert.equal(d1.caseNumber, "2023/1234");
      assert.equal(d1.decisionNumber, "2023/5678");
      assert.equal(d1.decisionDate, "20/06/2023");
      assert.equal(d1.legalArea, "Hukuk");
      assert.ok(d1.summary?.includes("Boşanma davasında"));

      const d2 = data.decisions[1];
      assert.equal(d2.chamber, "3. Ceza Dairesi");
      assert.equal(d2.legalArea, "Ceza");
      assert.ok(d2.summary?.includes("Uyuşturucu madde"));
    } finally {
      server.close();
    }
  });

  it("filters decisions by chamber and query with Turkish diacritic normalization", async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(MOCK_YARGITAY_JSON));
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const port = (server.address() as { port: number }).port;
    const mockUrl = `http://127.0.0.1:${port}/api/kararlar`;

    try {
      const actor = new YargitayActor();
      const task: ActorTask = {
        taskId: "test-yargitay-filter",
        actorType: "yargitay",
        targetUrl: mockUrl,
        options: {
          yargitayOptions: {
            chamber: "ceza genel kurulu",
            query: "yağma",
          },
        },
      };

      const result = await actor.run(task, { task, startTime: Date.now() });
      assert.equal(result.status, "completed");
      assert.ok(result.data);
      assert.equal(result.data.totalCount, 1);
      assert.equal(result.data.decisions[0].chamber, "Ceza Genel Kurulu");
      assert.equal(result.data.decisions[0].legalArea, "Ceza");
    } finally {
      server.close();
    }
  });

  it("handles upstream HTTP error responses gracefully", async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(502, { "Content-Type": "text/plain" });
      res.end("Bad Gateway");
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const port = (server.address() as { port: number }).port;
    const mockUrl = `http://127.0.0.1:${port}/error`;

    try {
      const actor = new YargitayActor();
      const task: ActorTask = {
        taskId: "test-yargitay-502",
        actorType: "yargitay",
        targetUrl: mockUrl,
      };

      const result = await actor.run(task, { task, startTime: Date.now() });
      assert.equal(result.status, "failed");
      assert.equal(result.statusCode, 502);
      assert.ok(result.errorMessage?.includes("502"));
    } finally {
      server.close();
    }
  });
});
