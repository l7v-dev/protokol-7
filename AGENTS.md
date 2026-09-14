## Application Building Context

Read the following files in order before implementing or making any architectural decision:

1. `context/project-overview.md` — product definition, goals, capabilities, and scope
2. `context/architecture-context.md` — system structure, boundaries, resource lifecycle, and invariants
3. `context/architecture-schema.md` — single source of truth file map and component inventory
4. `context/code-standards.md` — implementation rules, naming discipline, and error conventions
5. `context/ai-workflow-rules.md` — development workflow, scoping rules, and delivery approach
6. `context/progress-tracker.md` — current phase, completed work, open questions, and next steps

Update `context/progress-tracker.md` and `context/architecture-schema.md` after each meaningful implementation change.

If implementation changes the architecture, scope, or standards documented in the context files, update the relevant file before continuing.

## Pre-Task Verification & Zero Duplication (Mandatory)

Before writing any new function, type, utility, or class:
- Inspect `context/architecture-schema.md` to verify whether the capability already exists.
- Never duplicate logic or recreate parallel abstractions. Reuse existing contracts.
- Keep implementations simple and concise (KISS). Avoid speculative abstractions and unnecessary decorative layers.

## Naming Discipline (Mandatory)

All identifiers, file names, directory names, class names, interfaces, function names, variables, commits, and PR titles MUST adhere strictly to technical naming discipline:
- BANNED buzzwords: `smart`, `intelligent`, `advanced`, `next-gen`, `ultra`, `super`, `enhanced`, `optimized`, `seamless`, `powerful`, `ai-powered`, `autonomous`, `robust`, `magical`, `lightning`.
- Name only the technical mechanism, protocol, data structure, or domain entity.
- Reference: `.agents/skills/naming-discipline/SKILL.md`.

## Neuro-Ergonomic & State-Adaptive Communication (Mandatory)

All user-facing system notifications, error messages, and operational status texts MUST adhere strictly to neuro-ergonomic cognitive load reduction and Matrix stoic discipline:
- BANNED: Panicky phrases ("Hata oluştu!", "Eyvah"), synthetic apologies ("Özür dileriz", "Üzgünüz"), and raw HTTP status/stack dumps.
- Formulate messages with calm, laconic cadence (max 1-2 sentences, 5-9 words), restoring user agency and control.
- Reference: `.agents/skills/neuro-ergonomic-communication/SKILL.md`.

## Platform Purpose & Identity (Mandatory)

protokol-7 is a standalone, headless web scraping, crawling, and anti-detection browser automation microservice.
- It exposes a native Node.js HTTP REST API (`src/server.ts`) for external consumers (e.g. Agent-Smith and CLI clients).
- Core capabilities include lightweight HTML parsing (Cheerio), headless browser session pool (Playwright Chromium), readability markdown extraction, structured table/metadata extraction, politeness rate limiting, and robots.txt compliance.
- protokol-7 is a focused scraping microservice, NOT an AI chatbot, agent orchestrator, or LLM runtime.

## System Boundaries

- `src/` — Core service logic: actors, browser pool, controllers, normalizers, parsers, and extractors.
- `src/server.ts` — Standalone HTTP REST server router and endpoint controllers.
- `tests/` — Automated unit and integration tests for actors, pool, extractors, and routes.
- `dist/` — Compiled TypeScript output for production execution.

## Technical Advisory & Architectural Integrity

The agent operates as a Principal Enterprise Architect:
- If a proposed approach, tool, or user instruction compromises architectural integrity, introduces security vulnerabilities (e.g. SSRF leakage, headless browser zombie leaks), or violates separation of concerns, the agent MUST warn the user directly, objectively, and honestly.
- Never passively accept architectural anti-patterns. Articulate technical trade-offs, potential failure modes, and provide the correct engineering solution.

## Information Density & Technical Relevance

Do NOT include filler, marketing boilerplate, or non-technical descriptions in any documentation or code. Every sentence in markdown, docstrings, or commit messages must describe an actual technical mechanism, protocol, interface, data structure, invariant, or architectural boundary.

## Git Commit Convention & Agent Attribution (Mandatory)

All commits authored by agents MUST adhere strictly to Git Commit Convention v1.0 (`docs/git-commit-convention.md`):
- Format: `<type>(<scope>): <description>` (e.g. `feat(browser): add screenshot buffer streaming`).
- Allowed types: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `build`, `ci`, `chore`, `revert`.
- Description: In English, imperative mood, lower-case first letter, no trailing period, zero buzzwords.
- Atomicity: One commit = one logical change.
- Agent Identity in Commit Body: Always declare the agent name, model identifier, and role in the commit body:
  ```text
  Agent: Antigravity
  Model: <model_name>
  Agent-Role: <role>
  ```
- Branch Discipline: Never commit directly to `main`. Use appropriate branches (`feature/<scope>-<name>`, `fix/<scope>-<name>`, `develop`). If the target branch does not exist, create it prior to committing.
