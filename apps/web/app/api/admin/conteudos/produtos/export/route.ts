import { NextRequest, NextResponse } from 'next/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { linhasParaExport, listarPastasProduto, breadcrumbPasta } from '@/lib/produtos/estudio'
import { novoWorkbook, cabecalho, estilizarLinhas, titulo, nomeArquivo } from '@/lib/relatorios/excel-kit'
import { formatBrt } from '@/lib/brt'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const dt = (iso: string | null) => (iso ? formatBrt(iso) ?? '—' : '—')

// GET /api/admin/conteudos/produtos/export — XLSX do nível atual do navegador de Produtos,
// respeitando pasta + busca + filtros (tipo/situação/grupo) + ordenação da querystring.
export async function GET(req: NextRequest) {
  const access = await getCurrentAccess()
  const permitido = access.isAdmin || access.permissions.includes('produtos:view') || access.permissions.includes('produtos:manage')
  if (!access.tenantId || !permitido) return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })

  const sp = req.nextUrl.searchParams
  const pasta = sp.get('pasta') || null
  const q = (sp.get('q') ?? '').trim()
  const sort = sp.get('sort') ?? 'atualizacao'
  const dir = sp.get('dir') === 'asc' ? 'asc' : 'desc'
  const tipo = sp.get('tipo') || null
  const situacaoRaw = sp.get('situacao')
  const situacao = situacaoRaw === 'ativo' || situacaoRaw === 'inativo' ? situacaoRaw : null
  const grupo = sp.get('grupo') || null

  const [linhas, arvore] = await Promise.all([
    linhasParaExport(access.tenantId, pasta, { q, sort, dir, tipo, situacao, grupo }),
    listarPastasProduto(access.tenantId),
  ])
  const caminho = ['Produtos', ...breadcrumbPasta(arvore, pasta).map((b) => b.nome)].join(' / ')

  const wb = await novoWorkbook()
  const ws = wb.addWorksheet('Produtos')
  ws.columns = [{ width: 18 }, { width: 46 }, { width: 10 }, { width: 12 }, { width: 12 }, { width: 20 }, { width: 20 }]
  titulo(ws, 'Produtos', `${caminho} · gerado em ${dt(new Date().toISOString())}`, 7)
  const h = cabecalho(ws, ['Tipo', 'Título', 'Itens', 'Situação', 'Membros', 'Criação', 'Última atualização']).number
  for (const l of linhas) {
    ws.addRow([l.tipo, l.titulo, l.itens, l.situacao, l.membros === '' ? '—' : l.membros, dt(l.criado_em), dt(l.atualizado_em)])
  }
  if (linhas.length) estilizarLinhas(ws, h + 1, ws.rowCount, 7)
  ws.views = [{ state: 'frozen', ySplit: h }]

  const buf = await wb.xlsx.writeBuffer()
  const nome = nomeArquivo('Produtos', new Date().toISOString().slice(0, 10)) + '.xlsx'
  return new NextResponse(buf as any, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nome}"`,
      'Cache-Control': 'no-store',
    },
  })
}
