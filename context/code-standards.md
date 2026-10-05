# Code Standards

## 1. General Principles

- Keep modules small, decoupled, and single-purpose.
- Fix root causes — do not layer workarounds or suppress unhandled rejections.
- Respect the system boundaries defined in `architecture-context.md`.
- **Pre-Task Verification (No Duplication)**: Consult `context/architecture-schema.md` before writing new code to avoid duplicating existing types, functions, or utilities.
- **Enterprise Simplicity (Zero Embellishment / KISS)**: Keep implementations straightforward and readable. Avoid unnecessary design patterns, premature abstractions, or decorative code.

---

## 2. Naming Discipline (Mandatory)

- **Banned Words**: `smart`, `intelligent`, `advanced`, `next-gen`, `ultra`, `super`, `enhanced`, `optimized`, `seamless`, `powerful`, `ai-powered`, `autonomous`, `robust`, `magical`, `lightning`.
- Do not use marketing adjectives or buzzwords in identifiers, filenames, folders, functions, types, or commit messages.
- Name only the technical mechanism, protocol, data structure, or domain entity.
- Run `npm run lint:naming` or `./.agents/skills/dev/naming-discipline/scripts/check-naming.sh` to verify compliance.

---

## 3. Neuro-Ergonomic Communication & Error Handling

- Formulate error messages with calm, laconic cadence (1-2 sentences, 5-9 words), stating the technical condition and providing an immediate agency/recovery path.
- BANNED: Panicky phrases ("Hata oluştu!", "Eyvah"), synthetic apologies ("Özür dileriz", "Üzgünüz"), and raw HTTP status/stack dumps.
- Never silently swallow errors in `catch` blocks.
- Explicit error classes must be used: `ActorExecutionError`, `BrowserContextError`, `RateLimitExceededError`, `UrlResolutionError`.

---

## 4. TypeScript Standards

- Strict mode is required throughout (`tsconfig.json`).
- Avoid `any`; use explicit interfaces or narrowly scoped types.
- Validate external input at system boundaries using schemas (Zod).
- Use `interface` for object contracts and `type` for unions/primitives.

---

## 5. Resource Safety & Headless Browser Discipline

- All Playwright browser contexts must be tracked and closed deterministically.
- Never increment active context counters before the context has been successfully allocated.
- Always unregister route handlers and close open pages upon task completion.

---

## 6. Git Commit Convention & Branch Strategy (Mandatory)

All commits must adhere strictly to Git Commit Convention v1.0 (`docs/git-commit-convention.md`):
- **Format**: `<type>(<scope>): <description>` (`feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `build`, `ci`, `chore`, `revert`).
- **Description**: In English, imperative mood, lower-case first letter, no trailing period, zero buzzwords.
- **Agent Identity Attribution**: Declare agent identity, model name, and role in the commit body:
  ```text
  Agent: Antigravity
  Model: <model_name>
  Agent-Role: <role>
  ```
- **Branch Discipline**: Never commit directly to `main`. Use designated branches (`feature/<scope>-<name>`, `fix/<scope>-<name>`, `develop`). If the target branch does not exist, create it prior to committing.

---

## 7. Documentation & Comment Discipline (Mandatory)

- Ref: `rules/documentation-discipline.md`.
- **Zero Conversational Filler**: No chatting in code comments ("now we do this", "let's check", "a neat trick").
- **Zero Marketing Jargon**: No buzzwords (`smart`, `seamless`, `powerful`, `optimized`, `robust`, etc.).
- **Technical Content Only**: Comments must state only architectural invariants, non-obvious constraints, side-effects, or rationale for non-trivial alternatives.
- **No Redundant Comments**: Do not explain what clean code already states (e.g. no `// returns result` above `return result`).
