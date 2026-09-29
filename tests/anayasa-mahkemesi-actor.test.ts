/**
 * AnayasaMahkemesiActor Unit & Integration Tests.
 * Tests parameter resolution, SSRF guards, and end-to-end extraction with local mock server.
 */

import assert from "node:assert/strict";
import http from "node:http";
import { after, before, describe, it } from "node:test";
import { AnayasaMahkemesiActor } from "../src/actors/corpus/anayasa-mahkemesi-actor";
import type { ActorTask } from "../src/api/types";

describe("AnayasaMahkemesiActor Unit & Integration Tests", () => {
  let mockServer: http.Server;
  let mockServerPort: number;
  let mockServerUrl: string;

  before(async () => {
    mockServer = http.createServer((req, res) => {
      const parsedUrl = new URL(req.url || "/", "http://localhost");
      const path = parsedUrl.pathname;

      if (path === "/arama" && parsedUrl.searchParams.get("kategori") === "bireysel") {
        const basvuruNo = parsedUrl.searchParams.get("basvuruNo") || "2019/12345";
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            total: 1,
            data: [
              {
                id: "aym-ind-1",
                kategori: "individual",
                basvuruNo,
                kararTarihi: "15/06/2022",
                baslik: `Bireysel Başvuru No: ${basvuruNo}`,
                basvurucu: "Ali Yılmaz",
                ihlalEdilenHaklar: ["Adil Yargılanma Hakkı", "Makul Sürede Yargılanma"],
                sonuc: "İhlal",
                ozet: "Başvurucunun makul sürede yargılanma hakkının ihlal edildiğine karar verilmiştir.",
                url: `${mockServerUrl}/karar/aym-ind-1`,
              },
            ],
          })
        );
        return;
      }

      if (path === "/arama" && parsedUrl.searchParams.get("kategori") === "norm") {
        const esasNo = parsedUrl.searchParams.get("esasNo") || "2023/120";
        const kararNo = parsedUrl.searchParams.get("kararNo") || "2024/45";
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            total: 1,
            data: [
              {
                id: "aym-norm-1",
                kategori: "norm",
                esasNo,
                kararNo,
                kararTarihi: "18/01/2024",
                resmiGazeteTarihi: "12/03/2024",
                resmiGazeteSayisi: "32487",
                baslik: `E. ${esasNo}, K. ${kararNo}`,
                sonuc: "İptal",
                ozet: "7405 sayılı Kanun'un ilgili maddesinin Anayasa'ya aykırı olduğuna ve iptaline.",
                url: `${mockServerUrl}/karar/aym-norm-1`,
              },
            ],
          })
        );
        return;
      }

      if (path.includes("/karar/aym-ind-1")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            karar: {
              id: "aym-ind-1",
              kategori: "individual",
              basvuruNo: "2019/12345",
              kararTarihi: "15/06/2022",
              baslik: "Ali Yılmaz Bireysel Başvurusu (B. No: 2019/12345)",
              sonuc: "İhlal",
              olaylar: "Başvurucu aleyhine açılan ceza davası 8 yıl sürmüştür.",
              gerekce: "Yargılama sürecinin 8 yıl sürmesi makul süre sınırını aşmıştır.",
              hukum:
                "Anayasa'nın 36. maddesinde güvence altına alınan adil yargılanma hakkının ihlal edildiğine karar verilmiştir.",
              karsiOylar: [
                {
                  uye: "Muammer Topal",
                  tur: "karsi_oy",
                  metin:
                    "Davanın karmaşıklığı gözetildiğinde sürenin makul olduğu kanaatiyle çoğunluk görüşüne katılmıyorum.",
                },
              ],
            },
          })
        );
        return;
      }

      if (path.includes("/html-kararlar")) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`
          <!DOCTYPE html>
          <html>
            <body>
              <table>
                <tbody>
                  <tr>
                    <td>2021/54321</td>
                    <td>2022/100</td>
                    <td>22/09/2022</td>
                    <td>İhlal</td>
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
      const actor = new AnayasaMahkemesiActor();
      assert.strictEqual(
        actor.resolveAction("https://kararlarbilgibankasi.anayasa.gov.tr/bireysel"),
        "individual_application"
      );
      assert.strictEqual(
        actor.resolveAction("https://kararlarbilgibankasi.anayasa.gov.tr/norm"),
        "norm_review"
      );
      assert.strictEqual(
        actor.resolveAction("https://kararlarbilgibankasi.anayasa.gov.tr/karar/1234"),
        "decision"
      );
      assert.strictEqual(actor.resolveAction(undefined, "search"), "search");
    });

    it("builds correct search and query URLs", () => {
      const actor = new AnayasaMahkemesiActor();
      const url1 = actor.buildEndpointUrl(undefined, "individual_application", {
        applicationNumber: "2019/12345",
      });
      assert.ok(url1.includes("kategori=bireysel"));
      assert.ok(url1.includes("basvuruNo=2019%2F12345"));

      const url2 = actor.buildEndpointUrl(undefined, "norm_review", {
        caseNumber: "2023/10",
        decisionNumber: "2024/5",
      });
      assert.ok(url2.includes("kategori=norm"));
      assert.ok(url2.includes("esasNo=2023%2F10"));
      assert.ok(url2.includes("kararNo=2024%2F5"));
    });

    it("blocks SSRF attempts on metadata IP", async () => {
      const actor = new AnayasaMahkemesiActor();
      const task: ActorTask = {
        taskId: "test-ssrf",
        actorType: "anayasa-mahkemesi",
        targetUrl: "http://169.254.169.254/latest/meta-data",
      };

      const result = await actor.run(task, { task });
      assert.strictEqual(result.status, "failed");
      assert.strictEqual(result.statusCode, 403);
      assert.match(result.errorMessage || "", /SSRF/);
    });
  });

  describe("End-to-End Extraction with Local Mock Server", () => {
    it("extracts individual application judgments with rights and outcomes", async () => {
      const actor = new AnayasaMahkemesiActor();
      const task: ActorTask = {
        taskId: "test-aym-ind",
        actorType: "anayasa-mahkemesi",
        targetUrl: `${mockServerUrl}/arama?kategori=bireysel&basvuruNo=2019/12345`,
        options: {
          anayasaMahkemesiOptions: {
            action: "individual_application",
            applicationNumber: "2019/12345",
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
      assert.strictEqual(dec.applicationNumber, "2019/12345");
      assert.strictEqual(dec.outcome, "İhlal");
      assert.ok(dec.violatedRights?.includes("Adil Yargılanma Hakkı"));
      assert.match(result.data.markdown || "", /# T\.C\. Anayasa Mahkemesi/);
    });

    it("extracts norm review decisions with gazette metadata", async () => {
      const actor = new AnayasaMahkemesiActor();
      const task: ActorTask = {
        taskId: "test-aym-norm",
        actorType: "anayasa-mahkemesi",
        targetUrl: `${mockServerUrl}/arama?kategori=norm&esasNo=2023/120`,
        options: {
          anayasaMahkemesiOptions: {
            action: "norm_review",
            caseNumber: "2023/120",
          },
        },
      };

      const result = await actor.run(task, { task });
      assert.strictEqual(result.status, "completed");
      assert.strictEqual(result.statusCode, 200);
      assert.ok(result.data);
      assert.strictEqual(result.data.totalResults, 1);
      const dec = result.data.decisions[0];
      assert.strictEqual(dec.caseNumber, "2023/120");
      assert.strictEqual(dec.decisionNumber, "2024/45");
      assert.strictEqual(dec.officialGazetteNumber, "32487");
      assert.strictEqual(dec.outcome, "İptal");
    });

    it("extracts decision details with dissenting opinions", async () => {
      const actor = new AnayasaMahkemesiActor();
      const task: ActorTask = {
        taskId: "test-aym-detail",
        actorType: "anayasa-mahkemesi",
        targetUrl: `${mockServerUrl}/karar/aym-ind-1`,
        options: {
          anayasaMahkemesiOptions: {
            action: "decision",
            decisionId: "aym-ind-1",
          },
        },
      };

      const result = await actor.run(task, { task });
      assert.strictEqual(result.status, "completed");
      assert.strictEqual(result.statusCode, 200);
      assert.ok(result.data?.decision);
      assert.strictEqual(result.data.decision.applicationNumber, "2019/12345");
      assert.ok(result.data.decision.dissentingOpinions);
      assert.strictEqual(result.data.decision.dissentingOpinions.length, 1);
      assert.strictEqual(result.data.decision.dissentingOpinions[0].judgeName, "Muammer Topal");
      assert.match(result.data.markdown || "", /## Karşı Oylar/);
    });

    it("parses HTML decision table rows fallback", async () => {
      const actor = new AnayasaMahkemesiActor();
      const task: ActorTask = {
        taskId: "test-aym-html",
        actorType: "anayasa-mahkemesi",
        targetUrl: `${mockServerUrl}/html-kararlar`,
        options: {
          anayasaMahkemesiOptions: {
            action: "search",
          },
        },
      };

      const result = await actor.run(task, { task });
      assert.strictEqual(result.status, "completed");
      assert.strictEqual(result.statusCode, 200);
      assert.ok(result.data?.decisions);
      assert.strictEqual(result.data.decisions.length, 1);
      assert.strictEqual(result.data.decisions[0].applicationNumber, "2021/54321");
      assert.strictEqual(result.data.decisions[0].outcome, "İhlal");
    });

    it("handles upstream HTTP error responses gracefully", async () => {
      const actor = new AnayasaMahkemesiActor();
      const task: ActorTask = {
        taskId: "test-aym-404",
        actorType: "anayasa-mahkemesi",
        targetUrl: `${mockServerUrl}/not-found-endpoint`,
      };

      const result = await actor.run(task, { task });
      assert.strictEqual(result.status, "failed");
      assert.strictEqual(result.statusCode, 404);
      assert.match(result.errorMessage || "", /Upstream AYM request failed/);
    });
  });
});
