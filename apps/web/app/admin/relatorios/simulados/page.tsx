import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { tipoDoSimulado } from '@/lib/simulado/tipo'
import { SimuladoSelector } from './simulado-selector'
import { SimuladosLista } from './simulados-lista'
import { Voltar } from '@/components/admin/relatorios/voltar'
import { resumosSimulados } from '../_resumos'
import { RelatorioSimuladoView, type DadosRelatorioSimulado } from './relatorio-simulado-view'

const fmtDur = (min: number) => { const h = Math.floor(min / 60), m = Math.round(min % 60); return h > 0 ? `${h}h ${String(m).padStart(2, '0')}min` : `${m}min` }

export default async function RelatorioSimuladoPage({ searchParams }: { searchParams: Promise<{ simulado?: string }> }) {
  const { simulado: simId } = await searchParams
  const svc = await createServiceClient()
  const tenantId = await getCurrentTenantId()

  const { data: simulados } = await svc
    .from('simulado_simulados')
    .select('id, titulo')
    .eq('deletado', false)
    .eq('tenant_id', tenantId ?? '')
    .order('created_at', { ascending: false })

  let dados: DadosRelatorioSimulado | null = null
  const resumos = simId ? [] : await resumosSimulados(svc, tenantId)

  if (simId) {
    const alvo = (simulados ?? []).find((s: any) => s.id === simId)
    // Questões do simulado (ordem, tipo, disciplina).
    const { data: pq } = await svc
      .from('simulado_prova_questoes')
      .select('questao_id, ordem, questoes:simulado_questoes(id, tipo, disciplinas:simulado_disciplinas(nome))')
      .eq('simulado_id', simId).order('ordem')
    const ordemDeQ = new Map<string, number>()
    const discDeQ = new Map<string, string>()
    const tiposQ: (string | null)[] = []
    for (const r of (pq ?? []) as any[]) {
      const qid = r.questoes?.id ?? r.questao_id
      ordemDeQ.set(qid, r.ordem ?? 0)
      discDeQ.set(qid, r.questoes?.disciplinas?.nome ?? 'Sem disciplina')
      tiposQ.push(r.questoes?.tipo)
    }

    // Sessões reais (não teste) finalizadas ou não.
    const { data: sessoes } = await svc
      .from('simulado_sessoes_prova')
      .select('id, estudante_id, status, nota, iniciado_em, finalizado_em')
      .eq('simulado_id', simId).eq('is_teste', false).eq('deletado', false)
    const sess = (sessoes ?? []) as any[]
    const finalizadas = sess.filter((s) => s.status === 'finalizada')
    const sessIds = sess.map((s) => s.id)

    // Respostas de todas as sessões.
    const acPorSess = new Map<string, number>(), ttPorSess = new Map<string, number>()
    const acPorDisc = new Map<string, { ac: number; tt: number }>()
    const acPorQ = new Map<string, { ac: number; tt: number }>()
    if (sessIds.length) {
      const { data: resp } = await svc.from('simulado_respostas_objetivas').select('sessao_id, questao_id, correta').in('sessao_id', sessIds)
      for (const r of (resp ?? []) as any[]) {
        ttPorSess.set(r.sessao_id, (ttPorSess.get(r.sessao_id) ?? 0) + 1)
        if (r.correta) acPorSess.set(r.sessao_id, (acPorSess.get(r.sessao_id) ?? 0) + 1)
        const disc = discDeQ.get(r.questao_id) ?? 'Sem disciplina'
        const d = acPorDisc.get(disc) ?? { ac: 0, tt: 0 }; d.tt++; if (r.correta) d.ac++; acPorDisc.set(disc, d)
        const q = acPorQ.get(r.questao_id) ?? { ac: 0, tt: 0 }; q.tt++; if (r.correta) q.ac++; acPorQ.set(r.questao_id, q)
      }
    }

    // Nomes dos estudantes.
    const estIds = [...new Set(sess.map((s) => s.estudante_id).filter(Boolean))]
    const nomeEst = new Map<string, string>()
    if (estIds.length) {
      const { data: ests } = await svc.from('simulado_estudantes').select('id, nome').in('id', estIds)
      for (const e of (ests ?? []) as any[]) nomeEst.set(e.id, e.nome ?? 'Estudante')
    }

    // Métricas.
    const notas = finalizadas.map((s) => (s.nota != null ? Number(s.nota) : null)).filter((n): n is number => n != null)
    const notaMedia = notas.length ? notas.reduce((a, b) => a + b, 0) / notas.length : null
    const melhorNota = notas.length ? Math.max(...notas) : null
    let totAc = 0, totTt = 0
    for (const s of sess) { totAc += acPorSess.get(s.id) ?? 0; totTt += ttPorSess.get(s.id) ?? 0 }
    const acertoMedio = totTt > 0 ? Math.round((totAc / totTt) * 100) : null
    const temposMin = finalizadas.filter((s) => s.iniciado_em && s.finalizado_em)
      .map((s) => (new Date(s.finalizado_em).getTime() - new Date(s.iniciado_em).getTime()) / 60000).filter((m) => m >= 0)
    const tempoMedioMin = temposMin.length ? Math.round(temposMin.reduce((a, b) => a + b, 0) / temposMin.length) : null

    const porDisciplina = [...acPorDisc.entries()].map(([nome, v]) => ({ nome, ac: v.ac, tt: v.tt, pct: v.tt ? Math.round((v.ac / v.tt) * 100) : 0 })).sort((a, b) => b.pct - a.pct)
    const porQuestao = [...acPorQ.entries()].map(([qid, v]) => ({ rotulo: `Q${ordemDeQ.get(qid) != null ? (ordemDeQ.get(qid)! + 1) : '?'}`, ac: v.ac, tt: v.tt, pct: v.tt ? Math.round((v.ac / v.tt) * 100) : 0 }))
      .sort((a, b) => a.pct - b.pct).slice(0, 25)

    const faixas = [[0, 2], [2, 4], [4, 6], [6, 8], [8, 10.0001]]
    const distribuicao = faixas.map(([lo, hi]) => ({ faixa: `${lo}–${hi === 10.0001 ? 10 : hi}`, alunos: notas.filter((n) => n >= lo && n < hi).length }))

    const ranking = finalizadas.map((s) => {
      const ac = acPorSess.get(s.id) ?? 0, tt = ttPorSess.get(s.id) ?? 0
      const tempoMin = s.iniciado_em && s.finalizado_em ? (new Date(s.finalizado_em).getTime() - new Date(s.iniciado_em).getTime()) / 60000 : null
      return { nome: nomeEst.get(s.estudante_id) ?? 'Estudante', nota: s.nota != null ? Number(s.nota) : null, acerto: tt ? Math.round((ac / tt) * 100) : 0, tempo: tempoMin != null ? fmtDur(tempoMin) : '—' }
    }).sort((a, b) => (b.nota ?? -1) - (a.nota ?? -1) || b.acerto - a.acerto).map((r, i) => ({ pos: i + 1, ...r }))

    dados = {
      titulo: (alvo as any)?.titulo ?? 'Simulado', tipo: tipoDoSimulado(tiposQ),
      totalSessoes: sess.length, finalizadas: finalizadas.length, notaMedia, melhorNota, acertoMedio, tempoMedioMin,
      porDisciplina, porQuestao, distribuicao, ranking,
    }
  }

  return (
    <div className="space-y-5">
      <div>
        {simId && <Voltar href="/admin/relatorios/simulados" label="Todos os simulados" />}
        <h1 className="text-2xl font-bold tracking-tight">Relatório por Simulado</h1>
        <p className="text-muted-foreground">{simId ? 'Análise completa do simulado.' : 'Todos os simulados — clique num para ver a análise completa.'}</p>
      </div>

      {simId && <SimuladoSelector simulados={(simulados ?? []) as any} atual={simId} />}

      {!simId ? (
        <SimuladosLista itens={resumos} />
      ) : dados ? (
        <RelatorioSimuladoView d={dados} />
      ) : (
        <p className="text-sm text-muted-foreground">Simulado não encontrado.</p>
      )}
    </div>
  )
}
