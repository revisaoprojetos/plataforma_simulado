-- "Liberar para todos os alunos da plataforma" no PRODUTO (extensivo, assinatura, pré-edital…) — o mesmo
-- recurso que o simulado tem em `regras.acesso_gratuito`. Ligado: todo aluno do tenant vê o produto em
-- "Meus Extensivos" e acessa o conteúdo do currículo, sem assinatura nem grupo vinculado.
-- Nasce DESLIGADO (false). Leitura é tolerante: enquanto a coluna não existir, o código trata como false.
alter table public.simulado_produtos
  add column if not exists acesso_gratuito boolean not null default false;

create index if not exists idx_produtos_acesso_gratuito
  on public.simulado_produtos (tenant_id) where acesso_gratuito = true;

notify pgrst, 'reload schema';
