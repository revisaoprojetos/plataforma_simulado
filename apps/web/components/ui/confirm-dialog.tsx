'use client'

// Diálogos próprios (confirmar / pedir texto) com API imperativa — substituem os
// window.confirm/prompt nativos por um visual consistente com o sistema.
//
// Uso:
//   import { confirmar, pedirTexto } from '@/components/ui/confirm-dialog'
//   if (!(await confirmar({ mensagem: 'Excluir?', destrutivo: true }))) return
//   const nome = await pedirTexto({ titulo: 'Nova modalidade', label: 'Nome' })
//
// Requer <ConfirmHost /> montado uma vez na árvore (feito no layout raiz).

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, HelpCircle, PencilLine, X } from 'lucide-react'

export type ConfirmOpts = {
  titulo?: string
  mensagem: string
  confirmar?: string
  cancelar?: string
  destrutivo?: boolean
}
export type PromptOpts = {
  titulo?: string
  mensagem?: string
  label?: string
  valorInicial?: string
  placeholder?: string
  confirmar?: string
}

let confirmHandler: ((o: ConfirmOpts) => Promise<boolean>) | null = null
let promptHandler: ((o: PromptOpts) => Promise<string | null>) | null = null

/** Confirma uma ação. Retorna true/false. Cai no confirm nativo se o host não estiver montado. */
export function confirmar(o: ConfirmOpts): Promise<boolean> {
  if (confirmHandler) return confirmHandler(o)
  return Promise.resolve(typeof window !== 'undefined' ? window.confirm(o.mensagem) : false)
}
/** Pede um texto. Retorna a string (ou null se cancelar). */
export function pedirTexto(o: PromptOpts): Promise<string | null> {
  if (promptHandler) return promptHandler(o)
  return Promise.resolve(typeof window !== 'undefined' ? window.prompt(o.mensagem ?? o.label ?? '', o.valorInicial ?? '') : null)
}

/** Casca do modal: backdrop + card animado + fechar por Esc/backdrop. */
function Modal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [onClose])

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px] animate-page" onClick={onClose} />
      <div role="dialog" aria-modal="true"
        className="animate-pop relative w-full max-w-sm overflow-hidden rounded-2xl border bg-card shadow-2xl">
        {children}
      </div>
    </div>,
    document.body,
  )
}

export function ConfirmHost() {
  const [confirmState, setConfirmState] = useState<{ o: ConfirmOpts; resolve: (b: boolean) => void } | null>(null)
  const [promptState, setPromptState] = useState<{ o: PromptOpts; resolve: (v: string | null) => void } | null>(null)
  const [texto, setTexto] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    confirmHandler = (o) => new Promise((resolve) => setConfirmState({ o, resolve }))
    promptHandler = (o) => new Promise((resolve) => { setTexto(o.valorInicial ?? ''); setPromptState({ o, resolve }) })
    return () => { confirmHandler = null; promptHandler = null }
  }, [])

  useEffect(() => { if (promptState) requestAnimationFrame(() => inputRef.current?.select()) }, [promptState])

  function fecharConfirm(v: boolean) { confirmState?.resolve(v); setConfirmState(null) }
  function fecharPrompt(v: string | null) { promptState?.resolve(v); setPromptState(null) }

  return (
    <>
      {confirmState && (() => {
        const { o } = confirmState
        const dest = !!o.destrutivo
        return (
          <Modal onClose={() => fecharConfirm(false)}>
            <div className="p-5">
              <div className="flex items-start gap-3">
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${dest ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'}`}>
                  {dest ? <AlertTriangle className="h-5 w-5" /> : <HelpCircle className="h-5 w-5" />}
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                  <h3 className="text-base font-semibold leading-tight">{o.titulo ?? (dest ? 'Confirmar exclusão' : 'Confirmar')}</h3>
                  <p className="mt-1.5 whitespace-pre-line text-sm text-muted-foreground">{o.mensagem}</p>
                </div>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button type="button" onClick={() => fecharConfirm(false)}
                  className="rounded-lg border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted">
                  {o.cancelar ?? 'Cancelar'}
                </button>
                <button type="button" autoFocus onClick={() => fecharConfirm(true)}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 ${dest ? 'bg-destructive' : 'bg-primary text-primary-foreground'}`}>
                  {o.confirmar ?? (dest ? 'Excluir' : 'Confirmar')}
                </button>
              </div>
            </div>
          </Modal>
        )
      })()}

      {promptState && (() => {
        const { o } = promptState
        const submit = () => fecharPrompt(texto.trim() ? texto.trim() : null)
        return (
          <Modal onClose={() => fecharPrompt(null)}>
            <div className="flex items-center justify-between border-b px-5 py-3">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><PencilLine className="h-4 w-4" /></span>
                <h3 className="text-sm font-semibold">{o.titulo ?? 'Digite um valor'}</h3>
              </div>
              <button type="button" onClick={() => fecharPrompt(null)} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-5">
              {o.mensagem && <p className="mb-2 text-sm text-muted-foreground">{o.mensagem}</p>}
              {o.label && <label className="mb-1 block text-xs font-medium text-muted-foreground">{o.label}</label>}
              <input ref={inputRef} value={texto} placeholder={o.placeholder}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit() } }}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
              <div className="mt-5 flex justify-end gap-2">
                <button type="button" onClick={() => fecharPrompt(null)}
                  className="rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted">Cancelar</button>
                <button type="button" onClick={submit} disabled={!texto.trim()}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
                  {o.confirmar ?? 'Confirmar'}
                </button>
              </div>
            </div>
          </Modal>
        )
      })()}
    </>
  )
}
