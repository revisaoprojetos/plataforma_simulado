'use client'
// Editor de página do Caderno (beta). Carregado via next/dynamic (ssr:false) pelo shell — o chunk do TipTap
// só baixa quando o aluno abre a aba. Autosave: ver useAutosave.ts + lib/aluno/notebook-autosave.ts.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table'
import { Bold, Italic, Underline as UnderlineIcon, Heading1, Heading2, Heading3, List, ListOrdered, ListTodo, Table2, Link2, Quote, Code } from 'lucide-react'
import { pedirTexto } from '@/components/ui/confirm-dialog'
import { QuestaoRef, GrifoSnapshot, AnotacaoRef, RefsCtx, type RefsNotebook } from './extensoes'
import { useAutosave } from './useAutosave'
import { IndicadorSalvo } from './indicador-salvo'

const CorpoFolha = dynamic(() => import('./corpo-folha'), { ssr: false, loading: () => <Esqueleto /> })

type Pagina = { id: string; secao_id: string; titulo: string; tipo_pagina?: string; doc: any; tinta?: unknown; versao: number; atualizado_em?: string }
type Props = { paginaId: string; onTitulo: (id: string, titulo: string) => void; onSalvo?: (id: string, quando: string) => void }

const CSS = [
  '.nb-editor .ProseMirror{outline:none;min-height:50vh;padding:6px 2px 80px;font-size:16px;line-height:1.7;color:var(--ink);overflow-wrap:anywhere}',
  '.nb-editor .ProseMirror h1{font-size:1.7em;font-weight:800;margin:1em 0 .4em}',
  '.nb-editor .ProseMirror h2{font-size:1.4em;font-weight:800;margin:1em 0 .4em}',
  '.nb-editor .ProseMirror h3{font-size:1.15em;font-weight:800;margin:1em 0 .4em}',
  '.nb-editor .ProseMirror p{margin:.4em 0}',
  '.nb-editor .ProseMirror ul{list-style:disc;padding-left:1.5em}',
  '.nb-editor .ProseMirror ol{list-style:decimal;padding-left:1.5em}',
  '.nb-editor .ProseMirror ul[data-type=taskList]{list-style:none;padding-left:.2em}',
  '.nb-editor .ProseMirror ul[data-type=taskList] li{display:flex;gap:10px;align-items:flex-start}',
  '.nb-editor .ProseMirror ul[data-type=taskList] li>label{margin-top:.35em}',
  '.nb-editor .ProseMirror ul[data-type=taskList] li>label input{width:18px;height:18px;accent-color:var(--brand)}',
  '.nb-editor .ProseMirror ul[data-type=taskList] li>div{flex:1}',
  '.nb-editor .ProseMirror blockquote{border-left:3px solid var(--gold);padding-left:12px;color:var(--muted);margin:.8em 0}',
  '.nb-editor .ProseMirror pre{background:var(--surface2);border:1px solid var(--line);border-radius:10px;padding:12px;overflow-x:auto;font-size:13.5px}',
  '.nb-editor .ProseMirror code{background:var(--surface2);border-radius:5px;padding:1px 5px;font-size:.92em}',
  '.nb-editor .ProseMirror a{color:var(--brand);text-decoration:underline}',
  '.nb-editor .ProseMirror table{border-collapse:collapse;width:100%;table-layout:fixed;margin:.8em 0}',
  '.nb-editor .ProseMirror td,.nb-editor .ProseMirror th{border:1px solid var(--line);padding:6px 8px;vertical-align:top;min-width:60px}',
  '.nb-editor .ProseMirror th{background:var(--surface2);font-weight:800;text-align:left}',
  '.nb-editor .ProseMirror .selectedCell{background:var(--chip)}',
  '.nb-editor .ProseMirror p.is-editor-empty:first-child::before{content:attr(data-placeholder);color:var(--muted);float:left;height:0;pointer-events:none}',
  '.nb-editor .ProseMirror .ProseMirror-selectednode{outline:2px solid var(--brand);border-radius:14px}',
].join('')

const urlOk = (u: string) => { try { return ['https:', 'http:', 'mailto:'].includes(new URL(u).protocol) } catch { return false } }

export default function EditorPagina({ paginaId, onTitulo, onSalvo }: Props) {
  const [estado, setEstado] = useState<'carregando' | 'ok' | 'erro' | 'migracao'>('carregando')
  const [dados, setDados] = useState<{ pagina: Pagina; refs: RefsNotebook } | null>(null)
  const [tentativa, setTentativa] = useState(0)

  useEffect(() => {
    let vivo = true
    setEstado('carregando'); setDados(null)
    fetch(`/api/aluno/notebook/paginas/${paginaId}`, { credentials: 'same-origin' })
      .then(async (r) => {
        const j = await r.json().catch(() => null)
        if (!vivo) return
        if (!r.ok) { setEstado(j?.code === 'migracao_pendente' ? 'migracao' : 'erro'); return }
        setDados({ pagina: j.pagina, refs: { questoes: Object.fromEntries(((j.refs?.questoes ?? []) as any[]).map((q) => [q.id, q])) } })
        setEstado('ok')
      })
      .catch(() => { if (vivo) setEstado('erro') })
    return () => { vivo = false }
  }, [paginaId, tentativa])

  if (estado === 'carregando') return <Esqueleto />
  if (estado === 'migracao') return <Msg>Recurso em preparação, volte em breve.</Msg>
  if (estado === 'erro' || !dados) return <Msg>Não foi possível abrir a página. <button type="button" onClick={() => setTentativa((n) => n + 1)} style={btnTxt}>Tentar de novo</button></Msg>
  if (dados.pagina.tipo_pagina === 'folha_livre') return <CorpoFolha key={paginaId} pagina={{ id: dados.pagina.id, titulo: dados.pagina.titulo, tinta: dados.pagina.tinta, versao: dados.pagina.versao }} onTitulo={onTitulo} onSalvo={onSalvo} />
  return <Corpo key={paginaId} pagina={dados.pagina} refs={dados.refs} onTitulo={onTitulo} onSalvo={onSalvo} />
}

const btnTxt: React.CSSProperties = { minHeight: 40, padding: '0 14px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', fontWeight: 800, cursor: 'pointer' }
function Msg({ children }: { children: React.ReactNode }) { return <div role="status" style={{ padding: 24, color: 'var(--muted)', fontSize: 14 }}>{children}</div> }
export function Esqueleto() {
  return (
    <div aria-busy="true" aria-label="Carregando página" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {[60, 100, 92, 80].map((w, i) => <div key={i} style={{ height: i ? 14 : 28, width: `${w}%`, borderRadius: 8, background: 'var(--surface2)' }} />)}
    </div>
  )
}

function Corpo({ pagina, refs, onTitulo, onSalvo }: { pagina: Pagina; refs: RefsNotebook; onTitulo: Props['onTitulo']; onSalvo: Props['onSalvo'] }) {
  const [titulo, setTitulo] = useState(pagina.titulo ?? '')
  const tituloRef = useRef(titulo); tituloRef.current = titulo
  const editorRef = useRef<Editor | null>(null)

  const auto = useAutosave({
    paginaId: pagina.id,
    versaoInicial: pagina.versao,
    obter: () => (editorRef.current ? { doc: editorRef.current.getJSON() as Record<string, unknown>, titulo: tituloRef.current } : null),
    onSalvo: (_v, alt) => { onSalvo?.(pagina.id, new Date().toISOString()); if (alt.titulo !== undefined) onTitulo(pagina.id, alt.titulo) },
  })

  const extensions = useMemo(() => [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: { openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' }, isAllowedUri: (u: string) => urlOk(u) },
    }),
    Placeholder.configure({ placeholder: 'Escreva aqui…' }),
    TaskList, TaskItem.configure({ nested: true }),
    Table.configure({ resizable: false }), TableRow, TableHeader, TableCell,
    QuestaoRef, GrifoSnapshot, AnotacaoRef,
  ], [])

  const editor = useEditor({
    immediatelyRender: false,
    extensions,
    content: pagina.doc && typeof pagina.doc === 'object' && Object.keys(pagina.doc).length ? pagina.doc : '',
    editorProps: { attributes: { 'aria-label': 'Conteúdo da página', role: 'textbox', 'aria-multiline': 'true' } },
    onUpdate: () => auto.marcarSujo(),
  })
  editorRef.current = editor

  const aoTitulo = (v: string) => { setTitulo(v.slice(0, 200)); onTitulo(pagina.id, v.slice(0, 200)); auto.marcarSujo() }

  const usarServidor = useCallback(async () => {
    let p = auto.paginaServidor as Pagina | null
    if (!p || !p.doc) {
      try { const r = await fetch(`/api/aluno/notebook/paginas/${pagina.id}`, { credentials: 'same-origin' }); p = (await r.json()).pagina } catch { return }
    }
    if (!p) return
    editor?.commands.setContent(p.doc && Object.keys(p.doc).length ? p.doc : '', { emitUpdate: false })
    setTitulo(p.titulo ?? ''); onTitulo(pagina.id, p.titulo ?? '')
    auto.usarServidor(p.versao)
  }, [auto, editor, pagina.id, onTitulo])

  return (
    <div className="nb-editor" style={{ display: 'flex', flexDirection: 'column', minWidth: 0, width: '100%' }}>
      <style>{CSS}</style>
      {auto.migracaoPendente ? <Msg>Recurso em preparação, volte em breve.</Msg> : null}
      {auto.fase === 'conflito' ? (
        <div role="alert" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', padding: '10px 14px', margin: '0 0 10px', borderRadius: 12, background: 'var(--dangerBg)', color: 'var(--danger)', fontSize: 13.5, fontWeight: 700 }}>
          <span style={{ flex: 1, minWidth: 180 }}>Esta página mudou em outro lugar.</span>
          <button type="button" onClick={usarServidor} style={btnTxt}>Usar a do servidor</button>
          <button type="button" onClick={auto.manterMinha} style={btnTxt}>Manter a minha</button>
        </div>
      ) : null}
      {auto.semPersistencia ? <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 8px' }}>O armazenamento do navegador está bloqueado aqui: se você ficar offline e recarregar, as últimas edições podem se perder.</p> : null}

      <Barra editor={editor} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '14px 2px 6px' }}>
        <input id="nb-titulo" value={titulo} onChange={(e) => aoTitulo(e.target.value)} placeholder="Título da página" aria-label="Título da página" maxLength={200}
          style={{ flex: 1, minWidth: 200, background: 'transparent', border: 0, outline: 'none', fontSize: 24, fontWeight: 800, color: 'var(--ink)', minHeight: 44 }} />
        <IndicadorSalvo fase={auto.fase} online={auto.online} semPersistencia={auto.semPersistencia} onRetry={auto.tentarDeNovo} />
      </div>

      <RefsCtx.Provider value={refs}><EditorContent editor={editor} /></RefsCtx.Provider>
    </div>
  )
}

function Barra({ editor }: { editor: Editor | null }) {
  const [, tick] = useState(0)
  useEffect(() => {
    if (!editor) return
    const f = () => tick((n) => n + 1)
    editor.on('selectionUpdate', f); editor.on('transaction', f)
    return () => { editor.off('selectionUpdate', f); editor.off('transaction', f) }
  }, [editor])
  if (!editor) return <div style={{ height: 48 }} />
  const c = () => editor.chain().focus()
  const link = async () => {
    const atual = editor.getAttributes('link').href as string | undefined
    const u = await pedirTexto({ titulo: 'Link', label: 'Endereço (https://…)', valorInicial: atual ?? 'https://' })
    if (u === null) return
    if (!u.trim()) { c().extendMarkRange('link').unsetLink().run(); return }
    if (urlOk(u.trim())) c().extendMarkRange('link').setLink({ href: u.trim() }).run()
  }
  const B = (label: string, ativo: boolean, onClick: () => void, Ico: typeof Bold) => (
    <button key={label} type="button" aria-label={label} title={label} aria-pressed={ativo} onMouseDown={(e) => e.preventDefault()} onClick={onClick} className="nb-tb"
      style={{ width: 40, height: 40, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10, border: 0, cursor: 'pointer', background: ativo ? 'var(--chip)' : 'transparent', color: ativo ? 'var(--brand)' : 'var(--ink)' }}>
      <Ico size={18} aria-hidden />
    </button>
  )
  return (
    <div role="toolbar" aria-label="Formatação" style={{ display: 'flex', gap: 2, overflowX: 'auto', padding: 4, border: '1px solid var(--line)', borderRadius: 14, background: 'var(--surface)', position: 'sticky', top: 0, zIndex: 5 }}>
      {B('Negrito', editor.isActive('bold'), () => c().toggleBold().run(), Bold)}
      {B('Itálico', editor.isActive('italic'), () => c().toggleItalic().run(), Italic)}
      {B('Sublinhado', editor.isActive('underline'), () => c().toggleUnderline().run(), UnderlineIcon)}
      {B('Título 1', editor.isActive('heading', { level: 1 }), () => c().toggleHeading({ level: 1 }).run(), Heading1)}
      {B('Título 2', editor.isActive('heading', { level: 2 }), () => c().toggleHeading({ level: 2 }).run(), Heading2)}
      {B('Título 3', editor.isActive('heading', { level: 3 }), () => c().toggleHeading({ level: 3 }).run(), Heading3)}
      {B('Lista', editor.isActive('bulletList'), () => c().toggleBulletList().run(), List)}
      {B('Lista numerada', editor.isActive('orderedList'), () => c().toggleOrderedList().run(), ListOrdered)}
      {B('Lista de tarefas', editor.isActive('taskList'), () => c().toggleTaskList().run(), ListTodo)}
      {B('Tabela', editor.isActive('table'), () => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(), Table2)}
      {B('Link', editor.isActive('link'), link, Link2)}
      {B('Citação', editor.isActive('blockquote'), () => c().toggleBlockquote().run(), Quote)}
      {B('Bloco de código', editor.isActive('codeBlock'), () => c().toggleCodeBlock().run(), Code)}
    </div>
  )
}
