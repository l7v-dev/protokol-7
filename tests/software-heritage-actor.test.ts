import assert from "node:assert/strict";
import * as http from "node:http";
import test from "node:test";
import { SoftwareHeritageActor } from "../src/actors/software-heritage-actor";

(process.env as Record<string, string | undefined>).NODE_ENV = "test";

const MOCK_CODE_BLOB = `// Hello World in Rust
fn main() {
    println!("Preserved by Software Heritage!");
}
`;

const MOCK_DIRECTORY_JSON = [
  {
    name: "src",
    type: "dir",
    target: "swh:1:dir:1111111111111111111111111111111111111111",
    perms: 16877,
  },
  {
    name: "main.rs",
    type: "file",
    target: "swh:1:cnt:2222222222222222222222222222222222222222",
    perms: 33188,
    length: 128,
  },
  {
    name: "Cargo.toml",
    type: "file",
    target: "swh:1:cnt:3333333333333333333333333333333333333333",
    perms: 33188,
    length: 256,
  },
];

const MOCK_ORIGIN_VISIT_JSON = {
  visit: 42,
  origin: "https://github.com/torvalds/linux",
  date: "2024-01-01T12:00:00Z",
  status: "full",
  snapshot: "swh:1:snp:4444444444444444444444444444444444444444",
};

test("SoftwareHeritageActor extracts raw code blob for swh:1:cnt SWHID", async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(MOCK_CODE_BLOB);
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const targetUrl = `http://127.0.0.1:${port}/api/1/content/sha1_git:94a9ed024d3859793618152ea559a168bbcbb5e2/raw/`;

  try {
    const actor = new SoftwareHeritageActor();
    const result = await actor.run(
      {
        taskId: "test-swh-1",
        actorType: "software-heritage",
        targetUrl,
        options: {
          softwareHeritageOptions: {
            swhid: "swh:1:cnt:94a9ed024d3859793618152ea559a168bbcbb5e2",
          },
        },
      },
      {
        task: { taskId: "test-swh-1", actorType: "software-heritage" },
        startTime: Date.now(),
      }
    );

    assert.equal(result.status, "completed");
    assert.ok(result.data);
    assert.equal(result.data.action, "content");
    assert.ok(
      result.data.markdown.includes(
        "# Software Heritage Source Blob: swh:1:cnt:94a9ed024d3859793618152ea559a168bbcbb5e2"
      )
    );
    assert.ok(result.data.markdown.includes("Preserved by Software Heritage!"));
  } finally {
    server.close();
  }
});

test("SoftwareHeritageActor traverses directory tree for swh:1:dir SWHID", async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(MOCK_DIRECTORY_JSON));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const targetUrl = `http://127.0.0.1:${port}/api/1/dir/c6c810fb6e5bf39634e405a306ae93098528cc7a/`;

  try {
    const actor = new SoftwareHeritageActor();
    const result = await actor.run(
      {
        taskId: "test-swh-2",
        actorType: "software-heritage",
        targetUrl,
        options: {
          softwareHeritageOptions: {
            swhid: "swh:1:dir:c6c810fb6e5bf39634e405a306ae93098528cc7a",
            action: "directory",
          },
        },
      },
      {
        task: { taskId: "test-swh-2", actorType: "software-heritage" },
        startTime: Date.now(),
      }
    );

    assert.equal(result.status, "completed");
    assert.ok(result.data);
    assert.equal(result.data.action, "directory");
    assert.ok(result.data.markdown.includes("# Software Heritage Directory Tree"));
    assert.ok(result.data.markdown.includes("main.rs"));
    assert.ok(result.data.markdown.includes("Cargo.toml"));
  } finally {
    server.close();
  }
});

test("SoftwareHeritageActor inspects repository origin visits", async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(MOCK_ORIGIN_VISIT_JSON));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const targetUrl = `http://127.0.0.1:${port}/api/1/origin/visit/latest/`;

  try {
    const actor = new SoftwareHeritageActor();
    const result = await actor.run(
      {
        taskId: "test-swh-3",
        actorType: "software-heritage",
        targetUrl,
        options: {
          softwareHeritageOptions: {
            originUrl: "https://github.com/torvalds/linux",
          },
        },
      },
      {
        task: { taskId: "test-swh-3", actorType: "software-heritage" },
        startTime: Date.now(),
      }
    );

    assert.equal(result.status, "completed");
    assert.ok(result.data);
    assert.equal(result.data.action, "origin");
    assert.ok(result.data.markdown.includes("# Software Heritage Repository Origin"));
    assert.ok(result.data.markdown.includes("https://github.com/torvalds/linux"));
  } finally {
    server.close();
  }
});

test("SoftwareHeritageActor fails when no target is provided", async () => {
  const actor = new SoftwareHeritageActor();
  const result = await actor.run(
    {
      taskId: "test-swh-4",
      actorType: "software-heritage",
      options: {
        softwareHeritageOptions: {},
      },
    },
    {
      task: { taskId: "test-swh-4", actorType: "software-heritage" },
      startTime: Date.now(),
    }
  );

  assert.equal(result.status, "failed");
  assert.ok(result.errorMessage?.includes("swhid"));
});
