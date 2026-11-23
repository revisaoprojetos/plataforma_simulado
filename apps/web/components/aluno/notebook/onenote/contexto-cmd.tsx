'use client'
// Barramento de comandos do Caderno OneNote.
//   - O ribbon/atalhos chamam `executar(id, payload)`.
//   - Quem implementa registra handlers com `useRegistrarComandos({ id: fn })` (onda 1: navegação/estrutura; onda 2: formatação,
//     inserção, desenho). Botão cujo id NÃO tem handler aparece desabilitado.
//   - Estado de botões de alternância (negrito ativo, fonte atual...) via `definirEstado(id, valor)`.
// RE-RENDER: o objeto de `useOneNoteCmd()` é ESTÁVEL (handlers/estado ficam em ref/loja externa) e NÃO re-renderiza quem o usa.
// Quem precisa REAGIR assina por id (useSyncExternalStore, mesmo padrão de estado-desenho.ts): `useTemCmd(...ids)` (há handler?) e
// `useEstadoCmd(id)` (valor do estado). Assim um botão só re-renderiza quando muda o SEU id — não o ribbon inteiro.
// `cmd.tem(id)` / `cmd.estado(id)` continuam existindo para uso em EVENTOS (leitura pontual, sem assinatura).
import { createContext, useCallback, useContext, useEffect, useRef, useSyncExternalStore } from 'react'

export type CmdHandler = (payload?: any) => void | Promise<void>
export type CmdApi = {
  executar: (id: string, payload?: unknown) => void
  registrar: (id: string, h: CmdHandler) => () => void
  /** Leitura pontual (eventos). Em render, use `useTemCmd`. */
  tem: (id: string) => boolean
  /** Leitura pontual (eventos). Em render, use `useEstadoCmd`. */
  estado: (id: string) => unknown
  definirEstado: (id: string, valor: unknown) => void
  /** @internal assinatura por id (useSyncExternalStore). */
  assinar: (id: string, f: () => void) => () => void
}

function criarLoja(): CmdApi {
  const handlers = new Map<string, CmdHandler>()
  const estados = new Map<string, unknown>()
  const ouvintes = new Map<string, Set<() => void>>()
  const emitir = (id: string) => { ouvintes.get(id)?.forEach((f) => f()) }
  return {
    executar: (id, payload) => { const h = handlers.get(id); if (h) void Promise.resolve(h(payload)).catch(() => {}) },
    registrar: (id, h) => {
      const tinha = handlers.has(id)
      handlers.set(id, h)
      if (!tinha) emitir(id) // trocar o handler de um id já registrado não muda nada visível
      return () => { if (handlers.get(id) === h) { handlers.delete(id); emitir(id) } }
    },
    tem: (id) => handlers.has(id),
    estado: (id) => estados.get(id),
    definirEstado: (id, valor) => { if (estados.get(id) !== valor) { estados.set(id, valor); emitir(id) } },
    assinar: (id, f) => {
      let s = ouvintes.get(id)
      if (!s) { s = new Set(); ouvintes.set(id, s) }
      s.add(f)
      return () => { s!.delete(f); if (!s!.size) ouvintes.delete(id) }
    },
  }
}

const Ctx = createContext<CmdApi | null>(null)

export function OneNoteCmdProvider({ children }: { children: React.ReactNode }) {
  const loja = useRef<CmdApi | null>(null)
  if (!loja.current) loja.current = criarLoja()
  return <Ctx.Provider value={loja.current}>{children}</Ctx.Provider>
}

export function useOneNoteCmd(): CmdApi {
  const c = useContext(Ctx)
  if (!c) throw new Error('useOneNoteCmd fora de <OneNoteCmdProvider>')
  return c
}

/** Registra vários handlers (sempre chamam a versão mais recente da função). Cancela o registro ao desmontar. */
export function useRegistrarComandos(mapa: Record<string, CmdHandler>) {
  const { registrar } = useOneNoteCmd()
  const ref = useRef(mapa); ref.current = mapa
  const chave = Object.keys(mapa).sort().join('|')
  useEffect(() => {
    const offs = chave ? chave.split('|').map((id) => registrar(id, (p) => ref.current[id]?.(p))) : []
    return () => offs.forEach((f) => f())
  }, [chave, registrar])
}

/** Assina o estado de UM id: re-renderiza só quando ele muda. */
export function useEstadoCmd<T = unknown>(id: string): T | undefined {
  const cmd = useOneNoteCmd()
  const assinar = useCallback((f: () => void) => cmd.assinar(id, f), [cmd, id])
  const ler = useCallback(() => cmd.estado(id) as T | undefined, [cmd, id])
  return useSyncExternalStore(assinar, ler, () => undefined)
}

/** `true` se ALGUM dos ids tem handler. Assina só esses ids. */
export function useTemCmd(...ids: (string | undefined)[]): boolean {
  const cmd = useOneNoteCmd()
  const chave = ids.filter(Boolean).join('|')
  const assinar = useCallback((f: () => void) => {
    const offs = (chave ? chave.split('|') : []).map((id) => cmd.assinar(id, f))
    return () => offs.forEach((o) => o())
  }, [cmd, chave])
  const ler = useCallback(() => (chave ? chave.split('|').some((id) => cmd.tem(id)) : false), [cmd, chave])
  return useSyncExternalStore(assinar, ler, () => false)
}
