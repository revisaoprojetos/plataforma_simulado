# Inventário de Páginas + Estratégia de Paginação e Carregamento em Background

> Base para reduzir o egress do **SSR re-consultando a cada navegação** (T13) e padronizar
> **paginação** (ler menos linhas) e **carregamento em background** (streaming + cache).
> **144 páginas** no App Router (`apps/web/app`). Atualizado: 2026-09-25.

---

## 1. Objetivo (o fundamento)

O SSR do Next re-executa as queries **a cada navegação**. Três frentes cortam esse custo:
1. **Paginação** — listar 10–20 linhas por vez (`.range()` + `count`), nunca `fetchAll` de tabela grande para renderizar lista. *Reduz bytes lidos.*
2. **Cache** — resultado da query servido do Redis (`remember`) ou `unstable_cache` entre navegações/usuários. *Reduz nº de leituras.*
3. **Carregamento em background** — a página renderiza o **shell na hora** e os blocos pesados **streamam** via `<Suspense>`; no cliente, `react-query` mantém cache e revalida em background. *Melhora percepção + habilita cache; não bloqueia a navegação.*

> Já existe no código: `PaginationControls`, padrão `carregarLote(offset, limit)`+`total`, e `remember()` (cache Redis). O trabalho é **aplicar onde falta** e **padronizar**.

---

## 2. Legenda de classificação
- **LISTA** → precisa de paginação (server-side `.range`+`count`).
- **DASHBOARD/RELATÓRIO** → precisa de cache (`remember`) + SQL agregado; carregar em background (Suspense).
- **DETALHE/FORM** → 1 registro; ok, mas projetar colunas.
- **RUNNER/PROVA** → fluxo especial (auto-save); não é lista.
- **PRINT** → server on-demand (Puppeteer); ok.
- **WIZARD/CONFIG/AÇÃO** → estado de formulário; leituras pequenas.

Flags detectadas por varredura: `fetchAll` (varre tabela), `PAGINADO` (já pagina), `CACHE` (usa remember), `SUSPENSE`.

---

## 3. 🔴 Prioridade — páginas com `fetchAll` SEM paginação (over-fetch)
> Alvos concretos para converter (paginação e/ou cache + background). Detalhe por página no §6.

| Rota | Classe | Ação |
|---|---|---|
| `/aluno/(portal)` (home do aluno) | DASHBOARD | cache + Suspense; projetar; paginar listas internas |
| `/admin` (dashboard) | DASHBOARD | cache (remember) + Suspense; SQL agregado |
| `/admin/simulados` | LISTA(board) | já tem CACHE; avaliar paginar pastas grandes |
| `/admin/grupos`, `/admin/grupos/[id]` | LISTA/DETALHE | paginar membros; projetar |
| `/admin/estudantes/[id]` | DETALHE | projetar; paginar histórico de sessões |
| `/admin/questoes/[id]/editar`, `/admin/questoes/nova` | FORM | projetar (não `select('*')`); taxonomia via cache |
| `/admin/banco-questoes/[id]`, `/[id]/adicionar-estudantes` | LISTA | paginar questões/estudantes |
| `/admin/correcao`, `/correcao/simulado/[id]`, `/aluno/[id]` | LISTA/DETALHE | paginar fila; projetar |
| `/admin/relatorios/disciplinas`, `/relatorios/nps` | RELATÓRIO | SQL agregado + cache |
| `/admin/simulados/[id]` | DETALHE(abas) | Suspense por aba; paginar por aba (questões/estudantes/sessões) |

---

## 4. Estratégia de PAGINAÇÃO (padrão único)
Para toda **LISTA**:
- Server action `carregarLote(offset, limit, filtros)` → `{ rows, total }` usando `.range(offset, offset+limit-1)` + `count: 'exact'` e **projeção de colunas** (nunca `select('*')`).
- 1ª página no server (rápido) + `PaginationControls`/"carregar mais" no cliente (sob demanda).
- Filtros/busca **no banco** (`.ilike`/`.eq`), não no cliente após `fetchAll`.
- Modelo já pronto: `app/admin/estudantes` (POR_PAGINA + `carregarLoteEstudantes` + KPIs cacheados).

## 5. Estratégia de CARREGAMENTO EM BACKGROUND
1. **Server (RSC) — streaming com `<Suspense>`:** o layout/shell renderiza imediatamente; cada bloco pesado (KPIs, gráficos, listas) vira um componente async dentro de `<Suspense fallback={<Skeleton/>}>`. A navegação não trava esperando o banco. Modelo: `/admin/simulados` (já usa Suspense).
2. **Cache do resultado (reduz egress):** envolver a query pesada em `remember(chave, ttl, fn)` (Redis) ou `unstable_cache` — a próxima navegação/usuário serve do cache. Invalidar por evento (finalizar sessão, editar, import) como já faz `invalidarRelatoriosSimulado`.
3. **Cliente — `react-query`:** telas client-side (filtros, "carregar mais", painéis ao vivo) usam `useQuery` com `staleTime` + `refetchOnWindowFocus:false` → navega e volta sem re-buscar; revalida em background. (Padrão do `app-mentoria`.)
4. **Resolução de tenant/tema** cacheada (TTL curto) — hoje roda por request.

> Importante: **background/streaming melhora UX**; o que **reduz egress** é **paginação + cache**. Fazer os três juntos.

---

## 6. Inventário completo (144 páginas) por área

### ADMIN (94)
LISTA (paginar): `/admin/estudantes`✅pag · `/admin/questoes`✅pag · `/admin/grupos` · `/admin/matriculas` · `/admin/comentarios` · `/admin/feedbacks` · `/admin/etiquetas` · `/admin/banco-questoes` · `/admin/banco-questoes/[id]` · `/admin/cadernos-teste` · `/admin/administradores` · `/admin/api-keys` · `/admin/tenants` · `/admin/lixeira` · `/admin/auditoria` · `/admin/leitura` · `/admin/modelos-caderno` · `/admin/cronogramas` (+ `/conteudos`,`/conteudo`,`/metas`,`/tipos`,`/pacotes`,`/links`,`/relatorios`) · `/admin/impersonation`.
DASHBOARD/RELATÓRIO (cache+SQL+Suspense): `/admin` · `/admin/relatorios` (+ `/estudantes`,`/simulados`,`/ranking`,`/graficos`,`/disciplinas`,`/nps`) · `/admin/gamificacao` (+ `/publico`) · `/admin/leitura/analise`.
DETALHE/FORM (projetar): `/admin/simulados/[id]` (abas→Suspense) · `/admin/estudantes/[id]` (+ `/gabarito/[sessao]`,`/simulado/[simuladoId]`) · `/admin/questoes/[id]/editar` · `/admin/questoes/nova` · `/admin/grupos/[id]` · `/admin/cadernos-teste/[id]` · `/admin/modelos-caderno/[id]` · `/admin/cronogramas/[id]` · `/admin/cronogramas/conteudos/[id]` · `/admin/cronogramas/pacotes/[id]` · `/admin/rbac` (+`/[id]`) · `/admin/administradores/permissoes` (+`/[id]`) · `/admin/integracoes` (+`/[provider]`) · `/admin/leitura/[id]` (+`/questoes`,`/alteracoes`,`/trilha/[pasta]`) · `/admin/correcao` (+`/sessao/[id]`,`/simulado/[id]`,`/aluno/[id]`) · `/admin/banco-questoes/[id]/adicionar` (+`/adicionar-estudantes`,`/hud`) · `/admin/simulados/[id]/embed`.
WIZARD/CONFIG/AÇÃO: `/admin/simulados/criar/*` (personalizar/questoes/cadernos/estudantes/regras/salvar) · `/admin/simulados/novo` · `/admin/configuracoes` (+`/banners`,`/mensagens`) · `/admin/entrada` · `/admin/curseduca` (+`/credenciais`,`/sincronizacao`) · `/admin/conexoes/webhooks` · `/admin/compartilhar` · `/admin/lgpd` · `/admin/sistema` · `/admin/ajuda` · `/admin/transcricao` · `/admin/impersonation/config` · `/admin/cronogramas/criar` · `/admin/cronogramas/importar` · `/admin/matriculas/nova` · `/admin/estudantes/novo`.
AO VIVO (SSE, já pausado em hidden): `/admin/simulados/[id]/ao-vivo` · `/admin/simulados/[id]/hud`.

### ALUNO (28)
DASHBOARD: `/aluno/(portal)` (home) · `/aluno/(portal)/desempenho` · `/aluno/(portal)/ligas` · `/aluno/(portal)/recomendado`.
LISTA (paginar): `/aluno/(portal)/questoes`✅pag · `/aluno/(portal)/simulados` · `/aluno/(portal)/favoritos` · `/aluno/(portal)/cadernos` · `/aluno/(portal)/notificacoes` · `/aluno/(portal)/cronograma/meus`.
DETALHE/RUNNER: `/aluno/(portal)/simulado` · `/aluno/(portal)/simulados/[id]` · `/simulados/personalizados/[id]` (+`/fazer`,`/caderno`,`/resultado`,`/novo`) · `/aluno/(portal)/leitura` (+`/[id]`,`/[id]/questoes`) · `/aluno/(portal)/trilha` · `/aluno/(portal)/cronograma` (+`/[emissaoId]`,`/resolver/[metaId]`) · `/aluno/(portal)/cadernos/[id]` · `/aluno/(portal)/perfil` · `/aluno/(portal)/ajuda`.
AUTH: `/aluno/entrar` · `/aluno/login`.

### SUPER (9)
`/super` (dashboard) · `/super/plataformas` (LISTA) · `/super/plataformas/[id]` (+`/rbac`) · `/super/armazenamento` (+`/[bucket]/[categoria]`) · `/super/entrada` · `/super/compartilhar` · `/super/sistema`.

### PROVA / EMBED / PRINT / OUTROS (13)
RUNNER: `/simulado/[token]` · `/embed/simulado/[token]`.
PRINT (on-demand, ok): `/imprimir/caderno-teste/[id]` · `/imprimir/cronograma/[emissaoId]` · `/imprimir/modelo/[id]` · `/imprimir/ranking/[simulado]` · `/imprimir/relatorio/[tipo]/[ref]` · `/imprimir/resultado/[st]`.
OUTROS: `/` (root) · `/login` · `/lgpd/consentimento`.

---

## 7. Backlog priorizado (execução)
**Onda 1 (maior egress, já com `fetchAll` sem paginação):**
1. `/admin/relatorios/disciplinas` e `/nps` → SQL agregado + cache (T1).
2. `/admin` e `/aluno/(portal)` (dashboards) → cache + Suspense + projeção.
3. `/admin/grupos`, `/admin/grupos/[id]`, `/admin/banco-questoes/[id]/adicionar-estudantes` → paginar.
4. `/admin/questoes/[id]/editar`, `/admin/questoes/nova` → projetar (fim do `select('*')`, casa com T2).
5. `/admin/estudantes/[id]`, `/admin/correcao/*` → paginar histórico/fila + projetar.

**Onda 2 (padronização):** aplicar o padrão de paginação nas demais LISTA que hoje trazem tudo; envolver dashboards/relatórios em `<Suspense>` + `remember`.

**Onda 3 (cliente):** migrar painéis client-side para `react-query` (cache + background) — telas de filtro/carregar-mais/ao-vivo.

**Shared a criar/reusar:**
- `lib/paginacao.ts` — helper `carregarLote(tabela, { offset, limit, cols, filtros, order })` → `{rows,total}` (padroniza `.range`+`count`+projeção).
- Wrapper de cache já existe (`remember`); documentar chave/invalidções por área.
- `<SecaoAssincrona>` — componente `<Suspense>` + Skeleton padrão para blocos de dashboard.

---

## 8. Métrica de sucesso
- Nenhuma LISTA usando `fetchAll` para renderizar (guardrail evolui para pegar isso).
- Dashboards/relatórios servindo do cache na 2ª navegação (log `[sql] agregado ATIVO` + hit de `remember`).
- Navegação não bloqueia (shell instantâneo + Suspense).
- Egress por navegação cai (medir via A0 + log `[egress] leitura grande` sem disparos indevidos).
