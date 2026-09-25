<!-- Descreva o que muda e por quê. -->

## O que muda


## Checklist de EGRESS (Supabase) — obrigatório
> Egress = dados lidos da API + downloads do Storage. Foi o que derrubou a produção (ver `docs/auditoria-egress-e-otimizacao.md`).

- [ ] Nenhum `.select('*')` novo — projeto só as colunas usadas.
- [ ] Nenhuma leitura de tabela grande sem filtro de tenant/escopo + paginação (`fetchAll`/`.range` real; nada de `.range(0, 9999)`).
- [ ] Relatório/agregação novo usa o **caminho SQL agregado** (não varre respostas/sessões via PostgREST).
- [ ] Todo `setInterval`/polling de rede **pausa em `document.hidden`** e tem intervalo razoável.
- [ ] Cron novo no worker com intervalo ≥ 60s (idealmente com early-exit).
- [ ] Upload de arquivo define `cacheControl` (imutável = `31536000`).
- [ ] Sem Supabase Realtime sem justificativa.
- [ ] `pnpm --filter web run lint:egress:ratchet` passou (não aumentou a dívida).

## Testes
- [ ] `tsc` + `build` ok
- [ ] Testado manualmente:
