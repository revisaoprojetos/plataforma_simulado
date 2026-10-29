# Arquitetura Backend-First — Performance & Egress

> Padrão de engenharia da plataforma. **Obrigatório** para toda área nova e toda edição de área
> existente. Objetivo: eliminar lentidão de carregamento e consumo excessivo do banco (egress),
> movendo **toda operação para o backend** — a página só **lê dado pronto**.

## 1. Princípio central

**Nenhum cálculo no render.** Um `page.tsx` / Server Component faz **uma leitura de dado já pronto**
e renderiza. Nenhum loop, nenhuma árvore percorrida, nenhuma grade remontada, nenhum `fetchAll`
seguido de agregação em memória dentro do request da página.

Toda derivação vive numa **camada de serviço** (`lib/<area>/`) que é **cacheada** e/ou
**precomputada** (snapshot), e mantida fresca por **escrita (write-behind)** e **worker (cron)**.

## 2. As camadas (separação obrigatória)

| Camada | Arquivo | Responsabilidade | O que NÃO faz |
|---|---|---|---|
| **Serviço** | `lib/<area>/dados.ts` (+ `snapshot.ts`, `tipos.ts`) | Computa (1x), cacheia, lê/grava snapshot. É o ÚNICO lugar que acessa o banco pesado. | — |
| **Página** | `app/.../page.tsx` | 1 leitura de dado PRONTO + render. | Nenhuma query pesada, nenhum loop/agregação. |
| **Mutação** | `actions.ts` ('use server') | Grava + **invalida/atualiza** o snapshot/cache afetado. | Deixar a página recomputar. |
| **Pré-aquecimento** | `app/api/cron/<area>/route.ts` (CRON_SECRET) | Chamado pelo worker: pré-computa/rola snapshots de quem importa. | Varrer TODO o banco. |

## 3. Cache read-through (`remember`) — mínimo obrigatório

Todo loader caro é embrulhado em `remember(chave, ttlSeg, calcular)` (Redis, `lib/cache/relatorio-cache`).

```ts
export const carregarX = (tenantId: string, alunoId: string) =>
  remember(`x:${tenantId}:${alunoId}:${hojeISO()}`, 120, () => computarX(tenantId, alunoId))
```

- **Chave** inclui todas as dimensões (tenant, aluno, **dia** quando o dado depende da data → rola sozinho à meia-noite).
- **TTL por natureza:** dado de **tenant** (igual p/ todos) = TTL longo (120s–1h); **por-aluno** = TTL curto (15–120s); dado que **muda na escrita** = invalidar na mutação.
- Serve do cache enquanto não expira → a 1ª carga computa 1x, as demais são instantâneas.

## 4. Snapshot precomputado (dashboards pesados)

Para Painel, Início, Perfil, Ranking, Análise (compute caro + acesso frequente): **tabela de snapshot**.

- `simulado_<area>_snapshot (tenant_id, estudante_id?, dia date?, dados jsonb, atualizado_em, unique(...))`.
- **Read-through:** a página lê 1 linha. Se não existe ou `dia != hoje` → computa 1x, grava, devolve.
- **Write-behind:** toda mutação relevante (marcar meta, abrir material, gerar cronograma, ganhar XP…)
  **atualiza** o snapshot — a próxima leitura já vem pronta, sem recomputar no render.
- **Roll no worker:** cron diário recomputa snapshots `dia < hoje` **de alunos ativos recentemente**
  (bounded) → velocidade também na 1ª carga do dia, sem o usuário pagar o custo.

Snapshot = velocidade na 1ª carga + resiliência (não depende do Redis estar quente). Redis `remember`
complementa para leituras repetidas e dados de tenant.

## 5. Egress — regras duras (não-negociáveis)

1. **Projeção mínima:** `.select('col1, col2')` só do que a UI usa. Nunca `select('*')` em tabela larga, nunca `html_rico`/jsonb grande sem precisar.
2. **Agregar no banco:** `count:'exact', head:true` para contagens; **SQL agregado** (via `DATABASE_URL`/`REPORT_SQL`) para somas/rankings. **Nunca** `fetchAll` + `reduce` quando o banco agrega.
3. **Paginar no banco:** `.range(de, ate)` + `count`. Nunca trazer tudo e paginar em memória.
4. **`.in()` com chunk:** `fetchAllByIn(ids, build, {chunk:80})` com `.order()` por coluna ÚNICA (id). `.in()` cru com lista grande pendura o proxy.
5. **Cache de dado de tenant** (banners, tema, gratuitos, catálogo): `remember` por tenant — 1 leitura por janela em vez de N (nº de alunos).
6. **Gating por atividade no warm/roll:** só pré-computar alunos/tenants/simulados com atividade recente ou janela abrindo. Recomputar o que ninguém abre = egress puro.
7. **Sem CDN (VPS único):** cache no servidor é essencial; thumbs/arquivos via URL assinada cacheada, nunca base64 na resposta.

## 6. Invalidação (consistência)

Toda escrita que muda um dado derivado **invalida ou atualiza** o snapshot/cache:
`invalidarRelatorios(tenant)`, `invalidar<Area>(aluno)` ou `atualizar<Area>Snapshot(...)`.
A UI usa `router.refresh()` após a ação → lê o snapshot já atualizado.

## 7. Observabilidade / infra

- **Obrigatório em prod:** `DATABASE_URL` (SQL agregado), `REDIS_URL` (cache), `REPORT_SQL`, `CRON_SECRET`, `WEB_INTERNAL_URL`.
- `egress-monitor` (cron 6h) alerta se o SQL agregado cair ou o Redis sumir.
- Logar `[relatorio lento]`/cache-miss para caçar loaders que escaparam do padrão.

## 8. Checklist de PR (toda área nova/editada)

- [ ] A página só **lê** (sem loop/agregação/fetchAll no render)?
- [ ] Loader caro em `remember` com chave e TTL corretos?
- [ ] Dashboard pesado tem **snapshot** (read-through + write-behind + roll no worker)?
- [ ] Projeção mínima, agregação/contagem no banco, paginação no banco, `.in()` com chunk?
- [ ] Mutação **invalida/atualiza** o cache/snapshot?
- [ ] Warm/roll cron cobre as chaves novas, **gated por atividade**?
- [ ] `tsc` 0; sem `select('*')`; sem dado de exemplo apresentado como real.

## 9. Roadmap de execução

- **Fase 0 — Template (Painel):** `simulado_painel_snapshot` + `lib/painel/snapshot.ts` (read-through + write-behind) + cron `painel-roll` no worker. Prova do padrão.
- **Fase 1 — Áreas /nova:** converter Início, Painel, Cursos, Desempenho, Comunidade, Dúvidas, Novidades etc. ao padrão (remember + snapshot onde pesado).
- **Fase 2 — Legado com latência conhecida:** Ranking, Análise, Board, Perfil — reforçar snapshot/SQL agregado.
- **Fase 3 — Cobertura:** warm/roll crons + egress-monitor cobrindo todas as chaves novas.
