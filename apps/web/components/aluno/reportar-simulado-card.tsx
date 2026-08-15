'use client'

import { useState } from 'react'
import { Flag, Loader2, Check, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const TIPOS = [
  { value: 'erro_questao', label: 'Erro em questão' },
  { value: 'erro_gabarito', label: 'Gabarito incorreto' },
  { value: 'problema_tecnico', label: 'Problema técnico' },
  { value: 'sugestao', label: 'Sugestão' },
  { value: 'outro', label: 'Outro' },
]

/** Card de REPORT geral do simulado (não de uma questão): tipo + mensagem → /api/sessoes/reportar-simulado. */
export function ReportarSimuladoCard({ sessaoId }: { sessaoId?: string | null }) {
  const [tipo, setTipo] = useState('erro_questao')
  const [mensagem, setMensagem] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)

  async function enviar() {
    if (!sessaoId) { toast.error('Sessão não encontrada.'); return }
    setEnviando(true)
    try {
      const res = await fetch('/api/sessoes/reportar-simulado', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessao_id: sessaoId, tipo, mensagem }),
      })
      if (!res.ok) { const j = await res.json().catch(() => ({})); toast.error(j.message ?? 'Não foi possível enviar.'); return }
      setEnviado(true)
      toast.success('Report enviado. Obrigado!')
    } catch { toast.error('Falha de rede. Tente novamente.') }
    finally { setEnviando(false) }
  }

  if (enviado) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-50/60 p-4 text-sm text-emerald-800 shadow-sm dark:bg-emerald-900/15 dark:text-emerald-300">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white"><Check className="h-4 w-4" /></span>
        Report enviado. Obrigado por ajudar a melhorar o simulado!
      </div>
    )
  }

  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400"><AlertTriangle className="h-4 w-4" /></span>
        <div>
          <h3 className="text-sm font-semibold">Reportar um problema</h3>
          <p className="text-xs text-muted-foreground">Encontrou um erro ou tem uma sugestão sobre este simulado?</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {TIPOS.map((t) => (
          <button key={t.value} type="button" onClick={() => setTipo(t.value)}
            className={cn('rounded-full border px-3 py-1 text-xs font-medium transition',
              tipo === t.value ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground')}>
            {t.label}
          </button>
        ))}
      </div>

      <textarea value={mensagem} onChange={(e) => setMensagem(e.target.value)} rows={3} maxLength={1000}
        placeholder="Descreva o problema ou a sugestão (opcional)"
        className="mt-3 w-full resize-none rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />

      <button type="button" onClick={enviar} disabled={enviando}
        className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60">
        {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flag className="h-4 w-4" />} Enviar report
      </button>
    </div>
  )
}
