import { createServiceClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { getCurrentTenantId } from '@/lib/tenant'
import { Voltar } from '@/components/admin/relatorios/voltar'
import { RelatorioEstudanteView, type DadosRelatorioEstudante } from './relatorio-estudante-view'
import { EstudantesLista, type ResumoEstudante } from './estudantes-lista'
import { montarRelatorioEstudante } from './_dados'

export default async function RelatorioEstudantesPage({ searchParams }: { searchParams: Promise<{ estudante?: string }> }) {
  const { estudante: estId } = await searchParams
  const svc = await createServiceClient()
  const tenantId = await getCurrentTenantId()

  // Pagina para trazer TODOS os estudantes (PostgREST trunca em ~1000/resposta).
  const estudantes = await fetchAll<any>(() => svc
    .from('simulado_estudantes').select('id, nome').eq('tenant_id', tenantId ?? '00000000-0000-0000-0000-000000000000').order('nome').order('id'))

  let dados: DadosRelatorioEstudante | null = null

  // Resumo de todos os estudantes (nº simulados, nota média, última atividade) para a listagem.
  let resumos: ResumoEstudante[] = []
  if (!estId) {
    const agg = new Map<string, { n: number; notas: number[]; ult: string | null }>()
    // Busca por tenant (não por lista de ids) para evitar URL gigante / erro 400 no `.in()`.
    const sess = await fetchAll<any>(() => svc.from('simulado_sessoes_prova')
      .select('estudante_id, nota, iniciado_em')
      .eq('tenant_id', tenantId ?? '00000000-0000-0000-0000-000000000000').eq('is_teste', false).eq('deletado', false).eq('status', 'finalizada')
      .order('estudante_id'))
    for (const s of sess) {
      const a = agg.get(s.estudante_id) ?? { n: 0, notas: [], ult: null }
      a.n++; if (s.nota != null) a.notas.push(Number(s.nota))
      if (s.iniciado_em && (!a.ult || s.iniciado_em > a.ult)) a.ult = s.iniciado_em
      agg.set(s.estudante_id, a)
    }
    resumos = estudantes.map((e: any) => {
      const a = agg.get(e.id)
      return { id: e.id, nome: e.nome ?? 'Estudante', simulados: a?.n ?? 0, notaMedia: a && a.notas.length ? a.notas.reduce((x, y) => x + y, 0) / a.notas.length : null, ultima: a?.ult ?? null }
    })
  }

  if (estId) {
    dados = await montarRelatorioEstudante(svc, estId, tenantId)
  }

  return (
    <div className="space-y-5">
      <div>
        {estId && <Voltar href="/admin/relatorios/estudantes" label="Todos os estudantes" />}
        <h1 className="text-2xl font-bold tracking-tight">Relatório por Estudante</h1>
        <p className="text-muted-foreground">{estId ? 'Evolução e desempenho vs. a turma.' : 'Todos os estudantes — clique num para ver a análise detalhada.'}</p>
      </div>

      {!estId ? (
        <EstudantesLista itens={resumos} />
      ) : dados ? (
        <RelatorioEstudanteView d={dados} />
      ) : (
        <p className="text-sm text-muted-foreground">Estudante não encontrado.</p>
      )}
    </div>
  )
}
