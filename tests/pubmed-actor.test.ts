import assert from "node:assert/strict";
import * as http from "node:http";
import test from "node:test";
import { PubmedActor } from "../src/actors/corpus/pubmed-actor";
import { createServer } from "../src/server";

(process.env as Record<string, string | undefined>).NODE_ENV = "test";

const MOCK_PUBMED_XML = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE PubmedArticleSet PUBLIC "-//NLM//DTD PubMedArticle, 1st January 2024//EN" "https://dtd.nlm.nih.gov/ncbi/pubmed/out/pubmed_240101.dtd">
<PubmedArticleSet>
  <PubmedArticle>
    <MedlineCitation Status="MEDLINE" Owner="NLM">
      <PMID Version="1">31234567</PMID>
      <DateCompleted>
        <Year>2020</Year>
        <Month>05</Month>
        <Day>12</Day>
      </DateCompleted>
      <Article PubModel="Print-Electronic">
        <Journal>
          <JournalIssue CitedMedium="Internet">
            <Volume>580</Volume>
            <Issue>7802</Issue>
            <PubDate>
              <Year>2020</Year>
              <Month>Apr</Month>
            </PubDate>
          </JournalIssue>
          <Title>Nature</Title>
          <ISOAbbreviation>Nature</ISOAbbreviation>
        </Journal>
        <ArticleTitle>Structure and mechanism of the CRISPR-Cas9 complex</ArticleTitle>
        <Abstract>
          <AbstractText Label="BACKGROUND" NlmCategory="BACKGROUND">CRISPR-Cas9 provides adaptive immunity against invading genetic elements.</AbstractText>
          <AbstractText Label="RESULTS" NlmCategory="RESULTS">High-resolution structural analysis reveals dynamic conformational states during target cleavage.</AbstractText>
        </Abstract>
        <AuthorList CompleteYN="Y">
          <Author ValidYN="Y">
            <LastName>Doudna</LastName>
            <ForeName>Jennifer A</ForeName>
          </Author>
          <Author ValidYN="Y">
            <LastName>Charpentier</LastName>
            <ForeName>Emmanuelle</ForeName>
          </Author>
        </AuthorList>
        <PublicationTypeList>
          <PublicationType>Journal Article</PublicationType>
          <PublicationType>Review</PublicationType>
        </PublicationTypeList>
      </Article>
      <MeshHeadingList>
        <MeshHeading>
          <DescriptorName MajorTopicYN="Y">CRISPR-Cas Systems</DescriptorName>
        </MeshHeading>
        <MeshHeading>
          <DescriptorName MajorTopicYN="N">Endonucleases</DescriptorName>
        </MeshHeading>
      </MeshHeadingList>
    </MedlineCitation>
    <PubmedData>
      <ArticleIdList>
        <ArticleId IdType="pubmed">31234567</ArticleId>
        <ArticleId IdType="doi">10.1038/s41586-020-2123-5</ArticleId>
        <ArticleId IdType="pmc">PMC7123456</ArticleId>
      </ArticleIdList>
    </PubmedData>
  </PubmedArticle>
</PubmedArticleSet>`;

const MOCK_ESUMMARY_JSON = {
  result: {
    uids: ["23456789"],
    "23456789": {
      uid: "23456789",
      pubdate: "2021 Jan 15",
      source: "Science",
      authors: [
        { name: "Zhang F", authtype: "Author" },
        { name: "Church GM", authtype: "Author" },
      ],
      title: "Genome engineering using Cas9 systems",
      articleids: [
        { idtype: "pubmed", value: "23456789" },
        { idtype: "doi", value: "10.1126/science.1231143" },
        { idtype: "pmc", value: "PMC3712345" },
      ],
    },
  },
};

const MOCK_BIOC_JSON = {
  documents: [
    {
      id: "PMC7123456",
      passages: [
        {
          infons: { section_type: "TITLE" },
          text: "BioC Extraction of Structural Biology",
        },
        {
          infons: { section_type: "ABSTRACT" },
          text: "Detailed biochemical characterization of the endonuclease cleavage kinetics.",
        },
        {
          infons: { section_type: "METHODS" },
          text: "Crystallography was performed at 100K.",
        },
      ],
    },
  ],
};

const MOCK_ESEARCH_JSON = {
  esearchresult: {
    count: "42",
    retmax: "2",
    retstart: "0",
    idlist: ["31234567", "23456789"],
  },
};

test("PubmedActor parses PubMed XML with structured abstracts, MeSH, and Markdown", async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/xml; charset=utf-8" });
    res.end(MOCK_PUBMED_XML);
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const targetUrl = `http://127.0.0.1:${port}/efetch`;

  try {
    const actor = new PubmedActor();
    const result = await actor.run(
      {
        taskId: "test-pubmed-fetch",
        actorType: "pubmed",
        targetUrl,
        options: {
          pubmedOptions: {
            action: "fetch",
            pmids: ["31234567"],
          },
        },
      },
      {
        task: { taskId: "test-pubmed-fetch", actorType: "pubmed", targetUrl },
        startTime: Date.now(),
      }
    );

    assert.equal(result.status, "completed");
    assert.equal(result.statusCode, 200);
    assert.ok(result.data);
    assert.equal(result.data.totalCount, 1);
    assert.equal(result.data.articles.length, 1);

    const article = result.data.articles[0];
    assert.equal(article.pmid, "31234567");
    assert.equal(article.title, "Structure and mechanism of the CRISPR-Cas9 complex");
    assert.equal(article.journalTitle, "Nature");
    assert.equal(article.doi, "10.1038/s41586-020-2123-5");
    assert.equal(article.pmcid, "PMC7123456");
    assert.ok(article.abstractText?.includes("**BACKGROUND:** CRISPR-Cas9"));
    assert.ok(article.abstractText?.includes("**RESULTS:** High-resolution"));
    assert.deepEqual(article.authors, ["Jennifer A Doudna", "Emmanuelle Charpentier"]);
    assert.deepEqual(article.meshHeadings, ["CRISPR-Cas Systems*", "Endonucleases"]);
    assert.deepEqual(article.pubTypes, ["Journal Article", "Review"]);
    assert.ok(article.markdown?.includes("# Structure and mechanism of the CRISPR-Cas9 complex"));
    assert.ok(article.markdown?.includes("PMC7123456"));
  } finally {
    server.close();
  }
});

test("PubmedActor parses NCBI E-Summary JSON correctly", async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(MOCK_ESUMMARY_JSON));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const targetUrl = `http://127.0.0.1:${port}/esummary`;

  try {
    const actor = new PubmedActor();
    const result = await actor.run(
      {
        taskId: "test-pubmed-summary",
        actorType: "pubmed",
        targetUrl,
        options: {
          pubmedOptions: {
            action: "summary",
            pmids: ["23456789"],
          },
        },
      },
      {
        task: { taskId: "test-pubmed-summary", actorType: "pubmed", targetUrl },
        startTime: Date.now(),
      }
    );

    assert.equal(result.status, "completed");
    assert.ok(result.data);
    assert.equal(result.data.totalCount, 1);
    const article = result.data.articles[0];
    assert.equal(article.pmid, "23456789");
    assert.equal(article.title, "Genome engineering using Cas9 systems");
    assert.equal(article.journalTitle, "Science");
    assert.equal(article.doi, "10.1126/science.1231143");
    assert.equal(article.pmcid, "PMC3712345");
    assert.equal(article.pubYear, 2021);
    assert.deepEqual(article.authors, ["Zhang F", "Church GM"]);
  } finally {
    server.close();
  }
});

test("PubmedActor parses BioC JSON format correctly", async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(MOCK_BIOC_JSON));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const targetUrl = `http://127.0.0.1:${port}/bioc`;

  try {
    const actor = new PubmedActor();
    const result = await actor.run(
      {
        taskId: "test-pubmed-bioc",
        actorType: "pubmed",
        targetUrl,
        options: {
          pubmedOptions: {
            action: "bioc",
            pmcids: ["PMC7123456"],
          },
        },
      },
      {
        task: { taskId: "test-pubmed-bioc", actorType: "pubmed", targetUrl },
        startTime: Date.now(),
      }
    );

    assert.equal(result.status, "completed");
    assert.ok(result.data);
    assert.equal(result.data.totalCount, 1);
    const article = result.data.articles[0];
    assert.equal(article.pmcid, "PMC7123456");
    assert.equal(article.title, "BioC Extraction of Structural Biology");
    assert.ok(article.abstractText?.includes("Detailed biochemical characterization"));
    assert.ok(article.markdown?.includes("PMC7123456"));
  } finally {
    server.close();
  }
});

test("PubmedActor parses ESearch search results", async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(MOCK_ESEARCH_JSON));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const targetUrl = `http://127.0.0.1:${port}/esearch`;

  try {
    const actor = new PubmedActor();
    const result = await actor.run(
      {
        taskId: "test-pubmed-search",
        actorType: "pubmed",
        targetUrl,
        options: {
          pubmedOptions: {
            action: "search",
            query: "CRISPR",
          },
        },
      },
      {
        task: { taskId: "test-pubmed-search", actorType: "pubmed", targetUrl },
        startTime: Date.now(),
      }
    );

    assert.equal(result.status, "completed");
    assert.ok(result.data);
    assert.equal(result.data.totalCount, 42);
    assert.deepEqual(result.data.pmids, ["31234567", "23456789"]);
    assert.equal(result.data.articles.length, 2);
  } finally {
    server.close();
  }
});

test("PubmedActor blocks SSRF requests to cloud metadata", async () => {
  const actor = new PubmedActor();
  const result = await actor.run(
    {
      taskId: "test-pubmed-ssrf",
      actorType: "pubmed",
      targetUrl: "http://169.254.169.254/latest/meta-data",
    },
    {
      task: {
        taskId: "test-pubmed-ssrf",
        actorType: "pubmed",
        targetUrl: "http://169.254.169.254/latest/meta-data",
      },
      startTime: Date.now(),
    }
  );

  assert.equal(result.status, "failed");
  assert.equal(result.statusCode, 403);
  assert.ok(result.errorMessage?.includes("SSRF"));
});

test("POST /api/v1/pubmed executes correctly via server router", async () => {
  const mockServer = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/xml; charset=utf-8" });
    res.end(MOCK_PUBMED_XML);
  });

  await new Promise<void>((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const mockPort = (mockServer.address() as { port: number }).port;

  const app = createServer();
  await new Promise<void>((resolve) => app.listen(0, "127.0.0.1", resolve));
  const appPort = (app.address() as { port: number }).port;

  try {
    const res = await fetch(`http://127.0.0.1:${appPort}/api/v1/pubmed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetUrl: `http://127.0.0.1:${mockPort}/efetch`,
        action: "fetch",
        pmids: ["31234567"],
      }),
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      success: boolean;
      data: { articles: Array<{ title: string; pmid: string; meshHeadings?: string[] }> };
    };
    assert.equal(body.success, true);
    assert.equal(body.data.articles[0].pmid, "31234567");
    assert.equal(body.data.articles[0].title, "Structure and mechanism of the CRISPR-Cas9 complex");
    assert.ok(body.data.articles[0].meshHeadings?.includes("CRISPR-Cas Systems*"));
  } finally {
    app.close();
    mockServer.close();
  }
});
