'use client'
// Extensões TipTap da Onda 2a (texto rico + imagem + anexo). Sem pacotes novos: marks/atributos escritos sobre @tiptap/core.
// Tudo que sai daqui é revalidado no servidor (lista branca em lib/aluno/notebook-server.ts).
import { Extension, Mark, Node, mergeAttributes, NodeViewWrapper, ReactNodeViewRenderer, type Editor, type NodeViewProps } from '@tiptap/react'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { useRef } from 'react'
import { Paperclip } from 'lucide-react'
import { ALINHAMENTOS, ESTILOS_PARAGRAFO, MARCAS_PARAGRAFO, ROTA_ARQUIVOS_NOTEBOOK } from '@/lib/aluno/notebook-tipos'
import { arquivoAnexoValido, corValida, familiaValida, formatarTamanho, srcImagemValido, tamanhoFonteValido } from '@/lib/aluno/notebook-texto'
import { teclaTab } from './onenote/acoes-texto'
import { avisarCaderno, ehAnexoPermitido, ehImagem, enviarArquivoCaderno } from './onenote/upload-arquivos'

// ---------------------------------------------------------------- utilitários de parse (HTML colado)
function rgbParaHex(v: string): string | null {
  const m = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i.exec(v.trim())
  if (!m) return null
  return '#' + [m[1], m[2], m[3]].map((n) => Math.min(255, Number(n)).toString(16).padStart(2, '0')).join('')
}
const corDoCss = (v: string): string | null => (v ? corValida(rgbParaHex(v) ?? v) : null)
const cssCor = (c: unknown) => { const v = corValida(c); return v && (v.startsWith('#') || v.startsWith('var(')) ? v : null }

// ---------------------------------------------------------------- marks
export const TextStyle = Mark.create({
  name: 'textStyle',
  addAttributes() {
    return {
      color: { default: null, parseHTML: (el: HTMLElement) => corDoCss(el.style.color), renderHTML: (a: any) => { const c = cssCor(a.color); return c ? { style: `color:${c}` } : {} } },
      fontFamily: { default: null, parseHTML: (el: HTMLElement) => familiaValida(el.style.fontFamily?.split(',')[0]?.replace(/["']/g, '')), renderHTML: (a: any) => { const f = familiaValida(a.fontFamily); return f ? { style: `font-family:${f}` } : {} } },
      fontSize: { default: null, parseHTML: (el: HTMLElement) => tamanhoFonteValido(el.style.fontSize), renderHTML: (a: any) => { const s = tamanhoFonteValido(a.fontSize); return s ? { style: `font-size:${s}` } : {} } },
    }
  },
  parseHTML() { return [{ tag: 'span', consuming: false, getAttrs: (el: any) => ((el as HTMLElement).style?.color || (el as HTMLElement).style?.fontFamily || (el as HTMLElement).style?.fontSize ? {} : false) }] },
  renderHTML({ HTMLAttributes }) { return ['span', HTMLAttributes, 0] },
})

export const Realce = Mark.create({
  name: 'highlight',
  addAttributes() {
    return { color: { default: null, parseHTML: (el: HTMLElement) => corDoCss(el.style.backgroundColor), renderHTML: (a: any) => { const c = cssCor(a.color); return c ? { style: `background-color:${c}` } : {} } } }
  },
  parseHTML() { return [{ tag: 'mark' }] },
  renderHTML({ HTMLAttributes }) { return ['mark', HTMLAttributes, 0] }, // cor padrão: CSS_TEXTO (token); com `color`, o style inline vence
})

export const Subscrito = Mark.create({
  name: 'subscript', excludes: 'superscript',
  parseHTML() { return [{ tag: 'sub' }, { style: 'vertical-align', getAttrs: (v: any) => (v === 'sub' ? {} : false) }] },
  renderHTML({ HTMLAttributes }) { return ['sub', HTMLAttributes, 0] },
})
export const Sobrescrito = Mark.create({
  name: 'superscript', excludes: 'subscript',
  parseHTML() { return [{ tag: 'sup' }, { style: 'vertical-align', getAttrs: (v: any) => (v === 'super' ? {} : false) }] },
  renderHTML({ HTMLAttributes }) { return ['sup', HTMLAttributes, 0] },
})

// ---------------------------------------------------------------- atributos de bloco (alinhamento, recuo, marca na margem, estilo) + Tab
export const AtributosBloco = Extension.create({
  name: 'atributosBloco',
  priority: 200,
  addGlobalAttributes() {
    return [{
      types: ['paragraph', 'heading'],
      attributes: {
        textAlign: {
          default: null,
          parseHTML: (el: HTMLElement) => { const v = el.style.textAlign; return (ALINHAMENTOS as readonly string[]).includes(v) && v !== 'left' ? v : null },
          renderHTML: (a: any) => ((ALINHAMENTOS as readonly string[]).includes(a.textAlign) && a.textAlign !== 'left' ? { style: `text-align:${a.textAlign}` } : {}),
        },
        indent: {
          default: null,
          parseHTML: (el: HTMLElement) => { const n = Number(el.getAttribute('data-indent')); return Number.isInteger(n) && n >= 1 && n <= 8 ? n : null },
          renderHTML: (a: any) => (Number.isInteger(a.indent) && a.indent >= 1 ? { 'data-indent': String(a.indent), style: `margin-left:${Math.min(8, a.indent) * 2}em` } : {}),
        },
        marca: {
          default: null,
          parseHTML: (el: HTMLElement) => { const v = el.getAttribute('data-marca'); return v && (MARCAS_PARAGRAFO as readonly string[]).includes(v) ? v : null },
          renderHTML: (a: any) => ((MARCAS_PARAGRAFO as readonly string[]).includes(a.marca) ? { 'data-marca': a.marca } : {}),
        },
        estilo: {
          default: null,
          parseHTML: (el: HTMLElement) => { const v = el.getAttribute('data-estilo'); return v && (ESTILOS_PARAGRAFO as readonly string[]).includes(v) ? v : null },
          renderHTML: (a: any) => ((ESTILOS_PARAGRAFO as readonly string[]).includes(a.estilo) ? { 'data-estilo': a.estilo } : {}),
        },
      },
    }]
  },
  addKeyboardShortcuts() {
    return { Tab: () => teclaTab(this.editor, false), 'Shift-Tab': () => teclaTab(this.editor, true) }
  },
})

// ---------------------------------------------------------------- imagem
function ImagemView({ node, updateAttributes, selected, editor }: NodeViewProps) {
  const img = useRef<HTMLImageElement>(null)
  const arrasto = useRef<{ x: number; w: number; escala: number } | null>(null)
  const w = typeof node.attrs.width === 'number' ? node.attrs.width : undefined
  const editavel = editor.isEditable
  return (
    <NodeViewWrapper as="div" data-type="image" style={{ margin: '8px 0', lineHeight: 0 }}>
      <span style={{ position: 'relative', display: 'inline-block', maxWidth: '100%', outline: selected ? '2px solid var(--brand)' : undefined, borderRadius: 4 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img ref={img} src={String(node.attrs.src ?? '')} alt={String(node.attrs.alt ?? '')} loading="lazy" decoding="async" draggable={false} style={{ display: 'block', maxWidth: '100%', width: w, height: 'auto', borderRadius: 4 }} />
        {editavel && selected ? (
          <span role="slider" aria-label="Largura da imagem" aria-valuenow={Math.round(w ?? img.current?.offsetWidth ?? 0)} tabIndex={0}
            onPointerDown={(e) => {
              e.preventDefault(); e.stopPropagation()
              const el = img.current; if (!el) return
              ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
              const escala = el.offsetWidth ? el.getBoundingClientRect().width / el.offsetWidth : 1 // zoom CSS da página
              arrasto.current = { x: e.clientX, w: el.offsetWidth, escala: escala || 1 }
            }}
            onPointerMove={(e) => { const g = arrasto.current; if (!g) return; updateAttributes({ width: Math.round(Math.max(24, Math.min(2000, g.w + (e.clientX - g.x) / g.escala))) }) }}
            onPointerUp={() => { arrasto.current = null }} onPointerCancel={() => { arrasto.current = null }}
            onKeyDown={(e) => { const el = img.current; if (!el) return; const d = e.key === 'ArrowRight' ? 20 : e.key === 'ArrowLeft' ? -20 : 0; if (d) { e.preventDefault(); updateAttributes({ width: Math.max(24, Math.min(2000, (w ?? el.offsetWidth) + d)) }) } }}
            style={{ position: 'absolute', right: -7, bottom: -7, width: 16, height: 16, borderRadius: 4, background: 'var(--brand)', border: '2px solid var(--surface)', cursor: 'nwse-resize', touchAction: 'none' }} />
        ) : null}
      </span>
    </NodeViewWrapper>
  )
}

export const Imagem = Node.create({
  name: 'image', group: 'block', atom: true, draggable: true, selectable: true,
  addAttributes() { return { src: { default: null }, alt: { default: null }, width: { default: null } } },
  parseHTML() { return [{ tag: 'img[src]', getAttrs: (el: any) => { const src = srcImagemValido((el as HTMLElement).getAttribute('src')); return src ? { src, alt: (el as HTMLElement).getAttribute('alt') } : false } }] },
  renderHTML({ HTMLAttributes }) { return ['img', mergeAttributes({ loading: 'lazy', decoding: 'async' }, HTMLAttributes, HTMLAttributes.width ? { style: `width:${HTMLAttributes.width}px` } : {})] },
  addNodeView() { return ReactNodeViewRenderer(ImagemView) },
})

// ---------------------------------------------------------------- anexo
function AnexoView({ node }: NodeViewProps) {
  const a = node.attrs as Record<string, any>
  const arq = arquivoAnexoValido(a.arquivo)
  const nome = String(a.nome ?? 'arquivo')
  const href = arq ? `${ROTA_ARQUIVOS_NOTEBOOK}/${arq}?nome=${encodeURIComponent(nome)}` : null
  return (
    <NodeViewWrapper as="div" contentEditable={false} data-type="anexo" style={{ margin: '8px 0', display: 'flex' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, maxWidth: '100%', padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 10, background: 'var(--surface2)', color: 'var(--ink)' }}>
        <Paperclip size={18} aria-hidden style={{ color: 'var(--brand)', flexShrink: 0 }} />
        <span style={{ minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 14, fontWeight: 700, overflowWrap: 'anywhere' }}>{nome}</span>
          {typeof a.tamanho === 'number' ? <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)' }}>{formatarTamanho(a.tamanho)}</span> : null}
        </span>
        {href ? <a href={href} download={nome} style={{ fontSize: 13, fontWeight: 800, color: 'var(--brand)', textDecoration: 'underline', flexShrink: 0 }}>Baixar</a> : null}
      </span>
    </NodeViewWrapper>
  )
}

export const Anexo = Node.create({
  name: 'anexo', group: 'block', atom: true, draggable: true, selectable: true,
  addAttributes() { return { arquivo: { default: null }, nome: { default: 'arquivo' }, tamanho: { default: null } } },
  parseHTML() { return [{ tag: 'div[data-type="anexo"]' }] },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes({ 'data-type': 'anexo' }, HTMLAttributes)] },
  addNodeView() { return ReactNodeViewRenderer(AnexoView) },
})

// ---------------------------------------------------------------- inserção de arquivos (colar / arrastar / botão)
/** Envia o arquivo e insere o nó (image | anexo) na posição `pos` (ou na seleção). Mostra avisos via `nb:aviso`. */
export async function inserirArquivoNoEditor(editor: Editor, file: File, pos?: number): Promise<boolean> {
  const imagem = ehImagem(file)
  if (!imagem && !ehAnexoPermitido(file)) { avisarCaderno('Tipo de arquivo não permitido. Use imagem (PNG, JPG, WEBP, GIF), PDF, DOCX, XLSX, PPTX ou TXT.'); return false }
  avisarCaderno(imagem ? 'Enviando imagem…' : 'Enviando arquivo…')
  const r = await enviarArquivoCaderno(file, imagem ? 'imagem' : 'arquivo')
  if (!r.ok) { avisarCaderno(r.erro); return false }
  if (editor.isDestroyed) return false
  const no = imagem
    ? { type: 'image', attrs: { src: r.dados.url, alt: r.dados.nome } }
    : { type: 'anexo', attrs: { arquivo: r.dados.arquivo, nome: r.dados.nome, tamanho: r.dados.tamanho } }
  const c = editor.chain().focus()
  ;(pos === undefined ? c.insertContent(no) : c.insertContentAt(pos, no)).run()
  avisarCaderno('')
  return true
}

export const ArquivosColaveis = Extension.create({
  name: 'arquivosColaveis',
  addProseMirrorPlugins() {
    const editor = this.editor
    return [new Plugin({
      key: new PluginKey('nbArquivosColaveis'),
      props: {
        handlePaste: (_v, event) => {
          const fs = Array.from(event.clipboardData?.files ?? [])
          // Cópia do Word/Excel traz texto + imagem renderizada: só trata como arquivo quando NÃO há texto.
          if (!fs.length || (event.clipboardData?.getData('text/plain') ?? '').trim()) return false
          event.preventDefault()
          void (async () => { for (const f of fs) await inserirArquivoNoEditor(editor, f) })()
          return true
        },
        handleDrop: (view, event) => {
          const fs = Array.from((event as DragEvent).dataTransfer?.files ?? [])
          if (!fs.length) return false
          event.preventDefault()
          const p = view.posAtCoords({ left: (event as DragEvent).clientX, top: (event as DragEvent).clientY })?.pos
          void (async () => { for (const f of fs) await inserirArquivoNoEditor(editor, f, p) })()
          return true
        },
      },
    })]
  },
})

/** Extensões novas da Onda 2a (a ordem importa pouco; AtributosBloco tem prioridade para o Tab). */
export const EXTENSOES_TEXTO = [TextStyle, Realce, Subscrito, Sobrescrito, AtributosBloco, Imagem, Anexo, ArquivosColaveis]

/** CSS do editor para as extensões acima (somente tokens). Anexado ao <style> do editor. */
export const CSS_TEXTO = [
  '.nb-editor .ProseMirror h4{font-size:1.05em;font-weight:800;margin:1em 0 .4em}',
  '.nb-editor .ProseMirror h5{font-size:1em;font-weight:700;margin:1em 0 .4em}',
  '.nb-editor .ProseMirror h6{font-size:.92em;font-weight:700;color:var(--muted);margin:1em 0 .4em}',
  '.nb-editor .ProseMirror p[data-estilo=titulo_pagina]{font-size:2.3em;font-weight:300;line-height:1.2;margin:.3em 0 .5em}',
  '.nb-editor .ProseMirror mark{background:color-mix(in srgb,var(--gold) 45%,transparent);color:inherit;border-radius:2px}',
  '.nb-editor .ProseMirror [data-marca]{position:relative;padding-left:1.9em}',
  '.nb-editor .ProseMirror [data-marca]::before{position:absolute;left:.2em;top:0;width:1.4em;text-align:center;font-weight:800;line-height:inherit}',
  '.nb-editor .ProseMirror [data-marca=importante]::before{content:"\\2605";color:var(--gold)}',
  '.nb-editor .ProseMirror [data-marca=pergunta]::before{content:"?";color:var(--info)}',
  '.nb-editor .ProseMirror [data-marca=lembrar]::before{content:"\\2691";color:var(--brand)}',
  '.nb-editor .ProseMirror [data-marca=definicao]::before{content:"\\24D8";color:var(--brand)}',
  '.nb-editor .ProseMirror img{max-width:100%;height:auto}',
  '.nb-editor .ProseMirror table{position:relative}',
  '.nb-editor .ProseMirror .nb-destaque-marca{background:var(--chip);transition:background .8s}',
].join('')
