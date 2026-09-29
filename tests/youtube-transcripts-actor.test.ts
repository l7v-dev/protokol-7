/**
 * Unit and integration tests for YoutubeTranscriptsActor.
 */

import assert from "node:assert/strict";
import http from "node:http";
import { describe, it } from "node:test";
import { YoutubeTranscriptsActor } from "../src/actors/corpus/youtube-transcripts-actor";
import type { ActorTask } from "../src/api/types";

(process.env as Record<string, string | undefined>).NODE_ENV = "test";

const MOCK_TIMED_TEXT_XML = `<?xml version="1.0" encoding="utf-8" ?>
<transcript>
  <text start="0.5" dur="2.3">[Music] Welcome to the &amp;quot;Deep Learning&amp;quot; lecture &#39;series&#39;.</text>
  <text start="2.8" dur="1.7">&gt;&gt; In this session, we discuss neural architectures. [Applause]</text>
  <text start="4.5" dur="3.0">SPEAKER 1: Attention is all you need. [Laughter] [Müzik]</text>
</transcript>`;

const MOCK_WATCH_PAGE_HTML = `<!DOCTYPE html>
<html>
<head><title>Test Video</title></head>
<body>
<script>
var ytInitialPlayerResponse = {
  "videoDetails": {
    "videoId": "aqz-KE-bpKQ",
    "title": "Introduction to Deep Neural Networks",
    "author": "DeepLearningAI",
    "channelId": "UC000000000000000000001",
    "shortDescription": "Comprehensive introduction to transformer architectures and attention.",
    "viewCount": "125000",
    "keywords": ["ai", "deep-learning", "transformers"]
  },
  "microformat": {
    "playerMicroformatRenderer": {
      "publishDate": "2024-03-15T12:00:00.000Z",
      "ownerChannelName": "DeepLearningAI"
    }
  },
  "captions": {
    "playerCaptionsTracklistRenderer": {
      "captionTracks": [
        {
          "baseUrl": "TIMED_TEXT_URL_PLACEHOLDER",
          "name": { "simpleText": "English" },
          "vssId": ".en",
          "languageCode": "en",
          "kind": "asr",
          "isTranslatable": true
        }
      ]
    }
  }
};
</script>
</body>
</html>`;

describe("YoutubeTranscriptsActor Unit & Integration Tests", () => {
  const actor = new YoutubeTranscriptsActor();

  describe("URL Normalization & Video ID Extraction", () => {
    it("extracts 11-char ID from standard watch URL", () => {
      const id = actor.extractVideoId("https://www.youtube.com/watch?v=aqz-KE-bpKQ");
      assert.strictEqual(id, "aqz-KE-bpKQ");
    });

    it("extracts 11-char ID from shortened youtu.be URL", () => {
      const id = actor.extractVideoId("https://youtu.be/aqz-KE-bpKQ?si=xyz123");
      assert.strictEqual(id, "aqz-KE-bpKQ");
    });

    it("extracts 11-char ID from YouTube Shorts URL", () => {
      const id = actor.extractVideoId("https://www.youtube.com/shorts/aqz-KE-bpKQ");
      assert.strictEqual(id, "aqz-KE-bpKQ");
    });

    it("extracts 11-char ID from embed URL", () => {
      const id = actor.extractVideoId("https://www.youtube.com/embed/aqz-KE-bpKQ");
      assert.strictEqual(id, "aqz-KE-bpKQ");
    });

    it("accepts direct 11-character video ID string", () => {
      const id = actor.extractVideoId("aqz-KE-bpKQ");
      assert.strictEqual(id, "aqz-KE-bpKQ");
    });

    it("returns null for malformed or non-YouTube URLs", () => {
      assert.strictEqual(actor.extractVideoId("https://example.com/video"), null);
      assert.strictEqual(actor.extractVideoId("not-a-valid-id"), null);
      assert.strictEqual(actor.extractVideoId(""), null);
    });
  });

  describe("TimedText XML Parsing", () => {
    it("correctly parses XML segments into start, end, and raw text", () => {
      const segments = actor.parseTimedTextXml(MOCK_TIMED_TEXT_XML);
      assert.strictEqual(segments.length, 3);

      assert.strictEqual(segments[0].start, 0.5);
      assert.strictEqual(segments[0].end, 2.8);
      assert.ok(segments[0].text.includes("Welcome to the"));

      assert.strictEqual(segments[1].start, 2.8);
      assert.strictEqual(segments[1].end, 4.5);

      assert.strictEqual(segments[2].start, 4.5);
      assert.strictEqual(segments[2].end, 7.5);
    });
  });

  describe("LLM Clean Text Filter (Acoustic Label Stripping)", () => {
    it("strips [Music], [Applause], [Laughter] and unescapes HTML entities", () => {
      const raw = "[Music] Welcome to the &quot;Deep Learning&quot; lecture &#39;series&#39;.";
      const cleaned = actor.cleanSegmentText(raw);
      assert.strictEqual(cleaned, "Welcome to the \"Deep Learning\" lecture 'series'.");
    });

    it("strips Turkish acoustic labels [Müzik], [Alkış], [Gülüşmeler]", () => {
      const raw = "[Müzik] Bu derste temel modelleri inceliyoruz. [Alkış] [Gülüşmeler]";
      const cleaned = actor.cleanSegmentText(raw);
      assert.strictEqual(cleaned, "Bu derste temel modelleri inceliyoruz.");
    });

    it("strips speaker prompts and arrows like '>>' and 'SPEAKER 1:'", () => {
      const raw1 = ">> In this session, we discuss neural architectures. [Applause]";
      assert.strictEqual(
        actor.cleanSegmentText(raw1),
        "In this session, we discuss neural architectures."
      );

      const raw2 = "SPEAKER 1: Attention is all you need.";
      assert.strictEqual(actor.cleanSegmentText(raw2), "Attention is all you need.");
    });

    it("strips music notes ♪ and ♫", () => {
      const raw = "♪ Singing in the rain ♫";
      assert.strictEqual(actor.cleanSegmentText(raw), "Singing in the rain");
    });
  });

  describe("Actor Task Validation & Security Invariants", () => {
    it("fails with 400 when no URLs or video IDs are provided", async () => {
      const task: ActorTask = {
        taskId: "test-empty",
        actorType: "youtube-transcripts",
        targetUrl: "",
        options: {
          youtubeTranscriptsOptions: {
            urls: [],
          },
        },
      };

      const result = await actor.run(task);
      assert.strictEqual(result.status, "failed");
      assert.strictEqual(result.statusCode, 400);
      assert.ok(result.errorMessage?.includes("No target URLs"));
    });

    it("blocks SSRF attempts on restricted IP ranges", async () => {
      const task: ActorTask = {
        taskId: "test-ssrf",
        actorType: "youtube-transcripts",
        targetUrl: "https://169.254.169.254/latest/meta-data",
        options: {
          youtubeTranscriptsOptions: {
            urls: ["https://169.254.169.254/latest/meta-data"],
          },
        },
      };

      const result = await actor.run(task);
      // When target is not a valid 11-char ID or blocked, returns status accordingly
      assert.strictEqual(result.data?.failedCount, 1);
      assert.strictEqual(result.data?.records[0].transcriptFound, false);
    });
  });

  describe("End-to-End Extraction with Local Mock Server", () => {
    let server: http.Server;
    let serverUrl: string;

    it("starts local mock YouTube HTTP server", async () => {
      server = http.createServer((req, res) => {
        const url = req.url || "";
        if (url.includes("/api/timedtext")) {
          res.writeHead(200, { "Content-Type": "application/xml; charset=utf-8" });
          res.end(MOCK_TIMED_TEXT_XML);
        } else {
          // Watch page HTML
          const renderedHtml = MOCK_WATCH_PAGE_HTML.replace(
            "TIMED_TEXT_URL_PLACEHOLDER",
            `${serverUrl}/api/timedtext?v=aqz-KE-bpKQ`
          );
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(renderedHtml);
        }
      });

      await new Promise<void>((resolve) => {
        server.listen(0, "127.0.0.1", () => {
          const addr = server.address() as { port: number };
          serverUrl = `http://127.0.0.1:${addr.port}`;
          resolve();
        });
      });
    });

    it("successfully harvests transcript and metadata in 'captions' format", async () => {
      const task: ActorTask = {
        taskId: "test-harvest-captions",
        actorType: "youtube-transcripts",
        targetUrl: `${serverUrl}/watch?v=aqz-KE-bpKQ`,
        options: {
          youtubeTranscriptsOptions: {
            urls: [`${serverUrl}/watch?v=aqz-KE-bpKQ`],
            outputFormat: "captions",
            cleanText: true,
            channelNameBoolean: true,
            channelIDBoolean: true,
            datePublishedBoolean: true,
            viewCountBoolean: true,
            keywordsBoolean: true,
          },
        },
      };

      const result = await actor.run(task);
      assert.strictEqual(result.status, "completed");
      assert.strictEqual(result.statusCode, 200);
      assert.strictEqual(result.data?.totalProcessed, 1);
      assert.strictEqual(result.data?.successfulCount, 1);

      const record = result.data?.records[0];
      assert.ok(record);
      assert.strictEqual(record.videoId, "aqz-KE-bpKQ");
      assert.strictEqual(record.title, "Introduction to Deep Neural Networks");
      assert.strictEqual(record.channelName, "DeepLearningAI");
      assert.strictEqual(record.channelID, "UC000000000000000000001");
      assert.strictEqual(record.datePublished, "2024-03-15T12:00:00.000Z");
      assert.strictEqual(record.viewCount, "125,000 views");
      assert.strictEqual(record.keywords, "ai, deep-learning, transformers");
      assert.strictEqual(record.transcriptFound, true);

      // Verify captions array is clean
      assert.ok(Array.isArray(record.captions));
      assert.strictEqual((record.captions as string[]).length, 3);
      assert.strictEqual(
        (record.captions as string[])[0],
        "Welcome to the \"Deep Learning\" lecture 'series'."
      );
      assert.strictEqual(
        (record.captions as string[])[1],
        "In this session, we discuss neural architectures."
      );
      assert.strictEqual((record.captions as string[])[2], "Attention is all you need.");

      // Verify GFM Markdown
      assert.ok(result.data?.markdown.includes("# YouTube Transcripts Harvester Report"));
      assert.ok(result.data?.markdown.includes("Introduction to Deep Neural Networks"));
    });

    it("successfully harvests transcript in 'textWithTimestamps' format", async () => {
      const task: ActorTask = {
        taskId: "test-harvest-timestamps",
        actorType: "youtube-transcripts",
        targetUrl: `${serverUrl}/watch?v=aqz-KE-bpKQ`,
        options: {
          youtubeTranscriptsOptions: {
            urls: [`${serverUrl}/watch?v=aqz-KE-bpKQ`],
            outputFormat: "textWithTimestamps",
            cleanText: true,
          },
        },
      };

      const result = await actor.run(task);
      assert.strictEqual(result.status, "completed");
      const record = result.data?.records[0];
      assert.ok(record);
      assert.ok(Array.isArray(record.captions));

      const firstSeg = (record.captions as Array<{ start: number; end: number; text: string }>)[0];
      assert.strictEqual(firstSeg.start, 0.5);
      assert.strictEqual(firstSeg.end, 2.8);
      assert.strictEqual(firstSeg.text, "Welcome to the \"Deep Learning\" lecture 'series'.");
    });

    it("successfully harvests transcript in 'singleStringText' format for LLMs", async () => {
      const task: ActorTask = {
        taskId: "test-harvest-single-string",
        actorType: "youtube-transcripts",
        targetUrl: `${serverUrl}/watch?v=aqz-KE-bpKQ`,
        options: {
          youtubeTranscriptsOptions: {
            urls: [`${serverUrl}/watch?v=aqz-KE-bpKQ`],
            outputFormat: "singleStringText",
            cleanText: true,
          },
        },
      };

      const result = await actor.run(task);
      assert.strictEqual(result.status, "completed");
      const record = result.data?.records[0];
      assert.ok(record);
      assert.strictEqual(typeof record.captions, "string");
      assert.strictEqual(
        record.captions,
        "Welcome to the \"Deep Learning\" lecture 'series'. In this session, we discuss neural architectures. Attention is all you need."
      );
    });

    it("stops local mock HTTP server", async () => {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    });
  });
});
