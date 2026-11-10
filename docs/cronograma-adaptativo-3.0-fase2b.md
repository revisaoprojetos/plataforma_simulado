# Cronograma Adaptativo - Fase 2B (servidor, banco e admin) - log

Motor (Fase 1) intocado; iframe (Fase 2A) intocado. Nenhum texto visivel contem a numeracao interna do motor. Nada commitado/aplicado.

## Migracao a APLICAR (manual, SQL Editor)
`supabase/migrations/20261110020000_cronograma_adaptativo_detalhes_meta.sql` (aditiva, idempotente, apos 20261110010000):
- `simulado_cronograma_adaptativo_plano.detalhes_metas jsonb NOT NULL DEFAULT '{}'` (mapa { meta_id: detalhe } do plano; fonte lida pelo motor).
- `..._plano_meta.detalhes jsonb` + `semana_origem integer` (promovida; indice parcial; backfill a partir do meta_id).
- `..._meta.concluido_em date` + `cert integer` (CHECK >= 0, NOT VALID); backfill de concluido_em das concluidas (dia de atualizado_em).
- `cron_adapt_espelhar_grade` recriada gravando detalhes/semana_origem (mesmos grants/RLS; tabelas ja tem RLS).
- CHECK `chk_cron_adapt_pm_tipo` CONFIRMADO: cobre pf,pp,fl,qu,lp,rf,rq,jp = todos os prefixos (revisao/reforco/hist/jp reusam prefixos). Reafirmado na migracao.
- Codigo e tolerante: sem a migracao tudo segue como antes (leitura com fallback, upserts sem as colunas novas).

## Contrato com o iframe (aceito no servidor)
- doc `estado`: `detalhes` (ou `detalhesMetas`) = { meta_id: { semanaRevisao, semanaOrigemRevisao, ordemAlternancia, essencialNaoSelecionada, material, origem, percentualOrigem, pai, continuacao, paginaInicio/Fim, totalPaginas, artigo, geracao, ... } }. Whitelist/tipos em `sanearDetalhes` (meta-ids.ts); invalido => `detalhes_invalidos`; ausente => preserva o gravado.
- doc `progresso`: `prog[meta].em` (ou `concluidoEm`) = data real AAAA-MM-DD; concluida sem data => servidor carimba hoje (Fortaleza); desmarcar zera.
- doc `notas`: `notas[meta].cert` (inteiro >= 0, <= res).
- GET (`carregarDocs`) devolve os mesmos campos (estado.detalhes, prog[].em, notas[].cert) para round-trip.
- Acao `meta` da rota: aceita `concluido_em` e `cert`; `estado=done` sem data => hoje.

## Feito
1. Persistencia: `dados.ts` (MetaRow, lerMetas c/ fallback, progDeMetas.em, notasDeMetas.cert, sincronizarDoc/patchMeta, carregarDocs, migrarPlano/gerarAdaptativo passam `detalhes` ao motor e gravam os detalhes gerados via `mesclarDetalhes`, antes do espelho); `plano-metas.ts` (`descrever` exportado entendendo pf|fl:i:revisao:s, rf:s:i, qu:i:hist:s, pf|fl:i:reforco:s, pp:i:k, lp:1:i, jp:s; `semana_origem`, `detalhes`, `lerDetalhesMetas`, `gravarDetalhesMetas`; hash do espelho inclui detalhes, k2). Novo modulo puro `meta-ids.ts`.
2. Liberacao: regra pura em `meta-alvo.ts` (usada por liberacao.ts). rf:s:i (inclui essencial externa) e pf|fl:i:revisao:s/reforco/hist abrem o material da aula i na data da meta, respeitando "dias antes", excecoes e `foraDoPlano`; jp nunca bloqueia (sem documento).
3. Snapshot: `engine.descrever` devolve `subtipo/rotulo`; `snapshot.ts` usa o rotulo ("Revisao adaptativa (PDFull|PDFlash)", "Reforco (...)", "Questoes (diagnostico)"); home/painel herdam via `tipoNome`. `saudePlano` ignora ids com sufixo (antes contaria fl:i:revisao:s como atraso do ciclo regular). Nenhum saneamento de codigo trata id sem aula como inexistente (descrever tolera aula ausente); as rotinas SQL de orfaos comparam por meta_id presente em plano_meta, entao os ids novos nao viram orfaos.
4. Admin Metas & inteligencia: removidos os campos de tetoPdfDia, concentracaoAteH, lpMetasDia/lpDiscDia/lpMesmaDisc, usarDesempenhoNoPlano/pesoDesempenho, pdfInteiro218, revisaoPorResultado218, historicoDiagnostico219, jurisprudencia219; novo bloco "Sem efeito no gerador atual" (lista de `PARAMS_SEM_EFEITO`, params.ts). Valores/colunas mantidos (o estado salvo preserva o que ja existe). Textos sem numeracao de versao.
5. `migrarPlano` NAO regenera por troca de motor: so dispara quando `cfg.catalogo !== catalogoIdDoTenant` (mudanca de catalogo/overlay); plano com motor legado migra pelo motor legado; detalhes so sao gravados em migracao pelo motor atual. Confirmado no codigo (dados.ts, guarda inicial).

## Testes
- Novo `scripts/_plano-metas-ids.mjs` (40 asserts: ids novos em meta-ids/meta-alvo/descrever/linhasDaGrade/engine/saudePlano), incluido em `pnpm cronograma:testar`.

## Pendente / observacoes
- Aplicar a migracao acima (usuario). Ate la `detalhes`/`cert`/`concluido_em` nao persistem (fallback silencioso).
- Fase 2A deve enviar os campos do contrato acima (nomes `detalhes`, `prog[].em`/`concluidoEm`, `notas[].cert`).
- Motor: nenhuma mudanca necessaria. `ctx.detalhes` ja e lido; `Prog30.em` e `notas.cert` ja sao consumidos.
- A view `meta_def_analise` (ref_aula) agora conta tambem pf|fl:i:revisao:s e qu:i:hist:s sob a aula i (coluna gerada nao alterada).
