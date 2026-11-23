'use client'
// Propaga o título digitado para a árvore (lista de páginas/barra de título) com debounce (~300 ms) em vez de a cada tecla; a
// caixa de título continua mostrando o valor local. Ao desmontar (trocar de página) o último valor pendente é entregue na hora.
import { useCallback, useEffect, useRef } from 'react'

export const ATRASO_TITULO_MS = 300

export function useTituloPropagado(paginaId: string, onTitulo: (id: string, titulo: string) => void) {
  const cb = useRef(onTitulo); cb.current = onTitulo
  const pend = useRef<{ id: string; t: string } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const entregar = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    const p = pend.current; pend.current = null
    if (p) cb.current(p.id, p.t)
  }, [])
  const propagar = useCallback((t: string) => {
    pend.current = { id: paginaId, t }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(entregar, ATRASO_TITULO_MS)
  }, [paginaId, entregar])
  useEffect(() => entregar, [entregar])
  return { propagar, entregar }
}
