import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { SemPermissao } from '@/components/ui/alert-box'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { remember, chaveRelatorio, TTL_RELATORIO } from '@/lib/cache/relatorio-cache'
import { formatBrt } from '@/lib/brt'
import { Star, TrendingUp, Minus, TrendingDown } from 'lucide-react'

export const dynamic = 'force-dynamic'

type Av = { nps: number; comentario: string | null; criado_em: string; simulado_id: string; estudante_id: string }

export default async function NpsPage() {
  const access = await getCurrentAccess()
  if (!(access.isAdmin || accessCan(access, 'relatorios:view'))) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">NPS — Satisfação</h1>
        <SemPermissao>Você não tem permissão para ver os relatórios.</SemPermissao>
      </div>
    )
  }

  const svc = createAdminClient()
  const tid = access.tenantId ?? '00000000-0000-0000-0000-000000000000'

  // Memoizado (recomputava a agregação a cada visita). Só busca os títulos dos simulados dos ≤40
  // comentários exibidos (antes buscava até 200 à toa). Payload compacto (agregados + comentários).
  type Coment = { nps: number; comentario: string | null; simuladoTitulo: string; criado_em: string }
  type Resultado = { total: number; promotores: number; neutros: number; detratores: number; nps: number | null; media: number | null; comentarios: Coment[] }
  let dados: Resultado | null = null
  let semTabela = false
  try {
    dados = await remember<Resultado>(chaveRelatorio(access.tenantId, 'nps'), TTL_RELATORIO, async () => {
      const avals = await fetchAll<Av>(() => svc.from('simulado_avaliacoes').select('nps, comentario, criado_em, simulado_id, estudante_id').eq('tenant_id', tid).order('criado_em', { ascending: false }))
      const total = avals.length
      const promotores = avals.filter((a) => a.nps >= 9).length
      const neutros = avals.filter((a) => a.nps >= 7 && a.nps <= 8).length
      const detratores = avals.filter((a) => a.nps <= 6).length
      const comentariosRaw = avals.filter((a) => (a.comentario ?? '').trim()).slice(0, 40)
      const simIds = [...new Set(comentariosRaw.map((a) => a.simulado_id))]
      const sims = simIds.length ? ((await svc.from('simulado_simulados').select('id, titulo').in('id', simIds)).data ?? []) : []
      const nomeSim = new Map<string, string>((sims as any[]).map((s) => [s.id, s.titulo]))
      return {
        total, promotores, neutros, detratores,
        nps: total ? Math.round(((promotores - detratores) / total) * 100) : null,
        media: total ? avals.reduce((s, a) => s + a.nps, 0) / total : null,
        comentarios: comentariosRaw.map((a) => ({ nps: a.nps, comentario: a.comentario, simuladoTitulo: nomeSim.get(a.simulado_id) ?? 'Simulado', criado_em: a.criado_em })),
      }
    })
  } catch { semTabela = true }

  const total = dados?.total ?? 0
  const nps = dados?.nps ?? null
  const media = dados?.media ?? null
  const promotores = dados?.promotores ?? 0
  const neutros = dados?.neutros ?? 0
  const detratores = dados?.detratores ?? 0
  const comentarios = dados?.comentarios ?? []
  const npsTone = nps == null ? 'text-muted-foreground' : nps >= 50 ? 'text-emerald-600 dark:text-emerald-400' : nps >= 0 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary"><Star className="h-5 w-5" /></span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">NPS — Satisfação do aluno</h1>
          <p className="text-muted-foreground">Avaliações que os alunos deixam ao concluir um simulado.</p>
        </div>
      </div>

      {semTabela ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-50/50 p-6 text-sm text-amber-800 dark:bg-amber-900/15 dark:text-amber-300">
          A tabela de avaliações ainda não foi criada. Rode <code className="rounded bg-black/10 px-1">scripts/sql/nps-avaliacoes.sql</code> no SQL Editor do Supabase.
        </div>
      ) : total === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">Nenhuma avaliação ainda.</div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border bg-card p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">NPS</p>
              <p className={`mt-1 text-4xl font-extrabold tabular-nums ${npsTone}`}>{nps}</p>
              <p className="text-[11px] text-muted-foreground">de −100 a +100 · média {media?.toFixed(1).replace('.', ',')}</p>
            </div>
            <Kpi icon={<TrendingUp className="h-4 w-4" />} label="Promotores (9–10)" valor={promotores} total={total} cor="text-emerald-600 dark:text-emerald-400" />
            <Kpi icon={<Minus className="h-4 w-4" />} label="Neutros (7–8)" valor={neutros} total={total} cor="text-amber-600 dark:text-amber-400" />
            <Kpi icon={<TrendingDown className="h-4 w-4" />} label="Detratores (0–6)" valor={detratores} total={total} cor="text-rose-600 dark:text-rose-400" />
          </div>

          <div className="rounded-2xl border bg-card shadow-sm">
            <div className="border-b px-4 py-3 text-sm font-semibold">Comentários recentes ({comentarios.length})</div>
            {comentarios.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">Nenhum comentário.</p>
            ) : (
              <ul className="divide-y">
                {comentarios.map((c, i) => (
                  <li key={i} className="flex items-start gap-3 p-4">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${c.nps >= 9 ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : c.nps >= 7 ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'}`}>{c.nps}</span>
                    <div className="min-w-0">
                      <p className="text-sm">{c.comentario}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{c.simuladoTitulo} · {formatBrt(c.criado_em)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function Kpi({ icon, label, valor, total, cor }: { icon: React.ReactNode; label: string; valor: number; total: number; cor: string }) {
  const pct = total ? Math.round((valor / total) * 100) : 0
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground"><span className={cor}>{icon}</span> {label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${cor}`}>{valor} <span className="text-sm font-medium text-muted-foreground">({pct}%)</span></p>
    </div>
  )
}
