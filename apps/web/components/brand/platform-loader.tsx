'use client'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PlatformLoader — tela de carregamento ÚNICA da plataforma (spec 02 §3.3/§3.4)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Overlay FULL-SCREEN (`fixed inset-0`, z acima do app) com o fundo do gradiente
 * do tema. É PRESENTACIONAL e fica em LOOP — quem monta/desmonta controla o fim
 * (ver §3.4: `ready && elapsed >= minDisplayMs`). Não há timer interno obrigatório.
 *
 * Props:
 *   - brand / style / theme / message: se `brand`/`style` NÃO vierem, faz fetch de
 *     `/api/public/appearance` no mount e usa o resultado; enquanto não resolve,
 *     mostra um fallback neutro (sem flash de marca errada).
 *   - minMs: TODO (não usado aqui). O controle de minDisplay fica no CONSUMIDOR
 *     (spec §3.4: `minDisplayMs` padrão = o "Pronto" do estilo). Exposto só para
 *     documentar a intenção e permitir o consumidor passá-lo adiante no futuro.
 *
 * Escolha do componente: `switch(style)` → hoje só existem os 3 FALLBACKS
 * (`rev-loading-classico`, `vnd-loading-classico`, `meq-loading-circuito`).
 * Qualquer outro slug cai no fallback DA MARCA. Os demais slugs do catálogo
 * (spec 02 §1.2/§1.4/§1.6) ainda NÃO foram portados — ver TODO abaixo.
 *
 * TODO (slugs de loading ainda NÃO implementados — caem no fallback da marca):
 *   MEQ: meq-loading-montagem
 *   (Revisão e VND: TODOS os slugs de loading do catálogo JÁ implementados.)
 */

import { useEffect, useState } from 'react'
import { LOGIN_BG } from '@/lib/brand/brand-tokens'
import { lerAppearanceSemeada } from '@/lib/brand/use-appearance'
import { LoadingRevisaoClassico, type RevisaoTheme } from './loadings/loading-revisao-classico'
import { LoadingRevisaoCircuito, type RevisaoCircTheme } from './loadings/loading-revisao-circuito'
import { LoadingVndClassico, type VndTheme } from './loadings/loading-vnd-classico'
import { LoadingVndCircuito, type VndCircTheme } from './loadings/loading-vnd-circuito'
import { LoadingMeqCircuito, type MeqTheme } from './loadings/loading-meq-circuito'

export type Brand = 'revisao' | 'vnd' | 'meq'
export type Theme = 'claro' | 'escuro' | 'azul'

export interface PlatformLoaderProps {
  /** Marca da plataforma. Se ausente (e sem `style`), vem de /api/public/appearance. */
  brand?: Brand
  /** Tema do loading. MEQ aceita claro/azul/escuro; Revisão/VND só claro/escuro.
   *  Aceita também os aliases `light`/`dark` (vindos do simulado) — normalizados. */
  theme?: Theme | 'light' | 'dark'
  /** Slug do estilo de carregamento (spec 02 §1). Decide o componente. */
  style?: string
  /** Texto opcional abaixo do indicador (ex.: "Montando seu simulado…"). */
  message?: string
  /**
   * TODO (não usado): tempo mínimo de exibição (ms). O minDisplay é controlado
   * pelo CONSUMIDOR (spec §3.4); exposto aqui só para documentação/encaminhamento.
   */
  minMs?: number
}

type Resolved = { brand: Brand; theme: Theme; style?: string }

// Fallback de loading por marca (spec 02 §4).
const FALLBACK_STYLE: Record<Brand, string> = {
  revisao: 'rev-loading-classico',
  vnd: 'vnd-loading-classico',
  meq: 'meq-loading-circuito',
}

function temaValidoPara(brand: Brand, theme: Theme): Theme {
  if (theme === 'azul' && brand !== 'meq') return 'claro'
  return theme
}
// Normaliza aliases light/dark (usados pelo simulado) para o vocabulário claro/escuro/azul.
function normTheme(t: Theme | 'light' | 'dark' | undefined): Theme | undefined {
  if (t === 'light') return 'claro'
  if (t === 'dark') return 'escuro'
  return t
}
// Deriva a marca do slug do loading (ex.: 'vnd-loading-classico' → 'vnd'). Evita que um `style`
// sem `brand` caia no default 'revisao' e pisque o fundo roxo numa marca não-roxa.
function brandDoStyle(style?: string): Brand | null {
  if (!style) return null
  if (style.startsWith('vnd')) return 'vnd'
  if (style.startsWith('meq')) return 'meq'
  if (style.startsWith('rev')) return 'revisao'
  return null
}

/** Fundo do overlay enquanto resolvemos a aparência (NEUTRO, sem marca — dark slate, SEM roxo). */
const NEUTRO_BG = 'linear-gradient(150deg,#12141c,#181b26,#1e2230)'

export function PlatformLoader({ brand, theme: themeProp, style, message }: PlatformLoaderProps) {
  const theme = normTheme(themeProp) // aceita light/dark (simulado) → claro/escuro
  // Resolução SÍNCRONA (anti-flash de marca errada, spec 02 §3.3):
  //   1) brand/style vieram por prop → usa na hora.
  //   2) senão, há aparência JÁ semeada (cache de módulo / global do SSR) → usa a marca certa
  //      no 1º paint, sem passar pelo fundo neutro nem piscar o roxo da Revisão.
  //   3) só quando NADA é conhecido é que renderizamos NEUTRO e buscamos /api/public/appearance.
  const temInicial = !!brand || !!style
  const semeada = !temInicial ? lerAppearanceSemeada() : null
  const [resolved, setResolved] = useState<Resolved | null>(() => {
    if (temInicial) {
      const b = (brand ?? brandDoStyle(style) ?? 'revisao') as Brand
      return { brand: b, theme: temaValidoPara(b, (theme ?? 'claro') as Theme), style }
    }
    if (semeada) {
      const b = semeada.brand as Brand
      return {
        brand: b,
        theme: temaValidoPara(b, (theme ?? semeada.defaultTheme ?? 'claro') as Theme),
        style: style ?? semeada.loadingStyle,
      }
    }
    return null
  })

  useEffect(() => {
    if (temInicial || resolved) return
    let vivo = true
    fetch('/api/public/appearance', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!vivo || !d) return
        const b = (d.brand ?? 'revisao') as Brand
        setResolved({
          brand: b,
          theme: temaValidoPara(b, (theme ?? d.defaultTheme ?? 'claro') as Theme),
          style: style ?? d.loadingStyle,
        })
      })
      .catch(() => {
        if (vivo) setResolved({ brand: 'revisao', theme: 'claro', style: 'rev-loading-classico' })
      })
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [temInicial])

  // Fundo do gradiente do tema (spec §3.3). Neutro enquanto não resolve.
  const bg = resolved
    ? (LOGIN_BG[resolved.brand] as Record<string, string>)[resolved.theme] ?? NEUTRO_BG
    : NEUTRO_BG

  return (
    <div
      className="fixed inset-0 z-[9999] isolate"
      role="status"
      aria-live="polite"
      aria-busy="true"
      style={{ background: bg }}
    >
      {resolved ? <Inner {...resolved} message={message} /> : null}
    </div>
  )
}

/** Escolhe o componente de loading pelo slug (fallback → por marca). */
function Inner({ brand, theme, style, message }: Resolved & { message?: string }) {
  const slug = style ?? FALLBACK_STYLE[brand]

  switch (slug) {
    case 'rev-loading-classico':
      return <LoadingRevisaoClassico theme={theme as RevisaoTheme} message={message} />
    case 'rev-loading-formas':
      return <LoadingRevisaoClassico theme={theme as RevisaoTheme} message={message} efeitos />
    case 'rev-loading-quadrados':
      return <LoadingRevisaoClassico theme={theme as RevisaoTheme} message={message} quadrados />
    case 'rev-loading-circuito':
      return <LoadingRevisaoCircuito theme={theme as RevisaoCircTheme} message={message} />
    case 'rev-loading-circuito-efeitos':
      return <LoadingRevisaoCircuito theme={theme as RevisaoCircTheme} message={message} efeitos />
    case 'rev-loading-circuito-quadrados':
      return <LoadingRevisaoCircuito theme={theme as RevisaoCircTheme} message={message} quadrados />
    case 'vnd-loading-classico':
      return <LoadingVndClassico theme={theme as VndTheme} message={message} />
    case 'vnd-loading-classico-simula':
      return <LoadingVndClassico theme={theme as VndTheme} message={message} simula />
    case 'vnd-loading-circuito':
      return <LoadingVndCircuito theme={theme as VndCircTheme} message={message} />
    case 'vnd-loading-circuito-simula':
      return <LoadingVndCircuito theme={theme as VndCircTheme} message={message} simula />
    case 'vnd-loading-circuito-vertical':
      return <LoadingVndCircuito theme={theme as VndCircTheme} message={message} vertical />
    case 'vnd-loading-circuito-vertical-simula':
      return <LoadingVndCircuito theme={theme as VndCircTheme} message={message} vertical simula />
    case 'meq-loading-circuito':
      return <LoadingMeqCircuito theme={theme as MeqTheme} message={message} />
    default:
      // Slug ainda não portado (ver TODO no topo) → fallback DA MARCA.
      switch (brand) {
        case 'vnd':
          return <LoadingVndClassico theme={theme as VndTheme} message={message} />
        case 'meq':
          return <LoadingMeqCircuito theme={theme as MeqTheme} message={message} />
        case 'revisao':
        default:
          return <LoadingRevisaoClassico theme={theme as RevisaoTheme} message={message} />
      }
  }
}
