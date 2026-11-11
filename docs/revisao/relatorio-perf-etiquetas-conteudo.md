# Relatório de performance — Etiquetas + abas de conteúdo da Biblioteca (agente D)

Ambiente de medição: dev local (Next 16, turbopack) apontando para o Supabase remoto. **RTT medido ao banco = ~180 ms por consulta** (select 1 no pooler).
Logo, o custo de uma tela é dominado pelo **número de idas SEQUENCIAIS ao banco**, não pelo SQL (todos os SQLs rodam em 1–16 ms no servidor).
Dev compartilhado com outros 3 agentes compilando: os números têm ruído (+/- 1–2 s em carga fria).

## 1. Antes x depois

| Item | Antes | Depois |
|---|---|---|
| Etiquetas: chamadas de API no load | 4–6 (lista, pág. 2, indicadores…); o componente montava vazio e buscava | **0** de etiquetas (SSR via carregarInicialEtiquetas; cache do cliente semeado) |
| Etiquetas: idas sequenciais ao banco (frio) | 2 (lista; depois totais) + até 4 retentativas de variante de coluna | **1** (CTE única: lista + contagens + em simulados + último uso + totais); variante memorizada |
| Etiquetas: página 2 | pré-buscada no load | só com mouse sobre a paginação ou ocioso >= 2,5 s |
| Etiquetas: detalhe (drawer) | 4 consultas paralelas disputando o pool de 5 | **1** consulta (JSON); o hover já pré-busca no cliente, então abre instantâneo |
| Etiquetas: pronto (warm) | 4,8–13 s (relato) | HTML 0,9–1,1 s com a tabela já no HTML; "pronto" ~4,2 s no lat.mjs = espera do próprio script (networkidle + 1,2 s) + sino/paleta |
| Resumo da Biblioteca (contadores das abas) | **12 consultas** (6 tipos x todos/escondidos) num pool de 5, + 3 PostgREST | **1 consulta** (count FILTER + 3 subselects); fallback em 2 etapas |
| Pastas (base de tudo) | PostgREST chamado por 4 loaders em paralelo = 4 cargas duplicadas em cache frio | SQL, 1 ida, com single-flight (1 carga para todos) |
| Coluna oculto (sondagem) | PostgREST, cache 60 s | information_schema, cache 5 min, single-flight |
| Árvore de pastas | pastas, depois contagens, depois classificação (3 idas em fila) | pastas, contagens e classificação em paralelo + single-flight; cache 30 s mantido |
| Opções de filtros | sem single-flight | single-flight (cache 30 s mantido) |
| Lista de documentos (SQL) | LEFT JOIN versões antes da paginação (hash join de 2,4 mil versões; 16 ms) | pagina primeiro (14 linhas), depois junta (exceto ordenar por páginas) |
| Aba Simulados | N+1: 1 contagem por simulado (14 chamadas) | 1 consulta agrupada |
| API biblioteca (fresh+tree, frio) | n/d | 1,1–1,5 s (inclui ~0,6 s de auth, ver 3.1); quente 0,76–1,0 s |
| API etiquetas lista fria / quente | 0,6–0,9 s | 0,77–1,0 s fria (1 ida) / 0,6 s quente (cache servidor 45 s) |
| API etiquetas detalhe fria / quente | 4 consultas | 0,8–1,0 s / 0,65 s |

**Piso de ~0,6 s em qualquer chamada de API (mesmo 100% cacheada)** = autenticação: getCurrentAccess faz getUser (rede) + super-admin + tenant_acessos,
sem cache entre requisições (~3 RTT). É o maior gargalo restante das interações (alvo < 300 ms). Ver 3.1.

HTML warm medido (ctx.request, caches expirados antes): pdfull 3,4 s frio / 1,1–1,3 s quente; pdflash 7,5 s frio (inclui compilação/HMR de outros agentes) / 1,1–3,3 s quente.
Etiquetas, caches expirados (espera de 32 s): HTML 3,6 s frio / 0,8–1,0 s quente. O "frio" inclui reabrir conexões do pool (ver 3.1.4).

## 2. Arquitetura aplicada (backend-first)

- lib/admin-revisao/questoes-etiquetas.ts: `carregarInicialEtiquetas(tenantId)` (1ª página A-Z, 14/pág + indicadores); `carregarTodas` = 1 SQL; cache servidor 45 s + single-flight; invalidação nas mutações já existente (`limparCacheEtiquetas` no `fim()` da rota POST). Detalhe = 1 SQL JSON.
- questoes-etiquetas.tsx: prop `inicial`; semeia o CACHE do cliente; sem chamada no load; próxima página só em hover/idle.
- biblioteca.ts e biblioteca-gestao.ts: single-flight (`unico`) para pastas/resumo/árvore/opções; resumo em 1 SQL; pastas e classificação por SQL; paginação antes do join; N+1 dos simulados removido.
- page.tsx (agente A) já lê as abas de conteúdo no servidor e já chama `carregarInicialEtiquetas`.
- Migration `supabase/migrations/20261113110000_perf_biblioteca_etiquetas_indices.sql` (idempotente, NÃO aplicada): simulado_prova_questoes(questao_id) e (tenant_id, simulado_id) (hoje só PK, seq scan de 11,5 mil linhas), simulado_questoes(tenant_id) parcial, simulado_questao_etiquetas(tenant_id, etiqueta_id), simulado_simulados(tenant_id, created_at desc, id) parcial. O código funciona sem a migration.
- EXPLAIN (READ ONLY, tenant com 1.063 docs / 5.689 questões): etiquetas 4,7 + 9,3 ms viraram 13,6 ms em 1 ida; docs 15,9 ms; árvore 0,7 ms; opções 1,1 ms; detalhe 3,1 ms. Nenhum SQL passa de 16 ms: o ganho real é cortar idas; os índices são proteção contra crescimento.

## 3. Achados fora do meu escopo (para decisão)

### 3.1 Transversais (maior retorno)
1. getCurrentAccess() sem cache entre requisições (lib/auth/permissions.ts): ~0,5–0,6 s em TODA chamada de API/página admin (dev, RTT 180 ms). Cache em memória por userId+tenantId de 30–60 s para super-admin e papel/permissões (mantendo getUser() validando o token, ou validar o JWT localmente). Esforço baixo; ganho ~0,4 s por interação em todas as telas.
2. NotificationBell busca /api/admin/notificacoes (40 KB, 0,7–2 s) após montar em TODA página admin (components/admin/notification-bell.tsx:45). Contador por SSR (ou consulta leve) e lista só ao abrir o sino; limitar a ~20 itens. Esforço baixo/médio.
3. biblioteca-app.tsx:154 (agente A): o useEffect com a ref `primeira` refaz carregar(st) no 2º disparo do StrictMode (dev), gerando `biblioteca?aba=...&page=1` + prefetch `page=2` no load (visto em pdfull/jurisclub). Trocar por comparação com o estado inicial e fazer o prefetch da pág. 2 só em hover/idle (como em Etiquetas).
4. packages/data/src/sql.ts: Pool com idleTimeoutMillis 30 s e max 5. Após 30 s ocioso cada consulta reabre TCP+TLS+auth (~0,8 s por conexão). Subir idle para 5–10 min (ou min: 1–2) reduz o "primeiro clique do dia" em todas as telas que usam sqlQuery. Esforço baixo.

### 3.2 Auditoria por tela (app/admin/revisao/**)
Todas as page.tsx abaixo são force-dynamic e leem no servidor (SSR). Os problemas são cadeias sequenciais, falta de cache ou carga no cliente depois de montar.

| Prioridade | Tela | Problema | Esforço |
|---|---|---|---|
| Alta | shell (todas) | sino de notificações: fetch cliente de 40 KB em toda página (3.1.2) | Baixo |
| Alta | shell (todas) | auth sem cache: ~3 RTT por request (3.1.1) e pool que fecha em 30 s (3.1.4) | Baixo |
| Alta | cursos/[id] | cadeia de 4 etapas (getCurso, grupos marcados, Promise.all, preview getDadosPreview); grupos/aulas/popups podem sair em paralelo com getCurso | Médio |
| Alta | cronograma | lerRegras, montarCobertura, Promise.all e valoresDoMotor em fila; montarCobertura (agregação) sem cache; sub-abas devem carregar só o que mostram | Médio |
| Média | inicio (dashboard) | cache 120 s ok, mas frio faz ~14 consultas em 3 fases (nomes de grupos/disciplinas/estudantes só depois da fase 1); tempo_estudo com limit(50000) trazido ao JS; usar COUNT DISTINCT em SQL | Médio |
| Média | equipe | N+1 de auth.admin.getUserById (até 40 + 40 em paralelo); perfil sem cache (só o último login tem 5 min) | Baixo (remember 5–10 min) |
| Média | membros | lista SSR ok; a ficha do 1º membro é buscada por API após montar (ficha-painel.tsx:37) | Médio |
| Média | atualizacoes | resumoAtualizacoes aguardado ANTES do Promise.all (fila/opções) | Baixo |
| Média | duvidas | contagensDuvidas antes da lista (sequencial) e sem cache | Baixo |
| Média | relatorios | cache remember ok; frio: 7 blocos em paralelo; fetchAll de avaliações só para média (trocar por AVG em SQL) | Baixo |
| Média | campanhas | apiConfig aguardado depois do Promise.all | Baixo |
| Baixa | biblioteca > flashcards | listarBaralhos: lista, depois contagem de cartões (2 idas); 1 SQL basta (lib/flashcards/baralhos.ts, fora do escopo) | Baixo |
| Baixa | videoteca, jurisclub, grupos, avisos, calendario, simulados, aparencia | SSR com Promise.all e .range()+count; simulados usa remember 120 s. Sem achado relevante | — |

## 4. Pendências
- Aplicar a migration 20261113110000_perf_biblioteca_etiquetas_indices.sql (opcional; protege contra crescimento).
- Itens 3.1.1 a 3.1.4 dependem de arquivos compartilhados/de outros agentes; são os que mais moverão o "pronto".
- Medir em produção (RTT bem menor que os 180 ms do dev): o ganho de "idas" será proporcionalmente menor; o fim das duplicidades continua valendo.
