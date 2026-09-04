'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Pencil, Save, Loader2, Bold, Eraser, X, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { confirmar } from '@/components/ui/confirm-dialog'
import { salvarConteudoHtml } from '@/app/admin/leitura/upload-actions'

// Editor WYSIWYG de grifos DENTRO da prévia: o admin seleciona um trecho e aplica
// grifo (núcleo/complemento/prazo/exceção), negrito ou caixa (STJ/STF/Equipe/Atenção),
// vendo o resultado na hora (o CSS .leitura-prosa pinta os data-grifo/data-caixa).
// Salva o HTML editado via salvarConteudoHtml (re-sanitiza + versiona como rascunho).

// Grifos inline (decorativos) — cores batem com o CSS .leitura-prosa.
const GRIFOS_INLINE = [
  { id: 'nucleo', label: 'Núcleo', cor: '#fff35c', texto: '#111' },
  { id: 'complemento', label: 'Complemento', cor: '#a8d08d', texto: '#111' },
  { id: 'prazo', label: 'Prazo', cor: '#cc99ff', texto: '#111' },
  { id: 'excecao', label: 'Exceção', cor: '#f3b0b0', texto: '#c00000' },
] as const
// Caixas de destaque (estruturais) — cores batem com o CSS.
const CAIXAS = [
  { id: 'comentario', label: 'Equipe', cor: '#d0cece' },
  { id: 'stj', label: 'STJ', cor: '#fff2cc' },
  { id: 'stf', label: 'STF', cor: '#bdd6ee' },
  { id: 'alerta', label: 'Atenção', cor: '#fde9d9' },
] as const

const CONTENT_CLASS =
  'leitura-prosa px-6 py-5 text-sm leading-relaxed outline-none [&_a]:text-primary [&_a]:underline [&_h1]:mb-2 [&_h1]:mt-3 [&_h1]:text-lg [&_h1]:font-bold [&_h2]:mb-1.5 [&_h2]:mt-3 [&_h2]:text-base [&_h2]:font-bold [&_h3]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_p]:mb-2 [&_table]:w-full [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:px-2 [&_th]:py-1'
// Fundo pontilhado do "canvas" da prévia (igual ao construtor de caderno).
const CANVAS_DOTS = 'bg-[radial-gradient(circle,theme(colors.slate.300)_1px,transparent_1px)] [background-size:18px_18px] dark:bg-[radial-gradient(circle,theme(colors.slate.700)_1px,transparent_1px)]'

export function LeituraPreviewGrifos({ documentoId, html, podeEditar, artigos = 0 }: {
  documentoId: string; html: string; podeEditar: boolean; artigos?: number
}) {
  const router = useRouter()
  const boxRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const [editando, setEditando] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [maxH, setMaxH] = useState<number>()
  const scrollRef = useRef<HTMLDivElement>(null)

  // Índice (CAPÍTULO→Art→§) do conteúdo, para o professor navegar a prévia (mesma hierarquia do leitor).
  const secoes = useMemo(() => {
    type Sec = { dispId: string | null; artId: string | null; nivel: number; label: string }
    if (typeof window === 'undefined' || !html) return [] as Sec[]
    const parsed = new DOMParser().parseFromString(html, 'text/html')
    const NIVEL: Record<string, number> = { livro: 0, parte: 0, titulo: 0, capitulo: 0, secao: 0, subsecao: 0, artigo: 1, paragrafo: 2, inciso: 3, alinea: 4, item: 4 }
    const disp = Array.from(parsed.querySelectorAll('[data-disp]'))
    const src = disp.length ? disp : Array.from(parsed.querySelectorAll('[data-art]'))
    return src.map((el): Sec => {
      const dispId = el.getAttribute('data-disp')
      const artId = el.getAttribute('data-art')
      const tipo = el.getAttribute('data-disp-tipo') || 'artigo'
      const id = dispId || `art-${artId}`
      const nivel = disp.length ? (NIVEL[tipo] ?? Math.min(4, (id.match(/\./g) || []).length + 1)) : 0
      return { dispId, artId, nivel, label: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60) || id }
    })
  }, [html])
  function pular(s: { dispId: string | null; artId: string | null }) {
    const cont = scrollRef.current; if (!cont) return
    const alvo = s.dispId ? cont.querySelector(`[data-disp="${CSS.escape(s.dispId)}"]`) : s.artId ? cont.querySelector(`[data-art="${s.artId}"]`) : null
    alvo?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }

  // Adapta a altura do canvas à tela: mede o topo e ocupa até 16px do fim da janela.
  useEffect(() => {
    const medir = () => {
      const el = canvasRef.current
      if (!el) return
      const top = el.getBoundingClientRect().top
      setMaxH(Math.max(360, Math.round(window.innerHeight - top - 16)))
    }
    medir()
    const t = setTimeout(medir, 120)
    window.addEventListener('resize', medir)
    return () => { clearTimeout(t); window.removeEventListener('resize', medir) }
  }, [editando, html])

  // Ao entrar no modo de edição, injeta o HTML atual (imperativo: contentEditable
  // não pode ser controlado pelo React sem clobber das edições do usuário).
  useEffect(() => {
    if (editando && boxRef.current) { boxRef.current.innerHTML = html; setDirty(false) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editando])

  // Remove um elemento mantendo os filhos no lugar (unwrap).
  function desembrulhar(el: Element) {
    const p = el.parentNode; if (!p) return
    while (el.firstChild) p.insertBefore(el.firstChild, el)
    p.removeChild(el)
    ;(p as any).normalize?.()
  }

  function selecaoNoEditor(): Range | null {
    const sel = window.getSelection()
    if (!sel || !sel.rangeCount) return null
    const r = sel.getRangeAt(0)
    if (!boxRef.current?.contains(r.commonAncestorContainer)) return null
    return r
  }

  // Aplica um grifo inline à seleção. Grifos internos são desfeitos (o novo tipo
  // vale para todo o trecho); grifos ancestrais permanecem (grifo parcial).
  function aplicarGrifo(tipo: string) {
    const range = selecaoNoEditor()
    if (!range || range.collapsed) { toast.message('Selecione um trecho para grifar'); return }
    const span = document.createElement('span')
    span.setAttribute('data-grifo', tipo)
    try { range.surroundContents(span) }
    catch { const frag = range.extractContents(); span.appendChild(frag); range.insertNode(span) }
    span.querySelectorAll('[data-grifo]').forEach(desembrulhar)
    span.normalize()
    window.getSelection()?.removeAllRanges()
    setDirty(true)
    boxRef.current?.focus()
  }

  // Remove grifos inline que tocam a seleção (ou o grifo sob o cursor).
  function removerGrifo() {
    const box = boxRef.current; if (!box) return
    const sel = window.getSelection(); if (!sel || !sel.rangeCount) return
    const range = sel.getRangeAt(0)
    const alvos = Array.from(box.querySelectorAll('[data-grifo]')).filter((g) => range.intersectsNode(g))
    if (!alvos.length) {
      let n: Node | null = sel.anchorNode
      while (n && n !== box) { if (n.nodeType === 1 && (n as Element).hasAttribute?.('data-grifo')) { alvos.push(n as Element); break } n = n.parentNode }
    }
    if (!alvos.length) { toast.message('Nenhum grifo na seleção'); return }
    alvos.forEach(desembrulhar)
    setDirty(true)
  }

  function negrito() {
    boxRef.current?.focus()
    try { document.execCommand('styleWithCSS', false, 'false'); document.execCommand('bold') } catch { /* ok */ }
    setDirty(true)
  }

  // Envolve os parágrafos selecionados numa caixa; se já estiver numa caixa, troca
  // o tipo (ou desfaz, se for o mesmo tipo) — toggle.
  function toggleCaixa(tipo: string) {
    const box = boxRef.current; if (!box) return
    const sel = window.getSelection(); if (!sel || !sel.rangeCount) return
    let n: Node | null = sel.anchorNode
    while (n && n !== box) { if (n.nodeType === 1 && (n as Element).getAttribute?.('data-caixa')) break; n = n.parentNode }
    const caixa = n && n !== box ? (n as Element) : null
    if (caixa?.getAttribute('data-caixa')) {
      if (caixa.getAttribute('data-caixa') === tipo) desembrulhar(caixa)
      else caixa.setAttribute('data-caixa', tipo)
      setDirty(true); return
    }
    const range = sel.getRangeAt(0)
    const blocos = Array.from(box.children).filter((ch) => range.intersectsNode(ch))
    if (!blocos.length) { toast.message('Selecione ao menos um parágrafo'); return }
    const div = document.createElement('div'); div.setAttribute('data-caixa', tipo)
    box.insertBefore(div, blocos[0]); blocos.forEach((b) => div.appendChild(b))
    setDirty(true)
  }

  async function salvar() {
    if (!boxRef.current) return
    setSalvando(true)
    const r = await salvarConteudoHtml(documentoId, boxRef.current.innerHTML)
    setSalvando(false)
    if (r.ok) { toast.success('Grifos salvos'); setDirty(false); router.refresh() }
    else toast.error(r.error ?? 'Erro ao salvar.')
  }

  async function sair() {
    if (dirty && !(await confirmar({ titulo: 'Descartar alterações?', mensagem: 'Há grifos não salvos. Sair mesmo assim?', confirmar: 'Descartar', destrutivo: true }))) return
    setEditando(false)
  }

  // Botão de barra (não perde a seleção ao clicar → onMouseDown preventDefault).
  const Btn = ({ onClick, title, children, className }: { onClick: () => void; title: string; children: ReactNode; className?: string }) => (
    <button type="button" title={title} onMouseDown={(e) => e.preventDefault()} onClick={onClick}
      className={cn('inline-flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors hover:bg-muted', className)}>
      {children}
    </button>
  )

  return (
    <div ref={canvasRef} style={{ height: maxH }} className="grid min-h-[460px] overflow-hidden rounded-2xl border bg-card shadow-sm lg:grid-cols-[280px_1fr]">
      {/* ESQUERDA: painel de controles (flat, estilo construtor) */}
      <div className="flex flex-col gap-3 overflow-y-auto border-b bg-muted/20 p-3 lg:border-b-0 lg:border-r">
        {editando && (
          <div className="flex items-center justify-end gap-1.5 border-b pb-3">
            <button onClick={sair} title="Fechar edição" className="rounded-lg border bg-card p-1.5 text-muted-foreground transition hover:bg-muted"><X className="h-3.5 w-3.5" /></button>
            <button onClick={salvar} disabled={salvando || !dirty} className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50">
              {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Salvar
            </button>
          </div>
        )}

        {!editando ? (
          podeEditar ? (
            <>
              <p className="text-xs text-muted-foreground">Grife trechos por tipo (núcleo, prazo, exceção…) direto na prévia ao lado.</p>
              <button onClick={() => setEditando(true)} disabled={!html} className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border bg-card px-3 py-2 text-sm font-semibold transition hover:bg-muted disabled:opacity-50">
                <Pencil className="h-4 w-4" /> Editar grifos
              </button>
            </>
          ) : <p className="text-xs text-muted-foreground">Somente leitura.</p>
        ) : (
          <>
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Grifo</p>
              <div className="grid grid-cols-2 gap-1.5">
                {GRIFOS_INLINE.map((g) => (
                  <Btn key={g.id} title={`Grifar: ${g.label}`} onClick={() => aplicarGrifo(g.id)} className="justify-start bg-card">
                    <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-black/10" style={{ background: g.cor }} />
                    <span className="truncate" style={{ color: g.id === 'excecao' ? g.texto : undefined, fontWeight: g.id === 'excecao' ? 700 : undefined }}>{g.label}</span>
                  </Btn>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <Btn title="Negrito (selecione o trecho)" onClick={negrito} className="justify-center bg-card"><Bold className="h-3.5 w-3.5" /> Negrito</Btn>
                <Btn title="Remover grifo da seleção" onClick={removerGrifo} className="justify-center bg-card text-destructive hover:bg-destructive/10"><Eraser className="h-3.5 w-3.5" /> Remover</Btn>
              </div>
            </div>
            <div className="space-y-1.5 border-t pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Caixa</p>
              <div className="grid grid-cols-2 gap-1.5">
                {CAIXAS.map((c) => (
                  <Btn key={c.id} title={`Caixa: ${c.label} (clique de novo p/ desfazer)`} onClick={() => toggleCaixa(c.id)} className="justify-start bg-card">
                    <span className="h-3.5 w-3.5 shrink-0 rounded border border-black/10" style={{ background: c.cor }} />
                    <span className="truncate">{c.label}</span>
                  </Btn>
                ))}
              </div>
            </div>
            <p className="mt-auto flex items-start gap-1.5 border-t pt-2 text-[11px] text-muted-foreground">
              <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" /> Selecione um trecho na prévia e clique num grifo. Clique em Salvar para gravar.
            </p>
          </>
        )}

        {/* Índice CAPÍTULO→Art→§ — navega a prévia (funciona lendo e editando). */}
        {secoes.length > 0 && (
          <div className="space-y-1 border-t pt-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Índice</p>
            <div className="max-h-[42vh] space-y-0.5 overflow-y-auto">
              {secoes.map((s, i) => (
                <button
                  key={i}
                  onClick={() => pular(s)}
                  className="block w-full truncate rounded py-0.5 pr-1 text-left text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  style={{ paddingLeft: 4 + s.nivel * 10, fontWeight: s.nivel <= 1 ? 600 : 400, opacity: s.nivel >= 2 ? 0.85 : 1 }}
                  title={s.label}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* DIREITA: prévia grande sobre canvas pontilhado (igual ao construtor) */}
      <div ref={scrollRef} className={cn('overflow-auto p-5', CANVAS_DOTS)}>
        {editando ? (
          <div className="mx-auto max-w-3xl overflow-hidden rounded-lg border bg-card shadow-sm">
            <div ref={boxRef} contentEditable suppressContentEditableWarning spellCheck={false} onInput={() => setDirty(true)}
              className={cn(CONTENT_CLASS, 'focus:ring-1 focus:ring-inset focus:ring-ring')} />
          </div>
        ) : html ? (
          <div className="mx-auto max-w-3xl overflow-hidden rounded-lg border bg-card shadow-sm">
            <div className={CONTENT_CLASS} dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="rounded-lg border bg-card px-5 py-10 text-center text-sm text-muted-foreground shadow-sm">Sem conteúdo ainda. Importe na aba <span className="font-medium text-foreground">Configuração</span>.</p>
          </div>
        )}
      </div>
    </div>
  )
}
