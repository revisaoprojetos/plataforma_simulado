import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { Voltar } from '@/components/admin/relatorios/voltar'
import { RelatorioDisciplinaView, type DadosRelatorioDisciplina } from './relatorio-disciplina-view'
import { DisciplinasLista, type ResumoDisciplina } from './disciplinas-lista'
import { montarRelatorioDisciplina } from './_dados'

export default async function RelatorioDisciplinaPage({ searchParams }: { searchParams: Promise<{ disciplina?: string }> }) {
  const { disciplina: discId } = await searchParams
  const svc = await createServiceClient()
  const tenantId = await getCurrentTenantId()

  let dados: DadosRelatorioDisciplina | null = null

  // Resumo leve de todas as disciplinas (nº de questões e assuntos) para a listagem.
  let resumos: ResumoDisciplina[] = []
  if (!discId) {
    const { data: disciplinas } = await svc
      .from('simulado_disciplinas').select('id, nome').eq('tenant_id', tenantId ?? '').order('nome')
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
  } else {
    dados = await montarRelatorioDisciplina(svc, discId, tenantId)
  }

  return (
    <div className="space-y-5">
      <div>
        {discId && <Voltar href="/admin/relatorios/disciplinas" label="Todas as disciplinas" />}
        <h1 className="text-2xl font-bold tracking-tight">Relatório por Disciplina</h1>
        <p className="text-muted-foreground">{discId ? 'Desempenho da turma na disciplina.' : 'Todas as disciplinas — clique numa para ver o desempenho da turma.'}</p>
      </div>

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
