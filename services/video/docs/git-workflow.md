# Git e fluxo de trabalho

## Setup
1. `git init -b main`; `.gitignore` (node_modules, dist, `.env*` exceto `.env.example`, coverage, mídia) e `.gitattributes` (`* text=auto eol=lf`).
2. Antes de cada commit relevante: `git status` e `git diff --cached`; garantir que nenhum segredo entrou.
3. Remoto no GitHub (privado), `git push -u origin main` — só após definir o owner/repositório.

## Branches (trunk-based leve)
- `main` sempre verde e protegida: PR obrigatório, CI obrigatório, sem force-push.
- Branches curtas: `feat/…`, `fix/…`, `chore/…`, `docs/…`; uma por marco ou sub-feature.
- Merge por **squash**.

## Commits
Conventional Commits, validados por commitlint:
`feat(progress): idempotência de heartbeat` · `fix(storage): partes do multipart` · `docs(mcp): escopos` · `chore: …`
Pequenos e atômicos. Corpo explica o *porquê*.

## Hooks (husky + lint-staged)
- pre-commit: eslint/prettier nos arquivos staged + gitleaks.
- commit-msg: commitlint.
- pre-push: typecheck + testes rápidos.

## CI (GitHub Actions)
lint → typecheck → unit → e2e (postgres/redis como services) → build das imagens Docker → gitleaks → `npm audit`. Cache de dependências.

## PR
Template com checklist: testes, migration, OpenAPI/Swagger, docs atualizadas (`docs/`), `CLAUDE.md` se mudou convenção, sem segredos.

## Releases
Tags semver; cada marco fecha com `v0.N.0`; `v1.0.0` ao final do Marco 7/8. CHANGELOG gerado (release-please ou changesets). Imagens Docker tagueadas pela versão.

## Migrations
Prisma migrations sempre versionadas; nunca editar migration já mergeada — criar nova.

## ADRs
Decisões relevantes em `docs/adr/NNNN-titulo.md` (contexto, decisão, consequências).
