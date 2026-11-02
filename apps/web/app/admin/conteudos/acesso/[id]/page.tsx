import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Users } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { acessoEfetivoDoEstudante } from '@/lib/acesso/aluno-efetivo'
import { formatBrt } from '@/lib/brt'
import { EstudanteAcesso } from '@/components/admin/estudante-acesso'
import { SemAcessoArea } from '@/app/admin/conteudos/_components/sem-acesso-area'

export const dynamic = 'force-dynamic'
const SEM = '00000000-0000-0000-0000-000000000000'

function situacaoGrupo(expiraEm: string | null): { label: string; cls: string } {
  if (!expiraEm) return { label: 'Sem validade', cls: 'bg-muted text-muted-foreground' }
  const t = +new Date(expiraEm)
  if (isNaN(t)) return { label: 'Sem validade', cls: 'bg-muted text-muted-foreground' }
  if (t > Date.now()) return { label: `até ${formatBrt(expiraEm)}`, cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' }
  return { label: 'Expirado', cls: 'bg-rose-500/10 text-rose-600 dark:text-rose-400' }
}

export default async function AcessoEstudantePage({ params }: { params: Promise<{ id: string }> }) {
  const access = await getCurrentAccess()
  const pode = access.isAdmin || access.permissions.includes('grupos:view') || access.permissions.includes('matriculas:view')
  if (!pode) return <SemAcessoArea />

  const { id } = await params
  const tenantId = access.tenantId ?? SEM
  const svc = createAdminClient()

  const { data: est } = await svc.from('simulado_estudantes').select('id, nome, email').eq('id', id).eq('tenant_id', tenantId).maybeSingle()
  if (!est) notFound()

  // Acesso efetivo (produtos) — reusa o motor; + grupos do aluno (com validade, tolerante).
  const [itens, vinc] = await Promise.all([
    acessoEfetivoDoEstudante(tenantId, id),
    (async () => {
      for (const cols of ['grupo_id, expira_em', 'grupo_id']) {
        try { return await fetchAll<any>(() => svc.from('simulado_grupo_membros').select(cols).eq('estudante_id', id).eq('tenant_id', tenantId).order('grupo_id', { ascending: true })) }
        catch (e: any) { if (!/column|does not exist|expira_em|schema cache/i.test(e?.message ?? String(e))) return [] }
      }
      return []
    })(),
  ])

  const grupoIds = [...new Set((vinc as any[]).map((v) => v.grupo_id).filter(Boolean))]
  const validadeDe = new Map<string, string | null>((vinc as any[]).map((v) => [v.grupo_id, v.expira_em ?? null]))
  const nomes = new Map<string, string>()
  if (grupoIds.length) {
    const { data } = await svc.from('simulado_grupos').select('id, nome').in('id', grupoIds).eq('tenant_id', tenantId)
    for (const g of (data ?? []) as any[]) nomes.set(g.id, g.nome)
  }
  const grupos = grupoIds.map((gid) => ({ id: gid, nome: nomes.get(gid) ?? 'Grupo', expiraEm: validadeDe.get(gid) ?? null }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

  return (
    <div className="w-full space-y-5">
      <div className="flex items-start gap-3">
        <Link href="/admin/conteudos/acesso" aria-label="Voltar" className="mt-1 inline-flex h-9 w-9 items-center justify-center rounded-lg border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><ChevronLeft className="h-4 w-4" /></Link>
        <div className="space-y-1">
          <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Link href="/admin/conteudos/acesso" className="hover:text-foreground hover:underline">Quem tem acesso</Link><span>/</span><span className="text-foreground">{est.nome}</span>
          </nav>
          <h1 className="text-2xl font-bold tracking-tight">{est.nome}</h1>
          {est.email && <p className="text-sm text-muted-foreground">{est.email}</p>}
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Produtos liberados</h2>
        <EstudanteAcesso itens={itens} />
      </section>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><Users className="h-4 w-4 text-muted-foreground" /> Grupos de acesso ({grupos.length})</h2>
        {grupos.length === 0 ? (
          <div className="rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground">Este aluno não está em nenhum grupo.</div>
        ) : (
          <div className="overflow-hidden rounded-2xl border bg-card">
            <ul className="divide-y divide-border/60">
              {grupos.map((g) => {
                const s = situacaoGrupo(g.expiraEm)
                return (
                  <li key={g.id} className="flex items-center gap-2 px-4 py-3 text-sm">
                    <Link href={`/admin/conteudos/grupos/${g.id}`} className="truncate font-medium hover:text-primary hover:underline">{g.nome}</Link>
                    <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium ${s.cls}`}>{s.label}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </section>
    </div>
  )
}
