# Cronograma Adaptativo - Fase 2A (iframe do aluno) - log

Arquivo alterado: `apps/web/public/cronograma/adaptativo/index.html` (motor28.js nao mudou; hash do cache-buster intacto). Nenhum texto visivel contem "3.0". Sem `confirm/alert/prompt`: dialogos inline proprios (`#dlg`, classes `.dlg*`, so tokens existentes).

## Regra de coexistencia
`usaMotorAtual(cfg)` = `cfg.motor` comeca com `3.` (igual ao servidor). Plano gravado pelo motor antigo (sem carimbo ou 2.x) NAO e regenerado ao abrir e segue nos fluxos antigos (S.revs/RV, `reagendarParada`, `reorganizarLegado`, `ajustarHorasDiaLegado`, `retomarLegado`) e, ao agir sobre ele, `gerarPlano` do iframe usa `Motor28.legado`. Plano novo ou recalculado em Configurar (montarCfg carimba o motor atual) usa o motor atual e o dominó.

## Feito (itens da tarefa)
1. Configurar: seletor h+min so com folga ou 2h-12h (rotina) / 2h-24h (data), passo 30min, sem 1h (valor legado fora da regra continua visivel ate trocar); `Motor28.validarHoras300` bloqueia gerar/recalcular e a previa (<10h ou dia ativo <2h) com mensagem na tela e em dialogo; removidos "segundo PDFull" e "materias em paralelo" (montarCfg nao envia mais `paralelo/maisPDFull`); semana especial 4/6/8, padrao 8, planos com 10/12 continuam exibindo/aceitando (opcao legada extra); dialogo ao desativar com o texto exato da spec (Cancelar mantem); diagnostico historico sem flag de tenant no plano novo.
2. Tutorial de primeiro acesso (4 passos: metodo, rotina, ferramentas de progresso, estudo novo x revisao) logo apos nome+ritmo; `S.perfil.tutorialVisto`; botao "Tutorial" no cabecalho para reabrir.
3. Semana especial lida do PLANO nos planos novos (`indexar` nao monta `S.revs/RV`); ordem do dia: continuacao de PDFull primeiro, metas especiais pela `ordemAlternancia` gravada; legenda e avisos da Semana/Hoje por tipos presentes; planos legados mantem S.revs.
4. Dominó: Nao realizada (proxima data da mesma familia, dialogo de minutos/pagina/artigo, "Manter pendente"), PDFull parcial (ultima pagina -> saldo; ultima pagina conclui), LegProc parcial (artigo -> bloco de 20min), outros parciais (ponto + minutos restantes), Organizar metas em atraso (registra `reorgs`), Ajustar horas do dia (0 ou 2-24h, restaurar, `adiantarLP/PDF`), Pausar/Retomar (retomada registra recesso "Pausa"), Arrastar na Semana (drag/drop nos dias com horas + botao "Mover meta" na folha para toque; dialogo "Fiz parte desta meta"; validacao do destino/paginas/capacidade pelo proprio dominó com `movida`). Erros do motor aparecem no dialogo sem alterar o plano.
5. Oferta de cronograma complementar de LegProc: dialogo ao concluir a ultima meta + painel no Hoje; usa `Motor28.pendenciasLegproc` e dominó; marca `cfg.complementarLegproc = {geradoEm, metas}` (persiste na cfg e vai ao motor como `ctx.complementarLegproc`).
6. Proximos dias mostra "Lei · artigos" (e "Revisao · disciplina · aula").
7. `ErroInsuficiencia`: mensagem propria na previa (aside) e dialogo ao gerar; nunca grava plano truncado (gerarDaConfig aborta).
8. Backup JSON: botao "Backup" (baixa `{formato:'rej-cronograma', v:2, estado:S}`; restaura de arquivo com confirmacao). Chave `rej-cronograma-v2` e sync com a conta inalterados (restauracao marca estado/progresso/notas para sincronizar).
9. Rotulos: `PDFull · releitura da revisao`, `PDFlash · revisao adaptativa`, `PDFlash · revisao` (rf) e linha de motivo com origem/percentual/essencial nao selecionada.

## Contrato para a Fase 2B
- `S.detalhes` (mapa metaId -> {pai, origem, material, percentualOrigem, ordemAlternancia, semanaOrigemRevisao, essencialNaoSelecionada, continuacao, paginaInicio/Fim, totalPaginas, ...}) vem do `detalhes` do motor / dominó. Vai no doc `estado` como `detalhes` (carregado de `estado.detalhes` do GET). Nome interno anterior `detalhesMetas` foi unificado em `S.detalhes` (wrapper, ctx do motor, boot, nuvem).
- Doc `progresso` agora traz `concluidoEm` ({metaId: 'YYYY-MM-DD'} das concluidas, vindo de `prog[id].em`) e `cert` ({metaId: acertos}, = `res - err` das questoes concluidas; tambem gravado em `notas[id].cert`). `prog` continua com `s/em/t/parou`.
- `cfg` ganhou (persistem junto com a cfg): `reforcosHistorico`, `remanejadas`, `paginasLidas`, `paginasReforco`, `complementarLegproc`, `revisao.cada` (4/6/8 ou 10/12 legado), `motor`.

## Divergencias / limites
- `S.detalhes` so e persistido no servidor quando a 2B aceitar os campos; ate la ele e recomposto pelo motor no cliente (o localStorage guarda tudo).
- Reagendamentos do aluno a partir de jurisprudencia (`jp:`) usam o fluxo antigo (o dominó nao move jp).
- "Avaliar tema anterior" (U6) nao foi portado (nao pedido nesta fase).
- Nao ha Admin local do HTML de referencia (por decisao). O backup nao usa as chaves `rej-cronograma-v3-0` do HTML de referencia.

## Verificacao
- `node --check` nos 9 scripts extraidos do iframe: OK. Teste headless Playwright (pagina servida por rota, sem screenshots): carga sem erro de console; ~45 checagens (tutorial, 1h removido, bloqueio <10h, dialogo exato, 4/6/8, plano gerado com semana especial no plano, parcial PDF/LP, nao realizada, ajustar horas, mover, pausa/retomada, organizar atrasadas, complementar, backup, cert/concluidoEm, insuficiencia, plano legado intacto, ausencia de "3.0" no texto visivel).
- `pnpm cronograma:testar` (motor nao mudou).
