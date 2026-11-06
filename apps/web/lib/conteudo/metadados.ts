// METADADOS dos conteúdos da Biblioteca (coluna jsonb `simulado_conteudo_documentos.metadados`).
// Módulo PURO (sem server-only, sem 'use server') → usável no client (colunas/filtros) e no server
// (import/export de planilha). Fonte única dos campos, rótulos e validação.

export type CampoMeta = 'disciplina' | 'assunto_especifico' | 'tribunal' | 'informativo' | 'ano' | 'estado_origem' | 'selos'

export interface Metadados {
  disciplina?: string
  assunto_especifico?: string
  tribunal?: string
  informativo?: string
  ano?: number
  estado_origem?: string
  /** Etiquetas do conteúdo, separadas por vírgula (ex.: "Novo, Repercussão geral"). */
  selos?: string
}

/** Campos que guardam VÁRIOS valores separados por vírgula (chips na lista, filtro por item). */
export const CAMPOS_MULTI: CampoMeta[] = ['tribunal', 'selos']

/** "a, b ,a" → ["a","b"] (sem vazios, sem repetidos ignorando caixa/acento). */
export function listaMulti(s: unknown): string[] {
  const vistos = new Set<string>()
  const out: string[] = []
  for (const parte of String(s ?? '').split(',')) {
    const v = parte.trim()
    const n = normTexto(v)
    if (v && !vistos.has(n)) { vistos.add(n); out.push(v) }
  }
  return out
}

/** Campos editáveis (ordem = ordem das colunas na lista e na planilha). `rot` = rótulo único (lista + planilha). */
export const CAMPOS_META: { k: CampoMeta; rot: string; dica: string }[] = [
  { k: 'disciplina', rot: 'Disciplina', dica: 'Texto livre (ex.: Direito Administrativo)' },
  { k: 'assunto_especifico', rot: 'Assunto específico', dica: 'Texto livre' },
  { k: 'tribunal', rot: 'Tribunais', dica: 'Ex.: STF, STJ, TST (separe vários com vírgula)' },
  { k: 'informativo', rot: 'Informativo', dica: 'Ex.: Info 1100' },
  { k: 'ano', rot: 'Ano', dica: 'Número entre 1900 e 2100' },
  { k: 'estado_origem', rot: 'Estado de origem', dica: 'Sigla da UF (ex.: SP, RJ)' },
  { k: 'selos', rot: 'Selos', dica: 'Etiquetas do conteúdo (ex.: Novo, Repercussão geral — separe vários com vírgula)' },
]

export const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'] as const

/** minúsculo, sem acento, espaços colapsados — p/ casar cabeçalhos e títulos. */
export function normTexto(s: unknown): string {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

const MAX_TXT = 200

/** Sanitiza o jsonb vindo do banco (qualquer lixo → só os campos conhecidos, com tipo certo). */
export function normalizarMetadados(v: unknown): Metadados {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
  const o = v as Record<string, unknown>
  const out: Metadados = {}
  for (const k of ['disciplina', 'assunto_especifico', 'tribunal', 'informativo', 'estado_origem'] as const) {
    const s = typeof o[k] === 'string' ? (o[k] as string).trim() : ''
    if (s) out[k] = s.slice(0, MAX_TXT)
  }
  if (typeof o.selos === 'string') {
    const s = listaMulti(o.selos).join(', ').slice(0, MAX_TXT)
    if (s) out.selos = s
  }
  const a = typeof o.ano === 'number' ? o.ano : parseInt(String(o.ano ?? ''), 10)
  if (Number.isFinite(a) && a >= 1900 && a <= 2100) out.ano = a
  return out
}

export type ResultadoCampo = { ok: true; valor: string | number } | { ok: false; erro: string }

/**
 * Valida UM valor digitado/importado. Entrada já não-vazia. Devolve o valor normalizado ou o erro.
 * (Vazio e "-" são tratados por quem chama: vazio = mantém, "-" = limpa.)
 */
export function validarCampoMeta(k: CampoMeta, bruto: unknown): ResultadoCampo {
  const s = String(bruto ?? '').trim()
  if (k === 'ano') {
    const n = Number(s.replace(',', '.'))
    if (!Number.isInteger(n) || n < 1900 || n > 2100) return { ok: false, erro: 'Ano inválido (use um número entre 1900 e 2100)' }
    return { ok: true, valor: n }
  }
  if (k === 'estado_origem') {
    const uf = s.toUpperCase()
    if (!(UFS as readonly string[]).includes(uf)) return { ok: false, erro: 'Estado inválido (use a sigla da UF, ex.: SP)' }
    return { ok: true, valor: uf }
  }
  const valor = k === 'selos' ? listaMulti(s).join(', ') : s // selos: tira vazios/repetidos
  if (valor.length > MAX_TXT) return { ok: false, erro: `${CAMPOS_META.find((c) => c.k === k)?.rot ?? k}: máximo de ${MAX_TXT} caracteres` }
  return { ok: true, valor }
}

/** Texto exibido na célula da lista. */
export function textoMeta(m: Metadados | undefined, k: CampoMeta): string {
  const v = m?.[k]
  return v == null || v === '' ? '' : String(v)
}
