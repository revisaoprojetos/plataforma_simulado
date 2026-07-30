import { createServiceClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { getCurrentTenantId } from '@/lib/tenant'
import { Voltar } from '@/components/admin/relatorios/voltar'
import { RelatorioEstudanteView, type DadosRelatorioEstudante } from './relatorio-estudante-view'
import { EstudantesLista, type AgregadoEstudante } from './estudantes-lista'
import { montarRelatorioEstudante } from './_dados'
import { carregarLoteEstudantes, type EstudanteBase } from '@/app/admin/estudantes/actions'

const PRIMEIRA_PAGINA = 30

export default async function RelatorioEstudantesPage({ searchParams }: { searchParams: Promise<{ estudante?: string }> }) {
  const { estudante: estId } = await searchParams
  const svc = await createServiceClient()
  const tenantId = await getCurrentTenantId()
  const tid = tenantId ?? '00000000-0000-0000-0000-000000000000'

  // Detalhe de um estudante — inalterado.
  let dados: DadosRelatorioEstudante | null = null
  // Lista: primeiros estudantes (rápido) + mapa de agregados de sessão; o resto carrega no cliente.
  let inicial: EstudanteBase[] = []
  let total = 0
  const agregados: Record<string, AgregadoEstudante> = {}

  if (estId) {
    dados = await montarRelatorioEstudante(svc, estId, tenantId)
  } else {
    const [batch, sess] = await Promise.all([
      carregarLoteEstudantes(0, PRIMEIRA_PAGINA),
      // Sessões finalizadas (sem teste) do tenant — poucas linhas; agregado calculado 1 vez.
      fetchAll<any>(() => svc.from('simulado_sessoes_prova')
        .select('estudante_id, nota, iniciado_em')
        .eq('tenant_id', tid).eq('is_teste', false).eq('deletado', false).eq('status', 'finalizada')
        .order('estudante_id')),
    ])
    inicial = batch.rows
    total = batch.total
    const agg = new Map<string, { n: number; soma: number; cnt: number; ult: string | null }>()
    for (const s of sess) {
      const a = agg.get(s.estudante_id) ?? { n: 0, soma: 0, cnt: 0, ult: null }
      a.n++
      if (s.nota != null) { a.soma += Number(s.nota); a.cnt++ }
      if (s.iniciado_em && (!a.ult || s.iniciado_em > a.ult)) a.ult = s.iniciado_em
      agg.set(s.estudante_id, a)
    }
    for (const [id, a] of agg) agregados[id] = { simulados: a.n, notaMedia: a.cnt ? a.soma / a.cnt : null, ultima: a.ult }
  }

  return (
    <div className="space-y-5">
      <div>
        {estId && <Voltar href="/admin/relatorios/estudantes" label="Todos os estudantes" />}
        <h1 className="text-2xl font-bold tracking-tight">Relatório por Estudante</h1>
        <p className="text-muted-foreground">{estId ? 'Evolução e desempenho vs. a turma.' : 'Todos os estudantes — clique num para ver a análise detalhada.'}</p>
      </div>

      {!estId ? (
        <EstudantesLista inicial={inicial} agregados={agregados} total={total} />
      ) : dados ? (
        <RelatorioEstudanteView d={dados} />
      ) : (
        <p className="text-sm text-muted-foreground">Estudante não encontrado.</p>
      )}
    </div>
  )
}
