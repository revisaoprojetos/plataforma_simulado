'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { logoutAction } from '@/app/login/actions'

/**
 * Rastreio leve da navegação da EQUIPE (montado UMA vez no layout do /admin). Envia heartbeat (a cada ~60 s com a aba
 * visível), `pagina_vista` ao entrar numa rota (≤ 1 por rota / 30 s) e `tempo_pagina` (segundos de aba visível) ao
 * sair/ocultar — em lote (≤ 20) via sendBeacon. Não envia query nem conteúdo; o servidor normaliza e valida tudo.
 * Se um admin encerrar esta sessão, a resposta do heartbeat (fetch) traz `encerrada` e o usuário é deslogado.
 */
type Ev = { t: 'pagina_vista' | 'tempo_pagina' | 'heartbeat'; r?: string; d?: number }
const URL_RASTREIO = '/api/admin/rastreio'
const MAX_LOTE = 20
const HEARTBEAT_MS = 60_000

function enviarBeacon(lote: Ev[]) {
  if (!lote.length) return
  const corpo = JSON.stringify({ eventos: lote.slice(0, MAX_LOTE) })
  try {
    if (navigator.sendBeacon && navigator.sendBeacon(URL_RASTREIO, new Blob([corpo], { type: 'text/plain;charset=UTF-8' }))) return
  } catch { /* cai no fetch */ }
  try { void fetch(URL_RASTREIO, { method: 'POST', body: corpo, keepalive: true, credentials: 'include', headers: { 'Content-Type': 'text/plain;charset=UTF-8' } }).catch(() => {}) } catch { /* ignore */ }
}

export function RastreioAdmin() {
  const pathname = usePathname()
  const fila = useRef<Ev[]>([])
  const ultimoEnvio = useRef<Map<string, number>>(new Map())
  const atual = useRef<{ rota: string; acum: number; desde: number | null } | null>(null)
  const encerrando = useRef(false)

  const fecharRota = () => {
    const a = atual.current
    if (!a) return
    if (a.desde != null) { a.acum += Date.now() - a.desde; a.desde = null }
    const seg = Math.round(a.acum / 1000)
    if (seg >= 2) fila.current.push({ t: 'tempo_pagina', r: a.rota, d: Math.min(seg, 4 * 3600) })
    a.acum = 0
  }

  // Heartbeat com fetch (lê a resposta p/ detectar sessão encerrada por um admin) + descarrega a fila.
  const pulsar = async () => {
    if (encerrando.current || document.visibilityState !== 'visible') return
    const a = atual.current
    if (a && a.desde != null) { a.acum += Date.now() - a.desde; a.desde = Date.now() }
    const lote: Ev[] = [{ t: 'heartbeat' }, ...fila.current.splice(0, MAX_LOTE - 1)]
    try {
      const r = await fetch(URL_RASTREIO, { method: 'POST', body: JSON.stringify({ eventos: lote }), credentials: 'include', keepalive: true, headers: { 'Content-Type': 'text/plain;charset=UTF-8' } })
      if (r.ok && r.headers.get('content-type')?.includes('json')) {
        const j = (await r.json().catch(() => null)) as { encerrada?: boolean } | null
        if (j?.encerrada && !encerrando.current) { encerrando.current = true; void logoutAction() }
      }
    } catch { /* best-effort */ }
  }

  // Navegação: fecha a rota anterior e abre a nova.
  useEffect(() => {
    if (!pathname) return
    fecharRota()
    atual.current = { rota: pathname, acum: 0, desde: document.visibilityState === 'visible' ? Date.now() : null }
    const agora = Date.now()
    if (agora - (ultimoEnvio.current.get(pathname) ?? 0) >= 30_000) {
      ultimoEnvio.current.set(pathname, agora)
      if (ultimoEnvio.current.size > 200) ultimoEnvio.current.clear()
      fila.current.push({ t: 'pagina_vista', r: pathname })
    }
    // Página nova: dispara cedo (2 s) para o painel "online" refletir a rota atual.
    const t = setTimeout(() => { void pulsar() }, 2_000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  useEffect(() => {
    const iv = setInterval(() => { void pulsar() }, HEARTBEAT_MS)
    const aoMudar = () => {
      const a = atual.current
      if (document.visibilityState === 'hidden') { fecharRota(); if (a) a.desde = null; enviarBeacon(fila.current.splice(0, MAX_LOTE)) }
      else { if (a) a.desde = Date.now(); void pulsar() }
    }
    const aoSair = () => { fecharRota(); enviarBeacon(fila.current.splice(0, MAX_LOTE)) }
    document.addEventListener('visibilitychange', aoMudar)
    window.addEventListener('pagehide', aoSair)
    return () => {
      clearInterval(iv)
      document.removeEventListener('visibilitychange', aoMudar)
      window.removeEventListener('pagehide', aoSair)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
