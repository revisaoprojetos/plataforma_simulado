# Meus Cadernos — modelo OneNote (Fase 1): contrato

Migrações: `supabase/migrations/20261127000000_caderno_onenote_fase1.sql` (schema) e `20261127010000_caderno_onenote_importar.sql` (importação).
Tabelas antigas (`simulado_aluno_cadernos`, `_caderno_questoes`, `_caderno_itens`, `_caderno_destinos`) NÃO são alteradas; seguem servindo o leitor até a fase 2.

## 1. Tabelas

```
simulado_aluno_notebook (1 por tenant+estudante, UNIQUE)
  id, tenant_id, estudante_id, titulo, criado_em, atualizado_em
     │ 1:N (cascade)
simulado_aluno_notebook_secoes
  id, tenant_id, notebook_id, estudante_id, nome, cor, ordem(double), tipo[manual|auto_erros|auto_favoritos|importada],
  origem_tipo/origem_id (UNIQUE por notebook), deletado_em
     │ 1:N (cascade)
simulado_aluno_notebook_paginas
  id, tenant_id, notebook_id, secao_id, estudante_id, titulo, tipo_pagina[texto|folha_livre], doc jsonb (<=2MB),
  tinta jsonb (reservado), texto_busca (extraído no servidor), busca tsvector GERADO (título A + texto B, 'portuguese'),
  versao int, ordem(double), arquivada, deletado_em (lixeira), client_op_id (UNIQUE: criação idempotente),
  ultimo_op_id (último PATCH aplicado), origem_tipo/origem_id (UNIQUE por notebook)
```
Índices: `(estudante_id, secao_id, ordem)` parcial (vivas), GIN em `busca`, lixeira, unique de origem/client_op_id.
Seções `auto_*` não têm páginas: o conteúdo é calculado no servidor (somente leitura); a linha só guarda cor/ordem (1 por tipo).
`ordem` é double: reordenar = ponto médio entre vizinhos (sem renumerar); se a diferença < 1e-6, o servidor renumera a seção em 1024*n.
Triggers: `atualizado_em`; checagem de que seção/página pertencem ao mesmo tenant+estudante do notebook.
RLS: `tenant isolation` com `user_tenant_ids()` + grants `service_role`. Acesso real = service role + dono (ver §3).

## 2. Formato do `doc` da página (TipTap/ProseMirror JSON)

Raiz `{"type":"doc","content":[...]}`. Nós/marks padrão (StarterKit): paragraph, heading(1-3), bulletList, orderedList, listItem,
blockquote, codeBlock, horizontalRule, hardBreak, taskList/taskItem, table*, text; marks: bold, italic, underline, strike, highlight(cor), link, textStyle(color).

Nós custom (todos `atom`, bloco, sem `content`):
```json
{"type":"questaoRef","attrs":{"questao_id":"<uuid>"}}
{"type":"grifoSnapshot","attrs":{"documento_id":"<uuid>","documento_versao":3,"documento_titulo":"...","pagina":12,
   "texto":"trecho grifado","rects":[{"x0":0.1,"y0":0.2,"x1":0.8,"y1":0.22}],"cor":"y","tool":"hl",
   "prefix":"...","suffix":"...","inicio":10,"fim":50,"link":"/aluno/...#grifo=<id>"}}
{"type":"anotacaoRef","attrs":{"origem_tabela":"simulado_conteudo_anotacoes|simulado_aluno_caderno_itens","origem_id":"<uuid>","html_legado":"<html opcional, só importados>"}}
```
- `questaoRef` guarda só o id; o enunciado/gabarito são carregados pelo servidor (`GET /pagina/:id` devolve `refs.questoes` hidratadas) — nada de cópia do enunciado no doc.
- `grifoSnapshot` é SNAPSHOT (sobrevive a edição/remoção do documento); `link` é montado pelo servidor na leitura, nunca confiado do cliente.
- `anotacaoRef.html_legado` é exibido sempre como TEXTO/HTML sanitizado (§4).
- Nó desconhecido => rejeitar com 422 (lista branca). Profundidade máx. 20; máx. 5.000 nós; `doc` <= 2 MB.
- Reservado para fase posterior: `tipo_pagina='folha_livre'` e coluna `tinta`.

## 3. Rotas (route handlers, SEM server actions)

Todas: `export const dynamic = 'force-dynamic'`; `const sessao = await getSessaoAluno()` (401 se nula); `createAdminClient()`;
TODA query filtra `.eq('tenant_id', sessao.tenantId).eq('estudante_id', sessao.estudanteId)` (dono+tenant); id de outro => 404 (não 403, evita enumeração).
O notebook é criado sob demanda (`upsert onConflict tenant_id,estudante_id`). Erros de tabela ausente => 503 com mensagem de migração (padrão `tabelaAusente`).

| Rota | Corpo / query | Resposta |
|---|---|---|
| `GET /api/aluno/notebook` | — | `{notebook:{id,titulo}, secoes:[{id,nome,cor,ordem,tipo,qtd_paginas}], paginas:[{id,secao_id,titulo,ordem,atualizado_em}]}` — árvore LEVE (sem `doc`). Seções automáticas entram sempre, com `qtd_paginas` = contagem calculada. Páginas por seção limitadas a 200 (`pagina_limite`); `?secao_id=&offset=&limit=` pagina via `.range()` + `count:'exact'`. |
| `POST /api/aluno/notebook/secoes` | `{nome, cor?, ordem?, client_op_id?}` | 201 `{secao}` |
| `PATCH /api/aluno/notebook/secoes/:id` | `{nome?, cor?, ordem?}` | `{secao}`; seções `auto_*`: só `cor`/`ordem` |
| `DELETE /api/aluno/notebook/secoes/:id` | — | soft delete (`deletado_em`) da seção e suas páginas; `auto_*` => 400 |
| `POST /api/aluno/notebook/paginas` | `{secao_id, titulo?, doc?, ordem?, client_op_id (uuid, obrigatório)}` | 201 `{pagina:{id,versao:1,...}}`; repetido com mesmo `client_op_id` => 200 com a página existente (idempotente) |
| `GET /api/aluno/notebook/paginas/:id` | — | `{pagina:{id,secao_id,titulo,doc,versao,atualizado_em}, refs:{questoes:[...]}}` |
| `PATCH /api/aluno/notebook/paginas/:id` | `{versao, client_op_id, doc?, titulo?, secao_id?, ordem?, arquivada?}` | 200 `{ok:true, versao:<nova>, atualizado_em}`. **409** `{code:'conflito', versao_atual, pagina}` se `versao` ≠ atual. `client_op_id` == `ultimo_op_id` => 200 com a versão atual (replay idempotente, sem reaplicar). |
| `DELETE /api/aluno/notebook/paginas/:id` | `?definitivo=1` opcional | padrão: lixeira (`deletado_em=now()`); `definitivo` só se já está na lixeira. `POST .../restaurar` desfaz. |
| `GET /api/aluno/notebook/busca?q=&secao_id=&offset=&limit=` | `q` 2..100 chars; `limit` <=30 | `{total, itens:[{id,secao_id,titulo,trecho(ts_headline),rank}]}` |
| `GET /api/aluno/notebook/auto/erros?offset=&limit=` | — | `{total, itens:[QuestaoAluno]}` paginado |
| `GET /api/aluno/notebook/auto/favoritos?offset=&limit=` | — | idem |

**PATCH atômico (otimista):** 
`update ... set doc=$1, titulo=$2, texto_busca=$3, versao=versao+1, ultimo_op_id=$op where id=$id and tenant_id=$t and estudante_id=$e and versao=$versao and deletado_em is null returning versao`.
0 linhas => reler: se `ultimo_op_id=$op` => replay OK; senão 409 (cliente mostra "editada em outro dispositivo": recarregar ou salvar cópia). O servidor extrai `texto_busca` do `doc` (percorre `text`, `grifoSnapshot.texto`, `questaoRef` ignorado) — o cliente nunca envia `texto_busca` nem `busca`.
Cliente: autosave com debounce ~1,5 s, 1 requisição em voo por página (fila), `client_op_id` novo por save, reenvia o MESMO id em retry de rede.

**Seções automáticas (backend-first, somente leitura):**
- erros = reaproveitar `lib/aluno/cadernos-aluno.ts` (última resposta de `simulado_respostas_avulsas` errada), paginar os ids no servidor e hidratar só a página pedida.
- favoritos = `simulado_favoritos` (sem tenant_id; escopo = estudante) ordenado por `criado_em desc`, `.range()`.
- Contagem para a árvore: `count:'exact', head:true` (favoritos) e contagem de ids únicos de erros com cache curto (60 s) por estudante.

**Paginação/perf:** árvore sem `doc`; `doc` só no GET de página; `.in()` sempre com chunk 80 (`fetchAllByIn`); busca = `busca @@ websearch_to_tsquery('portuguese', $q)` com `ts_rank`, `ts_headline` só nas linhas da página. Sem N+1.

## 4. Sanitização

1. **Fonte da verdade é JSON, não HTML.** O servidor valida o `doc` contra a lista branca de nós/marks/attrs (§2); descarta attrs desconhecidos; rejeita nó/mark desconhecido (422).
2. Attrs: `questao_id`/`documento_id`/`origem_id` = uuid válido; `pagina`, `inicio`, `fim` = inteiros >= 0; `rects` <= 60 itens com 4 números finitos (reaproveitar `rectsValidos`); `cor` ∈ paleta de tokens; textos truncados (`texto` <= 2000, `html_legado` <= 100000).
3. `link` (mark e `grifoSnapshot.link`): só `https:`, `http:`, `mailto:` ou caminho relativo `/aluno/...`; `javascript:`/`data:` => removido. Marks de link recebem `rel="noopener noreferrer nofollow"` e `target=_blank` no render.
4. **Nunca `dangerouslySetInnerHTML` com conteúdo do aluno.** O editor renderiza via TipTap/React (ou `generateHTML` + DOMPurify no servidor para PDF/export). `html_legado` só passa por `htmlParaTexto` ou DOMPurify (sem `script/style/iframe/on*`, sem `style=` externo).
5. Imagens coladas: fora da fase 1 (rejeitar nó `image` com `src` `data:`); fase posterior usa storage com validação de mime/magic bytes.
6. Limites: título 200, doc 2 MB, 5.000 nós, 200.000 chars de `texto_busca`, 200 páginas/seção na árvore, rate limit por estudante nos PATCH (~10/s).
7. Logs/auditoria: não registrar `doc` em log; só ids e versão.

## 5. Importação — verificação (risco nº 1: perda de dados)
- O script só lê as tabelas antigas; roda em transação; termina com **trava** que dá `raise exception` (rollback) se algum caderno ou item não-questão ficou sem correspondente.
- Rodar as consultas de conferência do cabeçalho do arquivo ANTES e DEPOIS; `faltam_*` devem ser 0 e `questoes_em_paginas` == nº de pares (caderno, questão) distintos.
- Idempotente por `origem_tipo/origem_id` UNIQUE; reexecutar importa só o novo.
- Premissa a validar antes: `aluno_id` das anotações/grifos de conteúdo == `estudante_id`.
- Não importado (decisão): grifos de PDF sem nota (permanecem no leitor); favoritos e erros (seções automáticas).
- Rodar primeiro em cópia/staging; guardar `pg_dump -t` das 4 tabelas antigas antes de produção.

---

## Apêndice — Fase 2 OneNote (camada de dados/API)

Migração: `supabase/migrations/20261129000000_caderno_onenote_paginas_nivel.sql` (aditiva/idempotente; aplicar manualmente no SQL editor).
Antes de aplicada, TUDO segue funcionando: a árvore e o GET de página devolvem `nivel=0, fundo=null, regua=null, ordenar_por='manual'`
(fallback por detecção de coluna ausente — `colunaAusente()`: 42703/PGRST204); PATCH que grava coluna nova responde 503 `migracao_pendente`.

### Colunas novas
| Tabela | Coluna | Regra |
|---|---|---|
| `simulado_aluno_notebook_paginas` | `nivel smallint not null default 0` (0..2) | 0=página, 1=subpágina, 2=sub-subpágina. Hierarquia = SEQUÊNCIA por `ordem` na seção + `nivel`; invariante `nivel[i] <= nivel[i-1]+1`, 1ª página = 0 |
| | `fundo text` | chave de `PALETA_FUNDO` (16 cores, `lib/aluno/notebook-tipos.ts`); null = branco; nunca hex |
| | `regua text` | null \| `estreita\|media\|larga\|extra\|grade_p\|grade_m\|grade_g` |
| `simulado_aluno_notebook_secoes` | `ordenar_por text not null default 'manual'` | `manual\|criacao\|modificacao\|titulo` |

### Regra de agrupamento/ordenação (`ordenarArvore`, `lib/aluno/notebook-arvore.ts`)
1. Entrada na ordem manual `(ordem, id)`; vira BLOCOS: cada página `nivel 0` abre um bloco e as seguintes de `nivel>0` pertencem a ele.
2. Só blocos são reordenados; dentro do bloco, filhos mantêm a ordem manual — subpágina nunca sai de baixo do pai.
3. `criacao`: `criado_em` do PAI, mais antigo primeiro. `modificacao`: `atualizado_em` mais recente do BLOCO (pai ou filho), mais recente primeiro. `titulo`: título do PAI, A–Z pt-BR (sem acento/caixa, números naturais). Empate = ordem manual.
4. `manual` pagina no banco (`.range()`); os demais leem até 1000 páginas da seção (`LIMITES.ordenarMax`), ordenam em memória e então aplicam `offset/limit`.

### Rotas (todas: sessão de aluno + beta, filtro tenant+estudante, id alheio => 404, rate limit de escrita)
| Rota | Corpo | Resposta / regras |
|---|---|---|
| `GET /api/aluno/notebook[/arvore]` | — | páginas: `{id,secao_id,titulo,tipo_pagina,ordem,nivel,criado_em,atualizado_em,fundo,regua}`; seções: `+ordenar_por`; páginas já na ordem final de cada seção |
| `GET /paginas/:id` | — | `pagina` agora inclui `nivel,fundo,regua,criado_em` |
| `PATCH /paginas/:id` | `+ nivel? (0..2), fundo? (chave|null), regua? (lista|null)` | `nivel` sofre CLAMP: `min(nivel, nivel da página anterior na ordem final + 1)`, 1ª da seção = 0; resposta inclui `nivel` efetivo. Depois do update, os níveis das páginas seguintes (e da seção de origem, se mudou) são normalizados em cascata. Mantém `versao`/`client_op_id` |
| `PATCH /secoes/:id` | `+ ordenar_por?` | enum; resposta inclui `ordenar_por` |
| `POST /paginas/:id/mover` | `{secao_id, antes_de_id?}` | move a página + subpáginas CONTÍGUAS (nível maior) para seção manual do mesmo aluno; ordem por ponto médio (renumera 1024·n se espaço < 1e-6); níveis do bloco reajustados ao vizinho; seção `auto_*` => 400; `antes_de_id` fora do destino => 400. `{ok, secao_id, ids, ordens}` |
| `POST /paginas/:id/copiar` | `{secao_id, client_op_id (uuid, obrigatório)}` | duplica SÓ a página (título, doc, tinta, texto_busca, fundo, régua) no fim do destino; `nivel` = clamp do original pelo vizinho; repetido => 200 com a cópia existente; novo => 201 |
| `GET /lixeira?offset&limit` | — | `{dias:60,total_paginas,total_secoes,paginas:[{id,titulo,secao_id,secao_nome,secao_deletada,deletado_em}],secoes:[{id,nome,cor,deletado_em,qtd_paginas}]}`; só `deletado_em` nos últimos 60 dias; cada lista com `.range()+count`; `.in()` em chunks de 80 |
| `POST /secoes/:id/restaurar` | — | restaura seção (apagada ≤ 60 dias) + páginas apagadas JUNTO (mesmo `deletado_em`, janela 1 s); `{id, paginas_restauradas}`. Restaurar página já existia (`POST /paginas/:id/restaurar`, exige a seção viva) |
| `GET /busca` | `+ escopo=pagina\|secao\|caderno, pagina_id, secao_id` | `escopo=pagina` exige `pagina_id` e devolve `itens:[{..., trecho, ocorrencias:[até 30 trechos]}]`, `total`=nº de ocorrências; `secao` exige `secao_id`; sem `escopo`, `secao_id` continua filtrando (retrocompatível) |

### Purga da lixeira
NÃO existe job que elimine definitivamente itens > 60 dias. A listagem só mostra os últimos 60 dias (filtro), mas as linhas permanecem no banco
(só o DELETE `?definitivo=1` as remove). Se for desejado, criar rotina futura: `delete ... where deletado_em < now() - interval '60 days'` (páginas antes das seções).

### Cliente / tipos
- Tipos e constantes: `lib/aluno/notebook-tipos.ts` (`PaginaArvore`, `SecaoArvore`, `Lixeira`, `PALETA_FUNDO`, `REGUAS`, `ORDENAR_POR`, schemas zod).
- Regras puras: `lib/aluno/notebook-arvore.ts` (`clampNivel`, `normalizarNiveis`, `ordenarArvore`, `agruparBlocos`, `intervaloBloco`, `planejarMover`).
- Cliente fetch: `lib/aluno/notebook-cliente.ts` (`moverPagina`, `copiarPagina`, `listarLixeira`, `restaurarSecao`, `definirNivel`, `definirAparencia`, `definirOrdenacaoSecao`) — separado de `notebook-api.ts`, que é `server-only`.

---

## Apêndice — Onda 2a (texto rico, marcas, imagem e anexo)

**Lista branca do doc estendida** (`lib/aluno/notebook-tipos.ts` + `notebook-server.ts` + `notebook-texto.ts`):

- Nós novos: `image` (`src` obrigatório e SOMENTE `/api/aluno/notebook/arquivos/<uuid>.<png|jpg|webp|gif>`, `alt`, `width` 24..2000) e `anexo` (`arquivo` = `<uuid>.<pdf|docx|xlsx|pptx|txt>`, `nome`, `tamanho`). Ambos atômicos.
- Marks novos: `subscript`, `superscript`, `textStyle` (`color` #rrggbb/token/var(--x), `fontFamily`, `fontSize` 6..200px). `highlight.color` agora aceita #rrggbb/token/var(--x).
- Atributos de bloco em `paragraph`/`heading`: `textAlign` (center/right/justify), `indent` (1..8), `marca` (importante/pergunta/lembrar/definicao), `estilo` (`titulo_pagina`). `heading.level` agora 1..6. "A Fazer" continua sendo `taskList/taskItem`.
- Links: continuam só https/http/mailto/`/aluno/...`. Ligação interna = `/aluno/nova/cadernos/onenote?pagina=<uuid>`.

**Arquivos do aluno** — `POST /api/aluno/notebook/arquivos` (multipart `file` + `tipo=imagem|arquivo`) e `GET /api/aluno/notebook/arquivos/<uuid>.<ext>[?nome=]`:

- Sessão de aluno + beta liberado; valida tamanho (5 MB imagem / 10 MB arquivo), extensão e magic bytes (`lib/storage/validate.ts`, via `validarUploadNotebook`). Imagem: png/jpeg/webp/gif (extensão vem da assinatura). Arquivo: pdf/docx/xlsx/pptx/txt.
- Caminho no storage: `caderno-arquivos/<tenantId>/<estudanteId>/<uuid>.<ext>` (bucket PRIVADO; sem URL pública). O GET monta o caminho com tenant+estudante da SESSÃO, então um aluno nunca alcança arquivo de outro. Resposta: `nosniff`, CSP `sandbox`, imagem inline / demais attachment, `Cache-Control: private`.
- **Sem migração de tabela.** Bucket: `STORAGE_CADERNO_BUCKET` (opcional); se ausente usa o bucket de conteúdo (`resolverBucketConteudo`, hoje `pdfs`). Se o storage falhar, o POST responde 503 `storage_indisponivel` e o editor mostra aviso.
- Limitação conhecida: arquivos não são apagados do storage ao remover o nó/página (sem tabela de referência); limpeza futura = varrer `caderno-arquivos/<tenant>/<estudante>/` contra os docs.

## Apêndice — Endurecimento de segurança (auditoria do Caderno)

Correções aplicadas após a auditoria. Tudo é tolerante a migração pendente; a única migração nova é `20261129020000_caderno_onenote_rpc_mover.sql` (o dono aplica manualmente).

### Contratos que mudaram (para o front)
- **`GET /paginas/:id` -> `refs.questoes`**: só questões **do tenant da sessão** e publicadas. Questões que o aluno **ainda não respondeu** vêm com `gabarito_oculto: true`, todas as `alternativas[].correta = false` e `comentario_professor = null`. O gabarito sai do servidor só depois de uma resposta em `simulado_respostas_avulsas` (POST `/api/aluno/questao-resposta` devolve `correta`). `auto/favoritos` segue a mesma regra; `auto/erros` e os cadernos antigos não mudam (erros já são respondidos).
- **`grifoSnapshot`**: `documento_id` e `pagina` são **opcionais** (ausente/`null` = omitido); presentes e inválidos continuam rejeitados (422). Attrs desconhecidos (`origem_item_id`, `origem_anotacao_id`, `origem_grifo_id`) são **descartados em silêncio**.
- **`PATCH /paginas/:id`**: `doc` + `tinta` juntos => 422 `doc_e_tinta`; `doc` em folha => 422 `doc_em_folha`; `tinta` em página de texto => 422 `tinta_em_texto`.
- **Corpo JSON**: teto 3 MB (413 `corpo_grande`), por `content-length` e por leitura em stream. Folha: ao máximo 150 000 pontos no total (checagem barata antes do zod; 422).
- **Upload `/arquivos`**: `content-length` obrigatório (411 `content_length_obrigatorio`), 413 antes de bufferizar; cota por aluno 200 MB / 300 arquivos (413 `cota_excedida`) **quando a tabela `simulado_aluno_notebook_arquivos` existe** (migração nova; sem ela só vale o limite por requisição). A cota não é transacional: uploads simultâneos podem passar por poucos itens (o rate limit de 4/s limita o estrago).
- **Teto de páginas por notebook: 2000** (criar/copiar/importar bloco/restaurar) => 422 `limite_paginas`. Teto de seções (100) também na restauração de seção.
- **`GET /arvore` sob impersonation `read_only`** nunca cria notebook/seções: sem notebook devolve `{ notebook: { id: null }, secoes: [], paginas: [], somente_leitura: true }`.
- **Restaurar seção**: igualdade EXATA do `deletado_em` (a exclusão grava o mesmo instante na seção e nas páginas); páginas apagadas antes continuam na lixeira. **Restaurar página**: só se apagada há <= 60 dias; se a ordem colidir vai para o fim da seção; níveis da seção são renormalizados.
- **`POST /secoes` idempotente**: replay devolve a seção existente (`replay: true`); `23505` de corrida vira replay (sem 500); seção do mesmo `client_op_id` já excluída => 409 `secao_excluida`.
- **Exclusão definitiva de página**: apaga do storage (best-effort) os arquivos que nenhuma outra página do aluno referencia; depende da RPC `notebook_arquivos_orfaos` (sem ela nada é apagado — uma cópia pode referenciar o mesmo arquivo).

### Storage: `STORAGE_CADERNO_BUCKET` (obrigatório em produção)
Os arquivos do aluno (imagens/anexos) são **privados** e servidos só pela rota autenticada. Sem `STORAGE_CADERNO_BUCKET` o código **falha fechado em produção** (`503 storage_indisponivel` pedindo a variável); em desenvolvimento/teste ainda cai no bucket de conteúdo (que pode ser público). A variável é repassada ao serviço `web` em `docker-compose.portainer.yml` (vazia por padrão): **defina um bucket PRIVADO** no stack antes de liberar o upload.

### Migração `20261129020000_caderno_onenote_rpc_mover.sql`
`notebook_mover_bloco` (uma transação; trava a seção; `tenant+estudante` validados dentro da função; `versao++` de quem teve o nível alterado; cascata de níveis nas duas seções), `notebook_normalizar_niveis`, `notebook_buscar` (trecho calculado no banco: não trafega `texto_busca` de 200 KB × 30), `notebook_arquivos_orfaos` e a tabela `simulado_aluno_notebook_arquivos` (cota). Funções `security definer`, `search_path` fixo, `execute` só para `service_role`. O código chama a RPC e cai no caminho antigo se ela não existir (PGRST202 / 42883); no caminho antigo a busca devolve no máximo 10 itens por requisição.

### Rate limit de GETs caros
`/busca`, `/lixeira` e `/auto/*` usam o mesmo `limiteEscrita` (chave com prefixo por rota; ≈ 5/s por aluno). **O contador é em memória por réplica do `web`**: com N réplicas o teto efetivo é ~N× — é freio contra rajada, não cota global (isso exigiria Redis/tabela).

### Riscos aceitos / NÃO feitos (decisão do dono)
- **M4 (RLS/revoke)** — NÃO alterado. As tabelas do caderno têm RLS `tenant_id in (select user_tenant_ids())` para `authenticated`, mas a RLS não filtra por `estudante_id`: se algum dia o front falar com o Postgres/PostgREST direto com o JWT do aluno, um aluno poderia ler/escrever cadernos de colegas do mesmo tenant. Hoje não acontece porque todo acesso passa pelas rotas (service role + filtro tenant+estudante). **Recomendação**: `revoke all on` as 4 tabelas `from anon, authenticated` (mantendo `service_role`) ou policies com `estudante_id = <id do aluno do JWT>`; mudar isso é decisão do dono por afetar o padrão do projeto.
- **A1 (validação na escrita)** — `questaoRef.questao_id` é só validado como uuid na gravação; a existência/tenant é aplicada **na leitura** (`questoesParaAluno` filtra por tenant). Um uuid forjado vira referência morta, sem vazamento.
- **M5 (bytes totais por aluno)** — não implementado (exigiria agregação por aluno); o teto de 2 MB por página × 2000 páginas é o limite prático.
- **B5/B7/B8** — seguem documentados como estavam (sem alteração neste ciclo).
- Escritas sob impersonation `read_only` não são bloqueadas por estas rotas (a guarda central de impersonation é a responsável); só o GET da árvore foi tornado sem efeitos colaterais.

## Apêndice — Otimização de servidor (auditoria de desempenho)

Migração `20261129030000_caderno_onenote_perf.sql` (aditiva/idempotente, SEM `concurrently`; o dono aplica no SQL editor). O código funciona sem ela (fallback por PGRST202/42883/coluna ausente).
Cria: índices `idx_rav_tenant_est_questao_resp` (respostas avulsas: tenant, estudante, questao, respondido_em desc) e `idx_nb_paginas_secao_ordem_vivas` (parcial `deletado_em is null`); RPCs `security definer`, `search_path` fixo, `execute` só `service_role`, filtrando tenant+estudante: `notebook_contar_erros(p_tenant,p_estudante)`, `notebook_listar_erros(p_tenant,p_estudante,p_offset,p_limit)` (ids + `total` por linha; limite máx 200) e `notebook_contar_paginas(p_tenant,p_estudante)` (secao_id, qtd de páginas vivas e não arquivadas).

- **S1** "Meus erros": `contarErrosAluno` usa a RPC (cache 60 s) e só cai em `idsErrosAluno` (baixa todas as respostas) se a RPC não existir; `listarAutoErros` usa `notebook_listar_erros` com fallback.
- **S2** Gate do beta (`caderno-beta-acesso.ts`): cache em memória por réplica, `${tenant}:${estudante}` 30 s (positivo e negativo) e grupos do tenant 60 s. **Atraso máximo para remover alguém do beta = 30 s por réplica** (até ~90 s se a troca for na lista `caderno_beta_grupos` do tenant). Falha de banco não é cacheada. `alunoBloqueado` e `revogadasEm` (lib/aluno-session) já têm cache de 60 s no Redis (`remember`) — NÃO alterados (fora do escopo; encurtar exigiria mudar o login).
- **S3** índice parcial das páginas vivas (acima).
- **S4** PATCH da página, replay/409: primeiro `select versao, atualizado_em, ultimo_op_id, tipo_pagina`; só um conflito real relê doc/tinta para devolver `pagina`.
- **S5** `GET /api/aluno/notebook/paginas/:id?campos=versao` => `{ok, pagina:{id, versao, atualizado_em}}` (sem doc/tinta/refs, sem hidratar questões).
- **S6** `montarArvore`: seções + contagem agregada (`notebook_contar_paginas`) em paralelo, sem `count: exact` por seção quando a RPC existe; contagens das seções automáticas em paralelo com as páginas. `montarLixeira`: páginas e seções em `Promise.all`; contagem por seção apagada em UMA consulta estreita (cai na contagem por seção se bater 5000 linhas). `garantirEstrutura` fica memorizada por notebook (10 min, por réplica): a árvore deixa de repetir o select de seções.
- **S7** `GET auto/erros` e `auto/favoritos`: cada item ganha `enunciado_texto` (HTML limpo, espaços colapsados, ≤ 400 chars) ao lado de `enunciado` (inalterado). **O front pode passar a usar `enunciado_texto` nas listas.**
- **S8** `tabelaAusente` já cobre 42703/PGRST204 (além de 42P01/PGRST205); todas as rotas respondem 503 `migracao_pendente` via `respErroDb`. Teste adicionado.

### POST /api/aluno/notebook/paginas (criação otimista e enxuta)
Corpo (novos, opcionais): `id` (uuid escolhido pelo cliente, usado como id da linha), `antes_de_id` (uuid; posiciona logo ANTES da página da MESMA seção, ordem por ponto médio; ignorado se `ordem` vier; de outro aluno/seção => 400) e `nivel` (0..2, clamp como no PATCH: ≤ nível da página anterior + 1; fora de 0..2 => 400). Se inserir antes de uma página mais recuada, os níveis seguintes são normalizados.
Idempotência: repetir `client_op_id` => 200 com a página existente (mesmo se o `id` vier diferente). `id` já usado por OUTRA linha (inclusive de outro aluno/tenant) => 409 `id_em_uso` sem detalhes.
Resposta mínima: `{ok, pagina:{id, secao_id, titulo, tipo_pagina, ordem, nivel, versao, criado_em, atualizado_em}}` (201; `nivel`=0/`criado_em`=null antes da migração fase 2).
Latência: não chama mais `garantirNotebook`/`garantirEstrutura` (usa `notebook_id` da seção validada; seção inexistente => 404). Uma única rodada `Promise.all` (idempotência, seção, teto de 2000 por contagem `head`, última ordem ou página `antes_de_id`) + o insert; só `antes_de_id` tem 1 consulta serial extra (vizinho de cima). Testes fixam o limite de 5 consultas no caminho quente.
