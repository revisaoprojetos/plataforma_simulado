# Cronograma Adaptativo — análise das tabelas e proposta de modelo relacional

Levantamento de 05/11/2026 (banco de produção lido em modo só-leitura + mapa do código). Nada foi alterado além do espelho `plano_meta` (migração `20261105050000`, ainda a aplicar).

## 1. Fotografia do banco (planos reais = 409; 478 com exemplos)

| Coluna JSON | Mediana | Máximo | Soma | Observação |
|---|---|---|---|---|
| `plano` (grade `{meta_id: [data, horas]}`) | 26 KB | 55 KB | 9,7 MB | ~325 mil itens; é o grosso do volume |
| `cfg` | 617 B | 1,5 KB | 0,3 MB | pequeno e de forma conhecida |
| `revs` | 2 B | 2,3 KB | ~0 | só 3 planos têm conteúdo |
| `extras` | 2 B | 235 B | ~0 | 9 planos, 10 itens |
| `pausa` | 4 B | 22 B | ~0 | `{desde}` |

Formatos de `meta_id` na grade: `lp:<lei>:<n>` 130.130 · `pf:<i>` 56.313 · `qu:<i>` 52.301 · `fl:<i>` 46.398 · `pp:<i>:<parte>` 34.420 · `lp:<s>:<j>` (legado) 3.171 · `lp:?:<n>` 7.074.
Todos os itens da grade estão no formato `[data, horas]` (nenhum fora do padrão).

### Chaves do `cfg` (planos reais)
Em todos (409): `start`, `horas[7]`, `discs[]`, `metas{pf,fl,qu,lp}`, `arranjo`, `revisao{ativa,cada}`, `revModelo`.
Em 371: `vel`, `velSeg`, `velFonte`, `rotinas[]`, `recessos[]`, `semData`.
Em 341/338/317: `motor`, `catalogo`, `maisPDFull`.
Em 197: `ultimosTemas{disc: posição}`, `jaEstudaRevisao`.
Raras: `lpIgnorar[]` (142, quase todas vazias), `lpLegado{}` (140, quase todas vazias), `paginasLidas{}` (9), `sobras{}` (4), `horasPontuais{}` (3).

## 2. Quem usa o quê

### Tabelas
| Tabela | Papel | Escritores | Leitores |
|---|---|---|---|
| `…_plano` | plano do aluno: cfg + grade JSON + revs/extras/pausa | `gerarAdaptativo`, `sincronizarDoc('estado')`, `migrarPlano`, `pausarAdaptativo`, fixar/arquivar/renomear | `lerPlanoRow`, `carregarDocs`, liberação, painel/home (via snapshot), DOCX |
| `…_meta` | **progresso do aluno** por meta | `patchMetaAdaptativo`, `somarTempoMeta`, `sincronizarDoc('progresso'/'notas')` | `lerMetas` (montarEstado/carregarDocs), liberação (`done`) |
| `…_plano_meta` (novo) | metas do plano em linhas | `espelharPlanoMetas` (ao gerar/sincronizar/migrar + lote no admin) | só o admin (contagem) |
| `…_catalogo` | ajustes do admin sobre o catálogo (1 linha/tenant) | editor de catálogo | `carregarConteudoBanco`, `catalogoIdDoTenant` |
| `…_legproc` | fallback de lei seca | admin lei-seca | `conteudo-banco.ts` |

### Consumo do `plano` (grade)
- **Por data/semana:** `indexar` → snapshot (todas as semanas, hoje, próximos), `atrasadas`, painel e home (só precisam de hoje, atrasadas e semana atual, mas hoje montam tudo).
- **Varredura total:** `fixosPreservados`, `rankingRevisao`/`montarRevisao`, desempenho por disciplina, `saudePlano`, liberação por data (`planoDoAluno` lê o JSON inteiro só para achar a menor data por aula/lei).
- **Só contagem:** total, feitas, `temPlano`, prévia.
- **`revs`:** congela as revisões (rf/rq) das semanas já iniciadas; só `sincronizarDoc` e `migrarPlano` gravam.
- **`extras`:** só vai e volta para o iframe; o motor e o snapshot não usam.

### Consumo do conteúdo da montagem
- `AS` = aulas, montado em `conteudo-banco.ts`: disciplinas por ordem, documentos por título. **A posição no array é o id da meta** (`pf:i`, `pp:i:k`, `fl:i`, `qu:i`, `rf/rq:<sem>:<i>`).
- LegProc: `lp:<lei>:<n>` (catálogo) · `lp:<hex>:<n>` (cortes automáticos antigos) · `lp:<s>:<j>` (semanal legado, via `WLP`).
- Consumidores: motor, `info/descrever`, snapshot (`acertoTema`, `erros`), `mapaDocsCronograma` (liberação), espelho `plano_meta`, GET da API (o iframe recebe `AS, ordem, WLP, WLPdoc, LP, disciplinas, agu, catalogo, params`).
- **Risco central:** qualquer mudança na Biblioteca (documento novo, título/pasta alterados, reordenar disciplina, despublicar) desloca os índices e corrompe ids dos planos existentes. Proteções atuais: overlay append-only, `cfg.catalogo` + `migrarPlano` (preserva "fixos"), backup em storage. Não são ids estáveis.
- Remendos de LegProc: `lpLegado`, `lpIgnorar`, `LPdesc`, `lpDeWLP`, `ehLpSemanal`.

### Pontos quentes
- GET do iframe: devolve cfg+plano+revs+extras+prog+notas+AS completos e roda `carregarConteudoBanco` **sem cache** (queries pesadas) + `migrarPlano` na leitura.
- POST do iframe: reenvia o `plano` inteiro e todo o progresso/notas a cada autosave; cada `estado` dispara o espelho.
- Painel e Home: montam o snapshot de TODAS as semanas para extrair hoje/atrasadas/semana atual, a cada meta/sync/gerar.
- DOCX: snapshot completo, sem cache.
- O `motor28.js` roda também no iframe e recebe o `cfg` inteiro — o cfg precisa continuar chegando como objeto.

## 3. Modelo relacional proposto

### Princípios
1. O **motor e o iframe continuam recebendo `cfg` como objeto**; o servidor o **monta** a partir das linhas (função `montarCfg(planoId)`), sem mudar `motor28`.
2. Migração por **dual-write** (JSON + linhas) até cada leitor ser trocado; só então o JSON vira cache e depois é removido.
3. **Id estável** de aula/meta (fim da dependência de posição em `AS`) é a fase mais valiosa e a mais delicada — por isso vem depois das leituras.

### Tabelas
**`adaptativo_plano`** (já existe) — promover para colunas o que é escalar do `cfg`:
`start date`, `arranjo text`, `rev_ativa bool`, `rev_cada int`, `rev_modelo text`, `vel numeric`, `vel_seg numeric`, `vel_fonte text`, `mais_pdfull bool`, `ja_estuda_revisao bool`, `sem_data bool`, `motor text`, `catalogo text`, `metas_pf/fl/qu/lp/vd bool`, `pausa_desde date`, `fim int`. O `cfg jsonb` fica temporariamente só para chaves desconhecidas.

**Filhas do cfg (1:N):**
| Tabela | Colunas | Origem no cfg |
|---|---|---|
| `adaptativo_plano_horas` | plano_id, dia (0–6), horas | `horas[7]` |
| `adaptativo_plano_rotina` | plano_id, desde, horas smallint[7] | `rotinas[]` |
| `adaptativo_plano_recesso` | plano_id, ini, fim, motivo | `recessos[]` |
| `adaptativo_plano_hora_pontual` | plano_id, data, horas | `horasPontuais{}` |
| `adaptativo_plano_disciplina` | plano_id, disciplina_id (ou nome), ordem | `discs[]` |
| `adaptativo_plano_ultimo_tema` | plano_id, disciplina, posicao | `ultimosTemas{}` |
| `adaptativo_plano_pagina_lida` | plano_id, aula_ref, paginas, parte | `paginasLidas`, `partesLidas` |
| `adaptativo_plano_sobra` | plano_id, meta_id, minutos | `sobras{}` |
| `adaptativo_plano_remanejada` | plano_id, meta_id, desde, minutos, detalhe | `remanejadas{}` |
| `adaptativo_plano_lp_ignorar` | plano_id, meta_id | `lpIgnorar[]` |
| `adaptativo_plano_lp_legado` | plano_id, meta_id, disciplina, lei, texto, documento_id | `lpLegado{}` |
| `adaptativo_plano_extra` | id, plano_id, data, min, disciplina, tipo, nota, em | `extras[]` |

**`adaptativo_plano_meta`** (já criada) — a grade em linhas. Acrescentar: `origem` (`motor`/`revisao`), `congelada bool` (substitui `revs`: as linhas rf/rq das semanas iniciadas), `aula_id uuid` (id estável, fase 3) e `fixa bool`.

**`adaptativo_meta`** (progresso do aluno) — manter; passar a ter FK `(plano_id, meta_id) → plano_meta`.

**Definições (fase 3)** — `adaptativo_aula` (tenant, `chave_estavel`, disciplina_id, numero, tema, paginas, documento_id, ordem, ativa) e `adaptativo_lei` (tenant, chave, disciplina, texto, documento_id, ordem): as linhas de `plano_meta` passam a apontar `aula_id`/`lei_id`; o catálogo embutido (277 aulas, 622 metas LegProc) e o overlay do admin viram linhas editáveis.

## 4. Ordem de execução sugerida (cada etapa independente e reversível)

| Fase | O que | Risco | Ganho |
|---|---|---|---|
| 0 ✔ | Espelho `plano_meta` + lote no admin (migração 20261105050000) | baixo | base para as demais |
| 1 | Trocar leitores por consultas em `plano_meta`: `planoDoAluno` (liberação), hoje/atrasadas/semana atual do painel e home, contagens de desempenho (via `metas_visao`) | baixo (leitura; fallback no JSON) | tira o scan do JSON e o snapshot de todas as semanas |
| 2 | Normalizar `extras`, `pausa`, `revs` (os mais fáceis: raros e pequenos) | baixo | |
| 3 | Promover escalares do `cfg` e criar as filhas; `montarCfg` + dual-write | médio (iframe grava o cfg inteiro) | cfg consultável por SQL |
| 4 | Id estável de aula/meta + tabelas de definição | **alto** (muda a identidade das metas; exige migrar ids dos 478 planos e o progresso) | fim da corrupção por reordenar a Biblioteca |
| 5 | Parar de gravar `plano`/`cfg` JSON | médio | grade vira só linhas |

## 5. Armadilhas já identificadas
- O espelho grava `disciplina/aula/titulo/documento_id` **resolvidos na hora**; mudam de significado se a Biblioteca mudar (resolvido na fase 4).
- `rf/rq` só existem como linhas se estiverem no `plano`; `revs` precisa entrar na tabela (fase 2).
- `lp:<s>:<j>` e `lp:?:<n>` (10 mil itens) exigem descrição via `WLP`/hex do documento.
- `carregarConteudoBanco` não tem cache; cada leitura do painel/home/GET paga a montagem completa.
- `cfg.usarDesempenhoNoPlano` **não existe no código**: o desempenho vem de `ctx.params` (tenant) + `ctx.notas`.
