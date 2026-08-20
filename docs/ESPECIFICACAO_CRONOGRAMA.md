# Gerador de Cronogramas — especificação funcional

O que a aplicação faz, sem tecnologia: dados, telas, campos, regras e fluxos.
Escrito para recriar a aplicação em outra plataforma.

Levantado do `index.html` em produção e dos dados já extraídos em `seed/dados/`.

| | |
|---|---|
| Catálogo | 24 cronogramas |
| Metas | 16.697 |
| Links de aula | 405 |
| Disciplinas | 24 + o pseudo-valor `Atividade` |

**Índice**

1. [O que a aplicação faz](#1-o-que-a-aplicação-faz)
2. [Modelo de dados](#2-modelo-de-dados)
3. [A tela do gerador](#3-a-tela-do-gerador)
4. [O formulário, campo a campo](#4-o-formulário-campo-a-campo)
5. [Botões e o que cada um exige](#5-botões-e-o-que-cada-um-exige)
6. [Regras de negócio](#6-regras-de-negócio)
7. [Os três documentos gerados](#7-os-três-documentos-gerados)
8. [CRUD de cronogramas](#8-crud-de-cronogramas)
9. [Importação dos cronogramas atuais](#9-importação-dos-cronogramas-atuais)
10. [Catálogo atual](#10-catálogo-atual)
11. [Registro de uso](#11-registro-de-uso)

---

## 1. O que a aplicação faz

Existe um catálogo de **cronogramas de estudo prontos**, montados pela equipe
pedagógica. Cada um é uma grade fixa: N semanas, cada semana com metas
distribuídas por dia da semana e por tipo de atividade.

O aluno não monta o cronograma. Ele **escolhe um**, informa a data de início e
algumas preferências, e a aplicação faz duas coisas:

- **Data** a grade — transforma "semana 7, dia 2" em "quarta-feira, 24/09/2026".
- **Reprograma** a grade — insere semanas de revisão periódica e semanas de
  recesso, renumerando tudo em volta.

O resultado aparece numa tabela na tela e pode ser exportado como **cronograma
em DOCX**, **ficha de desempenho em DOCX** e **CSV**.

> Nada do que o aluno preenche fica guardado hoje. O aviso em tela diz isso com
> todas as letras: se ele não baixar o DOCX, perde o cronograma ao fechar a
> página.

### O que é fixo e o que é do aluno

| Fixo no catálogo (equipe) | Escolhido pelo aluno (não persiste) |
|---|---|
| Nome do cronograma, total de semanas, dias de curso, todas as metas (disciplina, aula, conteúdo, duração) e os links de questões | Nome, carga horária, data de início, cronograma, revisões periódicas, recesso e paleta de cores das tabelas |

---

## 2. Modelo de dados

Três entidades sustentam o gerador. Uma quarta e uma quinta aparecem só se você
quiser login e rastreio.

### Cronograma

Um plano de estudos pronto. É a unidade do catálogo e do CRUD.

| Campo | Tipo | Descrição |
|---|---|---|
| `nome` | texto **obrigatório** | Ex.: "9 Matérias Essenciais (4 horas)". Aparece no seletor e no DOCX. |
| `slug` | texto único | Identificador estável derivado do nome. É a chave natural na importação. |
| `subtitulo` | texto | Texto de origem ("34 semanas · fonte DOCX"). **É recalculado em tempo de exibição** — ver R9. |
| `total_semanas` | inteiro ≥ 1 **obrigatório** | Tamanho da grade original, contando as semanas de revisão originais. |
| `dias_curso` | lista de inteiros 0–6 **obrigatório** | Quais dias da semana o cronograma usa, em ordem. `1`=segunda … `6`=sábado, `0`=domingo. Só existem três combinações hoje: `[1,2,3,4,5]`, `[1,2,3,4,5,6]` e `[1,2,3,4,5,6,0]`. |
| `dias_nome` | lista de textos **obrigatório** | Rótulos na mesma ordem: `["Seg","Ter",…]`. O tamanho dessa lista é o que a tela mostra como "dias por semana". |
| `semanas_revisao` | lista de inteiros | Semanas da grade original que são revisão e **não têm metas**. 19 dos 24 cronogramas têm. |
| `carga_horaria` | decimal | 2, 3, 4 ou 6. Hoje é **deduzida do nome** — ver a armadilha na seção 8. |
| `ordem` | inteiro | Ordem de exibição no catálogo. Sem ela a lista sai em ordem de criação. |
| `fonte` | objeto | Rastro de origem: arquivo `.docx` e categoria ("Regulares", "Específicos", "Em Extinção"). |
| `status` | `rascunho` \| `liberado` | Só os liberados aparecem para o aluno. Todo cronograma nasce rascunho. |

### Atividade (meta)

Uma linha da grade: o que fazer, em que semana, em que dia. São 16.697 no total.

| Campo | Tipo | Descrição |
|---|---|---|
| `cronograma` | referência **obrigatório** | A que cronograma pertence. |
| `semana` | inteiro ≥ 1 **obrigatório** | Nunca maior que `total_semanas` do cronograma. |
| `dia` | inteiro 0–6 **obrigatório** | **É índice dentro de `dias_curso`, não o dia da semana.** `dia = 0` significa "o primeiro dia de curso", que em `[1,2,…]` é segunda. |
| `tipo` | enumerado **obrigatório** | Um de seis — ver a tabela abaixo. |
| `disciplina` | texto **obrigatório** | "Direito Constitucional", "Processo Civil"… ou o pseudo-valor `Atividade`. |
| `aula` | texto *opcional* | **Texto, nunca número.** Existem `"01"`, `"1"` e `"1.1"`. 5.057 linhas não têm aula. |
| `conteudo` | texto *opcional* | O que estudar. Em `legproc` costuma trazer artigos de lei. |
| `duracao` | texto *opcional* | Texto livre: `"3 - 4h"`, `"30 min - 1h"`, `"1:30h - 2h"`. 12 valores distintos hoje. |
| `ordem` | inteiro | Ordem original dentro do arquivo de origem. |

#### Os seis tipos de meta

| Valor | Rótulo na tela | Rótulo no DOCX | Linhas hoje |
|---|---|---|---:|
| `pdfull` | PDFULL + Videoaula | PDFULL ou VIDEOAULA | 5.969 |
| `quest` | Resolução de Questões | RESOLUÇÃO DE QUESTÕES | 4.402 |
| `legproc` | Legproc | LEGPROC | 3.268 |
| `flash` | PDFlash / Flashcards | PDFLASH OU FLASHCARDS | 2.999 |
| `juris` | Atividade Extra | ATIVIDADE EXTRA | 59 |
| `simulado` | Simulado | SIMULADO | 0 |

> **ARMADILHA** — `simulado` existe no filtro da tela, no gerador de DOCX e no
> enumerado, mas **nenhuma das 16.697 linhas usa**. Ou o dado nunca foi
> cadastrado, ou o tipo foi abandonado. Decida antes de replicar: manter como
> opção vazia ou remover.

### Link de aula

Tabela **global**, não por cronograma: os links pertencem ao par disciplina +
aula e valem para todo cronograma que citar aquela aula.

| Campo | Tipo | Descrição |
|---|---|---|
| `disciplina` | texto **obrigatório** | Junto com `aula` forma a **chave única**. O casamento é exato: `"01"` não encontra `"1"`. |
| `aula` | texto **obrigatório** | idem |
| `tema` | texto | Título da aula. 275 das 405 têm. É o que a ficha de desempenho usa como nome da linha. |
| `url_qc` | texto | Banco de questões QConcursos. 281 preenchidos. |
| `url_tec` | texto | Banco de questões TEC Concursos. 399 preenchidos. |

### Se houver login e rastreio

- **Usuário** — nome, e-mail único, senha, perfil (`admin` / `editor` / `aluno`)
  e ativo. Login é da equipe: o aluno gera sem conta.
- **Geração** — uma linha por clique de botão, com o formulário preenchido, o
  cronograma escolhido, data/hora e a identidade de quem gerou. Ver seção 11.

---

## 3. A tela do gerador

É **uma página só**, sem navegação. De cima para baixo:

1. **Cabeçalho** — logo, título e uma frase de apresentação.
2. **Cartão do formulário** — sete campos numerados como passos, dois deles com
   subcampos que só aparecem quando fazem sentido.
3. **Aviso destacado** — "a plataforma não mantém o registro do cronograma; você
   precisa baixar o DOCX".
4. **Quatro botões** de ação.
5. **Faixa de números** — semanas, dias por semana, atividades e data de
   conclusão.
6. **Filtros** — semana e tipo de meta.
7. **Resultado** — ou a frase "Preencha suas escolhas e clique em Gerar", ou a
   tabela do cronograma.

### A tabela do resultado

Seis colunas: **Data · Dia · Tipo · Disciplina · Conteúdo · Links**. As linhas
são agrupadas por semana, e cada semana abre com uma faixa
`Semana N - dd/mm/aaaa a dd/mm/aaaa`.

Três tipos de faixa de semana:

- **Semana normal** — seguida das linhas de metas.
- **Semana de revisão** — faixa "SEMANA DE REVISÃO" e um texto orientando o que
  revisar, dividido em segunda/terça, quarta/quinta e sexta/sábado, com listas
  fixas de disciplinas. Sem metas.
- **Semana de recesso** — faixa "SEMANA DE RECESSO" e a frase "não há metas
  programadas; o cronograma será retomado na próxima segunda-feira". Sem metas.

> **COMPORTAMENTO A DECIDIR** — os dois filtros **não recarregam a tabela
> sozinhos**: o aluno escolhe o filtro e precisa clicar em "Gerar meu
> cronograma" de novo. Já mexer em carga, cronograma, data, revisão ou recesso
> **apaga a tabela** e volta ao estado vazio.
>
> Se for recriar, o natural é filtrar ao vivo e não perder o resultado.

---

## 4. O formulário, campo a campo

| # | Campo | Formato | Opções / padrão | Comportamento |
|---|---|---|---|---|
| 1 | Seu nome | texto, até 80 | vazio | Vai na capa dos dois DOCX, em caixa alta, e no nome do arquivo. |
| 2 | Quanto tempo por dia? | botões | 2h · 3h · 4h · 6h — inicia em **2h** | Cada botão mostra quantas opções tem. Trocar a carga **refiltra o seletor de cronogramas** e seleciona o primeiro. |
| 3 | Quando você começa? | data **obrigatório** | próxima segunda-feira a partir de hoje | Qualquer data é empurrada para a segunda seguinte, com aviso na tela. |
| 4 | Escolha seu cronograma | seleção | só os da carga escolhida | Rótulo = `Nome (faixa semanal)`. Abaixo, o subtítulo com a composição de semanas. |
| 5 | Incluir semanas de revisão periódicas? | sim / não | **Sim** | Se sim, revela o campo de periodicidade. |
| 5a | Revisar a cada | seleção | 4 · 6 · 8 · 10 · **12** semanas | Uma semana exclusiva de revisão após cada bloco. |
| 6 | Incluir semanas de recesso? | sim / não | **Não** | Se sim, revela o tipo de recesso. |
| 6a | Período de recesso | seleção | **Natal** · Ano Novo · Natal + Ano Novo · Outras semanas | "Outras" revela dois campos de data. |
| 6b | Início e fim do recesso | duas datas | vazio | O intervalo é esticado para semanas inteiras: da segunda anterior ao domingo seguinte. |
| 7 | Cores das tabelas | seleção | 10 paletas — **Revisão (roxo e dourado)** | Muda a tabela na tela e as cores do DOCX. **A capa não muda.** A escolha é lembrada no navegador. |

**As dez paletas:** Revisão (roxo e dourado) · Azul-marinho · Cinza-grafite ·
Lavanda sóbria · Areia e café · Bronze e carvão · Índigo · Azul-aço · Pérola e
taupe · Chumbo e prata. Cada uma define quatro cores: primária, revisão,
cabeçalho e célula.

---

## 5. Botões e o que cada um exige

| Botão | Exige | O que faz | Nome do arquivo |
|---|---|---|---|
| **Gerar meu cronograma** | data de início | Monta a tabela na tela e preenche os quatro números do topo. | — |
| **Exportar Cronograma em DOCX** | nome do aluno + data de início | Gera o documento e baixa. O botão vira "Gerando DOCX…" e trava contra clique duplo. | `cronograma_<aluno>_<cronograma>.docx` |
| **Exportar Ficha de Desempenho** | nome do aluno | Gera a planilha de acompanhamento em branco e baixa. | `ficha_desempenho_<aluno>_<cronograma>.docx` |
| **CSV** | data de início | Baixa a grade inteira em planilha. | `cronograma_<cronograma>.csv` |

Falta de dado obrigatório vira alerta e o foco vai para o campo. Cada exportação
confere se o arquivo saiu com tamanho plausível antes de entregar; se não, avisa
em vez de baixar um arquivo quebrado.

> A ficha de desempenho **não usa a data de início**: ela é um catálogo de aulas
> para preencher à mão, sem calendário.

---

## 6. Regras de negócio

É aqui que mora a aplicação. Tudo abaixo é observável no comportamento atual.

### Datas

**R1** — **Todo cronograma começa numa segunda-feira.** Se o aluno escolher
outro dia, a data é empurrada para a **segunda seguinte** — nunca para trás. O
campo é reescrito na tela e a legenda explica o ajuste.

**R2** — A semana *N* começa em `segunda base + (N-1) × 7 dias`.

**R3** — A data de uma meta sai do campo `dia`, que é **índice em `dias_curso`**:
pega-se `dias_curso[dia]` — o dia da semana alvo — e avança-se a partir da
segunda até encontrá-lo. Por isso um cronograma `[1,2,3,4,5,6,0]` tem o domingo
como **último** dia da semana, não como primeiro.

**R4** — A **data de conclusão** é a data do último dia de curso da última
semana.

### Semanas: conteúdo, revisão e recesso

**R5** — **As semanas de revisão originais do cronograma são descartadas.** Só
as semanas que têm metas sobrevivem, e elas são **renumeradas de 1 a N**, sem
buracos. Um cronograma cadastrado com 34 semanas e revisões nas semanas 12 e 24
vira, aqui, 32 semanas de conteúdo numeradas 1…32.

**R6** — Se o aluno pediu revisões, insere-se **uma semana de revisão a cada K
semanas de conteúdo** (K = 4, 6, 8, 10 ou 12). Ela entra *depois* do bloco e
ocupa uma posição própria na numeração. Semana de revisão não tem metas — tem um
texto orientando o que revisar.

**R7** — Recesso é aplicado **no calendário, não na grade**. Percorre-se semana a
semana: se a semana do calendário cai num período de recesso, ela é marcada como
recesso e **não recebe conteúdo** — o conteúdo é empurrado para a semana
seguinte. Efeito: o cronograma **fica mais longo** e a conclusão é adiada.

**R8** — O que conta como semana de recesso: **Natal** — a semana que contém
25/12. **Ano Novo** — a que contém 01/01. **Natal + Ano Novo** — as duas.
**Outras** — o intervalo informado pelo aluno, esticado para semanas inteiras (da
segunda anterior ao domingo seguinte). Sem as duas datas preenchidas, nenhuma
semana é bloqueada.

**R9** — O subtítulo mostrado abaixo do seletor é recalculado a cada mudança:
*"X semanas de conteúdo + Y revisão(ões) periódica(s) + Z semana(s) de recesso"*.
Ele ignora o subtítulo gravado no cadastro.

### Exibição das metas

**R10** — Dentro da semana, ordena-se por **dia** e depois por **tipo**, nesta
ordem fixa: pdfull → flash → legproc → quest → simulado → juris.

**R11** — **Links só aparecem em metas do tipo `quest`.** A busca é pelo par
exato (disciplina, aula). Sem link, o texto é explícito: "Não há link do QC" /
"Não há link do TEC" — não fica em branco.

**R12** — O prefixo `Aula NN -` só é escrito quando o tipo **não** é `legproc`
nem `quest`. Números de um dígito ganham zero à esquerda na exibição.

**R13** — `Atividade` não é disciplina: é o valor usado quando a linha não
pertence a uma matéria. Nesses casos o conteúdo vale sozinho, sem o prefixo
"Disciplina:". São 5.015 linhas.

**R14** — Em `legproc`, o conteúdo é quebrado em duas linhas: título em negrito e
complemento abaixo. O corte é no primeiro `Art.`/`Arts.` ou no trecho entre
parênteses no fim.

**R15** — Em `quest` com aula preenchida, exibe-se `Disciplina: Aula N` — o
conteúdo original é ignorado.

### Os quatro números do topo

**R16** — **Atividades** conta apenas as metas que **não** são `simulado` nem
`juris`. Os dois tipos aparecem no documento mas não entram na conta.

**R17** — **Dias por semana** é o tamanho de `dias_nome`. **Semanas** é o total
já com revisões e recessos. **Conclusão** só é preenchida depois de gerar.

### Derivações a partir do texto

**R18** — A **carga horária é lida do nome**: "2H" vale 2; senão procura-se um
número seguido de "hora(s)" ou "h"; não achando, assume 6.

**R19** — A **faixa semanal** do rótulo é deduzida do maior índice de dia usado:
6 ou mais → "Semana Completa"; exatamente 5 → "Segunda - Sábado"; menos →
"Segunda - Sexta".

**R20** — O seletor mostra **só os cronogramas da carga escolhida**, com rótulo
`Nome (faixa semanal)`.

**R21** — A **duração** impressa no DOCX é uma só por (semana, tipo): usa-se a
**primeira** encontrada. Em 54 combinações existem durações diferentes na mesma
semana e tipo — nesses casos algumas somem do documento.

---

## 7. Os três documentos gerados

### 1 · Cronograma em DOCX

A4 **paisagem**. Capa com imagem de fundo e o nome do aluno em caixa alta. Depois
**uma página por semana**, cada uma com cabeçalho e rodapé de imagem e uma tabela
de **oito colunas**:

- Coluna 1: **TIPO DE META**, com a duração entre parênteses embaixo.
- Colunas 2 a 8: **SEGUNDA a DOMINGO** — sempre os sete dias, mesmo em
  cronogramas de cinco.

Acima da grade, duas faixas: `SEMANA N - dd/mm a dd/mm` e
`REVISÃO - NOME DO CRONOGRAMA`.

Uma linha por tipo de meta. Os quatro tipos principais aparecem se existirem **no
cronograma inteiro**; simulado e atividade extra, só se existirem **naquela
semana**. A linha de PDFULL é mais alta que as outras.

Nas células de questões, os links QC e TEC entram como **hyperlinks clicáveis**.
Semanas de revisão e de recesso substituem a grade por um bloco de texto.

### 2 · Ficha de desempenho em DOCX

A4 paisagem, capa própria. É uma **planilha em branco para o aluno preencher à
mão** — não tem datas nem semanas.

Uma seção por disciplina, cada uma com uma tabela de nove colunas:

| Coluna | Preenchida por |
|---|---|
| AULA / CONTEÚDO | o sistema |
| LEITURA DO PDFULL · PDFLASH OU FLASHCARDS · QUANTIDADE DE QUESTÕES RESOLVIDAS · ACERTOS · ERROS – LEI SECA · ERROS – DOUTRINA · ERROS – JURISPRUDÊNCIA · OBSERVAÇÕES | o aluno, à mão |

A última seção é o **registro de simulados**: 15 linhas fixas (Simulado 01 a 15)
com sete colunas.

**Como o catálogo de aulas da ficha é montado:**

- Entram só metas de `pdfull`, `flash` e `quest`, com aula preenchida e
  disciplina diferente de `Atividade`.
- Uma linha por par (disciplina, aula) — repetições viram uma só.
- O **título** da linha segue prioridade: `quest` (usa o *tema* do link) >
  `flash` > `pdfull` (usam o conteúdo da meta). Sem nada, escreve "Aula N".
- Disciplinas na ordem em que aparecem no cronograma; aulas em ordem numérica.

### 3 · CSV

Nove colunas, uma linha por meta, **sem aplicar os filtros da tela**:

`Cronograma` · `Semana` · `Data` · `Dia` · `Tipo` · `Disciplina` · `Conteúdo` ·
`Link QC` · `Link TEC`

Datas em dd/mm/aaaa, tipo pelo rótulo legível, tudo entre aspas. Semanas de
revisão e recesso não aparecem, porque não têm metas.

> No CSV os links vêm para **qualquer** tipo de meta — diferente da tela e do
> DOCX, onde só aparecem em questões (R11).

---

## 8. CRUD de cronogramas

O que a equipe precisa fazer com o catálogo, e o que cada operação implica.

| Operação | Quem | Regra |
|---|---|---|
| **Listar** | admin, editor | Com status, carga, semanas e contagem de metas. O aluno só enxerga os liberados. |
| **Criar** | admin, editor | Nasce **rascunho**, sem metas. Slug único. |
| **Editar metadados** | admin, editor | Nome, subtítulo, carga, dias de curso e nomes dos dias, ordem no catálogo. |
| **Substituir as metas** | admin, editor | Por importação de planilha — ver seção 9. |
| **Corrigir uma linha** | admin, editor | Edição avulsa de uma meta, sem reimportar as 800. |
| **Liberar / voltar a rascunho** | **só admin** | É o que decide se o aluno vê. Guardar quem liberou e quando. |
| **Excluir** | **só admin** | Leva junto as metas do cronograma. |

> **CORRIJA AO RECRIAR** — **carga horária e faixa semanal não devem continuar
> sendo deduzidas de texto** (R18, R19). Hoje, renomear "12 Matérias (6 horas)"
> para "12 Matérias – 6h" muda silenciosamente o grupo em que o cronograma
> aparece; e um cronograma cujo nome não traga hora nenhuma cai em 6h por
> omissão.
>
> No CRUD, carga horária vira **campo explícito e obrigatório**, e a faixa
> semanal passa a ser lida de `dias_curso`, que é onde a informação realmente
> está.

### Invariantes que o CRUD precisa garantir

- `dias_curso` e `dias_nome` têm **o mesmo tamanho**.
- Todo `dia` de meta é menor que o tamanho de `dias_curso`.
- Toda `semana` de meta está entre 1 e `total_semanas`.
- Semanas listadas em `semanas_revisao` **não têm metas** — hoje isso vale para
  os 24 cronogramas, e o gerador conta com isso (R5).
- `slug` único; par (disciplina, aula) único na tabela de links.
- Reduzir `total_semanas` exige decidir o que fazer com as metas das semanas que
  deixaram de existir.

### Também precisa de CRUD: os links de aula

São 405 registros globais, e é o único lugar onde o **tema** da aula existe — o
que a ficha de desempenho usa como título. Cadastro simples: disciplina, aula,
tema, URL do QC, URL do TEC. Vale um aviso quando uma aula citada por alguma meta
de questões não tiver link.

---

## 9. Importação dos cronogramas atuais

Os 24 cronogramas já estão extraídos e congelados em três listas, fora do HTML
(`seed/dados/`). São elas que alimentam a carga inicial: **24 cronogramas,
16.697 metas, 405 links**.

### Formato das três listas

| Lista | Campos | Chave natural |
|---|---|---|
| **Cronogramas** | slug, nome, subtitulo, total_semanas, dias_curso, dias_nome, semanas_revisao, carga_horaria, fonte, ordem | slug |
| **Metas** | cronograma (slug), semana, dia, tipo, disciplina, aula, conteudo, duracao, ordem | nenhuma — o conjunto é substituído inteiro |
| **Links** | disciplina, aula, tema, url_qc, url_tec | (disciplina, aula) |

### Como a importação deve se comportar

1. **Validar antes de gravar.** Erros reportados por linha: semana fora do
   intervalo, dia fora de `dias_curso`, tipo desconhecido, disciplina vazia,
   cronograma inexistente.
2. **Mostrar prévia.** Quantas linhas entram, quantas saem, quantas mudam. Sem
   isso, uma planilha com colunas trocadas destrói 1.500 metas sem aviso.
3. **Substituir o conjunto inteiro** daquele cronograma, numa operação só — apaga
   as metas atuais e insere as novas. Ou entra tudo, ou não entra nada.
4. **Ser repetível.** Importar o mesmo arquivo duas vezes tem que dar o mesmo
   resultado, sem duplicar.
5. **Não rebaixar o que está liberado.** Reimportar metas não pode devolver o
   cronograma para rascunho.
6. **Conferir no fim** e recusar a carga se as contagens não baterem.

### Cuidados vindos dos dados reais

- **Aula é texto.** Uma planilha que converta `"01"` em número 1 quebra o
  casamento com os links, que é exato (R11). O mesmo vale para `"1.1"`, que vira
  1,1.
- **Dia é índice, não dia da semana** (R3). Quem exportar pensando em
  "1 = segunda" desloca o cronograma inteiro.
- **A grafia da disciplina é a chave dos links.** Erros de digitação já existiram
  nos dados — "Consitucional", "Direito Intrenacional", "Prev. Púb." — e eram
  corrigidos em tempo de exibição. Na importação, o certo é **normalizar na
  entrada** e manter uma lista fechada de disciplinas.
- **Duração é texto livre.** Doze formatos convivem (`"3h"`, `"30m"`, `"1:30"`).
  Se for padronizar, é agora.

---

## 10. Catálogo atual

Os 24 cronogramas, como estão hoje. "Semanas" e "Metas" são os valores
cadastrados, antes das revisões e recessos que o aluno escolhe.

| Cronograma | Carga | Dias | Semanas | Metas | Rev. | Categoria |
|---|---|---|---:|---:|---:|---|
| 2H | 2h | Seg a Sáb | 92 | 743 | 9 | Específicos |
| 9 Matérias Essenciais (2 horas) | 2h | Seg a Sáb | 69 | 561 | 6 | Específicos |
| 12 Matérias (2 horas) | 2h | Seg a Sáb | 77 | 634 | 6 | — |
| Matérias Complementares (2 horas) | 2h | Seg a Sáb | 21 | 177 | 1 | — |
| 9 Matérias Essenciais (3 horas) | 3h | Seg a Sáb | 69 | 810 | 5 | Específicos |
| 12 Matérias (3 horas) | 3h | Seg a Sáb | 77 | 868 | 6 | — |
| Matérias Complementares (3 horas) | 3h | Seg a Sáb | 21 | 249 | 1 | — |
| 6 Dias (3 horas) | 3h | Seg a Sáb | 90 | 1.006 | 5 | — |
| 9 Matérias Essenciais (4 horas) | 4h | Seg a Sáb | 34 | 581 | 2 | Em Extinção |
| 12 Matérias (4 horas) | 4h | Seg a Sáb | 58 | 859 | 4 | Regulares |
| Matérias Complementares (4 horas) | 4h | Seg a Sáb | 11 | 191 | 0 | Em Extinção |
| 5 Dias + FDS Intensivo (4 horas) | 4h | Semana completa | 56 | 684 | 6 | Regulares |
| 6 Dias (4 horas) | 4h | Seg a Sáb | 46 | 755 | 3 | — |
| Extensivo 5 Dias + Revisão (6 horas) | 6h | Semana completa | 51 | 1.142 | 0 | Em Extinção |
| 12 Matérias (6 horas) | 6h | Seg a Sáb | 41 | 869 | 3 | Específicos |
| 6 Meses (6 horas) | 6h | Seg a Sáb | 26 | 603 | 0 | Específicos |
| Complemento 6 Meses (6 horas) | 6h | Seg a Sáb | 18 | 375 | 1 | Específicos |
| Pré-Edital AGU (6 horas) | 6h | Seg a Sáb | 50 | 1.053 | 4 | Específicos |
| Pós-Formação de Base (6 horas) | 6h | Semana completa | 27 | 524 | 0 | Específicos |
| 5 Dias (6 horas) | 6h | Seg a Sex | 55 | 1.007 | 4 | Regulares |
| 6 Dias (6 horas) | 6h | Seg a Sáb | 46 | 1.003 | 3 | Regulares |
| 9 Matérias Essenciais (6 horas) | 6h | Seg a Sáb | 34 | 755 | 2 | Regulares |
| Matérias Complementares (6 horas) | 6h | Seg a Sáb | 11 | 251 | 0 | Regulares |
| Progressivo 5 Dias (6 horas) | 6h | Seg a Sex | 57 | 997 | 4 | Regulares |

### As 24 disciplinas

Direito Administrativo · Agrário · Ambiental · Civil · Constitucional · do
Consumidor · Econômico · Eleitoral · Empresarial · Financeiro · Internacional ·
Internacional Privado · Internacional Público · Penal · Previdenciário ·
Previdenciário Público · do Trabalho · Tributário · Urbanístico · Legislação De
Ensino · Legislação Penal Especial · Processo Civil · Processo Penal · Processo
do Trabalho.

Mais o pseudo-valor `Atividade` (R13).

---

## 11. Registro de uso

Como o aluno gera sem login, é preciso alguma identidade para saber **quem gerou
o quê**. O desenho que substituiu o disparo antigo:

| Identificador | Dura | Serve para |
|---|---|---|
| **Visitante** | 1 ano | Atravessa visitas: mostra que a mesma pessoa gerou três cronogramas em dias diferentes. |
| **Visita** | até fechar o navegador | Agrupa o que foi feito numa sentada. |
| **Usuário** | enquanto logado | Só quando é alguém da equipe. Entra *por cima*, sem substituir os dois acima. |

Cada clique nos quatro botões grava uma **geração** com: o botão, a data e hora
(com o fuso do aluno), o formulário inteiro, um resumo do cronograma escolhido e
a identidade. A identidade nasce na primeira geração — quem entra e não gera nada
não vira registro.

### Encaminhamento para fora

O destino externo (n8n, Zapier, endpoint próprio) **não fica no código**: é
cadastrado na área administrativa, com URL, quais eventos recebe, um segredo
opcional para assinar o envio e um botão de teste. Nasce desligado. Toda
tentativa de entrega fica registrada com status, tempo e erro — para que um
destino fora do ar seja visível em vez de silencioso.
