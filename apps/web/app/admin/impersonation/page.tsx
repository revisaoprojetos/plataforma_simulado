import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Eye, ShieldCheck } from 'lucide-react'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { listarLogsImpersonation } from '@/lib/impersonation/logs'
import { formatBrt } from '@/lib/brt'

export const dynamic = 'force-dynamic'

const REASON_LABEL: Record<string, string> = {
  closed_by_admin: 'Fechada pelo admin',
  expired: 'Expirou',
  renewed_into_new_session: 'Renovada',
}

// E8 — consulta (somente leitura) das sessões de visualização do aluno. Trilha de auditoria imutável.
export default async function ImpersonationLogsPage() {
  const access = await getCurrentAccess()
  if (!access.userId) redirect('/admin')
  if (!access.isAdmin && !access.permissions.includes('auditoria:view')) redirect('/admin')

  const logs = access.tenantId ? await listarLogsImpersonation(access.tenantId) : []

  return (
    <div className="animate-page space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><Eye className="h-6 w-6 text-primary" /> Visualizações de aluno</h1>
        <p className="text-muted-foreground">Registro imutável de quando um administrador visualizou a conta de um aluno (somente leitura).</p>
      </div>

      {logs.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-12 text-center text-muted-foreground">
          <ShieldCheck className="mx-auto mb-2 h-8 w-8 opacity-40" />
          Nenhuma visualização registrada ainda.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted text-left text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5 font-medium">Aluno</th>
                <th className="px-3 py-2.5 font-medium">Início</th>
                <th className="px-3 py-2.5 font-medium">Fim</th>
                <th className="px-3 py-2.5 font-medium">Motivo</th>
                <th className="px-3 py-2.5 font-medium">Nível</th>
                <th className="px-3 py-2.5 font-medium">IP</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-2.5">
                    <Link href={`/admin/estudantes/${l.estudanteId}`} className="font-medium hover:underline">{l.estudanteNome}</Link>
                    {l.estudanteEmail && <span className="block truncate text-xs text-muted-foreground">{l.estudanteEmail}</span>}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-muted-foreground">{formatBrt(l.startedAt) ?? '—'}</td>
                  <td className="px-3 py-2.5 tabular-nums text-muted-foreground">{l.endedAt ? formatBrt(l.endedAt) : <span className="text-emerald-600 dark:text-emerald-400">em aberto</span>}</td>
                  <td className="px-3 py-2.5">{l.endReason ? (REASON_LABEL[l.endReason] ?? l.endReason) : '—'}</td>
                  <td className="px-3 py-2.5">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">{l.actionLevel === 'read_only' ? 'Somente leitura' : l.actionLevel}</span>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-xs text-muted-foreground">{l.ip ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
