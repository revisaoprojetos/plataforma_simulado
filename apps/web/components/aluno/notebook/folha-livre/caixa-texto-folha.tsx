'use client'
// Caixa de texto da folha livre, estilo contêiner do OneNote (pointer events; funciona com dedo, caneta e mouse).
// O miolo é um editor TipTap com o MESMO conjunto de extensões/lista branca da página de texto (extensoes-editor.tsx); o `doc` da
// caixa é JSON TipTap. Ao focar, a instância vira o editor ATIVO do ribbon (aoEditorAtivo). Acabamento: sem borda em repouso,
// borda fina no hover/foco, alça de arrastar (topo) e alça de largura (direita) visíveis no hover/foco/seleção, altura automática.
// Com a caneta/borracha/laço ativos `interativa` é falso: a caixa não captura o ponteiro (o traço passa por cima/através).
import { memo, useEffect, useMemo, useRef, useState, type MutableRefObject, type PointerEvent as RPointerEvent } from 'react'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import { Move, Trash2 } from 'lucide-react'
import type { CaixaFolha } from '@/lib/aluno/notebook-folha'
import { criarExtensoesEditor } from '../extensoes-editor'
import { esquemaEditor } from '../esquema-editor'
import { prepararDocEditor } from '@/lib/aluno/notebook-doc-tolerante'
import { htmlEstaticoDoc } from './html-estatico'

/**
 * LIMIAR: acima de N caixas na folha, o editor TipTap só é montado na caixa SELECIONADA/FOCADA; as demais renderizam HTML estático
 * (mesmo CSS). Abaixo (ou igual) o comportamento é o de sempre: um editor por caixa. Uma instância TipTap custa ~ms de montagem + listeners +
 * ProseMirror view; 40 já é barato, centenas deixam a folha pesada. Trade-off: nas folhas grandes o histórico (Ctrl+Z) do TipTap da caixa
 * é descartado quando ela perde a seleção — o desfazer da FOLHA cobre o texto (as edições são confirmadas no histórico ao sair da caixa).
 */
export const LIMIAR_CAIXAS_EDITOR_SOB_DEMANDA = 40

interface Props {
  caixa: CaixaFolha
  zoom: number
  selecionada: boolean
  /** ferramenta 'selecionar'/'texto' ativa: caixas recebem toque. */
  interativa: boolean
  somenteLeitura: boolean
  autoFoco: boolean
  /** a folha tem mais caixas que LIMIAR_CAIXAS_EDITOR_SOB_DEMANDA: só a caixa selecionada/focada monta o editor. */
  modoEstatico: boolean
  aoSelecionar: (id: string) => void
  aoInicioGesto: () => void
  aoFimGesto: () => void
  aoMover: (id: string, x: number, y: number) => void
  aoRedimensionar: (id: string, w: number, h: number) => void
  aoDoc: (id: string, doc: Record<string, unknown>) => void
  /** altura medida do conteúdo (só depois de o aluno mexer na caixa). */
  aoAltura: (id: string, h: number) => void
  aoExcluir: (id: string) => void
  /** a instância TipTap desta caixa recebeu o foco (vira o editor ativo do ribbon). */
  aoEditorAtivo: (ed: Editor) => void
  /** a instância foi destruída (caixa removida/desmontada). */
  aoEditorLiberado: (ed: Editor) => void
  /** desfazer/refazer da FOLHA (usado quando o histórico do TipTap da caixa não tem o que desfazer). */
  aoHistoricoFolha: (dir: 'desfazer' | 'refazer') => void
}

/** CSS compartilhado das caixas (1 <style> por folha). Somente tokens. */
export const CSS_CAIXA_FOLHA = [
  '.fx-caixa{border:1px solid transparent;border-radius:4px}',
  '.fx-caixa[data-interativa=true]:hover{border-color:var(--line2,var(--border))}',
  '.fx-caixa[data-interativa=true]:focus-within,.fx-caixa[data-sel=true]{border-color:var(--brand-primary);background:color-mix(in srgb,var(--surface,var(--card)) 70%,transparent)}',
  '.fx-caixa .fx-alca{opacity:0;transition:opacity .12s}',
  '.fx-caixa:hover .fx-alca,.fx-caixa:focus-within .fx-alca,.fx-caixa[data-sel=true] .fx-alca{opacity:1}',
  '.fx-caixa .fx-larg{opacity:0;transition:opacity .12s}',
  '.fx-caixa:hover .fx-larg,.fx-caixa:focus-within .fx-larg,.fx-caixa[data-sel=true] .fx-larg{opacity:1}',
  '.nb-editor.fx-ed .ProseMirror{min-height:1.6em;padding:4px 8px;font-size:16px;line-height:1.5;color:var(--ink,var(--foreground))}',
  '.nb-editor.fx-ed .ProseMirror p{margin:.2em 0}',
  '.nb-editor.fx-ed .ProseMirror table{margin:.4em 0}',
  // render estático (folhas com muitas caixas): mesmo visual do editor; checkboxes de tarefa não são clicáveis (o clique monta o editor)
  '.nb-editor.fx-ed.fx-estatica .ProseMirror{cursor:text;white-space:pre-wrap;word-wrap:break-word}',
  '.nb-editor.fx-ed.fx-estatica input{pointer-events:none}',
  '.nb-editor.fx-ed.fx-estatica img{display:block;margin:8px 0}',
  '@media (pointer:coarse){.fx-caixa .fx-alca{height:28px!important}.fx-caixa .fx-larg{width:24px!important;right:-12px!important}}',
].join('')

const alturaDe = (el: HTMLElement | null) => (el ? el.offsetHeight : 0)

type FocoPend = null | 'fim' | { x: number; y: number }

/** Editor TipTap da caixa (montado sempre, ou só na selecionada em folhas grandes). */
function EditorCaixa({ p, tocou, foco }: { p: Props; tocou: MutableRefObject<boolean>; foco: MutableRefObject<FocoPend> }) {
  const c = p.caixa
  const pr = useRef(p); pr.current = p
  const editorRef = useRef<Editor | null>(null)
  const ultimoDoc = useRef<Record<string, unknown> | undefined>(c.doc) // último doc emitido/aplicado: distingue eco de mudança externa
  const focado = useRef(false)

  // doc que o schema não aceita: o TipTap abriria em branco e a próxima digitação apagaria o conteúdo salvo => limpa o que der, senão só leitura
  const inicial = useRef(prepararDocEditor(c.doc, esquemaEditor())).current
  const [bloqueada, setBloqueada] = useState(!inicial.ok)
  const editavel = !p.somenteLeitura && p.interativa && !bloqueada
  const extensions = useMemo(() => criarExtensoesEditor('Digite aqui…'), [])

  const editor = useEditor({
    immediatelyRender: false,
    extensions,
    content: inicial.doc,
    editable: editavel,
    editorProps: {
      attributes: { 'aria-label': 'Texto da caixa', role: 'textbox', 'aria-multiline': 'true' },
      // Sem nada a desfazer/refazer na caixa, Ctrl+Z/Y cai no histórico da FOLHA (nunca nos dois ao mesmo tempo).
      handleKeyDown: (_v, ev) => {
        const ed = editorRef.current
        if (!ed || !(ev.ctrlKey || ev.metaKey) || ev.altKey) return false
        const k = ev.key.toLowerCase()
        const refazer = k === 'y' || (k === 'z' && ev.shiftKey)
        const desfazer = k === 'z' && !ev.shiftKey
        if (desfazer && !ed.can().undo()) { ev.preventDefault(); pr.current.aoHistoricoFolha('desfazer'); return true }
        if (refazer && !ed.can().redo()) { ev.preventDefault(); pr.current.aoHistoricoFolha('refazer'); return true }
        return false
      },
    },
    onUpdate: ({ editor: ed }) => {
      tocou.current = true
      const doc = ed.getJSON() as Record<string, unknown>
      ultimoDoc.current = doc
      pr.current.aoDoc(pr.current.caixa.id, doc)
    },
    onFocus: ({ editor: ed }) => {
      focado.current = true
      const q = pr.current
      q.aoSelecionar(q.caixa.id)
      q.aoInicioGesto()
      q.aoEditorAtivo(ed)
    },
    onBlur: () => { focado.current = false; pr.current.aoFimGesto() },
  })
  editorRef.current = editor

  useEffect(() => {
    if (!editor) return
    return () => {
      // desmontar com foco (modo estático: a caixa perdeu a seleção) não dispara onBlur: fecha o gesto de digitação aqui
      if (focado.current) { focado.current = false; pr.current.aoFimGesto() }
      pr.current.aoEditorLiberado(editor)
    }
  }, [editor])

  useEffect(() => { if (editor && !editor.isDestroyed && editor.isEditable !== editavel) editor.setEditable(editavel) }, [editor, editavel])

  // Mudança EXTERNA do doc (desfazer/refazer da folha, "usar a do servidor"): recarrega o conteúdo sem criar passo no histórico da caixa.
  useEffect(() => {
    if (!editor || editor.isDestroyed || c.doc === ultimoDoc.current) return
    ultimoDoc.current = c.doc
    const prep = prepararDocEditor(c.doc, esquemaEditor())
    setBloqueada(!prep.ok)
    editor.chain().setMeta('addToHistory', false).setContent(prep.doc, { emitUpdate: false }).run()
  }, [editor, c.doc])

  useEffect(() => {
    if (p.autoFoco && editor && !editor.isDestroyed && editavel) editor.commands.focus('end')
  }, [p.autoFoco, editor, editavel])

  // Montado por clique/Enter numa caixa estática: foca no ponto clicado (ou no fim) assim que o editor existir.
  useEffect(() => {
    const f = foco.current
    if (!editor || editor.isDestroyed || !f || !editavel) return
    foco.current = null
    const id = requestAnimationFrame(() => {
      if (editor.isDestroyed) return
      try {
        if (f !== 'fim') { const pos = editor.view.posAtCoords({ left: f.x, top: f.y }); if (pos) { editor.commands.focus(pos.pos); return } }
        editor.commands.focus('end')
      } catch { editor.commands.focus('end') }
    })
    return () => cancelAnimationFrame(id)
  }, [editor, editavel, foco])

  return <EditorContent editor={editor} className="nb-editor fx-ed" />
}

/** HTML estático do doc (caixa sem editor montado). */
function ConteudoEstatico({ doc }: { doc: Record<string, unknown> | undefined }) {
  const { html } = useMemo(() => htmlEstaticoDoc(doc), [doc])
  return (
    <div className="nb-editor fx-ed fx-estatica">
      <div className="ProseMirror" aria-label="Texto da caixa" dangerouslySetInnerHTML={{ __html: html || '<p></p>' }} />
    </div>
  )
}

/** Props que mudam o resultado visual/comportamental; os callbacks chegam como proxies ESTÁVEIS da folha (por isso ficam fora do comparador). */
const iguais = (a: Props, b: Props) =>
  a.caixa === b.caixa && a.zoom === b.zoom && a.selecionada === b.selecionada && a.interativa === b.interativa
  && a.somenteLeitura === b.somenteLeitura && a.autoFoco === b.autoFoco && a.modoEstatico === b.modoEstatico

export const CaixaTextoFolha = memo(CaixaTextoFolhaImpl, iguais)

function CaixaTextoFolhaImpl(p: Props) {
  const { caixa: c, zoom } = p
  const raiz = useRef<HTMLDivElement>(null)
  const gesto = useRef<{ id: number; px: number; py: number; x: number; y: number; w: number; h: number; tipo: 'mover' | 'redim' } | null>(null)
  const pr = useRef(p); pr.current = p
  const tocou = useRef(false) // só reporta altura depois que o aluno mexeu (abrir a página não pode "sujar" o autosave)
  const foco = useRef<FocoPend>(null)

  // Editor montado: sempre (folha pequena) ou só na caixa selecionada/focada (folha grande); caixa com nó que só existe como NodeView
  // (anexo, cartões) ou doc que o schema não serializa também monta sempre o editor.
  const estaticoOk = p.modoEstatico && htmlEstaticoDoc(c.doc).seguro
  const montarEditor = !estaticoOk || (p.interativa && (p.selecionada || p.autoFoco))

  // Altura automática: o contêiner segue o conteúdo; a altura guardada (c.h) acompanha só depois de edição/redimensionamento.
  useEffect(() => {
    const el = raiz.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      if (!tocou.current) return
      const h = alturaDe(el)
      if (h > 0 && Math.abs(h - pr.current.caixa.h) > 1) pr.current.aoAltura(pr.current.caixa.id, h)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const iniciar = (e: RPointerEvent<HTMLElement>, tipo: 'mover' | 'redim') => {
    if (p.somenteLeitura) return
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    p.aoSelecionar(c.id)
    p.aoInicioGesto()
    tocou.current = true
    gesto.current = { id: e.pointerId, px: e.clientX, py: e.clientY, x: c.x, y: c.y, w: c.w, h: c.h, tipo }
  }
  const mover = (e: RPointerEvent<HTMLElement>) => {
    const g = gesto.current
    if (!g || g.id !== e.pointerId) return
    const dx = (e.clientX - g.px) / zoom, dy = (e.clientY - g.py) / zoom
    if (g.tipo === 'mover') p.aoMover(c.id, g.x + dx, g.y + dy)
    else p.aoRedimensionar(c.id, g.w + dx, g.h)
  }
  const fim = (e: RPointerEvent<HTMLElement>) => {
    const g = gesto.current
    if (!g || g.id !== e.pointerId) return
    gesto.current = null
    p.aoFimGesto()
  }

  const sel = p.selecionada && p.interativa
  const alcaTopo = c.y >= 18 ? -18 : 0

  return (
    <div
      ref={raiz}
      className="fx-caixa"
      data-sel={sel ? 'true' : 'false'}
      data-interativa={p.interativa ? 'true' : 'false'}
      role="group"
      aria-label="Caixa de texto"
      tabIndex={p.interativa ? 0 : -1}
      onPointerDown={(e) => { if (!p.interativa) return; if (!montarEditor && !p.somenteLeitura) foco.current = { x: e.clientX, y: e.clientY }; p.aoSelecionar(c.id) }}
      onKeyDown={(e) => {
        if (p.somenteLeitura || e.target !== e.currentTarget) return
        if (e.key === 'Enter' && !montarEditor) { e.preventDefault(); foco.current = 'fim'; p.aoSelecionar(c.id); return }
        if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); p.aoExcluir(c.id) }
        const passo = e.shiftKey ? 40 : 10
        const d: Record<string, [number, number]> = { ArrowLeft: [-passo, 0], ArrowRight: [passo, 0], ArrowUp: [0, -passo], ArrowDown: [0, passo] }
        const m = d[e.key]
        if (m) { e.preventDefault(); p.aoInicioGesto(); p.aoMover(c.id, c.x + m[0], c.y + m[1]); p.aoFimGesto() }
      }}
      style={{
        position: 'absolute', left: c.x, top: c.y, width: c.w, minHeight: 28, height: 'auto', zIndex: c.z,
        pointerEvents: p.interativa ? 'auto' : 'none',
        color: 'var(--ink, var(--foreground))', boxSizing: 'border-box', outline: 'none',
      }}
    >
      {p.interativa && !p.somenteLeitura && (
        <div
          className="fx-alca"
          style={{
            position: 'absolute', left: 0, right: 0, top: alcaTopo, height: 18, display: 'flex', alignItems: 'center',
            background: 'var(--brand-primary)', color: 'var(--brand-foreground, var(--primary-foreground))', borderRadius: '4px 4px 0 0', zIndex: 2,
          }}
        >
          <div
            aria-label="Arrastar caixa"
            title="Arrastar"
            onPointerDown={(e) => iniciar(e, 'mover')}
            onPointerMove={mover}
            onPointerUp={fim}
            onPointerCancel={fim}
            style={{ flex: 1, height: '100%', cursor: 'grab', touchAction: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', userSelect: 'none' }}
          >
            <Move size={12} aria-hidden />
          </div>
          {sel && (
            <button
              type="button"
              aria-label="Excluir caixa"
              title="Excluir caixa"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => p.aoExcluir(c.id)}
              style={{ width: 24, height: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 0, color: 'inherit', cursor: 'pointer' }}
            >
              <Trash2 size={12} aria-hidden />
            </button>
          )}
        </div>
      )}
      {montarEditor ? <EditorCaixa p={p} tocou={tocou} foco={foco} /> : <ConteudoEstatico doc={c.doc} />}
      {p.interativa && !p.somenteLeitura && (
        <div
          className="fx-larg"
          aria-label="Largura da caixa"
          title="Largura"
          onPointerDown={(e) => iniciar(e, 'redim')}
          onPointerMove={mover}
          onPointerUp={fim}
          onPointerCancel={fim}
          style={{ position: 'absolute', right: -7, top: 0, bottom: 0, width: 14, cursor: 'ew-resize', touchAction: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}
        >
          <span aria-hidden style={{ width: 4, height: 28, maxHeight: '60%', borderRadius: 2, background: 'var(--brand-primary)' }} />
        </div>
      )}
    </div>
  )
}
