# Development Workflow

## 1. Approach

Build this project incrementally using a spec-driven workflow. Context files define what to build, how to build it, and what the current state of progress is. Always implement against these specs — do not infer or invent behavior from scratch.

---

## 2. Scoping Rules

- Work on one feature unit or subsystem at a time.
- Prefer small, verifiable increments over large speculative changes.
- Do not combine unrelated system boundaries in a single implementation step.

---

## 3. When To Split Work

Split an implementation step if it combines:
- HTTP REST API route changes and Playwright browser pool changes.
- Parser / DOM logic and network rate limiter logic.
- Behavior that is not clearly defined in the context files.

If a change cannot be verified end to end quickly, the scope is too broad — split it.

---

## 4. Keeping Docs In Sync

Update the relevant context file whenever implementation changes:
- System architecture or boundaries (`architecture-context.md`)
- File map or component inventory (`architecture-schema.md`)
- Code conventions or standards (`code-standards.md`)
- Progress and completed phases (`TASKS.md`, `ledger/index.jsonl`)

---

## 5. Verification Before Moving Forward

Before considering a unit complete:
1. All automated tests pass (`npm test`).
2. TypeScript compiles without errors (`npm run lint` / `tsc --noEmit`).
3. Zero marketing buzzwords are present (`npm run lint:naming`).
4. Production build succeeds (`npm run build`).
5. `TASKS.md` and `ledger/index.jsonl` reflect the actual completed state.

---

## 6. Git Commit & Branching Workflow (Mandatory)

1. **Branch Selection**: Never commit directly to `main`. Use `feature/<scope>-<name>`, `fix/<scope>-<name>`, or `develop`.
2. **Commit Standard**: Follow Git Commit Convention v1.0 (`docs/git-commit-convention.md`).
3. **Agent Attribution**: Every commit authored by an agent must include the agent identity, model, and role in the commit body.
