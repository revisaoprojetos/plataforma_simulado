'use client'
// Editor de página do Caderno (beta). Carregado via next/dynamic (ssr:false) pelo shell — o chunk do TipTap
// só baixa quando o aluno abre a aba. Autosave: ver useAutosave.ts + lib/aluno/notebook-autosave.ts.
import { memo, useCallback, useEffect, useInsertionEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import { Bold, Italic, Underline as UnderlineIcon, Heading1, Heading2, Heading3, List, ListOrdered, ListTodo, Table2, Link2, Quote, Code } from 'lucide-react'
import { pedirTexto } from '@/components/ui/confirm-dialog'
import { RefsCtx, type RefsNotebook } from './extensoes'
import { CSS_TEXTO } from './extensoes-texto'
import { CSS_EDITOR, criarExtensoesEditor } from './extensoes-editor'
import { urlOk } from '@/lib/aluno/notebook-texto'
import { prepararDocEditor } from '@/lib/aluno/notebook-doc-tolerante'
import { esquemaEditor } from './esquema-editor'
import { useAutosave } from './useAutosave'
import { garantirCss } from './css-global'
import { useTituloPropagado } from './use-titulo-propagado'
import { carregarPagina } from './onenote/cliente-caderno'
import { filaCriacao } from './fila-criacao'
import { IndicadorSalvo } from './indicador-salvo'
import { TituloOneNote } from './onenote/titulo-pagina'
import type { OpcoesOneNote } from './onenote/tipos'

const CorpoFolha = dynamic(() => import('./corpo-folha'), { ssr: false, loading: () => <Esqueleto /> })

type Pagina = { id: string; secao_id: string; titulo: string; tipo_pagina?: string; doc: any; tinta?: unknown; versao: number; atualizado_em?: string }
type Props = { paginaId: string; onTitulo: (id: string, titulo: string) => void; onSalvo?: (id: string, quando: string) => void } & OpcoesOneNote

function EditorPagina({ paginaId, onTitulo, onSalvo, ...op }: Props) {
  const [estado, setEstado] = useState<'carregando' | 'ok' | 'erro' | 'migracao'>('carregando')
  const [dados, setDados] = useState<{ pagina: Pagina; refs: RefsNotebook } | null>(null)
  const [tentativa, setTentativa] = useState(0)

  useEffect(() => {
    let vivo = true
    setEstado('carregando'); setDados(null)
    // página recém-criada (POST ainda em andamento): abre em BRANCO localmente, sem GET (daria 404); o autosave espera a criação.
    const criando = filaCriacao.meta(paginaId)
    if (criando && filaCriacao.pendente(paginaId)) {
      setDados({ pagina: { id: paginaId, secao_id: criando.secaoId, titulo: 'Sem título', tipo_pagina: criando.tipo, doc: {}, tinta: null, versao: 1 }, refs: { questoes: {} } })
      setEstado('ok')
      return () => { vivo = false }
    }
    carregarPagina(paginaId).then((r) => {
      if (!vivo) return
      const j = r.dados
      if (!r.ok || !j?.pagina) { setEstado(r.code === 'migracao_pendente' ? 'migracao' : 'erro'); return }
      setDados({ pagina: j.pagina, refs: { questoes: Object.fromEntries(((j.refs?.questoes ?? []) as any[]).map((q) => [q.id, q])) } })
      setEstado('ok')
    })
    return () => { vivo = false }
  }, [paginaId, tentativa])

  if (estado === 'carregando') return <Esqueleto />
  if (estado === 'migracao') return <Msg>Recurso em preparação, volte em breve.</Msg>
  if (estado === 'erro' || !dados) return <Msg>Não foi possível abrir a página. <button type="button" onClick={() => setTentativa((n) => n + 1)} style={btnTxt}>Tentar de novo</button></Msg>
  if (dados.pagina.tipo_pagina === 'folha_livre') return <CorpoFolha key={paginaId} pagina={{ id: dados.pagina.id, titulo: dados.pagina.titulo, tinta: dados.pagina.tinta, versao: dados.pagina.versao }} onTitulo={onTitulo} onSalvo={onSalvo} {...op} />
  return <Corpo key={paginaId} pagina={dados.pagina} refs={dados.refs} onTitulo={onTitulo} onSalvo={onSalvo} {...op} />
}

// memo: a casca re-renderiza a cada mudança de estado (salvo/título/árvore); o editor só quando suas props mudam (todas estáveis).
export default memo(EditorPagina)

const btnTxt: React.CSSProperties = { minHeight: 40, padding: '0 14px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', fontWeight: 800, cursor: 'pointer' }
function Msg({ children }: { children: React.ReactNode }) { return <div role="status" style={{ padding: 24, color: 'var(--muted)', fontSize: 14 }}>{children}</div> }
export function Esqueleto() {
  return (
    <div aria-busy="true" aria-label="Carregando página" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {[60, 100, 92, 80].map((w, i) => <div key={i} style={{ height: i ? 14 : 28, width: `${w}%`, borderRadius: 8, background: 'var(--surface2)' }} />)}
    </div>
  )
}

function Corpo({ pagina, refs, onTitulo, onSalvo, variante, criadoEm, onEstado, onEditor, onAutosave }: { pagina: Pagina; refs: RefsNotebook; onTitulo: Props['onTitulo']; onSalvo: Props['onSalvo'] } & OpcoesOneNote) {
  const onenote = variante === 'onenote'
  const [titulo, setTitulo] = useState(pagina.titulo ?? '')
  const tituloRef = useRef(titulo); tituloRef.current = titulo
  const editorRef = useRef<Editor | null>(null)

  const auto = useAutosave({
    paginaId: pagina.id,
    versaoInicial: pagina.versao,
    // só os campos SUJOS: título isolado => PATCH só com título; corpo isolado => sem título
    obter: (sujo) => (editorRef.current
      ? { ...(sujo.corpo ? { doc: editorRef.current.getJSON() as Record<string, unknown> } : {}), ...(sujo.titulo ? { titulo: tituloRef.current } : {}) }
      : null),
    onSalvo: (_v, alt) => { onSalvo?.(pagina.id, new Date().toISOString()); if (alt.titulo !== undefined) onTitulo(pagina.id, alt.titulo) },
  })

  const extensions = useMemo(() => criarExtensoesEditor('Escreva aqui…'), [])

  // O TipTap abre EM BRANCO (só loga "Invalid content") quando o doc do servidor não bate com o schema; o 1º autosave então apagaria o
  // conteúdo real. `prepararDocEditor` limpa o que for limpável e, se não der, abre SOMENTE LEITURA com aviso (nunca grava por cima).
  const prep = useMemo(() => prepararDocEditor(pagina.doc, esquemaEditor()), [pagina.doc])
  const editor = useEditor({
    immediatelyRender: false,
    extensions,
    content: prep.doc,
    editable: prep.ok,
    editorProps: { attributes: { 'aria-label': 'Conteúdo da página', role: 'textbox', 'aria-multiline': 'true' } },
    onUpdate: () => auto.marcarSujo('corpo'),
  })
  editorRef.current = editor
  useEffect(() => { onEditor?.(editor); return () => onEditor?.(null) }, [editor, onEditor])
  useEffect(() => {
    onEstado?.({ fase: auto.fase, online: auto.online, semPersistencia: auto.semPersistencia, retry: auto.tentarDeNovo })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto.fase, auto.online, auto.semPersistencia])

  const autoRef = useRef(auto); autoRef.current = auto
  useEffect(() => {
    onAutosave?.({ flush: () => autoRef.current.flush(), setVersaoBase: (v) => autoRef.current.setVersaoBase(v) })
    return () => onAutosave?.(null)
  }, [onAutosave])
  useInsertionEffect(() => { garantirCss('editor', CSS_EDITOR + CSS_TEXTO) }, [])
  const { propagar } = useTituloPropagado(pagina.id, onTitulo)
  const aoTitulo = (v: string) => { const t = v.slice(0, 200); setTitulo(t); propagar(t); auto.marcarSujo('titulo') }

  const usarServidor = useCallback(async () => {
    let p = auto.paginaServidor as Pagina | null
    if (!p || !p.doc) {
      p = (await carregarPagina(pagina.id)).dados?.pagina ?? null
    }
    if (!p) return
    editor?.commands.setContent(prepararDocEditor(p.doc, esquemaEditor()).doc, { emitUpdate: false })
    setTitulo(p.titulo ?? ''); onTitulo(pagina.id, p.titulo ?? '')
    auto.usarServidor(p.versao)
  }, [auto, editor, pagina.id, onTitulo])

  return (
    <div className="nb-editor" style={{ display: 'flex', flexDirection: 'column', minWidth: 0, width: '100%' }}>
      {auto.migracaoPendente ? <Msg>Recurso em preparação, volte em breve.</Msg> : null}
      {!prep.ok ? <div role="alert" style={{ padding: '10px 14px', margin: '0 0 10px', borderRadius: 12, background: 'var(--dangerBg)', color: 'var(--danger)', fontSize: 13.5, fontWeight: 700 }}>Não foi possível exibir o conteúdo desta página. Ela foi aberta somente para leitura para não perder o que está salvo.</div> : null}
      {auto.fase === 'conflito' ? (
        <div role="alert" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', padding: '10px 14px', margin: '0 0 10px', borderRadius: 12, background: 'var(--dangerBg)', color: 'var(--danger)', fontSize: 13.5, fontWeight: 700 }}>
          <span style={{ flex: 1, minWidth: 180 }}>Esta página mudou em outro lugar.</span>
          <button type="button" onClick={usarServidor} style={btnTxt}>Usar a do servidor</button>
          <button type="button" onClick={auto.manterMinha} style={btnTxt}>Manter a minha</button>
        </div>
      ) : null}
      {auto.semPersistencia ? <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 8px' }}>O armazenamento do navegador está bloqueado aqui: se você ficar offline e recarregar, as últimas edições podem se perder.</p> : null}

      {onenote ? null : <Barra editor={editor} />}

      {onenote ? <TituloOneNote id="nb-titulo" valor={titulo} onChange={aoTitulo} criadoEm={criadoEm} /> : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '14px 2px 6px' }}>
        <input id="nb-titulo" value={titulo} onChange={(e) => aoTitulo(e.target.value)} placeholder="Título da página" aria-label="Título da página" maxLength={200}
          style={{ flex: 1, minWidth: 200, background: 'transparent', border: 0, outline: 'none', fontSize: 24, fontWeight: 800, color: 'var(--ink)', minHeight: 44 }} />
        <IndicadorSalvo fase={auto.fase} online={auto.online} semPersistencia={auto.semPersistencia} onRetry={auto.tentarDeNovo} />
      </div>}

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
