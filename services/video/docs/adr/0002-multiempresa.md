# ADR 0002 — Multiempresa (multi-tenant)

**Status:** aceito · 2026-10-25

## Contexto
A plataforma atende **4 empresas** de um mesmo operador, cada uma com seus usuários, cursos, vídeos e analytics, sem enxergar os dados das outras.

## Decisão
- **Um banco, um schema, coluna `tenant_id` em toda tabela de negócio** (`tenants` é a raiz). Quatro empresas não justificam schema/banco por empresa.
- **Usuário pertence a uma empresa**; e-mail único **por empresa**. Quem atua em duas empresas tem duas contas.
- **Login informa a empresa** (`tenant` = slug); o JWT carrega `tid` (tenantId) e `role`.
- Papéis: `platform_admin` (sem empresa; gerencia empresas) e, por empresa, `admin`, `professor`, `aluno`.
- **Isolamento aplicado em toda query** (`where tenantId`) a partir do contexto autenticado — nunca de parâmetro do cliente — e coberto por testes e2e de vazamento entre empresas.
- **S3:** um bucket, prefixo `tenants/{tenantId}/…`. Chaves sempre montadas no servidor.
- Configurações por empresa: `allowedDomains` (domínios do player/CORS/playback) e status `active|suspended` (suspensa não faz login nem toca vídeo).
- Cotas e faturamento por empresa (armazenamento, egress) ficam para o Marco 7.

## Alternativas descartadas
- Schema/banco por empresa: operação e migrations ×4 sem benefício real nesta escala.
- RLS do Postgres: boa defesa em profundidade, mas exige transação com `SET LOCAL` por request; reavaliar no Marco 7.
- Usuário multi-empresa com seletor de contexto: mais UX, mais superfície de vazamento; adiar.

## Consequências
+ Simples de operar e consultar (visão comparativa do operador via `platform_admin`).
− Um bug de escopo vaza dados entre empresas → regra inegociável no `CLAUDE.md` e testes de isolamento obrigatórios em todo módulo novo.
