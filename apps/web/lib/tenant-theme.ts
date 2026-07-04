import { cache } from 'react'
import { createServiceClient } from '@/lib/supabase/server'

export interface TenantTema {
  logo_url?: string
  logo_dark_url?: string
  favicon?: string
  cor_primaria?: string
  cor_secundaria?: string
  cor_accent?: string
  fonte?: string
}

export interface TenantThemeResult {
  css: string
  tema: TenantTema | null
  tenantId: string | null
  tenantNome: string | null
  favicon: string | null
  /** Modo padrão do sistema (claro/escuro) p/ quem ainda não escolheu. Default 'light'. */
  modoPadrao: 'light' | 'dark'
}

/**
 * Sanitiza um valor de cor antes de injetá-lo num <style>. Só aceita formatos
 * seguros (hex, funções de cor CSS, nome simples) — evita CSS-injection / XSS
 * via valores como `red; } </style><script>...`.
 */
function safeColor(raw?: string): string | null {
  if (!raw) return null
  const v = raw.trim()
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) return v
  if (/^(oklch|oklab|rgb|rgba|hsl|hsla|lab|lch)\([0-9.,%\s/-]+\)$/i.test(v)) return v
  if (/^[a-zA-Z]{1,20}$/.test(v)) return v
  return null
}

/** Sanitiza o nome da fonte (só letras/números/espaço/hífen). */
function safeFont(raw?: string): string | null {
  if (!raw) return null
  const v = raw.trim()
  return /^[a-zA-Z0-9 -]{1,40}$/.test(v) ? v : null
}

/**
 * Converts a hex color (#rrggbb / #rgb) to an oklch() CSS string.
 * This is a best-effort approximation via sRGB → linear sRGB → XYZ D65 → Oklab → Oklch.
 * If the input is already an oklch() or other CSS color, it is returned as-is.
 */
function hexToOklch(color: string): string {
  const trimmed = color.trim()

  // Already a non-hex CSS value — return as-is
  if (!trimmed.startsWith('#')) return trimmed

  // Expand shorthand #rgb → #rrggbb
  let hex = trimmed.slice(1)
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2]
  }
  if (hex.length !== 6) return trimmed

  const r = parseInt(hex.slice(0, 2), 16) / 255
  const g = parseInt(hex.slice(2, 4), 16) / 255
  const b = parseInt(hex.slice(4, 6), 16) / 255

  // sRGB → linear
  const toLinear = (c: number) =>
    c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  const lr = toLinear(r)
  const lg = toLinear(g)
  const lb = toLinear(b)

  // Linear sRGB → Oklab (via XYZ D65 with the Oklab matrix)
  const l_ = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m_ = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s_ = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)

  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_
  const bVal = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_

  const C = Math.sqrt(a * a + bVal * bVal)
  let H = Math.atan2(bVal, a) * (180 / Math.PI)
  if (H < 0) H += 360

  return `oklch(${L.toFixed(4)} ${C.toFixed(4)} ${H.toFixed(2)})`
}

/**
 * Returns foreground color for a given oklch background.
 * Light backgrounds (L > 0.55) get a dark foreground, dark backgrounds get a light one.
 */
function deriveForeground(oklchValue: string): string {
  const match = oklchValue.match(/oklch\(\s*([\d.]+)/)
  if (match) {
    const L = parseFloat(match[1])
    return L > 0.55 ? 'oklch(0.145 0 0)' : 'oklch(0.985 0 0)'
  }
  return 'oklch(0.985 0 0)'
}

/**
 * Produz as CSS vars de UMA paleta, separadas em:
 * - `marca`: destaques (primária, item ativo, hover/ativo) — servem de base nos 2 modos.
 * - `surf`: superfícies (sidebar/topbar + fundo/texto/cards/bordas) — específicas do modo.
 */
function varsDaPaleta(cores: Record<string, unknown>): { marca: string[]; surf: string[] } {
  const v = (x: unknown) => safeColor(typeof x === 'string' ? x : undefined)
  const ok = (c: string) => hexToOklch(c)
  const fg = (c: string) => deriveForeground(ok(c))
  const mix = (a: string, pct: number, b: string) => `color-mix(in oklab, ${ok(a)} ${pct}%, ${ok(b)})`

  const btn = v(cores.btn), accent = v(cores.accent), active = v(cores.active)
  const sidebar = v(cores.sidebar), sidetext = v(cores.sidetext), topbar = v(cores.topbar)
  const sborder = v(cores.sborder), icon = v(cores.icon), iconAtivo = v(cores.iconAtivo), iconHover = v(cores.iconHover)
  const sidetextHover = v(cores.sidetextHover), sidetextActive = v(cores.sidetextActive)
  const bg = v(cores.bg), text = v(cores.text), card = v(cores.card), cborder = v(cores.cborder), titulo = v(cores.titulo)
  const tabBg = v(cores.tabBg), tabAtivo = v(cores.tabAtivo), tabTexto = v(cores.tabTexto)

  const marca: string[] = []
  const surf: string[] = []
  const activeC = active ?? btn

  // ── Marca / destaques ──
  if (btn) marca.push(`  --primary: ${ok(btn)};`, `  --primary-foreground: ${fg(btn)};`, `  --ring: ${ok(btn)};`, `  --brand-primary: ${ok(btn)};`)
  if (accent) marca.push(`  --brand-accent: ${ok(accent)};`)
  if (activeC) marca.push(`  --sidebar-primary: ${ok(activeC)};`, `  --sidebar-primary-foreground: ${fg(activeC)};`, `  --sidebar-accent: ${ok(activeC)};`, `  --sidebar-accent-foreground: ${fg(activeC)};`)
  if (iconHover) marca.push(`  --sidebar-icon-hover: ${ok(iconHover)};`); else if (activeC) marca.push(`  --sidebar-icon-hover: ${fg(activeC)};`)
  if (iconAtivo) marca.push(`  --sidebar-icon-active: ${ok(iconAtivo)};`); else if (activeC) marca.push(`  --sidebar-icon-active: ${fg(activeC)};`)
  if (sidetextHover) marca.push(`  --sidebar-text-hover: ${ok(sidetextHover)};`); else if (activeC) marca.push(`  --sidebar-text-hover: ${fg(activeC)};`)
  if (sidetextActive) marca.push(`  --sidebar-text-active: ${ok(sidetextActive)};`); else if (activeC) marca.push(`  --sidebar-text-active: ${fg(activeC)};`)

  // ── Superfícies do chrome (lateral + topo) ──
  if (sidebar) { surf.push(`  --sidebar: ${ok(sidebar)};`); if (!sidetext) surf.push(`  --sidebar-foreground: ${fg(sidebar)};`) }
  if (sidetext) surf.push(`  --sidebar-foreground: ${ok(sidetext)};`)
  if (icon) surf.push(`  --sidebar-icon: ${ok(icon)};`); else if (sidetext) surf.push(`  --sidebar-icon: ${ok(sidetext)};`)
  if (sborder) surf.push(`  --sidebar-border: ${ok(sborder)};`, `  --sidebar-ring: ${ok(activeC ?? sborder)};`)
  if (topbar) surf.push(`  --topbar: ${ok(topbar)};`, `  --topbar-foreground: ${fg(topbar)};`)

  // ── Superfícies do conteúdo ──
  const bgC = bg ?? card
  if (bg) surf.push(`  --background: ${ok(bg)};`)
  if (text) surf.push(`  --foreground: ${ok(text)};`)
  if (titulo) surf.push(`  --content-title: ${ok(titulo)};`)
  if (card) {
    surf.push(`  --card: ${ok(card)};`, `  --popover: ${ok(card)};`, `  --secondary: ${ok(card)};`, `  --muted: ${ok(card)};`)
    const cardFg = text ?? sidetext
    if (cardFg) surf.push(`  --card-foreground: ${ok(cardFg)};`, `  --popover-foreground: ${ok(cardFg)};`, `  --secondary-foreground: ${ok(cardFg)};`)
  } else if (bgC && text) surf.push(`  --muted: ${mix(text, 7, bgC)};`)
  if (text && bgC) surf.push(`  --muted-foreground: ${mix(text, 55, bgC)};`, `  --accent: ${mix(text, 10, bgC)};`, `  --accent-foreground: ${ok(text)};`)
  if (cborder) surf.push(`  --border: ${ok(cborder)};`, `  --input: ${ok(cborder)};`)
  // Tabs: fundo da lista, tab selecionada, texto (hover/ativo)
  if (tabBg) surf.push(`  --tab-bg: ${ok(tabBg)};`)
  if (tabAtivo) surf.push(`  --tab-active: ${ok(tabAtivo)};`)
  if (tabTexto) surf.push(`  --tab-active-foreground: ${ok(tabTexto)};`)

  return { marca, surf }
}

/**
 * Compõe o CSS do tenant: paleta CLARA em `:root:not(.dark)` e ESCURA em `.dark`.
 * A marca da paleta clara vale como base nos dois modos; quando há paleta escura,
 * ela sobrescreve tudo no `.dark`. Sem paleta escura, o `.dark` do globals assume.
 */
function construirPaletaCompleta(cores: Record<string, unknown>, coresDark: Record<string, unknown> | null, fonte: string | null): string {
  const fontLine = fonte
    ? `  --font-sans: "${fonte}", var(--font-plus-jakarta), var(--font-inter), sans-serif;`
    : `  --font-sans: var(--font-plus-jakarta), var(--font-inter), sans-serif;`

  const L = varsDaPaleta(cores)
  const D = coresDark && typeof coresDark === 'object' ? varsDaPaleta(coresDark) : null

  // Marca (clara) + fonte nos dois modos; superfícies claras só no claro.
  let css = `:root, .dark {\n${[...L.marca, fontLine].join('\n')}\n}`
  css += `\n:root:not(.dark) {\n${L.surf.join('\n')}\n}`
  // Paleta escura completa (marca + superfícies) só no .dark, se configurada.
  if (D) css += `\n.dark {\n${[...D.marca, ...D.surf].join('\n')}\n}`
  return `${css}\nmain h1 { color: var(--content-title); }`
}

/**
 * Fetches the first available tenant's theme from Supabase and returns:
 * - A string of CSS variable overrides to inject into :root { … }
 * - The raw tema object for further use
 * - The tenant's favicon URL (if set)
 *
 * Returns empty css + nulls on any error so the caller can fall back to defaults.
 */
export const getTenantTheme = cache(async (): Promise<TenantThemeResult> => {
  const empty: TenantThemeResult = {
    css: '',
    tema: null,
    tenantId: null,
    tenantNome: null,
    favicon: null,
    modoPadrao: 'light',
  }

  try {
    const supabase = await createServiceClient()

    const { data, error } = await supabase
      .from('simulado_tenants')
      .select('id, nome, tema')
      .eq('ativo', true)
      .limit(1)
      .single()

    if (error || !data) return empty

    const tema = (data.tema ?? {}) as TenantTema
    const modoPadrao: 'light' | 'dark' = (tema as any).modo_padrao === 'dark' ? 'dark' : 'light'

    // Configurador de tema completo (paleta sidebar/conteúdo). Se presente,
    // gera só as cores de destaque da marca (fundo/texto seguem o modo).
    const cores = (tema as any).cores
    if (cores && typeof cores === 'object') {
      const css = construirPaletaCompleta(cores, (tema as any).cores_dark ?? null, safeFont((tema as any).fonte))
      if (css) {
        return { css, tema, tenantId: data.id as string, tenantNome: data.nome as string, favicon: (tema as any).favicon ?? null, modoPadrao }
      }
    }

    // Sanitiza tudo antes de qualquer injeção em <style>.
    const corPrimaria = safeColor(tema.cor_primaria)
    const corSecundaria = safeColor(tema.cor_secundaria)
    const corAccent = safeColor(tema.cor_accent)
    const fonte = safeFont(tema.fonte)

    const lines: string[] = []

    if (corPrimaria) {
      const primary = hexToOklch(corPrimaria)
      const primaryFg = deriveForeground(primary)
      lines.push(`  --primary: ${primary};`)
      lines.push(`  --primary-foreground: ${primaryFg};`)
      lines.push(`  --sidebar-primary: ${primary};`)
      lines.push(`  --sidebar-primary-foreground: ${primaryFg};`)
      lines.push(`  --ring: ${primary};`)
    }

    if (corSecundaria) {
      const secondary = hexToOklch(corSecundaria)
      const secondaryFg = deriveForeground(secondary)
      lines.push(`  --secondary: ${secondary};`)
      lines.push(`  --secondary-foreground: ${secondaryFg};`)
    }

    if (corAccent) {
      const accent = hexToOklch(corAccent)
      const accentFg = deriveForeground(accent)
      lines.push(`  --accent: ${accent};`)
      lines.push(`  --accent-foreground: ${accentFg};`)
    }

    if (fonte) {
      lines.push(`  --font-sans: "${fonte}", var(--font-plus-jakarta), var(--font-inter), sans-serif;`)
    }

    // Always expose brand tokens for custom components
    if (corPrimaria) {
      lines.push(`  --brand-primary: ${hexToOklch(corPrimaria)};`)
    }
    if (corSecundaria) {
      lines.push(`  --brand-secondary: ${hexToOklch(corSecundaria)};`)
    }

    const css = lines.length > 0 ? `:root, .dark {\n${lines.join('\n')}\n}` : ''

    return {
      css,
      tema,
      tenantId: data.id as string,
      tenantNome: data.nome as string,
      favicon: tema.favicon ?? null,
      modoPadrao,
    }
  } catch {
    return empty
  }
})
