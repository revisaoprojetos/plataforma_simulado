import { createServiceClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { Radio } from 'lucide-react'
import { resolverVisualSimulados } from '@/lib/aluno/simulado-visual'
import { montarItensSimulado } from '@/lib/aluno/simulado-item'
import { SimuladosCatalogoAluno } from '@/components/aluno/simulados-catalogo-aluno'

export default async function SimuladoDisponivelPage() {
  const sessao = await getSessaoAluno()
  const svc = await createServiceClient()
  const estId = sessao!.estudanteId

  const [{ data: mats }, { data: acs }] = await Promise.all([
    svc.from('simulado_matriculas').select('simulado_id, liberado').eq('estudante_id', estId),
    svc.from('simulado_acessos').select('simulado_id, expira_em').eq('estudante_id', estId),
  ])
  const expiraPorSim = new Map<string, string | null>()
  for (const a of (acs ?? []) as any[]) {
    const atual = expiraPorSim.get(a.simulado_id)
    if (!atual || (a.expira_em && new Date(a.expira_em) > new Date(atual))) expiraPorSim.set(a.simulado_id, a.expira_em ?? null)
  }
  const ids = [...new Set([...(mats ?? []).filter((m: any) => m.liberado !== false).map((m: any) => m.simulado_id), ...(acs ?? []).map((a: any) => a.simulado_id)].filter(Boolean))]

  let sims: any[] = []
  const sessoesPorSim = new Map<string, any[]>()
  if (ids.length) {
    const [{ data: s }, { data: sess }] = await Promise.all([
      svc.from('simulado_simulados').select('id, titulo, modo_aplicacao, status, data_inicio, data_fim, embed_token, regras, created_at').in('id', ids).eq('deletado', false),
      svc.from('simulado_sessoes_prova').select('simulado_id, status').eq('estudante_id', estId).in('simulado_id', ids).eq('is_teste', false).eq('deletado', false),
    ])
    sims = s ?? []
    for (const x of (sess ?? []) as any[]) { const arr = sessoesPorSim.get(x.simulado_id) ?? []; arr.push(x); sessoesPorSim.set(x.simulado_id, arr) }
  }

  const visual = await resolverVisualSimulados(svc, sims.map((s) => ({ id: s.id, regras: s.regras })))

  const itens = montarItensSimulado(sims, sessoesPorSim, expiraPorSim, visual)
    .filter((i) => i.podeFazer || i.emAndamento || i.statusLabel === 'Agendado')
    // Mais recente → mais antigo (mesma antiguidade do catálogo do admin).
    .sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime())

  // Grupo (pasta is_folder do banco) de cada simulado → fileiras do catálogo. Tolerante ao schema:
  // se as colunas is_folder/pai_id não existirem, segue sem catálogo (o componente cai no grid).
  const grupoPorSim = new Map<string, string | null>()
  let grupos: { id: string; nome: string }[] = []
  try {
    const bancoIds = [...new Set(itens.map((i) => (i.regras as any)?.banco_base_id).filter(Boolean))] as string[]
    if (bancoIds.length) {
      const { data: bancosRows } = await svc.from('simulado_pastas').select('id, pai_id, is_folder').in('id', bancoIds)
      const paiIds = [...new Set((bancosRows ?? []).map((b: any) => b.pai_id).filter(Boolean))] as string[]
      const { data: paisRows } = paiIds.length
        ? await svc.from('simulado_pastas').select('id, nome, is_folder').in('id', paiIds)
        : { data: [] as any[] }
      const bancoById = new Map((bancosRows ?? []).map((b: any) => [b.id, b]))
      const paiById = new Map((paisRows ?? []).filter((p: any) => p.is_folder).map((p: any) => [p.id, p]))
      const usados = new Map<string, string>()
      for (const i of itens) {
        const bid = (i.regras as any)?.banco_base_id
        const b = bid ? bancoById.get(bid) : null
        const pai = b?.pai_id ? paiById.get(b.pai_id) : null
        const gid = pai ? (pai.id as string) : null
        grupoPorSim.set(i.id, gid)
        if (gid && pai) usados.set(gid, pai.nome as string)
      }
      grupos = [...usados.entries()].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome))
    }
  } catch { /* schema sem is_folder/pai_id → sem catálogo */ }

  const itensCat = itens.map((i) => ({ ...i, grupoId: grupoPorSim.get(i.id) ?? null }))

  if (itens.length === 0) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Simulados</h1>
          <p className="text-muted-foreground">Simulados liberados para você — disponíveis agora, agendados, com prazo ou abertos.</p>
        </div>
        <div className="rounded-2xl border border-dashed p-10 text-center">
          <Radio className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="text-muted-foreground">Nenhum simulado liberado no momento. Quando um for aberto (ou agendado), ele aparece aqui.</p>
        </div>
      </div>
    )
  }

  return <SimuladosCatalogoAluno itens={itensCat} grupos={grupos} />
}
