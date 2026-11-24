import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { remember, chaveRelatorio, TTL_RELATORIO } from '@/lib/cache/relatorio-cache'
import { Voltar } from '@/components/admin/relatorios/voltar'
import { RelatorioDisciplinaView, type DadosRelatorioDisciplina } from './relatorio-disciplina-view'
import { DisciplinasLista, type ResumoDisciplina } from './disciplinas-lista'
import { montarRelatorioDisciplina } from './_dados'
import { CabecalhoArea } from '@/components/admin/cabecalho-area'
import { resumosDisciplinasSql } from '@/lib/relatorios/agregados-sql'

export default async function RelatorioDisciplinaPage({ searchParams }: { searchParams: Promise<{ disciplina?: string }> }) {
  const { disciplina: discId } = await searchParams
  const svc = await createServiceClient()
  const tenantId = await getCurrentTenantId()

  let dados: DadosRelatorioDisciplina | null = null

  // Resumo leve de todas as disciplinas (nº de questões e assuntos) para a listagem.
  // Memoizado (recomputava a cada visita) e com fetchAll (antes truncava em 1000 → contagem errada).
  const tid = tenantId ?? '00000000-0000-0000-0000-000000000000'
  let resumos: ResumoDisciplina[] = []
  if (!discId) {
    resumos = await remember<ResumoDisciplina[]>(chaveRelatorio(tenantId, 'disciplinas', 'resumos'), TTL_RELATORIO, async () => {
      // GROUP BY/count(distinct) no banco (antes: fetchAll de todas as questões do tenant).
      const viaSql = await resumosDisciplinasSql(tid)
      if (viaSql) return viaSql
      const { data: disciplinas } = await svc.from('simulado_disciplinas').select('id, nome').eq('tenant_id', tid).order('nome')
      const qs = await fetchAll<{ disciplina_id: string | null; assunto_id: string | null }>(() =>
        svc.from('simulado_questoes').select('disciplina_id, assunto_id').eq('tenant_id', tid).eq('deletado', false).order('id', { ascending: true }))
      const contQ = new Map<string, number>()
      const assuntos = new Map<string, Set<string>>()
      for (const r of qs) {
        if (!r.disciplina_id) continue
        contQ.set(r.disciplina_id, (contQ.get(r.disciplina_id) ?? 0) + 1)
        if (r.assunto_id) { const s = assuntos.get(r.disciplina_id) ?? new Set<string>(); s.add(r.assunto_id); assuntos.set(r.disciplina_id, s) }
      }
      return (disciplinas ?? []).map((d: any) => ({ id: d.id, nome: d.nome ?? 'Disciplina', questoes: contQ.get(d.id) ?? 0, assuntos: assuntos.get(d.id)?.size ?? 0 }))
    })
  } else {
    dados = await montarRelatorioDisciplina(svc, discId, tenantId)
  }

  return (
    <div className="space-y-5">
      {discId && <Voltar href="/admin/relatorios/disciplinas" label="Todas as disciplinas" />}
      <CabecalhoArea titulo="Relatório por Disciplina" descricao={discId ? 'Desempenho da turma na disciplina.' : 'Todas as disciplinas — clique numa para ver o desempenho da turma.'} />
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
