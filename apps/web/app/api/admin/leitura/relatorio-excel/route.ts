import { NextRequest, NextResponse } from 'next/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { getCurrentTenantId } from '@/lib/tenant'
import { carregarRelatorioModulo, carregarRelatorioDetalhado } from '@/lib/leitura/relatorio'
import { novoWorkbook, cabecalho, estilizarLinhas, secao, titulo, CORES, nomeArquivo } from '@/lib/relatorios/excel-kit'
import { formatBrt } from '@/lib/brt'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const fmtSeg = (s: number) => (!s ? '—' : s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`)
const dt = (iso: string | null) => (iso ? formatBrt(iso) ?? '—' : '—')

/** GET /api/admin/leitura/relatorio-excel?modulo=<id> — Excel do relatório do módulo (multi-abas + dashboard). */
export async function GET(req: NextRequest) {
  const access = await getCurrentAccess()
  if (!access.tenantId || !(access.isAdmin || access.permissions.includes('leitura:view'))) {
    return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })
  }
  const tenantId = (await getCurrentTenantId()) ?? access.tenantId
  const moduloId = req.nextUrl.searchParams.get('modulo') || '__geral__'

  const [rel, det] = await Promise.all([carregarRelatorioModulo(moduloId, tenantId), carregarRelatorioDetalhado(moduloId, tenantId)])
  const wb = await novoWorkbook()

  // ── Aba 1: Resumo (dashboard) ─────────────────────────────────────────────
  const r = wb.addWorksheet('Resumo')
  r.columns = [{ width: 34 }, { width: 20 }, { width: 20 }, { width: 20 }]
  titulo(r, `Relatório — ${rel.moduloNome}`, `Desafio de Lei Seca · gerado em ${dt(new Date().toISOString())}`, 4)
  secao(r, 'Visão geral', 4)
  const kpis: [string, string | number][] = [
    ['Alunos que participaram', rel.totalAlunos],
    ['Aulas do módulo', rel.totalAulas],
    ['Aulas concluídas (total)', rel.aulasConcluidasTotal],
    ['Média de aulas por aluno', rel.mediaAulasPorAluno],
    ['Sequência média', rel.seqMedia],
    ['Maior sequência', rel.seqMaior],
    ['Pontos — média', rel.pontosMedia],
    ['Pontos — maior', rel.pontosMaior],
    ['Pontos — total', rel.pontosTotal],
  ]
  for (const [k, v] of kpis) { const row = r.addRow([k, v]); row.getCell(1).font = { bold: true }; row.getCell(2).alignment = { horizontal: 'right' } }
  r.addRow([])
  secao(r, 'Top 10 — Maior sequência', 4)
  const s1 = cabecalho(r, ['#', 'Aluno', 'E-mail', 'Sequência']).number
  rel.topSequencia.forEach((t, i) => r.addRow([i + 1, t.nome, t.email ?? '—', t.valor]))
  estilizarLinhas(r, s1 + 1, r.rowCount, 4)
  r.addRow([])
  secao(r, 'Top 10 — Pontos', 4)
  const s2 = cabecalho(r, ['#', 'Aluno', 'E-mail', 'Pontos']).number
  rel.topPontos.forEach((t, i) => r.addRow([i + 1, t.nome, t.email ?? '—', t.valor]))
  estilizarLinhas(r, s2 + 1, r.rowCount, 4)

  // ── Aba 2: Por dia ────────────────────────────────────────────────────────
  const d = wb.addWorksheet('Por dia')
  d.columns = [{ width: 16 }, { width: 24 }, { width: 24 }]
  titulo(d, 'Adesão por dia', 'Alunos que concluíram ao menos uma aula em cada dia', 3)
  const h2 = cabecalho(d, ['Dia', 'Alunos', 'Aulas concluídas']).number
  rel.porDia.forEach((x) => d.addRow([x.dia, x.alunos, x.aulas]))
  estilizarLinhas(d, h2 + 1, d.rowCount, 3)

  // ── Aba 3: Por aula ───────────────────────────────────────────────────────
  const a = wb.addWorksheet('Por aula')
  a.columns = [{ width: 8 }, { width: 44 }, { width: 16 }, { width: 20 }, { width: 20 }]
  titulo(a, 'Estatísticas por aula', 'Conclusões + tempo médio de leitura e de quiz', 5)
  const h3 = cabecalho(a, ['Dia', 'Aula', 'Concluíram', 'Tempo leitura (méd.)', 'Tempo quiz (méd.)']).number
  rel.porAula.forEach((x) => a.addRow([x.ordem, x.titulo, x.concluiram, fmtSeg(x.leituraMediaSeg), fmtSeg(x.quizMediaSeg)]))
  estilizarLinhas(a, h3 + 1, a.rowCount, 5)

  // ── Aba 4: Detalhado (aluno × aula, com horários) ─────────────────────────
  const x = wb.addWorksheet('Detalhado')
  x.columns = [{ width: 28 }, { width: 26 }, { width: 8 }, { width: 34 }, { width: 20 }, { width: 20 }, { width: 16 }, { width: 20 }, { width: 20 }, { width: 14 }, { width: 12 }, { width: 10 }]
  titulo(x, 'Detalhado por aluno e aula', 'Início/fim da leitura e do quiz + acertos e pontos', 12)
  const h4 = cabecalho(x, ['Aluno', 'E-mail', 'Dia', 'Aula', 'Leitura início', 'Leitura fim', 'Tempo leitura', 'Quiz início', 'Quiz fim', 'Tempo quiz', 'Acertos', 'Pontos']).number
  det.detalhes.forEach((v) => x.addRow([v.nome, v.email ?? '—', v.ordem, v.aula, dt(v.leituraInicio), dt(v.leituraFim), fmtSeg(v.leituraSeg), dt(v.quizInicio), dt(v.quizFim), fmtSeg(v.quizSeg), `${v.acertos}/${v.total}`, v.pontos]))
  estilizarLinhas(x, h4 + 1, x.rowCount, 12)
  x.views = [{ state: 'frozen', ySplit: h4 }]

  const buf = await wb.xlsx.writeBuffer()
  const nome = nomeArquivo(`Relatorio_${rel.moduloNome}`, new Date().toISOString().slice(0, 10)) + '.xlsx'
  return new NextResponse(buf as any, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nome}"`,
      'Cache-Control': 'no-store',
    },
  })
}
