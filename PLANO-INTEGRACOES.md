# Plano — Sistema Unificado de Integrações (Curseduca + Guru)

> **Status:** PLANEJAMENTO (não implementar ainda). Documento vivo para aplicação futura.
> **Decisões confirmadas (2026-07-15):**
> 1. Compra/assinatura na **Guru** → cria/atualiza **aluno + define o plano** (ex.: `passaporte`); assinatura ativa = acesso.
> 2. Modo de integração da Guru = **webhook em tempo real + polling de reconciliação**.
> 3. Cancelamento/reembolso/chargeback na Guru → **revoga acesso automaticamente** (mantém cadastro e histórico).
> 4. Arquitetura = **sistema unificado "Integrações"** (núcleo genérico + adaptadores por provedor), não módulos duplicados.

---

## 1. Objetivo

Unificar a entrada de alunos/matrículas vinda de plataformas externas num único subsistema **"Integrações"**, com:
- **Provedores plugáveis** (hoje: `curseduca` = pull/grupos; `guru` = push/pagamento). Extensível para Hotmart/Kiwify no futuro.
- **Núcleo comum** que normaliza "pessoa + direito de acesso (entitlement)" e aplica no domínio local (`simulado_estudantes`, `simulado_grupos`, `simulado_grupo_membros`, `simulado_matriculas`, `classificacao`).
- **Ciclo de vida de assinatura** (conceder e **revogar** acesso), que hoje NÃO existe (a Curseduca só concede/remove por presença em grupo).

## 2. O que já existe (reaproveitar) vs. o que muda

**Reaproveitar da Curseduca (ver mapa técnico):**
- `lib/crypto.ts` (AES-256-GCM, `APP_ENCRYPTION_KEY`) para credenciais.
- Padrão de **cache de token (memória + Redis)** e **retry com backoff** de `lib/curseduca/client.ts`.
- Núcleo de dedupe (`matricula_externa` / email / cpf) e inserção em lote de `import-core.ts`.
- Padrão de **cron protegido por `CRON_SECRET`** + fila de jobs + lock otimista.
- Componentes de UI (seleção, preview, regras de sync) — generalizados.

**Muda:**
- Tabelas `simulado_curseduca_*` → **`simulado_integracao_*`** com coluna `provider` (migração de dados preservando o que existe).
- Novo modelo de **assinaturas** e **mapeamentos produto→destino**.
- Novo fluxo **webhook idempotente** com resolução de tenant.

## 3. Arquitetura do núcleo genérico

### 3.1 Contrato do adaptador (`lib/integracoes/tipos.ts`)
```ts
type Provider = 'curseduca' | 'guru'

interface PessoaNormalizada { nome; email; cpf?; telefone?; externalId: string }
interface Entitlement {
  externalId: string          // id da assinatura/transação/matrícula no provedor
  produtoRef?: string         // produto/oferta/grupo de origem
  status: 'ativo' | 'cancelado' | 'reembolsado' | 'expirado'
  inicioEm?: string; expiraEm?: string
}
interface EventoNormalizado { tipo: string; pessoa: PessoaNormalizada; entitlement: Entitlement; ocorridoEm: string; eventId: string }

interface ProviderAdapter {
  // credenciais
  testarCredenciais(cfg): Promise<{ ok; error? }>
  // pull (Curseduca: grupos→membros; Guru: reconciliação de assinaturas)
  listarFontes(cfg): Promise<{ ref: string; nome: string; total?: number }[]>   // grupos OU produtos
  listarPessoas(cfg, refs: string[]): Promise<{ pessoa; entitlement }[]>
  // push (Guru): normaliza um payload de webhook em EventoNormalizado
  parseWebhook?(payload, headers, cfg): Promise<EventoNormalizado | null>
  // segurança do webhook
  validarWebhook?(payload, headers, segredo): boolean
}
```
`aplicarEntitlement()` (núcleo, agnóstico de provedor) recebe `{tenantId, provider, pessoa, entitlement, mapeamento}` e faz:
- upsert do estudante (dedupe por externalId/email/cpf);
- resolve o **mapeamento** (produto/grupo → classificação + grupo(s) + simulado(s));
- se `status=ativo`: aplica classificação, vincula grupo, cria matrícula(s) (`liberado=true`), grava assinatura `ativo`;
- se `status ∈ {cancelado, reembolsado, expirado}`: marca assinatura, **revoga** (remove de `simulado_grupo_membros` do mapeamento e/ou `simulado_matriculas` correspondentes; rebaixa classificação se não houver outra assinatura ativa) — **mantém** `simulado_estudantes` e histórico de sessões.

### 3.2 Regra de revogação (importante)
- Revogar **apenas** o que veio daquele entitlement/mapeamento (não apagar acessos manuais nem de outra origem).
- Rebaixar `classificacao` para `normal` só se o aluno **não tiver nenhuma outra assinatura ativa** (`simulado_assinaturas` com `status=ativo`).
- Tudo auditado (`simulado_audit`, operação `REVOGAR`).

## 4. Modelo de dados (novas tabelas + alterações)

### 4.1 Generalização (migração das tabelas Curseduca)
| Nova tabela | Origem | Colunas-chave |
|---|---|---|
| `simulado_integracao_config` | `simulado_curseduca_config` | `id, tenant_id, provider, base_url, credenciais jsonb (encrypted), ativo, atualizado_em` · UNIQUE(tenant_id, provider) |
| `simulado_integracao_sync` | `simulado_curseduca_sync` | `+ provider`; `fontes jsonb` (grupos/produtos), `destino jsonb`, `sincronizar, intervalo_min, ativo, ultima_execucao, ultimo_resultado` |
| `simulado_integracao_jobs` | `simulado_curseduca_jobs` | `+ provider`; `status, payload jsonb, resultado jsonb, erro` |

> Migração: copiar linhas `curseduca_*` para `integracao_*` com `provider='curseduca'`; manter as tabelas antigas por 1 ciclo (compat) e depois dropar.

### 4.2 Tabelas novas
| Tabela | Papel | Colunas-chave |
|---|---|---|
| `simulado_integracao_mapeamentos` | Mapeia **produto/oferta/grupo** do provedor → destino no sistema | `tenant_id, provider, fonte_ref (produto/grupo id), classificacao ('passaporte'/'normal'/…), grupo_id?, simulado_id?, ativo` · UNIQUE(tenant_id,provider,fonte_ref) |
| `simulado_integracao_eventos` | Log **idempotente** de webhooks | `tenant_id, provider, event_id UNIQUE, tipo, payload jsonb, status ('recebido'/'processado'/'erro'/'ignorado'), erro, recebido_em, processado_em` |
| `simulado_assinaturas` | Ciclo de vida do acesso por aluno×produto | `tenant_id, estudante_id, provider, produto_ref, external_id UNIQUE(provider,external_id), status ('ativo'/'cancelado'/'reembolsado'/'expirado'), confirmado_curseduca bool, inicio_em, expira_em, atualizado_em` |
| `simulado_integracao_pessoas` | Identidade cross-provider (evita aluno duplicado) | `tenant_id, estudante_id, provider, external_id` · UNIQUE(tenant_id,provider,external_id) |

### 4.3 Alterações em tabelas existentes
- `simulado_estudantes`: adicionar `origem_provider text` (de onde veio) — `matricula_externa` continua guardando o externalId (por provedor). Opcional: índice em `(tenant_id, origem_provider)`.
- Reaproveita `simulado_matriculas` (gate de acesso) e `simulado_grupo_membros`.

## 5. Provider Curseduca (migração para o núcleo)
- `lib/integracoes/curseduca/adapter.ts` implementa o contrato reusando o client atual (`listarTodosGrupos`, `listarMembrosDoGrupo`, `mapaMatriculasGrupo`, `detalheMembro`).
- `listarFontes` = grupos; `listarPessoas` = membros normalizados; sem `parseWebhook` (ou mantém o webhook atual).
- A "sincronização (remove quem saiu)" atual vira um caso de **revogação por ausência na fonte** (mesma engine).
- **Sem mudança de comportamento** para o usuário — só reorganização interna.

## 6. Provider Guru (novo)

### 6.1 Credenciais / API
- Guru = `digitalmanager.guru`. Auth via **API Token** (Bearer). Env de fallback: `GURU_BASE_URL`, `GURU_API_TOKEN`, `GURU_WEBHOOK_SECRET`, `GURU_ENV_TENANT_ID`. Por tenant em `simulado_integracao_config` (provider='guru', `credenciais` = `{api_token}` criptografado).
- **A confirmar (dependência externa):** endpoints reais da API Guru para listar transações/assinaturas/contatos e o **formato exato do payload de webhook** (nomes dos campos: comprador, produto, status). Colher da doc oficial da Guru antes de implementar.

### 6.2 Webhook (tempo real) — `/api/webhooks/guru/[tenantToken]`
- **Resolução de tenant:** URL por tenant com um **token único** (`webhook_token` em `simulado_integracao_config`) — cada tenant configura na Guru a URL própria. (Alternativa: mapear por produto, menos seguro.)
- **Segurança:** validar assinatura/segredo da Guru (`validarWebhook`); rejeitar 401 se não bater.
- **Idempotência:** gravar em `simulado_integracao_eventos` com `event_id` UNIQUE (id da transação/evento da Guru). Se já existe → responder 200 e ignorar (evita reprocesso e reentrega).
- **Fluxo:** grava evento (`recebido`) → responde 200 rápido → processa (inline curto ou enfileira job) → `aplicarEntitlement()` → marca `processado`.
- **Eventos tratados (mapear para status do entitlement):**
  - compra **aprovada** / assinatura **ativa/renovada** → `ativo` (concede);
  - **cancelada** / **reembolso** / **chargeback** / **expirada** → estado correspondente (revoga).

### 6.3 Polling de reconciliação — cron `guru-reconcile`
- Cron protegido por `CRON_SECRET` (worker chama), por tenant com Guru ativo.
- Puxa transações/assinaturas recentes da API Guru (janela ex.: últimas 24–48h ou desde `ultima_execucao`), compara com `simulado_assinaturas` e **corrige divergências** (eventos de webhook perdidos): concede o que faltou, revoga o que caiu.
- Idempotente (usa `external_id` das assinaturas).

### 6.4 Mapeamento produto→plano
- Tela para o admin dizer: *produto/oferta X da Guru* → `classificacao=passaporte` (+ opcional grupo/simulado).
- Sem mapeamento para um produto: cai numa regra padrão configurável (ex.: cria aluno `normal` sem acesso, e sinaliza "produto não mapeado" nos Eventos).

### 6.5 Vínculo de grupo/confirmação SEM webhook da Curseduca (problema central)
**Contexto real:** hoje a compra na Guru dispara (integração nativa/N8N) o cadastro na **Curseduca** e a adição ao **grupo de acesso**. A Curseduca **não** tem webhook que avise essa adição — então não dá para usá-la como fonte da confirmação "pessoa → grupo".

**Resolução (fonte da verdade = Guru, Curseduca só reconcilia):**
1. **Concessão pela Guru + mapeamento local.** O webhook da Guru traz *comprador + produto + confirmação de pagamento*. O mapeamento *produto Guru → grupo/plano* fica em `simulado_integracao_mapeamentos` (no nosso sistema). Com isso concedemos o acesso **na hora**, sem depender de webhook da Curseduca. O próprio evento da Guru é o **dado de confirmação** (guardado em `simulado_integracao_eventos` + `simulado_assinaturas`).
2. **Reconciliação por polling da Curseduca (confirmação/telemetria).** Um cron puxa os membros dos grupos da Curseduca e:
   - **confirma** que o comprador caiu no grupo esperado (casando por email/CPF) → marca a assinatura como "confirmada na Curseduca";
   - **alerta** se, após X min da compra, a pessoa não apareceu no grupo esperado (falha no pipe Guru→Curseduca);
   - **captura** quem entrou por outro caminho (compra manual, importação legada) sem evento Guru.
3. **Aprendizado do mapeamento (opcional).** Quando não soubermos qual grupo corresponde a um produto, o polling pode *sugerir* o mapeamento observando em qual grupo os compradores daquele produto aparecem (com confirmação do admin).
4. **Fallback sem Guru webhook.** Se algum fluxo não passar pela Guru, o polling da Curseduca (import atual) continua concedendo acesso por presença no grupo — igual hoje.
5. **N8N como ponte (alternativa/complemento).** Se já existe N8N no meio (Guru→Curseduca), estender esse fluxo para também dar `POST` no nosso webhook com `{comprador, produto, grupo}` — aí recebemos o grupo já resolvido, sem polling. Manter o webhook genérico de ingestão pronto para isso.

**Identidade cross-provider:** a mesma pessoa pode vir da Guru (transação/contato) e da Curseduca (member id). Guardar os external ids **por provedor** (tabela `simulado_integracao_pessoas`: `estudante_id, provider, external_id`) e deduplicar por email/CPF — evita aluno duplicado quando as duas fontes trazem a mesma pessoa.

## 7. Segurança e robustez
- **Idempotência**: `event_id` UNIQUE + checagem antes de aplicar.
- **Ordenação**: eventos podem chegar fora de ordem (reembolso antes do approve por reentrega). Usar `ocorridoEm` do payload; ao aplicar, o **estado final** da assinatura decide o acesso (não a ordem de chegada). Reconciliação corrige o resto.
- **Tenant isolation**: toda query com `tenant_id`; webhook resolve tenant só pelo `webhook_token`.
- **Auditoria**: `simulado_audit` para conceder/revogar (`MATRICULAR`/`REVOGAR`), e `simulado_integracao_eventos` como trilha bruta.
- **Rate limit** no endpoint de webhook (reusar Redis).

### 7.4 Rate limit e concorrência multi-admin (mesma API key) — problema central
**Problema:** hoje cada ação de admin bate direto na API da Curseduca/Guru com a **mesma key**. Com vários admins puxando ao mesmo tempo → **bloqueio por limite (429)**.

**Resolução (todo tráfego de API por um canal único, controlado):**
1. **UI lê o banco local por padrão.** As telas mostram os dados **já importados** (`simulado_estudantes`, grupos, etc.). Nada de chamar a API a cada abertura de tela. Só há chamada externa quando o admin clica explicitamente em "Atualizar da Curseduca/Guru" — e mesmo assim, enfileirado.
2. **Fila única de pulls (worker como consumidor).** Toda leitura pesada da API vira **job** (`simulado_integracao_jobs`), processado pelo **worker** com **concorrência controlada** (ex.: 1–2 requisições simultâneas por provedor). Admins não disparam requisições diretas — enfileiram. Um único consumidor = sem "tempestade" de chamadas.
3. **Rate limiter global por (provider, key) no Redis.** Token-bucket compartilhado entre réplicas: toda chamada externa **pega um token** antes de sair; sem token, espera. Garante o teto do provedor independentemente de quantos admins/réplicas. (Combina com o backoff que já existe no client.)
4. **Cache compartilhado (Redis) de respostas.** Cachear listas de grupos/produtos e membros por um TTL curto (ex.: 1–5 min), chaveado por `(provider, tenant, recurso)`. Vários admins vendo o mesmo dado → 1 chamada só. (Já existe cache de token e de contagem de membros — estender.)
5. **Single-flight (coalescência).** Se duas ações pedem o mesmo recurso ao mesmo tempo, coalescer numa única chamada (lock/promise compartilhada no Redis) em vez de N chamadas idênticas.
6. **Preferir sincronização agendada.** O caminho principal de dados é o **polling agendado** (regras de `simulado_integracao_sync`) rodando no worker (um consumidor, ritmo controlado). O "ao vivo" fica para exceções.
7. **Webhook > polling para a Guru.** Como a Guru é *push*, o grosso do fluxo não consome API de leitura — reduz muito a pressão de rate limit. O polling da Guru é só reconciliação (janela curta, baixa frequência).

> Efeito líquido: nº de admins deixa de importar para o rate limit, porque o número de chamadas externas passa a depender só do worker + limiter + cache, não das telas abertas.

## 8. UI unificada (`/admin/integracoes`)
- **Hub** `/admin/integracoes`: cards por provedor (Curseduca, Guru) com status (ativo, última execução, nº de eventos recentes).
- **Por provedor** `/admin/integracoes/[provider]` com abas:
  - **Credenciais** (form genérico por provedor; testa conexão).
  - **Importar** (Curseduca: grupos com preview; Guru: buscar compradores/assinantes por produto).
  - **Sincronização** (regras de polling — reusa `curseduca-sync` generalizado).
  - **Mapeamentos** (produto/grupo → classificação/grupo/simulado) — **novo**, essencial para a Guru.
  - **Eventos** (log de webhook: tipo, aluno, status, reprocessar) — **novo**.
- Migrar o menu lateral: "Conexões → Curseduca" vira "Conexões → Integrações".

## 9. Crons / worker
- Generalizar as rotas: `/api/cron/integracoes-sync` (substitui `curseduca-sync`) e `/api/cron/integracoes-jobs` (substitui `curseduca-jobs`), ambas iterando por provedor.
- Novo: `/api/cron/guru-reconcile` (ou dobrar na `integracoes-sync` com um tipo de regra "reconciliação").
- Worker (`apps/worker`) já chama crons a cada 60s com `CRON_SECRET` — só adicionar as novas chamadas.

## 10. Faseamento (aplicar depois, nesta ordem)
- **Fase 0 — Fundação:** migration das tabelas (`integracao_config/sync/jobs` + `mapeamentos/eventos/assinaturas/pessoas`), migração de dados Curseduca→genérico, contrato `ProviderAdapter`, engine `aplicarEntitlement()` + revogação. **Camada de rate limit:** limiter global (Redis token-bucket) + cache compartilhado + fila única de pulls (todo tráfego de API passa a sair pelo worker). Sem mudança visível.
- **Fase 1 — Curseduca no núcleo:** adaptador Curseduca + UI unificada (paridade com hoje), agora **lendo do banco local** e puxando da API só via fila. Validar que nada quebrou e que o rate limit sumiu com multi-admin.
- **Fase 2 — Guru conceder:** credenciais Guru, **mapeamentos produto→grupo/plano** (fonte da verdade do vínculo, §6.5), **webhook** (approved/active → aluno+passaporte+matrícula), idempotência + tenant token. (Colher doc da API/webhook da Guru antes.)
- **Fase 3 — Guru revogar:** eventos de cancelamento/reembolso/chargeback → revogação automática via `simulado_assinaturas`. Tela de Eventos.
- **Fase 4 — Reconciliação + robustez:** cron de reconciliação (Guru: eventos perdidos; **Curseduca: confirma "pessoa caiu no grupo esperado" e alerta falhas do pipe Guru→Curseduca**, §6.5), reprocessamento de eventos, métricas/alertas, auditoria completa.

## 11. Dependências externas / a confirmar antes de codar
1. **Credenciais e doc da API Guru** (API token, endpoints de transações/assinaturas/contatos, paginação, rate limit).
2. **Formato do webhook da Guru** (headers de assinatura, campos: comprador nome/email/CPF/telefone, produto/oferta, status/evento, ids). — pegar de um payload real de teste.
3. **Catálogo de produtos** da conta Guru para montar os mapeamentos.
4. Confirmar **política de expiração** de assinatura (usar `expira_em` do provedor? cron marca `expirado`?).
5. Domínio/URL público para os webhooks (produção) + como cada tenant cadastra a URL na Guru.
6. **Existe N8N no fluxo Guru→Curseduca hoje?** Se sim, é a ponte mais barata para nos mandar `{comprador, produto, grupo}` já resolvido (§6.5.5), evitando polling.
7. **De quem é o mapeamento produto→grupo hoje** (na Curseduca? no N8N?): precisamos replicá-lo em `simulado_integracao_mapeamentos` (ou aprender por polling) para conceder acesso sem depender da Curseduca.
8. **Limites reais de rate** das APIs Curseduca e Guru (req/min por key) — para calibrar o token-bucket e a concorrência da fila (§7.4).

## 14. Checklist — o que coletar da Guru para finalizar a Fase 2

> A infraestrutura (webhook idempotente, adaptador, engine) já está pronta. Falta só CALIBRAR
> com dados reais. Colete o abaixo e o `parseWebhook`/endpoints são ajustados rápido (tudo
> marcado com `⚠️ VERIFICAR` em `lib/integracoes/providers/guru.ts`).

**1. Payloads reais de webhook (JSON cru completo), um de cada:**
- [ ] Compra **aprovada** (transação `approved`).
- [ ] Assinatura **ativa/renovada** (subscription `active`).
- [ ] **Cancelamento** de assinatura.
- [ ] **Reembolso** e, se possível, **chargeback**.
- [ ] (útil) Um **aguardando pagamento** (para confirmar que é ignorado).

**2. Autenticação/assinatura do webhook:**
- [ ] A Guru assina? Se sim: **nome do header** (ex.: `X-Guru-Signature`) e **algoritmo** (HMAC-SHA256 do corpo?).
- [ ] Ou envia um **token no payload** (ex.: `webhook.token`)? Qual campo?
- [ ] Há **allowlist de IPs**?

**3. Identificação (para casar com os Mapeamentos):**
- [ ] Qual campo identifica o **produto** no webhook: `product.marketplace_id`, `internal_id` ou `id`? (é o que o admin vai mapear).
- [ ] Campos do **comprador**: caminho de `nome`, `email`, `CPF/doc`, `telefone`.
- [ ] Campo do **id da assinatura/transação** (para dedupe/idempotência) e se há um **id único de entrega** por evento.

**4. Status (strings exatas que a Guru manda):**
- [ ] Lista de status de **transação** (approved, refunded, chargeback, waiting_payment…).
- [ ] Lista de `last_status` de **assinatura** (active, canceled, past_due, trial, inactive…).

**5. API da Guru (para `testarCredenciais`, `listarFontes` e a futura reconciliação):**
- [ ] **Base URL** e como obter o **API Token** (onde gerar no painel).
- [ ] Endpoint p/ **validar token/conta** (ex.: `/api/v2/accounts/me`?).
- [ ] Endpoint p/ **listar produtos**.
- [ ] Endpoint p/ **listar transações/assinaturas** (janela por data) — usado na reconciliação.
- [ ] **Rate limit** (req/min) — para calibrar o token-bucket.

**6. Operacional:**
- [ ] **Domínio público** de produção para a URL do webhook (a Guru precisa alcançar).
- [ ] Confirmar política de **expiração** (usar `expires_at`/`next_cycle_at` do payload? cron marca `expirado`?).

## 13. Resumo das duas análises adicionadas (2026-07-15)
- **Confirmação/grupo sem webhook da Curseduca (§6.5):** fonte da verdade passa a ser a **Guru** (webhook de compra) + **mapeamento produto→grupo no nosso sistema**; concede acesso na hora; **Curseduca vira só reconciliação/confirmação** por polling. Ponte via N8N é alternativa. Identidade cross-provider em `simulado_integracao_pessoas`.
- **Rate limit multi-admin (§7.4):** **UI lê banco local**; **toda chamada de API sai por fila única no worker** com **rate limiter global (Redis)** + **cache compartilhado** + **single-flight**; webhook (push) reduz a leitura da Guru. Nº de admins deixa de influenciar o rate limit.

## 12. Verificação (quando implementar)
- Compra aprovada na Guru (evento de teste) → aluno criado, classificação `passaporte`, matrícula ativa, evento `processado`, idempotente (reenvio não duplica).
- Cancelamento/reembolso → acesso revogado, cadastro e histórico preservados, auditado.
- Webhook com assinatura inválida → 401; com `event_id` repetido → 200 sem reprocessar.
- Reconciliação: apagar uma assinatura local e rodar o cron → recria a partir da Guru.
- Curseduca: importação e "remove quem saiu" continuam idênticos após a migração.
- Isolamento multi-tenant: webhook de um tenant não afeta outro.
