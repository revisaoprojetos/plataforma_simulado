'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// Cache em memória por chave (URL). Sobrevive a re-render e a RE-MONTAGEM na mesma sessão (ex.: um
// widget que volta a montar a cada navegação), então mostra o último valor NA HORA em vez de piscar
// vazio. Some ao fechar a aba — não persiste dado autenticado no disco.
const cache = new Map<string, { data: unknown; ts: number }>()

export interface SWRState<T> {
  data: T | null
  /** 1ª vez SEM nada em cache (mostra loading normal). */
  carregando: boolean
  /** Revalidando em 2º plano (já tem dado do cache na tela) → indicador sutil. */
  atualizando: boolean
  /** A rede falhou e não há dado (nem cache) → estado de erro. */
  erro: boolean
  /** Rede falhou MAS há dado (cache) → mostra o dado com aviso de "pode estar desatualizado". */
  desatualizado: boolean
  recarregar: () => void
}

/**
 * Stale-While-Revalidate para GETs de mesma origem (`/api/...`): devolve o cache imediatamente e
 * revalida em 2º plano, atualizando a UI quando a rede responde. `key` = URL (null desliga).
 * `intervalo` opcional refaz a revalidação de tempos em tempos (polling).
 */
export function useSWRGet<T = unknown>(key: string | null, opts?: { intervalo?: number }): SWRState<T> {
  const inicial = key ? (cache.get(key)?.data as T | undefined) : undefined
  const [data, setData] = useState<T | null>(inicial ?? null)
  const [atualizando, setAtualizando] = useState(false)
  const [erro, setErro] = useState(false)
  const [desatualizado, setDesatualizado] = useState(false)
  const vivo = useRef(true)

  const buscar = useCallback(async () => {
    if (!key) return
    setAtualizando(true)
    try {
      const res = await fetch(key)
      if (!res.ok) throw new Error(String(res.status))
      const json = (await res.json()) as T
      if (!vivo.current) return
      cache.set(key, { data: json, ts: Date.now() })
      setData(json); setErro(false); setDesatualizado(false)
    } catch {
      if (!vivo.current) return
      // Falhou: se já tem dado (cache), mantém com aviso; senão, erro.
      setDesatualizado((prev) => (data != null || cache.get(key ?? '')?.data != null) ? true : prev)
      setErro((prev) => (data == null && cache.get(key ?? '')?.data == null) ? true : prev)
    } finally {
      if (vivo.current) setAtualizando(false)
    }
  }, [key, data])

  useEffect(() => {
    vivo.current = true
    // Mostra o cache na hora e SEMPRE revalida ao montar.
    if (key) { const c = cache.get(key); if (c) setData(c.data as T) }
    void buscar()
    let t: ReturnType<typeof setInterval> | undefined
    if (opts?.intervalo && key) t = setInterval(() => void buscar(), opts.intervalo)
    return () => { vivo.current = false; if (t) clearInterval(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, opts?.intervalo])

  const temCache = key ? cache.has(key) : false
  return { data, carregando: data == null && !temCache && !erro, atualizando, erro, desatualizado, recarregar: buscar }
}
