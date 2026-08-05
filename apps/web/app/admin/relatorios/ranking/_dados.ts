import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { normalizarCriterios, idadeEmAnos, type CriteriosRanking, type EntradaRanking } from '@/lib/simulado/ranking'
import { remember, chaveRelatorio, TTL_RELATORIO } from '@/lib/cache/relatorio-cache'
import { rankingAgregadoSql } from 'data'

type GrupoBanco = { id: string; nome: string; disciplinas: string[] }
export type DadosRanking = {
  titulo: string
  grupos: { id: string; nome: string; count: number }[]
  totalQuestoes: number
  entradas: EntradaRanking[]
  criterios: CriteriosRanking
  afetados: number
}

/** Monta o ranking de um simulado (classificação + grupos + critérios + impactos).
 * Cacheado por tenant; a chave inclui o DIA — o desempate por idade muda no máx. 1x/ano. */
export async function montarRankingSimulado(svc: SupabaseClient, simId: string, tenantId: string | null, agoraIso: string): Promise<DadosRanking | null> {
  const dia = agoraIso.slice(0, 10)
  const tid = tenantId ?? '00000000-0000-0000-0000-000000000000'
  // Confere que o simulado é DO tenant (evita ranking cross-tenant por simId de outra plataforma).
  const { data: t } = await svc.from('simulado_simulados').select('tenant_id').eq('id', simId).eq('tenant_id', tid).maybeSingle()
  if (!t) return null
  return remember(chaveRelatorio(tenantId, 'ranking', simId, dia), TTL_RELATORIO, () => _montarRankingSimulado(svc, simId, tid, agoraIso))
}

async function _montarRankingSimulado(svc: SupabaseClient, simId: string, tid: string, agoraIso: string): Promise<DadosRanking | null> {
  const { data: sim } = await svc.from('simulado_simulados').select('titulo, regras').eq('id', simId).eq('tenant_id', tid).maybeSingle()
  if (!sim) return null
  const criterios: CriteriosRanking = normalizarCriterios((sim as any)?.regras?.ranking)

  // Questões do simulado + disciplina.
  const { data: pq } = await svc.from('simulado_prova_questoes')
    .select('questao_id, questoes:simulado_questoes(id, disciplinas:simulado_disciplinas(nome))').eq('simulado_id', simId).eq('tenant_id', tid)
  const discDeQ = new Map<string, string>()
  const qIds: string[] = []
  for (const r of (pq ?? []) as any[]) { const qid = r.questoes?.id ?? r.questao_id; qIds.push(qid); discDeQ.set(qid, r.questoes?.disciplinas?.nome ?? 'Sem disciplina') }

  // Banco (pasta) que cobre o simulado → grupos de disciplinas.
  let grupos: GrupoBanco[] = []
  if (qIds.length) {
    const { data: qp } = await svc.from('simulado_questao_pasta').select('questao_id, pasta_id').in('questao_id', qIds).eq('tenant_id', tid)
    const cont = new Map<string, number>()
    for (const r of (qp ?? []) as any[]) cont.set(r.pasta_id, (cont.get(r.pasta_id) ?? 0) + 1)
    const pastaIds = [...cont.keys()]
    if (pastaIds.length) {
      const { data: pastas } = await svc.from('simulado_pastas').select('id, grupos').in('id', pastaIds).eq('tenant_id', tid)
      const comGrupos = (pastas ?? []).filter((p: any) => Array.isArray(p.grupos) && p.grupos.length)
      const melhor = comGrupos.sort((a: any, b: any) => (cont.get(b.id) ?? 0) - (cont.get(a.id) ?? 0))[0]
      if (melhor) grupos = (melhor as any).grupos as GrupoBanco[]
    }
  }
  const grupoDaDisc = (d: string) => grupos.find((g) => g.disciplinas.includes(d))?.id ?? null
  const contGrupo = new Map<string, number>()
  for (const qid of qIds) { const gid = grupoDaDisc(discDeQ.get(qid) ?? ''); if (gid) contGrupo.set(gid, (contGrupo.get(gid) ?? 0) + 1) }
  const gruposView = grupos.map((g) => ({ id: g.id, nome: g.nome, count: contGrupo.get(g.id) ?? 0 }))

  // Aluno unificado (uma linha por aluno = melhor sessão). Preferimos o SQL AGREGADO (1 query,
  // agrega acertos/disciplina no banco) e caímos no PostgREST (sessões+respostas+estudantes) se
  // o SQL direto não estiver disponível.
  type Aluno = { estId: string; nome: string; email: string | null; classificacao: string | null; nasc: string | null; nota: number | null; dataIso: string | null; tempoSeg: number | null; acertos: number; total: number; porGrupo: Record<string, number> }
  const tempoDe = (ini: any, fim: any): number | null => { const a = ini ? new Date(ini).getTime() : null; const b = fim ? new Date(fim).getTime() : null; return a != null && b != null && b >= a ? Math.round((b - a) / 1000) : null }
  const isoDe = (v: any): string | null => (v == null ? null : v instanceof Date ? v.toISOString() : String(v))

  let alunos: Aluno[]
  const sqlRows = await rankingAgregadoSql(simId, tid)
  if (sqlRows) {
    alunos = sqlRows.map((r) => {
      const porGrupo: Record<string, number> = {}
      for (const [disc, ac] of Object.entries(r.por_disc ?? {})) { const gid = grupoDaDisc(disc); if (gid) porGrupo[gid] = (porGrupo[gid] ?? 0) + Number(ac) }
      return { estId: r.estudante_id, nome: r.nome ?? 'Estudante', email: r.email ?? null, classificacao: r.classificacao ?? null, nasc: r.data_nascimento ?? null, nota: r.nota != null ? Number(r.nota) : null, dataIso: isoDe(r.iniciado_em), tempoSeg: tempoDe(r.iniciado_em, r.finalizado_em), acertos: Number(r.acertos), total: Number(r.total), porGrupo }
    })
  } else {
    const sess = await fetchAll<any>(() => svc.from('simulado_sessoes_prova')
      .select('id, estudante_id, nota, status, iniciado_em, finalizado_em')
      .eq('simulado_id', simId).eq('tenant_id', tid).eq('is_teste', false).eq('deletado', false).eq('status', 'finalizada').order('id'))
    const melhorSess = new Map<string, any>()
    for (const s of sess) { const cur = melhorSess.get(s.estudante_id); if (!cur || (Number(s.nota ?? -1) > Number(cur.nota ?? -1))) melhorSess.set(s.estudante_id, s) }
    const sessEscolhidas = [...melhorSess.values()]
    const sessIds = sessEscolhidas.map((s) => s.id)
    const acTotal = new Map<string, number>(), ttTotal = new Map<string, number>(), acGrupo = new Map<string, Record<string, number>>()
    if (sessIds.length) {
      const resp = await fetchAllByIn<any>(sessIds, (chunk) =>
        svc.from('simulado_respostas_objetivas').select('sessao_id, questao_id, correta').in('sessao_id', chunk).eq('tenant_id', tid).order('id'))
      const estDaSess = new Map<string, string>(sessEscolhidas.map((s) => [s.id, s.estudante_id]))
      for (const r of resp as any[]) {
        const est = estDaSess.get(r.sessao_id); if (!est) continue
        ttTotal.set(est, (ttTotal.get(est) ?? 0) + 1)
        if (r.correta) { acTotal.set(est, (acTotal.get(est) ?? 0) + 1); const gid = grupoDaDisc(discDeQ.get(r.questao_id) ?? ''); if (gid) { const g = acGrupo.get(est) ?? {}; g[gid] = (g[gid] ?? 0) + 1; acGrupo.set(est, g) } }
      }
    }
    const estIds = sessEscolhidas.map((s) => s.estudante_id)
    const infoEst = new Map<string, any>()
    if (estIds.length) { const ests = await fetchAllByIn<any>(estIds, (chunk) => svc.from('simulado_estudantes').select('id, nome, email, classificacao, data_nascimento').in('id', chunk).eq('tenant_id', tid)); for (const e of ests) infoEst.set(e.id, e) }
    alunos = sessEscolhidas.map((s) => { const info = infoEst.get(s.estudante_id); return { estId: s.estudante_id, nome: info?.nome ?? 'Estudante', email: info?.email ?? null, classificacao: info?.classificacao ?? null, nasc: info?.data_nascimento ?? null, nota: s.nota != null ? Number(s.nota) : null, dataIso: isoDe(s.iniciado_em), tempoSeg: tempoDe(s.iniciado_em, s.finalizado_em), acertos: acTotal.get(s.estudante_id) ?? 0, total: ttTotal.get(s.estudante_id) ?? 0, porGrupo: acGrupo.get(s.estudante_id) ?? {} } })
  }

  // Impactos de anulação/troca (re-correção): nota_antes por estudante. Tabelas podem estar vazias.
  const impacto = new Map<string, number>()
  let afetados = 0
  const { data: recs } = await svc.from('simulado_recorrecoes').select('id').eq('simulado_id', simId).eq('tenant_id', tid)
  const recIds = (recs ?? []).map((r: any) => r.id)
  if (recIds.length) {
    const { data: imps } = await svc.from('simulado_recorrecao_impactos').select('estudante_id, nota_antes').in('recorrecao_id', recIds).eq('tenant_id', tid)
    for (const im of (imps ?? []) as any[]) { if (im.nota_antes != null && !impacto.has(im.estudante_id)) { impacto.set(im.estudante_id, Number(im.nota_antes)); afetados++ } }
  }

  const entradas: EntradaRanking[] = alunos.map((al) => {
    const pont = al.nota != null ? al.nota : al.acertos
    const afetado = impacto.has(al.estId)
    return {
      estudanteId: al.estId, nome: al.nome, email: al.email, data: al.dataIso,
      classificacao: al.classificacao,
      pontuacao: pont, pontuacaoSem: afetado ? impacto.get(al.estId)! : pont, afetado,
      acertos: al.acertos, total: al.total,
      porGrupo: al.porGrupo, passaporte: al.classificacao === 'passaporte', idade: idadeEmAnos(al.nasc, agoraIso),
      tempoSeg: al.tempoSeg,
    }
  })

  return { titulo: (sim as any)?.titulo ?? 'Simulado', grupos: gruposView, totalQuestoes: qIds.length, entradas, criterios, afetados }
}
