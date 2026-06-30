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

/** Override global da cor da fonte (texto), se configurada. */
function cssFonteCor(tema: Record<string, unknown>): string {
  const cor = safeColor(typeof tema.fonte_cor === 'string' ? (tema.fonte_cor as string) : undefined)
  if (!cor) return ''
  const ok = hexToOklch(cor)
  return `\n:root, .dark {\n  --foreground: ${ok};\n  --card-foreground: ${ok};\n  --popover-foreground: ${ok};\n  --secondary-foreground: ${ok};\n}`
}

/**
 * Constrói a paleta completa do app a partir do configurador (cores de
 * sidebar/conteúdo). Aplica em `:root, .dark` para que a marca defina o visual
 * independentemente do modo claro/escuro.
 */
function construirPaletaCompleta(cores: Record<string, unknown>, fonte: string | null): string {
  const v = (x: unknown) => safeColor(typeof x === 'string' ? x : undefined)
  const sidebar = v(cores.sidebar), sidetext = v(cores.sidetext), active = v(cores.active), sborder = v(cores.sborder)
  const bg = v(cores.bg), text = v(cores.text), card = v(cores.card), cborder = v(cores.cborder), btn = v(cores.btn), accent = v(cores.accent)
  if (!bg || !text || !card || !btn || !sidebar || !sidetext) return ''

  const ok = (c: string) => hexToOklch(c)
  const btnFg = deriveForeground(ok(btn))
  const activeFg = active ? deriveForeground(ok(active)) : 'oklch(0.985 0 0)'

  const lines = [
    `  --background: ${ok(bg)};`,
    `  --foreground: ${ok(text)};`,
    `  --card: ${ok(card)};`,
    `  --card-foreground: ${ok(text)};`,
    `  --popover: ${ok(card)};`,
    `  --popover-foreground: ${ok(text)};`,
    `  --secondary: ${ok(card)};`,
    `  --secondary-foreground: ${ok(text)};`,
    `  --muted: ${ok(card)};`,
    `  --muted-foreground: color-mix(in oklab, ${ok(text)} 60%, ${ok(bg)});`,
    `  --accent: color-mix(in oklab, ${ok(accent ?? btn)} 16%, ${ok(card)});`,
    `  --accent-foreground: ${ok(text)};`,
    `  --primary: ${ok(btn)};`,
    `  --primary-foreground: ${btnFg};`,
    `  --ring: ${ok(btn)};`,
    cborder ? `  --border: ${ok(cborder)};` : '',
    cborder ? `  --input: ${ok(cborder)};` : '',
    `  --sidebar: ${ok(sidebar)};`,
    `  --sidebar-foreground: ${ok(sidetext)};`,
    active ? `  --sidebar-primary: ${ok(active)};` : '',
    active ? `  --sidebar-primary-foreground: ${activeFg};` : '',
    active ? `  --sidebar-accent: color-mix(in oklab, ${ok(active)} 14%, ${ok(sidebar)});` : '',
    `  --sidebar-accent-foreground: ${ok(sidetext)};`,
    sborder ? `  --sidebar-border: ${ok(sborder)};` : '',
    active ? `  --sidebar-ring: ${ok(active)};` : '',
    `  --brand-primary: ${ok(btn)};`,
    accent ? `  --brand-accent: ${ok(accent)};` : '',
    // Sempre define a fonte: a custom (se houver) ou a padrão do sistema —
    // senão a --font-sans fica sem valor ao aplicar a paleta e a fonte muda.
    fonte
      ? `  --font-sans: "${fonte}", var(--font-plus-jakarta), var(--font-inter), sans-serif;`
      : `  --font-sans: var(--font-plus-jakarta), var(--font-inter), sans-serif;`,
  ].filter(Boolean)

  return `:root, .dark {\n${lines.join('\n')}\n}`
}

/**
 * Fetches the first available tenant's theme from Supabase and returns:
 * - A string of CSS variable overrides to inject into :root { … }
 * - The raw tema object for further use
 * - The tenant's favicon URL (if set)
 *
 * Returns empty css + nulls on any error so the caller can fall back to defaults.
 */
export async function getTenantTheme(): Promise<TenantThemeResult> {
  const empty: TenantThemeResult = {
    css: '',
    tema: null,
    tenantId: null,
    tenantNome: null,
    favicon: null,
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

    // Configurador de tema completo (paleta sidebar/conteúdo). Se presente,
    // gera a paleta inteira do app e ignora o caminho legado.
    const cores = (tema as any).cores
    if (cores && typeof cores === 'object') {
      const css = construirPaletaCompleta(cores, safeFont((tema as any).fonte))
      if (css) {
        return { css: css + cssFonteCor(tema as any), tema, tenantId: data.id as string, tenantNome: data.nome as string, favicon: (tema as any).favicon ?? null }
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

    const css =
      (lines.length > 0 ? `:root {\n${lines.join('\n')}\n}` : '') + cssFonteCor(tema as any)

    return {
      css,
      tema,
      tenantId: data.id as string,
      tenantNome: data.nome as string,
      favicon: tema.favicon ?? null,
    }
  } catch {
    return empty
  }
}
