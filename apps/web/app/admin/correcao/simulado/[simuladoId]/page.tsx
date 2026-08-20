import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { Card, CardContent } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { SecaoHeader } from '@/components/admin/secao-header'
import { ArrowLeft, PenLine, Users, Images, CheckCircle2, User } from 'lucide-react'
import { SemPermissao } from '@/components/ui/alert-box'
import { cn } from '@/lib/utils'
import { formatBrt } from '@/lib/brt'

export const dynamic = 'force-dynamic'
const ZERO = '00000000-0000-0000-0000-000000000000'

/** Alunos que fizeram um simulado discursivo → uma linha por TENTATIVA (sessão). */
export default async function CorrecaoSimuladoPage({ params }: { params: Promise<{ simuladoId: string }> }) {
  const { simuladoId } = await params
  const access = await getCurrentAccess()
  const pode = access.isAdmin
    || access.permissions.includes('correcao:view') || access.permissions.includes('correcao:corrigir')
    || access.permissions.includes('questoes:view') || access.permissions.includes('questoes:update')
  if (!pode) return <div className="space-y-4"><SemPermissao>Sem permissão para corrigir.</SemPermissao></div>

  const svc = createAdminClient()
  const tenantId = access.tenantId ?? ZERO

  const { data: sim } = await svc.from('simulado_simulados')
    .select('id, titulo').eq('id', simuladoId).eq('tenant_id', tenantId).maybeSingle()
  if (!sim) notFound()

  // Sessões válidas do simulado → respostas discursivas dessas sessões.
  const sess = await fetchAll<any>(() => svc.from('simulado_sessoes_prova')
    .select('id, estudante_id, is_teste, deletado, finalizado_em, tentativa_num').eq('simulado_id', simuladoId).eq('tenant_id', tenantId).order('id'))
  const sessValidas = sess.filter((s) => !s.is_teste && !s.deletado)
  const sessIds = sessValidas.map((s) => s.id)

  const resp = sessIds.length
    ? await fetchAllByIn<any>(sessIds, (c) => svc.from('simulado_respostas_discursivas')
        .select('id, sessao_id, status').in('sessao_id', c))
    : []

  const eIds = [...new Set(sessValidas.map((s) => s.estudante_id).filter(Boolean))] as string[]
  const respIds = resp.map((r) => r.id)
  const [ests, paginas] = await Promise.all([
    eIds.length ? fetchAllByIn<any>(eIds, (c) => svc.from('simulado_estudantes').select('id, nome, email').in('id', c)) : Promise.resolve([] as any[]),
    (async () => { try { return respIds.length ? await fetchAllByIn<any>(respIds, (c) => svc.from('simulado_resposta_arquivos').select('resposta_id').in('resposta_id', c)) : [] } catch { return [] as any[] } })(),
  ])
  const eMap = new Map(ests.map((e: any) => [e.id, e]))
  const pagCount = new Map<string, number>()
  for (const p of paginas as any[]) pagCount.set(p.resposta_id, (pagCount.get(p.resposta_id) ?? 0) + 1)

  // Agrupa por SESSÃO (tentativa): todas as questões do aluno ficam juntas.
  const porSessao = new Map<string, any[]>()
  for (const r of resp) { const a = porSessao.get(r.sessao_id) ?? []; a.push(r); porSessao.set(r.sessao_id, a) }
  const contaPorAluno = new Map<string, number>()
  for (const s of sessValidas) if (porSessao.has(s.id)) contaPorAluno.set(s.estudante_id, (contaPorAluno.get(s.estudante_id) ?? 0) + 1)

  const tentativas = sessValidas
    .filter((s) => porSessao.has(s.id))
    .map((s) => {
      const rs = porSessao.get(s.id)!
      const est = eMap.get(s.estudante_id)
      const corr = rs.filter((r) => r.status === 'corrigida').length
      const emCorr = rs.some((r) => r.status === 'em_correcao')
      const fotos = rs.reduce((n, r) => n + (pagCount.get(r.id) ?? 0), 0)
      return {
        sessaoId: s.id,
        aluno: est?.nome ?? 'Aluno',
        email: est?.email ?? '',
        multiplas: (contaPorAluno.get(s.estudante_id) ?? 0) > 1,
        tentativa: s.tentativa_num ?? null,
        finalizadoEm: s.finalizado_em as string | null,
        total: rs.length,
        corr,
        pend: rs.length - corr,
        emCorr,
        fotos,
      }
    })
    .sort((a, b) => (a.pend === 0 ? 1 : 0) - (b.pend === 0 ? 1 : 0) || a.aluno.localeCompare(b.aluno, 'pt-BR'))

  const totalPend = tentativas.reduce((n, t) => n + t.pend, 0)

  return (
    <div className="space-y-6">
      <Link href="/admin/correcao" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Simulados discursivos
      </Link>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{sim.titulo}</h1>
        <p className="text-muted-foreground">{tentativas.length} aluno(s)/tentativa(s) · {totalPend} questão(ões) pendente(s).</p>
      </div>

      <Card className="overflow-hidden" style={{ ['--card-spacing' as any]: '0px' }}>
        <SecaoHeader icon={Users} titulo="Alunos" subtitulo="Clique num aluno para corrigir a tentativa inteira" />
        <CardContent className="space-y-2.5 px-4 py-4">
          {tentativas.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Ninguém enviou resposta discursiva ainda.</p>
          ) : tentativas.map((t) => {
            const tudoCorrigido = t.pend === 0
            return (
              <Link key={t.sessaoId} href={`/admin/correcao/sessao/${t.sessaoId}`}
                className="group flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/40">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><User className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {t.aluno}
                    {t.multiplas && t.tentativa != null && <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">tentativa {t.tentativa}</span>}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {t.email || '—'} · {t.total} quest{t.total === 1 ? 'ão' : 'ões'}
                    {t.finalizadoEm && ` · ${formatBrt(t.finalizadoEm)}`}
                  </p>
                </div>
                {t.fotos > 0 && (
                  <span className="hidden shrink-0 items-center gap-1 text-xs text-muted-foreground sm:inline-flex"><Images className="h-3.5 w-3.5" /> {t.fotos}</span>
                )}
                <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                  tudoCorrigido ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : t.emCorr ? 'bg-sky-500/15 text-sky-600 dark:text-sky-400' : 'bg-amber-500/15 text-amber-600 dark:text-amber-400')}>
                  {tudoCorrigido ? <><CheckCircle2 className="mr-0.5 inline h-3 w-3" />corrigido</> : `${t.pend} pendente${t.pend === 1 ? '' : 's'}`}
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
