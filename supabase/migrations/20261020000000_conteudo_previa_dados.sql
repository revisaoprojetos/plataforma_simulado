-- Dados da PRÉVIA "Ver com valores" por versão: o lab da Biblioteca (seleção de simulado + sliders) grava
-- aqui o objeto que a rota /preview merge-eia com o docx. Transitório (só para a prévia do admin). Aditiva.
alter table public.simulado_conteudo_versoes
  add column if not exists previa_dados jsonb;

notify pgrst, 'reload schema';
