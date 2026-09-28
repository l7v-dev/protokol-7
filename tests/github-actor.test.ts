import assert from "node:assert/strict";
import * as http from "node:http";
import { describe, it } from "node:test";
import { GithubActor } from "../src/actors/corpus/github-actor";
import type { ActorTask } from "../src/api/types";

(process.env as Record<string, string | undefined>).NODE_ENV = "test";

const MOCK_REPO_DATA = {
  name: "linux",
  full_name: "torvalds/linux",
  description: "Linux kernel source tree",
  stargazers_count: 180000,
  forks_count: 55000,
  open_issues_count: 320,
  language: "C",
  default_branch: "master",
  license: { name: "GPL-2.0" },
  topics: ["kernel", "operating-system", "c"],
};

const MOCK_README_DATA = {
  name: "README",
  encoding: "base64",
  content: Buffer.from("# Linux Kernel\n\nWelcome to Linux kernel documentation.").toString(
    "base64"
  ),
};

const MOCK_ISSUES_DATA = [
  {
    number: 101,
    title: "Kernel panic on boot with custom driver",
    state: "open",
    html_url: "https://github.com/torvalds/linux/issues/101",
    user: { login: "developer42" },
    labels: [{ name: "bug" }, { name: "driver" }],
    body: "Encountered a kernel panic while initializing the custom PCI driver.",
  },
];

const MOCK_RELEASES_DATA = [
  {
    tag_name: "v6.8",
    name: "Linux 6.8",
    published_at: "2024-03-10T18:00:00Z",
    html_url: "https://github.com/torvalds/linux/releases/tag/v6.8",
    body: "Summary of changes in Linux 6.8 release.",
  },
];

describe("GithubActor", () => {
  it("initializes with correct actorType and description", () => {
    const actor = new GithubActor();
    assert.equal(actor.actorType, "github");
    assert.ok(actor.description.length > 0);
  });

  it("resolves owner, repo, and action from targetUrl and options", () => {
    const actor = new GithubActor();

    const fromOptions = actor.resolveRepoAndAction(undefined, {
      owner: "torvalds",
      repo: "linux",
      action: "readme",
    });
    assert.equal(fromOptions.owner, "torvalds");
    assert.equal(fromOptions.repo, "linux");
    assert.equal(fromOptions.action, "readme");

    const fromUrlIssues = actor.resolveRepoAndAction("https://github.com/torvalds/linux/issues");
    assert.equal(fromUrlIssues.owner, "torvalds");
    assert.equal(fromUrlIssues.repo, "linux");
    assert.equal(fromUrlIssues.action, "issues");

    const fromUrlPulls = actor.resolveRepoAndAction("https://github.com/torvalds/linux/pulls");
    assert.equal(fromUrlPulls.action, "pulls");

    const fromUrlReleases = actor.resolveRepoAndAction(
      "https://github.com/torvalds/linux/releases"
    );
    assert.equal(fromUrlReleases.action, "releases");

    const fromUrlTree = actor.resolveRepoAndAction("https://github.com/torvalds/linux/tree/main");
    assert.equal(fromUrlTree.action, "tree");
  });

  it("builds correct endpoint URLs for all actions", () => {
    const actor = new GithubActor();

    const repoUrl = actor.buildEndpointUrl(undefined, "torvalds", "linux", "repo");
    assert.equal(repoUrl, "https://api.github.com/repos/torvalds/linux");

    const readmeUrl = actor.buildEndpointUrl(undefined, "torvalds", "linux", "readme");
    assert.equal(readmeUrl, "https://api.github.com/repos/torvalds/linux/readme");

    const issuesUrl = actor.buildEndpointUrl(undefined, "torvalds", "linux", "issues", {
      state: "closed",
      limit: 50,
    });
    assert.equal(
      issuesUrl,
      "https://api.github.com/repos/torvalds/linux/issues?state=closed&per_page=50"
    );

    const pullsUrl = actor.buildEndpointUrl(undefined, "torvalds", "linux", "pulls", {
      state: "open",
      limit: 20,
    });
    assert.equal(
      pullsUrl,
      "https://api.github.com/repos/torvalds/linux/pulls?state=open&per_page=20"
    );

    const releasesUrl = actor.buildEndpointUrl(undefined, "torvalds", "linux", "releases", {
      limit: 10,
    });
    assert.equal(releasesUrl, "https://api.github.com/repos/torvalds/linux/releases?per_page=10");

    const treeUrl = actor.buildEndpointUrl(undefined, "torvalds", "linux", "tree");
    assert.equal(treeUrl, "https://api.github.com/repos/torvalds/linux/git/trees/HEAD?recursive=1");
  });

  it("returns 400 when missing owner and repo", async () => {
    const actor = new GithubActor();
    const task: ActorTask = {
      taskId: "test-github-empty",
      actorType: "github",
      targetUrl: "",
    };

    const result = await actor.run(task, { task, startTime: Date.now() });
    assert.equal(result.status, "failed");
    assert.equal(result.statusCode, 400);
    assert.ok(result.errorMessage?.includes("Missing repository identifier"));
  });

  it("blocks SSRF attempts to private or cloud metadata IPs", async () => {
    const actor = new GithubActor();
    const task: ActorTask = {
      taskId: "test-ssrf-github-1",
      actorType: "github",
      targetUrl: "http://169.254.169.254/latest/meta-data",
    };

    const result = await actor.run(task, { task, startTime: Date.now() });
    assert.equal(result.status, "failed");
    assert.equal(result.statusCode, 403);
    assert.ok(result.errorMessage?.includes("SSRF"));
  });

  it("fetches and decodes base64 README successfully", async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(MOCK_README_DATA));
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const port = (server.address() as { port: number }).port;
    const mockUrl = `http://127.0.0.1:${port}/repos/torvalds/linux/readme`;

    try {
      const actor = new GithubActor();
      const task: ActorTask = {
        taskId: "test-github-readme",
        actorType: "github",
        targetUrl: mockUrl,
        options: {
          githubOptions: {
            owner: "torvalds",
            repo: "linux",
            action: "readme",
          },
        },
      };

      const result = await actor.run(task, { task, startTime: Date.now() });
      assert.equal(result.status, "completed");
      assert.equal(result.statusCode, 200);
      assert.ok(result.data);
      assert.equal(result.data.owner, "torvalds");
      assert.equal(result.data.repo, "linux");
      assert.equal(result.data.action, "readme");
      assert.ok(result.data.markdown?.includes("# Linux Kernel"));
      assert.ok(result.data.markdown?.includes("Welcome to Linux kernel documentation."));
    } finally {
      server.close();
    }
  });

  it("fetches and formats repo metadata into Markdown", async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(MOCK_REPO_DATA));
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const port = (server.address() as { port: number }).port;
    const mockUrl = `http://127.0.0.1:${port}/repos/torvalds/linux`;

    try {
      const actor = new GithubActor();
      const task: ActorTask = {
        taskId: "test-github-repo",
        actorType: "github",
        targetUrl: mockUrl,
        options: {
          githubOptions: {
            owner: "torvalds",
            repo: "linux",
            action: "repo",
          },
        },
      };

      const result = await actor.run(task, { task, startTime: Date.now() });
      assert.equal(result.status, "completed");
      assert.equal(result.statusCode, 200);
      assert.ok(result.data);
      assert.ok(result.data.markdown?.includes("Linux kernel source tree"));
      assert.ok(result.data.markdown?.includes("180000"));
      assert.ok(result.data.markdown?.includes("GPL-2.0"));
    } finally {
      server.close();
    }
  });

  it("fetches and formats issues and releases into Markdown", async () => {
    const server = http.createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      if (req.url?.includes("/issues")) {
        res.end(JSON.stringify(MOCK_ISSUES_DATA));
      } else {
        res.end(JSON.stringify(MOCK_RELEASES_DATA));
      }
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const port = (server.address() as { port: number }).port;

    try {
      const actor = new GithubActor();

      // Issues test
      const issueTask: ActorTask = {
        taskId: "test-github-issues",
        actorType: "github",
        targetUrl: `http://127.0.0.1:${port}/repos/torvalds/linux/issues`,
        options: {
          githubOptions: {
            owner: "torvalds",
            repo: "linux",
            action: "issues",
          },
        },
      };

      const issueResult = await actor.run(issueTask, { task: issueTask, startTime: Date.now() });
      assert.equal(issueResult.status, "completed");
      assert.ok(issueResult.data?.markdown?.includes("#101: Kernel panic on boot"));
      assert.ok(issueResult.data?.markdown?.includes("@developer42"));

      // Releases test
      const releaseTask: ActorTask = {
        taskId: "test-github-releases",
        actorType: "github",
        targetUrl: `http://127.0.0.1:${port}/repos/torvalds/linux/releases`,
        options: {
          githubOptions: {
            owner: "torvalds",
            repo: "linux",
            action: "releases",
          },
        },
      };

      const releaseResult = await actor.run(releaseTask, {
        task: releaseTask,
        startTime: Date.now(),
      });
      assert.equal(releaseResult.status, "completed");
      assert.ok(releaseResult.data?.markdown?.includes("Linux 6.8"));
      assert.ok(releaseResult.data?.markdown?.includes("v6.8"));
    } finally {
      server.close();
    }
  });

  it("handles upstream HTTP error responses gracefully", async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "Not Found" }));
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const port = (server.address() as { port: number }).port;
    const mockUrl = `http://127.0.0.1:${port}/repos/torvalds/linux/notfound`;

    try {
      const actor = new GithubActor();
      const task: ActorTask = {
        taskId: "test-github-404",
        actorType: "github",
        targetUrl: mockUrl,
        options: {
          githubOptions: {
            owner: "torvalds",
            repo: "linux",
          },
        },
      };

      const result = await actor.run(task, { task, startTime: Date.now() });
      assert.equal(result.status, "failed");
      assert.equal(result.statusCode, 404);
      assert.ok(result.errorMessage?.includes("404"));
    } finally {
      server.close();
    }
  });
});
