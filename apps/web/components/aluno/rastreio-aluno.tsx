'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

/**
 * Rastreio leve da navegação do aluno (montado UMA vez no layout do portal). Envia `pagina_vista` ao entrar
 * numa rota (≤ 1 por rota / 30 s) e `tempo_pagina` (segundos de aba visível) ao sair/ocultar, em lote via
 * sendBeacon. Não envia query nem conteúdo; o servidor normaliza e valida tudo. Falhas são ignoradas.
 */
type Ev = { t: 'pagina_vista' | 'tempo_pagina'; r: string; d?: number }
const URL_RASTREIO = '/api/aluno/rastreio'
const MAX_LOTE = 20

function enviar(lote: Ev[]) {
  if (!lote.length) return
  const corpo = JSON.stringify({ eventos: lote.slice(0, MAX_LOTE) })
  try {
    if (navigator.sendBeacon && navigator.sendBeacon(URL_RASTREIO, new Blob([corpo], { type: 'text/plain;charset=UTF-8' }))) return
  } catch { /* cai no fetch */ }
  try { void fetch(URL_RASTREIO, { method: 'POST', body: corpo, keepalive: true, credentials: 'include', headers: { 'Content-Type': 'text/plain;charset=UTF-8' } }).catch(() => {}) } catch { /* ignore */ }
}

export function RastreioAluno() {
  const pathname = usePathname()
  const fila = useRef<Ev[]>([])
  const ultimoEnvio = useRef<Map<string, number>>(new Map())
  const atual = useRef<{ rota: string; acum: number; desde: number | null } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fecharRota = () => {
    const a = atual.current
    if (!a) return
    if (a.desde != null) { a.acum += Date.now() - a.desde; a.desde = null }
    const seg = Math.round(a.acum / 1000)
    if (seg >= 2) fila.current.push({ t: 'tempo_pagina', r: a.rota, d: Math.min(seg, 4 * 3600) })
    a.acum = 0
  }
  const descarregar = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    const l = fila.current.splice(0, MAX_LOTE)
    enviar(l)
    if (fila.current.length) agendar()
  }
  const agendar = () => { if (!timer.current) timer.current = setTimeout(descarregar, 30_000) }

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
    agendar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  // Visibilidade / saída: pausa o cronômetro e despacha o lote.
  useEffect(() => {
    const aoMudar = () => {
      const a = atual.current
      if (document.visibilityState === 'hidden') { fecharRota(); if (a) a.desde = null; descarregar() }
      else if (a) a.desde = Date.now()
    }
    const aoSair = () => { fecharRota(); descarregar() }
    document.addEventListener('visibilitychange', aoMudar)
    window.addEventListener('pagehide', aoSair)
    return () => {
      document.removeEventListener('visibilitychange', aoMudar)
      window.removeEventListener('pagehide', aoSair)
      if (timer.current) clearTimeout(timer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
