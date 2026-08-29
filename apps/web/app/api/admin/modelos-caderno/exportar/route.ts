import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { gerarHtmlItem } from '@/lib/caderno-teste/exportar-html'
import { gerarDocxDiagnostico } from '@/lib/caderno-teste/exportar-docx'
import { metaDaModalidade, type ItemCaderno } from '@/lib/caderno-teste/tipos'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const TABELA = 'simulado_caderno_modelos'

/** Nome de arquivo seguro (sem acentos/caracteres inválidos). */
function slugArquivo(nome: string): string {
  return (nome || 'caderno').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9 _-]/g, '').trim() || 'caderno'
}

/** Excel (.xlsx) do modelo: folha → grade de respostas; demais → sumário estrutural do conteúdo. */
async function gerarExcelModelo(item: ItemCaderno, nome: string): Promise<Buffer> {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Revisão — Modelos de Caderno'
  const roxo = 'FF5B21B6', branco = 'FFFFFFFF', cinza = 'FFF3F4F6'
  const a: any = item?.ajustes ?? {}

  const ws = wb.addWorksheet('Caderno')
  // Título no topo.
  const tRow = ws.addRow([a.titulo || nome || 'Caderno'])
  tRow.getCell(1).font = { bold: true, size: 16 }
  const sub = ws.addRow([metaDaModalidade(item?.modalidade as any)?.nome ?? 'Modelo de caderno'])
  sub.getCell(1).font = { italic: true, color: { argb: 'FF777777' } }
  ws.addRow([])

  if (item?.modalidade === 'folha_respostas') {
    // Grade de respostas: Nº + bolhas A..E, uma linha por questão (marcável no Excel).
    const nAlt = Math.min(6, Math.max(2, Number(a.numAlternativas) || 5))
    // Modelo é um template sem banco → gabarito em branco de 20 linhas (o total real vem ao aplicar num simulado).
    const total = 20
    const letras = ['A', 'B', 'C', 'D', 'E', 'F'].slice(0, nAlt)
    const cab = ws.addRow(['Nº', ...letras])
    cab.font = { bold: true, color: { argb: branco } }
    cab.alignment = { vertical: 'middle', horizontal: 'center' }
    cab.height = 22
    cab.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: roxo } } })
    const primeira = ws.rowCount + 1
    for (let n = 1; n <= total; n++) ws.addRow([n, ...letras.map(() => '')])
    const borda = { style: 'thin' as const, color: { argb: 'FFE5E7EB' } }
    for (let r = primeira; r <= ws.rowCount; r++) {
      const row = ws.getRow(r)
      if ((r - primeira) % 2 === 1) row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cinza } }
      for (let c = 1; c <= nAlt + 1; c++) { const cell = row.getCell(c); cell.border = { top: borda, bottom: borda, left: borda, right: borda }; cell.alignment = { horizontal: 'center' } }
      row.getCell(1).font = { bold: true }
    }
    ws.getColumn(1).width = 6
    letras.forEach((_, i) => { ws.getColumn(i + 2).width = 6 })
    ws.views = [{ state: 'frozen', ySplit: primeira - 1 }]
    return Buffer.from(await wb.xlsx.writeBuffer())
  }

  // Demais modalidades: sumário (Campo | Valor) com título, subtítulo e seções do conteúdo.
  const cab = ws.addRow(['Campo', 'Valor'])
  cab.font = { bold: true, color: { argb: branco } }
  cab.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: roxo } } })
  const linhas: [string, string][] = []
  linhas.push(['Título', a.titulo || nome || 'Caderno'])
  linhas.push(['Modalidade', metaDaModalidade(item?.modalidade as any)?.nome ?? '—'])
  const c: any = item?.conteudo
  if (c) {
    if (c.subtitulo) linhas.push(['Subtítulo', String(c.subtitulo)])
    if (c.notaTexto) linhas.push(['Nota', String(c.notaTexto)])
    if (c.linguaPortuguesa?.secTitulo) linhas.push(['Seção', String(c.linguaPortuguesa.secTitulo)])
    for (const pl of (c.pilares ?? [])) if (pl?.nome) linhas.push(['Pilar', String(pl.nome)])
    for (const d of (c.disciplinas ?? [])) if (d?.nome) linhas.push(['Disciplina', String(d.nome)])
    for (const s of (c.sugestoes ?? [])) if (s?.titulo) linhas.push(['Sugestão', String(s.titulo)])
    if (c.gabaritoTitulo) linhas.push(['Seção', String(c.gabaritoTitulo)])
  }
  const primeira = ws.rowCount + 1
  for (const [campo, valor] of linhas) ws.addRow([campo, valor])
  const borda = { style: 'thin' as const, color: { argb: 'FFE5E7EB' } }
  for (let r = primeira; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    if ((r - primeira) % 2 === 1) row.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cinza } } })
    row.getCell(1).font = { bold: true }
    row.getCell(1).border = { bottom: borda, right: borda }
    row.getCell(2).border = { bottom: borda, right: borda }
    row.getCell(2).alignment = { wrapText: true, vertical: 'top' }
  }
  ws.getColumn(1).width = 18
  ws.getColumn(2).width = 70
  ws.views = [{ state: 'frozen', ySplit: primeira - 1 }]
  return Buffer.from(await wb.xlsx.writeBuffer())
}

/** Download do modelo de caderno em Word (.doc) ou Excel (.xlsx). GET ?id=<modelo>&formato=word|excel */
export async function GET(req: NextRequest) {
  const access = await getCurrentAccess()
  if (!access.tenantId || !(access.isAdmin || access.permissions.includes('questoes:view'))) {
    return NextResponse.json({ ok: false, error: 'Sem permissão.' }, { status: 403 })
  }
  const url = new URL(req.url)
  const id = url.searchParams.get('id') ?? ''
  const f = url.searchParams.get('formato')
  const formato = f === 'excel' ? 'excel' : f === 'pdf' ? 'pdf' : 'word'
  if (!id) return NextResponse.json({ ok: false, error: 'Modelo não informado.' }, { status: 400 })

  // PDF usa a PÁGINA DE IMPRESSÃO (render FIEL do sistema, flex/navegador). Word/Excel gerados aqui.
  if (formato === 'pdf') return NextResponse.redirect(new URL(`/imprimir/modelo/${encodeURIComponent(id)}?auto=1`, req.url))

  const svc = createAdminClient()
  const { data: mod } = await svc.from(TABELA).select('nome, config, modalidade').eq('id', id).eq('tenant_id', access.tenantId).eq('deletado', false).maybeSingle()
  if (!mod) return NextResponse.json({ ok: false, error: 'Modelo não encontrado.' }, { status: 404 })

  const item = ((mod as any).config?.item ?? null) as ItemCaderno | null
  if (!item || !item.modalidade) return NextResponse.json({ ok: false, error: 'Modelo sem conteúdo para exportar.' }, { status: 400 })
  const nome = slugArquivo((mod as any).nome || item.ajustes?.titulo || 'caderno')

  if (formato === 'excel') {
    // Excel (folha → grade de respostas; demais → sumário estrutural).
    const buf = await gerarExcelModelo(item, (mod as any).nome || item.ajustes?.titulo || 'Caderno')
    return new NextResponse(new Uint8Array(buf), { status: 200, headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nome}.xlsx"`,
    } })
  }

  // Word do DIAGNÓSTICO = .docx NATIVO (tabelas reais + espaçamento entre blocos + editável).
  if (item.modalidade === 'diagnostico') {
    const buf = await gerarDocxDiagnostico(item, [], {})
    return new NextResponse(new Uint8Array(buf), { status: 200, headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${nome}.docx"`,
    } })
  }
  // Word das demais modalidades: HTML temado (tabelas — o Word renderiza bem).
  const html = gerarHtmlItem(item, {})
  return new NextResponse(html, { status: 200, headers: {
    'Content-Type': 'application/msword; charset=utf-8',
    'Content-Disposition': `attachment; filename="${nome}.doc"`,
  } })
}
