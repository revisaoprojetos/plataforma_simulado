import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { fetchAllByIn } from '@/lib/supabase/fetch-all'
import { getGamConfig } from '@/lib/gamificacao'
import { calcularSequencia } from '@/lib/leitura/sequencia'

/**
 * Relatório COMPLETO de um aluno num módulo de desafio (Lei Seca/Jurisprudência) — para a área interna
 * do perfil. Reúne, para UM aluno (barato), as aulas feitas, a sequência (streak + dias, com os ajustes
 * manuais do suporte) e os registros de horário (ledger de XP). Dia de conclusão IMUTÁVEL vem do ledger
 * (`meta.dia`), que refazer não move — fonte única com o ranking (ver lib/leitura/ranking.ts).
 */

export interface AulaLinha {
  documentoId: string
  titulo: string
  lidaEm: string | null
  tempoSeg: number | null
  quizTotal: number
  respondidas: number
  acertos: number
  concluida: boolean
  gabaritada: boolean
  ultimaResposta: string | null
}
export interface DiaLinha { dia: string; origem: 'auto' | 'ajuste-add' | 'ajuste-remove' }
export interface RegistroLinha { quando: string; tipo: 'Quiz' | 'Leitura'; aula: string | null; dia: string | null; xp: number | null }

export interface DesafioDetalheAluno {
  modulo: { id: string; nome: string; area: string; capa: string | null; cor: string | null; icone: string | null }
  resumo: { aulasConcluidas: number; aulasGabaritadas: number; acertos: number; totalRespondidas: number; streakAtual: number; streakMaior: number; diasAtivos: number }
  aulas: AulaLinha[]
  dias: DiaLinha[]
  registros: RegistroLinha[]
}

export async function carregarDesafioDetalheAluno(tenantId: string, estudanteId: string, moduloId: string): Promise<DesafioDetalheAluno | null> {
  const svc = createAdminClient()

  // Módulo (pasta) — capa/cor/ícone p/ o cabeçalho. Tolerante às colunas opcionais.
  let moduloRow: any = null
  for (const cols of ['id, nome, folder_area, cor, icone, capa_url, capa_card_url', 'id, nome, folder_area, cor, icone, capa_url', 'id, nome, folder_area']) {
    const r = await svc.from('simulado_pastas').select(cols).eq('id', moduloId).eq('tenant_id', tenantId).maybeSingle()
    if (!r.error) { moduloRow = r.data; break }
  }
  if (!moduloRow) return null
  const modulo = {
    id: moduloId,
    nome: moduloRow.nome ?? 'Módulo',
    area: moduloRow.folder_area ?? 'leitura',
    capa: moduloRow.capa_card_url ?? moduloRow.capa_url ?? null,
    cor: moduloRow.cor ?? null,
    icone: moduloRow.icone ?? null,
  }

  // Aulas (documentos publicados) do módulo.
  const { data: docs } = await svc.from('simulado_documentos')
    .select('id, titulo, ordem').eq('tenant_id', tenantId).eq('pasta_id', moduloId).eq('deletado', false).eq('publicado', true)
    .order('ordem', { ascending: true })
  const aulaIds = (docs ?? []).map((d: any) => d.id)
  const tituloDoc = new Map<string, string>((docs ?? []).map((d: any) => [d.id, d.titulo || 'Aula']))

  // Fuso do tenant (para a sequência e os dias).
  let tz = 'America/Sao_Paulo'
  try { const cfg = await getGamConfig(svc, tenantId); tz = cfg?.timezone || tz } catch { /* gamificação ausente */ }
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: tz })
  const ontem = new Date(Date.parse(hoje + 'T00:00:00Z') - 86_400_000).toISOString().slice(0, 10)
  const diaDe = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: tz })

  const vazio: DesafioDetalheAluno = {
    modulo, resumo: { aulasConcluidas: 0, aulasGabaritadas: 0, acertos: 0, totalRespondidas: 0, streakAtual: 0, streakMaior: 0, diasAtivos: 0 },
    aulas: [], dias: [], registros: [],
  }
  if (!aulaIds.length) return vazio

  // Quiz do módulo, respostas + progresso + eventos (só deste aluno — barato), e os ajustes de sequência.
  const [quiz, resp, progresso, eventos] = await Promise.all([
    fetchAllByIn<{ documento_id: string; questao_id: string }>(aulaIds, (chunk) =>
      svc.from('simulado_documento_quiz_questoes').select('documento_id, questao_id').eq('tenant_id', tenantId).eq('deletado', false).in('documento_id', chunk).order('id')).catch(() => []),
    fetchAllByIn<{ documento_id: string; questao_id: string; correta: boolean; respondido_em: string | null }>(aulaIds, (chunk) =>
      svc.from('simulado_leitura_respostas').select('documento_id, questao_id, correta, respondido_em').eq('tenant_id', tenantId).eq('estudante_id', estudanteId).in('documento_id', chunk).order('id')).catch(() => []),
    svc.from('simulado_leitura_progresso').select('documento_id, concluido_em, tempo_seg').eq('tenant_id', tenantId).eq('estudante_id', estudanteId).in('documento_id', aulaIds).then((r) => r.data ?? [], () => []),
    svc.from('simulado_xp_eventos').select('ref_id, meta, xp, criado_em, origem').eq('tenant_id', tenantId).eq('estudante_id', estudanteId).eq('origem', 'leitura').order('criado_em', { ascending: false }).limit(500).then((r) => r.data ?? [], () => []),
  ])

  let overrides: Record<string, boolean> | undefined
  try {
    const { data: aj } = await svc.from('simulado_leitura_sequencia_ajuste').select('overrides').eq('tenant_id', tenantId).eq('modulo_id', moduloId).eq('estudante_id', estudanteId).maybeSingle()
    const o = (aj as { overrides?: unknown } | null)?.overrides
    if (o && typeof o === 'object') overrides = o as Record<string, boolean>
  } catch { /* migração pendente */ }

  // Quiz por documento + célula de respostas por documento.
  const quizPorDoc = new Map<string, Set<string>>()
  for (const q of quiz) (quizPorDoc.get(q.documento_id) ?? quizPorDoc.set(q.documento_id, new Set()).get(q.documento_id)!).add(q.questao_id)
  const cellPorDoc = new Map<string, { answered: Set<string>; correct: Set<string>; ultima: string | null }>()
  for (const r of resp) {
    const cell = cellPorDoc.get(r.documento_id) ?? cellPorDoc.set(r.documento_id, { answered: new Set(), correct: new Set(), ultima: null }).get(r.documento_id)!
    const q = quizPorDoc.get(r.documento_id)
    if (q && q.has(r.questao_id)) { cell.answered.add(r.questao_id); if (r.correta) cell.correct.add(r.questao_id) }
    if (r.respondido_em && (!cell.ultima || r.respondido_em > cell.ultima)) cell.ultima = r.respondido_em
  }
  const progPorDoc = new Map<string, { lidaEm: string | null; tempoSeg: number | null }>()
  for (const p of progresso as any[]) progPorDoc.set(p.documento_id, { lidaEm: p.concluido_em ?? null, tempoSeg: p.tempo_seg ?? null })

  const aulas: AulaLinha[] = []
  let aulasConcluidas = 0, aulasGabaritadas = 0, acertos = 0, totalRespondidas = 0
  const diasResp = new Set<string>()
  for (const id of aulaIds) {
    const q = quizPorDoc.get(id) ?? new Set<string>()
    const cell = cellPorDoc.get(id)
    const prog = progPorDoc.get(id)
    const respondidas = cell?.answered.size ?? 0
    const ac = cell?.correct.size ?? 0
    const concluida = q.size > 0 && [...q].every((qid) => cell?.answered.has(qid))
    const gabaritada = concluida && [...q].every((qid) => cell?.correct.has(qid))
    if (!prog?.lidaEm && respondidas === 0) continue // só aulas com atividade do aluno
    acertos += ac; totalRespondidas += respondidas
    if (concluida) { aulasConcluidas++; if (gabaritada) aulasGabaritadas++; if (cell?.ultima) diasResp.add(diaDe(cell.ultima)) }
    aulas.push({
      documentoId: id, titulo: tituloDoc.get(id) ?? 'Aula', lidaEm: prog?.lidaEm ?? null, tempoSeg: prog?.tempoSeg ?? null,
      quizTotal: q.size, respondidas, acertos: ac, concluida, gabaritada, ultimaResposta: cell?.ultima ?? null,
    })
  }

  // Dias de CONCLUSÃO imutáveis (ledger): meta.dia dos eventos de quiz desse módulo. Fallback: dias das respostas.
  let diasLedger: Set<string> | null = null
  const s = new Set<string>()
  for (const e of eventos as any[]) {
    if (!/^quiz:/.test(e.ref_id ?? '')) continue
    const d = e.meta?.dia, doc = e.meta?.documentoId
    if (d && doc && aulaIds.includes(doc)) s.add(d)
  }
  if (s.size) diasLedger = s
  const autoSet = diasLedger ?? diasResp
  const seq = calcularSequencia(autoSet, overrides, hoje, ontem)

  // Linha de dias: une os dias automáticos + chaves de override, marcando a origem.
  const diaSetTodos = new Set<string>([...autoSet, ...Object.keys(overrides ?? {})])
  const dias: DiaLinha[] = [...diaSetTodos].sort().map((d) => {
    const ov = overrides?.[d]
    if (ov === false) return { dia: d, origem: 'ajuste-remove' as const }
    if (ov === true && !autoSet.has(d)) return { dia: d, origem: 'ajuste-add' as const }
    return { dia: d, origem: 'auto' as const }
  })

  // Registros de horário (ledger de XP) — quando aconteceu, tipo, aula, dia contado e XP.
  // origem='leitura': ref_id `quiz:<doc>` = quiz; qualquer outro (doc "puro"/`leitura:`) = leitura da aula.
  const registros: RegistroLinha[] = (eventos as any[]).slice(0, 200).map((e) => ({
    quando: e.criado_em,
    tipo: /^quiz:/.test(e.ref_id ?? '') ? 'Quiz' : 'Leitura',
    aula: e.meta?.documentoId ? (tituloDoc.get(e.meta.documentoId) ?? null) : null,
    dia: e.meta?.dia ?? null,
    xp: e.xp ?? null,
  }))

  return {
    modulo,
    resumo: { aulasConcluidas, aulasGabaritadas, acertos, totalRespondidas, streakAtual: seq.streakAtual, streakMaior: seq.streakMaior, diasAtivos: seq.diasEfetivos.length },
    aulas, dias, registros,
  }
}
