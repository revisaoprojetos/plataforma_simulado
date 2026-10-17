import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { salvarDoc } from '@/lib/teste/store'
import { createAdminClient } from '@/lib/supabase/server'
import { gerarDocxDiagnostico } from '@/lib/caderno-teste/exportar-docx'
import { gerarHtmlItem } from '@/lib/caderno-teste/exportar-html'
import { AJUSTES_BASE, CAPA_PADRAO, type ItemCaderno } from '@/lib/caderno-teste/tipos'
import { DIAG_AGU_2023 } from '@/lib/caderno-teste/diagnostico'
// @ts-ignore — sem tipos
import HTMLtoDOCX from 'html-to-docx'

// SPIKE — gera cópias dos 3 documentos reais em .docx no store de teste: diagnóstico (fiel, exportador
// nativo), folha de respostas e a leitura de juris (via HTML→docx). Retorna os ids pra abrir nos editores.
export const dynamic = 'force-dynamic'
const TID = '02195fa6-3db8-49d0-8c07-d21328a26a13' // Revisão

const VARS: Record<string, string> = {
  nome: 'João Silva', email: 'joao@exemplo.com', data: '17/10/2026', inicio: '09:00', termino: '10:30',
  tempo_total: '1h30', respondidas: '30', em_branco: '0', acertos: '18', erros: '12', total_questoes: '30',
  percentual: '60%', nota: '6,0', numero_peito: '0001', simulado: 'Minissimulado 1 · AGU',
}

async function htmlParaDocx(html: string): Promise<Buffer> {
  const out = await HTMLtoDOCX(`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`, undefined, { table: { row: { cantSplit: true } }, footer: false, pageNumber: false })
  return Buffer.isBuffer(out) ? out : Buffer.from(out)
}
async function guardar(buf: Buffer): Promise<string> { const id = randomUUID(); await salvarDoc(id, buf); return id }

export async function POST() {
  const res: Record<string, string | null> = { diagnostico: null, folha: null, leitura: null }
  const erros: Record<string, string> = {}

  // 1) DIAGNÓSTICO — fiel, pelo exportador nativo (mesmo do download Word do sistema).
  try {
    const item = { id: 'diag', modalidade: 'diagnostico', ajustes: { ...AJUSTES_BASE, titulo: 'Diagnóstico de Desempenho' }, conteudo: DIAG_AGU_2023, capa: CAPA_PADRAO } as unknown as ItemCaderno
    const buf = await gerarDocxDiagnostico(item, [], VARS)
    res.diagnostico = await guardar(buf)
  } catch (e) { erros.diagnostico = (e as Error).message }

  // 2) FOLHA DE RESPOSTAS — HTML do item (modalidade folha) → docx.
  try {
    const item = { id: 'folha', modalidade: 'folha_respostas', ajustes: { ...AJUSTES_BASE, titulo: 'Folha de Respostas — Minissimulado 1 · AGU', numAlternativas: 5, colunas: 3 }, capa: CAPA_PADRAO } as unknown as ItemCaderno
    const questoes = Array.from({ length: 30 }, (_, i) => ({ numero: i + 1 } as any))
    const html = gerarHtmlItem(item, { vars: VARS, questoes })
    res.folha = await guardar(await htmlParaDocx(html))
  } catch (e) { erros.folha = (e as Error).message }

  // 3) LEITURA (juris, dia 1) — conteúdo real → docx.
  try {
    const svc = createAdminClient()
    // Acha um documento de leitura de jurisprudência publicado (o "dia 1").
    const { data: pastas } = await svc.from('simulado_pastas').select('id, nome').eq('tenant_id', TID).ilike('nome', '%juris%').eq('deletado', false)
    const pastaIds = (pastas ?? []).map((p: any) => p.id)
    let docId: string | null = null, versao = 1, titulo = 'Leitura de Jurisprudência'
    if (pastaIds.length) {
      const { data: docs } = await svc.from('simulado_documentos').select('id, titulo, versao, versao_publicada, ordem').in('pasta_id', pastaIds).eq('deletado', false).eq('publicado', true).order('ordem', { ascending: true }).limit(1)
      const d = (docs ?? [])[0] as any
      if (d) { docId = d.id; versao = d.versao_publicada ?? d.versao ?? 1; titulo = d.titulo ?? titulo }
    }
    if (docId) {
      const { data: cont } = await svc.from('simulado_documento_conteudos').select('html').eq('documento_id', docId).eq('versao', versao).maybeSingle()
      const html = `<h1>${titulo}</h1>` + ((cont as any)?.html ?? '<p>(sem conteúdo)</p>')
      res.leitura = await guardar(await htmlParaDocx(html))
    } else { erros.leitura = 'nenhum documento de leitura de juris publicado encontrado' }
  } catch (e) { erros.leitura = (e as Error).message }

  return NextResponse.json({ ids: res, erros })
}
