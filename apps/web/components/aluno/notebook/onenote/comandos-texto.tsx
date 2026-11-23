'use client'
// Onda 2a — comandos de TEXTO e INSERIR do ribbon (fmt.*, estilo.*, marca.*, inserir.*) sobre o editor TipTap ativo.
//   useComandosTexto(editor, ctx): registra os handlers no barramento (contexto-cmd), sincroniza o estado dos botões,
//   liga os atalhos de edição e devolve a UI auxiliar (seletores, painel de marcas, barra de tabela, avisos) para renderizar.
//   <ComandosTexto/> = o mesmo hook como componente (1 linha em onenote-app.tsx).
// Editor ativo = a página de texto (TipTap). A folha livre usa <textarea> simples nas caixas de texto: sem editor => comandos
// desabilitados (ver relatório).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { X } from 'lucide-react'
import { pedirTexto } from '@/components/ui/confirm-dialog'
import { R } from '@/lib/nova/rotas'
import { agruparMarcas, extrairMarcas, normalizarLink, ROTULO_MARCA, tamanhoFonteValido, familiaValida, type ItemMarca } from '@/lib/aluno/notebook-texto'
// `inserirArquivoNoEditor` (extensoes-texto.tsx: puxa TipTap/StarterKit) e `TextSelection` são carregados sob demanda dentro do comando,
// para o chunk inicial da casca OneNote não incluir o editor.
const inserirArquivo = async (ed: Editor, f: File) => (await import('../extensoes-texto')).inserirArquivoNoEditor(ed, f)
import { useOneNoteCmd, useRegistrarComandos, type CmdHandler } from './contexto-cmd'
import { alinhar, alternarMarca, aplicarEstilo, aplicarMarks, limparFormatacao, marksDoCursor, recuoMais, recuoMenos, removerMarca, type MarkCopiada } from './acoes-texto'
import { Popover } from './menu-flutuante'
import { FONTE_UI, type Pagina } from './tipos'

const SIMBOLOS = [
  '©', '®', '™', '°', '±', '×', '÷', '≠', '≈', '≤', '≥', '∞', '√', 'π', '∑', 'Ω', 'α', 'β', 'γ', 'δ', 'λ', 'μ', '§', '¶', '†', '‡', '•', '…', '–', '—', '«', '»',
  '€', '£', '¥', '¢', '←', '→', '↑', '↓', '↔', '⇒', '⇔', '✓', '✗', '★', '½', '¼', '¾', '²', '³', '¹', '‰', 'º', 'ª', '№',
]
const GRADE = { linhas: 6, colunas: 8 }
export const ROTA_CADERNO_ONENOTE = `${R.cadernos}/onenote`

const fmtData = (d: Date) => d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
const fmtHora = (d: Date) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })

/** Posição (fixed) logo abaixo do botão do ribbon cujo aria-label é `rotulo`. */
function ancora(rotulo: string): { x: number; y: number } {
  const el = document.querySelector<HTMLElement>(`.onenote-root button[aria-label="${rotulo}"]`)
  const r = el?.getBoundingClientRect()
  return r ? { x: r.left, y: r.bottom + 2 } : { x: Math.max(8, window.innerWidth / 2 - 120), y: 140 }
}

type Pop =
  | { t: 'tabela'; x: number; y: number }
  | { t: 'simbolo'; x: number; y: number }
  | { t: 'paginas'; x: number; y: number; apagar: { from: number; to: number } | null }

export type CtxTexto = {
  /** Páginas do caderno (para `[[` / ligação interna). */
  paginas?: Pagina[]
  /** Abre uma página do caderno (clique numa ligação interna). */
  abrirPagina?: (id: string) => void
}

export function useComandosTexto(editor: Editor | null, ctx: CtxTexto = {}): React.ReactNode {
  const cmd = useOneNoteCmd()
  const cmdRef = useRef(cmd); cmdRef.current = cmd
  const ctxRef = useRef(ctx); ctxRef.current = ctx
  const [pop, setPop] = useState<Pop | null>(null)
  const [resumo, setResumo] = useState(false)
  const [aviso, setAviso] = useState('')
  const pincel = useRef<MarkCopiada[] | null>(null)
  const avisar = useCallback((m: string) => setAviso(m), [])

  useEffect(() => {
    const f = (e: Event) => setAviso(String((e as CustomEvent).detail ?? ''))
    window.addEventListener('nb:aviso', f)
    return () => window.removeEventListener('nb:aviso', f)
  }, [])
  useEffect(() => { if (!aviso) return; const t = window.setTimeout(() => setAviso(''), 5000); return () => window.clearTimeout(t) }, [aviso])
  useEffect(() => { setPop(null); if (!editor) setResumo(false) }, [editor])

  // ---------------------------------------------------------------- estado dos botões (negrito ativo, fonte atual...)
  useEffect(() => {
    if (!editor) return
    const f = () => {
      if (editor.isDestroyed) return
      const set = (id: string, v: unknown) => cmdRef.current.definirEstado(id, v)
      set('fmt.negrito', editor.isActive('bold')); set('fmt.italico', editor.isActive('italic')); set('fmt.sublinhado', editor.isActive('underline'))
      set('fmt.tachado', editor.isActive('strike')); set('fmt.subscrito', editor.isActive('subscript')); set('fmt.sobrescrito', editor.isActive('superscript'))
      set('fmt.marcadores', editor.isActive('bulletList')); set('fmt.numeracao', editor.isActive('orderedList'))
      const ts = editor.getAttributes('textStyle')
      set('fmt.fonte', typeof ts.fontFamily === 'string' && ts.fontFamily ? ts.fontFamily : 'Segoe UI')
      set('fmt.tamanho', typeof ts.fontSize === 'string' && ts.fontSize ? String(parseFloat(ts.fontSize)) : '16')
      for (let n = 1; n <= 6; n++) set(`estilo.h${n}`, editor.isActive('heading', { level: n }))
      set('estilo.citacao', editor.isActive('blockquote')); set('estilo.codigo', editor.isActive('codeBlock'))
      set('fmt.pincel', pincel.current !== null)
    }
    f()
    editor.on('transaction', f)
    return () => { editor.off('transaction', f) }
  }, [editor])

  // ---------------------------------------------------------------- pincel de formatação: aplica na próxima seleção
  useEffect(() => {
    if (!editor) return
    const f = () => {
      const marks = pincel.current
      if (!marks || editor.state.selection.empty) return
      pincel.current = null; cmdRef.current.definirEstado('fmt.pincel', false)
      aplicarMarks(editor, marks)
    }
    editor.on('selectionUpdate', f)
    return () => { editor.off('selectionUpdate', f); pincel.current = null }
  }, [editor])

  // ---------------------------------------------------------------- atalhos que o TipTap não tem + clique em ligações
  useEffect(() => {
    if (!editor) return
    const f = (e: KeyboardEvent) => {
      let dom: HTMLElement | null = null
      try { dom = editor.view.dom as HTMLElement } catch { return }
      if (!dom || !(e.target instanceof Node) || !dom.contains(e.target)) return
      const ctrl = e.ctrlKey || e.metaKey
      let id: string | null = null
      let payload: unknown
      if (ctrl && !e.altKey && !e.shiftKey) {
        const c = e.code
        if (c === 'KeyK') id = 'inserir.link'
        else if (c === 'Period') id = 'fmt.marcadores'
        else if (c === 'Slash') id = 'fmt.numeracao'
        else if (c === 'KeyQ') { id = 'fmt.alinhar'; payload = 'esquerda' }
        else if (c === 'KeyR') { id = 'fmt.alinhar'; payload = 'direita' }
        else if (c === 'Digit0') id = 'marca.remover'
        else { const m = /^(?:Digit|Numpad)([1-5])$/.exec(c); if (m) id = ['marca.a_fazer', 'marca.importante', 'marca.pergunta', 'marca.lembrar', 'marca.definicao'][Number(m[1]) - 1] }
      } else if (ctrl && e.shiftKey && !e.altKey && e.code === 'KeyN') id = 'fmt.limpar'
      else if (e.altKey && !ctrl && !e.shiftKey && (e.code === 'Minus' || e.code === 'NumpadSubtract')) id = 'fmt.tachado'
      else if (e.altKey && e.shiftKey && !ctrl) { id = ({ KeyD: 'inserir.data', KeyF: 'inserir.data_hora', KeyT: 'inserir.hora' } as Record<string, string>)[e.code] ?? null }
      if (!id || !cmdRef.current.tem(id)) return
      e.preventDefault(); e.stopPropagation()
      cmdRef.current.executar(id, payload)
    }
    window.addEventListener('keydown', f, true)

    const clique = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.('a')
      const href = a?.getAttribute('href')
      if (!a || !href) return
      const m = /[?&]pagina=([0-9a-f-]{36})(?:&|$)/i.exec(href)
      if (m && href.startsWith('/aluno/')) { e.preventDefault(); ctxRef.current.abrirPagina?.(m[1].toLowerCase()); return }
      if ((e.ctrlKey || e.metaKey) && /^(https?:|mailto:)/i.test(href)) { e.preventDefault(); window.open(href, '_blank', 'noopener,noreferrer') }
    }
    let dom: HTMLElement | null = null
    try { dom = editor.view.dom as HTMLElement; dom.addEventListener('click', clique) } catch { /* editor ainda sem view */ }
    return () => { window.removeEventListener('keydown', f, true); dom?.removeEventListener('click', clique) }
  }, [editor])

  // ---------------------------------------------------------------- `[[` abre a lista de páginas
  useEffect(() => {
    if (!editor) return
    const f = ({ transaction }: { transaction: { docChanged: boolean } }) => {
      if (!transaction.docChanged || editor.isDestroyed) return
      const { from, empty } = editor.state.selection
      if (!empty || from < 2) return
      if (editor.state.doc.textBetween(from - 2, from, '\n', '\0') !== '[[') return
      try {
        const c = editor.view.coordsAtPos(from)
        setPop({ t: 'paginas', x: c.left, y: c.bottom + 4, apagar: { from: from - 2, to: from } })
      } catch { /* ignora */ }
    }
    editor.on('update', f as any)
    return () => { editor.off('update', f as any) }
  }, [editor])

  // ---------------------------------------------------------------- handlers
  const handlers = useMemo<Record<string, CmdHandler>>(() => {
    if (!editor) return {}
    const ch = () => editor.chain().focus()
    const marca = (nome: string) => () => { ch().toggleMark(nome).run() }
    const setCor = (nome: 'color' | 'fontFamily' | 'fontSize', v: string | null) => { ch().setMark('textStyle', { [nome]: v }).run() }
    const selecionarArquivo = (accept: string, imagem: boolean) => {
      const inp = document.createElement('input')
      inp.type = 'file'; inp.accept = accept; inp.multiple = true
      inp.onchange = () => { void (async () => { for (const f of Array.from(inp.files ?? [])) { if (imagem && !f.type.startsWith('image/')) { avisar('Escolha um arquivo de imagem.'); continue } await inserirArquivo(editor, f) } })() }
      inp.click()
    }
    const colar = async (semFormatacao: boolean) => {
      editor.commands.focus()
      try {
        const itens = await navigator.clipboard.read()
        for (const it of itens) {
          const html = !semFormatacao && it.types.includes('text/html') ? await (await it.getType('text/html')).text() : ''
          const img = it.types.find((t) => /^image\/(png|jpeg|webp|gif)$/.test(t))
          if (img && !html.replace(/<[^>]*>/g, '').trim()) { const b = await it.getType(img); await inserirArquivo(editor, new File([b], 'imagem.' + img.split('/')[1].replace('jpeg', 'jpg'), { type: img })); return }
          if (html) { editor.view.pasteHTML(html); return }
          if (it.types.includes('text/plain')) { editor.view.pasteText(await (await it.getType('text/plain')).text()); return }
        }
      } catch {
        try { editor.view.pasteText(await navigator.clipboard.readText()) } catch { avisar('O navegador bloqueou o acesso à área de transferência. Use Ctrl+V.') }
      }
    }
    const copiar = (cortar: boolean) => {
      editor.commands.focus()
      let ok = false
      try { ok = document.execCommand(cortar ? 'cut' : 'copy') } catch { ok = false }
      if (ok) return
      const { from, to, empty } = editor.state.selection
      if (empty) return
      void navigator.clipboard?.writeText(editor.state.doc.textBetween(from, to, '\n')).then(() => { if (cortar) editor.chain().focus().deleteSelection().run() }, () => avisar('Não foi possível copiar. Use Ctrl+C.'))
    }
    const link = async () => {
      const atual = editor.getAttributes('link').href as string | undefined
      const u = await pedirTexto({ titulo: 'Link', label: 'Endereço (https://…)', valorInicial: atual ?? 'https://' })
      if (u === null) return
      if (!u.trim()) { ch().extendMarkRange('link').unsetLink().run(); return }
      const href = normalizarLink(u)
      if (!href) { avisar('Endereço inválido. Use https://, http:// ou mailto:.'); return }
      if (editor.state.selection.empty && !editor.isActive('link')) {
        ch().insertContent({ type: 'text', text: href.replace(/^mailto:/, ''), marks: [{ type: 'link', attrs: { href } }] }).insertContent(' ').run()
      } else ch().extendMarkRange('link').setLink({ href }).run()
    }
    const inserirTexto = (t: string) => { ch().insertContent(t).run() }
    const agora = () => new Date()

    const m: Record<string, CmdHandler> = {
      'fmt.negrito': marca('bold'), 'fmt.italico': marca('italic'), 'fmt.sublinhado': marca('underline'), 'fmt.tachado': marca('strike'),
      'fmt.subscrito': marca('subscript'), 'fmt.sobrescrito': marca('superscript'),
      'fmt.realce': (cor) => { if (typeof cor === 'string' && cor) ch().setMark('highlight', { color: cor }).run(); else ch().unsetMark('highlight').run() },
      'fmt.cor_fonte': (cor) => setCor('color', typeof cor === 'string' && cor ? cor : null),
      'fmt.fonte': (nome) => { const f = familiaValida(nome); if (f) setCor('fontFamily', f) },
      'fmt.tamanho': (n) => { const t = tamanhoFonteValido(`${parseFloat(String(n))}px`); if (t) setCor('fontSize', t) },
      'fmt.marcadores': () => { ch().toggleBulletList().run() }, 'fmt.numeracao': () => { ch().toggleOrderedList().run() },
      'fmt.recuo_mais': () => { recuoMais(editor) }, 'fmt.recuo_menos': () => { recuoMenos(editor) },
      'fmt.alinhar': (p) => alinhar(editor, p),
      'fmt.limpar': () => limparFormatacao(editor),
      'fmt.colar': (p) => colar(p === 'texto'), 'fmt.recortar': () => copiar(true), 'fmt.copiar': () => copiar(false),
      'fmt.pincel': () => {
        if (pincel.current) { pincel.current = null; cmdRef.current.definirEstado('fmt.pincel', false); return }
        pincel.current = marksDoCursor(editor); cmdRef.current.definirEstado('fmt.pincel', true)
        avisar('Pincel ativo: selecione o texto que receberá a formatação.')
      },

      'estilo.h1': () => aplicarEstilo(editor, 'h1'), 'estilo.h2': () => aplicarEstilo(editor, 'h2'), 'estilo.h3': () => aplicarEstilo(editor, 'h3'),
      'estilo.h4': () => aplicarEstilo(editor, 'h4'), 'estilo.h5': () => aplicarEstilo(editor, 'h5'), 'estilo.h6': () => aplicarEstilo(editor, 'h6'),
      'estilo.titulo_pagina': () => aplicarEstilo(editor, 'titulo_pagina'),
      'estilo.citacao': () => aplicarEstilo(editor, 'citacao'), 'estilo.codigo': () => aplicarEstilo(editor, 'codigo'), 'estilo.normal': () => aplicarEstilo(editor, 'normal'),

      'marca.a_fazer': () => alternarMarca(editor, 'a_fazer'), 'marca.importante': () => alternarMarca(editor, 'importante'),
      'marca.pergunta': () => alternarMarca(editor, 'pergunta'), 'marca.lembrar': () => alternarMarca(editor, 'lembrar'),
      'marca.definicao': () => alternarMarca(editor, 'definicao'), 'marca.remover': () => { removerMarca(editor) },
      'marca.localizar': () => setResumo((v) => !v),

      'inserir.tabela': (p) => {
        const t = p as { linhas?: number; colunas?: number } | undefined
        if (t?.linhas && t?.colunas) { ch().insertTable({ rows: Math.min(30, t.linhas), cols: Math.min(12, t.colunas), withHeaderRow: false }).run(); return }
        setPop({ t: 'tabela', ...ancora('Tabela') })
      },
      'inserir.link': link,
      'inserir.link_pagina': () => { const c = editor.view.coordsAtPos(editor.state.selection.from); setPop({ t: 'paginas', x: c.left, y: c.bottom + 4, apagar: null }) },
      'inserir.data': () => inserirTexto(fmtData(agora())),
      'inserir.hora': () => inserirTexto(fmtHora(agora())),
      'inserir.data_hora': () => { const d = agora(); inserirTexto(`${fmtData(d)} ${fmtHora(d)}`) },
      'inserir.linha': () => { ch().setHorizontalRule().run() },
      'inserir.simbolo': (p) => { if (typeof p === 'string' && p) inserirTexto(p); else setPop({ t: 'simbolo', ...ancora('Símbolo') }) },
      'inserir.espaco': () => { ch().insertContent([{ type: 'paragraph' }, { type: 'paragraph' }, { type: 'paragraph' }]).run() },
      'inserir.imagem': () => selecionarArquivo('image/png,image/jpeg,image/webp,image/gif', true),
      'inserir.arquivo': () => selecionarArquivo('.pdf,.docx,.xlsx,.pptx,.txt', false),
    }
    return m
  }, [editor, avisar])

  useRegistrarComandos(handlers)

  // ---------------------------------------------------------------- UI auxiliar
  return (
    <>
      {pop?.t === 'tabela' && editor ? <SeletorTabela x={pop.x} y={pop.y} onFechar={() => setPop(null)} onEscolher={(linhas, colunas) => { setPop(null); cmd.executar('inserir.tabela', { linhas, colunas }) }} /> : null}
      {pop?.t === 'simbolo' && editor ? <SeletorSimbolo x={pop.x} y={pop.y} onFechar={() => setPop(null)} onEscolher={(s) => { setPop(null); cmd.executar('inserir.simbolo', s) }} /> : null}
      {pop?.t === 'paginas' && editor ? (
        <SeletorPaginas x={pop.x} y={pop.y} paginas={ctx.paginas ?? []} onFechar={() => setPop(null)}
          onEscolher={(p) => {
            const href = `${ROTA_CADERNO_ONENOTE}?pagina=${p.id}`
            const c = editor.chain().focus()
            if (pop.apagar) c.deleteRange(pop.apagar)
            c.insertContent({ type: 'text', text: p.titulo?.trim() || 'Sem título', marks: [{ type: 'link', attrs: { href } }] }).insertContent(' ').run()
            setPop(null)
          }} />
      ) : null}
      {editor ? <BarraTabela editor={editor} /> : null}
      {resumo && editor ? <PainelMarcas editor={editor} onFechar={() => setResumo(false)} /> : null}
      {aviso ? (
        <div role="status" style={{ position: 'fixed', left: '50%', bottom: 18, transform: 'translateX(-50%)', zIndex: 90, maxWidth: 'min(92vw, 520px)', padding: '8px 14px', borderRadius: 8, background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--line2)', boxShadow: '0 8px 28px -8px color-mix(in srgb, var(--ink) 45%, transparent)', fontSize: 13, fontFamily: FONTE_UI }}>{aviso}</div>
      ) : null}
    </>
  )
}

/** Componente-casca do hook: monte UMA vez dentro de <OneNoteCmdProvider>. */
export function ComandosTexto({ editor, ...ctx }: { editor: Editor | null } & CtxTexto) {
  return <>{useComandosTexto(editor, ctx)}</>
}

// ================================================================ UI auxiliar
const estBtn: React.CSSProperties = { border: '1px solid var(--line)', borderRadius: 4, background: 'var(--surface)', color: 'var(--ink)', fontFamily: 'inherit', cursor: 'pointer' }

function SeletorTabela({ x, y, onFechar, onEscolher }: { x: number; y: number; onFechar: () => void; onEscolher: (l: number, c: number) => void }) {
  const [h, setH] = useState({ l: 3, c: 3 })
  return (
    <Popover x={x} y={y} onFechar={onFechar} minWidth={0}>
      <div role="group" aria-label="Tamanho da tabela" style={{ padding: 6 }}>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${GRADE.colunas}, 22px)`, gap: 3 }}>
          {Array.from({ length: GRADE.linhas * GRADE.colunas }, (_, i) => {
            const l = Math.floor(i / GRADE.colunas) + 1, c = (i % GRADE.colunas) + 1
            const ativo = l <= h.l && c <= h.c
            return <button key={i} type="button" aria-label={`${l} linhas por ${c} colunas`} onMouseEnter={() => setH({ l, c })} onFocus={() => setH({ l, c })} onClick={() => onEscolher(l, c)}
              style={{ ...estBtn, width: 22, height: 22, padding: 0, background: ativo ? 'var(--chip)' : 'var(--surface)', borderColor: ativo ? 'var(--brand)' : 'var(--line)' }} />
          })}
        </div>
        <div style={{ marginTop: 6, fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>{h.l} × {h.c}</div>
      </div>
    </Popover>
  )
}

function SeletorSimbolo({ x, y, onFechar, onEscolher }: { x: number; y: number; onFechar: () => void; onEscolher: (s: string) => void }) {
  return (
    <Popover x={x} y={y} onFechar={onFechar} minWidth={0}>
      <div role="group" aria-label="Símbolos" style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 32px)', gap: 2, padding: 4 }}>
        {SIMBOLOS.map((s) => <button key={s} type="button" aria-label={`Inserir ${s}`} onClick={() => onEscolher(s)} className="onenote-hover" style={{ ...estBtn, width: 32, height: 32, border: 0, background: 'transparent', fontSize: 16 }}>{s}</button>)}
      </div>
    </Popover>
  )
}

function SeletorPaginas({ x, y, paginas, onFechar, onEscolher }: { x: number; y: number; paginas: Pagina[]; onFechar: () => void; onEscolher: (p: Pagina) => void }) {
  const [q, setQ] = useState('')
  const lista = useMemo(() => {
    const t = q.trim().toLowerCase()
    return paginas.filter((p) => !t || (p.titulo || 'sem título').toLowerCase().includes(t)).slice(0, 12)
  }, [paginas, q])
  return (
    <Popover x={x} y={y} onFechar={onFechar} minWidth={260}>
      <div style={{ padding: 4 }}>
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ligar a uma página…" aria-label="Buscar página" maxLength={100}
          onKeyDown={(e) => { if (e.key === 'Enter' && lista[0]) { e.preventDefault(); onEscolher(lista[0]) } }}
          style={{ width: '100%', height: 30, padding: '0 8px', border: '1px solid var(--line2)', borderRadius: 4, background: 'var(--surface)', color: 'var(--ink)', fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
        <div role="listbox" aria-label="Páginas do caderno" style={{ marginTop: 4 }}>
          {lista.length === 0 ? <div style={{ padding: '8px 6px', fontSize: 12.5, color: 'var(--muted)' }}>Nenhuma página encontrada.</div> : null}
          {lista.map((p) => (
            <button key={p.id} type="button" role="option" aria-selected={false} onClick={() => onEscolher(p)} className="onenote-hover"
              style={{ display: 'block', width: '100%', minHeight: 30, padding: '0 8px', border: 0, borderRadius: 4, background: 'transparent', color: 'var(--ink)', fontSize: 13, fontFamily: 'inherit', textAlign: 'left', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {p.titulo?.trim() || 'Sem título'}
            </button>
          ))}
        </div>
      </div>
    </Popover>
  )
}

/** Barra flutuante contextual: aparece sobre a tabela quando o cursor está dentro dela. */
function BarraTabela({ editor }: { editor: Editor }) {
  // `ativa` = cursor dentro de uma tabela. Só então a barra assina scroll/resize (em captura) — fora de tabela não custa nada —
  // e o reposicionamento é coalescido com rAF (uma medição por quadro, não uma por evento de rolagem).
  const [ativa, setAtiva] = useState(() => !editor.isDestroyed && editor.isActive('table'))
  const [, tick] = useState(0)
  useEffect(() => {
    const checar = () => { const a = !editor.isDestroyed && editor.isActive('table'); setAtiva((p) => (p === a ? p : a)) }
    checar()
    editor.on('selectionUpdate', checar); editor.on('transaction', checar)
    return () => { editor.off('selectionUpdate', checar); editor.off('transaction', checar) }
  }, [editor])
  useEffect(() => {
    if (!ativa) return
    let r = 0
    const f = () => { if (!r) r = requestAnimationFrame(() => { r = 0; tick((n) => n + 1) }) }
    editor.on('selectionUpdate', f); editor.on('transaction', f); window.addEventListener('scroll', f, true); window.addEventListener('resize', f)
    return () => { editor.off('selectionUpdate', f); editor.off('transaction', f); window.removeEventListener('scroll', f, true); window.removeEventListener('resize', f); if (r) cancelAnimationFrame(r) }
  }, [editor, ativa])
  if (!ativa || editor.isDestroyed || !editor.isActive('table') || !editor.isEditable) return null
  let top = 130, left = 12
  try {
    const c = editor.view.coordsAtPos(editor.state.selection.from)
    const tabela = (editor.view.domAtPos(editor.state.selection.from).node as HTMLElement | Text)
    const el = (tabela instanceof HTMLElement ? tabela : tabela.parentElement)?.closest('table')
    const r = el?.getBoundingClientRect()
    top = Math.max(96, (r ? r.top : c.top) - 38)
    left = Math.max(8, Math.min((r ? r.left : c.left), window.innerWidth - 330))
  } catch { /* posição padrão */ }
  const b = (rotulo: string, fn: () => void, perigo = false) => (
    <button key={rotulo} type="button" onMouseDown={(e) => e.preventDefault()} onClick={fn} className="onenote-hover"
      style={{ ...estBtn, border: 0, background: 'transparent', minHeight: 28, padding: '0 8px', fontSize: 12.5, whiteSpace: 'nowrap', color: perigo ? 'var(--danger)' : 'var(--ink)' }}>{rotulo}</button>
  )
  const c = () => editor.chain().focus()
  return (
    <div role="toolbar" aria-label="Tabela" style={{ position: 'fixed', top, left, zIndex: 60, display: 'flex', flexWrap: 'wrap', maxWidth: 'calc(100vw - 16px)', gap: 2, padding: 3, background: 'var(--surface)', border: '1px solid var(--line2)', borderRadius: 6, fontFamily: FONTE_UI, boxShadow: '0 6px 20px -8px color-mix(in srgb, var(--ink) 45%, transparent)' }}>
      {b('Linha acima', () => { c().addRowBefore().run() })}
      {b('Linha abaixo', () => { c().addRowAfter().run() })}
      {b('Coluna à esquerda', () => { c().addColumnBefore().run() })}
      {b('Coluna à direita', () => { c().addColumnAfter().run() })}
      {b('Excluir linha', () => { c().deleteRow().run() }, true)}
      {b('Excluir coluna', () => { c().deleteColumn().run() }, true)}
      {b('Excluir tabela', () => { c().deleteTable().run() }, true)}
    </div>
  )
}

/** Painel lateral "Resumo de marcas": marcas da página agrupadas por tipo; clicar leva ao parágrafo. */
function PainelMarcas({ editor, onFechar }: { editor: Editor; onFechar: () => void }) {
  const [itens, setItens] = useState<ItemMarca[]>(() => extrairMarcas(editor.getJSON()))
  useEffect(() => {
    let t: number | undefined
    const f = () => { window.clearTimeout(t); t = window.setTimeout(() => { if (!editor.isDestroyed) setItens(extrairMarcas(editor.getJSON())) }, 300) }
    editor.on('update', f)
    return () => { window.clearTimeout(t); editor.off('update', f) }
  }, [editor])
  const grupos = useMemo(() => agruparMarcas(itens), [itens])
  const ir = async (pos: number) => {
    const { TextSelection } = await import('@tiptap/pm/state')
    editor.chain().focus().command(({ tr }) => { tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(pos + 1, tr.doc.content.size)))); return true }).scrollIntoView().run()
  }
  return (
    <aside aria-label="Resumo de marcas" style={{ position: 'fixed', right: 12, top: 120, bottom: 12, width: 300, maxWidth: 'calc(100vw - 24px)', zIndex: 70, display: 'flex', flexDirection: 'column', background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--line2)', borderRadius: 8, fontFamily: FONTE_UI, boxShadow: '0 12px 32px -12px color-mix(in srgb, var(--ink) 50%, transparent)' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '8px 10px', borderBottom: '1px solid var(--line)' }}>
        <strong style={{ flex: 1, fontSize: 14 }}>Resumo de marcas</strong>
        <button type="button" aria-label="Fechar resumo de marcas" onClick={onFechar} className="onenote-hover" style={{ ...estBtn, border: 0, background: 'transparent', width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><X size={16} aria-hidden /></button>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 8 }}>
        {grupos.length === 0 ? <p style={{ margin: 8, fontSize: 13, color: 'var(--muted)' }}>Esta página ainda não tem marcas. Use Ctrl+1 a Ctrl+5 para marcar um parágrafo.</p> : null}
        {grupos.map((g) => (
          <section key={g.tipo} style={{ marginBottom: 10 }}>
            <h3 style={{ margin: '4px 4px 4px', fontSize: 12, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--brand)' }}>{ROTULO_MARCA[g.tipo]} ({g.itens.length})</h3>
            {g.itens.map((i, k) => (
              <button key={`${i.pos}-${k}`} type="button" onClick={() => ir(i.pos)} className="onenote-hover"
                style={{ display: 'flex', gap: 6, width: '100%', minHeight: 30, padding: '4px 6px', border: 0, borderRadius: 4, background: 'transparent', color: i.feito ? 'var(--muted)' : 'var(--ink)', textDecoration: i.feito ? 'line-through' : undefined, fontSize: 13, fontFamily: 'inherit', textAlign: 'left', cursor: 'pointer', overflowWrap: 'anywhere' }}>
                {g.tipo === 'a_fazer' ? <span aria-hidden>{i.feito ? '☑' : '☐'}</span> : null}
                <span>{i.texto || '(sem texto)'}</span>
              </button>
            ))}
          </section>
        ))}
      </div>
    </aside>
  )
}
