import { createServiceClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { remember, chaveRelatorio, TTL_RELATORIO } from '@/lib/cache/relatorio-cache'
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
  let agregados: Record<string, AgregadoEstudante> = {}

  if (estId) {
    dados = await montarRelatorioEstudante(svc, estId, tenantId)
  } else {
    // Agregado por estudante = varredura de TODAS as sessões finalizadas do tenant. Antes rodava
    // a cada visita à lista; agora fica MEMOIZADO no Redis (TTL) — no cache-hit não toca no banco.
    // Degrada sozinho sem Redis (computa direto). Mesma cadeia dos demais relatórios.
    const [batch, agg] = await Promise.all([
      carregarLoteEstudantes(0, PRIMEIRA_PAGINA),
      remember<Record<string, AgregadoEstudante>>(chaveRelatorio(tenantId, 'estudantes', 'agregados'), TTL_RELATORIO, async () => {
        const sess = await fetchAll<any>(() => svc.from('simulado_sessoes_prova')
          .select('estudante_id, nota, iniciado_em')
          .eq('tenant_id', tid).eq('is_teste', false).eq('deletado', false).eq('status', 'finalizada')
          .order('estudante_id'))
        const acc = new Map<string, { n: number; soma: number; cnt: number; ult: string | null }>()
        for (const s of sess) {
          const a = acc.get(s.estudante_id) ?? { n: 0, soma: 0, cnt: 0, ult: null }
          a.n++
          if (s.nota != null) { a.soma += Number(s.nota); a.cnt++ }
          if (s.iniciado_em && (!a.ult || s.iniciado_em > a.ult)) a.ult = s.iniciado_em
          acc.set(s.estudante_id, a)
        }
        const out: Record<string, AgregadoEstudante> = {}
        for (const [id, a] of acc) out[id] = { simulados: a.n, notaMedia: a.cnt ? a.soma / a.cnt : null, ultima: a.ult }
        return out
      }),
    ])
    inicial = batch.rows
    total = batch.total
    agregados = agg
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
        <RelatorioEstudanteView d={dados} historicoHrefBase={`/admin/estudantes/${estId}/simulado`} />
      ) : (
        <p className="text-sm text-muted-foreground">Estudante não encontrado.</p>
      )}
    </div>
  )
}
