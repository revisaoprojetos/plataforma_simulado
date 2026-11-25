# Auditoria de lentidão e estabilidade — 25/11/2026

Escopo: banco (Postgres/Supabase, só leitura), aplicação (código) e infraestrutura/latência.
Versão auditada: produção anterior à v4.30.3. Correções entregues na **v4.30.3** (commit `02439151`) estão marcadas com ✅; o que depende de infra ou decisão está marcado com ⏳.

## 1. Resumo

- O banco **não está saturado**: cache hit 99,93%, 26 de 90 conexões, sem lock, sem query longa, uptime 33 dias.
- A lentidão vem de **distância** (app na Alemanha, banco em us-east-1, ~90–100 ms por consulta), de **trabalho repetido** (RPCs e varreduras chamadas em excesso) e de **fragilidade do container** (1 réplica sem limites, Redis de fila e cache juntos).
- O Bad Gateway **ainda não tem causa confirmada**: falta a saída de `docker service ps/logs` do web.

## 2. Infraestrutura e latência (medido do Brasil)

| Item | Medida |
|---|---|
| VPS | Hetzner, Falkenstein (Alemanha), RTT ~220 ms |
| `/api/health` | 690–735 ms total (app responde em ~220 ms, praticamente sem CPU) |
| `/login` | TTFB 720–900 ms, total 1,16–1,35 s |
| Arquivo estático (`/_next/static`) | ~0,9 s cada, sem CDN |
| Banco | `aws-1-us-east-1` (Virgínia); estimado ~90–100 ms por consulta a partir da VPS (não medido de dentro) |

| Sev. | Achado | Situação |
|---|---|---|
| Crítico | Web com 1 réplica e sem limites de CPU/memória: OOM ou loop de CPU derruba o container, o healthcheck falha e o Swarm reinicia (Bad Gateway) | ✅ 2 réplicas, limite 2G, `--max-old-space-size=1536` (falta deploy) |
| Crítico | App (Alemanha) e banco (EUA) distantes; `proxy.ts` chama `getUser()` em toda requisição | ⏳ mover app ou banco para a mesma região; trocar por validação local do JWT só depois de atualizar `@supabase/ssr` e testar o loop de login |
| Alto | Redis único (256 MB, `allkeys-lru`) para cache e BullMQ: pode descartar jobs de PDF/re-correção/importação | ✅ `redis-filas` com `noeviction` (falta deploy com fila vazia) |
| Alto | worker, api e gotenberg (Chromium) sem limite de recursos no mesmo nó do web | ✅ limites adicionados |
| Alto | Traefik sem timeouts definidos no compose; rotas de até 300 s e uploads de 120 MB podem dar 502/504 | ⏳ conferir `traefik.yml` na VPS |
| Médio | Sem CDN: 22 MB de estáticos saem da Alemanha | ⏳ Cloudflare na frente |
| Médio | Cache de `/_next/image` some a cada redeploy; Chromium dentro da imagem do web | ⏳ |
| Médio | Header `X-Powered-By` ainda aparece apesar de `poweredByHeader:false` (imagem em produção diferente do config) | confirmar versão em produção |

## 3. Aplicação (código)

| Sev. | Achado | Situação |
|---|---|---|
| Alto | Agendador de crons do worker sem guarda de sobreposição nem timeout; ~13 rotas pesadas sem lock | ✅ `emVoo` + `AbortSignal`; lock em Redis (`lib/cron/lock.ts`); lock ocupado → 200 `{skipped:true}`; sem Redis roda normalmente |
| Alto | Relatórios carregam respostas inteiras; `fetchAllByIn` de sessões sem `.order` único | ✅ `.order('id')`; checagem de uso de questão sem baixar tudo |
| Médio | `/aluno/cronograma` com 3 consultas independentes em série | ✅ `Promise.all` |
| Médio | Contagem de membros de grupo lendo todas as filiações em JS | ✅ RPC `simulado_grupos_contagem` com fallback |
| Médio | `fetch` externo sem timeout (PDFs, OnlyOffice, Guru, paginas-sync) | ✅ 15–30 s |
| Médio | Varreduras do tenant inteiro de `simulado_leitura_respostas` (engajamento-leitura, relatório) | ⏳ ranking já usa RPC; relatório precisa das linhas cruas; engajamento exige replicar "aula completa" em SQL |
| Baixo | Polling dentro do aceitável; bundle sem import pesado óbvio | — |

Efeito colateral aceito: o badge "N resposta(s)" em questões passou a mostrar 0 ou 1.

## 4. Banco de dados

PostgreSQL 17.6, 8,9 GB, `shared_buffers` 512 MB, `work_mem` 5 MB, `max_connections` 90, `statement_timeout`: authenticated 8 s, anon 3 s. RLS ligado nas 359 tabelas. `pg_cron` não instalado (os crons rodam no app). `pg_stat_statements` zerado em 23/10 (números cobrem 33 dias).

| Sev. | Achado | Situação |
|---|---|---|
| Crítico | `cron_adapt_espelhar_grade`: 7.795 chamadas, 575 ms de média, 4.483 s totais, sobre `plano_meta` (1,53 M linhas, 1,39 GB) | ✅ saves seguidos do mesmo plano agrupados (o hash já evitava regravar) |
| Crítico | `rpc_xp_dia`: 248 mil chamadas, 1.123 s | ✅ cache 60 s no resumo; `verificarMetaDiaria` pula a RPC depois que a meta do dia foi atingida |
| Crítico | Seq scans: `simulado_estudantes` 1,5 M scans/38,9 bi tuplas; `simulado_alternativas` 868 mil; origem principal = import Curseduca (4 buscas por import) | os índices de 20261202 existem e estão em uso; histórico é anterior a eles. Observar após ANALYZE; suspeito: `ORDER BY id LIMIT` levando o planner à pkey |
| Alto | Migrações pendentes (objetos ausentes): `20261105020000`, `20261110010000`, `20261112010000`, `20261120010000`, `20261124000000`, `20261125020000`, `20261203000000` | ⏳ aplicar na ordem (a `20261124` só por psql/CLI) |
| Alto | `simulado_audit_logs` 1,28 GB, +24,5 mil linhas/dia, sem retenção; listagem faz seq scan de 6 s | ✅ função de purga criada (não agendada); índices na `20261124` |
| Alto | `simulado_conteudo_versoes`: 3,3 GB de TOAST (`html_rico`, `previa_dados`) | ⏳ mover para storage/comprimir e podar versões |
| Médio | Outbox de conteúdo: 11.515 eventos `documento.atualizado` sem processar desde 19/10; nenhum cron chama `/api/conteudo/outbox/processar` | ⏳ agendar no worker e só depois limpar |
| Médio | `simulado_integracao_eventos`: regex em `payload` sem índice (593 ms de média, 2.136 chamadas) | ⏳ índice de expressão |
| Médio | Spill em disco (work_mem 5 MB) em estatísticas e `meta_def_analise` | ⏳ avaliar work_mem |
| Médio | Índice duplicado `idx_cron_adapt_pm_plano_meta` (108 MB); índices não usados (`idx_cron_adapt_pm_aluno_data` 71 MB etc.) | ✅ duplicado removido na `20261204000100`; demais ⏳ |
| Médio | FKs sem índice (trechos uid/pai_uid, grifos_pdf, notebook_paginas, leitura_anotacoes) | ✅ índices na `20261204000100` |
| Médio | Autovacuum: matrículas e favoritos nunca passaram; trechos com 9% de dead tuples | ✅ scale_factor menor na `20261204000100` |
| Médio | `webhook_inbox` 223 MB e `integracao_eventos` 97 MB sem retenção | ✅ funções de purga (não agendadas); `xp_eventos` é ledger imutável e não deve ser podado |
| Baixo | ~15 tabelas `*_bk` sem PK; ~26 tabelas com RLS e zero policies (várias são `_bk`) | ⏳ revisar e exportar/dropar |

## 5. Documentos que "não atualizam" (caso do art. 7º da CF)

- Documento: "Constituição Federal Destacada" (versão 2). O banco mostra o art. 7º já atualizado (XIII em 40 h, §1º, §2º, §3º) e os saves de 25/11 (13:49 e 13:52, Brasília) chegaram.
- Os saves de 19/11 (09:12) aparecem no histórico do editor mas **não têm evento no log** do documento: possivelmente não chegaram ao servidor (hipótese não provada).
- O sistema sobrescreve a mesma versão a cada save e não guarda o que mudou, por isso o histórico só diz "atualizado".
- ✅ v4.30.3: ao salvar, `html_rico` e o cache do leitor são refeitos; conversão vazia não publica.
- ⏳ Falta registrar um diff por salvamento ("Art. 7º, XIII alterado") e mostrá-lo no histórico.

## 6. Aluno verificado (Lei Seca)

Thiago Nogueira Nobre (thiagonobre95@yahoo.com.br), cadastro único. Módulo Lei Seca "Constituição Federal": 30 de 30 aulas com leitura e quiz 10/10, 300 XP, atividade de 21/09 a 23/10, sem evento perdido. Pendências: sequência atual 0 (maior 3, sem atividade desde 28/10) e, no JurisClub, "Administrativo 2026" com leitura não concluída e 2 de 10 questões respondidas. Não há desafio configurado; usou-se o módulo com atividade como referência.

## 7. O que falta para fechar o diagnóstico do Bad Gateway

Rodar na VPS e enviar a saída:

```
nproc; free -m; df -h; docker node ls
docker service ps plataforma_simulado_web --no-trunc | head -30
docker stats --no-stream
docker service logs plataforma_simulado_web --since 2h 2>&1 | grep -iE "heap|OOM|ECONNRESET|timeout|SIGTERM" | tail -50
dmesg -T | grep -iE "killed process|out of memory" | tail
docker exec $(docker ps -qf name=plataforma_simulado_redis) redis-cli info stats | grep evicted_keys
docker service logs <traefik> --since 2h | grep -E " 50[234] "
```

## 8. Ordem para aplicar a v4.30.3

1. Migrações (fora do pico): as 7 pendentes na ordem; `20261124000000` só por psql/CLI; depois `20261204000000_contagem_grupos` e `20261204000100_manutencao_retencao_indices`.
2. Stack no Portainer com a fila de PDF/re-correção vazia (sobe `redis-filas` e 2 réplicas); conferir folga de memória do nó (web reserva 1G e pode chegar a 4G).
3. Imagens de web e worker para o SHA `02439151b3691cdd423c135eda42678afccf8fe1`. Rollback do web: `:latest`.
4. Depois: `/api/health`, login admin, `/aluno/cronograma`, salvar documento e conferir no leitor, Logs Explorer do Supabase (ERROR por mensagem) em 1–2 h.
