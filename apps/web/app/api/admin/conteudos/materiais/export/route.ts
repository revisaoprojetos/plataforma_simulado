import { NextRequest, NextResponse } from 'next/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { listarMateriais, rotulosVinculosDocs } from '@/app/admin/conteudos/materiais/biblioteca/actions'
import { paramsMateriais } from '@/app/admin/conteudos/materiais/biblioteca/params'
import { montarNivelBiblioteca } from '@/app/admin/conteudos/materiais/biblioteca/nivel'
import { rotuloTipo } from '@/components/admin/estudio/conteudo-ui'
import { novoWorkbook, cabecalho, estilizarLinhas, titulo, nomeArquivo } from '@/lib/relatorios/excel-kit'
import { formatBrt } from '@/lib/brt'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const dt = (iso: string | null | undefined) => (iso ? formatBrt(iso) ?? '—' : '—')

// GET /api/admin/conteudos/materiais/export?modo=aulas|arquivos|biblioteca — XLSX da lista atual de
// Materiais, respeitando busca + filtros + ordenação (+ pasta, na Biblioteca) da querystring.
// Aulas/Arquivos: até 5000 linhas (teto); Biblioteca: o nível inteiro da pasta atual.
export async function GET(req: NextRequest) {
  const access = await getCurrentAccess()
  const permitido = access.isAdmin || access.permissions.includes('biblioteca:view')
  if (!access.tenantId || !permitido) return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })

  const sp = Object.fromEntries(req.nextUrl.searchParams.entries())
  const modo = sp.modo === 'arquivos' ? 'arquivos' : sp.modo === 'biblioteca' ? 'biblioteca' : 'aulas'

  const wb = await novoWorkbook()
  let nomeBase: string

  if (modo === 'biblioteca') {
    const nivel = await montarNivelBiblioteca(sp)
    const caminho = ['Biblioteca', ...nivel.breadcrumb.map((b) => b.nome)].join(' / ')
    nomeBase = 'Biblioteca'
    const ws = wb.addWorksheet('Biblioteca')
    ws.columns = [{ width: 12 }, { width: 52 }, { width: 14 }, { width: 12 }, { width: 20 }, { width: 20 }]
    titulo(ws, 'Biblioteca', `${caminho} · gerado em ${dt(new Date().toISOString())}`, 6)
    const h = cabecalho(ws, ['Tipo', 'Título', 'Formato', 'Itens / Aulas', 'Criação', 'Atualização']).number
    for (const l of nivel.todas) {
      ws.addRow([
        l.kind === 'pasta' ? 'Pasta' : 'Documento', l.nome, l.kind === 'pasta' ? '—' : rotuloTipo(l.tipoOrigem ?? 'docx'),
        l.kind === 'pasta' ? (l.itens ?? 0) : (l.vinculos ?? 0), dt(l.criadoEm), dt(l.atualizadoEm ?? l.criadoEm),
      ])
    }
    if (nivel.todas.length) estilizarLinhas(ws, h + 1, ws.rowCount, 6)
    ws.views = [{ state: 'frozen', ySplit: h }]
  } else {
    const res = await listarMateriais({ ...paramsMateriais(sp, modo), limite: 5000 })
    if (!res.ok) return NextResponse.json({ error: res.error || 'Falha ao gerar.' }, { status: 500 })
    const rotulos = await rotulosVinculosDocs(res.rows.map((r) => r.id))
    const nome = modo === 'aulas' ? 'Aulas' : 'Arquivos complementares'
    nomeBase = nome
    const ws = wb.addWorksheet(nome.slice(0, 31))
    ws.columns = [{ width: 56 }, { width: 14 }, { width: 16 }, { width: 40 }, { width: 12 }, { width: 20 }, { width: 20 }]
    titulo(ws, nome, `${res.total.toLocaleString('pt-BR')} no total${res.total > res.rows.length ? ` · exportando as primeiras ${res.rows.length.toLocaleString('pt-BR')}` : ''} · gerado em ${dt(new Date().toISOString())}`, 7)
    const h = cabecalho(ws, ['Título', 'Tipo', 'Situação do material', 'Vinculado a', 'Vínculos', 'Criado em', 'Atualização']).number
    for (const r of res.rows) {
      ws.addRow([
        r.titulo, rotuloTipo(r.tipo_origem), r.versao_atual_id ? 'Com material' : 'Sem material',
        rotulos[r.id]?.rotulo ?? '—', res.vinculos[r.id] ?? 0, dt(r.criado_em), dt(r.atualizado_em),
      ])
    }
    if (res.rows.length) estilizarLinhas(ws, h + 1, ws.rowCount, 7)
    ws.views = [{ state: 'frozen', ySplit: h }]
  }

  const buf = await wb.xlsx.writeBuffer()
  const arquivo = nomeArquivo(nomeBase, new Date().toISOString().slice(0, 10)) + '.xlsx'
  return new NextResponse(buf as any, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${arquivo}"`,
      'Cache-Control': 'no-store',
    },
  })
}
