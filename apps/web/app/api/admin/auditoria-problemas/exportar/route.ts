import { NextRequest, NextResponse } from 'next/server'
import { getCurrentAccess, accessCan, isSuperAdmin } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { listarTodosProblemas, MSG_MIGRACAO } from '@/lib/auditoria-problemas/dados'
import { ROTULO_AREA, ROTULO_STATUS, ROTULO_PRIORIDADE, type Problema } from '@/lib/auditoria-problemas/tipos'
import { hojeBrtISO } from '@/lib/brt'

export const dynamic = 'force-dynamic'

const CABECALHO = ['Status', 'Área', 'Assunto', 'Razão do problema', 'Ação para correção', 'Prioridade', 'Prazo', 'Observação do prazo', 'Data', 'Versão', 'Quem relatou', 'Quem resolve', 'Origem']
const dataBr = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '')
const linha = (p: Problema) => [
  ROTULO_STATUS[p.status] + (p.atrasado ? ' (atrasado)' : ''), ROTULO_AREA[p.area], p.assunto, p.razao ?? '', p.acao ?? '', ROTULO_PRIORIDADE[p.prioridade],
  dataBr(p.prazo), p.prazo_texto ?? '', dataBr(p.data_registro), p.versao ?? '', p.relator ?? '', p.responsavel ?? '', p.origem,
]

/** CSV injection: prefixa com apóstrofo valores que começam com = + - @ (planilhas). */
function cel(v: unknown): string {
  let s = v == null ? '' : String(v)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * GET /api/admin/auditoria-problemas/exportar?formato=csv|xlsx&<filtros da lista> — baixa a lista FILTRADA.
 * Exige `problemas:export`; sempre filtrado pelo tenant da sessão. Auditado.
 */
export async function GET(req: NextRequest) {
  const access = await getCurrentAccess()
  if (!access.userId || !(await isSuperAdmin()) || !access.tenantId || !accessCan(access, 'problemas:export')) return NextResponse.json({ message: 'Sem permissão.' }, { status: 403 })
  const sp = req.nextUrl.searchParams
  const formato = sp.get('formato') === 'xlsx' ? 'xlsx' : 'csv'
  const filtros = { q: sp.get('q') ?? '', area: sp.get('area') ?? '', status: sp.get('status') ?? '', prioridade: sp.get('prioridade') ?? '', prazo: sp.get('prazo') ?? '', responsavel: sp.get('responsavel') ?? '' }
  const { migrado, linhas } = await listarTodosProblemas(access.tenantId, filtros)
  if (!migrado) return NextResponse.json({ message: MSG_MIGRACAO }, { status: 409 })

  await registrarAudit({ operacao: 'UPDATE', entidade: 'auditoria_problemas', tenantId: access.tenantId, atorId: access.userId, atorTipo: 'admin', depois: { acao: 'exportar', formato, linhas: linhas.length } })
  const nome = `auditoria-problemas-${hojeBrtISO()}`

  if (formato === 'csv') {
    const csv = '﻿' + [CABECALHO, ...linhas.map(linha)].map((l) => l.map(cel).join(';')).join('\r\n')
    return new NextResponse(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${nome}.csv"`, 'Cache-Control': 'no-store' } })
  }

  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Auditoria de Problemas'
  const ws = wb.addWorksheet('Problemas', { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.addRow(CABECALHO).font = { bold: true }
  for (const p of linhas) ws.addRow(linha(p).map((v) => (typeof v === 'string' && /^[=+\-@]/.test(v) ? `'${v}` : v)))
  const larg = [16, 28, 44, 52, 52, 12, 12, 24, 12, 14, 16, 16, 14]
  ws.columns.forEach((c, i) => { c.width = larg[i] ?? 16; c.alignment = { vertical: 'top', wrapText: true } })
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: CABECALHO.length } }
  const buf = await wb.xlsx.writeBuffer()
  return new NextResponse(buf as ArrayBuffer, { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${nome}.xlsx"`, 'Cache-Control': 'no-store' } })
}
