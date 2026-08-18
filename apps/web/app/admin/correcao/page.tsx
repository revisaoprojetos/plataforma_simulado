import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { Card, CardContent } from '@/components/ui/card'
import { SecaoHeader } from '@/components/admin/secao-header'
import { Inbox, PenLine, ClipboardCheck, ArrowRight } from 'lucide-react'
import { SemPermissao } from '@/components/ui/alert-box'

export const dynamic = 'force-dynamic'

const ZERO = '00000000-0000-0000-0000-000000000000'

/** Correção discursiva — grid de CARDS por simulado. Clicar abre os alunos que fizeram. */
export default async function CorrecaoPage() {
  const access = await getCurrentAccess()
  const pode = access.isAdmin
    || access.permissions.includes('correcao:view') || access.permissions.includes('correcao:corrigir')
    || access.permissions.includes('questoes:view') || access.permissions.includes('questoes:update')
  if (!pode) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Correção de discursivas</h1>
        <SemPermissao>Sem permissão para corrigir.</SemPermissao>
      </div>
    )
  }

  const svc = createAdminClient()
  const tenantId = access.tenantId ?? ZERO

  // 1) Questões discursivas do tenant → 2) simulados OFICIAIS que as usam.
  const qd = await fetchAll<any>(() => svc.from('simulado_questoes').select('id').eq('tenant_id', tenantId).eq('tipo', 'discursiva').order('id'))
  const qdIds = qd.map((q) => q.id)
  let sims: any[] = []
  if (qdIds.length) {
    const pq = await fetchAllByIn<any>(qdIds, (c) => svc.from('simulado_prova_questoes').select('simulado_id').in('questao_id', c))
    const simIds = [...new Set(pq.map((p) => p.simulado_id).filter(Boolean))] as string[]
    if (simIds.length) {
      const rows = await fetchAllByIn<any>(simIds, (c) => svc.from('simulado_simulados').select('id, titulo, status, owner_estudante_id, deletado').in('id', c))
      sims = rows.filter((s) => !s.owner_estudante_id && !s.deletado)
    }
  }

  // 3) Contagem de respostas discursivas por simulado (via sessão) → pendentes/corrigidas.
  const cont = new Map<string, { pend: number; corr: number }>()
  if (sims.length) {
    const resp = await fetchAll<any>(() => svc.from('simulado_respostas_discursivas').select('id, sessao_id, status').eq('tenant_id', tenantId).order('id'))
    const sessIds = [...new Set(resp.map((r) => r.sessao_id).filter(Boolean))] as string[]
    const sess = sessIds.length ? await fetchAllByIn<any>(sessIds, (c) => svc.from('simulado_sessoes_prova').select('id, simulado_id, is_teste, deletado').in('id', c)) : []
    const sessToSim = new Map(sess.filter((s) => !s.is_teste && !s.deletado).map((s) => [s.id, s.simulado_id]))
    for (const r of resp) {
      const sim = sessToSim.get(r.sessao_id)
      if (!sim) continue
      const c = cont.get(sim) ?? { pend: 0, corr: 0 }
      if (r.status === 'corrigida') c.corr++
      else c.pend++
      cont.set(sim, c)
    }
  }

  const cards = sims
    .map((s) => ({ id: s.id, titulo: s.titulo as string, status: s.status as string, pend: cont.get(s.id)?.pend ?? 0, corr: cont.get(s.id)?.corr ?? 0 }))
    .sort((a, b) => b.pend - a.pend || a.titulo.localeCompare(b.titulo, 'pt-BR'))
  const totalPend = cards.reduce((n, c) => n + c.pend, 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Correção de discursivas</h1>
        <p className="text-muted-foreground">{cards.length} simulado(s) discursivo(s) · {totalPend} resposta(s) pendente(s).</p>
      </div>

      <Card className="overflow-hidden" style={{ ['--card-spacing' as any]: '0px' }}>
        <SecaoHeader icon={ClipboardCheck} titulo="Simulados discursivos" subtitulo="Escolha um simulado para corrigir" />
        <CardContent className="px-4 py-4">
          {cards.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
              <Inbox className="h-8 w-8" />
              <p className="text-sm">Nenhum simulado discursivo por aqui ainda.</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {cards.map((c) => (
                <Link key={c.id} href={`/admin/correcao/simulado/${c.id}`}
                  className="group flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
                  <div className="flex items-start justify-between gap-2">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><PenLine className="h-4 w-4" /></span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </div>
                  <h3 className="line-clamp-2 text-sm font-semibold leading-snug">{c.titulo}</h3>
                  <div className="mt-auto flex flex-wrap items-center gap-1.5">
                    {c.pend > 0
                      ? <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400">{c.pend} pendente{c.pend === 1 ? '' : 's'}</span>
                      : <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">Em dia</span>}
                    {c.corr > 0 && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{c.corr} corrigida{c.corr === 1 ? '' : 's'}</span>}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
