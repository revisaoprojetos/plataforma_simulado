'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { atualizarCaderno } from '@/app/admin/cadernos/actions'
import { BANCO_CORES, BANCO_ICONES, iconeBanco } from '@/lib/banco-visual'
import { Loader2, X, Check, Palette, ImagePlus, Trash2, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Redimensiona a imagem no cliente e devolve um data URL leve (JPEG). */
async function redimensionar(file: File, max = 900): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas')
  ctx.drawImage(bitmap, 0, 0, w, h)
  return canvas.toDataURL('image/jpeg', 0.72)
}

export type CadernoPatch = { nome: string; cor: string | null; icone: string | null; capa: string | null }

export function EditarCadernoDialog({
  caderno,
  onClose,
  onSaved,
}: {
  caderno: { id: string; nome: string; cor: string | null; icone: string | null; capa: string | null; blocos: number }
  onClose: () => void
  onSaved: (patch: CadernoPatch) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [nome, setNome] = useState(caderno.nome)
  const [cor, setCor] = useState<string | null>(caderno.cor)
  const [icone, setIcone] = useState<string>(caderno.icone && BANCO_ICONES[caderno.icone] ? caderno.icone : 'arquivo')
  const [capa, setCapa] = useState<string | null>(caderno.capa)
  const [salvando, setSalvando] = useState(false)
  const [processando, setProcessando] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const c = cor ?? '#6d28d9'
  const Preview = iconeBanco(icone)

  async function onFile(f: File | null) {
    if (!f) return
    if (!f.type.startsWith('image/')) { toast.error('Selecione um arquivo de imagem.'); return }
    setProcessando(true)
    try { setCapa(await redimensionar(f)) } catch { toast.error('Falha ao processar a imagem.') } finally { setProcessando(false) }
  }

  async function salvar() {
    if (!nome.trim()) { toast.error('Informe um nome.'); return }
    setSalvando(true)
    const r = await atualizarCaderno(caderno.id, nome, cor, icone, capa)
    setSalvando(false)
    if (r.ok) { toast.success('Caderno atualizado'); onSaved({ nome: nome.trim(), cor, icone, capa }); onClose() }
    else toast.error(r.error ?? 'Erro ao salvar')
  }

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="animate-page absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
      <div role="dialog" aria-modal="true" className="animate-pop relative grid max-h-[88vh] w-full max-w-2xl grid-cols-1 overflow-hidden rounded-2xl border bg-card shadow-2xl md:grid-cols-[1fr_260px]">
        {/* Form */}
        <div className="min-w-0 overflow-auto">
          <div className="flex items-center justify-between border-b px-5 py-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><Palette className="h-4 w-4" /> Personalizar caderno</h3>
            <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"><X className="h-4 w-4" /></button>
          </div>
          <div className="space-y-5 p-5">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Nome</label>
              <input value={nome} onChange={(e) => setNome(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') salvar() }} autoFocus
                className="w-full rounded-lg border bg-[var(--input-bg,transparent)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
            </div>

            {/* Capa */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Imagem de capa</label>
              <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
              {capa ? (
                <div className="relative overflow-hidden rounded-xl border">
                  <img src={capa} alt="Capa" className="h-32 w-full object-cover" />
                  <div className="absolute right-2 top-2 flex gap-1.5">
                    <button type="button" onClick={() => inputRef.current?.click()} className="inline-flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-xs font-medium text-white backdrop-blur hover:bg-black/70"><RefreshCw className="h-3.5 w-3.5" /> Trocar</button>
                    <button type="button" onClick={() => setCapa(null)} className="inline-flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-xs font-medium text-white backdrop-blur hover:bg-rose-600"><Trash2 className="h-3.5 w-3.5" /> Remover</button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => inputRef.current?.click()} disabled={processando}
                  className="flex h-32 w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed text-muted-foreground transition-colors hover:border-primary hover:text-foreground disabled:opacity-60">
                  {processando ? <Loader2 className="h-6 w-6 animate-spin" /> : <ImagePlus className="h-6 w-6" />}
                  <span className="text-sm font-medium">{processando ? 'Processando…' : 'Adicionar capa'}</span>
                </button>
              )}
            </div>

            {/* Cor */}
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

            {/* Ícone */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Ícone</label>
              <div className="grid grid-cols-6 gap-2">
                {Object.entries(BANCO_ICONES).map(([key, Ic]) => (
                  <button key={key} type="button" onClick={() => setIcone(key)}
                    className={cn('flex h-10 items-center justify-center rounded-lg border transition-colors', icone === key ? 'border-transparent text-white' : 'text-muted-foreground hover:bg-muted')}
                    style={icone === key ? { background: c } : undefined}>
                    <Ic className="h-5 w-5" />
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted">Cancelar</button>
              <button type="button" onClick={salvar} disabled={salvando} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
                {salvando && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
              </button>
            </div>
          </div>
        </div>

        {/* Prévia do card (pôster) */}
        <div className="hidden flex-col gap-2 border-l bg-muted/20 p-4 md:flex">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Prévia</p>
          <div className="relative w-full overflow-hidden rounded-2xl border bg-card shadow-sm">
            <div className="relative h-24 overflow-hidden">
              {capa ? (
                <img src={capa} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full" style={{ background: `linear-gradient(150deg, ${c}, ${c}bb)` }} />
              )}
              {!capa && <Preview className="absolute -right-3 -top-3 h-20 w-20 text-white/15" />}
              <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
              <span className="absolute bottom-3 left-4 z-30 flex h-11 w-11 items-center justify-center rounded-xl text-white shadow-md ring-2 ring-white/25" style={{ background: c }}><Preview className="h-5 w-5" /></span>
            </div>
            <div className="p-4">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Caderno de prova</p>
              <h3 className="mt-0.5 line-clamp-2 text-base font-bold leading-tight">{nome || 'Nome do caderno'}</h3>
              <span className="mt-2.5 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ background: `${c}1f`, color: c }}>{caderno.blocos} bloco(s)</span>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
