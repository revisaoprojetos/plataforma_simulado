import { NextRequest, NextResponse } from 'next/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { createAdminClient } from '@/lib/supabase/server'
import { consultarMembros, normalizarFiltros } from '@/app/admin/conteudos/grupos/membros-query'
import { novoWorkbook, cabecalho, estilizarLinhas, titulo, nomeArquivo } from '@/lib/relatorios/excel-kit'
import { formatBrt } from '@/lib/brt'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const dt = (iso: string | null) => (iso ? formatBrt(iso) ?? '—' : '—')

// GET /api/admin/conteudos/grupos/export?grupo=<id> — XLSX dos membros do grupo, respeitando
// busca + situação + entrou em + ordenação da querystring (mesma consulta da lista, sem paginação).
export async function GET(req: NextRequest) {
  const access = await getCurrentAccess()
  if (!access.tenantId || !(access.isAdmin || access.permissions.includes('grupos:view'))) {
    return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })
  }
  const sp = req.nextUrl.searchParams
  const grupoId = sp.get('grupo')
  if (!grupoId) return NextResponse.json({ error: 'Grupo não informado.' }, { status: 400 })

  // O id vem do cliente: confirma que o grupo é do tenant do ator.
  const svc = createAdminClient()
  const { data: grp } = await svc.from('simulado_grupos').select('id, nome').eq('id', grupoId).eq('tenant_id', access.tenantId).maybeSingle()
  if (!grp) return NextResponse.json({ error: 'Grupo não encontrado.' }, { status: 404 })

  const filtros = normalizarFiltros(Object.fromEntries(sp.entries()))
  const { rows } = await consultarMembros(access.tenantId, grupoId, filtros, { todos: true })

  const situacao = (e: string | null) => (!e ? 'Vitalício' : +new Date(e) > Date.now() ? 'Ativo' : 'Expirado')
  const wb = await novoWorkbook()
  const ws = wb.addWorksheet('Membros')
  ws.columns = [{ width: 40 }, { width: 38 }, { width: 18 }, { width: 14 }, { width: 20 }, { width: 20 }]
  titulo(ws, `Membros · ${grp.nome}`, `${rows.length.toLocaleString('pt-BR')} membro(s) · gerado em ${dt(new Date().toISOString())}`, 6)
  const h = cabecalho(ws, ['Nome', 'E-mail', 'Classificação', 'Situação', 'Validade', 'Entrou em']).number
  for (const m of rows) ws.addRow([m.nome, m.email ?? '—', m.classificacao ?? '—', situacao(m.expiraEm), dt(m.expiraEm), dt(m.entrouEm)])
  if (rows.length) estilizarLinhas(ws, h + 1, ws.rowCount, 6)
  ws.views = [{ state: 'frozen', ySplit: h }]

  const buf = await wb.xlsx.writeBuffer()
  // Cabeçalho HTTP só aceita ASCII: remove acentos/símbolos do nome do grupo.
  const base = nomeArquivo(`Membros_${grp.nome}`).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').slice(0, 60)
  const nome = `${base}_${new Date().toISOString().slice(0, 10)}.xlsx`
  return new NextResponse(buf as any, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nome}"`,
      'Cache-Control': 'no-store',
    },
  })
}
