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
