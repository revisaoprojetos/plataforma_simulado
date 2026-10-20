'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Highlighter, Trash2, X } from 'lucide-react'
import type { TrechoLeitura } from '@/lib/conteudo/leitor'
import type { Anotacao } from '@/lib/conteudo/anotacoes'

// Leitor da Biblioteca do aluno (Fase 6/8). Ancoragem por (trecho_uid + offset NO TRECHO): robusta e
// alinhada à tabela de anotações. Grifos salvos repintam ao reabrir; sobrevivem às edições do admin
// porque o uid é carregado na reconciliação (ver lib/conteudo/reconciliacao.ts).
// Cores de grifo = paleta do aluno (literais semânticas, como no leitor da Leitura).
const CORES = ['#fde047', '#86efac', '#93c5fd', '#f9a8d4', '#fca5a5']

interface Props { documentoId: string; versaoId: string; titulo: string; trechos: TrechoLeitura[]; anotacoes: Anotacao[] }
type Sel = { uid: string; ini: number; fim: number; texto: string; x: number; y: number }

function offsetEm(txtEl: HTMLElement, node: Node, off: number): number {
  const walker = document.createTreeWalker(txtEl, NodeFilter.SHOW_TEXT)
  let total = 0, n: Node | null
  while ((n = walker.nextNode())) { if (n === node) return total + off; total += (n.textContent || '').length }
  return total
}

function segmentos(texto: string, anots: Anotacao[]): { t: string; a?: Anotacao }[] {
  const marcas = anots.filter((a) => a.tipo !== 'nota' && a.fim_offset > a.inicio_offset).sort((x, y) => x.inicio_offset - y.inicio_offset)
  if (!marcas.length) return [{ t: texto }]
  const out: { t: string; a?: Anotacao }[] = []
  let cur = 0
  for (const m of marcas) {
    const ini = Math.max(cur, Math.min(m.inicio_offset, texto.length))
    const fim = Math.max(ini, Math.min(m.fim_offset, texto.length))
    if (ini > cur) out.push({ t: texto.slice(cur, ini) })
    if (fim > ini) out.push({ t: texto.slice(ini, fim), a: m })
    cur = Math.max(cur, fim)
  }
  if (cur < texto.length) out.push({ t: texto.slice(cur) })
  return out
}

export function LeitorConteudo({ documentoId, versaoId, titulo, trechos, anotacoes: iniciais }: Props) {
  const [anotacoes, setAnotacoes] = useState<Anotacao[]>(iniciais)
  const [sel, setSel] = useState<Sel | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const porUid = useMemo(() => {
    const m = new Map<string, Anotacao[]>()
    for (const a of anotacoes) { const l = m.get(a.trecho_uid); if (l) l.push(a); else m.set(a.trecho_uid, [a]) }
    return m
  }, [anotacoes])

  function aoSoltar() {
    const s = window.getSelection()
    if (!s || s.isCollapsed || s.rangeCount === 0) { setSel(null); return }
    const range = s.getRangeAt(0)
    const el1 = (range.startContainer.parentElement)?.closest('[data-txt]') as HTMLElement | null
    const el2 = (range.endContainer.parentElement)?.closest('[data-txt]') as HTMLElement | null
    if (!el1 || el1 !== el2) { toast.message('Selecione dentro de um único parágrafo.'); setSel(null); return }
    const uid = el1.getAttribute('data-uid') || ''
    let ini = offsetEm(el1, range.startContainer, range.startOffset)
    let fim = offsetEm(el1, range.endContainer, range.endOffset)
    if (ini > fim) [ini, fim] = [fim, ini]
    if (fim - ini < 1) { setSel(null); return }
    const texto = (el1.textContent || '').slice(ini, fim)
    const rect = range.getBoundingClientRect()
    const base = containerRef.current!.getBoundingClientRect()
    setSel({ uid, ini, fim, texto, x: rect.left - base.left + rect.width / 2, y: rect.top - base.top })
  }

  async function grifar(cor: string) {
    if (!sel) return
    const tmp: Anotacao = { id: 'tmp-' + Date.now(), aluno_id: '', documento_id: documentoId, trecho_uid: sel.uid, tipo: 'destaque', inicio_offset: sel.ini, fim_offset: sel.fim, texto_ancora: sel.texto, contexto_antes: null, contexto_depois: null, conteudo: { cor }, estado: 'ativa', criada_em: '', atualizada_em: '' }
    setAnotacoes((p) => [...p, tmp]); setSel(null); window.getSelection()?.removeAllRanges()
    try {
      const r = await fetch('/api/conteudo/anotacao', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ documento_id: documentoId, versao_id: versaoId, trecho_uid: sel.uid, tipo: 'destaque', inicio_offset: sel.ini, fim_offset: sel.fim, texto_ancora: sel.texto, conteudo: { cor } }) })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.message)
      setAnotacoes((p) => p.map((a) => (a.id === tmp.id ? { ...tmp, id: j.id } : a)))
    } catch (e: any) { setAnotacoes((p) => p.filter((a) => a.id !== tmp.id)); toast.error(e?.message || 'Falha ao salvar o grifo.') }
  }

  async function remover(a: Anotacao) {
    setAnotacoes((p) => p.filter((x) => x.id !== a.id))
    try { await fetch('/api/conteudo/anotacao?id=' + encodeURIComponent(a.id), { method: 'DELETE' }) } catch { toast.error('Falha ao remover.') }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="mb-1 text-2xl font-bold tracking-tight">{titulo}</h1>
      <p className="mb-6 text-xs text-muted-foreground">Selecione um trecho para grifar. Seus grifos ficam salvos e reaparecem — mesmo após o conteúdo ser atualizado.</p>

      <div ref={containerRef} className="relative" onMouseUp={aoSoltar}>
        <article className="space-y-3 leading-relaxed text-foreground">
          {trechos.map((tr) => {
            const segs = segmentos(tr.texto, porUid.get(tr.uid) ?? [])
            const Tag = tr.tipo === 'titulo' ? 'h2' : tr.tipo === 'capitulo' ? 'h3' : 'p'
            return (
              <Tag key={tr.uid} className={tr.tipo === 'titulo' ? 'text-lg font-bold' : tr.tipo === 'capitulo' ? 'text-base font-semibold text-muted-foreground' : 'text-[15px]'}>
                <span data-txt data-uid={tr.uid} className="select-text">
                  {segs.map((s, i) => s.a
                    ? <mark key={i} onClick={() => remover(s.a!)} title="Clique para remover" style={{ background: (s.a.conteudo?.cor as string) || '#fde047', borderRadius: 2, cursor: 'pointer', color: 'inherit' }}>{s.t}</mark>
                    : <span key={i}>{s.t}</span>)}
                </span>
              </Tag>
            )
          })}
        </article>

        {sel && (
          <div className="absolute z-20 -translate-x-1/2 -translate-y-full rounded-xl border bg-card p-1.5 shadow-lg" style={{ left: sel.x, top: sel.y - 6 }}>
            <div className="flex items-center gap-1">
              <Highlighter className="h-4 w-4 text-muted-foreground" />
              {CORES.map((c) => (
                <button key={c} onClick={() => grifar(c)} aria-label={'Grifar ' + c} className="h-6 w-6 rounded-full border border-black/10 transition hover:scale-110" style={{ background: c }} />
              ))}
              <button onClick={() => setSel(null)} aria-label="Cancelar" className="ml-1 rounded-md p-1 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
            </div>
          </div>
        )}
      </div>

      {anotacoes.some((a) => a.estado !== 'ativa') && (
        <div className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-400">
          Alguns dos seus grifos mudaram de contexto após uma atualização do material. Eles continuam salvos — revise onde aparecem.
        </div>
      )}
    </div>
  )
}
