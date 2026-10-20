# Análise · Revisão · Plano por Agentes · Auditoria — Plataforma de Conteúdo Jurídico (Drive)

> **Para quem é este documento:** dono do produto + time de engenharia que vai implementar o spec
> `CLAUDE_AUDITORIA_PLATAFORMA.md`. Objetivo: validar o spec, apontar o que falta, e dar um plano de
> execução dividido por **agentes** (papéis especializados), ancorado no **stack real deste repositório**.
>
> **Correção de premissa (vale para tudo abaixo):** o spec e o `CLAUDE.md` raiz assumem **NestJS + Prisma**.
> A realidade do repo é **Next.js (App Router) + Supabase (Postgres + RLS + PostgREST)** em `apps/web`
> (2.381 arquivos TS); `apps/api` (NestJS) é um esqueleto de 5 arquivos, **não é o backend**. Portanto o
> sistema se constrói com **server actions / route handlers + migrações SQL + RLS + worker**, reusando a
> fundação que já existe (multi-tenant por host, RLS, auth, LGPD, storage, fila/worker, OnlyOffice/docx).

---

## PARTE 0 — Riscos de produto/negócio & decisões de entrada (ANTES de codar)

> Estes 5 pontos estão **fora da engenharia** do spec (as Partes 1–4 são técnicas) e podem mudar o
> projeto inteiro. São **gates**: decidir ANTES da Fase 0. Severidade no mesmo critério da auditoria.

| ID | Sev. | Risco | Decisão a tomar |
|---|---|---|---|
| **P1** | **Crítico** | **Direitos autorais do conteúdo.** Lei é domínio público; **doutrina, jurisprudência comentada, apostilas, espelhos e comentário de professor NÃO são.** Subir material de terceiros e redistribuir a alunos pagantes = risco jurídico real. | **D8:** gate de origem/licença no upload (`fonte`/`licenca` + termo de responsabilidade do professor); só conteúdo próprio ou licenciado; auditar origem. |
| **P2** | **Crítico** | **Não é greenfield.** Já há Leitura Lei Seca/Jurisprudência **em produção** com grifos, anotações, caixas colapsáveis, **streak e XP de alunos reais**. O "Drive" redefine tudo isso. | **D9 (coexistência):** substituir × paralelo. Recomendo **paralelo com ponte** — o Drive nasce como fonte-mãe e a Leitura atual vira um "produto" consumidor; migrar 1 conteúdo por vez sem desligar o antigo. **D10 (migração sem perda):** mapear grifos/anotações existentes para `uid`+`texto_ancora`; **preservar streak/XP** (fonte = ledger imutável que já existe). Nenhum aluno perde histórico. |
| **P3** | **Alto** | **Vigência jurídica = requisito, não opcional.** Anotação sobre artigo **revogado** faz o aluno estudar lei errada (dano ativo); manter conteúdo vigente é parte do valor. | Promover A15/D6 a **requisito**: `vigencia_inicio/fim` por versão (mín.) + aviso "trecho possivelmente desatualizado/revogado" ao aluno; fonte = marcação do professor na publicação. |
| **P4** | **Alto** | **Orçamento de IA + esforço do professor + "vale a complexidade?".** A maquinaria de `uid`/reconciliação existe só pela promessa "marcação sobrevive". Sem orçamento, inviabiliza. | **D11:** antes de construir — (a) **modelo de custo da IA** por documento/versão/aluno; (b) **teto de revisão manual** do professor (auto-aceite ≥ limiar de confiança); (c) avaliar **MVP 80%** (ancorar só por `texto_ancora`+contexto, sem toda a máquina de `uid`) e medir se a perda é aceitável. Maximizar o que casa **determinístico** (custo zero). |
| **P5** | **Alto** | **Como o aluno entra: iframe Curseduca + mobile.** Acesso quase obrigatório dentro do iframe (`membros.revisaoensinojuridico.com.br`, cookies particionados, cross-origin) e muito no celular (grifo por toque). | **D12:** leitor + anotações **nascem** embedáveis (CSP `frame-ancestors`, `postMessage`, cookie por host) e **mobile-first** (grifo por toque; layout adaptativo ao **container**, não ao viewport). Reusar o que já foi aprendido (grids adaptativos ao container). |

**Decisão nº 1 (bloqueia o resto):** **P2 — coexistência/migração**. O spec foi escrito como se fosse do
zero, mas há alunos ativos com grifos e streak. Fechar *substituir × paralelo* + estratégia de migração
**sem perda** antes de qualquer código evita retrabalho e revolta de aluno (já houve landmines de progresso
zerado — aqui o estrago seria maior).

---

## PARTE 1 — Análise completa

### 1.1 O que o produto promete (e por que é difícil)
Um "Drive" de documentos jurídicos onde **um documento-mãe** alimenta vários produtos, é lido pelo aluno,
é recortado em **desafios** (sem alterar o mãe) e recebe a **camada pessoal do aluno** (destaques/notas).
O coração do produto são **duas promessas de continuidade entre versões**:

1. **Identidade estável de trecho (`uid`)** — a mesma unidade de texto (um artigo, um inciso) mantém o
   mesmo `uid` mesmo quando o documento é reeditado. Sem isso, nada ancora.
2. **Reconciliação** — quando nasce uma versão nova, as marcações do aluno e as regras de desafio são
   reavaliadas: o que não mudou **permanece**, o que mudou **avisa**, o que sumiu **vira pendência (não some)**.

Tudo o mais (upload, versões, vínculos, leitura) é CRUD conhecido. **O risco concentra-se em `uid` (Fase 2)
e reconciliação (Fase 6)** — exatamente o que o próprio spec já aponta. O resto sustenta essas duas.

### 1.2 Arquitetura — leitura crítica
As "5 camadas" são razoáveis, mas a recomendação do spec (monólito modular, serviços = módulos) **já é a
realidade aqui**: `apps/web` é um monólito Next.js modular. Mapeamento direto:

| Camada do spec | Como se materializa NESTE repo |
|---|---|
| Clientes (aluno/professor/admin) | páginas em `apps/web/app/(aluno\|admin)` + componentes |
| Borda (JWT, perfis, rate limit, log) | middleware/`proxy.ts`, Supabase Auth + `tenant_acessos`/RBAC, auditoria existente |
| Serviços de domínio | **módulos** = `lib/<dominio>` + server actions + route handlers (não microserviços) |
| Assíncrono (outbox, workers) | `apps/worker` (BullMQ/Redis) + tabela `jobs` já usada; **outbox é novo** |
| Armazenamento | Supabase Postgres + Storage (camada `arquivos` abstrata já existe) |

**Conclusão:** não criar serviço novo. Implementar como **novos módulos `lib/conteudo`, `lib/versoes`,
`lib/desafios-doc`, `lib/anotacoes`** + migrações + 2 workers (conversão, reconciliação).

### 1.3 Modelo de dados — o que está CERTO (manter)
O modelo da seção 3 já corrige os piores erros dos desenhos e tem decisões maduras:
- **`trecho_identidade(uid)`** separado de `trecho(versao_id, uid)` — resolve a FK impossível (A1). ✔
- **Versões imutáveis** + `documento.versao_atual_id` com FK adiada (A4). ✔
- **`desafio.vinculo_id`** em vez de produto+documento soltos (A3). ✔
- **`anotacao` com `texto_ancora` + contexto + `versao_criada/validada`** — base da reconciliação. ✔
- **`evento_outbox`** para entrega confiável (A6). ✔
- **`aviso_alteracao` com `UNIQUE(anotacao_id, versao_para_id)`** — idempotência do aviso. ✔
- **`regra_desafio` com `texto_ancora` + `estado`** — regra também sobrevive a versão (A5). ✔

### 1.4 Fluxos-chave — onde mora o risco
- **Importação (5.1):** correta. O detalhe fino é a **transação única upload+versão+evento (outbox)** e o
  worker de conversão com estados (`pendente→processando→ok|revisao_necessaria|erro`).
- **Alinhamento de `uid` (5.2):** o algoritmo (caminho+rótulo → hash → similaridade≥0,80/LCS → novo) é
  sensato, mas **thresholds mágicos** e **ambiguidade** exigem (a) determinismo, (b) gravar a decisão+score,
  (c) revisão humana, (d) **PoC com documentos reais antes das telas**. É o ponto nº 1 de risco.
- **Reconciliação (5.3):** a matriz (uid existe? hash mudou? âncora encontrada? 1 ou N ocorrências?) está
  bem pensada, inclusive a **reconciliação preguiçosa** na leitura. Riscos de escala e concorrência na Parte 2.
- **Visão de desafio (5.4):** **recorte e correção só no servidor** (R3/A7) é a regra de ouro. Bem definido.
- **Vínculo (5.5):** `ultima`/`fixada` + prévia de impacto antes de publicar. Correto.

### 1.5 Encaixe no sistema que JÁ existe (reaproveitar, não reinventar)
Muita coisa do spec **já tem equivalente** no repo e deve ser reusada, não duplicada:

| Spec pede | Já existe no repo (reusar) |
|---|---|
| JWT, perfis aluno/professor/admin, autorização por objeto | Supabase Auth + `tenant_acessos` + RBAC + `checkPermission` em server actions (ver memória authz) |
| Multi-organização (D5) | **Multitenancy por host + RLS já é a espinha do sistema** — D5 está resolvido |
| Object storage abstrato + validação de upload | tabela/camada `arquivos` (provider supabase/s3/gcs, magic bytes, `sharp`) |
| Fila + worker + visibilidade | `apps/worker` (BullMQ) + tabela `jobs` |
| LGPD (export/exclusão/consentimento) | `lgpd_consentimentos`/`lgpd_solicitacoes` + middleware — **anotações entram nesse fluxo** |
| Auditoria de mutações | `audit_logs` + interceptor |
| Editor de .docx / render | área de Teste OnlyOffice + docxtemplater (porém ver D2/N8 — não é o editor do mãe) |
| Importar conteúdo jurídico / leitura / desafios | módulos de Leitura/Lei Seca/Jurisprudência (padrões de trilha, grifos, caixas colapsáveis) |

**Implicação forte:** o modelo da seção 3 **precisa de `tenant_id` em todas as tabelas + RLS** (hoje não
tem — ver N1). Sem isso, quebra o isolamento que o resto do sistema garante.

---

## PARTE 2 — Revisão crítica (achados NOVOS, além de A1–A15)

Severidade: **Crítico** (bloqueia o objetivo), **Alto** (bug real), **Médio**, **Baixo**.

| ID | Sev. | Achado | Correção recomendada |
|---|---|---|---|
| **N1** | **Crítico** | **Nenhuma tabela tem `tenant_id` nem RLS.** O sistema é multitenant; sem isso há vazamento cross-tenant e quebra do padrão do repo. | Adicionar `tenant_id uuid NOT NULL` em **todas** as tabelas de negócio + políticas RLS `USING (tenant_id = current_setting('app.current_tenant_id')::uuid)`. `trecho_identidade`, `anotacao`, `regra_desafio`, `evento_outbox` inclusive. |
| **N2** | **Alto** | **Stack divergente:** spec assume NestJS/Prisma; o backend real é Next.js + Supabase. Construir NestJS seria um 2º sistema órfão. | Implementar em `apps/web` (server actions/route handlers + migrações SQL + RLS) + `apps/worker`. Reusar auth/RBAC/storage/jobs/LGPD existentes. Descartar `apps/api`. |
| **N3** | **Alto** | **Concorrência versão↔anotação:** aluno pode anotar durante a publicação de uma nova versão; `POST /anotacoes` pode chegar com offsets de uma versão que deixou de ser a atual. | No `POST /anotacoes`, exigir `versao_criada_id` e **validar que os offsets batem com o `texto_ancora`** naquela versão; se a versão mudou, reconciliar a anotação na hora antes de gravar. Lock otimista por `anotacao.atualizada_em`. |
| **N4** | **Alto** | **Reconciliação preguiçosa pode estourar o p95<500ms** da leitura (doc 500 trechos × muitas anotações, pulando várias versões). | Reconciliar **só as anotações do aluno atual**, em lote, com teto: se houver muitas desatualizadas, devolver o que der e **enfileirar o resto** mostrando "atualizando marcações…". Cache por (aluno,documento,versao). |
| **N5** | **Alto** | **Autorização por objeto nos desafios e no gabarito.** `GET /visao` e `POST /respostas` precisam checar **matrícula + propriedade**, não só perfil. Token `{{lacuna:id}}` não pode ser o `uid` (revela estrutura). | `id` da lacuna = opaco por desafio (não-`uid`). Toda rota de desafio valida matrícula no produto do vínculo. Teste 10.4 cobre também metadados (tamanho/posição não vazam dica). |
| **N6** | **Médio** | **`uid` alignment precisa ser determinístico e auditável**; thresholds (0,80) são mágicos. | Fixar algoritmo determinístico (mesma entrada → mesma saída), gravar `regra_usada`+`score`, e **PoC medindo precision/recall** com docs reais ANTES das telas (a própria spec recomenda). Casos ambíguos → fila de revisão do professor. **Aqui entra o motor multi-agent** (ver Parte 3, Agente 4). |
| **N7** | **Alto** | **Editor = OnlyOffice (D3) ⇒ `uid` NÃO vive no editor.** Como o aluno edita `.docx` livre, o `uid` só pode ser **re-derivado pela conversão+alinhamento a cada save** — e divisão/junção/movimentação de trecho agora dependem 100% do algoritmo de alinhamento (5.2), não de regras no editor. | O alinhamento (Agente 3) **roda em TODO save**, não só na importação. Por isso ele precisa ser robusto/determinístico e a PoC (N6) é obrigatória. Trade-off aceito: editor familiar (OnlyOffice) × alinhamento mais exigido. |
| **N8** | **Médio** | **Fonte da verdade (A9/D2) definida: `.docx` edita, estruturado deriva.** Com OnlyOffice como editor de conteúdo, o `.docx` é a fonte de edição; o estruturado é gerado dele. Risco: divergência se a conversão perder estrutura (listas, numeração jurídica). | Conversão docx→trechos de alta fidelidade (estilos de título/numeração) + status `revisao_necessaria` quando a confiança cai; `.docx` guardado por versão (reeditável). Reusa o OnlyOffice/docxtemplater já integrados na área de teste. |
| **N9** | **Médio** | **Busca (`GET /busca`) subespecificada** — índice? por trecho? respeita RLS/matrícula? | `tsvector` por `trecho` (português) com `tenant_id`; resultado filtrado pelos produtos/matrículas do aluno; destacar o trecho e linkar ao `uid`. |
| **N10** | **Médio** | **Reconciliação em massa** (10k anotações) sem padrão de lote/retry/idempotência explícito. | Processar por documento em páginas; retry com backoff; idempotente (reexecutar não duplica avisos — já há `UNIQUE`); registrar na tabela `jobs`; alerta de fila parada. |
| **N11** | **Baixo** | **Idempotency-Key** citado sem storage/TTL. | Tabela `idempotencia(chave, rota, resposta_hash, criado_em)` + janela (ex.: 24h) para `POST` de versão/reconciliação. |
| **N12** | **Baixo** | **Soft-delete de documento com vínculos/anotações ativos** — efeito indefinido. | Bloquear exclusão com vínculo ativo (erro claro) ou exigir `arquivar` antes; anotações ficam preservadas (R4). |
| **N13** | **Baixo** | **Vigência jurídica (A15/D6)** — no jurídico, saber se um artigo está vigente é diferencial real. | Opcional mas valioso: `vigencia_inicio/fim` por versão **ou por trecho**; aviso "trecho possivelmente desatualizado" ao aluno. |
| **N14** | **Baixo** | **Permissão perigosa:** professor cria/restaura versão → afeta todos os produtos `ultima` sem admin. | Manter prévia de impacto obrigatória antes de publicar; para documentos com muitos vínculos, exigir confirmação/segunda aprovação (config). |

**Decisões pendentes (D1–D7) — recomendações à luz do repo:**
- **D1 (stack):** Next.js + Supabase + `apps/worker` (BullMQ/Redis). *Não* NestJS.
- **D2 (verdade):** **o `.docx` editável é a fonte de EDIÇÃO; o estruturado (trechos+`uid`) é DERIVADO** dele a cada versão. O estruturado segue sendo a camada de **leitura/âncora/desafio** (ver N8 atualizado).
- **D3 (editor):** **OnlyOffice** — decisão do usuário; o **mesmo** editor de caderno e de conteúdo (substitui a sugestão anterior de Tiptap). Implica: toda edição = novo `.docx` = reconverter em trechos + realinhar `uid` (ver N7 atualizado e Parte 5.3).
- **D4 (matrícula):** reusar `matriculas` + `grupos`/`grupo_membros` já existentes; "aluno do produto" = matrícula ativa OU grupo vinculado ao produto.
- **D5 (multi-org):** **já resolvido** (multitenant por host + RLS).
- **D6 (vigência):** recomendado incluir cedo no jurídico (N13), ao menos por versão.
- **D7 (tipos de desafio):** começar com **lacuna + certo/errado + múltipla escolha**; ordenar depois.

---

## PARTE 3 — Planejamento total por AGENTES (passo a passo)

A ideia: dividir a construção em **agentes especializados** (papéis), cada um com função, entradas, saídas
(handoff) e critério de aceite. Dois deles (Conversão e Anotações) **usam o motor multi-agent de IA**
(`lib/ia/agentes`) para os passos difíceis (alinhamento/desambiguação), escalando Haiku→Sonnet→Opus.

> "Agente" aqui = unidade de trabalho especializada. Pode ser um dev, um subagente de automação, ou o
> orquestrador coordenando — a divisão é a mesma. A ordem respeita o **grafo de dependências**.

### 3.0 O time de agentes

| # | Agente | Função (o que dono) | Fase(s) |
|---|---|---|---|
| 0 | **Orquestrador** | Mantém o grafo de dependências, valida critério de aceite de cada fase, autoriza handoff, consolida auditoria. (No motor de IA = nível *consolidação*/Opus.) | todas |
| 1 | **Fundação & Multitenancy** | Migrações base, `tenant_id`+**RLS em tudo**, auth/perfis, `evento_outbox` transacional, auditoria, CI. | 0 |
| 2 | **Drive & Versões** | Upload seguro, storage, `documento`/`versao`, imutabilidade (R1), restauração, download, histórico. | 1 |
| 3 | **Conversão & Estrutura `uid`** | Worker de conversão (docx/pdf/html→trechos), `trecho`/`trecho_identidade`, **algoritmo de alinhamento de `uid`** + PoC + tela de revisão. **Usa IA.** | 2 |
| 4 | **Vínculos & Leitura** | `produto_vinculo` (ultima/fixada), `GET /conteudo`, leitor do aluno, **prévia de impacto** antes de publicar. | 3 |
| 5 | **Editor (OnlyOffice)** | Editor **OnlyOffice** (docx) de caderno e conteúdo; cada save → nova versão `.docx` + realinhamento de `uid` (via Agente 3). | 4 |
| 6 | **Desafios** | `desafio`/`regra_desafio`, prévia (professor), **visão no servidor (R3)**, correção no servidor, **revalidação de regras** por versão. | 5 |
| 7 | **Anotações & Reconciliação** | `anotacao`, `GET /leitura`, **worker de reconciliação** (matriz 5.3), avisos, reconciliação preguiçosa, concorrência (N3/N4). **Usa IA** para desambiguar âncora. | 6 |
| 8 | **Segurança & LGPD** | Sanitização HTML (lista de permissão), upload isolado/antivírus, **autorização por objeto** (N5), rate limit, LGPD das anotações, segredos. | 7 + transversal |
| 9 | **QA & Testes** | Invariantes R1–R5, matriz de reconciliação (10.3), **teste de não-vazamento (10.4)**, carga 10k (10.7), gate de cada fase. | transversal |

### 3.1 Onde a IA (motor `lib/ia/agentes`) entra
- **Agente 3 (Conversão/`uid`):** pipeline por trecho — **triagem (Haiku)** decide se o par é óbvio (hash/rótulo igual → casa sem IA); **execução (Sonnet)** propõe alinhamento nos casos de similaridade média; **consolidação (Opus)** só nos ambíguos, com explicação → fila de revisão humana. Otimiza custo: a maioria casa determinístico, IA só no resto.
- **Agente 7 (Reconciliação):** quando o `texto_ancora` não bate exato e há várias ocorrências, usar o mesmo pipeline para escolher a ocorrência certa pelo contexto antes/depois, marcando confiança; baixa confiança → `aviso_alteracao` em vez de adivinhar.

### 3.2 Passo a passo por fase (com handoffs)

**Fase D — Descoberta & Decisão (Agente 0 + Produto/Legal) — ANTES de qualquer código**
1. Fechar **P1–P5 / D8–D12** (Parte 0) e **D1–D7** (Parte 2).
2. **Coexistência (D9/D10):** decidir substituir × paralelo + desenhar o **mapa de migração** dos grifos/anotações e **preservação de streak/XP** da Leitura atual (sem perda).
3. **Validação de valor + PoC do `uid`** com documentos reais (precision/recall) **e modelo de custo da IA** (P4) → decide **máquina completa × MVP 80%**.
4. **Gate legal (D8):** política de origem/licença do conteúdo.
5. **Aceite:** decisões assinadas + PoC de `uid` acima da meta + custo estimado + estratégia de migração aprovada. **Só então começa a Fase 0.**

**Fase 0 — Fundação (Agente 1 → valida Agente 0/9)**
1. Migração base + **`tenant_id` + RLS em todas as tabelas** (N1) + funções `get_tenant_id()`.
2. Auth/perfis reusando `tenant_acessos`/RBAC; `checkPermission` nas server actions (padrão do repo).
3. `evento_outbox` + publisher transacional (grava evento na MESMA transação da mutação).
4. Log estruturado + `audit_logs`. **Aceite:** login por perfil; migração do zero; evento gravado na mesma transação; RLS isola dois tenants.

**Fase 1 — Drive & Versões (Agente 2 + Agente 8 no upload)**
1. `POST /documentos`, `POST /versoes` (upload → storage → `versao` `pendente` + evento, 1 transação).
2. **Gate legal no upload (P1/D8):** `fonte`/`licenca` obrigatórios + termo de responsabilidade; bloquear sem origem declarada.
3. **Vigência (P3):** campos `vigencia_inicio/fim` na versão (preenchidos na publicação).
4. Restauração cria **nova** versão (não altera antigas — R1). Download do original.
5. **Aceite:** subir cria v1 com origem/licença; restaurar cria vN+1 sem tocar nas anteriores.

**Fase 2 — Conversão & `uid` (Agente 3) — RISCO #1**
1. Worker de conversão docx/pdf/html → `trecho` (hierarquia, rótulo, hash). HTML sanitizado (Agente 8).
2. **PoC do alinhamento `uid`** com documentos reais (artigo movido/renumerado/editado/removido/novo) + métricas, ANTES das telas.
3. Algoritmo determinístico (caminho+rótulo → hash → similaridade/LCS) + grava `regra_usada`+`score`; ambíguos → fila; IA só no resto (3.1).
4. Tela de revisão do professor; PDF ruim → `revisao_necessaria`.
5. **Aceite:** teste de alinhamento (10.2) com precision/recall acima da meta; reexecução estável.

**Fase 3 — Vínculos & Leitura (Agente 4 + Agente 8 no embed)**
1. `produto_vinculo` (ultima/fixada) + `GET /conteudo?versao=`.
2. Leitor do aluno (reusar padrões da Leitura/Lei Seca) + `GET /documentos/{id}/vinculos` (impacto).
3. **Embedável + mobile desde já (P5/D12):** leitor nasce dentro do iframe Curseduca (CSP `frame-ancestors`, `postMessage`, cookie por host) e mobile-first (grifo por toque; layout adaptativo ao container). Aviso de **vigência** (P3) no trecho revogado/desatualizado.
4. **Aceite:** editar o mãe muda produtos `ultima` e não muda `fixada`; leitor funciona no iframe e no celular.

**Fase 4 — Editor OnlyOffice (Agente 5 + Agente 3)**
1. Editor = **OnlyOffice** (docx nativo) para caderno e conteúdo; salvar gera nova versão `.docx`.
2. Cada save dispara a conversão→trechos + **realinhamento de `uid`** (Agente 3) — `.docx` é a fonte de edição, estruturado é derivado (D2/N7/N8).
3. **Aceite:** edição cria versão; `uid`s preservados nos trechos não tocados (R5) via alinhamento no save.

**Fase 5 — Desafios (Agente 6) — RISCO de vazamento**
1. `desafio`/`regra_desafio`; **visão calculada no servidor** (recortar/ocultar/lacuna); `gabarito` nunca sai.
2. Correção `POST /respostas` no servidor; revalidação de regra ao publicar versão (estado `invalida`+alerta).
3. **Aceite:** snapshot do payload do aluno prova que trecho oculto e gabarito **não aparecem** (10.4).

**Fase 6 — Camada do aluno & Reconciliação (Agente 7) — RISCO #2**
1. `anotacao` + `GET /leitura` (conteúdo + anotações reconciliadas); concorrência N3.
2. Worker de reconciliação (matriz 5.3) + reconciliação preguiçosa com teto N4; avisos; IA na desambiguação (3.1).
3. **Aceite:** matriz de reconciliação (10.3) passa; anotação órfã vira pendência sem sumir (R4); reexecução não duplica aviso.

**Fase 7 — Endurecimento (Agentes 8 + 9)**
1. Segurança (sanitização, upload, autorização por objeto N5, rate limit), LGPD das anotações, backup/restauração ensaiada, métricas/alertas.
2. Carga: reconciliação de 10k anotações no tempo-alvo.
3. **Aceite:** testes 10.6 e 10.7 passam; restauração de backup ensaiada.

### 3.3 Ordem de risco e marco antecipado
A **Fase D vem primeiro** — decisões de produto (P1–P5) + **PoC do `uid`** com documentos reais + **modelo de
custo da IA**, ANTES de telas. Isso evita construir 8 fases para descobrir que a promessa não fecha ou que
destrói o histórico dos alunos. Um **teste de não-vazamento** fake já na Fase 3. Fases 2 e 6 sustentam o produto.

---

## PARTE 4 — Auditoria completa (consolidada)

### 4.1 Tabela de achados (originais confirmados + novos)
| ID | Sev. | Status | Onde tratar |
|---|---|---|---|
| A1 identidade de trecho (FK) | Crítico | **Resolvido no spec** (`trecho_identidade`) | Fase 2 |
| A2 como manter `uid` entre versões | Crítico | **Parcial** — algoritmo existe, falta PoC/determinismo | Fase 2 / N6 |
| A3 desafio → vínculo | Alto | Resolvido | Fase 5 |
| A4 FK circular documento↔versao | Alto | Resolvido | Fase 1 |
| A5 regra sobrevive a versão | Alto | Resolvido (revalidação) | Fase 5 |
| A6 perda de evento | Alto | Resolvido (outbox) | Fase 0 |
| A7 vazamento de gabarito | Alto | Resolvido por construção (R3) — **exige teste** | Fase 5 / 10.4 |
| A8 HTML/upload hostil | Alto | Pendente de implementação | Fase 7 (Agente 8) |
| A9 fonte da verdade | Médio | **Decidir D2** = estruturado | N8 |
| A10 PDF perde estrutura | Médio | Mitigado (`revisao_necessaria`) | Fase 2 |
| A11 matrícula/turma | Médio | **Reusar `matriculas`/`grupos`** | D4 |
| A12 reconciliação atrasa | Médio | Resolvido (preguiçosa) — cuidar custo | N4 |
| A13 inserção do aluno | Médio | Resolvido (mesma reconciliação) | Fase 6 |
| A14 observabilidade/backup/LGPD/multi-org | Baixo | Multi-org já pronto; resto na Fase 7 | 7 / D5 |
| A15 vigência jurídica | Baixo | Opcional recomendado | N13 / D6 |
| **N1 sem tenant_id/RLS** | **Crítico** | **Novo — bloqueador** | Fase 0 |
| **N2 stack NestJS vs Next+Supabase** | **Alto** | **Novo — decisão de arquitetura** | antes da Fase 0 |
| **N3 concorrência versão↔anotação** | **Alto** | **Novo** | Fase 6 |
| **N4 custo reconciliação na leitura** | **Alto** | **Novo** | Fase 6 |
| **N5 authz por objeto + token de lacuna** | **Alto** | **Novo** | Fase 5/7 |
| N6 determinismo/PoC do `uid` | Médio | Novo | Fase 2 |
| N7 `uid` no editor (split/merge) | Médio | Novo | Fase 4 |
| N8 verdade × OnlyOffice | Médio | Novo | Fase 2/4 |
| N9 busca/índice | Médio | Novo | Fase 3 |
| N10 reconciliação em massa | Médio | Novo | Fase 6 |
| N11 idempotency storage | Baixo | Novo | Fase 0 |
| N12 soft-delete com vínculo | Baixo | Novo | Fase 1 |
| N13 vigência | Baixo | Novo | D6 |
| N14 permissão professor/versão | Baixo | Novo | Fase 1/3 |
| N15 histórico de leitura + grifo unificado | Baixo | Novo — tabela `leitura_progresso`; anotação já é por documento+`uid` (serve biblioteca E desafio) | Fase 6 |
| **P1 direitos autorais** | **Crítico** | **Produto — gate legal** | Fase D/1 (D8) |
| **P2 coexistência/migração** | **Crítico** | **Produto — bloqueia tudo** | Fase D (D9/D10) |
| **P3 vigência = requisito** | **Alto** | **Produto** | Fase D/1 (D6) |
| **P4 custo IA + esforço professor** | **Alto** | **Produto — viabilidade** | Fase D (D11) |
| **P5 iframe Curseduca + mobile** | **Alto** | **Produto** | Fase D/3 (D12) |

### 4.2 Invariantes (R1–R5) → teste obrigatório (gate)
- **R1** versão imutável → restaurar cria nova; update em `versao` proibido. (Fase 1)
- **R2** aluno/desafio nunca grava no mãe → só `anotacao`/`regra_desafio` apontam. (Fase 5/6)
- **R3** conteúdo escondido nunca sai do servidor → snapshot do payload (10.4). (Fase 5)
- **R4** anotação nunca apagada por atualização → órfã vira pendência. (Fase 6)
- **R5** `uid` estável entre versões → teste de alinhamento + editor split/merge. (Fase 2/4)

### 4.3 Checklist de segurança (gate da Fase 7)
HTML sanitizado por lista de permissão · upload valida tipo real+tamanho+antivírus, conversão isolada ·
autorização por **objeto** (dono/matrícula) em toda rota · rate limit em upload/busca · gabarito só no
servidor · auditoria em vínculo/restauração/exclusão · RLS por tenant em 100% das tabelas (N1).

### 4.4 Veredito
O spec é **sólido e implementável** — já corrigiu os erros graves dos desenhos. Mas há **duas camadas de
bloqueador**:
- **Produto (decidir na Fase D, antes de codar):** **P2 coexistência/migração sem perda** (há alunos ativos
  com grifos/streak), **P1 direitos autorais**, **P4 orçamento de IA + "vale a complexidade?" (MVP 80%?)**,
  **P3 vigência**, **P5 iframe/mobile**.
- **Engenharia:** **N1 tenant_id/RLS**, **N2 stack Next+Supabase (não NestJS)**, **N3/N4 concorrência/custo
  da reconciliação**, **N5 authz por objeto**.

Com a **Fase D** fechada (decisões + PoC do `uid` com métrica + custo + plano de migração) e esses achados
endereçados, as 8 fases são seguras. Recomendações fortes: **não pular a Fase D/PoC**, **não construir
NestJS**, e **decidir coexistência antes de tudo**.

---

## PARTE 5 — UI: Admin (Biblioteca) & Aluno

### 5.1 Admin — nova área "Biblioteca"
Agrupa o conteúdo reutilizável do tenant. **Dois sub-itens:**
- **Modelos de caderno** — **movido** para cá (hoje fica na área de cadernos/designer). Mesma função, novo lugar.
- **Conteúdos** (NOVO) — a área estilo **Drive** do spec: documentos-mãe, versões, vínculos, estrutura (trechos), desafios.

**Conteúdos (Drive) — mapa de funções/telas:**
- **Lista/árvore de documentos** (reusar o padrão admin: tabela com busca+filtros+ordenação **e** pastas hierárquicas): status (rascunho/publicado/arquivado), tipo de origem, nº de versões, nº de vínculos, **origem/licença (P1)**, **vigência (P3)**.
- **Documento →** aba **Versões** (histórico imutável, diff, restaurar) · aba **Vínculos** (produtos ultima/fixada + **prévia de impacto** antes de publicar) · aba **Estrutura** (trechos/`uid`, fila de revisão do alinhamento ambíguo) · aba **Desafios** (regras recortar/ocultar/lacuna + prévia).
- **Upload** com gate de origem/licença (P1) + status de conversão (pendente/processando/ok/revisão).
- **Editor = OnlyOffice** (5.3).

### 5.2 Aluno — área ÚNICA "Biblioteca"
No aluno há **uma só área: Biblioteca**. Dentro dela:
- **Todos os conteúdos de leitura liberados** ao aluno (por matrícula/acesso) — lista em tickets/cards adaptativos ao container.
- **Baixar** o conteúdo (download) **e/ou ler dentro da plataforma** com a camada de anotação (grifo/nota/riscado/inserção), **grifo por toque (mobile)** e **dentro do iframe Curseduca (P5)**.
- **Histórico de leituras** — o que o aluno já leu, seja **pela Biblioteca** ou **dentro de um desafio**, aparece com **os grifos dele salvos**.
- **Camada de anotação UNIFICADA (importante):** o grifo/nota é ancorado ao **documento + `uid`**, NÃO ao contexto de acesso. Então um grifo feito **durante um desafio** aparece ao reler o mesmo conteúdo **na Biblioteca** (e vice-versa) — é a MESMA camada pessoal. No desafio (visão recortada), os grifos do aluno aparecem nos trechos visíveis; nada vaza dos ocultos (R3).
- **Avisos/Pendências** — trechos alterados (aviso) e anotações órfãs (pendência): manter/ajustar/apagar.
- **Vigência** — aviso de trecho possivelmente revogado/desatualizado (P3).

### 5.3 Editor = OnlyOffice (caderno E conteúdo)
- O editor do **caderno** (hoje designer de blocos HTML) e do **conteúdo** passam a ser o **OnlyOffice** já integrado na área de teste (docx nativo).
- **Consequência arquitetural (importante):** o `.docx` vira a **fonte de EDIÇÃO**; o **estruturado (trechos+`uid`)** é **derivado** do `.docx` a cada save (mesma conversão da importação) e alimenta leitura/anotação/desafio. Ou seja, **todo save = nova versão = reconverter + realinhar `uid`** → torna o **alinhamento (N6) ainda mais crítico** (roda em todo save, não só na importação). Mantém R1–R5.

### 5.4 Começa como TESTE (conforme pedido)
Biblioteca (**Modelos de caderno + Conteúdos**) **nasce dentro da área de teste** (`/admin/teste/…`, isolada,
como o OnlyOffice hoje) durante as fases de engenharia, e só é **promovida ao menu admin "Biblioteca"** no
final (Fase 8), depois de validada — sem tocar no sistema vivo.

### 5.5 Fase nova
**Fase 8 — Promoção & Biblioteca (Agentes 2/4/6 + Orquestrador)**
1. Consolidar as telas da área de teste → **mover "Modelos de caderno"** para **Biblioteca** e publicar **Conteúdos**.
2. OnlyOffice como editor padrão de caderno e conteúdo.
3. **Aceite:** admin acessa **Biblioteca** (Modelos de caderno + Conteúdos) no menu real; aluno lê/anota no iframe/mobile; nada do sistema antigo quebrou.

---

### Anexo — mapa 1 linha por fase → agente → risco
`FD Descoberta&Decisão[P2/PoC/custo/legal] ▸ F0 Fundação[N1-RLS] ▸ F1 Drive[legal/vigência] ▸ F2 Conversão+uid★(PoC) ▸ F3 Vínculos+Leitura[iframe/mobile] ▸ F4 Editor OnlyOffice ▸ F5 Desafios(no-leak) ▸ F6 Anotações+Reconciliação★ ▸ F7 Endurecimento ▸ F8 Promoção→Biblioteca(teste→menu)`  ·  ★ = risco alto, usa IA. UI (Admin Biblioteca + Aluno) nasce na área de teste e é promovida na F8.
