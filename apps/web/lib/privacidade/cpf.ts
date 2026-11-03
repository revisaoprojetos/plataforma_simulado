/**
 * Ocultação de CPF na VISUALIZAÇÃO do admin (LGPD).
 *
 * Regra: dentro do portal, só o SUPER-ADMIN global vê o CPF completo. Os demais papéis
 * (admin do tenant, cargos RBAC) recebem o CPF MASCARADO — e a máscara é aplicada NO
 * SERVIDOR, antes de o dado ir ao navegador (o CPF real nem chega ao HTML/JSON do cliente).
 *
 * O CPF continua sendo USADO normalmente em tudo que não é exibição: busca no servidor
 * (ilike na coluna real), dedupe/casamento de importação, integrações (Guru/Curseduca),
 * login do aluno, webhooks de saída. Só a resposta que vai para a tela é mascarada.
 *
 * Este arquivo é puro (sem dependências de servidor) → pode ser importado no cliente
 * (ex.: para reconhecer um valor mascarado). A decisão "pode ver?" fica em `cpf-server.ts`.
 */

/** Caractere usado na máscara — também serve para reconhecer um valor mascarado. */
const M = '*'

/**
 * Mascara um CPF mantendo só os 6 dígitos do meio (padrão usual de LGPD):
 * `123.456.789-00` → `***.456.789-**`. Valores fora do formato (CNPJ, lixo) ficam com
 * apenas os 2 últimos dígitos visíveis. Vazio/nulo → null.
 */
export function mascararCpf(v: string | null | undefined): string | null {
  if (v == null) return null
  const s = String(v).trim()
  if (!s) return null
  if (ehCpfMascarado(s)) return s
  const d = s.replace(/\D/g, '')
  if (d.length === 11) return `${M.repeat(3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${M.repeat(2)}`
  if (d.length <= 2) return M.repeat(3)
  return `${M.repeat(Math.max(3, d.length - 2))}${d.slice(-2)}`
}

/** true se o valor já está mascarado (veio da tela assim) — não deve ser gravado no banco. */
export function ehCpfMascarado(v: string | null | undefined): boolean {
  return typeof v === 'string' && v.includes(M)
}

/** Chaves de objeto que carregam CPF/documento em payloads (Guru usa `doc`, outros `document`…). */
const CHAVE_DOC = /^(cpf|cpf_cnpj|cpfcnpj|doc|document|documento|document_number|doc_number|tax_?id|cnpj|nr_?documento)$/i

/** CPF formatado solto dentro de um texto (`123.456.789-00`). */
const CPF_FORMATADO = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g
/** Par chave/valor de documento em JSON cru: `"cpf":"12345678900"` ou `"doc": 12345678900`. */
const JSON_DOC = /("(?:cpf|cpf_cnpj|cpfcnpj|doc|document|documento|document_number|doc_number|tax_?id|cnpj|nr_?documento)"\s*:\s*)("?)([^",}\]]*)\2/gi
/** Par de query/form-urlencoded: `cpf=12345678900`. */
const FORM_DOC = /(\b(?:cpf|cpf_cnpj|doc|document|documento|cnpj)=)([^&\s]*)/gi

const dec = (x: string) => { try { return decodeURIComponent(x) } catch { return x } }

/** Mascara CPFs dentro de um texto livre / corpo cru de requisição. */
export function mascararCpfTexto(s: string | null | undefined): string | null {
  if (s == null) return null
  return String(s)
    .replace(JSON_DOC, (m, k: string, q: string, val: string) => {
      // Sem aspas: só número é documento (null/true/objeto ficam como estão); vira string mascarada.
      if (!q) return /^\s*\d+\s*$/.test(val) ? `${k}"${mascararCpf(val)}"` : m
      return `${k}"${mascararCpf(dec(val)) ?? ''}"`
    })
    .replace(FORM_DOC, (_m, k: string, val: string) => `${k}${mascararCpf(dec(val)) ?? ''}`)
    .replace(CPF_FORMATADO, (m) => mascararCpf(m) ?? m)
}

/**
 * Mascara CPF em qualquer estrutura (payload de webhook, diff de auditoria…): valores sob
 * chaves de documento são mascarados; strings soltas têm CPFs formatados mascarados.
 * Não muta o original.
 */
export function mascararCpfProfundo<T>(v: T, prof = 0): T {
  if (prof > 12 || v == null) return v
  if (typeof v === 'string') return mascararCpfTexto(v) as unknown as T
  if (Array.isArray(v)) return v.map((x) => mascararCpfProfundo(x, prof + 1)) as unknown as T
  if (typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      out[k] = CHAVE_DOC.test(k) && (typeof x === 'string' || typeof x === 'number')
        ? mascararCpf(String(x))
        : mascararCpfProfundo(x, prof + 1)
    }
    return out as T
  }
  return v
}
