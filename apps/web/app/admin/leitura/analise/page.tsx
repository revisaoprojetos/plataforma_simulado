import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, CheckCircle2, BarChart3 } from 'lucide-react'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { relatorioLeitura, detalheDocumento } from './_dados'
import { formatBrt } from '@/lib/brt'

export const dynamic = 'force-dynamic'

export default async function AnaliseLeituraPage({ searchParams }: { searchParams: Promise<{ doc?: string; p?: string }> }) {
  if (!(await checkPermission('relatorios:view'))) redirect('/admin')
  const access = await getCurrentAccess()
  if (!access.tenantId) redirect('/admin')
  const { doc, p } = await searchParams

  // ── Detalhe de um documento ──
  if (doc) {
    const pagina = Math.max(1, Number(p) || 1)
    const det = await detalheDocumento(access.tenantId, doc, pagina)
    if (!det) redirect('/admin/leitura/analise')
    const totalPaginas = Math.max(1, Math.ceil(det.total / det.porPagina))
    return (
      <div className="space-y-5">
        <Link href="/admin/leitura/analise" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Análise · LegProc Digital</Link>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h1 className="text-2xl font-bold tracking-tight">{det.titulo}</h1>
          <span className="text-sm text-muted-foreground tabular-nums">{det.total} aluno{det.total === 1 ? '' : 's'}</span>
        </div>
        <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr><th className="px-4 py-2.5">Aluno</th><th className="px-4 py-2.5">Progresso</th><th className="px-4 py-2.5">Tempo</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5">Atualizado</th></tr>
            </thead>
            <tbody>
              {det.alunos.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Nenhum aluno começou este documento ainda.</td></tr>
              ) : det.alunos.map((a) => (
                <tr key={a.estudanteId} className="border-t">
                  <td className="px-4 py-2.5 font-medium">{a.nome}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${a.pct}%` }} /></div>
                      <span className="text-xs tabular-nums text-muted-foreground">{a.pct}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{a.tempoMin} min</td>
                  <td className="px-4 py-2.5">
                    {a.concluido ? <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-4 w-4" /> Concluído</span> : <span className="text-muted-foreground">Em andamento</span>}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{a.atualizadoEm ? formatBrt(a.atualizadoEm) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPaginas > 1 && (
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-xs text-muted-foreground">Página <b className="tabular-nums text-foreground">{det.pagina}</b> de <b className="tabular-nums text-foreground">{totalPaginas}</b></span>
            <div className="flex items-center gap-1">
              <PagLink href={`/admin/leitura/analise?doc=${doc}&p=${det.pagina - 1}`} disabled={det.pagina <= 1}>Anterior</PagLink>
              <PagLink href={`/admin/leitura/analise?doc=${doc}&p=${det.pagina + 1}`} disabled={det.pagina >= totalPaginas}>Próxima</PagLink>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Lista de documentos ──
  const linhas = await relatorioLeitura(access.tenantId)
  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><BarChart3 className="h-6 w-6 text-primary" /> Análise · LegProc Digital</h1>
        <p className="text-muted-foreground">Quem começou e concluiu cada documento, com progresso e tempo médios.</p>
      </div>
      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr><th className="px-4 py-2.5">Documento</th><th className="px-4 py-2.5">Iniciaram</th><th className="px-4 py-2.5">Concluíram</th><th className="px-4 py-2.5">% médio</th><th className="px-4 py-2.5">Tempo médio</th></tr>
          </thead>
          <tbody>
            {linhas.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Nenhum documento criado ainda.</td></tr>
            ) : linhas.map((l) => (
              <tr key={l.id} className="border-t transition-colors hover:bg-muted/40">
                <td className="px-4 py-2.5">
                  <Link href={`/admin/leitura/analise?doc=${l.id}`} className="font-medium hover:text-primary hover:underline">{l.titulo}</Link>
                  {!l.publicado && <span className="ml-2 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">rascunho</span>}
                </td>
                <td className="px-4 py-2.5 tabular-nums">{l.iniciaram}</td>
                <td className="px-4 py-2.5 tabular-nums">{l.concluiram}</td>
                <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{l.pctMedio}%</td>
                <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{l.tempoMedioMin} min</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PagLink({ href, disabled, children }: { href: string; disabled?: boolean; children: React.ReactNode }) {
  if (disabled) return <span className="inline-flex h-8 items-center rounded-lg border px-3 text-muted-foreground opacity-40">{children}</span>
  return <Link href={href} className="inline-flex h-8 items-center rounded-lg border px-3 text-muted-foreground transition hover:bg-muted">{children}</Link>
}
