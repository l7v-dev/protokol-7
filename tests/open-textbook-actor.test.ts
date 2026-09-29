/**
 * OpenTextbookActor Unit & Integration Tests.
 * Tests parameter resolution, SSRF guards, and end-to-end extraction with local mock server.
 */

import assert from "node:assert/strict";
import http from "node:http";
import { after, before, describe, it } from "node:test";
import { OpenTextbookActor } from "../src/actors/corpus/open-textbook-actor";
import type { ActorTask } from "../src/api/types";

describe("OpenTextbookActor Unit & Integration Tests", () => {
  let mockServer: http.Server;
  let mockServerPort: number;
  let mockServerUrl: string;

  before(async () => {
    mockServer = http.createServer((req, res) => {
      const parsedUrl = new URL(req.url || "/", "http://localhost");
      const path = parsedUrl.pathname;

      if (path === "/opentextbooks/textbooks" && parsedUrl.searchParams.has("term")) {
        const _query = parsedUrl.searchParams.get("term") || "";
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>Search Results</title></head>
            <body>
              <div class="Search-results">
                <article class="textbook">
                  <h2><a href="/opentextbooks/textbooks/calculus-vol-1">Calculus Volume 1</a></h2>
                  <p class="author">By: Edwin Herman, Gilbert Strang</p>
                  <p class="publisher">Publisher: OpenStax</p>
                  <p class="rating">4.8 out of 5 (24 reviews)</p>
                  <p class="description">Calculus Volume 1 covers functions, limits, derivatives, and integration for STEM students.</p>
                </article>
                <article class="textbook">
                  <h2><a href="/opentextbooks/textbooks/active-calculus">Active Calculus</a></h2>
                  <p class="author">By: Matthew Boelkins</p>
                  <p class="publisher">Publisher: Grand Valley State</p>
                  <p class="rating">4.6 out of 5 (18 reviews)</p>
                  <p class="description">Active Calculus focuses on conceptual understanding and active learning.</p>
                </article>
              </div>
            </body>
          </html>
        `);
        return;
      }

      if (path === "/opentextbooks/textbooks/calculus-vol-1") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>Calculus Volume 1 - Open Textbook Library</title></head>
            <body>
              <h1 class="textbook-title">Calculus Volume 1</h1>
              <p class="author">Contributors: Edwin Herman, Gilbert Strang</p>
              <p class="publisher">Publisher: OpenStax</p>
              <p class="publish-date">Publication Date: 2016</p>
              <p class="license">Conditions of Use: CC BY-NC-SA</p>
              <p class="isbn">ISBN-13: 978-1-938168-02-4</p>
              <div class="formats">
                <a href="/downloads/calculus-vol-1.pdf">PDF</a>
                <a href="/downloads/calculus-vol-1.epub">EPUB</a>
                <a href="https://openstax.org/details/books/calculus-volume-1">Online</a>
              </div>
              <div id="about">
                <p>Calculus Volume 1 is designed for the standard two- or three-semester calculus course.</p>
              </div>
              <div id="table-of-contents">
                <ul>
                  <li>Chapter 1: Functions and Graphs</li>
                  <li>Chapter 2: Limits</li>
                  <li>Chapter 3: Derivatives</li>
                  <li>Chapter 4: Applications of Derivatives</li>
                </ul>
              </div>
              <div class="reviews">
                <div class="review">
                  <h4 class="reviewer-name">Dr. Jane Smith</h4>
                  <span class="reviewer-institution">University of Michigan</span>
                  <span class="review-date">May 12, 2022</span>
                  <span class="rating">5 out of 5</span>
                  <div class="review-content">
                    <p>Excellent foundational text with clear figures and rigorous proofs.</p>
                  </div>
                </div>
              </div>
            </body>
          </html>
        `);
        return;
      }

      if (path === "/opentextbooks/subjects") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>Subjects - Open Textbook Library</title></head>
            <body>
              <ul class="subjects-list">
                <li><a href="/opentextbooks/subjects/mathematics">Mathematics (145)</a></li>
                <li><a href="/opentextbooks/subjects/computer-science">Computer Science (98)</a></li>
                <li><a href="/opentextbooks/subjects/business">Business (210)</a></li>
              </ul>
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

  describe("Security & Invariants", () => {
    it("rejects SSRF requests to cloud metadata endpoint", async () => {
      const actor = new OpenTextbookActor();
      const task: ActorTask = {
        taskId: "test-ssrf",
        actorType: "open-textbook",
        targetUrl: "http://169.254.169.254/latest/meta-data",
        options: {
          openTextbookOptions: {
            action: "book",
          },
        },
      };

      const result = await actor.run(task, { task, startTime: Date.now() });
      assert.strictEqual(result.status, "failed");
      assert.strictEqual(result.statusCode, 403);
      assert.match(result.errorMessage || "", /SSRF validation failed/i);
    });
  });

  describe("End-to-End Extraction with Local Mock Server", () => {
    it("executes textbook search query", async () => {
      const actor = new OpenTextbookActor();
      const task: ActorTask = {
        taskId: "test-search",
        actorType: "open-textbook",
        targetUrl: `${mockServerUrl}/opentextbooks/textbooks?term=calculus`,
        options: {
          openTextbookOptions: {
            action: "search",
            query: "calculus",
          },
        },
      };

      const result = await actor.run(task, { task, startTime: Date.now() });
      assert.strictEqual(result.status, "completed");
      assert.strictEqual(result.statusCode, 200);
      assert.ok(result.data);
      assert.strictEqual(result.data.action, "search");
      assert.ok(result.data.books && result.data.books.length === 2);
      assert.strictEqual(result.data.books[0].title, "Calculus Volume 1");
      assert.strictEqual(result.data.books[0].publisher, "OpenStax");
      assert.strictEqual(result.data.books[0].rating, 4.8);
      assert.strictEqual(result.data.books[0].reviewCount, 24);
      assert.match(result.data.markdown || "", /# Open Textbook Library Search Results/);
    });

    it("extracts full textbook details, formats, TOC, and peer reviews", async () => {
      const actor = new OpenTextbookActor();
      const task: ActorTask = {
        taskId: "test-book",
        actorType: "open-textbook",
        targetUrl: `${mockServerUrl}/opentextbooks/textbooks/calculus-vol-1`,
        options: {
          openTextbookOptions: {
            action: "book",
            bookId: "calculus-vol-1",
          },
        },
      };

      const result = await actor.run(task, { task, startTime: Date.now() });
      assert.strictEqual(result.status, "completed");
      assert.strictEqual(result.statusCode, 200);
      assert.ok(result.data);
      assert.strictEqual(result.data.action, "book");
      assert.ok(result.data.book);
      assert.strictEqual(result.data.book.title, "Calculus Volume 1");
      assert.strictEqual(result.data.book.publisher, "OpenStax");
      assert.strictEqual(result.data.book.license, "CC BY-NC-SA");
      assert.strictEqual(result.data.book.isbn, "978-1-938168-02-4");
      assert.ok(result.data.book.formats && result.data.book.formats.length === 3);
      assert.ok(result.data.book.tableOfContents && result.data.book.tableOfContents.length === 4);
      assert.ok(result.data.book.reviews && result.data.book.reviews.length === 1);
      assert.strictEqual(result.data.book.reviews[0].reviewer, "Dr. Jane Smith");
      assert.strictEqual(result.data.book.reviews[0].institution, "University of Michigan");
      assert.strictEqual(result.data.book.reviews[0].rating, 5);
      assert.match(result.data.markdown || "", /## Peer Reviews/);
    });

    it("extracts academic subjects catalog", async () => {
      const actor = new OpenTextbookActor();
      const task: ActorTask = {
        taskId: "test-subjects",
        actorType: "open-textbook",
        targetUrl: `${mockServerUrl}/opentextbooks/subjects`,
        options: {
          openTextbookOptions: {
            action: "subjects",
          },
        },
      };

      const result = await actor.run(task, { task, startTime: Date.now() });
      assert.strictEqual(result.status, "completed");
      assert.strictEqual(result.statusCode, 200);
      assert.ok(result.data);
      assert.strictEqual(result.data.action, "subjects");
      assert.ok(result.data.subjects && result.data.subjects.length === 3);
      assert.strictEqual(result.data.subjects[0].name, "Mathematics");
      assert.strictEqual(result.data.subjects[0].slug, "mathematics");
      assert.strictEqual(result.data.subjects[0].bookCount, 145);
      assert.match(result.data.markdown || "", /# Open Textbook Library Academic Subjects/);
    });
  });
});
