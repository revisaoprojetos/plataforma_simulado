# Auditoria de Integrações — Curseduca & Guru

**Tenant:** Revisão / Ensino Jurídico
**Data do laudo:** 21/09/2026 · **última atualização:** 21/09/2026 (pós-correções A1–A4 / B1–B3 + reconcile aplicado + **reverificação contra a API real da Curseduca, Fases 1–5**)
**Escopo:** erros de sincronização de alunos, falhas encontradas, correções aplicadas, responsabilidade de cada provedor e riscos futuros.

> Objetivo: consolidar tudo o que foi investigado e corrigido para (a) documentação interna e (b) subsidiar o contato com **Curseduca** e **Guru**. Cada item está classificado como **Plataforma** (bug/desenho nosso, já tratado) ou **Externo** (responsabilidade do provedor).
>
> **Status desta rodada:** código **commitado** na branch `feat/discursivas-correcao-ocr` (commits `c8d80bdc` + `1517ea5e`), **deploy à produção pendente**. Migrações `20260925000000` (descobrir_canais) e `20260926000000` (origem) **aplicadas no twdr**.

---

## Sumário executivo

| Integração | Situação atual | Causa-raiz do incidente | Ação principal com o provedor |
|---|---|---|---|
| **Curseduca** | ✅ Ativa · agrupamento automático LIGADO · 35 canais · **0 falhas** | **`502 Bad Gateway`** na API `/members` deles + **fan-out `/members/{id}` NOSSO** (causa-raiz aprofundada na reverificação — eliminado, F1) | Cobrar **estabilidade da API** e existência de **webhook de entrada** |
| **Guru** | ✅ Ativa · **1000+ eventos processados, 0 erros** | Sem falha ativa | Apenas **pedir documentação da API** e confirmar **HMAC** do webhook |

**Frase-resumo para o contato:**
- **Curseduca:** a causa-raiz foi um **502 (Bad Gateway) da API deles**; blindamos a resiliência do nosso lado e ativamos o agrupamento automático. Vale cobrá-los sobre a estabilidade da API `/members` e webhooks de entrada.
- **Guru:** **nenhuma falha ativa** — está 100% saudável. Só cabe pedir a documentação da API e confirmar a assinatura HMAC do webhook.

---

# PARTE 1 — CURSEDUCA

## 1.A. Erros e falhas observados

| # | Erro / Falha | Origem | Impacto |
|---|---|---|---|
| C1 | **API da Curseduca retornou `502 Bad Gateway`** em `/members?groupId=113` | **Externo (Curseduca)** | Foi o **gatilho** que quebrou a sincronização |
| C2 | O retry do nosso cliente **não cobria 502/504** (só 429/500/503) | Plataforma | Um erro transitório de gateway abortava tudo |
| C3 | **Sem tolerância por-grupo**: a falha de 1 canal abortava a sincronização inteira | Plataforma | Um canal ruim = ninguém sincroniza |
| C4 | **Sync automática não vinculava ao grupo** (`destino='nenhum'`) — só atualizava os cadastros | Plataforma (desenho) | **Aluno novo era reconhecido, mas ficava FORA do grupo** (caso "igorduartemaia328@gmail.com" + 63 no Lei Seca) |
| C5 | **Lock preso**: um job podia ficar em `processando` para sempre se o processo caísse | Plataforma | A fila de import entupia em silêncio |
| C6 | **Import pesado (~6 min) dentro do request HTTP** — acima do corte de 5 min do proxy | Plataforma (arquitetura) | A sync não terminava em produção sob carga |
| C7 | **Lista de canais defasada** (já foi 25/253 → 228 → hoje 35) | Config | Alunos de canais fora da lista não entram |
| C8 | **Config duplicada**: Curseduca ativa em 2 subsistemas (`simulado_curseduca_config` legado + `simulado_integracao_config`) | Plataforma (higiene) | Manutenção confusa |
| C9 | Webhook Curseduca autentica só pelo **token na URL** (sem HMAC) | Plataforma (segurança) | Latente |

## 1.B. Correções e ajustes aplicados (plataforma)

- **C2 →** o retry agora cobre **502/504** (Bad Gateway / Gateway Timeout), além de 429/500/503.
- **C3 →** **tolerância por-grupo**: o canal que falha é pulado, a sincronização segue os demais e o resultado reporta `gruposFalhos` (antes, 1 erro derrubava todos os canais).
- **C4 →** **agrupamento automático por nome** (flag `agrupar_por_nome`): o cron passa a **vincular cada canal da Curseduca ao grupo do sistema de MESMO nome** (lotes de 8 canais por tick, cursor round-robin) e **propaga o acesso** (entra na pasta/leitura + matrículas). **Já LIGADO e rodando em produção** — verificado com `falhas: 0`.
- **C5 →** recuperação de **stale lock** (coluna `locked_at` + reset de jobs presos há mais de 20 min). Migração `20260923000000` (aplicada).
- **C6 →** marcador `em_andamento` no resultado (mostra ao admin se a execução foi interrompida) + **guarda anti-sobreposição** de ticks (não inicia um novo tick de agrupamento se o anterior ainda está rodando há < 10 min).
- **C7 →** **alerta na tela** de sincronização listando os canais da Curseduca **sem grupo de mesmo nome** (que não são sincronizados).
- **Ações manuais executadas:** re-sync do canal "Desafio de Lei Seca" (**+63 alunos vinculados**, incluindo o Igor) e re-sync dos 35 grupos.
- Migração `20260924000000` (`agrupar_por_nome` + `sync_cursor`) — aplicada.

### Correções desta rodada (commitadas — `c8d80bdc` + `1517ea5e`; deploy pendente)

Fecham as deficiências de plataforma que antes apareciam como "riscos futuros" (ver 1.D):

- **A1 — Vínculo por `codigo_externo` (id do canal), não por nome:** o agrupamento passa a casar canal→grupo pelo **id estável** do canal (coluna `codigo_externo`, que já existia) e só usa o nome como fallback; quando casa por nome, **grava o id no grupo** ("auto-cura") para o próximo ciclo já casar por id. Renomear canal/grupo deixa de quebrar o vínculo. *Sem migração.*
- **A3 — Import pesado sai do request HTTP:** a sincronização "só cadastros" passa a **enfileirar** um job em `simulado_curseduca_jobs` (mesma fila/cron que o webhook já usa, com recuperação de lock preso) em vez de rodar os ~6 min dentro do request. Dedup evita pile-up. *Sem migração.*
- **A4 — Config unificada:** o painel legado (`/admin/curseduca`) passa a **ler e gravar** em `simulado_integracao_config` (fonte canônica que o `resolverCfg` já prefere), preservando o `webhook_token`. Some o footgun "editei as credenciais e não teve efeito". O legado continua só como fallback de leitura. *Sem migração.*
- **A2 — Descoberta automática de canais (atrás de flag, default off):** com `descobrir_canais=true`, o cron considera **todos** os canais da Curseduca que tenham grupo correspondente (por id/nome), em vez da lista manual — canal novo passa a sincronizar sozinho. *Migração aditiva `20260925000000` — ✅ **aplicada no twdr**. A flag nasce desligada; nada muda até marcarem o checkbox.*

### 1.B.1. Reverificação contra a API real da Curseduca (Fases 1–5) — commit/deploy pendentes

Consulta ao **OpenAPI oficial** (`prof.curseduca.pro/docs-json`) + **sondas read-only** contra a API de produção mostraram que parte do que era tratado como "instabilidade externa" tinha **causa-raiz nossa**: o sistema tirava conclusões erradas sobre o **formato** da API. Cada campo/endpoint foi validado ao vivo (reverificação final: **38/38 consistentes**).

- **[CAUSA-RAIZ — aprofunda C1/C6] Fan-out desnecessário `/members/{id}` por membro.** O código assumia que a LISTA `/members?groupId=` **não trazia CPF/telefone/grupos** e, por isso, chamava o detalhe `/members/{id}` **para cada membro** (~18 mil chamadas). **A sondagem provou o contrário:** a lista já retorna `document{value}` (CPF), `phone` e `groups[{groupId,name}]` (todos os produtos do aluno). Medido em "Desafio de Lei Seca" (1.065 membros): **~1.065 → 26 chamadas (~40× menos)**. Esse martelar era o que **disparava os 502/rate-limit e os ~6 min** — não apenas instabilidade do gateway deles. **F1:** classificação/CPF/telefone saem da lista; `/members/{id}` vira só **fallback** (grupos vazios ou sem CPF).
- **[Acesso real] `hasAccess` é o indicador autoritativo.** `/groups/{id}/members` traz `enteredAt`, `expiresAt` == `accessExpiresAt` (iguais) e **`hasAccess`**. Sondagem: `expiresAt=null` **NÃO** garante acesso (29 casos de nulo com `hasAccess=false`); e `/members?groupId=` **não filtra por acesso** (ex.: "Amostra Passaporte": 2.259 na lista, só 4 com acesso vigente). **F3:** o entitlement do provider passa a marcar `expirado` quando `hasAccess=false` (antes era `ativo` fixo → nunca revogava); política escolhida pelo tenant na `executarImport`: **não conceder acesso a novos expirados, nunca remover quem já está** (novo contador `semAcesso`; +1 chamada `/groups/{id}/members` por grupo, barata).
- **[Consistência com B3] `origem` estendido à sync legada da Curseduca.** A `executarImport` passa a inserir `grupo_membros`/`pasta_estudantes` com `origem='integracao'` e a remoção do passo 5 só apaga `origem='integracao'` — **protege acesso manual** mesmo de aluno Curseduca. **F5** (migração `20260926000000` já aplicada; tolerante à coluna ausente).
- **[Higiene] `?search=` confirmado ignorado** (retorna membros arbitrários até para e-mail impossível — ver 1.C.3): a busca por membro paginando ficou canônica (**F2**), e o body do `/login` perdeu o placeholder `accessTokenValidity:'string'` (**F4**; sondado: login segue **201**).
- **Nenhuma suposição genérica remanescente:** cada campo lido existe e vem populado; cada endpoint usa parâmetros que a API aceita; classificação usa os grupos reais do membro; revogação respeita `origem`.

*Arquivos: `client.ts` (parsers `extrairCpf/Telefone/Grupos`, `mapaMatriculasGrupo.hasAccess`, login enxuto), `import-core.ts` (classificação pela lista + fallback + `origem` + `semAcesso`), `providers/curseduca.ts` (status por `hasAccess`), `app/admin/curseduca/actions.ts` (preview `temAcesso`), `propagar-grupo.ts` (`origem`), `tipos.ts`.*

## 1.C. 📞 Responsabilidade da CURSEDUCA (pontos para o contato)

1. **`502 Bad Gateway` na API `/members`** — a instabilidade do gateway deles foi a **causa-raiz** do incidente de sincronização. Cobrar sobre estabilidade/SLA e picos de erros 5xx.
2. **Timeouts de gateway em paginação pesada** — buscar ~18 mil membros em páginas de 200 é lento. Perguntar sobre **limites de rate/paginação** e a melhor prática recomendada.
3. **O parâmetro `?search=` é ignorado** pela API deles (fomos obrigados a paginar todos os membros). Confirmar se existe busca server-side.
4. **Não há webhook de entrada** (ex.: "membro adicionado ao canal") — hoje dependemos de **polling** (varredura periódica). Perguntar se oferecem **webhook de eventos**, o que permitiria sincronização **em tempo real** sem varrer toda a base.

## 1.D. Riscos futuros

> **Leitura honesta:** a maioria destes riscos era **deficiência da nossa plataforma** (não culpa da Curseduca) — e **já foi corrigida** nesta rodada (ver 1.B). Sobra um risco externo, que depende deles.

### Deficiências da plataforma — RESOLVIDAS nesta rodada

- ✅ **Renomear canal quebrava o vínculo** (match só por nome) → **A1**: agora casa por `codigo_externo` (id estável) + auto-cura.
- ✅ **Lista de canais manual** (canal novo ficava de fora) → **A2**: descoberta automática atrás de flag.
- ✅ **Import pesado (~6 min) dentro do request HTTP** → **A3**: enfileirado em `simulado_curseduca_jobs` (background).

*(Todas commitadas; deploy à produção pendente. Migração da A2 `20260925000000` já aplicada no twdr.)*

### Risco externo remanescente (depende da Curseduca)

- **[Externo]** Se a API deles **retornar 502 em TODAS as tentativas** de um canal, aquele canal é **pulado** naquele ciclo (reportado em `gruposFalhos`) — não trava mais a sync, mas os alunos daquele canal só entram no ciclo seguinte. *Mitigação nossa já feita (retry 502/504 + tolerância por-grupo); a estabilidade da API em si é responsabilidade deles (ver 1.C).*

---

# PARTE 2 — GURU

## 2.A. Estado atual — SAUDÁVEL, sem falhas ativas

- **1000+ eventos com status `processado`, 0 erros.**
- Inbox de webhooks: **100% HTTP 200** (todas as requisições chegando e sendo aceitas).
- Os webhooks do Guru estão chegando e sendo processados normalmente.

> ⚠️ Observação importante: o aluno **"igorduartemaia328@gmail.com" apareceu com `origem=guru` mas com 0 eventos Guru** — era um **cadastro antigo**. Ele entrou de fato pela **Curseduca** (canal 303 "Desafio de Lei Seca"). **Não foi problema do Guru.**

## 2.B. Erros latentes encontrados + correções feitas (plataforma)

| # | Ponto | Origem | Correção |
|---|---|---|---|
| G1 | `UPDATE` do evento **sem `tenant_id`** (risco cross-tenant se `event_id` colidir) | Plataforma | ✅ Adicionado `.eq('tenant_id')` |
| G2 | Comparação do segredo do webhook **não constant-time** | Plataforma | ✅ `crypto.timingSafeEqual` |
| G3 | Status de assinatura desconhecido virava **'ativo'** (concedia acesso indevido) | Plataforma | ✅ Agora não concede (default seguro) |
| G4 | Erro no insert de estudante era **engolido** (compra sem virar aluno, invisível) | Plataforma | ✅ Passa a logar o erro real |
| G5 | **Injeção de filtro** PostgREST no `.or()` com e-mail do payload | Plataforma | ✅ E-mail sanitizado |
| G6 | **Lock preso** na fila de eventos + reprocesso perdia o mapa dinâmico | Plataforma | ✅ Recuperação de lock + reprocesso com a cfg (mapa) do tenant |
| G7 | Inbox gravava **headers/`api_token` em texto puro** | Plataforma | ✅ Redigidos antes de gravar |

## 2.B.1. Reconcile-pull do B1 — dry-run + aplicação (21/09)

Rodado `guru-reconcile?pull=1` no tenant Revisão. **Varredura COMPLETA: 6042 assinaturas** (após corrigir o truncamento — ver abaixo).

**Dry-run (leitura):**
- **`revogaria = 0` sobre as 6042** → **nenhum** aluno ativo localmente que o Guru diga estar cancelado/reembolsado. **Confirmado (base inteira): não há acesso preso por webhook de revogação perdido.** O webhook de revogação está saudável.
- **`concederia = 1618`, mas apenas 104 GANHARIAM acesso de fato** (os outros **1514 já têm** — reaplicar é no-op). Dos 104: 3 cadastro novo, 6 sem mapeamento (auto-criaria grupo), 95 alunos existentes sem o acesso do produto. Top produtos com ganho real: Extensivo Black Março 2026 (37), Passaporte Vitalício 2026 (33), demais 0–5. O dry-run traz o quebra-por-produto (`analiseConceder`).

**Aplicação (`?aplicar=1`) — autorizada e executada em 21/09:** concede aos ~104 que ganhariam + reprocessa idempotente o restante; **0 revogações**. `<RESULTADO_APLICACAO>` *(números finais `concedidos/ignorados/erros` a preencher ao término da execução).*

**Correções que tornaram o pull confiável:**
- **Bug de paginação:** o pull truncava em **2500** (= 50 páginas × ~50, teto antigo). Elevado p/ 1000 páginas + guarda anti-loop (cursor repetido) + aviso de truncamento → agora traz as 6042.
- **Rate limit compartilhado:** a cota do Guru (**60 req/min**) é compartilhada via Redis com o tráfego real (inclusive produção). O pull do reconcile passou a **esperar com paciência** por vaga (esperaMax 90s) em vez de desistir em 15s — assim a varredura completa não trunca sob concorrência.

## 2.C. 📞 Responsabilidade da GURU (pontos para o contato)

1. **Não há falha ativa** — não existe erro do Guru para reclamar. Os itens abaixo são **confirmações**, não problemas.
2. **Contrato da API de assinaturas** (usada no *reconcile*/PULL) não está confirmado — endpoints e **modelo de paginação (cursor vs página)**. Pedir a **documentação oficial** para validarmos.
3. **Segurança do webhook**: hoje o POST é aceito validando o **token na URL** (o "Account Token" no corpo é opcional). Perguntar se oferecem **assinatura HMAC no header** (padrão mais seguro).

## 2.D. Riscos futuros (Guru)

> **Correção de diagnóstico:** uma versão anterior deste laudo dizia "a integração só concede, nunca revoga". **Isso estava impreciso.** O caminho de **webhook JÁ revoga** — `cancelado/reembolsado/expirado` chamam `revogar()`, que retira grupo/pasta/matrícula com proteção cruzada (`outraAtivaConcede`, só remove se nenhuma outra assinatura ativa ainda garante o acesso). Os gaps reais são mais estreitos e são **deficiências da nossa plataforma** (não erro do Guru):

- ✅ **[Plataforma] Reconcile não puxava da API do Guru** → **B1 implementado**: `reconciliarPull()` puxa as assinaturas da API (fonte da verdade), compara com o local e **revoga cancelamentos/reembolsos cujo webhook se perdeu**. Roda no cron `guru-reconcile?pull=1` em **dry-run por padrão** (só relatório de quem entraria/sairia, com nome/e-mail); `?aplicar=1` efetiva. Só revoga com status explícito ≠ ativo (ausência na página não revoga).
- ✅ **[Plataforma] Sem expiração por data** → **B2 implementado**: `expirarVencidas()` + cron `assinaturas-expirar` (dry-run por padrão; `?aplicar=1` efetiva). **Ainda não** está no agendador automático — liga só após aprovação.
- ✅ **[Plataforma] `revogar()` removia acesso manual junto** → **B3 implementado**: coluna `origem` (`manual`/`integracao`) — a revogação só apaga `origem='integracao'`. Default `manual` protege linhas antigas (direção segura: nunca remove acesso manual). *Migração `20260926000000` — ✅ **aplicada no twdr**.*
- **[Externo] Paginação da API não verificada:** os nomes de campo do cursor (`next_cursor`/`has_more`) precisam ser confirmados com o Guru (ver 2.C.2) antes de confiar 100% no PULL em massa — por isso o B1 nasce em dry-run.

---

# Estado medido (21/09/2026)

| Integração | Estado |
|---|---|
| **Curseduca** | ✅ Ativa · **agrupamento automático LIGADO** (`agrupar_por_nome=true`) · 35 canais · cursor rodando · **falhas: 0** |
| **Guru** | ✅ Ativa · **0 erros** · inbox 100% HTTP 200 · varredura completa de **6042 assinaturas** (`revogaria=0`) |

---

# Pendências da plataforma (nossas)

**Feito nesta rodada:**
- ✅ Commitado (`c8d80bdc` + `1517ea5e`): A1–A4 (Curseduca) + B1–B3 (Guru) + fix de paginação + guarda anti-sobreposição.
- ✅ Migrações aplicadas no twdr: `20260925000000` (descobrir_canais) e `20260926000000` (origem).
- ✅ **B1 reconcile-pull aplicado** (concede ~104, revoga 0).

**Aguardando:**
1. **Deploy à produção** do branch (correções A1–A4 / B1–B3 + **Fases 1–5 da reverificação**, ver 1.B.1) — ver [deploy-prod-swarm-estudando-junto]. Sem deploy, as correções ainda não valem no ar.
   - **Config legada (C8):** `simulado_curseduca_config` segue `ativo=true` para Revisão (nunca lida — `resolverCfg` prefere a canônica). Vale **desativar** para fonte única (op de dados, aguarda decisão).
2. **B2 (expiração por data):** só rodado em dry-run; **ligar** = `assinaturas-expirar?aplicar=1` e, opcionalmente, agendar no worker. **Aguarda decisão** (retira acesso de assinaturas vencidas).
3. **A2 (descoberta de canais):** migração aplicada, mas a **flag `descobrir_canais` segue desligada** — ligar quando quiserem que canais novos entrem sozinhos.

**Contato com os provedores (não é código):** cobrar Curseduca (estabilidade `/members`, `?search`, webhook de entrada — ver 1.C) e pedir ao Guru a doc da API + HMAC no webhook (ver 2.C).

---

# Rastreabilidade (referências técnicas)

- **Migrações (todas aplicadas no twdr):** `20260923000000_curseduca_job_lock.sql` (stale lock), `20260924000000_curseduca_agrupar.sql` (agrupamento), `20260925000000_curseduca_descobrir.sql` (A2 — `descobrir_canais`), `20260926000000_integracao_origem.sql` (B3 — `origem`).
- **Commits desta rodada (branch `feat/discursivas-correcao-ocr`, não pushados):**
  - `c8d80bdc` — A1–A4 (Curseduca) + B1–B3 (Guru) + fix de paginação + migrações + este documento.
  - `1517ea5e` — dry-run do reconcile com análise de ganho por produto + pull paciente.
  - (contexto) `127dc281` — guarda anti-sobreposição no agrupamento automático.
- **Arquivos principais:**
  - `apps/web/lib/curseduca/client.ts` (retry 502/504)
  - `apps/web/lib/curseduca/import-core.ts` (tolerância por-grupo)
  - `apps/web/lib/curseduca/agrupar.ts` (agrupamento; **A1** match por `codigo_externo` + auto-cura; **A2** descoberta)
  - `apps/web/app/api/cron/curseduca-sync/route.ts` (cron + guarda anti-sobreposição; **A3** enfileira o import)
  - `apps/web/app/admin/curseduca/actions.ts` (**A4** config unificada; **A2** flag na regra)
  - `apps/web/components/admin/curseduca-sync-card.tsx` (**A2** checkbox de descoberta)
  - `apps/web/lib/integracoes/engine.ts` (correções Guru; **B3** `origem` nos inserts/deletes; **B2** `expirarVencidas`)
  - `apps/web/lib/integracoes/orquestrador.ts` (**B1** `reconciliarPull` — dry-run + aplicar)
  - `apps/web/app/api/cron/guru-reconcile/route.ts` (**B1** modo `?pull=1&aplicar=1`)
  - `apps/web/app/api/cron/assinaturas-expirar/route.ts` (**B2** novo cron, dry-run)
  - `apps/web/lib/integracoes/providers/guru.ts`, `inbox.ts` (correções Guru)
  - `apps/web/app/api/webhooks/guru/[token]/route.ts` (tenant_id no UPDATE)
