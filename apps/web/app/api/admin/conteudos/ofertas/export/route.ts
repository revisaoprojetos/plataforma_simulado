import { NextRequest, NextResponse } from 'next/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { listarOfertas } from '@/lib/integracoes/liberacao/ofertas'
import { normalizarFiltrosOferta, filtrarOrdenarOfertas, codigoOferta, rotuloSituacao, acessoLabel, dataBr } from '@/app/admin/conteudos/ofertas/oferta-util'
import { novoWorkbook, cabecalho, estilizarLinhas, titulo, nomeArquivo } from '@/lib/relatorios/excel-kit'
import { formatBrt } from '@/lib/brt'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const dt = (iso: string | null) => (iso ? formatBrt(iso) ?? '—' : '—')

// GET /api/admin/conteudos/ofertas/export — XLSX das ofertas respeitando busca + filtros + ordenação da querystring.
export async function GET(req: NextRequest) {
  const access = await getCurrentAccess()
  const permitido = access.isAdmin || access.permissions.includes('liberacao:view') || access.permissions.includes('liberacao:manage')
  if (!access.tenantId || !permitido) return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })

  const filtros = normalizarFiltrosOferta(Object.fromEntries(req.nextUrl.searchParams.entries()))
  const lista = filtrarOrdenarOfertas(await listarOfertas(access.tenantId), filtros)

  const wb = await novoWorkbook()
  const ws = wb.addWorksheet('Ofertas')
  ws.columns = [{ width: 10 }, { width: 46 }, { width: 12 }, { width: 14 }, { width: 18 }, { width: 14 }, { width: 20 }, { width: 60 }]
  titulo(ws, 'Ofertas', `${lista.length.toLocaleString('pt-BR')} oferta(s) · gerado em ${dt(new Date().toISOString())}`, 8)
  const h = cabecalho(ws, ['Cód.', 'Nome', 'Conteúdos', 'Situação', 'Acesso', 'Acessos ativos', 'Criação', 'Produtos']).number
  for (const o of lista) {
    ws.addRow([codigoOferta(o.id), o.nome, o.produtoIds.length, rotuloSituacao(o.status), acessoLabel(o), o.grantsAtivos, o.criadoEm ? dt(o.criadoEm) : dataBr(null), o.produtoNomes.join(' · ')])
  }
  if (lista.length) estilizarLinhas(ws, h + 1, ws.rowCount, 8)
  ws.views = [{ state: 'frozen', ySplit: h }]

  const buf = await wb.xlsx.writeBuffer()
  const nome = nomeArquivo('Ofertas', new Date().toISOString().slice(0, 10)) + '.xlsx'
  return new NextResponse(buf as any, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nome}"`,
      'Cache-Control': 'no-store',
    },
  })
}
