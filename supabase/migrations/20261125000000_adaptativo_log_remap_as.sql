-- Cronograma Adaptativo — remapeamento por chave de documento (lib/cronograma/adaptativo/remap-as*.ts).
-- Acrescenta a ação 'remap_as' ao log de gerações. ADITIVA e idempotente. NÃO é obrigatória: sem ela o app registra a ação como 'migrar'
-- com o rótulo "[remap_as]" no texto do erro. Nenhuma outra tabela/coluna muda (a assinatura do AS vive dentro de plano.cfg: chavesAS/discsAS/sigAS/orfas).
DO $$
DECLARE c text;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.simulado_cronograma_adaptativo_geracao_log'::regclass
       AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%acao%'
  LOOP
    EXECUTE format('ALTER TABLE public.simulado_cronograma_adaptativo_geracao_log DROP CONSTRAINT %I', c);
  END LOOP;
  ALTER TABLE public.simulado_cronograma_adaptativo_geracao_log
    ADD CONSTRAINT simulado_cronograma_adaptativo_geracao_log_acao_check
    CHECK (acao IN ('gerar','recalcular','migrar','sync','fixar','arquivar','apagar','pausar','remap_as'));
END $$;

NOTIFY pgrst, 'reload schema';
