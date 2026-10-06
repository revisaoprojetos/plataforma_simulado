// Catálogo de estilos de LOGIN e CARREGAMENTO por marca (spec 02 §1).
// FUNDAÇÃO do ativador: lista os SLUGS selecionáveis no console + os fallbacks (§4).
// Os componentes visuais em si (PlatformLogin/PlatformLoader por slug) vêm em fase posterior.

export type Brand = 'revisao' | 'vnd' | 'meq'
export type Theme = 'claro' | 'escuro' | 'azul' // 'azul' só MEQ

export interface EstiloItem {
  slug: string
  /** Nome legível para o seletor no console. */
  nome: string
  /** Tags curtas ("com SIMULA", "só quadrados", "com efeitos"…). */
  tags: string[]
}

export interface BrandCatalogo {
  brand: Brand
  nome: string
  /** Temas disponíveis p/ essa marca (Revisão/VND: claro+escuro; MEQ: +azul). */
  temas: Theme[]
  login: EstiloItem[]
  loading: EstiloItem[]
  /** Fallbacks do §4 — usados quando o slug é inválido/ausente. */
  fallback: { login: string; loading: string; theme: Theme }
}

// ─────────────────────────── Revisão (§1.1 login, §1.2 loading) ───────────────────────────
const REVISAO: BrandCatalogo = {
  brand: 'revisao',
  nome: 'Revisão',
  temas: ['claro', 'escuro'],
  login: [
    { slug: 'rev-login-classico', nome: 'Clássico', tags: ['base'] },
    { slug: 'rev-login-formas', nome: 'Clássico com formas', tags: ['com formas', 'quadrados'] },
    { slug: 'rev-login-quadrados', nome: 'Clássico com quadrados', tags: ['só quadrados'] },
    { slug: 'rev-login-lista', nome: 'Logo e lista', tags: ['com logo e lista'] },
    { slug: 'rev-login-lista-efeitos', nome: 'Lista com efeitos', tags: ['com efeitos'] },
    { slug: 'rev-login-lista-quadrados', nome: 'Lista com quadrados', tags: ['só quadrados'] },
    { slug: 'rev-login-codigo', nome: 'Código do Estudante', tags: ['código'] },
    { slug: 'rev-login-codigo-efeitos', nome: 'Código com efeitos', tags: ['código', 'com efeitos'] },
    { slug: 'rev-login-codigo-quadrados', nome: 'Código com quadrados', tags: ['código', 'só quadrados'] },
  ],
  loading: [
    { slug: 'rev-loading-classico', nome: 'Clássico', tags: ['base'] },
    { slug: 'rev-loading-formas', nome: 'Clássico com formas', tags: ['com formas'] },
    { slug: 'rev-loading-quadrados', nome: 'Clássico com quadrados', tags: ['só quadrados'] },
    { slug: 'rev-loading-circuito', nome: 'Circuito (estilo MEQ)', tags: ['circuito'] },
    { slug: 'rev-loading-circuito-efeitos', nome: 'Circuito com efeitos', tags: ['circuito', 'com efeitos'] },
    { slug: 'rev-loading-circuito-quadrados', nome: 'Circuito com quadrados', tags: ['circuito', 'só quadrados'] },
  ],
  fallback: { login: 'rev-login-classico', loading: 'rev-loading-classico', theme: 'claro' },
}

// ─────────────────────────── VND (§1.3 login, §1.4 loading) ───────────────────────────
const VND: BrandCatalogo = {
  brand: 'vnd',
  nome: 'VND',
  temas: ['claro', 'escuro'],
  login: [
    { slug: 'vnd-login-centralizado', nome: 'Centralizado', tags: ['sem SIMULA'] },
    { slug: 'vnd-login-centralizado-simula', nome: 'Centralizado com SIMULA', tags: ['com SIMULA'] },
    { slug: 'vnd-login-vitrine-simula', nome: 'Vitrine com SIMULA', tags: ['vitrine', 'com SIMULA'] },
    { slug: 'vnd-login-vitrine', nome: 'Vitrine', tags: ['vitrine', 'sem SIMULA'] },
    { slug: 'vnd-login-dividido-simula', nome: 'Dividido com SIMULA', tags: ['dividido', 'com SIMULA'] },
    { slug: 'vnd-login-dividido', nome: 'Dividido', tags: ['dividido', 'sem SIMULA'] },
  ],
  loading: [
    { slug: 'vnd-loading-classico', nome: 'Clássico', tags: ['base'] },
    { slug: 'vnd-loading-classico-simula', nome: 'Clássico com SIMULA', tags: ['com SIMULA'] },
    { slug: 'vnd-loading-circuito', nome: 'Circuito (estilo MEQ)', tags: ['circuito'] },
    { slug: 'vnd-loading-circuito-simula', nome: 'Circuito com SIMULA', tags: ['circuito', 'com SIMULA'] },
    { slug: 'vnd-loading-circuito-vertical', nome: 'Circuito vertical', tags: ['circuito', 'V em cima'] },
    { slug: 'vnd-loading-circuito-vertical-simula', nome: 'Circuito vertical com SIMULA', tags: ['circuito', 'com SIMULA', 'V em cima'] },
  ],
  fallback: { login: 'vnd-login-centralizado', loading: 'vnd-loading-classico', theme: 'claro' },
}

// ─────────────────────────── MEQ (§1.5 login, §1.6 loading) — 3 temas ───────────────────────────
const MEQ: BrandCatalogo = {
  brand: 'meq',
  nome: 'MEQ',
  temas: ['claro', 'azul', 'escuro'],
  login: [
    { slug: 'meq-login-circuito', nome: 'Circuito', tags: ['circuito'] },
    { slug: 'meq-login-dividido', nome: 'Dividido', tags: ['dividido'] },
    { slug: 'meq-login-trilha', nome: 'Trilha', tags: ['trilha'] },
  ],
  loading: [
    { slug: 'meq-loading-montagem', nome: 'Montagem', tags: ['montagem'] },
    { slug: 'meq-loading-circuito', nome: 'Circuito', tags: ['circuito'] },
  ],
  fallback: { login: 'meq-login-circuito', loading: 'meq-loading-circuito', theme: 'claro' },
}

export const APPEARANCE_CATALOGO: Record<Brand, BrandCatalogo> = {
  revisao: REVISAO,
  vnd: VND,
  meq: MEQ,
}

export const BRANDS: Brand[] = ['revisao', 'vnd', 'meq']

export function catalogoDaMarca(brand: Brand): BrandCatalogo {
  return APPEARANCE_CATALOGO[brand] ?? REVISAO
}

/** true se o slug existe na lista de LOGIN da marca. */
export function loginSlugValido(brand: Brand, slug: string): boolean {
  return catalogoDaMarca(brand).login.some((e) => e.slug === slug)
}

/** true se o slug existe na lista de LOADING da marca. */
export function loadingSlugValido(brand: Brand, slug: string): boolean {
  return catalogoDaMarca(brand).loading.some((e) => e.slug === slug)
}

/** true se o tema é permitido para a marca (MEQ aceita 'azul'; as demais, não). */
export function temaValido(brand: Brand, theme: Theme): boolean {
  return catalogoDaMarca(brand).temas.includes(theme)
}
