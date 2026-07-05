import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { Seletor } from '@/components/admin/relatorios/seletor'
import { Voltar } from '@/components/admin/relatorios/voltar'
import { RelatorioDisciplinaView, type DadosRelatorioDisciplina } from './relatorio-disciplina-view'
import { DisciplinasLista, type ResumoDisciplina } from './disciplinas-lista'

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

export default async function RelatorioDisciplinaPage({ searchParams }: { searchParams: Promise<{ disciplina?: string }> }) {
  const { disciplina: discId } = await searchParams
  const svc = await createServiceClient()
  const tenantId = await getCurrentTenantId()

  const { data: disciplinas } = await svc
    .from('simulado_disciplinas').select('id, nome').eq('tenant_id', tenantId ?? '').order('nome')

  let dados: DadosRelatorioDisciplina | null = null

  // Resumo leve de todas as disciplinas (nº de questões e assuntos) para a listagem.
  let resumos: ResumoDisciplina[] = []
  if (!discId) {
    const { data: qs } = await svc.from('simulado_questoes')
      .select('disciplina_id, assunto_id').eq('tenant_id', tenantId ?? '').eq('deletado', false)
    const contQ = new Map<string, number>()
    const assuntos = new Map<string, Set<string>>()
    for (const r of (qs ?? []) as any[]) {
      if (!r.disciplina_id) continue
      contQ.set(r.disciplina_id, (contQ.get(r.disciplina_id) ?? 0) + 1)
      if (r.assunto_id) { const s = assuntos.get(r.disciplina_id) ?? new Set<string>(); s.add(r.assunto_id); assuntos.set(r.disciplina_id, s) }
    }
    resumos = (disciplinas ?? []).map((d: any) => ({ id: d.id, nome: d.nome ?? 'Disciplina', questoes: contQ.get(d.id) ?? 0, assuntos: assuntos.get(d.id)?.size ?? 0 }))
  }

  if (discId) {
    const alvo = (disciplinas ?? []).find((x: any) => x.id === discId)
    // Questões da disciplina.
    const { data: qs } = await svc.from('simulado_questoes')
      .select('id, assunto_id').eq('disciplina_id', discId).eq('deletado', false)
    const qIds = (qs ?? []).map((q: any) => q.id)
    const assuntoDeQ = new Map<string, string | null>((qs ?? []).map((q: any) => [q.id, q.assunto_id]))

    const acPorSim = new Map<string, { ac: number; tt: number }>()
    const acPorAssunto = new Map<string, { ac: number; tt: number }>()
    const acPorMes = new Map<string, { ac: number; tt: number }>()
    const estudantes = new Set<string>()
    let totAc = 0, totTt = 0

    if (qIds.length) {
      const { data: resp } = await svc.from('simulado_respostas_objetivas').select('sessao_id, questao_id, correta').in('questao_id', qIds)
      const respArr = (resp ?? []) as any[]
      const sessIds = [...new Set(respArr.map((r) => r.sessao_id))]
      const sessInfo = new Map<string, { simulado_id: string; estudante_id: string; data: string | null; teste: boolean }>()
      if (sessIds.length) {
        const { data: sess } = await svc.from('simulado_sessoes_prova').select('id, simulado_id, estudante_id, iniciado_em, is_teste, deletado').in('id', sessIds)
        for (const s of (sess ?? []) as any[]) if (!s.deletado) sessInfo.set(s.id, { simulado_id: s.simulado_id, estudante_id: s.estudante_id, data: s.iniciado_em, teste: !!s.is_teste })
      }
      for (const r of respArr) {
        const si = sessInfo.get(r.sessao_id); if (!si || si.teste) continue // só sessões reais
        totTt++; if (r.correta) totAc++
        estudantes.add(si.estudante_id)
        const bumpMap = (m: Map<string, { ac: number; tt: number }>, k: string) => { const v = m.get(k) ?? { ac: 0, tt: 0 }; v.tt++; if (r.correta) v.ac++; m.set(k, v) }
        bumpMap(acPorSim, si.simulado_id)
        bumpMap(acPorAssunto, assuntoDeQ.get(r.questao_id) ?? '—')
        if (si.data) { const dt = new Date(si.data); bumpMap(acPorMes, `${dt.getFullYear()}-${String(dt.getMonth()).padStart(2, '0')}`) }
      }
    }

    // Nomes de simulados e assuntos.
    const simTitulo = new Map<string, string>()
    const simIds = [...acPorSim.keys()]
    if (simIds.length) { const { data: sims } = await svc.from('simulado_simulados').select('id, titulo').in('id', simIds); for (const s of (sims ?? []) as any[]) simTitulo.set(s.id, s.titulo) }
    const assuntoNome = new Map<string, string>()
    const assuntoIds = [...acPorAssunto.keys()].filter((k) => k !== '—')
    if (assuntoIds.length) { const { data: ass } = await svc.from('simulado_assuntos').select('id, nome').in('id', assuntoIds); for (const a of (ass ?? []) as any[]) assuntoNome.set(a.id, a.nome) }

    const pct = (v: { ac: number; tt: number }) => (v.tt ? Math.round((v.ac / v.tt) * 100) : 0)
    const porSimulado = [...acPorSim.entries()].map(([id, v]) => ({ titulo: simTitulo.get(id) ?? '—', pct: pct(v), ac: v.ac, tt: v.tt })).sort((a, b) => b.tt - a.tt)
    const porAssunto = [...acPorAssunto.entries()].map(([id, v]) => ({ nome: id === '—' ? 'Sem assunto' : (assuntoNome.get(id) ?? 'Sem assunto'), pct: pct(v), ac: v.ac, tt: v.tt })).sort((a, b) => b.tt - a.tt).slice(0, 20)
    const evolucao = [...acPorMes.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => { const [y, m] = k.split('-'); return { mes: `${MESES[Number(m)]}/${y.slice(2)}`, pct: pct(v) } })

    dados = {
      nome: (alvo as any)?.nome ?? 'Disciplina',
      totalQuestoes: qIds.length, respostas: totTt, acertoPct: totTt ? Math.round((totAc / totTt) * 100) : null,
      numSimulados: acPorSim.size, numEstudantes: estudantes.size, porSimulado, porAssunto, evolucao,
    }
  }

  return (
    <div className="space-y-5">
      <div>
        {discId && <Voltar href="/admin/relatorios/disciplinas" label="Todas as disciplinas" />}
        <h1 className="text-2xl font-bold tracking-tight">Relatório por Disciplina</h1>
        <p className="text-muted-foreground">{discId ? 'Desempenho da turma na disciplina.' : 'Todas as disciplinas — clique numa para ver o desempenho da turma.'}</p>
      </div>

      {discId && <Seletor opcoes={(disciplinas ?? []) as any} atual={discId} param="disciplina" base="/admin/relatorios/disciplinas" placeholder="Trocar de disciplina…" />}

      {!discId ? (
        <DisciplinasLista itens={resumos} />
      ) : dados ? (
        <RelatorioDisciplinaView d={dados} />
      ) : (
        <p className="text-sm text-muted-foreground">Disciplina não encontrada.</p>
      )}
    </div>
  )
}
