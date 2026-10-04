import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { describe, it } from "node:test";
import { ActorRegistry } from "../src/actors/actor-registry";
import { RegistryDatabase } from "../src/api/registry-database";
import type { ActorTask, IActor } from "../src/api/types";
import { ProtokolMcpServer } from "../src/mcp/protokol-mcp-server";

describe("ProtokolMcpServer - Native Stdio Model Context Protocol Engine", () => {
  it("handles initialize handshake returning MCP protocolVersion and serverInfo", async () => {
    const server = new ProtokolMcpServer();
    const res = await server.processRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2024-11-05" },
    });

    assert.ok(res);
    assert.equal(res.id, 1);
    assert.equal(res.jsonrpc, "2.0");
    const result = res.result as {
      protocolVersion: string;
      capabilities: { tools: Record<string, unknown> };
      serverInfo: { name: string; version: string };
    };
    assert.equal(result.protocolVersion, "2024-11-05");
    assert.equal(result.serverInfo.name, "protokol-7-mcp");
    assert.ok(result.capabilities.tools);
  });

  it("returns null for notifications/initialized", async () => {
    const server = new ProtokolMcpServer();
    const res = await server.processRequest({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });
    assert.equal(res, null);
  });

  it("handles ping request", async () => {
    const server = new ProtokolMcpServer();
    const res = await server.processRequest({
      jsonrpc: "2.0",
      id: 42,
      method: "ping",
    });

    assert.ok(res);
    assert.equal(res.id, 42);
    assert.deepEqual(res.result, {});
  });

  it("returns all registered extraction tools in tools/list", async () => {
    const server = new ProtokolMcpServer();
    const res = await server.processRequest({
      jsonrpc: "2.0",
      id: "test-tools-list",
      method: "tools/list",
    });

    assert.ok(res);
    assert.equal(res.id, "test-tools-list");
    const result = res.result as {
      tools: Array<{ name: string; description: string; inputSchema: unknown }>;
    };
    assert.ok(Array.isArray(result.tools));
    assert.equal(result.tools.length, 85);

    const toolNames = result.tools.map((t) => t.name);
    assert.ok(toolNames.includes("query_aperta"));
    assert.ok(toolNames.includes("query_binance_vision"));
    assert.ok(toolNames.includes("query_doaj"));
    assert.ok(toolNames.includes("query_biorxiv"));
    assert.ok(toolNames.includes("query_pubmed"));
    assert.ok(toolNames.includes("query_instagram"));
    assert.ok(toolNames.includes("wikipedia_query"));
    assert.ok(toolNames.includes("query_youtube_transcripts"));
    assert.ok(toolNames.includes("query_wikisource"));
    assert.ok(toolNames.includes("query_wiktionary"));
    assert.ok(toolNames.includes("query_wikiquote"));
    assert.ok(toolNames.includes("query_wikibooks"));
    assert.ok(toolNames.includes("query_wikiversity"));
    assert.ok(toolNames.includes("query_wikivoyage"));
    assert.ok(toolNames.includes("query_wikinews"));
    assert.ok(toolNames.includes("query_wikispecies"));
    assert.ok(toolNames.includes("query_wikidata"));
    assert.ok(toolNames.includes("query_stanford_phil"));
    assert.ok(toolNames.includes("query_internet_phil"));
    assert.ok(toolNames.includes("query_metamath"));
    assert.ok(toolNames.includes("query_philpapers"));
    assert.ok(toolNames.includes("query_devdocs"));
    assert.ok(toolNames.includes("query_rosetta_code"));
    assert.ok(toolNames.includes("query_papers_with_code"));
    assert.ok(toolNames.includes("query_libretexts"));
    assert.ok(toolNames.includes("query_open_textbook"));
    assert.ok(toolNames.includes("query_semantic_scholar"));
    assert.ok(toolNames.includes("query_anayasa_mahkemesi"));
    assert.ok(toolNames.includes("query_danistay"));
    assert.ok(toolNames.includes("query_google_patents"));
    assert.ok(toolNames.includes("query_perseus_dl"));
    assert.ok(toolNames.includes("query_sacred_texts"));
    assert.ok(toolNames.includes("query_resmi_gazete"));
    assert.ok(toolNames.includes("query_yargitay"));
    assert.ok(toolNames.includes("query_kap"));
    assert.ok(toolNames.includes("query_github"));
    assert.ok(toolNames.includes("query_openreview"));
    assert.ok(toolNames.includes("query_hacker_news"));
    assert.ok(toolNames.includes("query_huggingface_datasets"));
    assert.ok(toolNames.includes("query_math_reasoning"));
    assert.ok(toolNames.includes("query_code_eval"));
    assert.ok(toolNames.includes("query_proofwiki"));
    assert.ok(toolNames.includes("query_lean_mathlib"));
    assert.ok(toolNames.includes("query_lesswrong"));
    assert.ok(toolNames.includes("run_pipeline"));
    assert.ok(toolNames.includes("list_pipelines"));
    assert.ok(toolNames.includes("publish_dataset"));
    assert.ok(toolNames.includes("list_datasets"));
    assert.ok(toolNames.includes("get_dataset_manifest"));
    assert.ok(toolNames.includes("schedule_job"));
    assert.ok(toolNames.includes("list_jobs"));
    assert.ok(toolNames.includes("cancel_job"));
    assert.ok(toolNames.includes("export_cold_vault"));
    assert.ok(toolNames.includes("verify_cold_vault"));
    assert.ok(toolNames.includes("scrape_static_html"));
    assert.ok(toolNames.includes("scrape_dynamic_browser"));
    assert.ok(toolNames.includes("distill_web_to_markdown"));
    assert.ok(toolNames.includes("arxiv_query"));
    assert.ok(toolNames.includes("extract_pdf_text"));
    assert.ok(toolNames.includes("extract_serp_results"));
    assert.ok(toolNames.includes("harvest_sitemap_urls"));
    assert.ok(toolNames.includes("crawl_website_graph"));
    assert.ok(toolNames.includes("extract_rest_api"));
    assert.ok(toolNames.includes("saglik_ekutuphane"));
    assert.ok(toolNames.includes("wikimedia_query"));
    assert.ok(toolNames.includes("openalex_query"));
    assert.ok(toolNames.includes("stack_exchange_query"));
    assert.ok(toolNames.includes("gutenberg_query"));
    assert.ok(toolNames.includes("europe_pmc_query"));
    assert.ok(toolNames.includes("ietf_rfc_query"));
    assert.ok(toolNames.includes("ktb_ekitap"));
    assert.ok(toolNames.includes("extract_document"));
    assert.ok(toolNames.includes("extract_archive"));
    assert.ok(toolNames.includes("extract_epub"));
    assert.ok(toolNames.includes("query_dergipark"));
    assert.ok(toolNames.includes("query_internet_archive"));
    assert.ok(toolNames.includes("query_clinical_trials"));
    assert.ok(toolNames.includes("query_open_fda"));
    assert.ok(toolNames.includes("query_sec_edgar"));
    assert.ok(toolNames.includes("query_court_listener"));
    assert.ok(toolNames.includes("query_software_heritage"));
    assert.ok(toolNames.includes("query_eur_lex"));
    assert.ok(toolNames.includes("query_openstax"));
    assert.ok(toolNames.includes("query_mit_ocw"));
  });

  it("returns isError for unknown tool invocation in tools/call", async () => {
    const server = new ProtokolMcpServer();
    const res = await server.processRequest({
      jsonrpc: "2.0",
      id: "err-call",
      method: "tools/call",
      params: {
        name: "non_existent_tool",
        arguments: {},
      },
    });

    assert.ok(res);
    const result = res.result as {
      content: Array<{ type: string; text: string }>;
      isError: boolean;
    };
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /Unknown tool/);
  });

  it("executes registered actor through tools/call successfully", async () => {
    const mockRegistry = new ActorRegistry();
    const mockActor: IActor<{ message: string }> = {
      actorType: "cheerio-scraper",
      description: "Mock Cheerio Actor",
      run: async (task) => ({
        taskId: task.taskId,
        actorType: task.actorType,
        status: "completed",
        data: { message: "Mock scraping result" },
        executionDurationMs: 1,
      }),
    };
    mockRegistry.register(mockActor as unknown as IActor<unknown>);

    const server = new ProtokolMcpServer(mockRegistry);
    const res = await server.processRequest({
      jsonrpc: "2.0",
      id: 99,
      method: "tools/call",
      params: {
        name: "scrape_static_html",
        arguments: { targetUrl: "https://example.com" },
      },
    });

    assert.ok(res);
    assert.equal(res.id, 99);
    const result = res.result as {
      content: Array<{ type: string; text: string }>;
      isError: boolean;
    };
    assert.equal(result.isError, false);
    assert.match(result.content[0].text, /Mock scraping result/);
  });

  it("handles actor execution failure in tools/call gracefully", async () => {
    const mockRegistry = new ActorRegistry();
    const failingActor: IActor<unknown> = {
      actorType: "cheerio-scraper",
      description: "Failing Actor",
      run: async (task) => ({
        taskId: task.taskId,
        actorType: task.actorType,
        status: "failed",
        errorMessage: "Target host refused connection",
        executionDurationMs: 1,
      }),
    };
    mockRegistry.register(failingActor);

    const server = new ProtokolMcpServer(mockRegistry);
    const res = await server.processRequest({
      jsonrpc: "2.0",
      id: "fail-test",
      method: "tools/call",
      params: {
        name: "scrape_static_html",
        arguments: { targetUrl: "https://invalid-host.local" },
      },
    });

    assert.ok(res);
    const result = res.result as {
      content: Array<{ type: string; text: string }>;
      isError: boolean;
    };
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /Target host refused connection/);
  });

  it("returns -32601 error for unknown methods", async () => {
    const server = new ProtokolMcpServer();
    const res = await server.processRequest({
      jsonrpc: "2.0",
      id: "unknown-method-test",
      method: "some/invalid/method",
    });

    assert.ok(res);
    assert.ok(res.error);
    assert.equal(res.error.code, -32601);
  });

  it("processes newline-delimited stream messages via start()", async () => {
    const server = new ProtokolMcpServer();
    const input = new PassThrough();
    const output = new PassThrough();

    server.start(input, output);

    const responsePromise = new Promise<string>((resolve) => {
      output.once("data", (chunk: Buffer) => {
        resolve(chunk.toString("utf8"));
      });
    });

    input.write(`${JSON.stringify({ jsonrpc: "2.0", id: "stream-1", method: "ping" })}\n`);

    const raw = await responsePromise;
    const parsed = JSON.parse(raw.trim());
    assert.equal(parsed.id, "stream-1");
    assert.deepEqual(parsed.result, {});

    server.close();
  });

  it("forwards specialized actor options to task.options in tools/call", async () => {
    let capturedTask: unknown;
    const mockRegistry = new ActorRegistry();
    const mockGutenberg: IActor<unknown> = {
      actorType: "gutenberg",
      description: "Mock Gutenberg Actor",
      run: async (task) => {
        capturedTask = task;
        return {
          taskId: task.taskId,
          actorType: task.actorType,
          status: "completed",
          data: { success: true },
          executionDurationMs: 1,
        };
      },
    };
    mockRegistry.register(mockGutenberg);

    const server = new ProtokolMcpServer(mockRegistry);
    await server.processRequest({
      jsonrpc: "2.0",
      id: "options-test",
      method: "tools/call",
      params: {
        name: "gutenberg_query",
        arguments: {
          searchQuery: "Nietzsche",
          topic: "philosophy",
          downloadText: true,
        },
      },
    });

    assert.ok(capturedTask);
    const typedTask = capturedTask as {
      options?: {
        gutenbergOptions?: {
          searchQuery?: string;
          topic?: string;
          downloadText?: boolean;
        };
      };
    };
    assert.ok(typedTask.options?.gutenbergOptions);
    assert.equal(typedTask.options.gutenbergOptions.searchQuery, "Nietzsche");
    assert.equal(typedTask.options.gutenbergOptions.topic, "philosophy");
    assert.equal(typedTask.options.gutenbergOptions.downloadText, true);
  });

  it("correctly maps query_github parameters to githubOptions", async () => {
    let capturedTask: unknown;
    const mockRegistry = new ActorRegistry();
    const mockGithub: IActor = {
      actorType: "github",
      description: "Mock GitHub actor",
      run: async (task) => {
        capturedTask = task;
        return {
          taskId: task.taskId,
          actorType: task.actorType,
          status: "completed",
          data: { success: true },
          executionDurationMs: 1,
        };
      },
    };
    mockRegistry.register(mockGithub);

    const server = new ProtokolMcpServer(mockRegistry);
    await server.processRequest({
      jsonrpc: "2.0",
      id: "github-test",
      method: "tools/call",
      params: {
        name: "query_github",
        arguments: {
          owner: "torvalds",
          repo: "linux",
          action: "readme",
          limit: 10,
        },
      },
    });

    assert.ok(capturedTask);
    const typedTask = capturedTask as {
      options?: {
        githubOptions?: {
          owner?: string;
          repo?: string;
          action?: string;
          limit?: number;
        };
      };
    };
    assert.ok(typedTask.options?.githubOptions);
    assert.equal(typedTask.options.githubOptions.owner, "torvalds");
    assert.equal(typedTask.options.githubOptions.repo, "linux");
    assert.equal(typedTask.options.githubOptions.action, "readme");
    assert.equal(typedTask.options.githubOptions.limit, 10);
  });

  it("correctly maps query_openreview parameters to openreviewOptions", async () => {
    let capturedTask: unknown;
    const mockRegistry = new ActorRegistry();
    const mockOpenReview: IActor = {
      actorType: "openreview",
      description: "Mock OpenReview actor",
      run: async (task) => {
        capturedTask = task;
        return {
          taskId: task.taskId,
          actorType: task.actorType,
          status: "completed",
          data: { success: true },
          executionDurationMs: 1,
        };
      },
    };
    mockRegistry.register(mockOpenReview);

    const server = new ProtokolMcpServer(mockRegistry);
    await server.processRequest({
      jsonrpc: "2.0",
      id: "openreview-test",
      method: "tools/call",
      params: {
        name: "query_openreview",
        arguments: {
          action: "submissions",
          venue: "ICLR.cc/2024/Conference",
          limit: 15,
        },
      },
    });

    assert.ok(capturedTask);
    const typedTask = capturedTask as {
      options?: {
        openreviewOptions?: {
          action?: string;
          venue?: string;
          limit?: number;
        };
      };
    };
    assert.ok(typedTask.options?.openreviewOptions);
    assert.equal(typedTask.options.openreviewOptions.action, "submissions");
    assert.equal(typedTask.options.openreviewOptions.venue, "ICLR.cc/2024/Conference");
    assert.equal(typedTask.options.openreviewOptions.limit, 15);
  });

  it("correctly maps query_hacker_news parameters to hackerNewsOptions", async () => {
    let capturedTask: unknown;
    const mockRegistry = new ActorRegistry();
    const mockHN: IActor = {
      actorType: "hacker-news",
      description: "Mock Hacker News actor",
      run: async (task) => {
        capturedTask = task;
        return {
          taskId: task.taskId,
          actorType: task.actorType,
          status: "completed",
          data: { success: true },
          executionDurationMs: 1,
        };
      },
    };
    mockRegistry.register(mockHN);

    const server = new ProtokolMcpServer(mockRegistry);
    await server.processRequest({
      jsonrpc: "2.0",
      id: "hn-test",
      method: "tools/call",
      params: {
        name: "query_hacker_news",
        arguments: {
          action: "story",
          storyId: 38870197,
          maxComments: 30,
        },
      },
    });

    assert.ok(capturedTask);
    const typedTask = capturedTask as {
      options?: {
        hackerNewsOptions?: {
          action?: string;
          storyId?: number;
          maxComments?: number;
        };
      };
    };
    assert.ok(typedTask.options?.hackerNewsOptions);
    assert.equal(typedTask.options.hackerNewsOptions.action, "story");
    assert.equal(typedTask.options.hackerNewsOptions.storyId, 38870197);
    assert.equal(typedTask.options.hackerNewsOptions.maxComments, 30);
  });

  it("correctly maps query_huggingface_datasets parameters to huggingfaceDatasetsOptions", async () => {
    let capturedTask: unknown;
    const mockRegistry = new ActorRegistry();
    const mockHF: IActor = {
      actorType: "huggingface-datasets",
      description: "Mock HF Datasets actor",
      run: async (task) => {
        capturedTask = task;
        return {
          taskId: task.taskId,
          actorType: task.actorType,
          status: "completed",
          data: { success: true },
          executionDurationMs: 1,
        };
      },
    };
    mockRegistry.register(mockHF);

    const server = new ProtokolMcpServer(mockRegistry);
    await server.processRequest({
      jsonrpc: "2.0",
      id: "hf-test",
      method: "tools/call",
      params: {
        name: "query_huggingface_datasets",
        arguments: {
          dataset: "openai/gsm8k",
          config: "main",
          split: "train",
          action: "rows",
          limit: 10,
        },
      },
    });

    assert.ok(capturedTask);
    const typedTask = capturedTask as {
      options?: {
        huggingfaceDatasetsOptions?: {
          dataset?: string;
          config?: string;
          split?: string;
          action?: string;
          limit?: number;
        };
      };
    };
    assert.ok(typedTask.options?.huggingfaceDatasetsOptions);
    assert.equal(typedTask.options.huggingfaceDatasetsOptions.dataset, "openai/gsm8k");
    assert.equal(typedTask.options.huggingfaceDatasetsOptions.config, "main");
    assert.equal(typedTask.options.huggingfaceDatasetsOptions.split, "train");
    assert.equal(typedTask.options.huggingfaceDatasetsOptions.action, "rows");
    assert.equal(typedTask.options.huggingfaceDatasetsOptions.limit, 10);
  });

  it("correctly maps query_math_reasoning parameters to mathReasoningOptions", async () => {
    let capturedTask: unknown;
    const mockRegistry = new ActorRegistry();
    const mockMath: IActor = {
      actorType: "math-reasoning",
      description: "Mock Math Reasoning actor",
      run: async (task) => {
        capturedTask = task;
        return {
          taskId: task.taskId,
          actorType: "math-reasoning",
          status: "completed",
          data: {
            benchmark: "gsm8k",
            split: "train",
            totalProblems: 0,
            offset: 0,
            limit: 10,
            problems: [],
            queryUrl: "http://mock",
          },
          executionDurationMs: 0,
        };
      },
    };
    mockRegistry.register(mockMath);

    const server = new ProtokolMcpServer(mockRegistry);
    await server.processRequest({
      jsonrpc: "2.0",
      id: "math-test",
      method: "tools/call",
      params: {
        name: "query_math_reasoning",
        arguments: {
          benchmark: "math",
          subject: "algebra",
          split: "train",
          limit: 10,
        },
      },
    });

    assert.ok(capturedTask);
    const typedTask = capturedTask as {
      options?: {
        mathReasoningOptions?: {
          benchmark?: string;
          subject?: string;
          split?: string;
          limit?: number;
        };
      };
    };
    assert.ok(typedTask.options?.mathReasoningOptions);
    assert.equal(typedTask.options.mathReasoningOptions.benchmark, "math");
    assert.equal(typedTask.options.mathReasoningOptions.subject, "algebra");
    assert.equal(typedTask.options.mathReasoningOptions.split, "train");
    assert.equal(typedTask.options.mathReasoningOptions.limit, 10);
  });

  it("correctly maps query_code_eval parameters to codeEvalOptions", async () => {
    let capturedTask: unknown;
    const mockRegistry = new ActorRegistry();
    const mockCodeEval: IActor = {
      actorType: "code-eval",
      description: "Mock Code Eval actor",
      run: async (task) => {
        capturedTask = task;
        return {
          taskId: task.taskId,
          actorType: "code-eval",
          status: "completed",
          data: {
            benchmark: "humaneval",
            split: "test",
            totalTasks: 0,
            offset: 0,
            limit: 10,
            tasks: [],
            queryUrl: "http://mock",
          },
          executionDurationMs: 0,
        };
      },
    };
    mockRegistry.register(mockCodeEval);

    const server = new ProtokolMcpServer(mockRegistry);
    await server.processRequest({
      jsonrpc: "2.0",
      id: "code-eval-test",
      method: "tools/call",
      params: {
        name: "query_code_eval",
        arguments: {
          benchmark: "humaneval",
          split: "test",
          limit: 10,
        },
      },
    });

    assert.ok(capturedTask);
    const typedTask = capturedTask as {
      options?: {
        codeEvalOptions?: {
          benchmark?: string;
          split?: string;
          limit?: number;
        };
      };
    };
    assert.ok(typedTask.options?.codeEvalOptions);
    assert.equal(typedTask.options.codeEvalOptions.benchmark, "humaneval");
    assert.equal(typedTask.options.codeEvalOptions.split, "test");
    assert.equal(typedTask.options.codeEvalOptions.limit, 10);
  });

  it("correctly maps query_proofwiki parameters to proofWikiOptions", async () => {
    let capturedTask: unknown;
    const mockRegistry = new ActorRegistry();
    const mockProofWiki: IActor = {
      actorType: "proofwiki",
      description: "Mock ProofWiki actor",
      run: async (task) => {
        capturedTask = task;
        return {
          taskId: task.taskId,
          actorType: "proofwiki",
          status: "completed",
          data: {
            action: "theorem",
            totalResults: 1,
            items: [],
            queryUrl: "https://proofwiki.org",
          },
          executionDurationMs: 10,
        };
      },
    };
    mockRegistry.register(mockProofWiki);

    const server = new ProtokolMcpServer(mockRegistry);
    await server.processRequest({
      jsonrpc: "2.0",
      id: "proofwiki-test",
      method: "tools/call",
      params: {
        name: "query_proofwiki",
        arguments: {
          action: "theorem",
          title: "Pythagorean Theorem",
          limit: 5,
        },
      },
    });

    assert.ok(capturedTask);
    const typedTask = capturedTask as {
      options?: {
        proofWikiOptions?: {
          action?: string;
          title?: string;
          limit?: number;
        };
      };
    };
    assert.ok(typedTask.options?.proofWikiOptions);
    assert.equal(typedTask.options.proofWikiOptions.action, "theorem");
    assert.equal(typedTask.options.proofWikiOptions.title, "Pythagorean Theorem");
    assert.equal(typedTask.options.proofWikiOptions.limit, 5);
  });

  it("correctly maps query_lean_mathlib parameters to leanMathlibOptions", async () => {
    let capturedTask: unknown;
    const mockRegistry = new ActorRegistry();
    const mockLeanMathlib: IActor = {
      actorType: "lean-mathlib",
      description: "Mock Lean Mathlib actor",
      run: async (task) => {
        capturedTask = task;
        return {
          taskId: task.taskId,
          actorType: "lean-mathlib",
          status: "completed",
          data: {
            action: "file",
            repo: "leanprover-community/mathlib4",
            totalDeclarations: 1,
            items: [],
            queryUrl: "https://raw.githubusercontent.com",
          },
          executionDurationMs: 10,
        };
      },
    };
    mockRegistry.register(mockLeanMathlib);

    const server = new ProtokolMcpServer(mockRegistry);
    await server.processRequest({
      jsonrpc: "2.0",
      id: "lean-test",
      method: "tools/call",
      params: {
        name: "query_lean_mathlib",
        arguments: {
          action: "file",
          path: "Mathlib/Data/Nat/Basic.lean",
          limit: 10,
        },
      },
    });

    assert.ok(capturedTask);
    const typedTask = capturedTask as {
      options?: {
        leanMathlibOptions?: {
          action?: string;
          path?: string;
          limit?: number;
        };
      };
    };
    assert.ok(typedTask.options?.leanMathlibOptions);
    assert.equal(typedTask.options.leanMathlibOptions.action, "file");
    assert.equal(typedTask.options.leanMathlibOptions.path, "Mathlib/Data/Nat/Basic.lean");
    assert.equal(typedTask.options.leanMathlibOptions.limit, 10);
  });

  it("correctly maps query_lesswrong parameters to lessWrongOptions", async () => {
    let capturedTask: unknown;
    const mockRegistry = new ActorRegistry();
    const mockLessWrong: IActor = {
      actorType: "lesswrong",
      description: "Mock LessWrong actor",
      run: async (task) => {
        capturedTask = task;
        return {
          taskId: task.taskId,
          actorType: "lesswrong",
          status: "completed",
          data: {
            action: "posts",
            view: "curated",
            totalPosts: 1,
            posts: [],
            queryUrl: "https://www.lesswrong.com/graphql",
          },
          executionDurationMs: 10,
        };
      },
    };
    mockRegistry.register(mockLessWrong);

    const server = new ProtokolMcpServer(mockRegistry);
    await server.processRequest({
      jsonrpc: "2.0",
      id: "lesswrong-test",
      method: "tools/call",
      params: {
        name: "query_lesswrong",
        arguments: {
          action: "posts",
          view: "curated",
          limit: 10,
        },
      },
    });

    assert.ok(capturedTask);
    const typedTask = capturedTask as {
      options?: {
        lessWrongOptions?: {
          action?: string;
          view?: string;
          limit?: number;
        };
      };
    };
    assert.ok(typedTask.options?.lessWrongOptions);
    assert.equal(typedTask.options.lessWrongOptions.action, "posts");
    assert.equal(typedTask.options.lessWrongOptions.view, "curated");
    assert.equal(typedTask.options.lessWrongOptions.limit, 10);
  });

  it("correctly maps query_youtube_transcripts parameters to youtubeTranscriptsOptions", async () => {
    let capturedTask: unknown;
    const mockRegistry = new ActorRegistry();
    const mockYoutube: IActor = {
      actorType: "youtube-transcripts",
      description: "Mock YouTube",
      run: async (task) => {
        capturedTask = task;
        return {
          taskId: task.taskId,
          actorType: "youtube-transcripts",
          status: "completed",
          statusCode: 200,
          data: {
            totalProcessed: 1,
            successfulCount: 1,
            failedCount: 0,
            records: [],
          },
          executionDurationMs: 10,
        };
      },
    };
    mockRegistry.register(mockYoutube);

    const server = new ProtokolMcpServer(mockRegistry);
    await server.processRequest({
      jsonrpc: "2.0",
      id: "youtube-test",
      method: "tools/call",
      params: {
        name: "query_youtube_transcripts",
        arguments: {
          urls: ["https://www.youtube.com/watch?v=aqz-KE-bpKQ"],
          outputFormat: "singleStringText",
          cleanText: true,
          channelNameBoolean: true,
        },
      },
    });

    assert.ok(capturedTask);
    const typedTask = capturedTask as {
      options?: {
        youtubeTranscriptsOptions?: {
          urls?: string[];
          outputFormat?: string;
          cleanText?: boolean;
          channelNameBoolean?: boolean;
        };
      };
    };
    assert.ok(typedTask.options?.youtubeTranscriptsOptions);
    assert.deepEqual(typedTask.options.youtubeTranscriptsOptions.urls, [
      "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
    ]);
    assert.equal(typedTask.options.youtubeTranscriptsOptions.outputFormat, "singleStringText");
    assert.equal(typedTask.options.youtubeTranscriptsOptions.cleanText, true);
    assert.equal(typedTask.options.youtubeTranscriptsOptions.channelNameBoolean, true);
  });

  it("correctly maps query_wikisource parameters to wikisourceOptions", async () => {
    let capturedTask: unknown;
    const mockRegistry = new ActorRegistry();
    const mockWikisource: IActor = {
      actorType: "wikisource",
      description: "Mock Wikisource",
      run: async (task) => {
        capturedTask = task;
        return {
          taskId: task.taskId,
          actorType: "wikisource",
          status: "completed",
          statusCode: 200,
          data: {
            lang: "la",
            action: "summary",
            items: [],
            queryUrl: "https://la.wikisource.org/api/rest_v1/page/summary/De_bello_Gallico",
          },
          executionDurationMs: 10,
        };
      },
    };
    mockRegistry.register(mockWikisource);

    const server = new ProtokolMcpServer(mockRegistry);
    await server.processRequest({
      jsonrpc: "2.0",
      id: "wikisource-test",
      method: "tools/call",
      params: {
        name: "query_wikisource",
        arguments: {
          title: "De bello Gallico",
          lang: "la",
          action: "summary",
        },
      },
    });

    assert.ok(capturedTask);
    const typedTask = capturedTask as {
      options?: {
        wikisourceOptions?: {
          title?: string;
          lang?: string;
          action?: string;
        };
      };
    };
    assert.ok(typedTask.options?.wikisourceOptions);
    assert.equal(typedTask.options.wikisourceOptions.title, "De bello Gallico");
    assert.equal(typedTask.options.wikisourceOptions.lang, "la");
    assert.equal(typedTask.options.wikisourceOptions.action, "summary");
  });

  it("correctly maps query_wiktionary parameters to wiktionaryOptions", async () => {
    let capturedTask: unknown;
    const mockRegistry = new ActorRegistry();
    const mockWiktionary: IActor = {
      actorType: "wiktionary",
      description: "Mock Wiktionary",
      run: async (task) => {
        capturedTask = task;
        return {
          taskId: task.taskId,
          actorType: "wiktionary",
          status: "completed",
          data: {
            lang: "en",
            action: "definition",
            items: [],
            queryUrl: "http://mock",
          },
          executionDurationMs: 10,
        };
      },
    };
    mockRegistry.register(mockWiktionary);

    const server = new ProtokolMcpServer(mockRegistry);
    await server.processRequest({
      jsonrpc: "2.0",
      id: "wiktionary-test",
      method: "tools/call",
      params: {
        name: "query_wiktionary",
        arguments: {
          word: "algorithm",
          lang: "en",
          action: "definition",
        },
      },
    });

    assert.ok(capturedTask);
    const typedTask = capturedTask as {
      options?: {
        wiktionaryOptions?: {
          word?: string;
          lang?: string;
          action?: string;
        };
      };
    };
    assert.ok(typedTask.options?.wiktionaryOptions);
    assert.equal(typedTask.options.wiktionaryOptions.word, "algorithm");
    assert.equal(typedTask.options.wiktionaryOptions.lang, "en");
    assert.equal(typedTask.options.wiktionaryOptions.action, "definition");
  });

  it("correctly maps query_wikiquote parameters to wikiquoteOptions", async () => {
    let capturedTask: ActorTask | null = null;
    const mockRegistry = new ActorRegistry();
    const mockWikiquote: IActor = {
      actorType: "wikiquote",
      description: "mock wikiquote",
      run: async (task: ActorTask) => {
        capturedTask = task;
        return {
          taskId: task.taskId,
          actorType: "wikiquote",
          status: "completed",
          data: {
            lang: "en",
            action: "summary",
            items: [],
            queryUrl: "http://mock",
          },
          executionDurationMs: 10,
        };
      },
    };
    mockRegistry.register(mockWikiquote);

    const server = new ProtokolMcpServer(mockRegistry);
    await server.processRequest({
      jsonrpc: "2.0",
      id: "wikiquote-test",
      method: "tools/call",
      params: {
        name: "query_wikiquote",
        arguments: {
          title: "Albert Einstein",
          lang: "en",
          action: "summary",
        },
      },
    });

    assert.ok(capturedTask);
    const typedTask = capturedTask as {
      options?: {
        wikiquoteOptions?: {
          title?: string;
          lang?: string;
          action?: string;
        };
      };
    };
    assert.ok(typedTask.options?.wikiquoteOptions);
    assert.equal(typedTask.options.wikiquoteOptions.title, "Albert Einstein");
    assert.equal(typedTask.options.wikiquoteOptions.lang, "en");
  });

  it("correctly maps query_wikidata parameters to wikidataOptions", async () => {
    let capturedTask: ActorTask | null = null;
    const mockRegistry = new ActorRegistry();
    const mockWikidata: IActor = {
      actorType: "wikidata",
      description: "mock wikidata",
      run: async (task: ActorTask) => {
        capturedTask = task;
        return {
          taskId: task.taskId,
          actorType: "wikidata",
          status: "completed",
          data: {
            action: "entity",
            queryUrl: "http://mock",
          },
          executionDurationMs: 10,
        };
      },
    };
    mockRegistry.register(mockWikidata);

    const server = new ProtokolMcpServer(mockRegistry);
    await server.processRequest({
      jsonrpc: "2.0",
      id: "wikidata-test",
      method: "tools/call",
      params: {
        name: "query_wikidata",
        arguments: {
          entityId: "Q42",
          action: "entity",
          lang: "en",
        },
      },
    });

    assert.ok(capturedTask);
    const typedTask = capturedTask as {
      options?: {
        wikidataOptions?: {
          entityId?: string;
          action?: string;
          lang?: string;
        };
      };
    };
    assert.ok(typedTask.options?.wikidataOptions);
    assert.equal(typedTask.options.wikidataOptions.entityId, "Q42");
    assert.equal(typedTask.options.wikidataOptions.action, "entity");
  });

  it("correctly maps query_stanford_phil parameters to stanfordPhilOptions", async () => {
    let capturedTask: ActorTask | null = null;
    const mockRegistry = new ActorRegistry();
    const mockSep: IActor = {
      actorType: "stanford-phil",
      description: "mock stanford-phil",
      run: async (task: ActorTask) => {
        capturedTask = task;
        return {
          taskId: task.taskId,
          actorType: "stanford-phil",
          status: "completed",
          data: {
            action: "entry",
            queryUrl: "http://mock",
          },
          executionDurationMs: 10,
        };
      },
    };
    mockRegistry.register(mockSep);

    const server = new ProtokolMcpServer(mockRegistry);
    await server.processRequest({
      jsonrpc: "2.0",
      id: "sep-test",
      method: "tools/call",
      params: {
        name: "query_stanford_phil",
        arguments: {
          slug: "goedel-incompleteness",
          action: "entry",
        },
      },
    });

    assert.ok(capturedTask);
    const typedTask = capturedTask as {
      options?: {
        stanfordPhilOptions?: {
          slug?: string;
          action?: string;
        };
      };
    };
    assert.ok(typedTask.options?.stanfordPhilOptions);
    assert.equal(typedTask.options.stanfordPhilOptions.slug, "goedel-incompleteness");
    assert.equal(typedTask.options.stanfordPhilOptions.action, "entry");
  });

  it("correctly maps query_metamath parameters to metamathOptions", async () => {
    let capturedTask: ActorTask | null = null;
    const mockRegistry = new ActorRegistry();
    const mockMm: IActor = {
      actorType: "metamath",
      description: "mock metamath",
      run: async (task: ActorTask) => {
        capturedTask = task;
        return {
          taskId: task.taskId,
          actorType: "metamath",
          status: "completed",
          data: {
            action: "theorem",
            queryUrl: "http://mock",
          },
          executionDurationMs: 10,
        };
      },
    };
    mockRegistry.register(mockMm);

    const server = new ProtokolMcpServer(mockRegistry);
    await server.processRequest({
      jsonrpc: "2.0",
      id: "mm-test",
      method: "tools/call",
      params: {
        name: "query_metamath",
        arguments: {
          theorem: "mpc2",
          database: "set.mm",
          action: "theorem",
        },
      },
    });

    assert.ok(capturedTask);
    const typedTask = capturedTask as {
      options?: {
        metamathOptions?: {
          theorem?: string;
          database?: string;
          action?: string;
        };
      };
    };
    assert.ok(typedTask.options?.metamathOptions);
    assert.equal(typedTask.options.metamathOptions.theorem, "mpc2");
    assert.equal(typedTask.options.metamathOptions.database, "set.mm");
  });

  it("handles query_libretexts tool call and routes options correctly", async () => {
    let capturedTask: unknown;
    const customRegistry = new ActorRegistry();
    customRegistry.register({
      actorType: "libretexts",
      description: "Mock LibreTexts",
      run: async (task) => {
        capturedTask = task;
        return {
          taskId: task.taskId,
          actorType: "libretexts",
          status: "completed",
          executionDurationMs: 5,
          data: {
            action: "search",
            library: "phys",
            queryUrl: "http://example.com",
            totalResults: 1,
            pages: [],
          },
        };
      },
    });

    const server = new ProtokolMcpServer(customRegistry);
    await server.processRequest({
      jsonrpc: "2.0",
      id: "call-libretexts",
      method: "tools/call",
      params: {
        name: "query_libretexts",
        arguments: {
          action: "search",
          library: "phys",
          query: "quantum",
        },
      },
    });

    assert.ok(capturedTask);
    const typedTask = capturedTask as {
      options?: {
        libretextsOptions?: {
          action?: string;
          library?: string;
          query?: string;
        };
      };
    };
    assert.ok(typedTask.options?.libretextsOptions);
    assert.equal(typedTask.options.libretextsOptions.action, "search");
    assert.equal(typedTask.options.libretextsOptions.library, "phys");
    assert.equal(typedTask.options.libretextsOptions.query, "quantum");
  });

  it("handles query_open_textbook tool call and routes options correctly", async () => {
    let capturedTask: unknown;
    const customRegistry = new ActorRegistry();
    customRegistry.register({
      actorType: "open-textbook",
      description: "Mock Open Textbook",
      run: async (task) => {
        capturedTask = task;
        return {
          taskId: task.taskId,
          actorType: "open-textbook",
          status: "completed",
          executionDurationMs: 5,
          data: {
            action: "book",
            queryUrl: "http://example.com",
            totalResults: 1,
          },
        };
      },
    });

    const server = new ProtokolMcpServer(customRegistry);
    await server.processRequest({
      jsonrpc: "2.0",
      id: "call-open-textbook",
      method: "tools/call",
      params: {
        name: "query_open_textbook",
        arguments: {
          action: "book",
          bookId: "calculus-vol-1",
        },
      },
    });

    assert.ok(capturedTask);
    const typedTask = capturedTask as {
      options?: {
        openTextbookOptions?: {
          action?: string;
          bookId?: string;
        };
      };
    };
    assert.ok(typedTask.options?.openTextbookOptions);
    assert.equal(typedTask.options.openTextbookOptions.action, "book");
    assert.equal(typedTask.options.openTextbookOptions.bookId, "calculus-vol-1");
  });

  it("handles query_semantic_scholar tool call and routes options correctly", async () => {
    let capturedTask: unknown;
    const customRegistry = new ActorRegistry();
    customRegistry.register({
      actorType: "semantic-scholar",
      description: "Mock Semantic Scholar",
      run: async (task) => {
        capturedTask = task;
        return {
          taskId: task.taskId,
          actorType: "semantic-scholar",
          status: "completed",
          executionDurationMs: 5,
          data: {
            action: "paper",
            queryUrl: "http://example.com",
            totalResults: 1,
          },
        };
      },
    });

    const server = new ProtokolMcpServer(customRegistry);
    await server.processRequest({
      jsonrpc: "2.0",
      id: "call-semantic-scholar",
      method: "tools/call",
      params: {
        name: "query_semantic_scholar",
        arguments: {
          action: "paper",
          paperId: "ARXIV:1706.03762",
        },
      },
    });

    assert.ok(capturedTask);
    const typedTask = capturedTask as {
      options?: {
        semanticScholarOptions?: {
          action?: string;
          paperId?: string;
        };
      };
    };
    assert.ok(typedTask.options?.semanticScholarOptions);
    assert.equal(typedTask.options.semanticScholarOptions.action, "paper");
    assert.equal(typedTask.options.semanticScholarOptions.paperId, "ARXIV:1706.03762");
  });

  it("dispatches query_biorxiv tool call to BiorxivActor with structured options", async () => {
    let capturedTask: unknown;
    const mockActor: IActor = {
      actorType: "biorxiv",
      description: "Mock bioRxiv actor",
      async run(task) {
        capturedTask = task;
        return {
          taskId: task.taskId,
          actorType: "biorxiv",
          status: "completed",
          statusCode: 200,
          data: {
            server: "biorxiv",
            totalCount: 1,
            cursor: 0,
            articles: [],
            queryUrl: "https://api.biorxiv.org/details/biorxiv/2026-01-01/2026-10-02/0/json",
            markdown: "# bioRxiv preprints",
          },
          executionDurationMs: 5,
        };
      },
    };

    const registry = new ActorRegistry();
    registry.register(mockActor);
    const server = new ProtokolMcpServer(registry);

    const res = await server.processRequest({
      jsonrpc: "2.0",
      id: "call-query-biorxiv",
      method: "tools/call",
      params: {
        name: "query_biorxiv",
        arguments: {
          server: "biorxiv",
          category: "neuroscience",
          limit: 10,
        },
      },
    });

    assert.ok(res);
    assert.equal(res.id, "call-query-biorxiv");
    assert.ok(capturedTask);
    const typedTask = capturedTask as {
      options?: {
        biorxivOptions?: {
          server?: string;
          category?: string;
          limit?: number;
        };
      };
    };
    assert.ok(typedTask.options?.biorxivOptions);
    assert.equal(typedTask.options.biorxivOptions.server, "biorxiv");
    assert.equal(typedTask.options.biorxivOptions.category, "neuroscience");
    assert.equal(typedTask.options.biorxivOptions.limit, 10);
  });

  it("dispatches query_doaj tool call to DoajActor with structured options", async () => {
    let capturedTask: unknown;
    const mockActor: IActor = {
      actorType: "doaj",
      description: "Mock DOAJ actor",
      async run(task) {
        capturedTask = task;
        return {
          taskId: task.taskId,
          actorType: "doaj",
          status: "completed",
          statusCode: 200,
          data: {
            action: "search_articles",
            totalCount: 1,
            page: 1,
            pageSize: 10,
            articles: [],
            queryUrl: "https://doaj.org/api/v2/search/articles/quantum?page=1&pageSize=10",
            markdown: "# DOAJ Articles",
          },
          executionDurationMs: 5,
        };
      },
    };

    const registry = new ActorRegistry();
    registry.register(mockActor);
    const server = new ProtokolMcpServer(registry);

    const res = await server.processRequest({
      jsonrpc: "2.0",
      id: "call-query-doaj",
      method: "tools/call",
      params: {
        name: "query_doaj",
        arguments: {
          action: "search_articles",
          query: "quantum",
          pageSize: 10,
        },
      },
    });

    assert.ok(res);
    assert.equal(res.id, "call-query-doaj");
    assert.ok(capturedTask);
    const typedTask = capturedTask as {
      options?: {
        doajOptions?: {
          action?: string;
          query?: string;
          pageSize?: number;
        };
      };
    };
    assert.ok(typedTask.options?.doajOptions);
    assert.equal(typedTask.options.doajOptions.action, "search_articles");
    assert.equal(typedTask.options.doajOptions.query, "quantum");
    assert.equal(typedTask.options.doajOptions.pageSize, 10);
  });

  it("accepts an injected RegistryDatabase and queries datasets via list_datasets", async () => {
    const customDb = new RegistryDatabase({ inMemory: true });
    customDb.upsertDataset({
      datasetId: "ds-mcp-injected",
      name: "Injected DB Dataset",
      sourcePlatform: "test",
      licenseGroup: "permissive_commercial",
      defaultLanguage: "en",
      description: "Dataset for MCP DI test",
      createdAt: new Date().toISOString(),
    });

    const server = new ProtokolMcpServer(undefined, customDb);
    const res = await server.processRequest({
      jsonrpc: "2.0",
      id: "call-list-datasets",
      method: "tools/call",
      params: {
        name: "list_datasets",
        arguments: {},
      },
    });

    assert.ok(res);
    const result = res.result as { content: Array<{ type: string; text: string }> };
    const parsed = JSON.parse(result.content[0].text) as {
      count: number;
      datasets: Array<{ datasetId: string }>;
    };
    assert.equal(parsed.count, 1);
    assert.equal(parsed.datasets[0].datasetId, "ds-mcp-injected");
    customDb.close();
  });
});
