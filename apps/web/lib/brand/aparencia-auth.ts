// Config de APARÊNCIA de login/carregamento por plataforma (tenant), spec 02 §4.
// Guardada dentro do `tema` jsonb do tenant, na chave `tema.aparencia_auth` (sem migração) —
// mesmo padrão de leitura/escrita do resto do tema (ver lib/tenant-theme.ts; salvarTemaSuperAction
// faz merge raso em tenants.tema).
//
// Esta é só a FUNDAÇÃO do ativador: define o shape, lê/sanea com fallback por marca e valida
// slug/tema. Os componentes visuais PlatformLogin/PlatformLoader que CONSOMEM isto vêm na
// próxima fase (ver lib/brand/appearance-catalogo.ts).

import {
  type Brand,
  type Theme,
  BRANDS,
  catalogoDaMarca,
  loginSlugValido,
  loadingSlugValido,
  temaValido,
} from './appearance-catalogo'

export type { Brand, Theme }

/** Título animado (ticker) do login MEQ — palavras configuráveis + liga/desliga a animação. */
export interface LoginTicker {
  /** `true` = alterna as palavras (animação de entrada); `false` = mostra só a primeira, estática. */
  animar: boolean
  /** Palavras exibidas no título do login (ex.: ["Tribunais.", "Polícias.", "Fiscais."]). */
  palavras: string[]
}

export const TICKER_PADRAO: LoginTicker = { animar: false, palavras: ['Tribunais.'] }

/** Sanea o ticker vindo do tema/console: strings não-vazias (máx. 8), fallback "Tribunais.". */
export function sanearTicker(raw: unknown): LoginTicker {
  const r = (raw ?? {}) as Partial<LoginTicker>
  const palavras = Array.isArray(r.palavras)
    ? r.palavras.map((p) => (typeof p === 'string' ? p.trim() : '')).filter(Boolean).slice(0, 8)
    : []
  return {
    animar: r.animar === true,
    palavras: palavras.length ? palavras : [...TICKER_PADRAO.palavras],
  }
}

export interface AuthAppearance {
  brand: Brand
  /**
   * ATIVADOR do NOVO login por marca. `false` (padrão) = mantém o login atual
   * (AlunoEntrarForm, ricamente configurável por tenant — produção intacta). Só
   * quando ligado explicitamente no console é que a tela usa o PlatformLogin do slug.
   */
  loginAtivo: boolean
  /**
   * ATIVADOR do carregamento branded. `true` (padrão) preserva o comportamento já
   * no ar (PlatformLoader); um admin pode desligar para voltar ao modelo genérico.
   */
  loadingAtivo: boolean
  /**
   * ATIVADOR do NOVO visual INTERNO (portal do aluno: Início/Perfil/Resultado/…).
   * `false` (padrão) = portal atual intacto. Só quando ligado é que as telas internas
   * redesenhadas passam a ser usadas (ligadas aos dados reais, área por área).
   */
  internoAtivo: boolean
  loginStyle: string // slug do catálogo (validado contra a marca)
  loadingStyle: string // slug do catálogo
  defaultTheme: Theme // tema da tela de login/loading antes do usuário logar
  followSystemTheme: boolean // se true, usa prefers-color-scheme quando o usuário não escolheu
  loadingMinMs?: number | null // override opcional; null = padrão do estilo (§3.4)
  /** Título animado (ticker) do login MEQ — editável no console. */
  loginTicker: LoginTicker
}

/** Shape público devolvido pelo endpoint pré-login (sem metadados). */
export type AuthAppearancePublic = Omit<AuthAppearance, 'loadingMinMs'> & { loadingMinMs: number | null }

/**
 * Infere a marca a partir do slug/nome do tenant quando `tema.aparencia_auth.brand`
 * ainda não foi escolhido. Default: Revisão. (A marca pode ser trocada no console.)
 */
export function inferirMarca(tenant?: { slug?: string | null; nome?: string | null } | null): Brand {
  const s = `${tenant?.slug ?? ''} ${tenant?.nome ?? ''}`.toLowerCase()
  if (/\bmeq\b|meqconcursos/.test(s)) return 'meq'
  if (/\bvnd\b|defensoria|vocenadefensoria/.test(s)) return 'vnd'
  return 'revisao'
}

function brandValida(b: unknown): b is Brand {
  return typeof b === 'string' && (BRANDS as string[]).includes(b)
}

/**
 * Lê e sanea a config a partir do objeto `tema` do tenant. Slug inválido/ausente,
 * tema incompatível ou marca ausente caem no FALLBACK da marca (§4).
 *
 * @param tema       objeto `tema` do tenant (tenants.tema jsonb)
 * @param tenantInfo opcional p/ inferir a marca quando ela ainda não foi escolhida
 */
export function lerAparenciaAuth(
  tema: unknown,
  tenantInfo?: { slug?: string | null; nome?: string | null } | null,
): AuthAppearance {
  const raw = ((tema as any)?.aparencia_auth ?? {}) as Partial<AuthAppearance>

  const brand: Brand = brandValida(raw.brand) ? raw.brand : inferirMarca(tenantInfo)
  const cat = catalogoDaMarca(brand)

  const loginStyle = typeof raw.loginStyle === 'string' && loginSlugValido(brand, raw.loginStyle)
    ? raw.loginStyle
    : cat.fallback.login
  const loadingStyle = typeof raw.loadingStyle === 'string' && loadingSlugValido(brand, raw.loadingStyle)
    ? raw.loadingStyle
    : cat.fallback.loading
  const defaultTheme: Theme = temaValido(brand, raw.defaultTheme as Theme)
    ? (raw.defaultTheme as Theme)
    : cat.fallback.theme
  const followSystemTheme = raw.followSystemTheme === true
  const loadingMinMs = typeof raw.loadingMinMs === 'number' && raw.loadingMinMs >= 0 ? raw.loadingMinMs : null
  // Opt-in do novo login = default FALSE (não mexe na produção). Loading branded = default TRUE
  // (já no ar); só desliga se gravado explicitamente como false.
  const loginAtivo = raw.loginAtivo === true
  const loadingAtivo = raw.loadingAtivo !== false
  const internoAtivo = raw.internoAtivo === true
  const loginTicker = sanearTicker(raw.loginTicker)

  return { brand, loginAtivo, loadingAtivo, internoAtivo, loginStyle, loadingStyle, defaultTheme, followSystemTheme, loadingMinMs, loginTicker }
}

/** Projeção pública (lida ANTES do login, sem dados sensíveis). */
export function aparenciaAuthPublica(a: AuthAppearance): AuthAppearancePublic {
  return {
    brand: a.brand,
    loginAtivo: a.loginAtivo,
    loadingAtivo: a.loadingAtivo,
    internoAtivo: a.internoAtivo,
    loginStyle: a.loginStyle,
    loadingStyle: a.loadingStyle,
    defaultTheme: a.defaultTheme,
    followSystemTheme: a.followSystemTheme,
    loadingMinMs: a.loadingMinMs ?? null,
    loginTicker: a.loginTicker,
  }
}

/**
 * Sanea um objeto vindo do console antes de gravar em `tema.aparencia_auth`.
 * Força slug/tema coerentes com a marca escolhida (slug inválido → fallback).
 */
export function sanearAparenciaAuth(input: Partial<AuthAppearance>): AuthAppearance {
  const brand: Brand = brandValida(input.brand) ? input.brand : 'revisao'
  const cat = catalogoDaMarca(brand)
  return {
    brand,
    loginAtivo: input.loginAtivo === true,
    loadingAtivo: input.loadingAtivo !== false,
    internoAtivo: input.internoAtivo === true,
    loginStyle: typeof input.loginStyle === 'string' && loginSlugValido(brand, input.loginStyle) ? input.loginStyle : cat.fallback.login,
    loadingStyle: typeof input.loadingStyle === 'string' && loadingSlugValido(brand, input.loadingStyle) ? input.loadingStyle : cat.fallback.loading,
    defaultTheme: temaValido(brand, input.defaultTheme as Theme) ? (input.defaultTheme as Theme) : cat.fallback.theme,
    followSystemTheme: input.followSystemTheme === true,
    loadingMinMs: typeof input.loadingMinMs === 'number' && input.loadingMinMs >= 0 ? input.loadingMinMs : null,
    loginTicker: sanearTicker(input.loginTicker),
  }
}
