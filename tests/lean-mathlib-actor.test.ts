/**
 * Unit tests for LeanMathlibActor.
 */

import assert from "node:assert/strict";
import http from "node:http";
import { describe, it } from "node:test";
import { LeanMathlibActor } from "../src/actors/corpus/lean-mathlib-actor";
import type { ActorTask } from "../src/api/types";

(process.env as Record<string, string | undefined>).NODE_ENV = "test";

const MOCK_LEAN4_SOURCE = `
import Mathlib.Init.Data.Nat.Basic

namespace Nat

/-- Successor relation is order-preserving. -/
theorem succ_le_succ {n m : Nat} (h : n ≤ m) : succ n ≤ succ m := by
  rw [succ_eq_add_one]
  simp [h]
  exact h

/-- Addition is commutative on natural numbers. -/
theorem add_comm (n m : Nat) : n + m = m + n := by
  induction n with
  | zero => simp
  | succ k ih =>
    rw [succ_add]
    rw [ih]
    rfl

/-- Zero is smaller than or equal to any natural number. -/
lemma zero_le (n : Nat) : 0 ≤ n := by
  induction n with
  | zero => rfl
  | succ k _ => exact le_succ (0 ≤ k)

def double (n : Nat) : Nat :=
  n + n

end Nat
`;

const MOCK_GITHUB_SEARCH_RESPONSE = {
  total_count: 2,
  items: [
    {
      name: "Basic.lean",
      path: "Mathlib/Data/Nat/Basic.lean",
      html_url:
        "https://github.com/leanprover-community/mathlib4/blob/master/Mathlib/Data/Nat/Basic.lean",
    },
    {
      name: "Prime.lean",
      path: "Mathlib/Data/Nat/Prime.lean",
      html_url:
        "https://github.com/leanprover-community/mathlib4/blob/master/Mathlib/Data/Nat/Prime.lean",
    },
  ],
};

describe("LeanMathlibActor", () => {
  it("initializes with correct actorType and description", () => {
    const actor = new LeanMathlibActor();
    assert.equal(actor.actorType, "lean-mathlib");
    assert.ok(actor.description.includes("Lean 4"));
  });

  it("resolves parameters and actions correctly", () => {
    const actor = new LeanMathlibActor();

    const fileParams = actor.resolveParameters("", {
      path: "Mathlib/Algebra/Group/Basic.lean",
      limit: 15,
    });
    assert.equal(fileParams.action, "file");
    assert.equal(fileParams.repo, "leanprover-community/mathlib4");
    assert.equal(fileParams.path, "Mathlib/Algebra/Group/Basic.lean");
    assert.equal(fileParams.limit, 15);

    const thmParams = actor.resolveParameters("", {
      theorem: "succ_le_succ",
    });
    assert.equal(thmParams.action, "theorem");
    assert.equal(thmParams.theorem, "succ_le_succ");

    const searchParams = actor.resolveParameters("", {
      query: "fermat",
      limit: 5,
    });
    assert.equal(searchParams.action, "search");
    assert.equal(searchParams.query, "fermat");
    assert.equal(searchParams.limit, 5);

    const randomParams = actor.resolveParameters("", {
      action: "random",
    });
    assert.equal(randomParams.action, "file");
    assert.ok(randomParams.path.endsWith(".lean"));
  });

  it("resolves repository and path from targetUrl", () => {
    const actor = new LeanMathlibActor();

    const res1 = actor.resolveParameters(
      "https://github.com/leanprover/lean4/blob/master/src/Init/Prelude.lean",
      {}
    );
    assert.equal(res1.repo, "leanprover/lean4");
    assert.equal(res1.path, "src/Init/Prelude.lean");

    const res2 = actor.resolveParameters(
      "https://raw.githubusercontent.com/leanprover-community/mathlib4/master/Mathlib/Topology/Basic.lean",
      {}
    );
    assert.equal(res2.repo, "leanprover-community/mathlib4");
    assert.equal(res2.path, "Mathlib/Topology/Basic.lean");
  });

  it("parses Lean 4 declarations, docstrings, and tactics accurately", () => {
    const actor = new LeanMathlibActor();
    const items = actor.parseLeanDeclarations(
      MOCK_LEAN4_SOURCE,
      "leanprover-community/mathlib4",
      "Mathlib/Data/Nat/Basic.lean"
    );

    assert.equal(items.length, 4);

    // 1. succ_le_succ
    const thm1 = items[0];
    assert.equal(thm1.name, "succ_le_succ");
    assert.equal(thm1.kind, "theorem");
    assert.equal(thm1.docstring, "Successor relation is order-preserving.");
    assert.ok(thm1.signature.includes("succ n ≤ succ m"));
    assert.ok(thm1.tactics);
    assert.equal(thm1.tactics.length, 3);
    assert.equal(thm1.tactics[0], "rw [succ_eq_add_one]");
    assert.equal(thm1.tactics[1], "simp [h]");
    assert.equal(thm1.tactics[2], "exact h");

    // 2. add_comm
    const thm2 = items[1];
    assert.equal(thm2.name, "add_comm");
    assert.equal(thm2.kind, "theorem");
    assert.ok(thm2.signature.includes("n + m = m + n"));
    assert.ok(thm2.tactics);
    assert.ok(thm2.tactics.length >= 2);

    // 3. zero_le
    const lem1 = items[2];
    assert.equal(lem1.name, "zero_le");
    assert.equal(lem1.kind, "lemma");

    // 4. double
    const def1 = items[3];
    assert.equal(def1.name, "double");
    assert.equal(def1.kind, "def");
    assert.ok(def1.signature.includes("Nat"));
  });

  it("filters specific theorem when theorem option is supplied", () => {
    const actor = new LeanMathlibActor();
    const items = actor.parseLeanDeclarations(
      MOCK_LEAN4_SOURCE,
      "leanprover-community/mathlib4",
      "Mathlib/Data/Nat/Basic.lean",
      "succ_le_succ"
    );

    assert.equal(items.length, 1);
    assert.equal(items[0].name, "succ_le_succ");
  });

  it("blocks SSRF attempts to private or cloud metadata IPs", async () => {
    const actor = new LeanMathlibActor();
    const task: ActorTask = {
      taskId: "test-ssrf",
      actorType: "lean-mathlib",
      targetUrl: "http://169.254.169.254/latest/meta-data/",
    };

    const result = await actor.run(task, { task, startTime: Date.now() });
    assert.equal(result.status, "failed");
    assert.equal(result.statusCode, 403);
    assert.ok(result.errorMessage?.includes("SSRF validation failed"));
  });

  it("fetches and parses Lean file declarations via mock HTTP server", async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(MOCK_LEAN4_SOURCE);
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const port = (server.address() as { port: number }).port;
    const mockUrl = `http://127.0.0.1:${port}/test/Nat/Basic.lean`;

    try {
      const actor = new LeanMathlibActor();
      const task: ActorTask = {
        taskId: "test-lean-file",
        actorType: "lean-mathlib",
        targetUrl: mockUrl,
        options: {
          leanMathlibOptions: {
            action: "file",
            path: "Mathlib/Data/Nat/Basic.lean",
            limit: 10,
          },
        },
      };

      const result = await actor.run(task, { task, startTime: Date.now() });
      assert.equal(result.status, "completed");
      assert.ok(result.data);
      assert.equal(result.data.action, "file");
      assert.equal(result.data.totalDeclarations, 4);

      const items = result.data.items;
      assert.equal(items[0].name, "succ_le_succ");
      assert.ok(result.data.markdown);
      assert.ok(
        result.data.markdown.includes("# Lean 4 & Mathlib Computer-Verified Formal Proofs")
      );
      assert.ok(result.data.markdown.includes("### Verified Proof Tactic Sequence (`by`)"));
      assert.ok(result.data.markdown.includes("rw [succ_eq_add_one]"));
    } finally {
      server.close();
    }
  });

  it("handles code search results via mock HTTP server", async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(MOCK_GITHUB_SEARCH_RESPONSE));
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const port = (server.address() as { port: number }).port;
    const mockUrl = `http://127.0.0.1:${port}/test/search`;

    try {
      const actor = new LeanMathlibActor();
      const task: ActorTask = {
        taskId: "test-lean-search",
        actorType: "lean-mathlib",
        targetUrl: mockUrl,
        options: {
          leanMathlibOptions: {
            action: "search",
            query: "Nat",
            limit: 2,
          },
        },
      };

      const result = await actor.run(task, { task, startTime: Date.now() });
      assert.equal(result.status, "completed");
      assert.ok(result.data);
      assert.equal(result.data.action, "search");
      assert.equal(result.data.totalDeclarations, 2);
      assert.equal(result.data.items[0].name, "Basic.lean");
      assert.equal(result.data.items[1].name, "Prime.lean");
    } finally {
      server.close();
    }
  });

  it("handles upstream HTTP 500 error gracefully", async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("GitHub upstream error");
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const port = (server.address() as { port: number }).port;
    const mockUrl = `http://127.0.0.1:${port}/test/error.lean`;

    try {
      const actor = new LeanMathlibActor();
      const task: ActorTask = {
        taskId: "test-500",
        actorType: "lean-mathlib",
        targetUrl: mockUrl,
      };

      const result = await actor.run(task, { task, startTime: Date.now() });
      assert.equal(result.status, "failed");
      assert.equal(result.statusCode, 500);
      assert.ok(result.errorMessage?.includes("Lean Mathlib API returned HTTP 500"));
    } finally {
      server.close();
    }
  });
});
