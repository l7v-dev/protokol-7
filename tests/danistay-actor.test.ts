/**
 * DanistayActor Unit & Integration Tests.
 * Tests parameter resolution, SSRF guards, and end-to-end extraction with local mock server.
 */

import assert from "node:assert/strict";
import http from "node:http";
import { after, before, describe, it } from "node:test";
import { DanistayActor } from "../src/actors/corpus/danistay-actor";
import type { ActorTask } from "../src/api/types";

describe("DanistayActor Unit & Integration Tests", () => {
  let mockServer: http.Server;
  let mockServerPort: number;
  let mockServerUrl: string;

  before(async () => {
    mockServer = http.createServer((req, res) => {
      const parsedUrl = new URL(req.url || "/", "http://localhost");
      const path = parsedUrl.pathname;

      if (path === "/arama") {
        const daire = parsedUrl.searchParams.get("daire") || "İDDK";
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            total: 1,
            data: [
              {
                id: "danistay-101",
                daire,
                esasNo: "2021/1500",
                kararNo: "2023/2400",
                kararTarihi: "12/04/2023",
                hukukAlani: "İdare",
                kararTuru: "Bozma",
                konu: "Kamulaştırmasız el atma tazminatı",
                ozet: "İdarenin fiili el atma olmaksızın imar planı kısıtlaması nedeniyle açılan davada bozma kararı.",
                url: `${mockServerUrl}/karar/danistay-101`,
              },
            ],
          })
        );
        return;
      }

      if (path.includes("/karar/danistay-101")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            karar: {
              id: "danistay-101",
              daire: "İdari Dava Daireleri Kurulu",
              esasNo: "2021/1500",
              kararNo: "2023/2400",
              kararTarihi: "12/04/2023",
              hukukAlani: "İdare",
              kararTuru: "Bozma",
              ilkDereceMahkemesi: "Ankara 4. İdare Mahkemesi",
              temyizEden: "Çevre, Şehircilik ve İklim Değişikliği Bakanlığı",
              karsiTaraf: "Ahmet Demir",
              tetkikHakimi:
                "Davanın kabulü yönündeki ilk derece mahkemesi kararının onanması gerektiği düşünülmektedir.",
              danistaySavcisi:
                "Temyiz isteminin kabulü ile kararın bozulması gerektiği düşünülmüştür.",
              maddiOlaylar:
                "Davacının taşınmazının imar planında rekreasyon alanı olarak ayrılması.",
              hukukiGerekce:
                "Mülkiyet hakkının özüne dokunan kısıtlamaların makul sürede giderilmemesi tazminat sorumluluğu doğurur.",
              hukum: "Ankara 4. İdare Mahkemesi kararının BOZULMASINA oyçokluğuyla karar verildi.",
              karsiOylar: [
                {
                  uye: "Mehmet Akif",
                  metin:
                    "İdarece henüz fiili bir tasarruf yapılmadığından davanın reddi gerektiği kanaatiyle çoğunluk kararına karşıyım.",
                },
              ],
            },
          })
        );
        return;
      }

      if (path.includes("/html-emsal")) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`
          <!DOCTYPE html>
          <html>
            <body>
              <table>
                <tbody>
                  <tr>
                    <td>6. Daire</td>
                    <td>2020/4321</td>
                    <td>2021/9876</td>
                    <td>10/11/2021</td>
                    <td>İptal</td>
                  </tr>
                </tbody>
              </table>
            </body>
          </html>
        `);
        return;
      }

      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
    });

    await new Promise<void>((resolve) => {
      mockServer.listen(0, "127.0.0.1", () => {
        const addr = mockServer.address();
        if (addr && typeof addr === "object") {
          mockServerPort = addr.port;
          mockServerUrl = `http://127.0.0.1:${mockServerPort}`;
        }
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => {
      mockServer.close(() => resolve());
    });
  });

  describe("Parameter Resolution & Security", () => {
    it("resolves action mode correctly", () => {
      const actor = new DanistayActor();
      assert.strictEqual(
        actor.resolveAction("https://karararama.danistay.gov.tr/karar/1234"),
        "decision"
      );
      assert.strictEqual(actor.resolveAction("https://karararama.danistay.gov.tr/arama"), "search");
    });

    it("builds correct search endpoint URL with chamber and filters", () => {
      const actor = new DanistayActor();
      const url = actor.buildEndpointUrl(undefined, "search", {
        query: "vergi ziyai",
        chamber: "vddk",
        caseNumber: "2022/100",
        decisionNumber: "2023/50",
        year: 2023,
      });

      assert.ok(url.includes("q=vergi+ziyai"));
      assert.ok(url.includes("daire=vddk"));
      assert.ok(url.includes("esasNo=2022%2F100"));
      assert.ok(url.includes("kararNo=2023%2F50"));
      assert.ok(url.includes("yil=2023"));
    });

    it("blocks SSRF attempts on metadata IP", async () => {
      const actor = new DanistayActor();
      const task: ActorTask = {
        taskId: "test-ssrf",
        actorType: "danistay",
        targetUrl: "http://169.254.169.254/latest/meta-data",
      };

      const result = await actor.run(task, { task });
      assert.strictEqual(result.status, "failed");
      assert.strictEqual(result.statusCode, 403);
      assert.match(result.errorMessage || "", /SSRF/);
    });
  });

  describe("End-to-End Extraction with Local Mock Server", () => {
    it("extracts Danıştay decision list via JSON search", async () => {
      const actor = new DanistayActor();
      const task: ActorTask = {
        taskId: "test-danistay-search",
        actorType: "danistay",
        targetUrl: `${mockServerUrl}/arama?daire=iddk`,
        options: {
          danistayOptions: {
            action: "search",
            chamber: "iddk",
          },
        },
      };

      const result = await actor.run(task, { task });
      assert.strictEqual(result.status, "completed");
      assert.strictEqual(result.statusCode, 200);
      assert.ok(result.data);
      assert.strictEqual(result.data.totalResults, 1);
      assert.strictEqual(result.data.decisions.length, 1);
      const dec = result.data.decisions[0];
      assert.strictEqual(dec.caseNumber, "2021/1500");
      assert.strictEqual(dec.decisionNumber, "2023/2400");
      assert.strictEqual(dec.decisionType, "Bozma");
      assert.strictEqual(dec.legalArea, "İdare");
      assert.match(result.data.markdown || "", /# T\.C\. Danıştay Başkanlığı/);
    });

    it("extracts single decision detail with reporter and prosecutor opinions", async () => {
      const actor = new DanistayActor();
      const task: ActorTask = {
        taskId: "test-danistay-detail",
        actorType: "danistay",
        targetUrl: `${mockServerUrl}/karar/danistay-101`,
        options: {
          danistayOptions: {
            action: "decision",
            decisionId: "danistay-101",
          },
        },
      };

      const result = await actor.run(task, { task });
      assert.strictEqual(result.status, "completed");
      assert.strictEqual(result.statusCode, 200);
      assert.ok(result.data?.decision);
      assert.strictEqual(result.data.decision.lowerCourt, "Ankara 4. İdare Mahkemesi");
      assert.strictEqual(
        result.data.decision.appellant,
        "Çevre, Şehircilik ve İklim Değişikliği Bakanlığı"
      );
      assert.ok(result.data.decision.reporterOpinion);
      assert.ok(result.data.decision.prosecutorOpinion);
      assert.ok(result.data.decision.dissentingOpinions);
      assert.strictEqual(result.data.decision.dissentingOpinions.length, 1);
      assert.strictEqual(result.data.decision.dissentingOpinions[0].member, "Mehmet Akif");
      assert.match(result.data.markdown || "", /## Karşı Oylar/);
    });

    it("parses HTML decision table rows fallback", async () => {
      const actor = new DanistayActor();
      const task: ActorTask = {
        taskId: "test-danistay-html",
        actorType: "danistay",
        targetUrl: `${mockServerUrl}/html-emsal`,
        options: {
          danistayOptions: {
            action: "search",
          },
        },
      };

      const result = await actor.run(task, { task });
      assert.strictEqual(result.status, "completed");
      assert.strictEqual(result.statusCode, 200);
      assert.ok(result.data?.decisions);
      assert.strictEqual(result.data.decisions.length, 1);
      assert.strictEqual(result.data.decisions[0].chamber, "6. Daire");
      assert.strictEqual(result.data.decisions[0].caseNumber, "2020/4321");
      assert.strictEqual(result.data.decisions[0].decisionType, "İptal");
    });

    it("handles upstream HTTP error responses gracefully", async () => {
      const actor = new DanistayActor();
      const task: ActorTask = {
        taskId: "test-danistay-404",
        actorType: "danistay",
        targetUrl: `${mockServerUrl}/not-found-endpoint`,
      };

      const result = await actor.run(task, { task });
      assert.strictEqual(result.status, "failed");
      assert.strictEqual(result.statusCode, 404);
      assert.match(result.errorMessage || "", /Upstream Danıştay request failed/);
    });
  });
});
