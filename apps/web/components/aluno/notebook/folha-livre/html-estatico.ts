'use client'
// HTML ESTÁTICO de uma caixa de texto da folha livre (sem montar o TipTap). Usado nas folhas com MUITAS caixas (ver
// LIMIAR_CAIXAS_EDITOR_SOB_DEMANDA em caixa-texto-folha.tsx): só a caixa selecionada/focada monta um editor; as demais viram este HTML,
// estilizado pelo MESMO CSS `.nb-editor .ProseMirror`.
//
// `@tiptap/html` NÃO é dependência do projeto (e não foi instalada): renderizador próprio = schema do TipTap (`getSchema` das MESMAS
// extensões do editor) + `DOMSerializer` do ProseMirror (@tiptap/pm, já dependência). Cache por REFERÊNCIA do `doc` em WeakMap: a
// folha é imutável (um doc novo = outra referência), então cada doc é serializado uma única vez.
import { getSchema } from '@tiptap/react'
import { DOMSerializer, Node as PMNode, type Schema } from '@tiptap/pm/model'
import { criarExtensoesEditor } from '../extensoes-editor'

/** Nós que só existem como NodeView React (cartões/anexo): o HTML estático não os representa => essa caixa sempre monta o editor. */
const NOS_SO_VIEW = new Set(['anexo', 'questaoRef', 'grifoSnapshot', 'anotacaoRef'])

export type EstaticoCaixa = { html: string; seguro: boolean }
const cache = new WeakMap<object, EstaticoCaixa>()
let esquema: Schema | null = null
let serializador: DOMSerializer | null = null

/** O doc só tem nós que o HTML estático representa fielmente? */
export function docRenderizavelEstatico(doc: unknown): boolean {
  const visita = (n: unknown): boolean => {
    if (!n || typeof n !== 'object') return true
    const o = n as { type?: unknown; content?: unknown }
    if (typeof o.type === 'string' && NOS_SO_VIEW.has(o.type)) return false
    return !Array.isArray(o.content) || o.content.every(visita)
  }
  return visita(doc)
}

/** Remove qualquer script/atributo de evento/URL perigosa do fragmento gerado (defesa em profundidade; o doc já vem sanitizado). */
function limpar(raiz: ParentNode): void {
  raiz.querySelectorAll('script,style,iframe,object,embed').forEach((e) => e.remove())
  raiz.querySelectorAll('*').forEach((el) => {
    for (const a of Array.from(el.attributes)) {
      const nome = a.name.toLowerCase()
      if (nome.startsWith('on')) { el.removeAttribute(a.name); continue }
      if ((nome === 'href' || nome === 'src') && /^\s*(javascript|data|vbscript):/i.test(a.value) && !/^data:image\/(png|jpeg|webp|gif);/i.test(a.value)) el.removeAttribute(a.name)
    }
  })
}

/** HTML do `doc` (JSON TipTap). `seguro=false` => não use o estático (nó só-view ou doc que o schema não aceita). */
export function htmlEstaticoDoc(doc: Record<string, unknown> | undefined): EstaticoCaixa {
  if (!doc) return { html: '', seguro: true }
  const hit = cache.get(doc)
  if (hit) return hit
  let r: EstaticoCaixa
  try {
    if (!docRenderizavelEstatico(doc) || typeof document === 'undefined') throw new Error('nao-estatico')
    esquema ??= getSchema(criarExtensoesEditor())
    serializador ??= DOMSerializer.fromSchema(esquema)
    const no = PMNode.fromJSON(esquema, doc) // lança se o doc não bate com o schema
    const frag = serializador.serializeFragment(no.content, { document })
    const div = document.createElement('div')
    div.appendChild(frag)
    limpar(div)
    r = { html: div.innerHTML, seguro: true }
  } catch {
    r = { html: '', seguro: false }
  }
  cache.set(doc, r)
  return r
}
