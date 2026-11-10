# ADR 0006 — Isolamento entre empresas: testes de vazamento agora, RLS opcional depois

- Status: aceita (Fase 1.17 do plano de integração)
- Contexto: complementa o [ADR 0002](0002-multiempresa.md) (modelo multiempresa por `tenant_id`).

## Contexto

O serviço guarda todas as empresas no mesmo Postgres. Hoje o isolamento depende do **código**: todo acesso
passa por `AccessService` (carrega o recurso sempre com `tenantId` do usuário; recurso de outra empresa
responde 404) e toda consulta crua (`$queryRaw`) filtra por `tenant_id`. Uma consulta nova que esqueça o
filtro vazaria dados, e nada no banco impediria.

Na integração com a plataforma, cada tenant nosso vira uma empresa deste serviço (1:1). Um vazamento aqui
expõe progresso, anotações e dados pessoais de alunos de outro cliente (LGPD).

## Opções

1. **RLS (Row-Level Security) no Postgres** — `ENABLE/FORCE ROW LEVEL SECURITY` em cada tabela com
   `tenant_id`, política `tenant_id = current_setting('app.tenant_id')::uuid`, e a API executando
   `SET LOCAL app.tenant_id = …` no início de **cada transação**.
2. **Ampliar a suíte e2e de vazamento** + helper guiado pelo schema (sem mudar o runtime).

## Decisão

Adotamos a **opção 2 agora** e deixamos a **opção 1 como evolução opcional**, com os critérios abaixo.

### Por que não RLS já

- **Prisma + PgBouncer em modo transaction**: `SET LOCAL` só vale dentro de uma transação explícita; o
  Prisma Client não abre transação por consulta. Para usar RLS seria preciso envolver *toda* chamada em
  `$transaction` (extensão de cliente) — mudança invasiva em ~100 pontos e com custo de latência por
  requisição, justamente nas rotas de maior volume (HLS, heartbeat, playback).
- **Rotas sem usuário** (token de playback, consolidador, worker, integração por chave) teriam de
  definir o tenant por outro caminho; o consolidador processa lotes **de várias empresas** numa transação
  só (SQL por conjuntos) e precisaria de um papel que ignore a política (`BYPASSRLS`) — o que reabre a
  superfície que o RLS deveria fechar.
- **Risco operacional**: política mal aplicada **nega tudo** (indisponibilidade) ou, pior, passa
  silenciosamente se a conexão usar o dono da tabela (RLS não vale para o *owner* sem `FORCE`).
- A migration seria **não aditiva em comportamento** (muda o que cada conexão enxerga) e não pode ser
  validada sem Postgres no ciclo de CI atual do serviço.

### O que fizemos (opção 2)

- `apps/api/test/tenant-isolation.ts`: helper **guiado pelo DMMF do Prisma** (o schema é a fonte da verdade):
  - `modelsMissingTenant()` — falha se surgir tabela de negócio sem `tenant_id` (exceções só em
    `GLOBAL_MODELS`, cada uma com motivo);
  - `crossTenantFkViolations()` — para **cada FK** entre tabelas com `tenant_id`, conta linhas em que filho e
    pai pertencem a empresas diferentes (SQL gerado do schema);
  - `rowsPerTenant()` — linhas por tabela/empresa, usada para provar que o seed cobre **todas** as tabelas e
    que nada da empresa B mudou depois dos ataques.
- `apps/api/test/tenant-leak.e2e-spec.ts`: semeia **duas empresas com dados em todas as tabelas** e faz a
  empresa A (admin, professor e aluno) atacar ~37 rotas com ids da B (leitura, escrita, exclusão, playback,
  upload, analytics, LGPD): só 403/404 são aceitos; as listagens de A não podem conter nenhum id de B; e o
  estado da B tem de continuar idêntico.
- Tabela nova no schema ⇒ o teste **quebra** até ela ser incluída em `seedTenant()` — é o gancho para que ninguém
  esqueça de cobrir.
- Reforços da Fase 1 que também fecham brechas de isolamento: CORS/`allowedDomains` por empresa (vazio em
  produção = nega), revogação imediata de usuário/empresa no guard JWT, relatórios só com alunos.

## RLS como evolução opcional (não aplicada)

Se, depois do piloto, o risco justificar defesa em profundidade, a ordem segura é:

1. Criar papéis: `app_rw` (sem `BYPASSRLS`, **não** dono das tabelas) para a API e `app_batch` (`BYPASSRLS`)
   só para consolidador/worker/migrate.
2. Migration `rls_tenant` **aditiva**: `ALTER TABLE … ENABLE ROW LEVEL SECURITY; … FORCE ROW LEVEL SECURITY;`
   e `CREATE POLICY tenant_isolation ON <tabela> USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
   WITH CHECK (…)`. Política só nas tabelas com `tenant_id`; `users` precisa tratar `tenant_id IS NULL`
   (platform_admin) por política separada.
3. Cliente Prisma com extensão que abre `$transaction` e executa `SELECT set_config('app.tenant_id', $1, true)`
   antes de cada operação (o `true` torna o ajuste local à transação, compatível com PgBouncer transaction).
4. Rotas por token de playback/integração definem o tenant a partir das *claims*/da chave.
5. Rodar **primeiro** em staging com `FORCE` desligado (só `ENABLE`) para medir latência e quebras, e a suíte
   `tenant-leak` rodando com o papel `app_rw` — ela já é o teste de aceite do RLS.

Critérios para ativar: (a) incidente/quase-incidente de vazamento, (b) exigência contratual de isolamento
em nível de banco, ou (c) mais de um desenvolvedor externo escrevendo consultas cruas.

## Consequências

- Nenhuma mudança de comportamento em produção por esta decisão; o ganho é detecção precoce (CI) de regressões.
- O isolamento continua dependendo de revisão de código para `$queryRaw` novo: regra do time — toda consulta
  crua **começa** por `tenant_id = ${tenantId}`; o `tenant-leak` pega o resto pelas rotas.
- O teste só prova o que o seed e a matriz de rotas cobrem; rota nova com id na URL deve ser acrescentada à
  lista `attacks()`.
