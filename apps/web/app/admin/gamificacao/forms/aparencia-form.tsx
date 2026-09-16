'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Loader2, RotateCcw, Save } from 'lucide-react'
import { DEFAULT_TRILHA_SIMBOLOS, type TrilhaSimbolos } from '@/lib/gamificacao/trilha-simbolos'
import { DEFAULT_TRILHA_FORMATO, type TrilhaFormato } from '@/lib/gamificacao/trilha-formato'
import { TrilhaSimbolosEditor } from '@/components/gamificacao/trilha-simbolos-editor'
import { FormatoSelector } from '@/components/gamificacao/formato-selector'
import { TrilhaFormatoPreview } from '@/components/gamificacao/trilha-formato-preview'
import { salvarTrilhaSimbolos } from '../actions'

export function AparenciaForm({ simbolos, formato: formatoInicial = DEFAULT_TRILHA_FORMATO, podeGerenciar }: {
  simbolos: TrilhaSimbolos; formato?: TrilhaFormato; podeGerenciar: boolean
}) {
  const [cfg, setCfg] = useState<TrilhaSimbolos>(simbolos)
  const [formato, setFormato] = useState<TrilhaFormato>(formatoInicial)
  const [pending, start] = useTransition()

  function salvar() {
    start(async () => {
      const r = await salvarTrilhaSimbolos(cfg, formato)
      if (r.error) toast.error(r.error)
      else toast.success('Aparência da trilha salva.')
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Aparência da trilha</h2>
          <p className="max-w-2xl text-xs text-muted-foreground">
            Escolha o formato (layout) e personalize os símbolos dos nós — ícones ou imagens, tamanho e cores.
            Vale para a trilha de simulados do aluno.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => { setCfg(DEFAULT_TRILHA_SIMBOLOS); setFormato(DEFAULT_TRILHA_FORMATO) }} disabled={!podeGerenciar}
            className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50">
            <RotateCcw className="h-3.5 w-3.5" /> Restaurar padrão
          </button>
          <button type="button" onClick={salvar} disabled={!podeGerenciar || pending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-50">
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Salvar
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Formato da trilha</h3>
        <FormatoSelector value={formato} onChange={setFormato} disabled={!podeGerenciar} />
        <TrilhaFormatoPreview formato={formato} simbolos={cfg} />
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Símbolos dos nós</h3>
        <TrilhaSimbolosEditor value={cfg} onChange={setCfg} disabled={!podeGerenciar} />
      </div>
    </div>
  )
}
