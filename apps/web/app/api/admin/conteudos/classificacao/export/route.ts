import { NextRequest, NextResponse } from 'next/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { listarTaxonomia } from '@/app/admin/questoes/taxonomia-actions'
import { novoWorkbook, cabecalho, estilizarLinhas, titulo, nomeArquivo } from '@/lib/relatorios/excel-kit'
import { formatBrt } from '@/lib/brt'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const ABA_TO_TIPO = { disciplinas: 'disciplina', assuntos: 'assunto', bancas: 'banca', orgaos: 'orgao' } as const
const ROTULO = { disciplinas: 'Disciplinas', assuntos: 'Assuntos', bancas: 'Bancas', orgaos: 'Órgãos' } as const

// GET /api/admin/conteudos/classificacao/export?aba=&q=&sort=&dir= — XLSX da aba atual da Classificação.
export async function GET(req: NextRequest) {
  const access = await getCurrentAccess()
  const p = access.permissions
  const permitido = access.isAdmin || p.includes('classificacao:view') || p.includes('classificacao:manage') || p.includes('questoes:view')
  if (!access.tenantId || !permitido) return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })

  const sp = req.nextUrl.searchParams
  const aba = (sp.get('aba') as keyof typeof ABA_TO_TIPO) in ABA_TO_TIPO ? (sp.get('aba') as keyof typeof ABA_TO_TIPO) : 'disciplinas'
  const q = (sp.get('q') ?? '').trim().toLowerCase()
  const sort = sp.get('sort') ?? 'nome'
  const dir = sp.get('dir') === 'desc' ? 'desc' : 'asc'

  const res = await listarTaxonomia(ABA_TO_TIPO[aba])
  if (!res.ok) return NextResponse.json({ error: res.error ?? 'Erro ao carregar.' }, { status: 500 })
  let itens = (res.itens ?? []).filter((i) => !q || i.nome.toLowerCase().includes(q))
  itens = [...itens].sort((a, b) => {
    const c = sort === 'nome' ? a.nome.localeCompare(b.nome, 'pt-BR') : ((a[sort as 'questoes' | 'extra'] ?? 0) - (b[sort as 'questoes' | 'extra'] ?? 0))
    return dir === 'asc' ? c : -c
  })

  const temExtra = aba === 'disciplinas'
  const cols = temExtra ? ['Nome', 'Assuntos', 'Questões'] : ['Nome', 'Questões']
  const wb = await novoWorkbook()
  const ws = wb.addWorksheet(ROTULO[aba])
  ws.columns = temExtra ? [{ width: 46 }, { width: 12 }, { width: 12 }] : [{ width: 46 }, { width: 12 }]
  titulo(ws, `Classificação · ${ROTULO[aba]}`, `gerado em ${formatBrt(new Date().toISOString()) ?? ''}`, cols.length)
  const h = cabecalho(ws, cols).number
  for (const i of itens) ws.addRow(temExtra ? [i.nome, i.extra ?? 0, i.questoes ?? 0] : [i.nome, i.questoes ?? 0])
  if (itens.length) estilizarLinhas(ws, h + 1, ws.rowCount, cols.length)
  ws.views = [{ state: 'frozen', ySplit: h }]

  const buf = await wb.xlsx.writeBuffer()
  const nome = nomeArquivo(`Classificacao ${ROTULO[aba]}`, new Date().toISOString().slice(0, 10)) + '.xlsx'
  return new NextResponse(buf as any, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nome}"`,
      'Cache-Control': 'no-store',
    },
  })
}
