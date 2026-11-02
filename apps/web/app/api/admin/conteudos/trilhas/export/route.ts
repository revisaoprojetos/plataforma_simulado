import { NextRequest, NextResponse } from 'next/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { createAdminClient } from '@/lib/supabase/server'
import { listarTrilhasParaExport } from '@/lib/trilhas/trilhas'
import { novoWorkbook, cabecalho, estilizarLinhas, titulo, nomeArquivo } from '@/lib/relatorios/excel-kit'
import { formatBrt } from '@/lib/brt'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const dt = (iso: string | null) => (iso ? formatBrt(iso) ?? '—' : '—')
const VIS: Record<string, string> = { publica: 'Pública', privada: 'Privada', nao_listada: 'Não listada' }

// GET /api/admin/conteudos/trilhas/export — XLSX da lista de Trilhas, respeitando busca + ordenação da querystring.
export async function GET(req: NextRequest) {
  const access = await getCurrentAccess()
  const permitido = access.isAdmin || access.permissions.includes('trilhas:view') || access.permissions.includes('trilhas:manage')
  if (!access.tenantId || !permitido) return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })

  const sp = req.nextUrl.searchParams
  const q = (sp.get('q') ?? '').trim()
  const sort = sp.get('sort') ?? 'codigo'
  const dir = sp.get('dir') === 'asc' ? 'asc' : 'desc'

  let linhas
  try { linhas = await listarTrilhasParaExport(createAdminClient(), access.tenantId, { q, sort, dir }) }
  catch (e: any) { return NextResponse.json({ error: e?.message || 'Falha ao exportar.' }, { status: 500 }) }

  const wb = await novoWorkbook()
  const ws = wb.addWorksheet('Trilhas')
  ws.columns = [{ width: 8 }, { width: 50 }, { width: 14 }, { width: 14 }, { width: 22 }, { width: 22 }]
  titulo(ws, 'Trilhas', `${linhas.length} trilha(s) · gerado em ${dt(new Date().toISOString())}`, 6)
  const h = cabecalho(ws, ['Cód.', 'Trilha', 'Visível', 'Cursos ativos', 'Ordenação', 'Criação']).number
  for (const t of linhas) {
    ws.addRow([t.codigo ?? '—', t.nome, VIS[t.visibilidade] ?? t.visibilidade, t.itens, t.ordem_modo === 'data' ? 'Data de liberação' : 'Manual', dt(t.criado_em)])
  }
  if (linhas.length) estilizarLinhas(ws, h + 1, ws.rowCount, 6)
  ws.views = [{ state: 'frozen', ySplit: h }]

  const buf = await wb.xlsx.writeBuffer()
  const nome = nomeArquivo('Trilhas', new Date().toISOString().slice(0, 10)) + '.xlsx'
  return new NextResponse(buf as any, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nome}"`,
      'Cache-Control': 'no-store',
    },
  })
}
