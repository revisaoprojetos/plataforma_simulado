-- Grifos de PDF: vínculo com o TEXTO (não com a página). Os rects (0..1 por página) passam a ser só CACHE de desenho;
-- a âncora de texto (exact + prefix/suffix + offsets na "espinha" de texto do documento) permite recalcular os rects
-- quando a versão/paginação muda. ADITIVA e idempotente. O código tolera a ausência destas colunas (grava sem elas).
-- Nenhum dado é apagado ou reescrito aqui.
alter table public.simulado_conteudo_grifos_pdf
  add column if not exists prefix        text,
  add column if not exists suffix        text,
  add column if not exists char_inicio   int,
  add column if not exists char_fim      int,
  add column if not exists ancora_texto  text,   -- trecho exato na espinha (pode diferir de `texto` em grifo multi-página/DOM)
  add column if not exists ancora_versao uuid,   -- versão do documento em que a âncora/offsets foram calculados
  add column if not exists ancora_hash   text,   -- identidade estável (hash de exact+prefix+suffix normalizados), independente de página/versão/layout
  add column if not exists rotulo        text,   -- 'CAPÍTULO I › Art. 5º' / '§ 2º' / 'Súmula Vinculante 11' (página é só dica)
  add column if not exists contexto      text,   -- frase/parágrafo que contém o trecho (~200 chars)
  add column if not exists tipo_trecho   text;   -- artigo | paragrafo | inciso | sumula | jurisprudencia | titulo | texto

comment on column public.simulado_conteudo_grifos_pdf.char_inicio is 'Offset [inicio,fim) na espinha de texto do PDF (lib/conteudo/pdf-texto-ancora.ts) da ancora_versao. Só vale p/ essa versão; entre versões a âncora é re-resolvida por texto+contexto.';

-- Backfill preguiçoso: o leitor grava a âncora quando o aluno abre o PDF (PATCH só se char_inicio ainda é null).

-- Identidade/dedupe: o mesmo trecho (mesmo hash) do mesmo aluno no mesmo documento é o MESMO grifo (o POST devolve o existente).
-- Índice NÃO único (a mesma âncora pode existir com ferramentas/cores diferentes); a idempotência é feita no POST.
create index if not exists idx_grifos_pdf_ancora_hash on public.simulado_conteudo_grifos_pdf (tenant_id, documento_id, aluno_id, ancora_hash) where ancora_hash is not null;

-- Anotações docx/LegProc (já ancoram por uid+offsets+texto_ancora): ganham rótulo/contexto legíveis (preenchidos pelo servidor a partir do trecho).
alter table public.simulado_conteudo_anotacoes
  add column if not exists rotulo      text,
  add column if not exists contexto    text,
  add column if not exists tipo_trecho text;
