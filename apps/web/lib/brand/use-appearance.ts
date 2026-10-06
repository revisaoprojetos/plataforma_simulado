'use client'

// Hook de leitura da APARÊNCIA de login/carregamento no CLIENTE (spec 02 §4, fase 2).
// Faz UM fetch de /api/public/appearance e guarda o resultado em cache de módulo — a mesma
// resposta serve login, carregamento pós-login e qualquer outro consumidor sem refazer a chamada.
// Tolerante a erro: qualquer falha cai nos fallbacks do catálogo (marca Revisão) para nunca
// quebrar um fluxo pré/pós-login.

import { useEffect, useState } from 'react'
import { catalogoDaMarca, type Brand, type Theme } from './appearance-catalogo'

export interface Appearance {
  brand: Brand
  loginAtivo: boolean
  loadingAtivo: boolean
  internoAtivo: boolean
  loginStyle: string
  loadingStyle: string
  defaultTheme: Theme
  followSystemTheme: boolean
  loadingMinMs: number | null
}

export interface UseAppearanceResult extends Appearance {
  loading: boolean
}

// Fallback da marca Revisão — espelha o que o endpoint devolve quando o tenant não resolve.
function fallbackAppearance(): Appearance {
  const cat = catalogoDaMarca('revisao')
  return {
    brand: 'revisao',
    loginAtivo: false,
    loadingAtivo: true,
    internoAtivo: false,
    loginStyle: cat.fallback.login,
    loadingStyle: cat.fallback.loading,
    defaultTheme: cat.fallback.theme,
    followSystemTheme: false,
    loadingMinMs: null,
  }
}

// Cache de módulo: a promise é compartilhada entre todas as instâncias do hook (dedupe de fetch).
let cache: Appearance | null = null
let inflight: Promise<Appearance> | null = null

// ─────────────────────────────────────────────────────────────────────────────
// Priming SÍNCRONO (anti-flash de marca errada): quem já conhece a marca do tenant
// — tipicamente o SSR, via um global `window.__APPEARANCE__`, ou o shell do portal
// que recebe `brand` por prop — pode semear o cache do módulo ANTES do 1º render.
// Com o cache semeado, `useAppearance()` resolve de imediato (`loading:false`) e o
// PlatformLoader nunca pisca a marca Revisão (roxo) de outro tenant enquanto o
// fetch de /api/public/appearance não volta. Idempotente e tolerante.
// ─────────────────────────────────────────────────────────────────────────────
declare global {
  // eslint-disable-next-line no-var
  var __APPEARANCE__: Partial<Appearance> | undefined
}

/** Semeia o cache de módulo com a aparência já conhecida (não sobrescreve um cache válido). */
export function primeAppearance(parcial: Partial<Appearance>): Appearance {
  if (!cache) cache = normalizar(parcial)
  return cache
}

/**
 * Lê a aparência JÁ conhecida de forma SÍNCRONA (cache de módulo OU semente global do SSR),
 * sem disparar fetch. `null` quando nada foi semeado ainda. Usada pelo PlatformLoader para
 * resolver a marca no 1º paint e não piscar a marca de outro tenant.
 */
export function lerAppearanceSemeada(): Appearance | null {
  return lerCacheSemeado()
}

/** Lê o cache semeado (global do SSR OU priming explícito), síncrono. `null` se nada foi semeado. */
function lerCacheSemeado(): Appearance | null {
  if (cache) return cache
  if (typeof window !== 'undefined' && window.__APPEARANCE__) {
    cache = normalizar(window.__APPEARANCE__)
    return cache
  }
  return null
}

function normalizar(data: unknown): Appearance {
  const fb = fallbackAppearance()
  const d = (data ?? {}) as Partial<Appearance>
  return {
    brand: (d.brand as Brand) ?? fb.brand,
    loginAtivo: d.loginAtivo === true,
    loadingAtivo: d.loadingAtivo !== false,
    internoAtivo: d.internoAtivo === true,
    loginStyle: typeof d.loginStyle === 'string' ? d.loginStyle : fb.loginStyle,
    loadingStyle: typeof d.loadingStyle === 'string' ? d.loadingStyle : fb.loadingStyle,
    defaultTheme: (d.defaultTheme as Theme) ?? fb.defaultTheme,
    followSystemTheme: d.followSystemTheme === true,
    loadingMinMs: typeof d.loadingMinMs === 'number' ? d.loadingMinMs : null,
  }
}

async function carregar(): Promise<Appearance> {
  const semeado = lerCacheSemeado()
  if (semeado) return semeado
  if (inflight) return inflight
  inflight = (async () => {
    try {
      const res = await fetch('/api/public/appearance', { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      cache = normalizar(await res.json())
    } catch {
      cache = fallbackAppearance() // tolerante a erro: nunca propaga a falha
    } finally {
      inflight = null
    }
    return cache
  })()
  return inflight
}

/**
 * Lê a aparência da plataforma (marca + estilos de login/carregamento + tema padrão) no cliente.
 * Enquanto carrega, devolve os fallbacks com `loading: true`. Se já houver cache de módulo,
 * resolve de imediato (sem flash). Qualquer erro de rede cai no fallback do catálogo.
 */
export function useAppearance(): UseAppearanceResult {
  // Resolve SÍNCRONO quando há cache (de módulo) ou semente do SSR (`window.__APPEARANCE__`):
  // nesse caso `loading` já nasce false e a marca certa é usada no 1º paint (sem flash roxo).
  const [data, setData] = useState<Appearance>(() => lerCacheSemeado() ?? fallbackAppearance())
  const [loading, setLoading] = useState<boolean>(() => lerCacheSemeado() === null)

  useEffect(() => {
    const semeado = lerCacheSemeado()
    if (semeado) {
      setData(semeado)
      setLoading(false)
      return
    }
    let vivo = true
    carregar().then((a) => {
      if (!vivo) return
      setData(a)
      setLoading(false)
    })
    return () => {
      vivo = false
    }
  }, [])

  return { ...data, loading }
}
