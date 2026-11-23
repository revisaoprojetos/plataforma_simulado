// Doc TipTap/ProseMirror "tolerante": o TipTap, ao receber um JSON que o schema não aceita (nó de texto vazio, nó desconhecido,
// `doc` sem bloco...), apenas LOGA "[tiptap warn]: Invalid content" e abre o editor EM BRANCO — e o primeiro autosave sobrescreve o
// conteúdo real do servidor com um doc vazio (perda de dados). Este módulo (puro, sem React) prepara o doc antes de ir ao editor:
//   1) se o doc já é válido, passa direto;
//   2) senão remove nós de texto vazios, nós/marks desconhecidos e garante ao menos um bloco, e revalida;
//   3) se mesmo assim for inválido devolve `ok:false` — a UI abre a página SOMENTE LEITURA com aviso (nunca grava por cima).
import { Node as PMNode, type Schema } from '@tiptap/pm/model'

type J = { type?: unknown; text?: unknown; content?: unknown; marks?: unknown; attrs?: unknown }
export type DocPreparado = { doc: Record<string, unknown> | ''; ok: boolean; alterou: boolean }

function limpar(n: unknown, schema: Schema): J | null {
  if (!n || typeof n !== 'object') return null
  const o = n as J
  if (typeof o.type !== 'string') return null
  if (o.type === 'text') {
    if (typeof o.text !== 'string' || o.text === '') return null
    const marks = Array.isArray(o.marks) ? o.marks.filter((m) => m && typeof (m as J).type === 'string' && schema.marks[(m as J).type as string]) : []
    const { marks: _m, ...resto } = o
    return marks.length ? { ...resto, marks } : resto
  }
  if (!schema.nodes[o.type]) return null
  if (!Array.isArray(o.content)) return o
  const content = o.content.map((c) => limpar(c, schema)).filter((c): c is J => !!c)
  return { ...o, content }
}

const valido = (schema: Schema, doc: unknown): boolean => {
  try { const n = PMNode.fromJSON(schema, doc as Record<string, unknown>); n.check(); return n.type === schema.topNodeType } catch { return false }
}

/** Doc vazio/ausente => `''` (o editor começa em branco, o que é legítimo). */
export function prepararDocEditor(doc: unknown, schema: Schema): DocPreparado {
  if (!doc || typeof doc !== 'object' || !Object.keys(doc as object).length) return { doc: '', ok: true, alterou: false }
  if (valido(schema, doc)) return { doc: doc as Record<string, unknown>, ok: true, alterou: false }
  const l = limpar(doc, schema)
  if (l && l.type === 'doc') {
    const content = Array.isArray(l.content) && l.content.length ? l.content : [{ type: 'paragraph' }]
    const limpo = { ...l, content } as Record<string, unknown>
    if (valido(schema, limpo)) return { doc: limpo, ok: true, alterou: true }
  }
  return { doc: '', ok: false, alterou: false }
}
