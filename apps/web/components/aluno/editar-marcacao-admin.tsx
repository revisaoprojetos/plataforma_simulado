'use client'

// Edição ADMIN da marcação do aluno (aba Questões da página do aluno no simulado). Só o admin vê isto.
// A mutação vai por ROTA DE API; o servidor recalcula nota/ranking e preserva a marcação original do aluno.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Pencil, Undo2, Loader2, UserPen } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { QuestaoAgregada } from '@/lib/simulado/resultado-aluno'

const fmtNota = (n: number | null | undefined) => (n == null ? '—' : Number(n).toFixed(2).replace('.', ',').replace(/,00$/, ''))

export function EditarMarcacaoAdmin({ q }: { q: QuestaoAgregada }) {
  const router = useRouter()
  const marcs = q.marcacoes ?? []
  const [aberto, setAberto] = useState(false)
  const [sessaoId, setSessaoId] = useState<string>(marcs[marcs.length - 1]?.sessaoId ?? '')
  const [alvo, setAlvo] = useState<string | 'branco' | null>(null)
  const [motivo, setMotivo] = useState('')
  const [busy, setBusy] = useState(false)
  if (!marcs.length) return null

  const sel = marcs.find((m) => m.sessaoId === sessaoId) ?? marcs[marcs.length - 1]
  const editadas = marcs.filter((m) => m.editada)
  const altDe = (letra: string | null) => (letra ? q.alternativas.find((a) => a.letra === letra) : undefined)

  async function enviar(restaurar: boolean) {
    const alt = restaurar || alvo === 'branco' ? null : altDe(alvo)
    if (!restaurar && alvo == null) { toast.error('Escolha uma alternativa ou "Em branco".'); return }
    if (!restaurar && alvo !== 'branco' && !alt?.id) { toast.error('Alternativa inválida.'); return }
    setBusy(true)
    try {
      const r = await fetch('/api/admin/simulados/editar-marcacao', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessaoId: sel.sessaoId, questaoId: q.questaoId, alternativaId: alt?.id ?? null, restaurar, motivo: motivo.trim() || undefined }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { toast.error(j?.error ?? 'Não foi possível salvar.'); return }
      toast.success(`${restaurar ? 'Marcação original restaurada' : 'Marcação alterada'} · nota ${fmtNota(j.notaAntes)} → ${fmtNota(j.notaDepois)}${j.posicaoDepois != null ? ` · posição ${j.posicaoAntes ?? '—'}º → ${j.posicaoDepois}º` : ''}`)
      setAberto(false); setAlvo(null); setMotivo('')
      router.refresh()
    } catch { toast.error('Falha de rede ao salvar.') } finally { setBusy(false) }
  }

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {editadas.map((m) => (
          <span key={m.sessaoId} className="inline-flex flex-wrap items-center gap-1.5 rounded-md bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
            <UserPen className="h-3 w-3" /> Marcação editada pelo admin{marcs.length > 1 ? ` (tentativa ${m.n})` : ''}
            <span className="font-medium">· original do aluno: {m.originalLetra ?? 'em branco'}</span>
          </span>
        ))}
        {!aberto && (
          <button type="button" onClick={() => setAberto(true)} className="ml-auto inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground">
            <Pencil className="h-3 w-3" /> Editar marcação
          </button>
        )}
      </div>

      {aberto && (
        <div className="space-y-2.5 rounded-lg border border-primary/25 bg-primary/[0.03] p-3">
          {marcs.length > 1 && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">Tentativa
              <select value={sel.sessaoId} onChange={(e) => { setSessaoId(e.target.value); setAlvo(null) }} className="rounded-md border bg-background px-2 py-1 text-xs text-foreground">
                {marcs.map((m) => <option key={m.sessaoId} value={m.sessaoId}>#{m.n} — marcou {m.letra ?? 'em branco'}{m.editada ? ' (editada)' : ''}</option>)}
              </select>
            </label>
          )}
          <p className="text-xs text-muted-foreground">Marcação atual: <b className="text-foreground">{sel.letra ?? 'em branco'}</b>. Escolha a nova:</p>
          <div className="flex flex-wrap gap-1.5">
            {q.alternativas.map((a) => (
              <button key={a.letra} type="button" disabled={busy} onClick={() => setAlvo(a.letra)}
                className={cn('flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-sm font-bold transition-colors', alvo === a.letra ? 'border-primary bg-primary text-primary-foreground' : a.letra === sel.letra ? 'border-primary/40 bg-primary/10 text-primary' : 'hover:bg-accent')}>
                {a.letra}
              </button>
            ))}
            <button type="button" disabled={busy} onClick={() => setAlvo('branco')}
              className={cn('rounded-md border px-2.5 text-xs font-medium transition-colors', alvo === 'branco' ? 'border-primary bg-primary text-primary-foreground' : sel.letra == null ? 'border-primary/40 bg-primary/10 text-primary' : 'hover:bg-accent')}>
              Em branco
            </button>
          </div>
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} placeholder="Motivo (opcional)" className="w-full rounded-md border bg-background px-2.5 py-1.5 text-xs" />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={busy || alvo == null} onClick={() => enviar(false)} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50">
              {busy && <Loader2 className="h-3 w-3 animate-spin" />} Salvar e recalcular nota
            </button>
            <button type="button" disabled={busy} onClick={() => { setAberto(false); setAlvo(null) }} className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent">Cancelar</button>
            {sel.editada && (
              <button type="button" disabled={busy} onClick={() => enviar(true)} className="ml-auto inline-flex items-center gap-1 rounded-md border border-amber-500/40 px-2.5 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-500/10 dark:text-amber-400">
                <Undo2 className="h-3 w-3" /> Restaurar marcação original ({sel.originalLetra ?? 'em branco'})
              </button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">A marcação original do aluno é preservada. A nota e a posição no ranking são recalculadas e ficam registradas na auditoria.</p>
        </div>
      )}
    </div>
  )
}
