import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { listarMinhasEmissoes, abrirEmissao } from '@/app/aluno/(portal)/cronograma/emissoes-actions'
import { listarChecks } from '@/app/aluno/(portal)/cronograma/checks-actions'
import { cronogramasDoAluno } from '@/lib/cronograma/acesso'
import { fmtBr } from '@/lib/cronograma/datas'
import { faixaSemanal } from '@/lib/cronograma/faixa'
import type { Grade, MetaDatada, SemanaGrade } from '@/lib/cronograma/tipos'
import type { GoalType, MetaView, SemanaView, MeuView, BaseView, CronogramaData } from '@/lib/cronograma/nova-tipos'
export type { GoalType, MetaView, SemanaView, MeuView, BaseView, CronogramaData } from '@/lib/cronograma/nova-tipos'

// FASE 1 do novo Cronograma: transforma o SISTEMA REAL (emissões/grade/checks/bases) no formato que o
// design novo (components/brand/interna/cronograma/shared.tsx) consome. Backend-first: a página só LÊ isto.
// O design é porte fiel do gerador real, então os TIPOS das metas casam com as linhas da grade.

// Mapeia slug real → GoalType do design.
const SLUG_GOAL: Record<string, GoalType> = {
  aula: 'aula', pdfull: 'aula', videoaula: 'video', video: 'video', pdf: 'pdf', pdflash: 'flash',
  flashcards: 'flash', flash: 'flash', questoes: 'q', questao: 'q', q: 'q',
  legproc: 'lei', lei: 'lei', lei_seca: 'lei', revisao: 'rev', rev: 'rev',
}
export function goalDe(slug: string): GoalType { return SLUG_GOAL[(slug || '').toLowerCase()] ?? 'aula' }

// Linhas da grade (ordem fixa do design) + o GoalType que cada linha agrupa.
export const GRID_ROWS: { label: string; goals: GoalType[]; type: GoalType }[] = [
  { label: 'PDFULL + Videoaula', goals: ['aula', 'pdf', 'video'], type: 'aula' },
  { label: 'PDFLASH ou Flashcards', goals: ['flash'], type: 'flash' },
  { label: 'Resolução de questões', goals: ['q'], type: 'q' },
  { label: 'LEGPROC', goals: ['lei'], type: 'lei' },
]

const DIA_CURTO = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
const corVia = (via: string) => (via === 'pacote' ? '#5B3FD0' : via === 'matricula' ? '#3E7FE0' : via === 'avulso' ? '#1FA868' : via === 'testador' ? '#D99A1E' : '#8A8FA3')

/** Rótulo de dia pela DATA da meta (a grade é por dia real; metas sabem sua data). */
function rotuloDia(iso: string): { label: string; idx: number } {
  // fmtBr dá dd/mm; o índice do dia vem do dia da semana (0=Seg). Datas são civis UTC.
  const d = new Date(iso + 'T00:00:00Z')
  const wd = (d.getUTCDay() + 6) % 7 // 0=Seg … 6=Dom
  return { label: DIA_CURTO[wd], idx: wd }
}

function metaView(m: MetaDatada, emissaoId: string): MetaView {
  const { label, idx } = rotuloDia(m.data)
  const resolverHref = (m.qtdQuestoes ?? 0) > 0 ? `/aluno/cronograma/resolver/${m.id}?voltar=/aluno/cronograma` : null
  return { id: m.id, day: idx, dayLabel: label, type: goalDe(m.tipoDef?.slug || m.tipo), title: m.titulo, dur: m.duracao || '', resolverHref }
}

function semanaView(s: SemanaGrade, emissaoId: string): SemanaView {
  const range = `${fmtBr(s.inicio)} – ${fmtBr(s.fim)}`
  if (s.kind === 'revisao') return { n: s.numero, range, kind: 'revisao', metas: [], grid: [], dias: [], blocos: s.blocos }
  if (s.kind === 'recesso') return { n: s.numero, range, kind: 'recesso', metas: [], grid: [], dias: [] }
  const metas = s.metas.map((m) => metaView(m, emissaoId))
  // Dias presentes nesta semana (colunas), na ordem.
  const diasIdx = [...new Set(metas.map((m) => m.day))].sort((a, b) => a - b)
  const dias = diasIdx.map((i) => DIA_CURTO[i])
  // Grade: linha (GRID_ROWS) × dia → metas que casam o goal da linha naquele dia.
  const grid = GRID_ROWS.map((row) => diasIdx.map((di) => metas.filter((m) => m.day === di && row.goals.includes(m.type))))
  return { n: s.numero, range, kind: 'conteudo', metas, grid, dias }
}

/** Monta o CronogramaData real: meus + bases + plano (emissão ativa mais recente). */
export async function carregarCronogramaData(svc: SupabaseClient, tenantId: string, estId: string, emissaoAlvo?: string): Promise<CronogramaData> {
  // Meus (lista) — ativos + arquivados num payload só.
  const [ativosR, arqR] = await Promise.all([
    listarMinhasEmissoes({ porPagina: 100, arquivadas: false }),
    listarMinhasEmissoes({ porPagina: 100, arquivadas: true }),
  ])
  const ativos = ativosR.ok && ativosR.dados ? ativosR.dados.itens : []
  const arq = arqR.ok && arqR.dados ? arqR.dados.itens : []
  const totalAtivas = ativosR.ok && ativosR.dados ? ativosR.dados.ativas : ativos.length
  const totalArq = arqR.ok && arqR.dados ? arqR.dados.arquivadas : arq.length

  const toMeu = (e: any, status: 'ativo' | 'arq'): MeuView => {
    const r = e.resumo ?? {}
    const f = e.formulario ?? {}
    const d = new Date(e.criado_em)
    const base = `${e.cronograma_nome ?? 'Cronograma'}${r.subtitulo ? ` · ${r.subtitulo}` : ''}`
    const sub = f.inicio ? `começa ${fmtBr(f.inicio)}${r.totalSemanas ? ` · ${r.totalSemanas} semanas` : ''}` : (r.subtitulo ?? '')
    return { id: e.id, name: e.titulo || e.cronograma_nome || 'Cronograma', base, sub, date: fmtBr(d.toISOString().slice(0, 10)), hour: d.toTimeString().slice(0, 5), done: 0, total: r.totalSemanas ?? 0, status }
  }
  const meus: MeuView[] = [...ativos.map((e) => toMeu(e, 'ativo')), ...arq.map((e) => toMeu(e, 'arq'))]

  // Bases disponíveis (gerar).
  let bases: BaseView[] = []
  try {
    const cats = await cronogramasDoAluno(svc, tenantId, estId)
    bases = cats.map((c) => ({ id: c.id, title: c.nome, sub: `${c.subtitulo || `${c.total_semanas} semanas`}`, via: c.via, since: c.criado_em ? `desde ${fmtBr(String(c.criado_em).slice(0, 10))}` : '', cor: corVia(c.via) }))
  } catch { /* sem catálogo */ }

  // Plano aberto = emissão alvo, senão a ativa mais recente.
  const alvo = emissaoAlvo || ativos[0]?.id || null
  let plano: CronogramaData['plano'] = null
  if (alvo) {
    const [ab, checksR] = await Promise.all([abrirEmissao(alvo), listarChecks(alvo)])
    if (ab.ok && ab.dados) {
      const grade: Grade = ab.dados.grade
      const emi = ab.dados.emissao
      const checks: Record<string, boolean> = {}
      if (checksR.ok && checksR.checks) for (const id of Object.keys(checksR.checks)) checks[id] = true
      const semanas = (grade.semanas ?? []).map((s) => semanaView(s, alvo))
      const totalGoals = semanas.reduce((a, s) => a + s.metas.length, 0)
      const doneTotal = Object.keys(checks).length
      const hojeIso = new Date().toISOString().slice(0, 10)
      const atual = (grade.semanas ?? []).find((s) => s.inicio <= hojeIso && hojeIso <= s.fim)?.numero ?? 1
      const f = (emi.formulario ?? {}) as any
      const baseLabel = `${emi.cronograma_nome ?? ''}${grade.resumo?.subtitulo ? ` · ${grade.resumo.subtitulo}` : ''}`
      plano = {
        emissaoId: alvo, title: emi.titulo || emi.cronograma_nome || 'Meu cronograma', baseLabel,
        totalGoals, weeks: grade.resumo?.totalSemanas ?? semanas.length, currentWeek: atual,
        semanas, checks, doneTotal, indisponivel: !!ab.dados.indisponivel,
      }
    }
  }

  return {
    meus,
    meusFilter: { todos: `Todos · ${totalAtivas + totalArq}`, ativos: `Ativos · ${totalAtivas}`, arq: `Arquivados · ${totalArq}` },
    bases,
    plano,
  }
}
