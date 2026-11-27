# Plano — Biblioteca de partes, classificação genérica e índice confiável

Data: 2026-11-26 · Status: PLANO (nada aplicado/commitado além da migration escrita em `docs/sql-aplicar-twdr/16-…`, ainda NÃO aplicada).
Base: diagnóstico read-only do banco de produção (twdr) + leitura do código. Números abaixo são do banco real.

---

## 1. Decisões já tomadas (conversa)

1. **Leis continuam inteiras** na Biblioteca. Nada de fatiar o arquivo.
2. **Partes** (`Art. X até Y`, `Título II`…) são definidas **no gerenciar do documento**, na Biblioteca. Uma parte guarda só a **faixa** (trecho inicial/final por `data-uid` estável), nome e ordem. Nada de tempo/regra na parte.
3. **Demais áreas** (Gerador, Adaptativo, Lei Seca, Maratona…) **só selecionam**: documento + parte + classificação. Não criam nem editam faixa. Atalho "Gerenciar partes" leva ao documento.
4. **Classificação** (o antigo "tipo": PDFull, LegProc, PDFlash e personalizados) é **genérica e por tenant**. Vive no documento (`classificacao_id`), com a pasta dando só o padrão por herança. Código **nunca** pergunta pelo nome/slug; pergunta por **capacidade**.
5. **Classificação = identidade + exibição** (formato, índice, legenda, nome ao aluno, cor). **Tempo e regras de meta NÃO moram nela**: ficam em **regras de uso por área × classificação**, definidas na matriz de cada área, com ajuste por meta.
6. Cascata de regras: **meta (override) > regras de uso (área × classificação) > padrão do motor da área**.
7. **Não desligar nada antes de o novo funcionar.** Copiar/organizar primeiro; remover a leitura antiga só quando a conferência fechar em zero.
8. **Índice** precisa de modelo único e diagnóstico por documento (ver §4).

## 2. Diagnóstico do banco (produção)

| Tema | Número | Leitura |
|---|---|---|
| Docs publicados | 1.133 (1.022 docx, 111 pdf); 1.119 no tenant Revisão | |
| Tipo herdado da pasta | pdfull 270 · pdflash 263 · pdfight 243 · legproc 87 · jurisclub 16 · **sem tipo 254 (22%)** | os 254 hoje caem como PDFull sem aviso |
| Docs sem pasta | 47 (todos os de 3 tenants menores) | |
| Sem disciplina herdada | 266 | |
| Pastas tipadas | 81 (pdfull 24, pdflash 22, pdfight 19, legproc 15, jurisclub 1) | |
| `leitura_legproc = true` | **0** de 1.133, embora 87 estejam em pasta legproc | flag não usada na tabela nova; quem manda é o tipo da pasta |
| LegProc (87) | todos com artigos; **todos com 0 títulos e 0 capítulos**; 11.708 artigos | índice por capítulo (o padrão) não funciona nelas |
| Docs de aula | 351 de 503 com 0 artigos (pdflash 218/263) | esperado em parte; limita corte por artigo |
| PDFs (111) | 0 trechos (estrutural) | nunca terão índice/parte por artigo |
| docx sem trechos | 46 | conversão a revisar |
| `paginas` nulo | 283 (todos docx; 132 sem tipo) | quebra minutos/páginas das metas |
| Versão atual c/ conversão ≠ ok | 170 (167 `revisao_necessaria`, 3 `pendente`) | |
| Numeração de artigos | 241 de 432 docs com saltos; 230 com duplicados; 264 fora de ordem | saltos são o sinal confiável; duplicados/fora de ordem inflados por citações classificadas como artigo |
| Suspeitos de mal formatados | Código Civil (2.062 artigos, 1.108 duplicados, termina no "art. 2"), CPC (1.074, termina no "art. 1"), CLT (547 fora de ordem, 628 faltantes) | citações/alterações dentro da lei viram "artigo" |
| Metas Adaptativo (`meta_def`) | 976 ativas de biblioteca; **8 apontam p/ doc deletado/despublicado**; **16 LegProc de catálogo sem documento** | metas sem material |
| `meta_conteudo` (Gerador) | 0 linhas | vínculos efetivos vivem só em `meta_def` |
| `indice_tipos` | só na tabela legada `simulado_documentos` (30 de 54); os 1.133 novos usam sempre o padrão | |
| Catálogo `simulado_conteudo_tipos` | 0 linhas | **esperado**: os 6 tipos de sistema vivem no código; a tabela guarda só os personalizados |

## 3. Diagnóstico do código

**Três geradores de índice independentes**, sem módulo comum:
1. `public/leitura/leitor-jus.html` — `tocHeads` (modo texto): só `h1–h4`; artigo entra por regex (**remendo feito nesta sessão**: parágrafo que começa com `Art.`). Não lê `data-disp` nem `indice_tipos`. Título em `<p>` não entra. `id` `th-<i>` não é estável. PDF: `construirSumarioPdf` (índice impresso → outline → heurística de fonte; limite 400; offset de página por consenso).
2. `components/aluno/leitor-documento.tsx` + `lib/leitura/indice.ts` — usa `data-disp`/`indice_tipos`; cai em `data-art` sem nível. `NIVEL_TIPO` duplicado.
3. `lib/conteudo/trechos.ts` — `classificar()` por regex; só `h1→titulo`, `h2→capitulo`.

**Causas-raiz do "índice furado":**
- **Importação** (`ingestao.ts`, `legproc-html.ts`): `styleMap` só mapeia "Título 1–4"/Heading; título em "Normal" (negrito/maiúsculas) e estilos customizados viram `<p>`.
- **`sanitize.ts indexarDispositivos`**: nunca gera livro/parte/título/capítulo (tudo vira `secao`); id de artigo colide em "Art. 1º-A" (`art-1~2`, dependente da ordem); "Artigo único", "§ único", "§§ 1º e 2º", "I."/"I)" não casam; falso positivo em "Parte da doutrina…".
- **Rótulos de lista do Word** (romano/letra) são reconstruídos por CSS (`data-n`), logo o **texto do bloco não contém "I –"** e as regex de inciso nunca veem o rótulo.
- **Quatro detectores de artigo, três de inciso/alínea, duas tabelas de nível, dois detectores de "dentro de tabela"** — divergem entre si (o mesmo bloco recebe tipos diferentes em trechos × sanitize).
- **Caixas STF/STJ** (`.caixa-colapsavel`) são excluídas do índice sem opção.
- Citações de artigo em `td/th` entram como trechos do tipo artigo.

**Tempo/exibição hoje:** WPM=200 fixo no front; LegProc cortado por `CHARS_META=12000` (~30 min) via `lp-catalogo.ts`, dependente de `classificar()`; duração padrão por tipo em `tipos-meta.ts`/`tipos-conteudo-tipos.ts`. Exibição (legenda, caixas, página inicial) é por doc/pasta, não por classificação.

**Duplicações de herança de tipo** (devem virar uma só): `conteudo-banco.ts`, `meta-extras-server.ts`, `lib/revisao/cronograma.ts`, SQL em `resumo-cronogramas.ts` e `tipos-conteudo-server.ts`, mais `metas-pasta-heranca.ts` (UI).

## 4. Índice — estratégia

**Princípio:** uma única estrutura por versão do documento, calculada no servidor ao salvar, lida por todos (leitor, admin, partes, metas).

1. **Função única `classificarDispositivo`** (+ tabela única de níveis e um único "dentro de tabela") usada por trechos, sanitize e leitor. Cobrir: Livro/Parte/Título/Capítulo/Seção/Subseção; `Art.` com `-A`, `Artigo único`, romanos; `§`, `§ único`, `§§`; incisos (`I –`, `I.`, `I)`); alíneas; itens.
2. **Estrutura persistida por versão**: lista ordenada de nós (tipo, rótulo, nível, `uid` do trecho). `id` estável derivado do `uid`, não de contador.
3. **Detecção em camadas**: marcação explícita → estilo de título (h1–h4, negrito/maiúsculas curtas) → padrão de texto. Texto de lista do Word passa a incluir o rótulo no momento da conversão.
4. **Ignorar citações**: bloco em tabela/caixa/aspas ou "…, nos termos do art. X" não conta como dispositivo (reduz duplicados/fora de ordem).
5. **Exibição configurável na classificação (`exibicao`)**: quais tipos entram, nível máximo, artigos agrupados/soltos, incluir caixas. Por tenant, em dados. Substitui `indice_tipos` por documento.
6. **Painel de diagnóstico por documento** (Biblioteca): contagem por tipo, saltos de numeração, capítulos sem artigo, numeração fora de ordem; ação "marcar parágrafo como título/capítulo/artigo" gravada **sem alterar o texto**. Documento com índice incompleto aparece como **pendência** na matriz.
7. **PDF**: sem trechos por natureza → índice por outline/impresso; mostrar aviso quando for heurística de fonte; remover corte duro de 400 sem alerta.

## 5. Arquitetura alvo

- **Biblioteca (dados de conteúdo)**: pastas, documentos, versões, trechos, **partes**, `classificacao_id`, `formato_leitura`.
- **Catálogo de classificações (por tenant)**: identidade + `exibicao`; começa de um **modelo-base** (os 6 de hoje) e o tenant renomeia/liga/desliga/cria por dados.
- **Regras de uso (`simulado_conteudo_regras_uso`)**: por área × classificação (tempo, gera meta, qtd/semana, liberação…), edição na matriz da própria área.
- **Seleção por meta (`simulado_conteudo_selecao_meta`)**: `documento_id` + `parte_id` + `classificacao_id`, rótulo ao aluno, visibilidade, ordem, `regras_override`. Chave estável (`meta_chave`), nunca posição.
- **Resolução de herança única** (função/SQL compartilhada) substituindo as cópias.

Migration: `supabase/migrations/20261209000000_conteudo_partes_classificacao.sql` (+ colável `docs/sql-aplicar-twdr/16-…`). Aditiva, idempotente, nada de leitura atual alterado.

## 6. Usabilidade / gerenciamento

- **Matriz única de classificação** (Biblioteca): linhas = pastas/docs em árvore; colunas = classificação, formato, disciplina, partes, nº de metas que usam, **estado do índice**. Célula herdada em cinza, definida em destaque. Filtros "sem classificação", "herdando", "índice a revisar". Edição em lote.
- **Aba "Partes"** no gerenciar do documento: criar/renomear/reordenar/arquivar; escolher faixa no texto ou digitar; sugestão automática (por título/capítulo ou a cada N artigos); aviso de onde está em uso.
- **Matriz de regras por área**: classificação × (tempo, gera meta, qtd…), com indicador "padrão × definido" e ajuste por meta.
- **Reuso exato** (regras do projeto): `components/admin/data-table.tsx`, `questoes-tabela-base`, `EstudioHeader`, barra de lote da Biblioteca (`CheckSelecao/BarraLote/useSelecaoIds`), `metas-pasta-*` (herança `origemTipoId`), validação de `lib/cronograma/tipos-conteudo*.ts`. Abas sublinhadas, tokens, largura cheia, backend-first (`.range()`+`count`).
- **Pendências visíveis**: docs sem classificação, sem disciplina, sem pasta, `paginas` nulo, conversão a revisar, metas sem seleção, partes sem trecho resolvido.

## 7. Riscos e travas (do código)

- **Id `pf:<i>` por posição** em AS: qualquer parte/seleção que reordene/insira docs desloca ids dos planos. Seleção usa chave estável; parte nova **não** vira nova entrada em AS sem `remap-as`.
- **Caches**: `docsBibliotecaCache` 5 min, `resolverConteudoDasMetas` 120 s (chave não inclui seleção), `conteudoBancoCache` 120 s, tipos 30 s, resumo 60 s. Savers de seleção/regras precisam invalidar por tenant (como `meta-conteudo/route.ts` já faz).
- **Lixeira/purge**: partes e seleções usam `RESTRICT`; purge de 30 dias falharia em lote. Registrar em `dependencias-documento(-pura).ts`; arquivar partes em vez de apagar. `regras_uso.classificacao_id` é `CASCADE`: apagar uma classificação perde regras → exigir confirmação/arquivar.
- **Partes ancoradas por `uid`**: nova versão passa por `reconciliacao/alinhamento` e uid pode mudar → re-resolver por `rotulo_ini/fim`.
- **Unificar `classificar()` antes de ligar partes por artigo** (senão `lp-catalogo`, índice e parte cortam diferente).
- **Mudar `BLOCOS`/filtros de `trechos.ts` desalinha todos os grifos** — qualquer mudança de classificação de trecho precisa preservar a sequência de blocos.

## 8. Fases (ordem segura)

| Fase | Entrega | Mexe no que roda hoje? |
|---|---|---|
| 0 | Aplicar migration 16 | Não |
| 1 | **Índice**: `classificarDispositivo` único + testes com os docs problemáticos (CC, CPC, CLT); remendo atual do leitor-jus vira provisório | Só leitura/índice |
| 2 | Estrutura de índice persistida por versão + **painel de diagnóstico** por documento | Não |
| 3 | Esquema (zod) de `exibicao` e `regras de uso`; loaders puros com tolerância a tabela ausente | Não |
| 4 | **Aba "Partes"** + resolução de faixa por `uid`/rótulo | Não |
| 5 | **Matriz de classificação** (Biblioteca) + `classificacao_id` do doc + pendências | Não (NULL = herda, como hoje) |
| 6 | Script de preenchimento (dry-run) do que hoje é herdado → conferir | Não |
| 7 | Leitura passa a olhar doc→pasta; **uma só** herança no lugar das 4–5 cópias | Sim — atrás de conferência |
| 8 | Seletor (documento+parte+classificação) e matriz de regras no **Adaptativo**, depois **Gerador** | Sim — fallback na regra atual |
| 9 | Registrar partes/seleção na trava do purge e na lixeira | Segurança |
| 10 | Desligar leitura antiga (`cronograma_tipo_material`, fallback pdfull, regras por título) onde a conferência = 0 | Só após fechar |

Cada fase é reversível e sai em release própria ("cpi" só quando você pedir).

## 9. Correções pontuais já identificadas (independentes das fases)

- 8 metas do Adaptativo apontando para documentos deletados/despublicados; 16 metas LegProc de catálogo sem documento.
- 254 docs sem tipo (cairiam como PDFull) e 47 sem pasta.
- 283 docx com `paginas` nulo; 170 versões com conversão a revisar; 46 docx sem trechos.
- `leitura_legproc` em 0: decidir se a flag do doc continua existindo ou se a classificação a substitui.

## 10. Decisões em aberto

1. `Artigo único`/leis sem "Art." entram no corte automático do LegProc? (proposta: sim, como 1 parte).
2. Citação dentro de tabela/caixa: nunca conta como dispositivo? (proposta: nunca.)
3. Os 254 docs sem tipo: classificar em lote por regra (título "PDFIGHT/PDFLASH") ou manual pela matriz? (proposta: sugerir por regra, confirmar na matriz.)
4. Purge: arquivar partes automaticamente ao soft-delete do documento? (proposta: sim.)
5. Por onde começar o seletor de metas: Adaptativo (proposta) ou Gerador.

## 11. Não fazer agora

- Reescrever o motor do Adaptativo (`conteudo-banco.ts`, `pf:<i>`).
- Mexer em Desafios/Maratona/Lei Seca (configuração própria nas pastas).
- Apagar `cronograma_tipo_material`, `leitura_legproc` ou qualquer leitura atual antes da Fase 10.
