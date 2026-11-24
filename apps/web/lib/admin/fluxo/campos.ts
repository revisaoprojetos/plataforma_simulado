/** Utilitários PUROS de campos do painel de fluxo (texto <-> valor e validação de formulário). O servidor revalida tudo. */
import type { CampoSchema } from './adaptador'

export const textoDoValor = (v: unknown): string => (Array.isArray(v) ? v.join(', ') : v == null ? '' : String(v))

/** Texto digitado → valor tipado. Inválido → NaN (número) / array com NaN (lista), para `validarCampo` reprovar com mensagem. */
export function valorDoTexto(c: CampoSchema, t: string): unknown {
  switch (c.tipo) {
    case 'bool': return t === 'true'
    case 'lista': return t.split(/[,;\s]+/).filter(Boolean).map(Number)
    case 'int': case 'real': return t.trim() === '' ? Number.NaN : Number(t.replace(',', '.'))
    default: return t
  }
}

/** Mensagem de erro ou `null` se o valor é aceitável para o campo. */
export function validarCampo(c: CampoSchema, v: unknown): string | null {
  const lim = (n: number) => (c.min != null && n < c.min ? `Mínimo ${c.min}.` : c.max != null && n > c.max ? `Máximo ${c.max}.` : null)
  switch (c.tipo) {
    case 'bool': return typeof v === 'boolean' ? null : 'Valor inválido.'
    case 'int': case 'real': {
      if (typeof v !== 'number' || !Number.isFinite(v)) return 'Informe um número.'
      if (c.tipo === 'int' && !Number.isInteger(v)) return 'Informe um número inteiro.'
      return lim(v)
    }
    case 'lista': {
      if (!Array.isArray(v) || !v.length) return 'Informe ao menos um valor.'
      for (const n of v) { if (typeof n !== 'number' || !Number.isInteger(n)) return 'Use números inteiros separados por vírgula.'; const e = lim(n); if (e) return e }
      return null
    }
    case 'opcao': return c.opcoes?.some((o) => o.valor === v) ? null : 'Escolha uma opção.'
    case 'cor': return v === '' || v == null || (typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$|^[a-z-]+$/.test(v)) ? null : 'Cor inválida.'
    case 'texto': {
      if (typeof v !== 'string') return 'Valor inválido.'
      const n = v.trim().length
      return c.min != null && n < c.min ? 'Preenchimento obrigatório.' : c.max != null && n > c.max ? `Máximo ${c.max} caracteres.` : null
    }
  }
}

const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
/** Só o que mudou em relação ao valor vigente (chave → novo valor). */
export function valoresAlterados(campos: readonly CampoSchema[], rascunho: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const c of campos) if (c.chave in rascunho && !igual(rascunho[c.chave], c.valor)) out[c.chave] = rascunho[c.chave]
  return out
}
/** Erros por chave (só dos campos presentes no rascunho). */
export function errosDoRascunho(campos: readonly CampoSchema[], rascunho: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const c of campos) if (c.chave in rascunho) { const e = validarCampo(c, rascunho[c.chave]); if (e) out[c.chave] = e }
  return out
}
