// Esquema CANÔNICO do storage: como classificar cada objeto por bucket/categoria e
// qual é o caminho "certo" de um arquivo. Fonte única usada pela visão de uso, pelo
// navegador (badges) e pelo organizador. Mantém as decisões num só lugar.

export type Classificacao = 'OK' | 'MISPLACED' | 'ORPHAN' | 'UNKNOWN'

export interface CategoriaDef {
  chave: string
  label: string
}

/** Categorias conhecidas por bucket (top-level folder). "outras" = tudo que não casa. */
export const CATEGORIAS: Record<string, CategoriaDef[]> = {
  imagens: [
    { chave: 'assets', label: 'Diversos (assets)' },
    { chave: 'cadernos', label: 'Cadernos' },
    { chave: 'questoes', label: 'Questões' },
    { chave: 'logos', label: 'Logos' },
    { chave: 'banners', label: 'Banners' },
    { chave: 'bancos', label: 'Bancos' },
    { chave: 'fundos', label: 'Fundos' },
    { chave: 'outras', label: 'Outras' },
  ],
  pdfs: [
    { chave: 'materiais', label: 'Materiais (PDF)' },
    { chave: 'relatorios', label: 'Relatórios' },
    { chave: 'gerados', label: 'Cadernos gerados' },
    { chave: 'outras', label: 'Outras' },
  ],
  discursivas: [{ chave: 'anexos', label: 'Respostas discursivas' }],
  cadernos: [{ chave: 'outras', label: 'Outras' }],
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CAT_IMAGENS = new Set(['assets', 'cadernos', 'questoes', 'logos', 'banners', 'bancos', 'fundos'])

/** Rótulo amigável de uma categoria (cai na chave crua se desconhecida). */
export function rotuloCategoria(bucket: string, chave: string): string {
  return CATEGORIAS[bucket]?.find((c) => c.chave === chave)?.label ?? chave
}

/** Categoria (top-level) de um objeto — usada no breakdown e no navegador. */
export function categoriaDe(bucket: string, path: string): string {
  const first = path.split('/')[0] ?? ''
  if (bucket === 'imagens') return CAT_IMAGENS.has(first) ? first : 'outras'
  if (bucket === 'pdfs') {
    if (first === 'materiais') return 'materiais'
    if (first === 'relatorios') return 'relatorios'
    if (UUID_RE.test(first)) return 'gerados' // {tenantId}/{jobId}.pdf gerado pelo worker
    return 'outras'
  }
  if (bucket === 'discursivas') return 'anexos'
  return 'outras'
}

/** Prefixo de path para filtrar objetos de uma categoria no catálogo (LIKE `prefixo%`). */
export function prefixoDaCategoria(bucket: string, categoria: string): { like: string | null; especial?: 'gerados' | 'outras' } {
  if (bucket === 'imagens') {
    if (categoria === 'outras') return { like: null, especial: 'outras' }
    return { like: `${categoria}/` }
  }
  if (bucket === 'pdfs') {
    if (categoria === 'materiais') return { like: 'materiais/' }
    if (categoria === 'relatorios') return { like: 'relatorios/' }
    if (categoria === 'gerados') return { like: null, especial: 'gerados' }
    return { like: null, especial: 'outras' }
  }
  return { like: null } // discursivas/cadernos: categoria única = bucket inteiro
}

/**
 * Extrai { bucket, path } de uma URL de storage do Supabase (pública OU assinada).
 * Ex.: .../storage/v1/object/public/imagens/questoes/x.png?token=... → { imagens, questoes/x.png }
 */
export function parseStorageUrl(u: string | null | undefined): { bucket: string; path: string } | null {
  if (!u || typeof u !== 'string') return null
  const m = /\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+?)(?:\?|$)/.exec(u)
  if (!m) return null
  try {
    return { bucket: m[1], path: decodeURIComponent(m[2]) }
  } catch {
    return { bucket: m[1], path: m[2] }
  }
}

/** Slug ASCII estável (para pastas por-simulado). Porta de reorganizar-storage-cadernos.mjs. */
export function slug(s: string): string {
  return (s || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'sem-nome'
}

/**
 * Caminho CANÔNICO de um objeto, ou null quando não há correção segura a fazer.
 * Conservador de propósito: só devolve destino quando temos CERTEZA (senão o
 * organizador não mexe). Hoje corrige o único caso claramente errado:
 *  - discursivas com prefixo DUPLICADO (`discursivas/{tenant}/...` dentro do bucket
 *    `discursivas`) → deve ser `{tenant}/{resposta}/{arquivo}`.
 * O esquema de imagens usa `assets/{hash}` de propósito (dedupe) → NÃO é "misplaced".
 */
export function pathCanonico(input: { bucket: string; pathAtual: string }): string | null {
  const { bucket, pathAtual } = input
  if (bucket === 'discursivas' && pathAtual.startsWith('discursivas/')) {
    return pathAtual.replace(/^discursivas\//, '')
  }
  return null
}

export function ehUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v)
}
