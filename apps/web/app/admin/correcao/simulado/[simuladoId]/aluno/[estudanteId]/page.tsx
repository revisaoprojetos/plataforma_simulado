import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { Card, CardContent } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { SecaoHeader } from '@/components/admin/secao-header'
import { ArrowLeft, PenLine, ClipboardList, Images, CheckCircle2, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatBrt } from '@/lib/brt'

export const dynamic = 'force-dynamic'
const ZERO = '00000000-0000-0000-0000-000000000000'

/** Área do ALUNO: as tentativas dele neste simulado. Clicar numa tentativa abre a correção unificada. */
export default async function CorrecaoAlunoPage({ params }: { params: Promise<{ simuladoId: string; estudanteId: string }> }) {
  const { simuladoId, estudanteId } = await params
  const access = await getCurrentAccess()
  const svc = createAdminClient()
  const tenantId = access.tenantId ?? ZERO

  const [{ data: estudante }, { data: sim }, sessoes] = await Promise.all([
    svc.from('simulado_estudantes').select('nome, email').eq('id', estudanteId).eq('tenant_id', tenantId).maybeSingle(),
    svc.from('simulado_simulados').select('id, titulo').eq('id', simuladoId).eq('tenant_id', tenantId).maybeSingle(),
    fetchAll<any>(() => svc.from('simulado_sessoes_prova').select('id, is_teste, deletado, finalizado_em, iniciado_em, tentativa_num')
      .eq('simulado_id', simuladoId).eq('estudante_id', estudanteId).eq('tenant_id', tenantId).order('id')),
  ])
  if (!estudante || !sim) notFound()

  const sessValidas = sessoes.filter((s) => !s.is_teste && !s.deletado)
  const sessIds = sessValidas.map((s) => s.id)

  const resp = sessIds.length
    ? await fetchAllByIn<any>(sessIds, (c) => svc.from('simulado_respostas_discursivas').select('id, sessao_id, status').in('sessao_id', c))
    : []
  if (!resp.length) notFound()

  const respIds = resp.map((r) => r.id)
  const paginas = await (async () => { try { return respIds.length ? await fetchAllByIn<any>(respIds, (c) => svc.from('simulado_resposta_arquivos').select('resposta_id').in('resposta_id', c)) : [] } catch { return [] as any[] } })()
  const pagCount = new Map<string, number>()
  for (const p of paginas as any[]) pagCount.set(p.resposta_id, (pagCount.get(p.resposta_id) ?? 0) + 1)

  const porSessao = new Map<string, any[]>()
  for (const r of resp) { const a = porSessao.get(r.sessao_id) ?? []; a.push(r); porSessao.set(r.sessao_id, a) }

  const varias = [...porSessao.keys()].length > 1
  const tentativas = sessValidas
    .filter((s) => porSessao.has(s.id))
    .map((s) => {
      const rs = porSessao.get(s.id)!
      const corr = rs.filter((r) => r.status === 'corrigida').length
      return {
        sessaoId: s.id,
        tentativa: s.tentativa_num ?? null,
        quando: s.finalizado_em ?? s.iniciado_em ?? null,
        total: rs.length,
        corr,
        pend: rs.length - corr,
        emCorr: rs.some((r) => r.status === 'em_correcao'),
        fotos: rs.reduce((n, r) => n + (pagCount.get(r.id) ?? 0), 0),
      }
    })
    .sort((a, b) => String(b.quando ?? '').localeCompare(String(a.quando ?? '')))

  const voltarUrl = `/admin/correcao/simulado/${simuladoId}`
  const totalPend = tentativas.reduce((n, t) => n + t.pend, 0)

  return (
    <div className="space-y-6">
      <Link href={voltarUrl} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {sim.titulo}
      </Link>
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><User className="h-5 w-5" /></span>
        <div>
          <h1 className="text-2xl font-bold leading-tight tracking-tight">{estudante.nome ?? 'Aluno'}</h1>
          <p className="text-sm text-muted-foreground">{estudante.email || '—'} · {tentativas.length} tentativa(s) · {totalPend} questão(ões) pendente(s)</p>
        </div>
      </div>

      <Card className="overflow-hidden" style={{ ['--card-spacing' as any]: '0px' }}>
        <SecaoHeader icon={ClipboardList} titulo="Tentativas" subtitulo="Clique numa tentativa para corrigir todas as questões dela de uma vez" />
        <CardContent className="space-y-2.5 px-4 py-4">
          {tentativas.map((t, i) => {
            const tudoCorrigido = t.pend === 0
            const rotulo = t.tentativa != null ? `Tentativa ${t.tentativa}` : varias ? `Tentativa ${tentativas.length - i}` : 'Tentativa'
            return (
              <Link key={t.sessaoId} href={`/admin/correcao/sessao/${t.sessaoId}`}
                className="group flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/40">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><PenLine className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{rotulo}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {t.total} quest{t.total === 1 ? 'ão' : 'ões'}
                    {t.quando && ` · ${formatBrt(t.quando)}`}
                  </p>
                </div>
                {t.fotos > 0 && (
                  <span className="hidden shrink-0 items-center gap-1 text-xs text-muted-foreground sm:inline-flex"><Images className="h-3.5 w-3.5" /> {t.fotos}</span>
                )}
                <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                  tudoCorrigido ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : t.emCorr ? 'bg-sky-500/15 text-sky-600 dark:text-sky-400' : 'bg-amber-500/15 text-amber-600 dark:text-amber-400')}>
                  {tudoCorrigido ? <><CheckCircle2 className="mr-0.5 inline h-3 w-3" />corrigida</> : `${t.pend} pendente${t.pend === 1 ? '' : 's'}`}
                </span>
                <span className={buttonVariants({ size: 'sm', variant: tudoCorrigido ? 'outline' : 'default' })}>
                  <PenLine className="mr-1 h-3.5 w-3.5" /> {tudoCorrigido ? 'Rever' : 'Corrigir'}
                </span>
              </Link>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}
