'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Loader2, Save, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DEFAULT_TRILHA_SIMBOLOS, resolverTrilhaSimbolos, type TrilhaSimbolos } from '@/lib/gamificacao/trilha-simbolos'
import { resolverTrilhaFormato, type TrilhaFormato } from '@/lib/gamificacao/trilha-formato'
import { TrilhaSimbolosEditor } from '@/components/gamificacao/trilha-simbolos-editor'
import { FormatoSelector } from '@/components/gamificacao/formato-selector'
import { TrilhaFormatoPreview } from '@/components/gamificacao/trilha-formato-preview'

/**
 * Aparência da trilha no CONSOLE (super-admin, por plataforma). Edita os símbolos dos nós e um toggle
 * de PERMISSÃO que libera os admins da plataforma a verem/editarem isto no painel deles.
 * Persiste no tema: `gam_trilha_simbolos` (símbolos) + `gam_trilha_admin` (permissão do admin).
 */
export function TrilhaSimbolosForm({ tema, salvarTema }: {
  tema: any
  salvarTema: (t: Record<string, unknown>) => Promise<{ ok?: boolean } | void>
}) {
  const [cfg, setCfg] = useState<TrilhaSimbolos>(resolverTrilhaSimbolos(tema))
  const [formato, setFormato] = useState<TrilhaFormato>(resolverTrilhaFormato(tema))
  const [permitirAdmin, setPermitirAdmin] = useState<boolean>(tema?.gam_trilha_admin === true)
  const [dirty, setDirty] = useState(false)
  const [pending, start] = useTransition()

  const alterar = (v: TrilhaSimbolos) => { setCfg(v); setDirty(true) }

  function salvar() {
    start(async () => {
      try {
        await salvarTema({ gam_trilha_simbolos: cfg, trilha_formato: formato, gam_trilha_admin: permitirAdmin })
        setDirty(false)
        toast.success('Aparência da trilha salva.')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erro ao salvar')
      }
    })
  }

  return (
    <div className="space-y-5">
      <p className="text-xs text-muted-foreground">
        Formato e símbolos da trilha de simulados. Escolha o layout, troque os ícones dos nós por outros
        ícones ou imagens próprias e ajuste tamanho e cores — vale para o portal do aluno desta plataforma.
      </p>

      {/* Formato (layout) da trilha */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Formato da trilha</h3>
        <FormatoSelector value={formato} onChange={(v) => { setFormato(v); setDirty(true) }} />
        <TrilhaFormatoPreview formato={formato} simbolos={cfg} />
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Símbolos dos nós</h3>
        <TrilhaSimbolosEditor value={cfg} onChange={alterar} />
      </div>

      {/* Permissão: liberar edição p/ os admins da plataforma */}
      <label className={cn('flex cursor-pointer items-start justify-between gap-3 rounded-xl border p-4 transition-colors', permitirAdmin ? 'border-primary/40 bg-primary/[0.04]' : 'bg-card')}>
        <div className="min-w-0">
          <span className="text-sm font-semibold">Permitir que os admins da plataforma editem</span>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Quando ligado, a aba <span className="font-medium text-foreground">Aparência</span> da Gamificação
            aparece no painel dos admins e eles podem trocar os símbolos. Desligado, fica só aqui no console.
          </p>
        </div>
        <button type="button" role="switch" aria-checked={permitirAdmin}
          onClick={() => { setPermitirAdmin((v) => !v); setDirty(true) }}
          className={cn('relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors', permitirAdmin ? 'bg-primary' : 'bg-muted-foreground/30')}>
          <span className={cn('inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform', permitirAdmin ? 'translate-x-5' : 'translate-x-0.5')} />
        </button>
      </label>

      <div className="flex items-center gap-2">
        <button type="button" onClick={() => { setCfg(DEFAULT_TRILHA_SIMBOLOS); setDirty(true) }}
          className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-2 text-sm font-medium text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground">
          <RotateCcw className="h-4 w-4" /> Restaurar padrão
        </button>
        <button type="button" onClick={salvar} disabled={pending || !dirty}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar aparência da trilha
        </button>
      </div>
    </div>
  )
}
