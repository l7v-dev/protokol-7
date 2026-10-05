# Uygulama ve Denetim (Enforcement)

Projelerde ve agent süreçlerinde isimlendirme disiplinini zorunlu kılma yöntemleri.

## 1. Agent Steering (AGENTS.md / CLAUDE.md / GEMINI.md)
Projelerin kök dizinindeki kurallara şu blok eklenmelidir:
```markdown
## Naming Discipline
All identifiers, file names, class names, and commit messages MUST adhere to technical naming discipline:
- Banned buzzwords: smart, intelligent, advanced, next-gen, ultra, super, enhanced, optimized, seamless, powerful, ai-powered, autonomous, robust.
- Name only the technical mechanism, protocol, data structure, or domain entity.
```

## 2. Pre-Commit / Git Hook
`scripts/check-naming.sh` betiği pre-commit hook içine bağlanarak yasaklı kelimelerin commit edilmesi engellenebilir:
```bash
#!/usr/bin/env bash
./scripts/check-naming.sh --staged
```

## 3. CI Gate
GitHub Actions veya CI pipeline adımında:
```bash
./scripts/check-naming.sh --diff origin/main...HEAD
```
