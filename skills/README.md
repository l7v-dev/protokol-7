# Agent skills

Third-party agent "skills" (vendor-specific playbooks — Clerk, Prisma,
Trigger.dev, Liveblocks, etc.) are pulled in per-project, versioned, and
recorded in `skills-lock.json` at the repo root — the same pattern as a
lockfile for a package manager, but for agent instructions instead of code.

## Layout

- `.agents/skills/<name>/SKILL.md` (+ `references/`) — the actual skill
  content, fetched from its source (usually a vendor's own `skills` repo on
  GitHub).
- `.claude/skills/<name>` — a symlink into `.agents/skills/<name>`, so Claude
  Code discovers it without duplicating content. Keep both in sync: every
  entry under `.agents/skills` should have a matching symlink under
  `.claude/skills`.
- `skills-lock.json` — records, per skill: `source`, `sourceType`,
  `skillPath`, and a `computedHash` of the fetched content, so the project
  pins an exact version instead of always tracking a moving upstream target.

## Adding a skill

1. Fetch the skill's `SKILL.md` (and any `references/`) from its source into
   `.agents/skills/<name>/`.
2. Symlink it: `ln -s ../../.agents/skills/<name> .claude/skills/<name>`.
3. Add an entry to `skills-lock.json` with `source`, `sourceType`,
   `skillPath`, and a hash of the fetched content.

This template ships with both directories empty — add only the skills the
project actually needs (auth vendor, ORM, background-job runner, etc.) once
the stack is decided in `context/architecture-context.md`.
