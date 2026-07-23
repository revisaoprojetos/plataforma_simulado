import { createServiceClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { Radio } from 'lucide-react'
import { cn } from '@/lib/utils'
import { resolverVisualSimulados } from '@/lib/aluno/simulado-visual'
import { montarItensSimulado } from '@/lib/aluno/simulado-item'
import { CardSimulado } from '@/components/aluno/card-simulado'

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

  // Seções: Agendados (janela fixa) em cima, Disponíveis no meio, Para refazer embaixo.
  const buckets: Record<string, any[]> = { agendados: [], disponiveis: [], refazer: [] }
  for (const i of itens) {
    const b = i.emAndamento
      ? (i.modo_aplicacao === 'janela_fixa' ? 'agendados' : 'disponiveis')
      : i.refazer ? 'refazer' : (i.modo_aplicacao === 'janela_fixa' ? 'agendados' : 'disponiveis')
    buckets[b].push(i)
  }
  const SECOES = [
    { chave: 'agendados', titulo: 'Agendados', cor: 'bg-amber-500', vazio: 'Nenhum simulado agendado' },
    { chave: 'disponiveis', titulo: 'Disponíveis', cor: 'bg-emerald-500', vazio: 'Nenhum simulado disponível no momento' },
    { chave: 'refazer', titulo: 'Já concluídos', cor: 'bg-sky-500', vazio: 'Nenhum concluído ainda' },
  ]

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Simulados</h1>
        <p className="text-muted-foreground">Simulados liberados para você — disponíveis agora, agendados, com prazo ou abertos.</p>
      </div>

      {itens.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center">
          <Radio className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="text-muted-foreground">Nenhum simulado liberado no momento. Quando um for aberto (ou agendado), ele aparece aqui.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {SECOES.map((sec) => {
            const arr = buckets[sec.chave]
            return (
              <section key={sec.chave} className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className={cn('h-2.5 w-2.5 rounded-full', sec.cor)} />
                  <h2 className="font-semibold">{sec.titulo}</h2>
                  <span className="text-sm text-muted-foreground">({arr.length})</span>
                </div>
                {arr.length === 0 ? (
                  <p className="text-sm italic text-muted-foreground">{sec.vazio}</p>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    {arr.map((s) => <CardSimulado key={s.id} s={s} />)}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
