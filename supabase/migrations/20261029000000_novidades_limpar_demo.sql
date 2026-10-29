-- ═══════════════════════════════════════════════════════════════════════════
-- NOVIDADES — remover as linhas de DEMO semeadas em 20261028000000_novidades.sql
--
-- Aquele seed inseriu 4 novidades FICTÍCIAS por tenant (episódio em vídeo que não existe,
-- "nova página inicial", LegProc CF art. 37, "Caderno de agosto/2026" do JurisClub). O admin
-- passa a cadastrar só novidades REAIS — então apagamos as de demo (por título EXATO do seed,
-- para não tocar em nada que o admin já tenha editado/criado). Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

DELETE FROM public.simulado_novidades
 WHERE titulo IN (
   'Episódio 00: a plataforma do Revisão está em obra, e você participa',
   'Simulados com nova página inicial',
   'LegProc: CF art. 37 com grifos do Revisão e modo lacunas',
   'Caderno de agosto/2026 completo'
 );

NOTIFY pgrst, 'reload schema';
