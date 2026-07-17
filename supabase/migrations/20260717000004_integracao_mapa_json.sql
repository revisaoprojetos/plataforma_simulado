-- Mapeamento DINÂMICO do JSON recebido (webhook). Cada provedor pode ter um `mapa_json`
-- que aponta os caminhos (dot-path) do payload para os campos normalizados do sistema:
-- pedido_id (chave única/principal), email, nome, cpf, telefone, produto_ref, status, etc.
-- Sem mapa → o parser usa os caminhos-padrão (formato conhecido da Guru).

ALTER TABLE public.simulado_integracao_config ADD COLUMN IF NOT EXISTS mapa_json jsonb;
