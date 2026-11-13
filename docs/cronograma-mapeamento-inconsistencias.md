# Cronograma Adaptativo: mapa de zonas com erro e inconsistência

Gerado por simulação sistemática (`apps/web/scripts/_simulacao-cronograma.mjs`). Nada foi commitado nem tocou produção/banco.

## Como reexecutar

```
pnpm --filter web cronograma:simular                       # completo (355 cenários, ~10 min em 12 workers)
pnpm --filter web cronograma:simular -- --rapido           # subconjunto (60 cenários, ~2 min)
pnpm --filter web cronograma:simular -- --semente=42       # outra semente (misturas aleatórias)
pnpm --filter web cronograma:simular -- --so=c0122 --seq   # reproduz 1 cenário (imprime SPEC + diff); use os mesmos flags (--rapido/--semente)
pnpm --filter web cronograma:simular -- --comp=migraIgual  # só um comportamento
```

Saída bruta (JSON) em `docs/cronograma-mapeamento-inconsistencias.simulacao.json`.

## O que foi simulado

- **355 cenários, 977 operações de motor, 79 comparações servidor × iframe** (rodada completa, semente 7). 13 rejeições legítimas do motor (insuficiência de horas) foram contadas à parte.
- Motores: `motor30.ts` (produção, `cfg.motor` 3.x, v3.2.0) e `motor28.ts` (legado 2.8.1, planos antigos). O motor real é escolhido como em `engine.ts`/`planoUsaMotorAtual`.
- Perfis: 10h a 56h/semana, dias 0h, só fim de semana, 1/2/4/9 disciplinas, com/sem LegProc, PDFlash e questões, início em seg/qua/sáb/dom.
- Comportamentos: concluir tudo, parcial, pular 1 dia, sumir 3/7/14 dias (voltando com e sem "Organizar"), fora de ordem, não realizada, reabrir, adiantar, desempenho baixo/alto (com e sem inteligência), Organizar, ajustar horas, pausar/retomar, mover meta, Recalcular pela Config, migração de catálogo (conteúdo novo e idêntico), fuso +1 dia, misturas aleatórias.
- Fluxos espelhados do iframe (`index.html`: `reorganizar`, `ajustarHorasDia`, `retomar`, `confirmarSobra`, `gerarDaConfig`) e do servidor (`dados.ts`: `migrarPlano`, `fixosPreservados`, `pausarAdaptativo`).
- Servidor × iframe: o `motor28.js` compilado roda numa VM e é comparado ao `.ts` com as mesmas entradas. **`motor28.js` está em dia** com `motor28.ts`/`motor30.ts` (verificado por conteúdo), e as 79 comparações deram saída idêntica. Logo, motor desatualizado **não** explica divergência.

## Tabela de zonas

| Zona / área | Cenário mínimo | Invariante violada | Grav. | Arquivo:linha provável | Status |
|---|---|---|---|---|---|
| Fuso do servidor (visão de atrasadas) | `tz=errado`, qualquer perfil: servidor usa hoje+1 | I2/I11: metas de "hoje" contam como atrasadas. Mediana +6, máx +11 por dia | Alta | `estado.ts:34`, `dados.ts:110` (corrigidos antes); `docker-compose*.yml` (sem `TZ`) | **Corrigido** (hojeCal + `TZ=America/Fortaleza` nos serviços web/worker) |
| `new Date().toISOString()` no caminho do cronograma | Após 21h (UTC) vira "amanhã" | I11 (data de parcial e semana atual) | Média | `nova-dados.ts:104`, `api/aluno/cronograma/adaptativo/route.ts:117` | **Corrigido** (`hojeBrtISO()`) |
| `migrarPlano` re-ancora o futuro (catálogo muda de id) | `migraIgual`: conteúdo idêntico, aluno **em dia** (`migraIgualEmDia`, 20h:4h×5, dia 14) | I8: moveu 242 a 275 metas futuras; plano "recalculado". Em 21 cenários da rodada completa | **Alta** | `dados.ts:198-264` (guarda só por `cfg.catalogo === catId`, `dados.ts:202`) | **Proposta** (hash de conteúdo, ver P1) |
| Motor: re-ancorar não é estável (`gerarPlano` com `fixos`+`ancora`) | Aluno 100% em dia; regerar de `H` com mesmo cfg (4h×5, 4 disciplinas) | I8/I10: 52% a 82% dos pendentes mudam de data; nos próximos 14 dias, 3 a 28 metas | **Alta** | `motor30.ts:1198-1235` (`gerarPlano`) | **Proposta** (P2) |
| `calcularDomino` (Organizar/Retomar/Parcial) infla o fim | `15h:fds` (sáb 8h, dom 7h), sumir 7 dias, Organizar | I9: fim 19 → 34 semanas (regerar a partir de hoje daria 21). Semanas com 5,5 a 8h de 15h | Média | `motor30.ts:938-1190` (`calcularDomino219Base`) | **Proposta** (P3). 5+1+1 cenários |
| `calcularDomino` deixa PDF órfão | `24h30`, 70% de ritmo, `pf:0` concluído e `pp:0:2` pendente, Organizar | I1: peça `pp:0:2` reaparece pendente 8 meses depois; derivado: `fl:0` antes do PDF final (I6) | Média | `motor30.ts` `unificarPDF216` (~l.925) | **Proposta** (P4). 7 cenários |
| Servidor: retomar por `pausarAdaptativo` | `pausaSrv`: pausa dia 8, retoma dia 15 | I4: traz aula nova à janela de 14 dias sem conclusão. Não redistribui atrasadas (sem dominó/recesso) | Média | `dados.ts:488-499` (rota `pausar`, `route.ts:142`) | **Proposta**: caminho existe, o iframe não o usa (P5) |
| Legado 2.8.1: semana de revisão (RV) | `desempBaixo` em plano 2.8.1 | I7: 8 metas de revisão com datas diferentes entre visão congelada (iframe) e recalculada (servidor) | Média | `snapshot.ts:101` descarta `revs` de `indexar()`; `estado.ts:72-78` | **Proposta** (P6). Só planos não-3.x |
| Servidor × iframe, ordem no dia | Código (não simulado) | Divergência de ordem intra-dia (servidor ignora `continuacao`/semana especial) | Baixa | `estado.ts:84` × `index.html:1054-1057` | **Proposta** (P7) |
| `sincronizarDoc` zera `cfg.catalogo` em plano não-3.x | Código: todo `sync` de plano legado | Reabre migração no próximo load (re-ancora o futuro) | Média (hipótese) | `dados.ts:578` | **Proposta** (P8) |
| PDFlash/Questões no mesmo dia do PDFull | Todos os perfis longos (228 cenários) | I6: intervalo 0 dia, na reta final | Baixa | `motor30.ts:884` (regra rev. 23, por desenho) | Por desenho; confirmar com o método |
| `motor30.hojeLocal()` usa fuso do processo | Chamada sem `ctx.hoje` | I11 se `TZ` ≠ Fortaleza | Baixa | `motor30.ts:228` | **Mitigado** pelo `TZ` do compose; todos os chamadores passam `hoje` |
| Servidor × iframe (`motor28.js`) | 79 comparações (gerar, dominó, migrar, recalcular) | I12: nenhuma divergência | N/A | `public/cronograma/adaptativo/motor28.js` | OK (em dia) |
| Invariantes sem violação | conservação de concluídas (I1), atrasadas = não concluídas com data < hoje (I2), nada vira atrasada sem vencer (I2), Organizar zera o passado e não perde metas (I3), carga ≤ horas e dia 0h vazio (I5), indexar puro e navegação sem efeito em plano 3.x (I7), determinismo (I10), migrarPlano idempotente no mesmo dia (I8) | — | — | — | OK |

Notas de leitura:
- LegProc que não cabe na fila de PDFull sai do plano ao regerar/migrar (`legprocRestantes`, oferta de cronograma complementar). É por desenho e não foi contado como perda.
- Os 228 casos de "mesmo dia" (I6, baixa) ficam em `docs/...simulacao.json`.

## Reprodução do relato da aluna

Perfis com 1 dia inteiro não feito e todo o resto concluído:

| Perfil | Metas do dia faltado | Atrasadas reais | Atrasadas com servidor em hoje+1 |
|---|---|---|---|
| 4h×5 | 6 | 6 | 7 |
| 6h×5 + 4h sáb | 4 | 4 | 10 |
| 8h×7 | 6 | 6 | 12 |
| 6/2/6/2/6/0/0 | 6 | 6 | 11 |

- **"14 atrasadas":** o fuso sozinho (hoje+1) soma as metas de hoje às do dia faltado e chega a 10 a 12 em perfis pesados. 14 é compatível com dias de 7 metas, mas **não foi reproduzido exatamente**. Evidência indireta, não confirmação. O iframe usa o relógio do navegador (`index.html:932`); o fuso afeta os totais calculados no servidor (painel/Início/snapshot). Para fechar: perguntar onde ela leu o "14" e conferir a tabela `log-geracao` (acao `migrar`/`recalcular`) do aluno.
- **"Semana anterior recalculada":** a migração **não** altera datas já vencidas (`fixosPreservados` fixa o passado), então ela sozinha não reescreve a semana anterior. Explicações consistentes com a simulação, nenhuma confirmada em produção: (a) "Recalcular" pela Configuração reagenda do zero as metas **pendentes** do passado (`index.html:1851-1852`, só concluídas/com dado são fixas); (b) planos 2.8.1: o servidor recalcula as RV a cada leitura (`snapshot.ts:101`), o iframe congela; (c) migração de catálogo re-ancora **todo o futuro** (linhas acima), o que parece "tudo recalculado" mesmo sem mudança de conteúdo.

## Propostas (não aplicadas: núcleo do motor ou migração em massa)

- **P1. `migrarPlano` só migra se o conteúdo mudou.** Guardar `cfg.catalogoHash = sha1(AS+LP+ordem+params)`. Se `catalogo` mudou mas o hash é igual: só carimbar `cfg.catalogo` (sem `gerarPlano`). Esboço em `dados.ts` logo após a linha 202:
  ```diff
  +  const hash = hashConteudo(banco)               // sha1 de AS, LP, ordem, params
  +  if (cfg.catalogoHash === hash) { await carimbarSo(svc, row.id, catId); return { ...row, cfg: { ...cfg, catalogo: catId } } }
  ```
  Risco: planos sem hash migram uma vez (então gravar o hash também na primeira migração). Validar: `pnpm --filter web cronograma:simular -- --comp=migraIgualEmDia` (I8 deve zerar) e um teste novo `catalogo-hash`.
- **P2. Estabilidade da re-ancoragem.** Em `migrarPlano`/recalcular, fixar também as metas pendentes futuras cujo item de catálogo não mudou (`fixos = fixosPreservados + pendentes inalteradas`), deixando o motor decidir só as novas/alteradas. Atrás de flag de param (`migracaoEstavel`), A/B por tenant. Risco alto (muda comportamento de migração em massa). Validar: simulador (I8 e `migra`), `_motor30-diferencial.mjs`, `_motor30-dominio.mjs`.
- **P3. Fim inflado no dominó.** Comparar capacidade usada por semana em `calcularDomino219Base` (5,5 a 8h de 15h) com a de `gerarPlano`; ou oferecer "Organizar" via `gerarPlano(fixos, ancora)` quando o fim do dominó exceder o do regerar em mais de N semanas. Validar: `_motor30-dominio.mjs` + I9 do simulador.
- **P4. PDF órfão.** Em `unificarPDF216`, se `pf:i` já está concluído, descartar/mesclar peças `pp:i:*` pendentes ou datá-las logo após `hoje`. Validar: cenário `c0091` (`--so=c0091`, mesmos flags).
- **P5. Rota `pausar` do servidor.** Remover a ramificação "retomar" (não é usada pelo iframe) ou fazê-la espelhar `retomar()` (recesso + dominó).
- **P6. RV de planos 2.8.1.** Persistir `revs` no caminho de leitura do snapshot, ou migrar os planos legados para 3.x (as RV passam a ser metas do plano).
- **P7. Ordem intra-dia.** Levar `detalhes` (`continuacao`, `semanaRevisao`, `ordemAlternancia`) ao `Estado` e usar o mesmo comparador do iframe em `estado.ts:84`.
- **P8. `dados.ts:578`.** Trocar o "limpar catalogo" por um carimbo próprio (`cfg.catalogoSync`) para que um save do iframe antigo não reabra a migração.

## Limitações

- O modelo espelha o código lido (iframe e `dados.ts`); não há banco nem navegador. Parcial usa a variante PDFull (e 50% de "mover" para os demais tipos).
- Estado de `localStorage` do iframe e corridas de sync (`salvar` com debounce) não estão modelados.
- O motor 2.8.1 é testado em geração, migração, recalcular e RV; o dominó legado do iframe (`reorganizarLegado`) não está no lib e não foi simulado.
