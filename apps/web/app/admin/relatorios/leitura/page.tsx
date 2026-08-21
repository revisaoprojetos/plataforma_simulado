import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, CheckCircle2, Library } from 'lucide-react'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { relatorioLeitura, detalheDocumento } from './_dados'
import { formatBrt } from '@/lib/brt'

export const dynamic = 'force-dynamic'

export default async function RelatorioLeituraPage({ searchParams }: { searchParams: Promise<{ doc?: string }> }) {
  if (!(await checkPermission('relatorios:view'))) redirect('/admin')
  const access = await getCurrentAccess()
  if (!access.tenantId) redirect('/admin')
  const { doc } = await searchParams

  // ── Detalhe de um documento ──
  if (doc) {
    const det = await detalheDocumento(access.tenantId, doc)
    if (!det) redirect('/admin/relatorios/leitura')
    return (
      <div className="space-y-5">
        <Link href="/admin/relatorios/leitura" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Relatório de Leitura</Link>
        <h1 className="text-2xl font-bold tracking-tight">{det.titulo}</h1>
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
      </div>
    )
  }

  // ── Lista de documentos ──
  const linhas = await relatorioLeitura(access.tenantId)
  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><Library className="h-6 w-6 text-primary" /> Relatório de Leitura</h1>
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
                  <Link href={`/admin/relatorios/leitura?doc=${l.id}`} className="font-medium hover:text-primary hover:underline">{l.titulo}</Link>
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
