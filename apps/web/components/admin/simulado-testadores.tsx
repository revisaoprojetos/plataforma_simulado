'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Plus, Loader2, X, FlaskConical } from 'lucide-react'
import { toast } from 'sonner'
import { concederTestadores, revogarTestador, type Testador } from '@/app/admin/simulados/actions'

interface Est { id: string; nome: string }

/** Acesso de teste: estudantes (inclui admins com cadastro de estudante) que podem FAZER o
 * simulado como teste mesmo fora da janela (antes de começar / depois de encerrar). Sessão is_teste. */
export function SimuladoTestadores({ simuladoId, estudantes, testadores }: { simuladoId: string; estudantes: Est[]; testadores: Testador[] }) {
  const router = useRouter()
  const [estudanteId, setEstudanteId] = useState('')
  const [pending, start] = useTransition()

  function adicionar(e: React.FormEvent) {
    e.preventDefault()
    if (!estudanteId) { toast.error('Selecione um estudante.'); return }
    start(async () => {
      const r = await concederTestadores(simuladoId, [estudanteId])
      if (r.ok) { toast.success(r.adicionados ? 'Acesso de teste concedido' : 'Já era testador'); setEstudanteId(''); router.refresh() }
      else toast.error(r.error ?? 'Erro')
    })
  }
  function remover(estId: string) {
    start(async () => {
      const r = await revogarTestador(simuladoId, estId)
      if (r.ok) { toast.success('Acesso de teste removido'); router.refresh() } else toast.error(r.error ?? 'Erro')
    })
  }

  const jaSet = new Set(testadores.map((t) => t.estudante_id))
  const disponiveis = estudantes.filter((e) => !jaSet.has(e.id))

  return (
    <div className="space-y-3">
      <form onSubmit={adicionar} className="flex flex-wrap items-end gap-2 rounded-lg border bg-card p-3">
        <div className="min-w-[220px] flex-1 space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Estudante (ou admin com cadastro de estudante)</label>
          <select value={estudanteId} onChange={(e) => setEstudanteId(e.target.value)}
            className="w-full rounded-md border bg-[var(--input-bg,transparent)] px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring">
            <option value="">Selecione…</option>
            {disponiveis.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
        </div>
        <Button type="submit" disabled={pending}>{pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />} Adicionar testador</Button>
      </form>

      {testadores.length === 0 ? (
        <p className="px-1 py-2 text-sm text-muted-foreground">Nenhum testador. Adicione quem pode fazer o simulado como teste — mesmo antes de começar ou depois de encerrado. Essas sessões não entram em estatísticas/ranking.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {testadores.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <span className="flex min-w-0 items-center gap-2"><FlaskConical className="h-4 w-4 shrink-0 text-amber-500" /> <span className="truncate font-medium">{t.nome}</span>{t.email && <span className="truncate text-muted-foreground">· {t.email}</span>}</span>
              <button type="button" onClick={() => remover(t.estudante_id)} disabled={pending} className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"><X className="h-3.5 w-3.5" /> Remover</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
