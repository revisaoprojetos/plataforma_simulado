import { describe, expect, it } from 'vitest'
import { Schema } from '@tiptap/pm/model'
import { prepararDocEditor } from './notebook-doc-tolerante'

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*' },
    grifo: { group: 'block', atom: true, attrs: { texto: { default: '' } } },
    text: { group: 'inline' },
  },
  marks: { bold: {} },
})
const p = (t?: string) => ({ type: 'paragraph', ...(t === undefined ? {} : { content: [{ type: 'text', text: t }] }) })

describe('prepararDocEditor', () => {
  it('doc ausente/vazio => editor em branco (ok)', () => {
    expect(prepararDocEditor(null, schema)).toEqual({ doc: '', ok: true, alterou: false })
    expect(prepararDocEditor({}, schema)).toEqual({ doc: '', ok: true, alterou: false })
  })
  it('doc válido passa intacto', () => {
    const d = { type: 'doc', content: [{ type: 'grifo', attrs: { texto: 'x' } }, p('a')] }
    expect(prepararDocEditor(d, schema)).toEqual({ doc: d, ok: true, alterou: false })
  })
  it('remove texto vazio e nó desconhecido, mantendo o resto (cartão de grifo preservado)', () => {
    const d = { type: 'doc', content: [{ type: 'grifo', attrs: { texto: 'g' } }, { type: 'paragraph', content: [{ type: 'text', text: '' }] }, { type: 'inventado' }, p('fim')] }
    const r = prepararDocEditor(d, schema)
    expect(r.ok).toBe(true); expect(r.alterou).toBe(true)
    expect(JSON.stringify(r.doc)).toContain('"grifo"'); expect(JSON.stringify(r.doc)).toContain('fim'); expect(JSON.stringify(r.doc)).not.toContain('inventado')
  })
  it('descarta marks desconhecidas', () => {
    const r = prepararDocEditor({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a', marks: [{ type: 'bold' }, { type: 'fantasma' }] }] }] }, schema)
    expect(r.ok).toBe(true); expect(JSON.stringify(r.doc)).not.toContain('fantasma'); expect(JSON.stringify(r.doc)).toContain('bold')
  })
  it('doc só com lixo vira um parágrafo vazio (ok)', () => {
    const r = prepararDocEditor({ type: 'doc', content: [{ type: 'inventado' }] }, schema)
    expect(r.ok).toBe(true); expect(r.alterou).toBe(true)
  })
  it('irrecuperável => ok:false (UI abre somente leitura)', () => {
    expect(prepararDocEditor({ type: 'paragraph' }, schema).ok).toBe(false)
    expect(prepararDocEditor({ type: 'doc', content: [{ type: 'paragraph', content: [p('aninhado')] }] }, schema).ok).toBe(false)
  })
})
