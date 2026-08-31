# AI Workflow & Scoping Rules

## Development Workflow

1. Read context files (`project-overview.md`, `architecture-context.md`, `code-standards.md`) before writing code.
2. Make targeted, single-purpose edits.
3. Validate every change with `npm run typecheck` and `npm run test`.
4. Update `context/progress-tracker.md` upon feature or milestone completion.

## Gate Verification Rules

Always verify that phase acceptance gates pass cleanly:
- `npm run test:smoke`
- `npm run test:reliability-gate`
- `npm run test:extraction-gate`
- `npm run test:schema-gate`
- `npm run test:crawler-gate`
- `npm run test:orchestration-gate`
- `npm run test:ai-strategy-gate`
- `npm run test:dataset-gate`
- `npm run test:observability-gate`
- `npm run test:finops-gate`
- `npm run test:security-gate`
- `npm run test:provider-gate`
