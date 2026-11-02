import { NextRequest, NextResponse } from 'next/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { lerClassificacaoPadraoLote } from '@/app/admin/conteudos/materiais/questoes/actions'
import { listarBancosFiltrados, contarQuestoesPorBanco } from '@/app/admin/conteudos/materiais/questoes/bancos-lista'
import { createAdminClient } from '@/lib/supabase/server'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { novoWorkbook, cabecalho, estilizarLinhas, titulo, nomeArquivo } from '@/lib/relatorios/excel-kit'
import { formatBrt } from '@/lib/brt'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const dt = (iso: string | null | undefined) => (iso ? formatBrt(iso) ?? '—' : '—')

// GET /api/admin/conteudos/questoes/export — XLSX dos bancos de questões, respeitando busca + filtros
// (disciplina/banca) da querystring, igual à lista.
export async function GET(req: NextRequest) {
  const access = await getCurrentAccess()
  const permitido = access.isAdmin || access.permissions.includes('questoes:view') || access.permissions.includes('questoes:manage')
  if (!access.tenantId || !permitido) return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })

  const sp = req.nextUrl.searchParams
  const q = (sp.get('q') ?? '').trim()
  const disc = (sp.get('disc') ?? '').trim() || null
  const banca = (sp.get('banca') ?? '').trim() || null

  const bancoId = (sp.get('banco') ?? '').trim() || null
  if (bancoId) return exportarQuestoesDoBanco(access.tenantId, bancoId, sp)

  const classLote = await lerClassificacaoPadraoLote()
  const { pastas } = await listarBancosFiltrados(access.tenantId, { q, disc, banca }, classLote, null)
  const contagens = await contarQuestoesPorBanco(access.tenantId, pastas.map((p) => p.id))

  const wb = await novoWorkbook()
  const ws = wb.addWorksheet('Bancos de questões')
  ws.columns = [{ width: 46 }, { width: 14 }, { width: 28 }, { width: 24 }, { width: 12 }, { width: 20 }]
  titulo(ws, 'Bancos de questões', `gerado em ${dt(new Date().toISOString())}`, 6)
  const h = cabecalho(ws, ['Banco', 'Tipo', 'Disciplina', 'Banca', 'Questões', 'Atualização']).number
  for (const p of pastas) {
    const c = classLote[p.id]
    ws.addRow([p.nome, p.tipo === 'discursiva' ? 'Discursiva' : 'Objetiva', c?.disciplina?.nome ?? '—', c?.banca?.nome ?? '—', contagens.get(p.id) ?? 0, dt(p.atualizado_em)])
  }
  if (pastas.length) estilizarLinhas(ws, h + 1, ws.rowCount, 6)
  ws.views = [{ state: 'frozen', ySplit: h }]

  const buf = await wb.xlsx.writeBuffer()
  const nome = nomeArquivo('Bancos de questoes', new Date().toISOString().slice(0, 10)) + '.xlsx'
  return new NextResponse(buf as any, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nome}"`,
      'Cache-Control': 'no-store',
    },
  })
}

const DIF: Record<string, string> = { facil: 'Fácil', medio: 'Médio', dificil: 'Difícil' }
const SIT: Record<string, string> = { publicada: 'Ativa', rascunho: 'Rascunho', arquivada: 'Arquivada' }

// Banco aberto: XLSX das questões do banco, com os mesmos filtros da lista (q/disc/banca/ano/dif/sit).
async function exportarQuestoesDoBanco(tid: string, bancoId: string, sp: URLSearchParams) {
  const svc = createAdminClient()
  const { data: b } = await svc.from('simulado_pastas').select('id, nome').eq('tenant_id', tid).eq('folder_area', 'banco').eq('id', bancoId).maybeSingle()
  if (!b) return NextResponse.json({ error: 'Banco não encontrado.' }, { status: 404 })
  const vinc = await fetchAll<{ questao_id: string }>(() =>
    svc.from('simulado_questao_pasta').select('questao_id').eq('tenant_id', tid).eq('pasta_id', bancoId).order('questao_id', { ascending: true }))
  const ids = vinc.map((v) => v.questao_id)
  const todas = ids.length
    ? await fetchAllByIn<any>(ids, (chunk) =>
        svc.from('simulado_questoes')
          .select('id, enunciado, tipo, ano, nivel_dificuldade, status, created_at, disciplinas:simulado_disciplinas(nome), assuntos:simulado_assuntos(nome), bancas:simulado_bancas(nome), orgaos:simulado_orgaos(nome)')
          .in('id', chunk).eq('tenant_id', tid).eq('deletado', false).order('id', { ascending: true }))
    : []
  todas.sort((a: any, c: any) => String(a.created_at ?? '').localeCompare(String(c.created_at ?? '')) || String(a.id).localeCompare(String(c.id)))
  const q = (sp.get('q') ?? '').trim().toLowerCase()
  const disc = sp.get('disc'); const banca = sp.get('banca'); const ano = Number(sp.get('ano')) || null
  const dif = sp.get('dif'); const sit = sp.get('sit')
  const linhas = todas.map((x: any, i: number) => ({ x, n: i + 1 })).filter(({ x }: any) =>
    (!q || String(x.enunciado ?? '').toLowerCase().includes(q)) && (!disc || x.disciplinas?.nome === disc) && (!banca || x.bancas?.nome === banca)
    && (!ano || x.ano === ano) && (!dif || x.nivel_dificuldade === dif) && (!sit || x.status === sit))

  const wb = await novoWorkbook()
  const ws = wb.addWorksheet('Questões')
  ws.columns = [{ width: 6 }, { width: 70 }, { width: 14 }, { width: 24 }, { width: 24 }, { width: 20 }, { width: 20 }, { width: 8 }, { width: 12 }, { width: 12 }]
  titulo(ws, `Banco: ${(b as any).nome}`, `gerado em ${dt(new Date().toISOString())}`, 10)
  const h = cabecalho(ws, ['Nº', 'Enunciado', 'Tipo', 'Disciplina', 'Assunto', 'Banca', 'Órgão', 'Ano', 'Dificuldade', 'Situação']).number
  for (const { x, n } of linhas) {
    ws.addRow([n, x.enunciado ?? '', x.tipo === 'discursiva' ? 'Discursiva' : 'Objetiva', x.disciplinas?.nome ?? '—', x.assuntos?.nome ?? '—', x.bancas?.nome ?? '—', x.orgaos?.nome ?? '—', x.ano ?? '—', DIF[x.nivel_dificuldade] ?? '—', SIT[x.status] ?? '—'])
  }
  if (linhas.length) estilizarLinhas(ws, h + 1, ws.rowCount, 10)
  ws.views = [{ state: 'frozen', ySplit: h }]
  const buf = await wb.xlsx.writeBuffer()
  const nome = nomeArquivo(`Banco ${(b as any).nome}`, new Date().toISOString().slice(0, 10)) + '.xlsx'
  return new NextResponse(buf as any, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(nome)}"; filename*=UTF-8''${encodeURIComponent(nome)}`,
      'Cache-Control': 'no-store',
    },
  })
}
