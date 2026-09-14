import assert from "node:assert/strict";
import * as http from "node:http";
import test from "node:test";
import { gzipSync } from "node:zlib";
import { SitemapXmlActor } from "@/sitemap-xml-actor";

(process.env as Record<string, string | undefined>).NODE_ENV = "test";

test("SitemapXmlActor parses standard urlset with metadata", async () => {
  const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://example.com/page-1</loc>
    <lastmod>2026-09-01</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://example.com/page-2</loc>
    <lastmod>2026-09-02</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.5</priority>
  </url>
</urlset>`;

  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/xml" });
    res.end(xmlContent);
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const targetUrl = `http://127.0.0.1:${port}/sitemap.xml`;

  const actor = new SitemapXmlActor();
  const result = await actor.run(
    {
      taskId: "test-sitemap-1",
      actorType: "sitemap-xml",
      targetUrl,
    },
    {
      task: { taskId: "test-sitemap-1", actorType: "sitemap-xml", targetUrl },
      startTime: Date.now(),
    }
  );

  server.close();

  assert.equal(result.status, "completed");
  assert.equal(result.statusCode, 200);
  assert.ok(result.data);
  assert.equal(result.data.isIndex, false);
  assert.equal(result.data.totalUrls, 2);
  assert.equal(result.data.urls[0].loc, "https://example.com/page-1");
  assert.equal(result.data.urls[0].lastmod, "2026-09-01");
  assert.equal(result.data.urls[0].changefreq, "daily");
  assert.equal(result.data.urls[0].priority, 0.8);
  assert.equal(result.data.urls[1].loc, "https://example.com/page-2");
});

test("SitemapXmlActor parses sitemapindex and recursively traverses child sitemaps", async () => {
  let serverPort = 0;

  const server = http.createServer((req, res) => {
    if (req.url === "/sitemap_index.xml") {
      res.writeHead(200, { "Content-Type": "application/xml" });
      res.end(`<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>http://127.0.0.1:${serverPort}/sub_sitemap_1.xml</loc>
  </sitemap>
  <sitemap>
    <loc>http://127.0.0.1:${serverPort}/sub_sitemap_2.xml</loc>
  </sitemap>
</sitemapindex>`);
      return;
    }

    if (req.url === "/sub_sitemap_1.xml") {
      res.writeHead(200, { "Content-Type": "application/xml" });
      res.end(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/sub-1-page</loc></url>
</urlset>`);
      return;
    }

    if (req.url === "/sub_sitemap_2.xml") {
      res.writeHead(200, { "Content-Type": "application/xml" });
      res.end(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/sub-2-page</loc></url>
</urlset>`);
      return;
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  serverPort = (server.address() as { port: number }).port;
  const targetUrl = `http://127.0.0.1:${serverPort}/sitemap_index.xml`;

  const actor = new SitemapXmlActor();
  const result = await actor.run(
    {
      taskId: "test-sitemap-index",
      actorType: "sitemap-xml",
      targetUrl,
      options: {
        sitemapOptions: {
          maxDepth: 2,
        },
      },
    },
    {
      task: { taskId: "test-sitemap-index", actorType: "sitemap-xml", targetUrl },
      startTime: Date.now(),
    }
  );

  server.close();

  assert.equal(result.status, "completed");
  assert.ok(result.data);
  assert.equal(result.data.isIndex, true);
  assert.equal(result.data.subSitemaps?.length, 2);
  assert.equal(result.data.totalUrls, 2);
  assert.equal(result.data.urls[0].loc, "https://example.com/sub-1-page");
  assert.equal(result.data.urls[1].loc, "https://example.com/sub-2-page");
});

test("SitemapXmlActor decompresses gzipped sitemaps", async () => {
  const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/gzipped-page</loc></url>
</urlset>`;

  const gzippedBuffer = gzipSync(Buffer.from(xmlContent, "utf8"));

  const server = http.createServer((_req, res) => {
    res.writeHead(200, {
      "Content-Type": "application/x-gzip",
    });
    res.end(gzippedBuffer);
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const targetUrl = `http://127.0.0.1:${port}/sitemap.xml.gz`;

  const actor = new SitemapXmlActor();
  const result = await actor.run(
    {
      taskId: "test-sitemap-gz",
      actorType: "sitemap-xml",
      targetUrl,
    },
    {
      task: { taskId: "test-sitemap-gz", actorType: "sitemap-xml", targetUrl },
      startTime: Date.now(),
    }
  );

  server.close();

  assert.equal(result.status, "completed");
  assert.ok(result.data);
  assert.equal(result.data.totalUrls, 1);
  assert.equal(result.data.urls[0].loc, "https://example.com/gzipped-page");
});

test("SitemapXmlActor extracts links from RSS and Atom feeds", async () => {
  const rssContent = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Example RSS Feed</title>
    <item>
      <title>Article 1</title>
      <link>https://example.com/article-1</link>
      <pubDate>Mon, 01 Sep 2026 12:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/rss+xml" });
    res.end(rssContent);
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const targetUrl = `http://127.0.0.1:${port}/rss.xml`;

  const actor = new SitemapXmlActor();
  const result = await actor.run(
    {
      taskId: "test-rss",
      actorType: "sitemap-xml",
      targetUrl,
    },
    { task: { taskId: "test-rss", actorType: "sitemap-xml", targetUrl }, startTime: Date.now() }
  );

  server.close();

  assert.equal(result.status, "completed");
  assert.ok(result.data);
  assert.equal(result.data.totalUrls, 1);
  assert.equal(result.data.urls[0].loc, "https://example.com/article-1");
  assert.equal(result.data.urls[0].lastmod, "Mon, 01 Sep 2026 12:00:00 GMT");
});

test("SitemapXmlActor blocks SSRF private addresses", async () => {
  const actor = new SitemapXmlActor();
  const result = await actor.run(
    {
      taskId: "test-ssrf-block",
      actorType: "sitemap-xml",
      targetUrl: "http://169.254.169.254/latest/meta-data/sitemap.xml",
    },
    {
      task: {
        taskId: "test-ssrf-block",
        actorType: "sitemap-xml",
        targetUrl: "http://169.254.169.254/latest/meta-data/sitemap.xml",
      },
      startTime: Date.now(),
    }
  );

  assert.equal(result.status, "failed");
  assert.ok(result.errorMessage?.includes("SSRF"));
});
