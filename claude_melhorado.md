# Plano: SaaS Multitenant de Simulados e Questões para Concurso

## Contexto

Construir, do zero (diretório greenfield `mentoria_v2`, hoje só com um `claude.md` vazio), um **SaaS multitenant e multiusuário** para resolução de questões e **simulados de concurso** — combinando o que há de melhor em dois concorrentes mapeados:

1. **Mapa da Prova** (mapadaprova.com.br): banco de questões com card rico (Banca, Órgão, Cargo, Ano, Gabarito, Matéria/Assunto), ferramenta tesoura, favoritar, comentários (professor/alunos), estatísticas, reportar erro, filtros por banca/disciplina/assunto, cadernos.
2. **Documento "SISTEMA DEFINITIVO" (Revisão PGE / MEQ)**: plataforma educacional com **engine de simulados robusta**, correção de discursivas, mentoria, LGPD, auditoria e **28 pontos críticos de engenharia** já mapeados (locks, embaralhamento determinístico, validação de sessão, race conditions, etc.).

**O que motivou:** entrar no mercado de plataformas de questões/simulados com uma base SaaS própria, vendável a múltiplos clientes (tenants = "plataformas", ex.: Revisão PGE, MEQ). O gatilho imediato é suportar **simulados em tempo real com 1000+ alunos simultâneos** numa janela fixa (ex.: 8h–13h), com encerramento automático de todos ao fim e **regras de aplicação configuráveis**.

### Decisões confirmadas com o usuário
- **Stack:** front e back **separados** — **Next.js** (front) + **NestJS** (API) + **PostgreSQL**. Deploy via **Docker em VPS** (não Vercel). *Adaptamos os conceitos do documento (que usa TanStack Start + Supabase) para esta stack.*
- **Multitenancy:** **Shared DB + `tenant_id`** com **Row-Level Security (RLS)** no Postgres; resolução por **subdomínio**.
- **Auth, RBAC e auditoria:** construídos **no próprio app** (sem Supabase/Clerk/Auth0).
- **Simulado em tempo real:** **confiável em escala + auto-encerramento server-side** (sem WebSocket/ranking ao vivo no MVP).
- **Regras de aplicação do simulado (configuráveis por simulado):** modos **janela fixa** (8h–13h, 1000+ simultâneos), **prazo relativo** (matrícula avulsa/sob medida: prazo em horas/dias/meses + 1+ tentativas) e **aberto**; tempo limite individual; retentativas; iniciar atrasado e liberação de gabarito; **revisão antes de enviar**; **questões anuladas e gabarito/alternativas alteradas após a resposta (re-correção + relatório antes/depois de beneficiados e prejudicados)**; **matrículas** como gate; **regras de testadores**.
- **White-label por tenant:** cada empresa com identidade visual própria (ex.: procuradoria roxo+amarelo, defensoria verde+branco, ensino médio azul), combinada com dark/light/system.
- **Acesso simplificado do aluno + área embedável:** a área de resposta pode ser **embedada (iframe/widget) em outra plataforma**, com "login" leve configurável por tenant: **só e-mail**, **e-mail + CPF** ou **e-mail + telefone** (sem senha).
- **Mensagens e contatos personalizáveis por tenant:** textos de **bloqueio, liberação e alerta** que o aluno recebe + **formas de contato/suporte**, editáveis por tenant.
- **Incluir cedo (Fase 1–2):** **LGPD** e **exportação de PDF do relatório final via worker** (caderno de respostas + gabarito + prova realizada + relatório).
- **Adiar (fases posteriores):** discursivas com correção (canvas/anotações/lock), cadernos/designer, mentoria, mobile Expo — tabelas já previstas no modelo.
- **MVP = núcleo completo, conteúdo simples:** fundação SaaS sólida + engine de simulados + banco de questões básico.

---

## Arquitetura

### Monorepo (pnpm workspaces + Turborepo)
```
mentoria_v2/
├─ apps/
│  ├─ api/        # NestJS (modular monolith)
│  ├─ web/        # Next.js 15 (App Router)
│  └─ worker/     # Workers BullMQ (PDF, imagens, relatórios, auto-encerramento, re-correção)
├─ packages/
│  ├─ shared/     # tipos + contratos zod compartilhados front/back
│  └─ config/     # eslint, tsconfig, tailwind preset
├─ docker/        # Dockerfiles + nginx
├─ docker-compose.yml
└─ .env.example
```

### Infra Docker (VPS) — pronta para escalar a 1000+ simultâneos
- `nginx` (reverse proxy + TLS, roteia por subdomínio) → `web` e `api`.
- `api` (NestJS) **stateless e replicável** (várias réplicas atrás do nginx).
- `worker` (BullMQ) — jobs assíncronos.
- `postgres` (16) + **PgBouncer** (pooling) + `redis` (cache, sessão de prova, filas, rate limit).
- Índices de performance e paginação server-side obrigatória (padrões P4/P6 do documento).

### Backend — NestJS modular (ORM Prisma)
Módulos isolados (controller/service/guard/dto): `auth`, `tenants`, `users`, `rbac`, `audit`, `lgpd`, `taxonomy`, `questions`, `simulados`, `attempts` (sessão de prova), `grading` (correção/re-correção), `matriculas`, `grupos`, `reports`, `files` (storage), `api-keys`, `webhooks`, `import`, `notifications`.

### Frontend — Next.js
- App Router + **Tailwind + shadcn/ui**; **next-themes** (dark/light/system, estratégia `class` + variáveis CSS).
- **Seletor de plataforma pós-login** quando o usuário tem acesso a múltiplos tenants.
- Áreas: **portal do aluno** (questões, simulados, resultados) e **painel admin** (RBAC, auditoria, conteúdo, simulados, matrículas, relatórios, tenants).
- Auth via **JWT** (access curto + refresh em cookie httpOnly). `useCan()` esconde UI por permissão; **autorização real sempre no NestJS**.

---

## Pilares da fundação SaaS

### 1. Multitenancy (shared DB + RLS por subdomínio)
- Toda tabela de negócio carrega `tenant_id`. Middleware resolve o tenant pelo hostname (`SELECT id FROM tenants WHERE dominio = $host`) e executa `SET app.current_tenant_id` na conexão da request.
- **Políticas RLS** em 100% das tabelas: `USING (tenant_id = current_setting('app.current_tenant_id')::uuid)` — isolamento garantido mesmo se uma query esquecer o filtro (ponto S2).
- **Conta global cross-tenant:** 1 usuário (e-mail) pode ter acesso a vários tenants com papéis diferentes via `tenant_acessos` (conceito `plataforma_acessos` do documento).
- Regras default: **somente admins cadastram alunos** (sem auto-registro); **todo link de simulado exige login** (ponto S4).

### 2. RBAC configurável (perfis + permissões por módulo/página)
- Tabelas: `roles`, `permissions`, `role_permissions`, `user_roles`. Permissão = **`resource` (módulo/página) × `action`** (`view/create/update/delete/export/manage`).
- Perfis-semente por tenant (todos editáveis, e o tenant pode criar novos): **super_admin** (global), **admin_geral, admin_conteudo, admin_correcao, admin_relatorio, admin_comercial, estudante** + **testador** (taxonomia do documento).
- Enforcement: `@RequirePermission('simulados:create')` + `PermissionsGuard` (NestJS) e `useCan()` no front. Tela admin: matriz perfis × permissões por módulo.

### 3. Auditoria (registrar tudo)
- `audit_logs`: `tenant_id, actor_user_id, tabela, operacao (INSERT/UPDATE/DELETE/LIBERAR/BLOQUEAR/ANULAR/RECORRIGIR), dados_anteriores (jsonb), dados_novos (jsonb), ip, user_agent, criado_em`.
- **Interceptor global NestJS** registra toda mutação + login/logout + mudanças de permissão + liberações de gabarito/nota + anulações/re-correções. Visualizador admin com filtros (usuário, módulo, ação, período) e diff before/after.

### 4. LGPD (desde o início)
- `lgpd_consentimentos` (versão da política, ip, user_agent, aceito_em). **Middleware pós-auth** força consentimento no 1º acesso e re-consentimento quando a versão da política incrementa (ponto S6).
- `lgpd_solicitacoes` (acesso/exclusão/portabilidade) com workflow admin: exportação JSON, anonimização controlada, portabilidade estruturada.

### 5. API pública + Webhooks (entrada de dados)
- **API keys por tenant** (`api_keys`: hash, escopos, último uso) via `Authorization: Bearer`.
- **Webhook de ingestão** assinado por **HMAC** (segredo por tenant): payload validado por zod, enfileirado no BullMQ, processado pelo módulo `import` (cria/atualiza questões + taxonomia, **dedupe por `external_id`**). Upload/import com validação server-side (mime, tamanho, magic bytes — ponto S3).
- **Endpoints REST versionados (`/api/v1`) com Swagger.** Política de versionamento:
  - Versão na URL (`/api/v1`, `/api/v2`); header `Sunset` anuncia deprecação com 6 meses de antecedência.
  - **Breaking changes** (remover campo, alterar tipo, mudar comportamento) → nova versão major. **Non-breaking** (adicionar campo opcional, novo endpoint) → mesma versão.
  - Tenants notificados via e-mail (lista de contatos técnicos em `tenants.contatos_tech[]`) e banner no painel admin ao acessar versão próxima de sunset.
  - Manter versão anterior ativa por 6 meses após lançamento da nova. Logs de uso por versão (header `X-Api-Version` logado) para saber quando desligar com segurança.

### 6. Tema white-label por tenant + dark/light/system
- **Identidade visual por empresa (tenant):** cada tenant tem sua marca (ex.: concurso jurídico/procuradoria = **roxo + amarelo**; defensoria = **verde + branco**; preparatório ensino médio = **azul**). `tenants.tema` (jsonb): `logo_url`, `logo_dark_url`, `favicon`, `cor_primaria`, `cor_secundaria`, `cor_accent`, `fonte`.
- **Como funciona (sem rebuild por tenant):** os componentes (Tailwind + shadcn/ui) usam **tokens de cor via CSS variables** (`--brand-primary`, etc.). O servidor resolve o tenant pelo subdomínio e injeta as variáveis da marca no `:root` (style inline no layout). Resultado: **2 dimensões independentes** — a *marca* (cores/logo do tenant) × o *modo* claro/escuro/sistema (`next-themes`, estratégia `class`). Cada marca pode definir paleta para claro e escuro.
- Tela admin para o tenant configurar sua marca (cores, logo, favicon) com preview ao vivo.

### 7. Segurança aprofundada

#### 7.1 Proteção do login leve (auth sem senha)
- **Rate limiting por IP + identificador** no endpoint `/auth/embed/identify`: máximo 5 tentativas em 60 s por IP; máximo 10 tentativas por e-mail/CPF em 15 min (contadores no Redis). Após limite: resposta `429` com `Retry-After` e `backoff exponencial`.
- **Proteção contra enumeração de usuários:** respostas de erro genéricas ("credenciais não encontradas") com **tempo de resposta constante** (`timingSafeEqual` ou delay fixo de ~200 ms) — nunca revelar se o e-mail existe ou não.
- **Bloqueio temporário de conta:** após 10 tentativas falhas consecutivas por `estudante_id`, bloquear por 30 min e notificar o admin via `audit_log` (operação `BLOQUEIO_AUTOMATICO`).
- **OTP por e-mail** (quando habilitado pelo tenant): código de 6 dígitos, TTL de 10 min, máximo 3 reenvios em 30 min, invalidado após uso. Armazenado em Redis (nunca em banco).

#### 7.2 Headers de segurança HTTP (nginx + NestJS)
- **HSTS:** `Strict-Transport-Security: max-age=31536000; includeSubDomains` — configurado no nginx para todos os subdomínios.
- **CSP:** `Content-Security-Policy: default-src 'self'; frame-ancestors <origens_permitidas>` — injetado dinamicamente por tenant na rota `/embed`.
- **Outros:** `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` (nas rotas não-embed), `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
- **NestJS Helmet** como middleware global com overrides por rota.

#### 7.3 CSRF e proteção de rotas stateful
- **API stateless (JWT Bearer):** rotas da API REST não sofrem CSRF clássico. Porém o **cookie httpOnly do refresh token** é vulnerável a CSRF em rotas de renovação — proteger com **`SameSite=Strict`** e **verificação do header `Origin`** no endpoint `/auth/refresh`.
- **Double-submit cookie pattern** como fallback caso `SameSite` não seja suficiente em contextos de embed cross-origin.

#### 7.4 Gestão de segredos e rotação
- **Segredo HMAC dos webhooks:** armazenado em `webhook_endpoints.segredo_hmac` como hash bcrypt; o valor em claro é exibido uma única vez no admin (gerado pelo backend, nunca armazenado em claro). Endpoint `/webhooks/:id/rotate-secret` para rotação com janela de tolerância de 5 min (aceita assinatura antiga + nova durante transição).
- **API Keys:** geradas com `crypto.randomBytes(32)`, armazenadas como `sha256(key)`. Exibidas uma única vez. Endpoint de revogação imediata.
- **JWT embed:** `exp` máximo de 4 h, escopado a `{simulado_id, estudante_id, tenant_id}`. Revogação via Redis blocklist (jti blocklist) ao encerrar sessão ou suspeita de fraude.
- **Variáveis de ambiente:** `.env.example` documenta todas; `.env` nunca commitado; segredos de produção via Docker secrets ou Vault (referência no `docker-compose.yml`).

#### 7.5 Segurança do embed e clickjacking
- **`frame-ancestors` dinâmico:** o middleware resolve o tenant e injeta o header CSP com as origens de `embed_config.origens_permitidas[]`. Origens não listadas recebem `frame-ancestors 'none'`.
- **Validação do `postMessage`:** o widget verifica `event.origin` antes de processar qualquer mensagem da página hospedeira — nunca aceitar comandos de origens desconhecidas.
- **Token de embed de curta duração:** o snippet gerado pelo admin inclui um `embed_token` com TTL de 24 h; o widget o troca por JWT de sessão após identificação do aluno.

---

## Domínio de conteúdo (banco de questões)

Combina taxonomia estruturada (Mapa da Prova) + organização livre (documento):
- **Taxonomia estruturada e filtrável:** `bancas`, `orgaos`, `cargos`, `anos`, `disciplinas` (matéria), `assuntos` (filho de disciplina).
- **Organização livre:** `pastas` (hierárquicas, `pai_id`), `etiquetas` (cor) + `questao_etiquetas`, `questao_pasta`.
- **`questoes`:** `tenant_id, external_id, tipo (objetiva/discursiva), enunciado, banca_id, orgao_id, cargo_ids[], ano, disciplina_id, assunto_id, nivel_dificuldade, gabarito_tipo (oficial/extraoficial), comentario_professor, status (rascunho/publicada/arquivada), criado_por`.
- **`alternativas`** (`questao_id, texto, correta, ordem`), **`competencias`** (para discursivas/correção criteriada — fase posterior), **`feedbacks_questao`** (reportar erro: erro_gabarito/enunciado/desatualizada).
- **UI do card** replicando o concorrente: cabeçalho de metadados, ID copiável + contador, alternativas A–E com **tesoura** (estado client-side), botão **Resolver Questão**, ações (comentário professor, comentários alunos, favoritar, estatísticas, reportar erro). Filtros: banca, órgão, cargo, ano, disciplina, assunto, dificuldade, status, etiqueta, pasta.

---

## Engine de Simulados (núcleo do MVP)

### Modos de aplicação (cada simulado escolhe um)
- **Janela fixa (agendado):** `data_inicio`/`data_fim` globais — o caso 8h–13h com 1000+ simultâneos; encerra todos no fim.
- **Prazo relativo (matrícula avulsa / sob medida):** acesso liberado por aluno; a partir da liberação, prazo em **horas, dias ou meses** para concluir, com **1 ou N tentativas**. Não depende de janela global.
- **Aberto (prática):** sempre disponível.

### Configuração por simulado (`simulados` + `simulado_regras` jsonb/colunas)
- `modo_aplicacao` (janela_fixa | prazo_relativo | aberto), `status` (rascunho/publicado/encerrado), `data_inicio`, `data_fim`, `tempo_limite_min`.
- **Regras configuráveis:**
  - **Janela fixa + auto-encerramento:** ao atingir `data_fim`, todas as sessões em andamento são finalizadas e corrigidas automaticamente (job global).
  - **Tempo limite individual:** X min a partir do início da sessão do aluno; auto-finaliza ao estourar, sempre limitado por `min(tempo_limite, data_fim)`.
  - **Retentativas:** `1 | N | ilimitado` + política de nota (`ultima | melhor | media`).
  - **Iniciar atrasado:** permitir/negar início após `data_inicio`; tempo proporcional ou cheio (config).
  - **Liberação de gabarito/respostas:** `imediato | apos_janela | manual`.
  - **Embaralhamento** de questões e de alternativas (determinístico por sessão).
  - **Revisão antes de enviar:** tela de revisão (respondidas/em branco/marcadas) antes do envio final.
- **Atribuição:** a `grupos` de alunos (`grupos`, `grupo_membros`, `grupo_simulados`) e/ou gate por **matrícula ativa**.

### Sessão de prova (escala + confiabilidade)
- `sessoes_prova`: `simulado_id, estudante_id, tentativa_num, is_teste, status (aguardando/em_andamento/finalizada), iniciado_em, finalizado_em`.
- `sessao_questao_ordem`: **embaralhamento determinístico** por `sessao_id` (seededRandom(uuid)→LCG + Fisher-Yates; ordem persistida e nunca recalculada — ponto P5).
- `respostas_objetivas`: `sessao_id, questao_id, alternativa_id, correta, pontuacao, snapshot_gabarito, tempo_resposta_seg, respondido_em`. **Auto-save idempotente** (upsert por sessão+questão) a cada marcação — evita "big submit" e suporta 1000+ simultâneos.
- **Validação tripla server-side** em cada acesso a questão (ponto U1): sessão pertence ao aluno; não finalizada; dentro do tempo/janela (auto-finaliza se excedido).
- **Auto-encerramento:** job BullMQ atrasado por sessão (tempo individual) + um job no `data_fim` que varre e finaliza todas as sessões da janela e dispara correção. Distribui carga pós-13h via fila (evita thundering herd — jobs de correção enfileirados com concurrency configurável, ex.: 50 simultâneos).
- **Pico de abertura (8h, 1000+ logins simultâneos):** nginx com `limit_req_zone` por IP (ex.: 20 req/s burst 50) para absorver o spike sem derrubar a API; warm-up de cache Redis 30 min antes (`data_inicio - 30min`): pré-carregar `simulado`, `simulado_questoes` e `embed_config` do tenant; `sessao_questao_ordem` gerada na abertura da sessão e persistida imediatamente (não recalculada). Circuit breaker (ex.: `opossum`) no NestJS para isolar falhas de dependências externas durante o pico.

### Matrículas, acesso avulso (sob medida) e testadores
- **Matrícula de plataforma** (`matriculas`: `tenant_id, estudante_id, plano, status, validade`) — gate geral de acesso.
- **Acesso avulso / sob medida** (`simulado_acessos`): concede a um aluno (ou grupo) acesso a um simulado específico no modo **prazo relativo** — `liberado_em`, `prazo_valor` + `prazo_unidade` (horas/dias/meses) → `expira_em` calculado, `tentativas_permitidas`, `tentativas_usadas`. Validação server-side: bloqueia início após `expira_em` ou ao esgotar tentativas; cada nova tentativa abre uma nova `sessao_prova` (mesma política de nota: última/melhor/média).
- **Testadores:** sessões com `is_teste = true` (perfil `testador` ou permissão `simulados:test`) rodam o simulado para validação (inclusive fora da janela/prazo) e são **excluídas de estatísticas, ranking e relatórios**.

### Anulação e re-correção (gabarito/alternativas alterados após a resposta) + impacto "antes e depois"
- `simulado_questoes.anulada` (anula no contexto do simulado) e versionamento de gabarito da questão. Como a resposta guarda `alternativa_id` + `snapshot_gabarito`, alterações **após** o aluno responder são tratadas por um **job de re-correção** (BullMQ) que recalcula `correta`/`pontuacao`, notas de sessão e **ranking** das sessões afetadas, em transação, com **audit log** (operação `ANULAR`/`RECORRIGIR`) e notificação. Política de anulação configurável (pontua todos / desconsidera a questão).
- **Relatório de impacto (beneficiados × prejudicados):** cada evento gera `recorrecoes` (`simulado_id, questao_id, tipo [anulacao/alteracao_gabarito/troca_alternativa], motivo, politica, executado_por, executado_em`) e, por aluno afetado, `recorrecao_impactos` (`estudante_id, nota_antes, nota_depois, delta, ranking_antes, ranking_depois, classificacao [beneficiado/prejudicado/neutro]`). Tela admin lista quem subiu e quem caiu, com nota e posição **antes e depois** — para transparência e respostas a recursos. Tudo imutável e auditado.
- Integridade: trigger garante que `simulado_questoes.questao` é do mesmo tenant (ponto M5).

### Relatórios + Exportação de PDF (via worker)
- **Estatísticas** (aluno e admin): acerto por matéria/assunto/etiqueta, evolução, tempo médio, comparativo com a turma, ranking por simulado, questões com maior erro. Com `relatorio_cache` (TTL) + paginação server-side (pontos P4/P6).
- **PDF do Relatório Final via worker (Puppeteer):** ao encerrar (ou sob demanda), job gera PDF contendo **caderno de respostas** (o que o aluno marcou), **gabarito**, **prova realizada** (na ordem embaralhada do aluno) e **relatório final** (nota, acertos/erros por matéria, ranking, tempo). Salvo via **camada de storage abstrata** (Supabase/S3/GCS por env) e link entregue por notificação. Reaproveita o padrão `jobs` + `arquivos` do documento.

---

## Acesso do aluno: simplificado + área embedável

Objetivo: o aluno entra na prova com **mínimo atrito**, inclusive quando a área de resposta está **embedada em outra plataforma** (página do cliente, LMS, área de membros).

- **Login leve (sem senha), configurável por tenant/simulado:** `metodo_identificacao ∈ {email | email_cpf | email_telefone}`. Os campos exigidos são casados contra o cadastro do aluno (admin cadastra — sem auto-registro). Mais campos = mais segurança (e-mail só é o de menor atrito; e-mail+CPF/telefone funcionam como 2º fator leve). Opção de **OTP por e-mail** quando se quer reforço.
- **Sessão de acesso curta e escopada:** ao identificar, emite-se um **JWT de curta duração escopado ao simulado/tenant** (não dá acesso ao painel). Tudo continua validado server-side (matrícula/acesso avulso/janela/prazo/tentativas).
- **Área embedável (iframe/widget):**
  - Rota dedicada `(/embed/simulado/[token])` enxuta, sem layout do painel, herdando o **tema white-label** do tenant.
  - **`embed_config` por tenant:** `origens_permitidas[]` controla `Content-Security-Policy: frame-ancestors` (só os domínios do cliente embedam) — segurança contra clickjacking.
  - **`postMessage`** para auto-ajuste de altura e eventos (iniciou/finalizou) para a página hospedeira.
  - Link/snippet de embed gerado no admin (com a chave pública do simulado).
- **Fluxo:** página do cliente embeda o widget → aluno informa e-mail (+CPF/telefone) → backend valida identidade e regras → abre/retoma `sessao_prova` → resolve → resultado conforme política de liberação.

## Mensagens e contatos personalizáveis por tenant

Cada tenant edita os textos que o aluno vê e seus canais de contato — com **variáveis de template** (`{{nome}}`, `{{simulado}}`, `{{prazo}}`, `{{tentativas_restantes}}`, `{{contato}}`).

- **Tipos de mensagem (chaves):**
  - **Bloqueio:** sem matrícula ativa, fora da janela, prazo expirado, tentativas esgotadas, simulado não publicado/encerrado, identidade não encontrada.
  - **Liberação:** simulado disponível, gabarito liberado, nota/relatório liberado.
  - **Alerta:** tempo acabando, prazo encerrando (ex.: faltam X dias), nova tentativa disponível.
- **Contatos/suporte por tenant:** WhatsApp, e-mail de suporte, telefone, link de ajuda, horário de atendimento — exibidos junto às mensagens de bloqueio (ex.: "Acesso expirado. Fale com {{contato}}").
- **Defaults seedados** por tenant (editáveis); admin gerencia em tela própria, com preview. Canal in-app no MVP; e-mail/WhatsApp reutilizam o roteamento de notificações em fase posterior.

## Modelo de dados completo (tabelas + regras de negócio)

> Convenções: toda tabela de negócio tem `id uuid PK`, `tenant_id uuid FK` (exceto as globais marcadas 🌐), `criado_em`/`atualizado_em timestamptz`. **RLS** ativo em 100% das tabelas com `tenant_id` (`USING tenant_id = current_setting('app.current_tenant_id')`). FKs com `ON DELETE CASCADE` em filhos e `RESTRICT` onde apagar quebraria histórico.

### A. Núcleo multi-tenant & identidade
| Tabela | Campos-chave | Regras de negócio |
|---|---|---|
| 🌐 `tenants` | `nome, dominio UNIQUE, tema jsonb (logo, cores, fonte), plano, ativo` | Resolução por subdomínio injeta `tenant_id` na sessão. `tema` dirige o white-label (cores/logo por marca). Tenant inativo bloqueia login. |
| 🌐 `users` | `email UNIQUE, senha_hash, nome, status, mfa_secret?, ultimo_login` | 1 conta global por e-mail (cross-tenant). Sem auto-registro de aluno (só admin cria). Rate limit + lockout em login. |
| 🌐 `tenant_acessos` | `user_id, tenant_id, role, ativo, UNIQUE(user_id,tenant_id)` | Define **onde** e **com que papel** o usuário entra. Mesmo e-mail pode ser aluno num tenant e admin em outro. Seletor de plataforma pós-login quando há >1 acesso. `ativo=false` suspende sem apagar. |
| `embed_config` | `origens_permitidas[], metodo_identificacao_padrao (email/email_cpf/email_telefone), otp_email, ativo` | Controla `frame-ancestors` da área embedável e o login leve padrão do tenant (override por simulado). |
| `tenant_contatos` | `whatsapp, email_suporte, telefone, link_ajuda, horario_atendimento` | Canais exibidos nas mensagens de bloqueio/suporte. |
| `tenant_mensagens` | `chave (bloqueio_sem_matricula/bloqueio_fora_janela/bloqueio_prazo_expirado/bloqueio_tentativas/bloqueio_identidade/liberacao_disponivel/liberacao_gabarito/liberacao_nota/alerta_tempo/alerta_prazo…), titulo, corpo (template c/ variáveis), canal, ativo, UNIQUE(tenant_id,chave)` | Textos personalizáveis com `{{variáveis}}`; defaults seedados e editáveis no admin. |

### B. Autenticação & RBAC
| Tabela | Campos-chave | Regras |
|---|---|---|
| `roles` | `nome, descricao, is_sistema` | Perfis-semente (super_admin🌐, admin_geral, admin_conteudo, admin_correcao, admin_relatorio, admin_comercial, estudante, testador) + perfis criados pelo tenant. `is_sistema` não pode ser deletado. |
| 🌐 `permissions` | `resource, action, UNIQUE(resource,action)` | Catálogo fixo `módulo:ação` (`simulados:create`, `auditoria:view`…). Seed na migration. |
| `role_permissions` | `role_id, permission_id` | Matriz editável na tela de RBAC. |
| `user_roles` | `user_id, tenant_id, role_id` | Um usuário pode ter >1 papel no tenant; permissões são a UNIÃO. |
| 🌐 `refresh_tokens` | `user_id, token_hash, expira_em, revogado, user_agent, ip` | Refresh httpOnly; rotação a cada uso; revogação em logout/troca de senha. |
| `api_keys` | `nome, key_hash, escopos[], ultimo_uso, expira_em, revogada` | Auth de API por tenant; escopos limitam recursos; nunca armazenar a chave em claro. |
| `webhook_endpoints` | `url, evento, segredo_hmac, ativo` | Ingestão/saída; payload assinado HMAC; retries com backoff via fila. |

### C. Perfis & matrículas
| Tabela | Campos-chave | Regras |
|---|---|---|
| `estudantes` | `user_id, nome, cpf, telefone, data_nascimento` | Perfil do aluno **por tenant**. CPF único por tenant. |
| `tenant_admins` | `user_id, nome, cargo` | Perfil administrativo por tenant. |
| `matriculas` | `estudante_id, plano, status (ativa/expirada/cancelada), validade` | Gate geral. Job diário marca `expirada` quando `validade < now()`; alerta comercial em N dias antes. Histórico de acesso por aluno. |

### D. Taxonomia & organização de conteúdo
| Tabela | Campos-chave | Regras |
|---|---|---|
| `bancas` `orgaos` `cargos` `anos` `disciplinas` | `nome` (+ `disciplinas.ordem`) | Filtros estruturados do banco de questões (estilo Mapa da Prova). |
| `assuntos` | `disciplina_id, nome, pai_id?` | Árvore de assuntos sob disciplina. |
| `pastas` | `nome, pai_id?` | Organização hierárquica livre (estilo documento). |
| `etiquetas` | `nome, cor` | Tags livres (`CESPE`, `Alta Recorrência`…). |

### E. Questões
| Tabela | Campos-chave | Regras |
|---|---|---|
| `questoes` | `external_id?, tipo (objetiva/discursiva), enunciado, banca_id, orgao_id, ano, disciplina_id, assunto_id, nivel_dificuldade, gabarito_tipo, comentario_professor, status (rascunho/publicada/arquivada), versao, criado_por` | Ciclo `rascunho→publicada→arquivada`. `external_id` único por tenant (dedupe na importação). `versao` incrementa ao alterar gabarito/alternativas (rastreabilidade da re-correção). Só `publicada` aparece para aluno. Não deletar se houver respostas/blocos vinculados (RESTRICT). |
| `alternativas` | `questao_id, texto, correta, ordem` | Exatamente 1 `correta` em objetiva (constraint/trigger). Alterar após uso dispara re-correção. |
| `questao_cargos` | `questao_id, cargo_id` | N:N (questão pode valer p/ vários cargos). |
| `questao_etiquetas` / `questao_pasta` | N:N | Mapeamento e busca. |
| `competencias` | `questao_id, nome, peso` | Critérios p/ correção de discursiva (fase posterior). |
| `feedbacks_questao` | `questao_id, estudante_id, tipo (erro_gabarito/enunciado/desatualizada/outro), descricao, status (pendente/analisado/resolvido)` | "Reportar erro"; fila de moderação p/ admin de conteúdo. |
| `favoritos` | `estudante_id, questao_id, UNIQUE` | "Favoritar" do card. |
| `comentarios_questao` | `questao_id, autor_id, tipo (professor/aluno), texto, aprovado` | Comentários do professor e da comunidade; moderação opcional. |

### F. Simulados & atribuição
| Tabela | Campos-chave | Regras |
|---|---|---|
| `simulados` | `titulo, descricao, modo_aplicacao (janela_fixa/prazo_relativo/aberto), status, data_inicio, data_fim, tempo_limite_min, metodo_identificacao?, embed_ativo, regras jsonb, criado_por` | `regras` guarda: retentativas (n/política nota), embaralhar questões/alternativas, permitir iniciar atrasado, liberar gabarito (imediato/após/manual), revisão antes de enviar, política de anulação. `metodo_identificacao` faz override do padrão do tenant (login leve). Publicar valida coerência (datas, ≥1 questão). |
| `simulado_questoes` | `simulado_id, questao_id, ordem, peso, anulada, UNIQUE(simulado_id,questao_id)` | Trigger garante questão do mesmo tenant (M5). `anulada=true` aciona re-correção. |
| `grupos` / `grupo_membros` / `grupo_simulados` | N:N | Atribuição em massa a turmas. |
| `simulado_acessos` | `simulado_id, estudante_id (ou grupo_id), liberado_em, prazo_valor, prazo_unidade (horas/dias/meses), expira_em, tentativas_permitidas, tentativas_usadas` | **Modo prazo relativo / avulso (sob medida).** `expira_em = liberado_em + prazo`. Bloqueia início após expirar ou esgotar tentativas. |

### G. Sessão de prova & respostas (escala 1000+)
| Tabela | Campos-chave | Regras |
|---|---|---|
| `sessoes_prova` | `simulado_id, estudante_id, tentativa_num, is_teste, status (aguardando/em_andamento/finalizada), iniciado_em, finalizado_em, nota, posicao_ranking` | Validação tripla a cada acesso (dono / não finalizada / dentro do tempo-janela; auto-finaliza se excede — U1). `is_teste` exclui de stats/ranking. Auto-encerramento: job atrasado por sessão + job no `data_fim`. |
| `sessao_questao_ordem` | `sessao_id, questao_id, ordem_exibida, ordem_alternativas jsonb` | Embaralhamento **determinístico** por `sessao_id` (seed→Fisher-Yates); persistido, nunca recalculado (P5). |
| `respostas_objetivas` | `sessao_id, questao_id, alternativa_id, correta, pontuacao, snapshot_gabarito, tempo_resposta_seg, respondido_em, UNIQUE(sessao_id,questao_id)` | **Auto-save idempotente** (upsert) a cada marcação. `snapshot_gabarito` preserva o gabarito vigente p/ re-correção justa. |
| `sessao_eventos` | `sessao_id, tipo (iniciou/respondeu/revisou/finalizou/auto_finalizou), criado_em` | Trilha para auditoria e antifraude leve. |

### H. Anulação / re-correção & impacto antes-depois
| Tabela | Campos-chave | Regras |
|---|---|---|
| `recorrecoes` | `simulado_id, questao_id, tipo (anulacao/alteracao_gabarito/troca_alternativa), motivo, politica, executado_por, executado_em` | Cada evento dispara job transacional que recalcula `respostas`, `sessoes_prova.nota` e ranking. |
| `recorrecao_impactos` | `recorrecao_id, estudante_id, nota_antes, nota_depois, delta, ranking_antes, ranking_depois, classificacao (beneficiado/prejudicado/neutro)` | **Relatório "antes e depois"** imutável; base para transparência e resposta a recursos. |

### I. Relatórios, arquivos, jobs & notificações
| Tabela | Campos-chave | Regras |
|---|---|---|
| `relatorio_cache` | `tipo, chave UNIQUE, dados jsonb, valido_ate` | TTL; se expirado, recalcula via job (P6); paginação server-side sempre (P4). |
| `arquivos` | `nome, tipo_mime, tamanho_bytes, provider (supabase/s3/gcs), bucket, path, path_thumb, processado, publico` | Camada de storage abstrata; validação server-side (mime+tamanho+magic bytes — S3); `sharp` gera thumb. |
| `jobs` | `tipo, payload jsonb, status (pendente/processando/concluido/erro), tentativas, resultado jsonb` | Espelho dos jobs BullMQ (PDF, re-correção, auto-encerramento, import, imagens) p/ visibilidade no admin. |
| `notificacoes` | `estudante_id, tipo, titulo, mensagem, lida` | In-app; roteamento push/e-mail/WhatsApp em fase posterior. |

### J. Auditoria & LGPD
| Tabela | Campos-chave | Regras |
|---|---|---|
| `audit_logs` | `actor_user_id, tabela, operacao (INSERT/UPDATE/DELETE/LIBERAR/BLOQUEAR/ANULAR/RECORRIGIR), dados_anteriores jsonb, dados_novos jsonb, ip, user_agent` | Interceptor global registra toda mutação + login + mudança de permissão + liberações. Imutável (sem update/delete). |
| 🌐 `lgpd_consentimentos` | `user_id, versao_politica, ip, user_agent, aceito_em, UNIQUE(user_id,versao)` | Middleware força consentimento no 1º acesso; bump de versão → re-consentir (S6). |
| 🌐 `lgpd_solicitacoes` | `user_id, tipo (acesso/exclusao/portabilidade), status, processado_em` | Workflow: exportação JSON / anonimização / portabilidade. |

### K. Fase posterior (tabelas já previstas, não no MVP)
- **Discursivas:** `respostas_discursivas` (status pendente/em_analise/corrigida/liberada), `arquivos_discursivos`, `correcoes_discursivas` (lock: `em_correcao_por`, `lock_expira_em` — M1), `anotacoes_discursivas` (coordenadas 0–1 — M6), `correcao_competencias`.
- **Cadernos/Designer:** `caderno_templates` (por tenant), `cadernos`, `caderno_versoes` (máx. 5 — Des5), `caderno_paginas`, `caderno_blocos`, `caderno_bloco_questoes` (RESTRICT — Des1).
- **Mentoria:** `mentorias`, `mentoria_inscricoes`, `mentoria_ciclos`, `mentoria_encontros`, `mentoria_encontro_inscritos`, `mentoria_lista_espera` (X-Force ≤15 — U3/Men2), `mentoria_materiais`, `mentoria_progresso`, `mentoria_perguntas`.
- **Mobile:** `expo_push_tokens`.

### Funções/triggers/índices-chave
- Funções: `get_tenant_id()` (RLS), `seed_shuffle(sessao_id)`, `adquirir_lock_correcao()` (fase posterior).
- Triggers: 1-correta-por-questão; questão∈tenant do simulado (M5); template∈tenant (U2); limpeza de versões de caderno; sync `audit_logs`.
- Índices: `questoes(tenant_id,status)`, `respostas_objetivas(sessao_id)`, `sessoes_prova(simulado_id,status)`, `simulado_acessos(estudante_id,expira_em)`, `audit_logs(actor_user_id,criado_em DESC)`, `jobs(tipo,status) WHERE status='pendente'`.

---

## Arquivos/artefatos a criar (representativos)
- Raiz: `docker-compose.yml`, `pnpm-workspace.yaml`, `turbo.json`, `.env.example`, `docker/nginx.conf`, Dockerfiles (`api`, `web`, `worker`) com multi-stage build e non-root user.
- `apps/api/prisma/schema.prisma` + migrations (incl. SQL manual de **políticas RLS**, funções, triggers e **índices adicionais**; todas com `down()` implementado).
- `apps/api/src/common/`: `tenant.middleware.ts`, `permissions.guard.ts`, `require-permission.decorator.ts`, `audit.interceptor.ts`, `lgpd.middleware.ts`, `rate-limit.guard.ts`, `security-headers.middleware.ts`, `soft-delete.middleware.ts`, `prom-metrics.middleware.ts`, `html-sanitizer.pipe.ts`.
- `apps/api/src/modules/<modulo>/` para cada módulo listado.
- `apps/worker/src/processors/`: `auto-encerramento`, `re-correcao`, `pdf-relatorio` (Puppeteer), `import`, `imagens` (sharp), `usage-aggregation`, `slo-report`.
- `apps/web/src/app/`: `(auth)/login`, `(app)/questoes`, `(app)/simulados`, `(app)/simulados/[id]/sessao`, `(admin)/rbac`, `(admin)/auditoria`, `(admin)/conteudo`, `(admin)/simulados`, `(admin)/matriculas`, `(admin)/relatorios`, `(admin)/tenants`, `(admin)/integridade`, `(lgpd)/consentimento`.
- `apps/web/src/components/`: `question-card.tsx`, `prova-runner.tsx` (auto-save optimistic + service worker + timer acessível + antifraude events), `theme-provider`, `useCan`, `a11y-check.tsx`.
- `packages/shared/`: contratos zod (DTOs) reutilizados; arquivos `pt-BR.json` de i18n.
- Seeds: tenant demo, perfis/permissões, taxonomia, questões e um simulado de exemplo.
- **Testes:** `apps/api/src/**/*.spec.ts`, `apps/api/test/**/*.integration.spec.ts` (incl. `rls`, `recorrecao`, `xss`, `antifraude`), `apps/web/e2e/**/*.spec.ts` (incl. `a11y` com axe-core), `tests/load/*.k6.js`.
- **Observabilidade:** `docker/prometheus.yml`, `docker/grafana/dashboards/`, `docker/loki-config.yaml`, `docker/otel-collector-config.yaml`.
- **Backup/DR:** `scripts/backup-pg.sh`, `scripts/restore-pg.sh`, `scripts/test-restore.sh`, `scripts/anonymize-staging-dump.sh`.
- **CD/Deploy:** `.github/workflows/ci.yml`, `.github/workflows/cd.yml`, `scripts/check-deploy-safe.sh`, `.pre-commit-config.yaml` (git-secrets + trufflehog).

---

## Faseamento
- **Fase 1 — Fundação + Simulados (MVP):** monorepo + Docker → modelagem DB + RLS + triggers + **soft delete** + **índices adicionais** → auth/tenants/`tenant_acessos` → RBAC + tela admin → auditoria + visualizador → LGPD (consentimento + direitos) → taxonomia + CRUD de questões + card/resolver + **sanitização HTML** → **engine de simulados** (modos janela fixa/prazo relativo-avulso/aberto, sessão, auto-save **com optimistic UI + service worker**, embaralhamento, auto-encerramento + **estratégia pico de abertura**, retentativas, revisão, matrículas, testadores, anulação/re-correção + **relatório de impacto antes/depois**) → **antifraude** (eventos + painel de integridade) → relatórios + **PDF final via worker** → **acesso simplificado do aluno + área embedável** + **segurança aprofundada + threat model** → **a11y WCAG 2.1 AA + tempo extra** → **mensagens e contatos personalizáveis** → API keys + webhook → **tema white-label** + dark/light/system → **onboarding de tenant** → **observabilidade** → **testes (unitários + integração + e2e com axe-core + carga)** → **backup/DR** → **CD pipeline + rollback** → **segurança de supply chain** → **i18n preparado** + fuso horário por tenant → **billing metrics desde o dia 1** → **SLOs + runbooks**.
- **Fase 2:** comentários ricos, favoritos, cadernos de estudo do aluno, estatísticas avançadas/ranking, notificações (push/e-mail/WhatsApp via N8N), **read replica** para relatórios, feature flags por tenant.
- **Fase 3:** discursivas + correção (canvas/anotações/lock/competências), cadernos/designer (editor de blocos + PDF), mentoria (ciclos/encontros/X-Force/materiais/Q&A).
- **Fase 4+:** mobile Expo + push; migração de storage S3/GCS (abstração pronta); gateway de pagamento + billing automatizado; IA de seleção de questões; expansão internacional (i18n completo).

---

## Verificação (end-to-end)
1. `docker compose up` sobe nginx + api + web + worker + postgres + pgbouncer + redis + prometheus + grafana + loki; migrations, RLS, triggers e seeds aplicados.
2. **Multitenancy/RLS:** dois tenants distintos não veem dados um do outro, inclusive em query sem filtro explícito (valida RLS); seletor de plataforma pós-login com usuário multi-tenant.
3. **RBAC:** perfil "estudante" sem `rbac`/`auditoria` → menu some no front **e** API retorna 403 no acesso direto.
4. **LGPD:** 1º acesso bloqueia até consentir; incrementar versão força re-consentimento; solicitação de exportação gera JSON; anonimização não quebra FKs de histórico.
5. **Auditoria:** criar/editar/excluir questão, liberar gabarito e anular questão geram registros com diff e operação correta.
6. **Simulado em escala:** abrir sessão, marcar respostas (auto-save), validar embaralhamento estável após reload (P5), timer individual e janela global; **k6 com 1000 VUs no pico de abertura** — p95 < 2 s e zero perda de respostas; **auto-encerramento** de todos no `data_fim` dentro de 60 s; cache warm-up ativo antes de `data_inicio`.
7. **Regras:** retentativas + política de nota; **acesso avulso com prazo relativo** (horas/dias/meses) bloqueia início após expirar/esgotar tentativas; iniciar atrasado conforme config; revisão antes de enviar; testador não conta em ranking; **anulação/alteração de gabarito após resposta** dispara re-correção, recalcula notas/ranking e popula o **relatório antes/depois** (beneficiados × prejudicados).
8. **PDF final:** encerrar simulado → worker gera PDF (caderno de respostas + gabarito + prova realizada + relatório), salvo no storage e link entregue.
9. **API/Webhook:** payload assinado (HMAC) ingere questões na fila, com dedupe por `external_id`; validação server-side de upload; **rotação de segredo HMAC** funciona com janela de tolerância; versão sunset exibe banner no admin.
10. **Tema white-label:** abrir dois subdomínios de tenants diferentes mostra marcas distintas (ex.: roxo+amarelo vs. verde+branco vs. azul) sem rebuild; dark/light/system persiste após reload e combina com a marca.
11. **Acesso embedável + login leve:** embedar o widget numa página de teste de origem permitida → aluno entra só com e-mail (e CPF/telefone conforme config) → resolve a prova; origem não listada é bloqueada por `frame-ancestors`; **rate limit** bloqueia após 5 tentativas erradas em 60 s; tempo de resposta constante (enumeração impossível); **OTP** funciona e expira após TTL.
12. **Mensagens por tenant:** editar texto de bloqueio/liberação/alerta e contatos; aluno bloqueado (prazo expirado/sem matrícula) vê a mensagem personalizada com variáveis e canal de contato corretos.
13. **Swagger** acessível refletindo os endpoints versionados.
14. **Observabilidade:** `/api/health/ready` retorna 200 com todas as dependências saudáveis; `/metrics` expõe métricas Prometheus; Grafana mostra sessões ativas durante o simulado; Sentry captura exceção de teste.
15. **Testes:** `pnpm test --coverage` passa com ≥ 80% de branches; testes de integração de RLS e re-correção verdes; Playwright fluxo do aluno e embed passam; k6 de carga sem erros.
16. **Backup:** `scripts/backup-pg.sh` gera dump comprimido e envia para storage; `scripts/restore-pg.sh` sobe banco em container isolado e valida RLS ativo; alerta de falha de backup chega no Slack.
17. **Onboarding de tenant:** criar tenant via super_admin → DNS configurado → seed de perfis/mensagens aplicado → admin inicial recebe e-mail → login funcional.

---

## Observabilidade e Monitoramento

Sem observabilidade, operar 1000+ sessões simultâneas é operar no escuro. Esta seção é obrigatória desde a Fase 1.

### Stack de observabilidade (self-hosted no VPS)

| Camada | Ferramenta | Função |
|---|---|---|
| Métricas | **Prometheus** + **Grafana** | Coleta e dashboards de latência, throughput, erros, uso de recursos |
| Logs estruturados | **Loki** (ou stdout → Promtail) | Logs em JSON com `tenant_id`, `trace_id`, `user_id` em todos os registros |
| Tracing distribuído | **OpenTelemetry** (SDK NestJS + Worker) | Traces end-to-end de request → DB → Redis → fila |
| Alertas | **Alertmanager** (via Prometheus) | PagerDuty/Slack/e-mail para SLO violations |
| Error tracking | **Sentry** (self-hosted ou cloud) | Stack traces de exceções não tratadas com contexto de tenant |
| Uptime | **Healthcheck endpoints** + monitor externo | `/api/health` (liveness) e `/api/health/ready` (readiness) |

### Instrumentação do NestJS

- **Middleware de métricas:** `prom-client` expõe `/metrics` (prometheus scrape). Métricas custom: `http_request_duration_seconds` (por rota + tenant), `simulado_sessions_active` (gauge), `grading_job_duration_seconds`, `autosave_requests_total`.
- **OpenTelemetry SDK:** `@opentelemetry/sdk-node` com auto-instrumentação de HTTP, Prisma e BullMQ. Todo span carrega atributos `tenant.id`, `user.id`, `simulado.id` quando disponíveis.
- **Logger estruturado:** `pino` com serializers — todo log inclui `{ timestamp, level, traceId, tenantId, userId, message, ...context }`. Nunca logar dados sensíveis (senhas, tokens, CPF completo).
- **Healthchecks:** `/api/health` retorna `{ status: 'ok' }`; `/api/health/ready` valida conexão com Postgres, Redis e PgBouncer antes de receber tráfego (usado pelo nginx upstream).

### Dashboards e alertas essenciais (Grafana)

- **Dashboard "Simulado ao vivo":** sessões ativas por tenant (gauge), respostas/s (rate), erros de auto-save (counter), lag da fila de auto-encerramento.
- **Dashboard "API":** p50/p95/p99 de latência por endpoint, taxa de erros 4xx/5xx, conexões ativas no PgBouncer, hit rate do Redis.
- **Alertas críticos:**
  - Taxa de erro > 1% em 5 min → PagerDuty.
  - Fila BullMQ com > 500 jobs pendentes há > 2 min → Slack #ops.
  - Sessões finalizadas ≠ sessões esperadas no `data_fim` + 5 min → Slack urgente.
  - Disco > 80% no VPS → alerta antecipado.
  - Certificado TLS expirando em < 14 dias → alerta.

### Rastreabilidade de jobs

- Todo job BullMQ ao ser enfileirado recebe um `traceId` propagado do request de origem. O worker loga `{ jobId, traceId, tipo, tentativa }` ao iniciar e concluir. Falhas persistentes (após N retries) geram entrada em `jobs.status = 'erro'` **e** evento no Sentry com payload sanitizado.

---

## Estratégia de Testes

Toda engine de simulados com race conditions, embaralhamento determinístico e re-correção transacional exige cobertura de testes rigorosa. Cobertura mínima alvo: **80% de branches** no backend.

### Pirâmide de testes

#### Testes unitários (Jest — `apps/api`)
Cobertura de lógica de negócio isolada. Mocks de Prisma via `jest-mock-extended` ou `prisma-mock`.

- `grading.service.spec.ts`: re-correção com todos os cenários (anulação pontua todos / descarta questão; gabarito alterado; aluno que não respondeu).
- `shuffle.util.spec.ts`: embaralhamento determinístico — mesma `sessao_id` sempre produz a mesma ordem; ordens distintas para sessões distintas.
- `session-time.service.spec.ts`: lógica de `min(tempo_limite, data_fim)`; auto-finalização ao estourar; iniciar atrasado.
- `access-rules.service.spec.ts`: todas as combinações de janela/prazo/tentativas/matrícula.
- `hmac.util.spec.ts`: assinatura e validação de webhooks; rotação de segredo com janela de tolerância.
- `rate-limit.service.spec.ts`: contador Redis; backoff exponencial; desbloqueio após TTL.

#### Testes de integração (Jest + Testcontainers ou banco de teste dedicado)
Testam módulos com banco e Redis reais — sem mocks de infra.

- `rls.integration.spec.ts`: **crítico** — dois tenants distintos nunca veem dados um do outro, mesmo sem filtro explícito em queries Prisma. Cobre todas as tabelas com RLS.
- `simulado-session.integration.spec.ts`: fluxo completo — criar sessão → auto-save idempotente (upsert concorrente) → encerrar → nota calculada → PDF job enfileirado.
- `auto-close.integration.spec.ts`: job de auto-encerramento finaliza exatamente as sessões do simulado dentro da janela, sem afetar outros simulados ou tenants.
- `recorrecao.integration.spec.ts`: anulação dispara re-correção em transação; `recorrecao_impactos` populado corretamente; rollback em caso de erro.
- `auth-embed.integration.spec.ts`: rate limit aplicado; enumeração de usuário retorna mesmo tempo de resposta; OTP expira após TTL.
- `webhook-ingest.integration.spec.ts`: dedupe por `external_id`; payload inválido rejeitado com 400; HMAC inválido rejeitado com 401.

#### Testes e2e (Playwright — `apps/web`)
Fluxos críticos do ponto de vista do usuário final.

- **Fluxo do aluno:** login leve (e-mail + CPF) → resolução de questão → auto-save visível → revisão antes de enviar → envio → tela de resultado.
- **Fluxo de embed:** iframe carregado em página externa → identificação → prova → encerramento → `postMessage` de conclusão recebido.
- **Admin — simulado:** criar simulado com janela fixa → publicar → abrir como aluno → auto-encerramento no `data_fim`.
- **Admin — RBAC:** perfil "estudante" não acessa `/admin/*` (redirecionado) e API retorna 403.
- **White-label:** dois subdomínios distintos carregam cores e logos diferentes sem rebuild.

#### Testes de carga (k6 — `tests/load/`)
Executados em ambiente de staging antes de cada deploy que altere a engine de simulados.

- `simulado-peak.k6.js`: simula 1000 VUs abrindo sessão simultaneamente (pico de abertura às 8h); valida p95 < 2 s e zero perda de respostas.
- `autosave-storm.k6.js`: 1000 VUs enviando auto-save a cada 30 s por 5 h; valida idempotência e p99 < 500 ms.
- `auto-close.k6.js`: dispara job de `data_fim` com 1000 sessões ativas; valida que todas são finalizadas em < 60 s e notas calculadas.

### Configuração de CI (GitHub Actions)

```yaml
# .github/workflows/ci.yml (resumo)
jobs:
  test:
    steps:
      - unit:    pnpm test --filter=api -- --coverage --coverageThreshold='{"global":{"branches":80}}'
      - integration: docker compose -f docker-compose.test.yml up -d && pnpm test:int
      - e2e:     pnpm playwright test --project=chromium
      - load:    k6 run tests/load/simulado-peak.k6.js  # apenas em PRs para main
```

- **Coverage gate:** PR bloqueado se cobertura de branches cair abaixo de 80% no `api/`.
- **Testes de integração:** rodam com `docker-compose.test.yml` (Postgres + Redis efêmeros).
- **Testes de carga:** rodam apenas em PRs para `main` (branch de produção) — evitar custo em feature branches.

---

## Backup, Disaster Recovery e Migrations Zero-Downtime

### Estratégia de Backup (Postgres)

| Tipo | Frequência | Retenção | Ferramenta |
|---|---|---|---|
| Backup lógico completo | Diário (3h da manhã) | 30 dias | `pg_dump` → comprimido → S3/B2 |
| WAL archiving (PITR) | Contínuo | 7 dias | `pgBackRest` ou `wal-g` |
| Snapshot do volume | Semanal | 4 semanas | Snapshot do VPS provider |

- **RPO alvo:** 5 min (WAL archiving); **RTO alvo:** 30 min (restore de backup + replay WAL).
- **Teste de restore:** mensal, em ambiente isolado — validar que o banco sobe e RLS está ativo.
- **Backup do Redis:** `BGSAVE` diário (dados de sessão são efêmeros; o crítico é o Postgres).
- **Alerta:** job de backup falhou → Slack #ops imediato.

### Replicação e Alta Disponibilidade

- **MVP (VPS único):** Postgres com WAL archiving. Sem réplica de leitura inicialmente.
- **Fase 2+:** adicionar **read replica** (Postgres streaming replication) para queries de relatórios e ranking, aliviando a primary durante picos de simulado. Prisma com `datasourceUrl` por operação (`readReplica` extension).
- **PgBouncer:** modo `transaction` para manter conexões sob controle durante pico de 1000+ sessões.

### Migrations Zero-Downtime (Expand/Contract Pattern)

Migrations que alteram tabelas com sessões ativas (ex.: `respostas_objetivas`, `sessoes_prova`) devem seguir o padrão para evitar table locks prolongados:

1. **Expand:** adicionar nova coluna/índice de forma não-destrutiva (`ADD COLUMN ... DEFAULT NULL`, `CREATE INDEX CONCURRENTLY`). Deploy da API que suporta ambos os estados.
2. **Migrate:** backfill de dados existentes em batches (`UPDATE ... WHERE id BETWEEN x AND y LIMIT 1000`), sem lock de tabela.
3. **Contract:** remover coluna/índice antigo após validar que nenhum código o referencia. Deploy final.

- **Regras:** nunca `ALTER TABLE ... ALTER COLUMN TYPE` sem expand/contract em tabelas grandes; nunca `ADD COLUMN NOT NULL` sem `DEFAULT`; sempre `CREATE INDEX CONCURRENTLY` (nunca `CREATE INDEX` síncrono em produção).
- **Rollback de migration:** toda migration tem `down()` implementado; testado em staging antes de produção.
- **Checklist pré-deploy:** migrations aprovadas pelo DBA/tech lead, executadas fora do pico (ex.: 2h da manhã para janela fixa do dia seguinte).

### Onboarding de Novo Tenant

Processo de provisionamento via painel `super_admin` (ou script CLI para automação):

1. **Criar tenant:** `POST /api/admin/tenants` com `{ nome, dominio, plano, tema_inicial }` → insere em `tenants` + configura subdomínio no nginx (reload sem downtime via `nginx -s reload`).
2. **Seed automático:** ao criar tenant, uma migration de seed executa: perfis-padrão (`admin_geral`, `estudante`, etc.) + permissões + mensagens-padrão (`tenant_mensagens`) + contatos placeholder (`tenant_contatos`) + `embed_config` com origens vazias.
3. **Criar admin inicial:** `POST /api/admin/tenants/:id/admins` → cria `user` + `tenant_acessos` com role `admin_geral` + envia e-mail de boas-vindas com link de definição de senha.
4. **Configurar DNS:** instruções exibidas no painel (CNAME `tenant.seudominio.com` → IP do VPS). Verificação automática via DNS lookup antes de ativar.
5. **Validação:** checklist no painel — DNS ativo ✓, TLS emitido ✓, seed aplicado ✓, admin criado ✓.

---

## Soft Delete e Integridade Histórica

Registros vinculados a histórico de provas (questões, alternativas, simulados) **nunca são deletados fisicamente**. Padrão:

- **`deleted_at timestamptz`** em: `questoes`, `alternativas`, `simulados`, `simulado_questoes`, `estudantes`, `matriculas`, `grupos`.
- **Filtro padrão:** toda query via Prisma aplica `WHERE deleted_at IS NULL` (via middleware global de soft-delete ou extension `prisma-soft-delete`).
- **Exceção explícita:** relatórios de re-correção, auditoria e LGPD podem precisar incluir registros deletados — usar `findUnique`/`findFirst` com override do filtro.
- **Interação com LGPD:** solicitação de exclusão (`lgpd_solicitacoes.tipo = 'exclusao'`) executa **anonimização** (nullifica nome, e-mail, CPF, telefone do `users` + `estudantes`) em vez de hard delete — preservando integridade de FK em `respostas_objetivas` e `audit_logs`. Hard delete apenas para dados sem vínculo histórico (ex.: `notificacoes` lidas > 90 dias).
- **RLS e soft delete:** políticas RLS filtram `deleted_at IS NULL` explicitamente nas tabelas onde isso é crítico (ex.: `questoes`, `simulados`).

---

## SLOs, Disponibilidade e Error Budget

Antes de assinar contrato com qualquer tenant corporativo, os SLOs precisam estar formalizados — eles são o contrato técnico do SaaS.

### SLOs por tier de plano

| Métrica | Plano Básico | Plano Pro | Plano Enterprise |
|---|---|---|---|
| Disponibilidade mensal | 99,0% (7,3 h/mês de downtime tolerado) | 99,5% (3,6 h/mês) | 99,9% (43 min/mês) |
| Latência p95 (API geral) | < 2 s | < 1 s | < 500 ms |
| Latência p95 (auto-save simulado) | < 1 s | < 500 ms | < 300 ms |
| Latência p95 (abertura de sessão) | < 3 s | < 2 s | < 1 s |
| Tempo de encerramento de simulado (data_fim → todas sessões finalizadas) | < 5 min | < 2 min | < 60 s |
| RPO (perda máxima de dados) | 15 min | 5 min | 5 min |
| RTO (tempo de restore) | 2 h | 1 h | 30 min |

### Error budget

- **Error budget mensal** = 100% − SLO. Ex.: Pro = 0,5% do mês = ~3,6 h de indisponibilidade permitida.
- **Queima do budget:** monitorado semanalmente no Grafana (painel "SLO Budget"). Se > 50% do budget mensal consumido na primeira quinzena → congelar deploys de feature e priorizar estabilidade.
- **Alertas de budget:** Alertmanager dispara em 25%, 50% e 75% de consumo do error budget mensal por tenant tier.
- **Exclusões do SLO:** manutenção programada (anunciada com 72 h de antecedência via e-mail + banner no admin), falhas fora do controle do serviço (CDN, DNS do cliente, VPS provider).

### Medição e relatório

- **Disponibilidade:** calculada via `/api/health/ready` (probe a cada 30 s pelo monitor externo — ex.: Uptime Robot, Better Uptime). Indisponibilidade = probe consecutivos falhos por > 1 min.
- **Relatório mensal automático:** job BullMQ no 1º dia do mês gera relatório de SLO por tenant (disponibilidade real, budget consumido, incidentes) e envia por e-mail para os contatos técnicos do tenant (`tenants.contatos_tech[]`).
- **Tabela `slo_incidents`** (🌐): `tenant_tier, inicio, fim, duracao_min, tipo (disponibilidade/latencia/encerramento), causa_raiz, excluido_slo` — fonte de verdade para cálculo e contestações.

### Penalidades e créditos de serviço (referência contratual)

| Budget consumido no mês | Crédito sobre fatura |
|---|---|
| 100–110% (SLO violado levemente) | 10% |
| 110–150% | 25% |
| > 150% | 50% |

- Créditos aplicados automaticamente na próxima fatura (integração com gateway de pagamento na Fase 4+; até lá, processados manualmente pelo admin comercial).

---

## Métricas de Consumo por Tenant (Base para Billing)

Coletar desde a Fase 1 — mesmo que billing automatizado seja Fase 4+. Dados sem histórico não se reconstroem.

### O que medir (tabela `tenant_usage_daily`)

| Métrica | Como medir | Relevância |
|---|---|---|
| `sessoes_abertas` | COUNT de `sessoes_prova` criadas no dia | Volume de uso do produto core |
| `questoes_ativas` | COUNT de `questoes WHERE status='publicada' AND deleted_at IS NULL` | Tamanho do banco de questões |
| `storage_bytes` | SUM de `arquivos.tamanho_bytes` | Custo de storage |
| `pdf_gerados` | COUNT de jobs `pdf-relatorio` concluídos | Custo de worker/CPU |
| `emails_enviados` | COUNT de notificações de e-mail disparadas | Custo de e-mail provider |
| `api_calls` | COUNT de requests com `api_key` no header | Consumo da API pública |
| `estudantes_ativos` | COUNT DISTINCT de `estudante_id` em `sessoes_prova` no mês | Usuários ativos mensais (MAU) |

### Coleta e armazenamento

- **Job diário** (BullMQ, 1h da manhã): agrega métricas do dia anterior e insere em `tenant_usage_daily` (`tenant_id, data, metricas jsonb`).
- **Job mensal** (1º dia): consolida `tenant_usage_monthly` e dispara relatório para o admin comercial.
- **Retenção:** `tenant_usage_daily` por 2 anos (auditoria e contestações de billing); `tenant_usage_monthly` indefinidamente.
- **Painel "Meu Consumo"** no admin do tenant: gráfico de sessões/mês, storage usado vs. limite do plano, MAU, alertas de aproximação do limite (ex.: 80% do storage contratado).

### Limites por plano e alertas

| Recurso | Plano Básico | Plano Pro | Plano Enterprise |
|---|---|---|---|
| Estudantes ativos/mês | 200 | 2.000 | Ilimitado |
| Questões ativas | 500 | 5.000 | Ilimitado |
| Storage (arquivos + PDFs) | 5 GB | 50 GB | Sob contrato |
| Simulados simultâneos (janela fixa) | 1 | 5 | Ilimitado |

- **Soft limit (80%):** banner de aviso no painel admin do tenant + e-mail para contatos comerciais.
- **Hard limit (100%):** bloqueia criação de novos recursos (novas questões, novo simulado) sem bloquear sessões em andamento (nunca interromper prova ativa).
- **Override super_admin:** `tenant_limits_override` permite exceções pontuais (ex.: tenant em trial estendido) sem alterar o plano contratado.

---

## Runbook de Incidentes

Para cada alerta crítico definido na seção de Observabilidade, existe um runbook correspondente. Objetivo: qualquer engenheiro de plantão resolve sem depender de quem criou o sistema.

### Estrutura padrão de um incidente

1. **Detectar** — alerta no Slack/PagerDuty com link para o dashboard relevante.
2. **Avaliar impacto** — quantos tenants afetados? Sessões ativas? Budget de SLO consumido?
3. **Mitigar** — ação imediata para reduzir impacto (mesmo que não resolva a causa raiz).
4. **Resolver** — correção definitiva.
5. **Comunicar** — atualizar status page e notificar tenants afetados.
6. **Post-mortem** — registrar em `slo_incidents` + documento de lições aprendidas (blameless).

---

### RB-01 — Falha no auto-encerramento de simulado

**Alerta:** `sessoes_finalizadas != sessoes_esperadas` no `data_fim + 5 min`.

**Impacto:** alunos com sessão "em_andamento" após o fim da janela; não podem ver gabarito; ranking não calculado.

**Mitigação imediata (< 5 min):**
```bash
# Verificar job na fila BullMQ
redis-cli -n 0 LLEN bull:auto-encerramento:wait
# Se job travado, recolocar na fila via admin BullMQ Board (porta 3001)
# Ou forçar via endpoint super_admin:
curl -X POST https://api.interno/admin/simulados/{id}/force-close \
  -H "Authorization: Bearer $SUPER_ADMIN_TOKEN"
```

**Resolução:** identificar causa (Redis indisponível? Worker crashou? Lock de DB?). Checar logs do worker: `docker logs mentoria_worker --tail 200 | grep auto-encerramento`.

**Comunicação:** notificar tenant via `tenant_contatos.email_suporte` informando que o encerramento foi processado com atraso de X min e os dados estão íntegros.

---

### RB-02 — Taxa de erro de API > 1% por 5 min

**Alerta:** Prometheus `rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m]) > 0.01`.

**Diagnóstico rápido:**
```bash
# Identificar endpoint com mais erros
# No Grafana: painel "API" → "Errors by route" → ordenar por taxa
# Checar logs estruturados
docker logs mentoria_api --tail 500 | jq 'select(.level=="error")'
# Verificar conexões Postgres
docker exec mentoria_pgbouncer psql -c "SHOW POOLS;"
```

**Causas comuns e ações:**
- **Pool de conexões esgotado** → aumentar `pool_size` no PgBouncer temporariamente via `RELOAD`; escalar réplica da API se necessário.
- **Migration em andamento travou tabela** → identificar lock: `SELECT * FROM pg_locks JOIN pg_stat_activity USING (pid) WHERE granted = false;`; cancelar se necessário com `SELECT pg_cancel_backend(pid)`.
- **Worker consumindo CPU excessiva** → `docker stats`; pausar fila específica via BullMQ Board se for worker de PDF/imagens (não pausar auto-encerramento).

---

### RB-03 — Fila BullMQ com > 500 jobs pendentes por > 2 min

**Alerta:** Prometheus `bullmq_waiting_jobs_total > 500` por 2 min.

**Diagnóstico:**
```bash
# Ver filas e tamanhos
redis-cli -n 0 INFO keyspace
# Identificar tipo de job acumulado (re-correção? PDF? import?)
docker logs mentoria_worker --tail 100 | grep "job_type"
```

**Ações por tipo:**
- **Re-correção acumulada:** normal após anulação em massa — aumentar concurrency da fila `re-correcao` temporariamente (`worker.concurrency = 100`).
- **PDF acumulado:** não é crítico; PDFs entregues com atraso. Escalar worker se necessário.
- **Auto-encerramento acumulado:** crítico — ver RB-01.
- **Import acumulado:** checar se webhook de origem está reenviando em loop (verificar `dedup external_id` no log).

---

### RB-04 — Falha no job de backup do Postgres

**Alerta:** job `backup-pg` retornou status `erro` na tabela `jobs`.

**Ação imediata:**
```bash
# Executar backup manual
docker exec mentoria_api sh scripts/backup-pg.sh
# Verificar espaço em disco
df -h
# Verificar credenciais de storage (S3/B2)
aws s3 ls s3://mentoria-backups/ --profile backup
```

**Escalação:** se dois backups consecutivos falharem → escalar para responsável de infra imediatamente. Não esperar o terceiro.

---

### RB-05 — Disco do VPS > 80%

**Alerta:** node_exporter `node_filesystem_avail_bytes / node_filesystem_size_bytes < 0.2`.

**Diagnóstico:**
```bash
du -sh /var/lib/docker/volumes/* | sort -rh | head -20
# Candidatos comuns: logs de container, PDFs não enviados ao storage, WAL acumulado
```

**Ações:**
1. Limpar logs antigos de container: `docker system prune --volumes` (cuidado — não em produção sem checar).
2. Verificar se worker de upload de PDFs está funcionando (arquivos devem ir para S3/B2, não ficar no disco).
3. Verificar WAL archiving — se acumulando localmente, o pgBackRest pode estar falhando silenciosamente.
4. Se crítico (> 90%), expandir volume no provider antes de resolver a causa raiz.

---

### Template de post-mortem (blameless)

```markdown
## Post-mortem: [título do incidente] — [data]

**Duração:** HH:MM – HH:MM (X min de impacto)
**SLO impactado:** disponibilidade / latência / encerramento
**Tenants afetados:** [lista]
**Budget consumido:** X% do error budget mensal

### Linha do tempo
- HH:MM — alerta disparado
- HH:MM — engenheiro de plantão acionado
- HH:MM — mitigação aplicada
- HH:MM — incidente resolvido

### Causa raiz
[descrição técnica sem culpar pessoas]

### O que funcionou bem
[ex.: alertas dispararam em < 2 min; runbook reduziu MTTR]

### O que pode melhorar
[ex.: faltou métrica X; runbook Y estava desatualizado]

### Ações corretivas (com responsável e prazo)
- [ ] [ação] — @responsável — [data]
```


---

## Modelo de Ameaças (Threat Model)

Documentar quais atores, vetores e riscos foram considerados é tão importante quanto as contramedidas. Sem isso, novos engenheiros não sabem o que está protegido, o que foi aceito como risco residual e o que ainda não foi pensado.

### Atores de ameaça

| Ator | Motivação | Capacidade |
|---|---|---|
| **Aluno desonesto** | Fraudar prova, ver gabarito antecipado, compartilhar respostas | Acesso legítimo à plataforma; pode usar DevTools, proxies, scripts simples |
| **Concorrente malicioso** | Roubar banco de questões de um tenant | Acesso externo; pode tentar força bruta, SQLi, enumeração de API |
| **Admin comprometido** | Vazar dados de alunos, alterar gabaritos indevidamente | Acesso privilegiado legítimo; ameaça interna |
| **Tenant malicioso** | Acessar dados de outro tenant (vazamento cross-tenant) | Acesso legítimo à plataforma como tenant; pode construir queries customizadas via API pública |
| **Atacante externo genérico** | DDoS, ransomware, credential stuffing | Sem acesso inicial; recursos variáveis |
| **Bot de scraping** | Copiar banco de questões completo via API | Acesso com credencial válida ou enumeração pública |

### Vetores analisados e contramedidas

| Vetor | Risco | Contramedida | Status |
|---|---|---|---|
| Enumeração de usuários no login leve | Confirmar se um CPF/e-mail está cadastrado | Resposta genérica + timing-safe + rate limit | ✅ Coberto |
| Força bruta no OTP | Adivinhar código de 6 dígitos | Máximo 3 tentativas; TTL 10 min; bloqueio após falhas | ✅ Coberto |
| Cross-tenant via RLS bypass | Query sem `tenant_id` vazar dados de outro tenant | RLS em 100% das tabelas + testes de integração de isolamento | ✅ Coberto |
| JWT embed reutilizado após encerramento | Aluno reabrir prova já finalizada com token válido | jti blocklist no Redis; validação server-side de `sessao.status` | ✅ Coberto |
| Injeção de `tenant_id` em payload | Aluno enviar `tenant_id` diferente no body e acessar dados alheios | `tenant_id` sempre lido do JWT/middleware, nunca do body | ✅ Coberto |
| Scraping do banco de questões | Bot autenticado extrair todas as questões via paginação | Rate limit por API key; `questoes:export` requer permissão explícita; paginação com cursor opaco | ✅ Coberto |
| Clickjacking do widget embed | Página maliciosa embedar o widget e capturar cliques | `frame-ancestors` dinâmico; origens validadas server-side | ✅ Coberto |
| Replay de webhook | Reenviar payload HMAC válido capturado | Timestamp no payload (`iat`); janela de 5 min; idempotência por `external_id` | ✅ Coberto |
| Admin alterando gabarito sem rastreio | Corrupção silenciosa de resultado | `audit_log` imutável em toda mutação; diff before/after; `recorrecoes` versionado | ✅ Coberto |
| DDoS no pico de abertura | Derrubar API às 8h com 1000+ logins | nginx `limit_req_zone`; circuit breaker; VPS provider com proteção L3/L4 | ✅ Coberto |
| Exfiltração via export de relatório PDF | PDF com dados de outros alunos | PDF gerado com escopo `sessao_id` + RLS no worker; link com token de uso único (TTL 1h) | ✅ Coberto |
| Prompt injection via enunciado de questão | Admin malicioso inserir HTML/JS no enunciado | Sanitização server-side (DOMPurify no backend); CSP bloqueando scripts inline | ⚠️ Implementar |
| Upload de arquivo malicioso (imagem/PDF) | Executar código no servidor via arquivo crafted | Magic bytes + mime type + tamanho validados; arquivos processados em sandbox (worker isolado) | ✅ Coberto |
| Acesso a sessão de outro aluno via ID previsível | UUIDs são aleatórios — não aplicável | UUIDs v4 para todos os IDs | ✅ Coberto |

### Riscos aceitos (com justificativa)

| Risco | Justificativa |
|---|---|
| Compartilhamento de gabarito entre alunos fora da plataforma (WhatsApp, etc.) | Fora do controle técnico; mitigado por embaralhamento por sessão e janelas curtas |
| Aluno fotografando a tela | Controle físico; fora do escopo de software |
| Comprometimento do VPS provider | Risco de infraestrutura aceito no MVP; mitigado por backups offsite |
| MFA não obrigatório para admins no MVP | Aceito como débito técnico da Fase 1; `mfa_secret` já previsto no schema |

### Ação pendente: sanitização de HTML em enunciados

Enunciados e alternativas aceitam rich text (formatação matemática, tabelas). Implementar:
- **Backend:** sanitização com `sanitize-html` (allowlist de tags: `p, b, i, ul, ol, li, table, tr, td, th, sup, sub, img[src]`) antes de persistir.
- **Frontend:** renderização via `dangerouslySetInnerHTML` apenas com conteúdo já sanitizado pelo backend; CSP com `script-src 'self'` bloqueia qualquer script injetado.
- **Teste:** `xss.integration.spec.ts` — payload `<script>alert(1)</script>` no enunciado deve ser removido antes de persistir e não executar no frontend.

---

## Acessibilidade (a11y)

Plataformas de concurso público têm obrigação legal de acessibilidade pela **Lei Brasileira de Inclusão (Lei nº 13.146/2015)** e pelo **Decreto nº 5.296/2004**. Além da obrigação, candidatos com deficiência são um segmento relevante em concursos públicos com regras específicas de tempo extra.

### Padrão alvo: WCAG 2.1 nível AA

Critérios prioritários para o contexto de simulado:

| Critério | Aplicação |
|---|---|
| **1.1.1 — Texto alternativo** | Todas as imagens em enunciados/alternativas têm `alt` descritivo; imagens decorativas têm `alt=""` |
| **1.3.1 — Info e relações** | Estrutura semântica correta (`<h1>`–`<h3>`, `<ol>` para alternativas, `<label>` para inputs) |
| **1.4.3 — Contraste mínimo** | Razão 4,5:1 para texto normal; 3:1 para texto grande. Validado programaticamente para cada tema white-label via `axe-core` |
| **2.1.1 — Teclado** | Toda interação da prova acessível por teclado: navegar entre questões (Tab/Shift+Tab), marcar alternativa (Enter/Espaço), submeter (Enter com foco no botão) |
| **2.4.3 — Ordem do foco** | Foco lógico e visível; nunca armadilhas de foco no modal de revisão |
| **2.4.7 — Foco visível** | Ring de foco sempre visível (nunca `outline: none` sem substituto) |
| **3.1.1 — Idioma da página** | `<html lang="pt-BR">` em todas as páginas |
| **4.1.2 — Nome, função, valor** | Todos os controles interativos têm `aria-label` ou `<label>` associado; estados comunicados via `aria-checked`, `aria-disabled`, etc. |

### Implementação no componente `prova-runner.tsx`

```tsx
// Exemplo de alternativa acessível
<li role="radio" aria-checked={selecionada} tabIndex={0}
    onKeyDown={(e) => e.key === 'Enter' && marcarAlternativa(id)}
    aria-label={`Alternativa ${letra}: ${texto}`}>
  <span aria-hidden="true">{letra})</span>
  <span>{texto}</span>
</li>

// Timer acessível — anuncia quando faltam 5 min
<div role="timer" aria-live="polite" aria-atomic="true"
     aria-label={`Tempo restante: ${formatarTempo(segundosRestantes)}`}>
  {formatarTempo(segundosRestantes)}
</div>
```

### Tempo extra para candidatos com necessidades especiais

Regra frequente em concursos públicos: candidato com laudo recebe 1h extra (ou tempo proporcional definido pelo banco/órgão).

- **Configuração:** `simulado_acessos.tempo_extra_min` — campo adicional na tabela de acesso avulso. Quando preenchido, o `tempo_limite` efetivo do aluno é `tempo_limite_min + tempo_extra_min`.
- **Fluxo:** admin configura o tempo extra ao conceder acesso avulso; server-side valida usando o tempo personalizado; timer do frontend reflete o valor correto.
- **Testador de a11y:** extensão `axe-core` integrada nos testes Playwright — `await checkA11y(page)` ao final de cada fluxo crítico. PRs que introduzem violações de nível A ou AA são bloqueados.

### Contraste no white-label

O painel de configuração de tema do admin valida o contraste das cores escolhidas em tempo real:
- Ao salvar, o backend calcula a razão de contraste entre `cor_primaria` e a cor de texto sobreposta.
- Se < 4,5:1, salva com aviso (não bloqueia — o admin pode querer uma cor para fundo, não para texto).
- O documento de onboarding do tenant inclui orientação sobre contraste WCAG.

---

## Deploy, CD Pipeline e Rollback

O CI (testes) já está definido. Esta seção completa o ciclo: como código aprovado chega à produção e como se volta atrás se algo der errado.

### Estratégia de branches (trunk-based simplificado)

```
main          ← produção (protegida; merge só via PR aprovado)
  └─ staging  ← ambiente de staging (deploy automático a cada merge em main)
       └─ feature/*, fix/*  ← branches de trabalho (vida curta, < 3 dias)
```

- **Trunk-based:** feature branches vivem no máximo 3 dias para evitar big merges. Feature flags (`tenant_features jsonb` na tabela `tenants`) habilitam funcionalidades por tenant sem precisar de branches longas.
- **Proteções no `main`:** require 1 PR review + CI verde + cobertura ≥ 80% + sem conflitos.
- **Regra de freeze:** nenhum deploy em produção nas 2 h antes de um simulado agendado ou durante simulado ativo. Script `scripts/check-deploy-safe.sh` consulta `simulados WHERE status='publicado' AND data_inicio BETWEEN now() AND now() + interval '2h'` e bloqueia se retornar resultado.

### Pipeline de CD (GitHub Actions)

```yaml
# .github/workflows/cd.yml (resumo)
on:
  push:
    branches: [main]

jobs:
  build-and-push:
    steps:
      - Build imagens Docker (api, web, worker) com tag = git SHA
      - Push para registry privado (GitHub Container Registry ou self-hosted)

  deploy-staging:
    needs: build-and-push
    steps:
      - SSH no VPS de staging
      - docker compose pull && docker compose up -d --no-deps api web worker
      - Aguardar /api/health/ready retornar 200 (timeout 60s)
      - Rodar smoke tests (subset dos e2e: login, abrir simulado, auto-save)

  deploy-production:
    needs: deploy-staging
    environment: production   # requer aprovação manual no GitHub
    steps:
      - Verificar check-deploy-safe.sh (bloqueia se simulado ativo)
      - SSH no VPS de produção
      - Executar migrations pendentes (prisma migrate deploy)
      - Rolling update: atualizar réplicas da API uma a uma (zero downtime)
      - Aguardar /api/health/ready em cada réplica antes de continuar
      - Smoke tests de produção
      - Notificar Slack #deploy com tag, autor e link do PR
```

### Estratégia de rollback

**Rollback de container (< 5 min):**
```bash
# Identificar a tag anterior
docker images mentoria/api --format "{{.Tag}}" | head -5
# Reverter para a tag anterior
export ROLLBACK_TAG=<sha-anterior>
docker compose pull mentoria/api:$ROLLBACK_TAG
docker compose up -d --no-deps api
# Validar
curl https://api.tenant.com/api/health/ready
```

**Rollback de migration (apenas se necessário — raro):**
```bash
# Rodar o down() da migration mais recente
npx prisma migrate resolve --rolled-back <migration-name>
# ATENÇÃO: só executar se dados não foram escritos no novo schema
# Para dados já escritos, preferir hotfix forward em vez de rollback
```

**Decisão de rollback:**
- Smoke tests falhando em produção após deploy → rollback automático via pipeline (retry 3x → rollback).
- Taxa de erro > 5% por 2 min pós-deploy → alerta PagerDuty → engenheiro decide rollback manual.
- SLO crítico em risco → rollback imediato sem discussão.

### Ambientes

| Ambiente | Propósito | Deploy trigger | Dados |
|---|---|---|---|
| **local** | Desenvolvimento | `docker compose up` manual | Seed de desenvolvimento |
| **staging** | Validação pré-produção | Automático a cada merge em `main` | Anonimizado de produção (refresh mensal) |
| **production** | Produção real | Manual com aprovação | Real |

- **Dados de staging:** snapshot mensal de produção com anonimização (`users.email → hash@staging.local`, CPF zerado). Script `scripts/anonymize-staging-dump.sh`.
- **Feature flags por ambiente:** `tenant_features` permite habilitar funcionalidades em staging antes de produção sem código novo.

### Política de deploy durante simulado ativo

Nenhum deploy de API ou worker durante simulado em andamento — risco de perder sessões em memória ou jobs BullMQ. Sequência segura:

1. `scripts/check-deploy-safe.sh` — retorna lista de simulados ativos nas próximas 3 h.
2. Se vazio → deploy liberado.
3. Se ocupado → aguardar `data_fim` + 30 min (jobs de encerramento concluídos) → deploy.
4. Exceção: hotfix de segurança crítico → aprovação do tech lead + comunicado ao tenant + deploy em janela de menor impacto (madrugada).


---

## Antifraude e Integridade de Prova

O documento menciona `sessao_eventos` como "trilha para auditoria e antifraude leve", mas não define o que é monitorado, quais padrões disparam alerta, nem como o admin age. Em ambiente de concurso com incentivo financeiro para fraude, isso precisa ser especificado.

### Eventos capturados em `sessao_eventos`

Além dos eventos já mapeados (`iniciou/respondeu/revisou/finalizou/auto_finalizou`), adicionar:

| Evento | Quando capturar | Sinal de fraude |
|---|---|---|
| `tab_oculta` | `visibilitychange` → hidden (frontend) | Aluno saiu da aba durante prova |
| `tab_retornou` | `visibilitychange` → visible | Par com `tab_oculta` |
| `multiplas_sessoes_detectadas` | Segundo login com mesmo `estudante_id` durante sessão ativa | Aluno logado em dois dispositivos |
| `resposta_rapida_demais` | `tempo_resposta_seg < 3` em questão com enunciado > 200 chars | Possível cola ou automação |
| `sequencia_sem_pausa` | 10+ respostas consecutivas com < 2 s entre si | Possível bot ou script |
| `ip_mudou` | IP do request diferente do IP de início da sessão | Mudança de rede ou proxy |
| `user_agent_mudou` | User-Agent diferente do início | Dispositivo diferente ou manipulação |

### Painel de integridade no admin

- **Por simulado:** tabela de alunos com contagem de eventos suspeitos por tipo; filtro para ver apenas alunos com score de suspeita > threshold configurável pelo tenant.
- **Por aluno:** timeline de eventos da sessão com timestamps — admin vê exatamente o que aconteceu.
- **Score de suspeita:** soma ponderada de eventos (ex.: `tab_oculta × 1 + multiplas_sessoes × 5 + sequencia_sem_pausa × 3`). Não é punição automática — é evidência para decisão humana.
- **Exportação:** relatório de integridade em CSV/PDF para o tenant usar como evidência em recursos e processos administrativos.

### Regras configuráveis por simulado

Em `simulados.regras jsonb`, adicionar:
- `bloquear_multiplas_sessoes` (bool): se `true`, bloqueia segunda sessão ativa do mesmo aluno — a primeira continua, a segunda retorna 409.
- `alertar_mudanca_ip` (bool): gera evento e notificação para admin se IP mudar durante sessão.
- `tempo_minimo_resposta_seg` (int, default 0): respostas mais rápidas que esse valor geram evento `resposta_rapida_demais`.

---

## Gestão de Dependências e Segurança de Supply Chain

Um sistema de concurso que processa dados sensíveis (CPF, notas, rankings) precisa de controle sobre o que é instalado.

### Dependências auditadas

- **`pnpm audit`** no CI: bloqueia build se houver vulnerabilidade `high` ou `critical` sem resolução em qualquer pacote do monorepo.
- **Dependabot / Renovate:** PRs automáticos semanais para atualizar dependências. Merge automático apenas para patch versions com testes verdes; minor e major requerem revisão humana.
- **Lockfile commitado:** `pnpm-lock.yaml` sempre no repositório — builds reproduzíveis. CI usa `pnpm install --frozen-lockfile`.
- **`.npmrc` com registry fixo:** `registry=https://registry.npmjs.org` — nunca instalar de registries não-confiáveis.

### Imagens Docker

- **Base images fixadas por digest:** `FROM node:20-alpine@sha256:<digest>` em vez de `FROM node:20-alpine` — evita surpresas de tag mutável.
- **Multi-stage build:** imagem final sem devDependencies, sem ferramentas de build, sem shell desnecessário — superfície de ataque mínima.
- **Trivy no CI:** `trivy image mentoria/api:$TAG` escaneia vulnerabilidades na imagem antes do push. Bloqueia se severity `CRITICAL`.
- **Non-root user:** containers rodam como usuário `node` (UID 1000), nunca como `root`.

### Segredos no repositório

- **`git-secrets` / `trufflehog`** no pre-commit hook: bloqueia commit com padrões de segredo (AWS keys, tokens JWT, senhas). Rodado também no CI para cobrir pushes diretos.
- **`.env` no `.gitignore`:** verificado via CI (`grep -r "^\.env$" .gitignore || exit 1`).

---

## Performance do Frontend e Experiência do Aluno Sob Pressão

Durante uma prova com timer, latência percebida e micro-travamentos são fontes de stress e contestação. O frontend precisa ser otimizado especificamente para o contexto de prova.

### Métricas alvo para o `prova-runner`

| Métrica | Alvo | Ferramenta de medição |
|---|---|---|
| LCP (Largest Contentful Paint) na abertura da prova | < 2,5 s em 4G | Playwright + web-vitals |
| INP (Interaction to Next Paint) ao marcar alternativa | < 200 ms | web-vitals no cliente |
| Auto-save round-trip (click → confirmação visual) | < 800 ms p95 | Prometheus `autosave_duration` |
| Tamanho do bundle do `prova-runner` | < 150 KB gzipped | next build --analyze |

### Implementação

- **Prefetch da prova:** ao abrir a tela de aguardo (antes do `data_inicio`), fazer prefetch silencioso das questões e imagens da prova via `<link rel="prefetch">`. No início da sessão, dados já em cache do browser.
- **Otimistic UI no auto-save:** ao marcar alternativa, atualizar a UI imediatamente (sem esperar resposta do servidor). Se o auto-save falhar, mostrar indicador discreto de retry — nunca bloquear o aluno.
- **Service Worker para resiliência offline:** capturar requests de auto-save offline e reenviar ao reconectar. Crítico para alunos com conexão instável. Implementado com `next-pwa` ou Workbox.
- **Imagens em enunciados:** servidas via CDN com `srcset` responsivo; lazy loaded exceto as da questão atual e as 2 seguintes (prefetch por questão).
- **Código dividido por rota:** o bundle do `prova-runner` não carrega código do admin. Next.js App Router faz isso automaticamente por rota — validar com `@next/bundle-analyzer`.

### Feedback visual durante prova

- **Indicador de auto-save:** ícone de status persistente (salvo ✓ / salvando... / erro de conexão ⚠). Aluno nunca fica em dúvida se sua resposta foi gravada.
- **Timer com alerta progressivo:** cor neutra → amarelo (faltam 30 min) → vermelho (faltam 10 min) → piscando (faltam 5 min). Acompanha a regra de alerta configurada no simulado.
- **Contador de questões respondidas:** "Respondidas: 42/80" sempre visível. Atualizado otimisticamente.
- **Prevenção de saída acidental:** `beforeunload` com confirmação se sessão está em andamento e não finalizada.

---

## Internacionalização e Regionalização (i18n/l10n) — Preparação

O MVP é 100% em português brasileiro, mas a arquitetura deve permitir expansão sem refatoração. Para um SaaS que pode ser vendido a tenants de outros países (ex.: concursos em Portugal ou Angola), isso é relevante.

### O que preparar na Fase 1 (sem implementar)

- **Textos do sistema em arquivos de tradução:** nenhum texto hardcoded em componentes. Usar `next-intl` com arquivo `pt-BR.json`. Estrutura: `{ "prova.timer.restante": "Tempo restante", "prova.alternativa.marcar": "Marcar alternativa {letra}" }`.
- **Formatação de datas e números:** nunca `new Date().toLocaleDateString()` sem locale explícito. Usar `Intl.DateTimeFormat('pt-BR')` e `Intl.NumberFormat('pt-BR')` em todos os pontos.
- **Fuso horário:** todas as datas armazenadas em UTC no banco (`timestamptz`). Frontend exibe no fuso do tenant (`tenants.fuso_horario`, default `America/Sao_Paulo`). Crítico para simulados com janela fixa — o `data_inicio` "8h" é no fuso do tenant, não do servidor.
- **CPF é campo brasileiro:** o campo `estudantes.cpf` é opcional e o sistema funciona sem ele. Documentar que é específico de BR para facilitar adaptação futura.

---

## Índices de Performance Adicionais e Query Patterns Críticos

O documento lista índices essenciais, mas faltam os índices para os padrões de query mais frequentes e pesados em produção.

### Índices adicionais

```sql
-- Painel do aluno: listar simulados disponíveis para o estudante
CREATE INDEX idx_simulado_acessos_estudante_ativo
  ON simulado_acessos(estudante_id, expira_em)
  WHERE tentativas_usadas < tentativas_permitidas;

-- Auto-encerramento: buscar sessões em andamento de um simulado
CREATE INDEX idx_sessoes_prova_simulado_em_andamento
  ON sessoes_prova(simulado_id, status)
  WHERE status = 'em_andamento' AND is_teste = false;

-- Relatório de ranking: ordenar por nota dentro de um simulado
CREATE INDEX idx_sessoes_prova_ranking
  ON sessoes_prova(simulado_id, nota DESC NULLS LAST)
  WHERE is_teste = false AND status = 'finalizada';

-- Antifraude: buscar eventos suspeitos por sessão
CREATE INDEX idx_sessao_eventos_tipo
  ON sessao_eventos(sessao_id, tipo, criado_em DESC);

-- Billing: agregar uso diário por tenant
CREATE INDEX idx_sessoes_prova_tenant_dia
  ON sessoes_prova(tenant_id, date_trunc('day', iniciado_em));

-- Full-text search em enunciados (busca de questões por texto)
CREATE INDEX idx_questoes_fts
  ON questoes USING gin(to_tsvector('portuguese', enunciado));

-- Notificações não lidas por aluno
CREATE INDEX idx_notificacoes_nao_lidas
  ON notificacoes(estudante_id, lida, criado_em DESC)
  WHERE lida = false;
```

### Queries críticas e como executá-las com segurança

**Ranking em tempo real (após encerramento):**
```sql
-- Nunca calcular ranking on-the-fly com ORDER BY em produção durante pico.
-- Usar posicao_ranking pré-calculado no job de encerramento.
-- Recalcular apenas via worker, nunca via request síncrono.
SELECT estudante_id, nota, posicao_ranking
FROM sessoes_prova
WHERE simulado_id = $1 AND is_teste = false AND status = 'finalizada'
ORDER BY posicao_ranking ASC
LIMIT $2 OFFSET $3;  -- sempre paginado
```

**Estatísticas de acerto por disciplina (relatório do aluno):**
```sql
-- Usar relatorio_cache com TTL; nunca calcular inline.
-- O job de relatório executa este aggregation e armazena o resultado.
SELECT d.nome, COUNT(*) FILTER (WHERE ro.correta) AS acertos, COUNT(*) AS total
FROM respostas_objetivas ro
JOIN questoes q ON ro.questao_id = q.id
JOIN disciplinas d ON q.disciplina_id = d.id
WHERE ro.sessao_id = $1
GROUP BY d.nome;
```

