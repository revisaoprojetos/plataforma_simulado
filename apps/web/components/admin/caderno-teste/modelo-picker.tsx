'use client'

import { useEffect } from 'react'
import { X, FileText, ClipboardList, BarChart3, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Previa } from '@/lib/caderno-teste/previa'
import { MODALIDADES, builderDeModelo, type Modalidade } from '@/lib/caderno-teste/tipos'

const ICONE: Record<Modalidade, any> = { caderno_questoes: FileText, folha_respostas: ClipboardList, diagnostico: BarChart3 }

/** Miniatura "montada" do modelo — uma prévia A4 real, escalada e não-interativa. */
function MiniPrevia({ modalidade, modeloId }: { modalidade: Modalidade; modeloId: string }) {
  const LARG = 232
  const zoom = LARG / 794
  const builder = builderDeModelo(modalidade, modeloId)
  return (
    <div style={{ width: LARG, height: 300, overflow: 'hidden', background: '#fff', borderRadius: 6 }} className="pointer-events-none border">
      <div style={{ width: 794, transform: `scale(${zoom})`, transformOrigin: 'top left' }}>
        <Previa builder={builder} questoes={[]} />
      </div>
    </div>
  )
}

export function ModeloPicker({ open, onClose, atual, onSelecionar }: {
  open: boolean
  onClose: () => void
  atual: { modalidade: Modalidade; modelo: string }
  onSelecionar: (modalidade: Modalidade, modelo: string) => void
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-5 py-3.5">
          <div>
            <h2 className="text-lg font-bold">Escolher modelo</h2>
            <p className="text-xs text-muted-foreground">Selecione a modalidade e o modelo. Você ajusta os detalhes depois.</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>

        <div className="scroll-claro flex-1 space-y-7 overflow-y-auto p-5">
          {MODALIDADES.map((m) => {
            const Icon = ICONE[m.id]
            return (
              <section key={m.id}>
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-4 w-4" /></span>
                  <div>
                    <h3 className="text-sm font-bold leading-tight">{m.nome}</h3>
                    <p className="text-[11px] text-muted-foreground">{m.descricao}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {m.modelos.map((mo) => {
                    const sel = atual.modalidade === m.id && atual.modelo === mo.id
                    return (
                      <button key={mo.id} type="button" onClick={() => onSelecionar(m.id, mo.id)}
                        className={cn('group flex flex-col overflow-hidden rounded-xl border bg-card text-left transition-all hover:-translate-y-0.5 hover:shadow-md', sel ? 'border-primary ring-2 ring-primary' : 'hover:border-primary/50')}>
                        <div className="relative flex justify-center bg-muted/40 p-2">
                          <MiniPrevia modalidade={m.id} modeloId={mo.id} />
                          {sel && <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow"><Check className="h-4 w-4" /></span>}
                        </div>
                        <div className="border-t px-3 py-2">
                          <p className="text-sm font-semibold leading-tight">{mo.nome}</p>
                          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{mo.descricao}</p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}
