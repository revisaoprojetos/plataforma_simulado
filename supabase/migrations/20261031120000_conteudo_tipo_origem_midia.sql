-- Amplia o CHECK de `simulado_conteudo_documentos.tipo_origem` para aceitar mídia/office
-- (pptx/xlsx/video/audio), além de docx/pdf/html. A ingestão (lib/conteudo/ingestao.ts + midia.ts)
-- JÁ aceita esses tipos; sem este CHECK ampliado o INSERT da linha do documento era rejeitado pelo
-- Postgres → import de vídeo falhava com erro mudo ("1 com erro").
--
-- Idempotente: remove qualquer CHECK atual que referencie `tipo_origem` (nome desconhecido/variável) e
-- recria com o nome fixo. Equivalente à seção 4 da migração 20261026000000 (que não chegou a este banco).

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'simulado_conteudo_documentos'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%tipo_origem%'
  LOOP
    EXECUTE format('ALTER TABLE simulado_conteudo_documentos DROP CONSTRAINT %I', r.conname);
  END LOOP;

  ALTER TABLE simulado_conteudo_documentos
    ADD CONSTRAINT chk_cdoc_tipo_origem
    CHECK (tipo_origem IS NULL OR tipo_origem IN ('docx','pdf','html','pptx','xlsx','video','audio'));
END $$;
