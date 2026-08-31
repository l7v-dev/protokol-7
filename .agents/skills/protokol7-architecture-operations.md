# Skill: Protokol-7 Architecture & Verification Operations

> **For AI Agents:** Use these instructions when executing system verification, module updates, or phase gate testing on Protokol-7.

---

## 1. Codebase Verification Protocol

Before completing any implementation step, execute the following commands in order:

```bash
# 1. Type Check
npm run typecheck

# 2. Vitest Test Suite
npm run test

# 3. Phase Gate Verification
npm run test:smoke
npm run test:reliability-gate
npm run test:extraction-gate
npm run test:schema-gate
npm run test:crawler-gate
npm run test:orchestration-gate
npm run test:ai-strategy-gate
npm run test:dataset-gate
npm run test:observability-gate
npm run test:finops-gate
npm run test:security-gate
npm run test:provider-gate
```

---

## 2. Production Build Protocol

```bash
npm run build
```

Verify that `dist/` is generated cleanly and database migrations are copied to `dist/database/migrations`.
