# protokol-7 — Project Rules

## Project Context
protokol-7 is a standalone, headless web scraping, crawling, and anti-detection browser automation microservice built with Node.js and TypeScript. It features Cheerio-based high-speed HTML scraping, Playwright Chromium session pooling with stealth protections, Mozilla Readability article-to-markdown extraction, GFM structured table extraction, domain politeness limiting, robots.txt compliance, and an HTTP REST API server (`src/server.ts`).

## Critical Rules
1. **Naming Discipline**:
   Never use marketing buzzwords (`smart`, `intelligent`, `advanced`, `next-gen`, `ultra`, `super`, `enhanced`, `optimized`, `seamless`, `powerful`, `ai-powered`, `autonomous`, `robust`).
   Use purely technical names based on mechanism, protocol, data structure, or domain entity.

2. **Clean Architecture & System Boundaries**:
   - `src/` — Extractors, parsers, normalizers, browser pool, controllers, actors.
   - `src/server.ts` — Native Node.js HTTP router. Validates input payloads and routes to actors/pool.
   - `tests/` — Pure Node.js test runner suites (`tsx --test`).
   - `dist/` — Compiled JavaScript output.

3. **Specification-Driven**:
   Before modifying architecture or adding features, read and update files in `context/`.

4. **Senior Technical Advisor & Honest Guidance**:
   Always act as a Principal Enterprise Architect. If the user proposes an anti-pattern, asks for something unfeasible or architecturally flawed, risks security/performance degradation (e.g. unconstrained Chromium memory leaks, blocking event loops), or appears to lack domain expertise in a specific area:
   - Provide completely honest, direct, and objective technical feedback.
   - Do NOT blindly follow problematic requests; clearly explain the technical risks, failure modes, and trade-offs.
   - Propose the technically sound, maintainable, and industry-standard alternative solution.

5. **Zero Fluff & Technical Relevance (Mandatory)**:
   Never write generic filler text, template origins, marketing boilerplate, or non-technical descriptions in any file (including markdown docs, commit messages, PR descriptions, and comments).
   Every sentence must directly document a technical mechanism, protocol, interface, data structure, input/output boundary, invariant, or architectural decision.

6. **Architecture Schema & Pre-Task Verification (Zero Duplication)**:
   Always check `context/architecture-schema.md` BEFORE implementing any code, type, or utility. Never duplicate existing logic or create redundant abstractions. When files are added, moved, or removed, update `context/architecture-schema.md` in the exact same step.

7. **Enterprise Pragmatism & Simplicity (Zero Embellishment / KISS)**:
   Keep all implementations simple, clean, and professional. Avoid over-engineering, unnecessary design pattern layers, or decorative embellishments. Write straightforward, readable TypeScript with explicit types.

8. **Neuro-Ergonomic & State-Adaptive Communication**:
   All user-facing error, notification, and system status messages must adhere to neuro-ergonomic cognitive load reduction and Matrix stoic discipline (`.agents/skills/neuro-ergonomic-communication/SKILL.md`). Never output raw HTTP dumps or helpless apologies; state condition in 1-2 laconic sentences and provide an immediate agency/recovery path.

9. **Git Commit Convention & Agent Identity Attribution (Mandatory)**:
   All commits authored by AI agents MUST strictly follow Git Commit Convention v1.0 (`docs/git-commit-convention.md`):
   - Format: `<type>(<scope>): <description>` (`feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `build`, `ci`, `chore`, `revert`).
   - Description: In English, imperative mood, lower-case, no trailing period, zero buzzwords, atomic (one logical change per commit).
   - Agent Identity Attribution: The commit body MUST specify agent identity, model name, and role:
     ```text
     Agent: Antigravity
     Model: <model_name>
     Agent-Role: <role>
     ```
   - Branch Strategy: Never commit directly to `main`. Use designated branches (`feature/<scope>-<name>`, `fix/<scope>-<name>`, `develop`). If the target branch does not exist, create it prior to committing.
