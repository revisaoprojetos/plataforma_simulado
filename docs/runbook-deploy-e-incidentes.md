# Runbook — Deploy, Projetos Supabase e Incidentes

> Guia operacional para reduzir a fragilidade que apareceu no incidente de egress (deploy por SHA
> errado → 404; confusão de projeto/ref; sem passo-a-passo de incidente). Consultar SEMPRE.

---

## 1. Mapa de projetos Supabase (nome × ref × ambiente)

> ⚠️ Os **nomes na cobrança do Supabase estão TROCADOS** vs os refs. Guie-se pelo REF.

| Ref (project id) | Nome na cobrança | Papel | Observação |
|---|---|---|---|
| `twdrtlxkjvunkdobudev` | "app-simulado" | **PRODUÇÃO REAL** (o que o código usa) | é o de ~1211 GB de egress |
| `tlaxvhcqswiotzibulyo` | "revisao" | Antigo / ocioso | ~4,7 GB; sondagem deu "fetch failed" (pausado) → **pausar/arquivar** |
| (mentoria) | "app-mentoria" | App do dev sênior (SPA) | ~3 GB; outro produto |

- O `.env.local` (dev) aponta para `twdrtlxkjvunkdobudev`.
- **Regra:** só **1 projeto** por ambiente deve receber tráfego. Confirmar que produção usa `twdrtlxkjvunkdobudev` e o `tlaxv` está pausado.

---

## 2. Runbook de DEPLOY (prod = Docker Swarm / Portainer / Traefik)

Serviço vivo: **`plataforma_simulado_web`** (+ `plataforma_simulado_worker`). Imagem: `ghcr.io/revisaoprojetos/plataforma_simulado:<SHA>`.

**Passo a passo:**
1. Commit/push na branch. **Aguardar o Actions "Build e Push para GHCR" ficar VERDE** (a imagem só existe depois disso).
2. Pegar o **SHA COMPLETO (40 caracteres)**:
   ```bash
   git rev-parse HEAD
   ```
   > ❗ **Nunca usar o SHA curto (7–8 chars)** — o CI tagueia com `${GITHUB_SHA}` (40 chars). Tag curta = imagem inexistente → container não sobe → **Traefik responde "404 page not found"**.
3. No Portainer → serviço `plataforma_simulado_web` → **Update the service** → campo **Image**:
   ```
   ghcr.io/revisaoprojetos/plataforma_simulado:<SHA_COMPLETO>
   ```
   (e `...-worker:<SHA_COMPLETO>` no `plataforma_simulado_worker` se o worker mudou).
   - ⚠️ Trocar o **campo Image**, NÃO o label `com.docker.stack.image`.
4. Aguardar ~1–2 min e validar: `https://simulado.revisaopge.com.br` (login do aluno + embed Curseduca).

**LANDMINE `:latest`:** `:latest` só é buildado na **main**. Rodando da branch, apontar para `:latest` = **rollback** para versão velha. Deployar SEMPRE por `<SHA>` enquanto estiver na branch.

**Rollback:** repetir o passo 3 com o SHA anterior que funcionava.

**Migrações:** são passo **manual** no banco (twdr) — conferir se a feature exige migração antes de ligar.

---

## 3. Runbook de INCIDENTE — "alunos com erro / Plataforma não encontrada / 500"

**Sintomas:** login mostra "Plataforma não encontrada"; embed dá "server error"/500; acontece para todos.

**Diagnóstico rápido (nesta ordem):**
1. **Supabase bloqueado por egress?** (causa nº1) — abrir o dashboard do projeto `twdrtlxkjvunkdobudev`. Se houver faixa "Services restricted / Egress Exceeded (402)":
   - **Correção imediata:** Organization → Billing → **Disable spend cap** → restrição cai em segundos.
   - Confirmar rodando uma query simples com service_role (deve responder, sem "restricted").
2. **Deploy quebrado?** — se o site dá "404 page not found" (Traefik): a imagem apontada não existe/não subiu. Ver §2 (SHA completo, Actions verde) ou rollback.
3. **Tenant não resolve?** — checar `simulado_tenants`: o `dominio`/`slug` batem com o host? (Ver `lib/tenant.ts`.) Só relevante se #1 e #2 estiverem OK.

**Pós-restauração (evitar reincidência):** executar A0/A1 do plano de egress (`docs/auditoria-egress-e-otimizacao.md`): medir egress por tipo e ligar o SQL agregado.

---

## 4. Runbook — EGRESS estourando (prevenção)

- **Monitorar:** Supabase → Reports/Usage → Egress (semanal). Definir orçamento (ex.: alertar em 60% da cota).
- **Se subir rápido:** ver o log da aplicação por `[egress] leitura grande` (instrumentação em `lib/supabase/fetch-all.ts`) e o breakdown por tipo (Database × Storage) no painel.
- **Guardrail de código:** `pnpm --filter web run lint:egress` (relatório) / `lint:egress:ratchet` (CI). Baseline em `apps/web/scripts/.egress-baseline.json`.
- **Envs críticas (cortam o maior egress):** `DATABASE_URL` (pooler 6543 `?pgbouncer=true`), `REPORT_SQL=on`, `REDIS_URL` — nos serviços `web` e `worker`.

---

## 5. Contatos / referências
- Plano de egress detalhado: `docs/auditoria-egress-e-otimizacao.md`.
- Fluxo git/branches: `docs/FLUXO-GIT-BRANCHES.md`.
