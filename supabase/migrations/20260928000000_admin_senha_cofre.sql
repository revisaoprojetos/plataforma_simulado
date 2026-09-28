-- COFRE de senhas de admin DEFINIDAS pelo painel (console super / RBAC).
-- O Supabase Auth guarda só o HASH (irreversível) — não dá pra "ver" a senha. Este cofre guarda uma
-- CÓPIA CIFRADA (AES-256-GCM, APP_ENCRYPTION_KEY) da última senha definida VIA PAINEL, para o super-admin
-- poder revelar depois. Nunca em texto puro. Só senhas criadas por aqui daqui pra frente entram no cofre.
create table if not exists public.simulado_admin_senha_cofre (
  user_id       uuid primary key,
  senha_cripto  text not null,            -- enc:v1:... (criptografado com APP_ENCRYPTION_KEY)
  definido_por  uuid,                      -- quem definiu (ator)
  atualizado_em timestamptz not null default now()
);
-- RLS ligado SEM políticas: nenhum cliente (anon/auth) lê; só o service role (server actions) acessa.
alter table public.simulado_admin_senha_cofre enable row level security;
