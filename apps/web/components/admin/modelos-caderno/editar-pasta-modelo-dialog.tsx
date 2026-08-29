'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { criarPastaModelo, atualizarPastaModelo } from '@/app/admin/modelos-caderno/actions'
import { BANCO_CORES } from '@/lib/banco-visual'
import { Loader2, X, Check, Palette } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Cria/personaliza uma PASTA da área de Modelos de Caderno (folder_area='caderno_modelo').
 *  Pasta = card com ícone (sem imagem/capa) — só nome + cor. */
export function EditarPastaModeloDialog({ pasta, criarEmPai = null, criar = false, onClose, onSaved }: {
  pasta?: { id?: string; nome?: string; cor?: string | null } | null
  /** Modo criar: pasta-pai (null = raiz). */
  criarEmPai?: string | null
  criar?: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const ehCriar = criar || !pasta?.id
  const [nome, setNome] = useState(pasta?.nome ?? '')
  const [cor, setCor] = useState<string | null>(pasta?.cor ?? null)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function salvar() {
    if (!nome.trim()) { toast.error('Informe um nome.'); return }
    setSalvando(true)
    try {
      let id = pasta?.id
      if (ehCriar) {
        const r = await criarPastaModelo(nome.trim(), criarEmPai)
        if (!r.ok || !r.id) { toast.error(r.error ?? 'Erro ao criar'); return }
        id = r.id
      }
      // Pasta sem imagem: limpa qualquer capa antiga (null) e grava só nome + cor.
      const r2 = await atualizarPastaModelo(id!, nome.trim(), cor, null, null)
      if (!r2.ok) { toast.error(r2.error ?? 'Erro ao salvar'); return }
      toast.success(ehCriar ? (criarEmPai ? 'Subpasta criada' : 'Pasta criada') : 'Pasta atualizada')
      onSaved(); onClose()
    } finally { setSalvando(false) }
  }

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
      <div role="dialog" aria-modal="true" className="relative flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl">
        <div className="min-w-0 overflow-auto">
          <div className="flex items-center justify-between border-b px-5 py-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><Palette className="h-4 w-4" /> {ehCriar ? (criarEmPai ? 'Nova subpasta' : 'Nova pasta') : 'Personalizar pasta'}</h3>
            <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"><X className="h-4 w-4" /></button>
          </div>
          <div className="space-y-5 p-5">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Nome</label>
              <input value={nome} onChange={(e) => setNome(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') salvar() }} autoFocus
                className="w-full rounded-lg border bg-[var(--input-bg,transparent)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Cor</label>
              <div className="flex flex-wrap items-center gap-2">
                {BANCO_CORES.map((cc) => (
                  <button key={cc} type="button" onClick={() => setCor(cc)} title={cc}
                    className={cn('flex h-8 w-8 items-center justify-center rounded-full transition-transform hover:scale-110', cor === cc && 'ring-2 ring-foreground ring-offset-2 ring-offset-card')}
                    style={{ background: cc }}>
                    {cor === cc && <Check className="h-4 w-4 text-white" />}
                  </button>
                ))}
                <label className="relative inline-flex h-8 w-8 cursor-pointer items-center justify-center overflow-hidden rounded-full border" title="Cor personalizada">
                  <span className="absolute inset-0" style={{ background: cor && !BANCO_CORES.includes(cor) ? cor : 'conic-gradient(from 0deg, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)' }} />
                  <input type="color" value={cor ?? '#6d28d9'} onChange={(e) => setCor(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted">Cancelar</button>
              <button type="button" onClick={salvar} disabled={salvando} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
                {salvando && <Loader2 className="h-4 w-4 animate-spin" />} {ehCriar ? (criarEmPai ? 'Criar subpasta' : 'Criar pasta') : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
