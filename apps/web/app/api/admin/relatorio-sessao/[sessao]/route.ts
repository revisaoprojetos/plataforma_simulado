import { NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

type Grupo = { id: string; nome: string; disciplinas: string[] }

function fmt(d: string | null) { return d ? format(new Date(d), 'dd/MM/yyyy HH:mm', { locale: ptBR }) : '—' }
function dur(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  return h > 0 ? `${h}h ${m}m ${sec}s` : m > 0 ? `${m}m ${sec}s` : `${sec}s`
}

export async function GET(_req: Request, { params }: { params: Promise<{ sessao: string }> }) {
  const { sessao } = await params
  const access = await getCurrentAccess()
  if (!access.tenantId || !(access.isAdmin || access.permissions.includes('estudantes:view') || access.permissions.includes('relatorios:view'))) {
    return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })
  }
  const svc = createAdminClient()

  const { data: s } = await svc
    .from('simulado_sessoes_prova')
    .select('id, estudante_id, simulado_id, status, nota, tentativa_num, iniciado_em, finalizado_em')
    .eq('id', sessao).eq('tenant_id', access.tenantId).maybeSingle()
  if (!s) return NextResponse.json({ error: 'Sessão não encontrada.' }, { status: 404 })

  const [{ data: est }, { data: sim }, { data: resp }, { data: pq }] = await Promise.all([
    svc.from('simulado_estudantes').select('nome, email, telefone, classificacao').eq('id', s.estudante_id).maybeSingle(),
    svc.from('simulado_simulados').select('titulo').eq('id', s.simulado_id).maybeSingle(),
    svc.from('simulado_respostas_objetivas').select('questao_id, correta').eq('sessao_id', sessao),
    svc.from('simulado_prova_questoes').select('questao_id').eq('simulado_id', s.simulado_id),
  ])

  const respostas = resp ?? []
  const respondidas = respostas.length
  const acertos = respostas.filter((r: any) => r.correta).length
  const erros = respondidas - acertos
  const totalQ = (pq ?? []).length || respondidas
  const emBranco = Math.max(0, totalQ - respondidas)
  const pctAcerto = totalQ > 0 ? Math.round((acertos / totalQ) * 100) : 0
  const tempoMs = s.iniciado_em && s.finalizado_em ? new Date(s.finalizado_em).getTime() - new Date(s.iniciado_em).getTime() : 0

  // Disciplina de cada questão respondida → breakdown por disciplina.
  const qIds = [...new Set(respostas.map((r: any) => r.questao_id).filter(Boolean))]
  const discPorQ = new Map<string, string>()
  if (qIds.length) {
    const { data: qs } = await svc.from('simulado_questoes').select('id, disciplinas:simulado_disciplinas(nome)').in('id', qIds)
    for (const q of qs ?? []) discPorQ.set((q as any).id, (q as any).disciplinas?.nome ?? 'Sem disciplina')
  }
  const discMap = new Map<string, { ac: number; tt: number }>()
  for (const r of respostas as any[]) {
    const nome = discPorQ.get(r.questao_id) ?? 'Sem disciplina'
    const cur = discMap.get(nome) ?? { ac: 0, tt: 0 }; cur.tt++; if (r.correta) cur.ac++; discMap.set(nome, cur)
  }
  const porDisciplina = [...discMap.entries()].map(([nome, v]) => ({ nome, ...v })).sort((a, b) => a.nome.localeCompare(b.nome))

  // Grupos: do banco que mais cobre o simulado.
  let porGrupo: { nome: string; ac: number; tt: number }[] = []
  const allQ = [...new Set((pq ?? []).map((r: any) => r.questao_id))]
  if (allQ.length) {
    const { data: qp } = await svc.from('simulado_questao_pasta').select('questao_id, pasta_id').in('questao_id', allQ)
    const cont = new Map<string, number>()
    for (const r of qp ?? []) cont.set((r as any).pasta_id, (cont.get((r as any).pasta_id) ?? 0) + 1)
    const melhor = [...cont.entries()].sort((a, b) => b[1] - a[1])[0]
    if (melhor) {
      const { data: pasta, error } = await svc.from('simulado_pastas').select('grupos').eq('id', melhor[0]).maybeSingle()
      const grupos: Grupo[] = !error && Array.isArray((pasta as any)?.grupos) ? (pasta as any).grupos : []
      porGrupo = grupos.map((g) => {
        let ac = 0, tt = 0
        for (const d of g.disciplinas) { const v = discMap.get(d); if (v) { ac += v.ac; tt += v.tt } }
        return { nome: g.nome, ac, tt }
      }).filter((g) => g.tt > 0)
    }
  }

  // ── Monta o Excel ──
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Plataforma de Simulados'
  const ws = wb.addWorksheet('Relatório')
  ws.columns = [{ width: 30 }, { width: 46 }, { width: 12 }, { width: 12 }]

  const PRIM = 'FF5A4B9A'
  const thin = { style: 'thin' as const, color: { argb: 'FFD9D4E6' } }
  const med = { style: 'medium' as const, color: { argb: PRIM } }
  const par = (label: string, valor: string) => { const r = ws.addRow([label, valor]); r.getCell(1).font = { bold: true, color: { argb: 'FF555555' } } }
  const cabTabela = (cols: string[]) => { const r = ws.addRow(cols); r.font = { bold: true }; r.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6E1F2' } } }) }
  // Renderiza uma seção: título colorido + conteúdo, com fundo suave e bordas de fechamento.
  const secao = (titulo: string, build: () => void) => {
    const start = ws.rowCount + 1
    const t = ws.addRow([titulo]); ws.mergeCells(`A${t.number}:D${t.number}`)
    t.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 }; t.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PRIM } }; t.height = 20
    build()
    const end = ws.rowCount
    // fundo suave nas linhas de dados (col A um tom, B–D outro) — sem sobrescrever fills já definidos.
    for (let r = start + 1; r <= end; r++) for (let c = 1; c <= 4; c++) {
      const cell = ws.getCell(r, c)
      if (!cell.fill || (cell.fill as any).type !== 'pattern') cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c === 1 ? 'FFF2EFF8' : 'FFFBFAFD' } }
    }
    // bordas: grade fina interna + contorno roxo fechando a seção.
    for (let r = start; r <= end; r++) for (let c = 1; c <= 4; c++) {
      ws.getCell(r, c).border = { top: r === start ? med : thin, bottom: r === end ? med : thin, left: c === 1 ? med : thin, right: c === 4 ? med : thin }
    }
    ws.addRow([])
  }

  const rTitulo = ws.addRow([`Relatório do simulado — ${sim?.titulo ?? '—'}`])
  ws.mergeCells(`A${rTitulo.number}:D${rTitulo.number}`)
  rTitulo.font = { bold: true, size: 15 }; rTitulo.height = 24
  ws.addRow([])

  const categoria = est?.classificacao === 'passaporte' ? 'Passaporte' : 'Estudante'
  secao('Aluno', () => {
    par('Nome', est?.nome ?? '—'); par('E-mail', est?.email ?? '—'); par('Telefone', est?.telefone ?? '—'); par('Categoria', categoria)
  })
  secao('Simulado', () => {
    par('Simulado', sim?.titulo ?? '—'); par('Status', String(s.status ?? '—')); par('Tentativa', `${s.tentativa_num ?? 1}ª`)
    par('Iniciado em', fmt(s.iniciado_em)); par('Finalizado em', fmt(s.finalizado_em))
    par('Tempo de prova', tempoMs ? dur(tempoMs) : '—'); par('Média por questão', tempoMs && respondidas ? dur(Math.round(tempoMs / respondidas)) : '—')
  })
  secao('Resultado', () => {
    par('Total de questões', String(totalQ)); par('Acertos', String(acertos)); par('Erros', String(erros))
    par('Em branco', String(emBranco)); par('% de acerto', `${pctAcerto}%`); par('Nota', s.nota != null ? Number(s.nota).toFixed(2) : '—')
  })
  if (porGrupo.length) secao('Por grupo', () => {
    cabTabela(['Grupo', 'Acertos', 'Total', '%'])
    for (const g of porGrupo) ws.addRow([g.nome, g.ac, g.tt, g.tt > 0 ? `${Math.round((g.ac / g.tt) * 100)}%` : '—'])
  })
  secao('Por disciplina', () => {
    cabTabela(['Disciplina', 'Acertos', 'Total', '%'])
    for (const d of porDisciplina) ws.addRow([d.nome, d.ac, d.tt, d.tt > 0 ? `${Math.round((d.ac / d.tt) * 100)}%` : '—'])
  })

  const buf = await wb.xlsx.writeBuffer()
  const nomeArq = `relatorio_${(est?.nome ?? 'aluno').replace(/[^\w]+/g, '_').toLowerCase()}_${(sim?.titulo ?? 'simulado').replace(/[^\w]+/g, '_').toLowerCase()}.xlsx`
  return new NextResponse(buf as any, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nomeArq}"`,
      'Cache-Control': 'no-store',
    },
  })
}
