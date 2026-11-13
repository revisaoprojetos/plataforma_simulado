-- Automação de varredura de segurança: varreduras, achados, atualizações, notificações in-app.
-- Acesso SOMENTE via service role (RLS ligado, sem policies). Tabelas globais da plataforma (sem tenant_id).

create table if not exists public.seguranca_varreduras (
  id uuid primary key default gen_random_uuid(),
  origem text not null default 'manual' check (origem in ('cron','manual','ci')),
  iniciado_em timestamptz not null default now(),
  finalizado_em timestamptz,
  resumo jsonb not null default '{}'::jsonb,   -- { novos:[fp], resolvidos:[fp], persistentes:[fp], checagens:[...], erros:[...] }
  total_achados int not null default 0,
  criticos int not null default 0,
  altos int not null default 0,
  medios int not null default 0,
  baixos int not null default 0
);
create index if not exists idx_seg_varreduras_iniciado on public.seguranca_varreduras (iniciado_em desc);

create table if not exists public.seguranca_achados (
  id uuid primary key default gen_random_uuid(),
  varredura_id uuid references public.seguranca_varreduras(id) on delete set null, -- última varredura que viu
  categoria text not null default 'outro' check (categoria in ('xss','sqli','rotas_expostas','chaves','banco_rls','rate_limit','prompt_injection','headers','dependencias','config','outro')),
  severidade text not null check (severidade in ('critico','alto','medio','baixo')),
  severidade_peso smallint generated always as (case severidade when 'critico' then 4 when 'alto' then 3 when 'medio' then 2 else 1 end) stored,
  titulo text not null,
  detalhe text,
  arquivo text,
  recomendacao text,
  status text not null default 'aberto' check (status in ('aberto','resolvido','ignorado','aceito')),
  motivo_status text,
  status_por uuid,
  fingerprint text not null unique,
  primeira_vez timestamptz not null default now(),
  ultima_vez timestamptz not null default now(),
  resolvido_em timestamptz,
  origem text not null default 'cron'  -- cron | manual | ci | auditoria_manual
);
create index if not exists idx_seg_achados_status_sev on public.seguranca_achados (status, severidade);
create index if not exists idx_seg_achados_categoria on public.seguranca_achados (categoria);
create index if not exists idx_seg_achados_ultima on public.seguranca_achados (ultima_vez desc);

create table if not exists public.seguranca_atualizacoes (
  id uuid primary key default gen_random_uuid(),
  pacote text not null,
  versao_atual text,
  versao_alvo text,
  tipo text not null default 'patch' check (tipo in ('patch','minor','major')),
  cve_ids text[] not null default '{}',
  severidade text not null default 'baixo' check (severidade in ('critico','alto','medio','baixo')),
  detectado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  status text not null default 'pendente' check (status in ('pendente','aplicada','ignorada')),
  origem text not null default 'cron',
  unique (pacote)
);
create index if not exists idx_seg_atualizacoes_status on public.seguranca_atualizacoes (status, severidade);

create table if not exists public.seguranca_notificacoes (
  id uuid primary key default gen_random_uuid(),
  achado_id uuid references public.seguranca_achados(id) on delete cascade,
  titulo text not null,
  mensagem text,
  severidade text not null check (severidade in ('critico','alto','medio','baixo')),
  link text not null default '/admin/seguranca',
  lida boolean not null default false,
  criado_em timestamptz not null default now()
);
create index if not exists idx_seg_notif_lida on public.seguranca_notificacoes (lida, criado_em desc);

alter table public.seguranca_varreduras enable row level security;
alter table public.seguranca_achados enable row level security;
alter table public.seguranca_atualizacoes enable row level security;
alter table public.seguranca_notificacoes enable row level security;
-- (sem policies de propósito: só service role acessa)

-- Checagem de banco: tabelas public sem RLS, policies abertas (qual/with_check = true ou role anon), buckets públicos.
create or replace function public.seguranca_checar_banco()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_sem_rls jsonb;
  v_policies jsonb;
  v_buckets jsonb := '[]'::jsonb;
begin
  select coalesce(jsonb_agg(c.relname order by c.relname), '[]'::jsonb) into v_sem_rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r','p') and not c.relrowsecurity;

  select coalesce(jsonb_agg(jsonb_build_object(
           'tabela', p.tablename, 'policy', p.policyname, 'cmd', p.cmd,
           'roles', to_jsonb(p.roles), 'qual', p.qual, 'with_check', p.with_check)
         order by p.tablename, p.policyname), '[]'::jsonb) into v_policies
  from pg_policies p
  where p.schemaname = 'public'
    and (btrim(coalesce(p.qual, '')) = 'true' or btrim(coalesce(p.with_check, '')) = 'true' or 'anon' = any(p.roles));

  begin
    execute 'select coalesce(jsonb_agg(jsonb_build_object(''id'', id, ''nome'', name) order by name), ''[]''::jsonb) from storage.buckets where public'
      into v_buckets;
  exception when others then
    v_buckets := '[]'::jsonb;
  end;

  return jsonb_build_object('tabelas_sem_rls', v_sem_rls, 'policies_abertas', v_policies, 'buckets_publicos', v_buckets);
end;
$$;

revoke all on function public.seguranca_checar_banco() from public, anon, authenticated;
grant execute on function public.seguranca_checar_banco() to service_role;

-- Seed: achados da auditoria manual de 13/11/2026 (idempotente por fingerprint).
insert into public.seguranca_achados (categoria, severidade, titulo, detalhe, arquivo, recomendacao, status, fingerprint, origem) values
('rotas_expostas','critico','Rotas /api/teste/* sem autenticação nem trava de NODE_ENV','Rotas seed, seed-merge, docs/upload, docs/[id], modelos, plugin-log, wopi/files/[id]/contents, onlyoffice/callback, oo-plugin-config e lab-sim respondem sem auth.','apps/web/app/api/teste/','Remover do build de produção ou exigir NODE_ENV!=production + segredo/permissão.','aberto','manual-20261113:api-teste-sem-auth','auditoria_manual'),
('sqli','alto','Injeção de filtro PostgREST .or() no e-mail (login do aluno)','O e-mail é interpolado em .or() permitindo manipular o filtro (tomada de conta).','apps/web/app/api/aluno/login/route.ts:22,68','Usar o padrão seguro emailSafe de lib/integracoes/engine.ts:169 ou .eq()/.ilike() parametrizado.','aberto','manual-20261113:or-injection-aluno-login','auditoria_manual'),
('sqli','alto','Injeção de filtro PostgREST .or() no e-mail (identify embed)','Mesmo padrão inseguro no identify do embed.','apps/web/app/api/auth/embed/identify/route.ts:124,130','Sanitizar com emailSafe (lib/integracoes/engine.ts:169).','aberto','manual-20261113:or-injection-embed-identify','auditoria_manual'),
('rotas_expostas','alto','IDOR em /api/sessoes/avaliar|finalizar|tempo|resposta-discursiva','Validam tenant mas não o dono da sessão; qualquer aluno do tenant age sobre sessão alheia.','apps/web/app/api/sessoes/','Validar sessao.estudante_id === estudante autenticado.','aberto','manual-20261113:idor-sessoes','auditoria_manual'),
('rotas_expostas','alto','IDOR em /api/pdf/publico/[id]?sessao=','Valida tenant mas não o dono da sessão.','apps/web/app/api/pdf/publico/','Validar dono da sessão antes de gerar/servir o PDF.','aberto','manual-20261113:idor-pdf-publico','auditoria_manual'),
('rotas_expostas','alto','Webhooks guru/in/curseduca com webhook_secret opcional e sem HMAC sobre raw body','Segredo opcional e sem verificação de assinatura sobre o corpo bruto.','apps/web/app/api/webhooks/','Tornar o segredo obrigatório e validar HMAC (timingSafeEqual) sobre o raw body.','aberto','manual-20261113:webhooks-sem-hmac','auditoria_manual'),
('banco_rls','alto','Bucket de storage "pdfs" público com dados de alunos','Bucket criado como público; PDFs de relatório contêm dados pessoais.','supabase/migrations/20260701000001_pdf_worker_gotenberg.sql:12','Tornar privado e servir via URL assinada de curta duração.','aberto','manual-20261113:bucket-pdfs-publico','auditoria_manual'),
('rate_limit','medio','Rate limit em memória por instância','lib/rate-limit.ts não compartilha estado entre réplicas.','apps/web/lib/rate-limit.ts','Migrar para Redis (mesma interface).','aberto','manual-20261113:rate-limit-memoria','auditoria_manual'),
('rate_limit','medio','Sem rate limit em login admin, webhooks, impersonate, IA/OCR e /api/pdf/gerar','Endpoints sensíveis ou caros sem limitação de taxa.','apps/web/app/login/actions.ts','Aplicar rate limit (Redis) por IP/usuário nesses endpoints.','aberto','manual-20261113:sem-rate-limit-endpoints','auditoria_manual'),
('config','medio','Cookie aluno_session SameSite=None sem checagem Origin/CSRF nos POST','Necessário p/ iframe, mas POSTs não validam Origin.','apps/web/lib/aluno-session.ts','Validar Origin/Referer contra a lista de origens permitidas nos POST autenticados por esse cookie.','aberto','manual-20261113:csrf-aluno-session','auditoria_manual'),
('headers','medio','frame-ancestors * fail-open no proxy','Em falha na resolução de origens, libera qualquer origem para embed.','apps/web/proxy.ts:153-175','Falhar fechado (frame-ancestors none/self).','aberto','manual-20261113:frame-ancestors-failopen','auditoria_manual'),
('headers','medio','CSP sem diretiva script-src','Sem script-src a CSP não mitiga XSS.','apps/web/proxy.ts','Definir script-src (nonce/strict-dynamic).','aberto','manual-20261113:csp-sem-script-src','auditoria_manual'),
('xss','medio','postMessage com targetOrigin "*"','Mensagens enviadas a qualquer origem.','apps/web/components/embed/embed-prova-runner.tsx:180; apps/web/components/aluno/video/use-embed-bridge.ts:10','Usar a origem do host validada (allowlist) como targetOrigin.','aberto','manual-20261113:postmessage-wildcard','auditoria_manual'),
('sqli','medio','Buscas admin com .or() sem sanitização','Termo de busca interpolado em filtros PostgREST.','apps/web/app/admin/export-actions.ts:29; banco-questoes/estudantes-actions.ts:53,60; biblioteca/actions.ts:1072','Sanitizar o termo (remover , ( ) " \\ %) antes de interpolar.','aberto','manual-20261113:or-injection-buscas-admin','auditoria_manual'),
('prompt_injection','medio','Prompt injection na correção por IA','Texto do aluno entra no prompt sem delimitadores; confirmar revisão humana antes de liberar nota.','apps/web/lib/ia/correcao-ia.ts','Delimitar o texto do aluno, instruir a ignorar comandos e manter revisão humana.','aberto','manual-20261113:prompt-injection-correcao-ia','auditoria_manual'),
('rotas_expostas','medio','/api/pdf-view com startsWith bypassável','Validação de caminho por prefixo pode ser contornada.','apps/web/app/api/pdf-view/','Normalizar o caminho e comparar com allowlist exata.','aberto','manual-20261113:pdf-view-startswith','auditoria_manual'),
('config','medio','docker-compose.portainer.yml com senhas Postgres/Redis de vídeo com default vazio','Senhas com default vazio.','docker-compose.portainer.yml:46-47','Remover o default (variável obrigatória).','aberto','manual-20261113:compose-senhas-vazias','auditoria_manual'),
('config','medio','docker-compose.teste.yml com portas públicas e OnlyOffice sem JWT','Ambiente de teste exposto e sem JWT.','docker-compose.teste.yml','Restringir portas a localhost e habilitar JWT no OnlyOffice.','aberto','manual-20261113:compose-teste-exposto','auditoria_manual'),
('banco_rls','medio','GRANT DML a authenticated em tabelas sensíveis','Confirmar que existem policies restritivas em todas as tabelas com GRANT.','supabase/migrations/','Revisar grants/policies (seguranca_checar_banco ajuda).','aberto','manual-20261113:grant-dml-authenticated','auditoria_manual'),
('xss','baixo','dangerouslySetInnerHTML dependente de sanitização na gravação','Seguro só se o HTML for sanitizado ao salvar.','apps/web/components/aluno/leitor-documento.tsx:1094; apps/web/app/aluno/(portal)/nova/painel/leitor/[materialId]/page.tsx:213; apps/web/components/leitura/diff-espelho.tsx','Sanitizar também na leitura (defesa em profundidade).','aberto','manual-20261113:dangerous-html-leitor','auditoria_manual'),
('xss','baixo','leitor-jus.html com ~44 usos de innerHTML','Superfície de XSS no leitor.','apps/web/public/leitura/leitor-jus.htm','Trocar por textContent/DOM seguro ou sanitizar.','aberto','manual-20261113:leitor-jus-innerhtml','auditoria_manual'),
('config','baixo','CSV com PII e logs versionados na raiz do repositório','relatorio-estudantes-incompletos.csv e _build.log no git.','relatorio-estudantes-incompletos.csv; _build.log','Remover do histórico e adicionar ao .gitignore.','aberto','manual-20261113:pii-logs-versionados','auditoria_manual'),
('chaves','baixo','Comparação de CRON_SECRET com === (não constante)','Vulnerável a timing attack em teoria.','apps/web/app/api/cron/','Usar crypto.timingSafeEqual.','aberto','manual-20261113:cron-secret-comparacao','auditoria_manual'),
('headers','baixo','Sem HSTS, X-Content-Type-Options e Referrer-Policy globais','Headers de segurança ausentes.','apps/web/proxy.ts','Adicionar os headers globalmente.','aberto','manual-20261113:headers-globais-ausentes','auditoria_manual')
on conflict (fingerprint) do nothing;
