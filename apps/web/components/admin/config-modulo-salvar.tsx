'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Loader2, Save, Check } from 'lucide-react'

type Entry = { get dirty(): boolean; salvar: () => Promise<boolean> }
type Ctx = { registrar: (id: string, e: Entry) => void; desregistrar: (id: string) => void; marcar: () => void }
const CtxSalvar = createContext<Ctx | null>(null)

/**
 * Coordena os formulários da aba Configurações do módulo num ÚNICO botão de salvar: cada form registra
 * seu estado "sujo" (dirty) + sua função de salvar; uma barra única mostra "Alterações não salvas" e
 * salva todos de uma vez. Guarda a saída da página (beforeunload) enquanto houver pendências.
 */
export function ConfigModuloSalvarProvider({ children }: { children: ReactNode }) {
  const entriesRef = useRef<Map<string, Entry>>(new Map())
  const [tick, setTick] = useState(0) // força recomputar a barra
  const [salvando, setSalvando] = useState(false)
  const recomputar = useCallback(() => setTick((n) => n + 1), [])
  const registrar = useCallback((id: string, e: Entry) => { entriesRef.current.set(id, e); recomputar() }, [recomputar])
  const desregistrar = useCallback((id: string) => { entriesRef.current.delete(id); recomputar() }, [recomputar])

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _ = tick
  const anyDirty = [...entriesRef.current.values()].some((e) => e.dirty)

  async function salvarTudo() {
    setSalvando(true)
    const sujos = [...entriesRef.current.values()].filter((e) => e.dirty)
    const oks = await Promise.all(sujos.map((e) => e.salvar().catch(() => false)))
    setSalvando(false)
    recomputar()
    if (oks.length && oks.every(Boolean)) toast.success('Alterações salvas')
    else if (oks.some((o) => !o)) toast.error('Algumas alterações não foram salvas.')
  }

  // Guarda de saída: avisa ao fechar/atualizar/sair da página com alterações pendentes.
  useEffect(() => {
    if (!anyDirty) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [anyDirty])

  return (
    <CtxSalvar.Provider value={{ registrar, desregistrar, marcar: recomputar }}>
      <div className="space-y-4">
        {anyDirty && (
          <div className="sticky top-2 z-30 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-sm shadow-sm backdrop-blur">
            <span className="inline-flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-300"><Save className="h-4 w-4" /> Você tem alterações não salvas.</span>
            <button type="button" onClick={salvarTudo} disabled={salvando}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:brightness-110 disabled:opacity-50">
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Salvar alterações
            </button>
          </div>
        )}
        {children}
      </div>
    </CtxSalvar.Provider>
  )
}

/**
 * Registra um formulário no salvar único. `dirty` = tem alteração pendente; `salvar` faz a gravação e
 * retorna true/false. Chame após o save bem-sucedido para "limpar" o dirty (o form controla seu baseline).
 * Fora do provider (uso isolado do form) vira no-op.
 */
export function useRegistrarSalvavel(id: string, dirty: boolean, salvar: () => Promise<boolean>) {
  const ctx = useContext(CtxSalvar)
  const dirtyRef = useRef(dirty); dirtyRef.current = dirty
  const salvarRef = useRef(salvar); salvarRef.current = salvar
  useEffect(() => {
    if (!ctx) return
    ctx.registrar(id, { get dirty() { return dirtyRef.current }, salvar: () => salvarRef.current() })
    return () => ctx.desregistrar(id)
  }, [ctx, id])
  useEffect(() => { ctx?.marcar() }, [ctx, dirty])
  return !!ctx // true quando dentro do provider (o form esconde seu próprio botão)
}
