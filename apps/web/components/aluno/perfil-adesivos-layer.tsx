'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Stamp, Loader2, Check, Trash2, Plus, RotateCw, Maximize } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PerfilAdesivo } from '@/lib/aluno/personalizacao'

type Colecionado = { carimboId: string; url: string; titulo: string }

/**
 * Camada de adesivos-decoração DENTRO do header REAL do perfil. Fora do modo edição, desenha os adesivos
 * atrás do conteúdo (z-1). No modo edição, escurece o header e deixa arrastar/ajustar os adesivos sobre
 * ELE MESMO — então posição e tamanho batem 1:1 com o resultado (nada de prévia/simulação). Salva a lista.
 */
export function PerfilAdesivosLayer({ adesivosIniciais, colecionados }: { adesivosIniciais: PerfilAdesivo[]; colecionados: Colecionado[] }) {
  const router = useRouter()
  const [edit, setEdit] = useState(false)
  const [lista, setLista] = useState<PerfilAdesivo[]>(adesivosIniciais)
  const [sel, setSel] = useState<number | null>(null)
  const [salvando, setSalvando] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ idx: number } | null>(null)

  const patch = (idx: number, p: Partial<PerfilAdesivo>) => setLista((l) => l.map((a, i) => (i === idx ? { ...a, ...p } : a)))
  const remover = (idx: number) => { setLista((l) => l.filter((_, i) => i !== idx)); setSel(null) }
  const add = (c: Colecionado) => { setLista((l) => [...l, { carimboId: c.carimboId, url: c.url, x: 50, y: 30, tamanho: 14, rotacao: 0 }]); setSel(lista.length) }

  function moverPara(cx: number, cy: number) {
    const b = boxRef.current?.getBoundingClientRect(); if (!b || !dragRef.current) return
    patch(dragRef.current.idx, {
      x: Math.round(Math.max(0, Math.min(100, ((cx - b.left) / b.width) * 100))),
      y: Math.round(Math.max(0, Math.min(100, ((cy - b.top) / b.height) * 100))),
    })
  }
  useEffect(() => {
    if (!edit) return
    const mv = (e: PointerEvent) => { if (dragRef.current) { e.preventDefault(); moverPara(e.clientX, e.clientY) } }
    const up = () => { dragRef.current = null }
    window.addEventListener('pointermove', mv, { passive: false })
    window.addEventListener('pointerup', up)
    return () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edit])

  function abrir() { setLista(adesivosIniciais); setSel(null); setEdit(true) }
  function cancelar() { setLista(adesivosIniciais); setSel(null); setEdit(false) }
  async function salvar() {
    setSalvando(true)
    try {
      const r = await fetch('/api/aluno/perfil/personalizar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ perfilAdesivos: lista }) })
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || 'Erro ao salvar')
      toast.success('Decoração salva!'); setEdit(false); router.refresh()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Erro ao salvar') }
    finally { setSalvando(false) }
  }

  return (
    <>
      {/* Exibição normal: adesivos ATRÁS do conteúdo (z-1) */}
      {!edit && lista.length > 0 && (
        <div aria-hidden className="pointer-events-none absolute inset-0 z-[1] overflow-hidden">
          {lista.map((a, i) => (
            <span key={i} className="absolute block" style={{ left: `${a.x}%`, top: `${a.y}%`, width: `${a.tamanho}%`, aspectRatio: '1', transform: `translate(-50%,-50%) rotate(${a.rotacao}deg)` }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.url} alt="" className="h-full w-full object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,.4)]" />
            </span>
          ))}
        </div>
      )}

      {/* Gatilho "Decorar" (canto inferior direito do header) */}
      {!edit && colecionados.length > 0 && (
        <button type="button" onClick={abrir}
          className="absolute bottom-3 right-4 z-[4] inline-flex items-center gap-1.5 rounded-lg border bg-card/85 px-2.5 py-1.5 text-xs font-medium shadow-sm backdrop-blur transition-colors hover:bg-card sm:right-5">
          <Stamp className="h-3.5 w-3.5" /> Decorar
        </button>
      )}

      {/* Modo edição: sobre o header real (escurecido), adesivos arrastáveis → posição/tamanho 1:1 */}
      {edit && (
        <div ref={boxRef} className="absolute inset-0 z-[20] touch-none select-none overflow-hidden rounded-3xl" onPointerDown={() => setSel(null)}>
          <div className="absolute inset-0 bg-black/45" />
          <span className="pointer-events-none absolute left-4 top-3 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white">Modo decoração</span>
          {lista.map((a, i) => (
            <span key={i} onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); dragRef.current = { idx: i }; setSel(i) }}
              style={{ left: `${a.x}%`, top: `${a.y}%`, width: `${a.tamanho}%`, aspectRatio: '1', transform: `translate(-50%,-50%) rotate(${a.rotacao}deg)` }}
              className={cn('absolute block cursor-grab active:cursor-grabbing', sel === i && 'outline-dashed outline-2 outline-offset-2 outline-white')}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.url} alt="" draggable={false} className="h-full w-full object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,.5)]" />
            </span>
          ))}
          {lista.length === 0 && <div className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-center text-sm font-medium text-white/80">Adicione adesivos na barra abaixo ↓</div>}
        </div>
      )}

      {/* Barra de ferramentas (fixa no rodapé) */}
      {edit && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-x-0 bottom-0 z-[120] border-t bg-card/95 p-3 shadow-2xl backdrop-blur">
          <div className="mx-auto flex max-w-3xl flex-col gap-2.5">
            {sel != null && lista[sel] && (
              <div className="grid grid-cols-1 gap-x-4 gap-y-2 rounded-xl border bg-muted/20 p-2.5 sm:grid-cols-[1fr_1fr_auto]">
                <Slider icon={Maximize} label="Tamanho" val={lista[sel].tamanho} min={4} max={40} suf="%" onChange={(v) => patch(sel, { tamanho: v })} />
                <Slider icon={RotateCw} label="Rotação" val={lista[sel].rotacao} min={-180} max={180} suf="°" onChange={(v) => patch(sel, { rotacao: v })} />
                <button type="button" onClick={() => remover(sel)} className="inline-flex h-9 items-center justify-center gap-1.5 self-end rounded-lg border border-destructive/30 px-3 text-xs font-medium text-destructive hover:bg-destructive/5"><Trash2 className="h-3.5 w-3.5" /> Remover</button>
              </div>
            )}
            <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
              <span className="shrink-0 text-xs font-medium text-muted-foreground">Adicionar:</span>
              {colecionados.map((c) => (
                <button key={c.carimboId} type="button" onClick={() => add(c)} title={`Adicionar ${c.titulo}`}
                  className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border bg-background transition-colors hover:border-primary/50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.url} alt="" className="h-9 w-9 object-contain" />
                  <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground"><Plus className="h-3 w-3" /></span>
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between gap-2">
              <button type="button" onClick={() => setLista([])} className="rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted">Limpar tudo</button>
              <div className="flex gap-2">
                <button type="button" onClick={cancelar} className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted">Cancelar</button>
                <button type="button" onClick={salvar} disabled={salvando}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
                  {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Salvar
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

function Slider({ icon: Icon, label, val, min, max, suf, onChange }: { icon: typeof RotateCw; label: string; val: number; min: number; max: number; suf: string; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="mb-0.5 flex items-center justify-between text-[11px] text-muted-foreground"><span className="inline-flex items-center gap-1"><Icon className="h-3 w-3" /> {label}</span><span className="tabular-nums">{Math.round(val)}{suf}</span></span>
      <input type="range" min={min} max={max} value={val} onChange={(e) => onChange(Number(e.target.value))} className="h-1.5 w-full cursor-pointer accent-[var(--primary)]" />
    </label>
  )
}
