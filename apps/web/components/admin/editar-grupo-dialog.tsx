'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { editarGrupo } from '@/app/admin/grupos/actions'
import { Loader2, X, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export const GRUPO_CORES = ['#4f7fff', '#8b5cf6', '#6d28d9', '#ef4444', '#f43f7f', '#f59e0b', '#10b981', '#06b6d4', '#0ea5e9', '#84cc16', '#ec4899', '#64748b']

export function EditarGrupoDialog({ grupo, onClose }: { grupo: { id: string; nome: string; cor: string | null }; onClose: () => void }) {
  const router = useRouter()
  const [nome, setNome] = useState(grupo.nome)
  const [cor, setCor] = useState<string | null>(grupo.cor)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function salvar() {
    if (!nome.trim()) { toast.error('Informe um nome.'); return }
    setSalvando(true)
    const r = await editarGrupo(grupo.id, nome, cor)
    setSalvando(false)
    if (r.ok) { toast.success('Grupo salvo'); onClose(); router.refresh() } else toast.error(r.error ?? 'Erro ao salvar')
  }

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="animate-page absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
      <div role="dialog" aria-modal="true" className="animate-pop relative w-full max-w-sm overflow-hidden rounded-2xl border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h3 className="text-sm font-semibold">Editar grupo</h3>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-4 p-5">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Nome</label>
            <input value={nome} onChange={(e) => setNome(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') salvar() }} autoFocus
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Cor</label>
            <div className="flex flex-wrap items-center gap-2">
              {GRUPO_CORES.map((c) => (
                <button key={c} type="button" onClick={() => setCor(c)} title={c}
                  className={cn('flex h-7 w-7 items-center justify-center rounded-full border-2 transition-transform hover:scale-110', cor === c && 'ring-2 ring-foreground ring-offset-2 ring-offset-card')}
                  style={{ background: c, borderColor: c }}>
                  {cor === c && <Check className="h-3.5 w-3.5 text-white" />}
                </button>
              ))}
              <label className="relative inline-flex h-7 w-7 cursor-pointer items-center justify-center overflow-hidden rounded-full border" title="Cor personalizada">
                <span className="absolute inset-0" style={{ background: cor && !GRUPO_CORES.includes(cor) ? cor : 'conic-gradient(from 0deg, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)' }} />
                <input type="color" value={cor ?? '#4f7fff'} onChange={(e) => setCor(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
              </label>
              {cor && <button type="button" onClick={() => setCor(null)} className="text-xs text-muted-foreground hover:text-foreground">limpar</button>}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted">Cancelar</button>
            <button type="button" onClick={salvar} disabled={salvando} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
              {salvando && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
