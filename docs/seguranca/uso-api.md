# Rastreio de uso da API (API keys)

- Migration: `supabase/migrations/20261121110000_api_uso_log.sql` (aplicar manualmente). Cria `simulado_api_uso`, RPC `api_uso_resumo(p_tenant, p_dias)` e `simulado_api_uso_purgar(dias)`. RLS ligado, sem grants a anon/authenticated (só service role).
- Registro: `lib/api-v1/uso.ts` (`medirApi`) envolve `handler()` de `lib/api-v1/index.ts` (todas as rotas `/api/v1/**` autenticadas) e `/api/v1/whoami`. Grava via `after()`, best-effort; sem a tabela, pausa 10 min e nada quebra. A resposta ganha o header `x-request-id`.
- O que grava: tenant, chave (id), recurso (rota com uuid -> `{id}`), método, rota (sem query), status, ms, IP, UA, `barrado_limite` (429), erro curto, request_id. Chave inexistente: `api_key_id` nulo + só o prefixo de 8 chars. NUNCA a chave, Authorization, query ou payload.
- "Erros" = status >= 400 que não foi barrado por limite (barradas contam à parte). p50/p95 via `percentile_cont`.
- UI: `/admin/api-keys?aba=uso&dias=7|30|90` (permissão `api_keys:manage`). Sugestões geradas no servidor (`gerarSugestoes`): p95 > 2000 ms com >= 10 chamadas; erro > 5%; barradas > 0; chave sem uso há 30d+; chave revogada com tentativas.
- Retenção: `/api/cron/api-uso-purge` (CRON_SECRET), agendado 1x/dia no worker; `API_USO_RETENCAO_DIAS` (default 180, mín. 30).
- Limitações: chamadas com chave totalmente desconhecida não têm tenant (não aparecem na UI do tenant); `GET /api/v1` (índice público sem auth) não é rastreado; nenhum outro endpoint usa `validarApiKey` hoje.
