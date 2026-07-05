'use client'

import { useState } from 'react'
import { Flag, Loader2, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

const TIPOS = [
  { value: 'erro_gabarito', label: 'Gabarito incorreto' },
  { value: 'enunciado_confuso', label: 'Enunciado confuso' },
  { value: 'desatualizada', label: 'Questão desatualizada' },
  { value: 'outro', label: 'Outro' },
]

export function ReportarErroButton({ sessaoId, questaoId }: { sessaoId: string; questaoId: string }) {
  const [aberto, setAberto] = useState(false)
  const [tipo, setTipo] = useState('erro_gabarito')
  const [mensagem, setMensagem] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)

  async function enviar() {
    setEnviando(true)
    try {
      const res = await fetch('/api/sessoes/reportar-erro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessao_id: sessaoId, questao_id: questaoId, tipo, mensagem }),
      })
      if (res.ok) {
        setEnviado(true)
        setTimeout(() => { setAberto(false) }, 1500)
      }
    } finally {
      setEnviando(false)
    }
  }

  if (enviado) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-green-600">
        <Check className="h-3.5 w-3.5" /> Reportado, obrigado!
      </span>
    )
  }

  if (!aberto) {
    return (
      <button
        onClick={() => setAberto(true)}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <Flag className="h-3.5 w-3.5" /> Reportar erro
      </button>
    )
  }

  return (
    <div className="mt-2 space-y-2 rounded-md border bg-muted/30 p-3">
      <div className="flex flex-wrap gap-1.5">
        {TIPOS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTipo(t.value)}
            className={cn(
              'rounded-full border px-2.5 py-1 text-xs',
              tipo === t.value ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <textarea
        value={mensagem}
        onChange={(e) => setMensagem(e.target.value)}
        placeholder="Descreva o problema (opcional)"
        rows={2}
        maxLength={1000}
        className="w-full resize-none rounded-md border bg-[var(--input-bg,transparent)] px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
      />
      <div className="flex items-center gap-2">
        <button
          onClick={enviar}
          disabled={enviando}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-60"
        >
          {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Flag className="h-3.5 w-3.5" />}
          Enviar
        </button>
        <button onClick={() => setAberto(false)} className="text-xs text-muted-foreground hover:text-foreground">
          Cancelar
        </button>
      </div>
    </div>
  )
}
