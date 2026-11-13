-- LOG UNIFICADO DAS REGRAS DO PRODUTO (Extensivo): uma trilha única, legível, de tudo que muda quem vê o quê.
-- Camadas registradas: visibilidade (segmento), disponibilidade_seg (regra de segmento), grupos (acesso do produto),
-- excecao (liberar/bloquear manual), cronograma (cronograma de referência/planilha). Cada linha guarda ANTES/DEPOIS.
-- Gravado em modo best-effort pelo app (nunca derruba a mutação). Leitura tolerante: sem a tabela a aba "Regras › Histórico"
-- avisa e o resto funciona. Aplicar manualmente (SQL editor). Idempotente.

create table if not exists public.simulado_regras_log (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null,
  produto_id   uuid references public.simulado_produtos(id) on delete cascade,
  camada       text not null,                         -- visibilidade | disponibilidade_seg | grupos | excecao | cronograma | acesso
  acao         text not null,                         -- ex.: criada, alterada, removida, ativada, desativada, vinculado, desvinculado
  alvo_tipo    text,                                  -- produto | modulo | aula | grupo | segmento | aluno
  alvo_id      uuid,
  alvo_rotulo  text,                                  -- título legível no momento da mudança
  antes        jsonb,
  depois       jsonb,
  ator_id      uuid,
  ator_nome    text,
  criado_em    timestamptz not null default now()
);
create index if not exists idx_regras_log_produto on public.simulado_regras_log (tenant_id, produto_id, criado_em desc);
create index if not exists idx_regras_log_camada on public.simulado_regras_log (tenant_id, camada, criado_em desc);

alter table public.simulado_regras_log enable row level security;
drop policy if exists "tenant_isolation_simulado_regras_log" on public.simulado_regras_log;
create policy "tenant_isolation_simulado_regras_log" on public.simulado_regras_log for all to authenticated
  using (tenant_id in (select public.user_tenant_ids()))
  with check (tenant_id in (select public.user_tenant_ids()));
grant all on public.simulado_regras_log to authenticated;
grant all on public.simulado_regras_log to service_role;

notify pgrst, 'reload schema';
