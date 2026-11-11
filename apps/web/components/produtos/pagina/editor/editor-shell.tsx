'use client'

// SHELL do editor visual (tela cheia): barra superior · paleta (esq.) · canvas · propriedades (dir.).
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ExternalLink, Monitor, PanelLeftClose, PanelLeftOpen, Redo2, Smartphone, Tablet, Undo2 } from 'lucide-react'
import type { DadosPagina } from '@/lib/produtos/pagina/dados'
import type { Dispositivo, PaginaV1 } from '@/lib/produtos/pagina/tipos'
import { cn } from '@/lib/utils'
import { EditorProvider, useEditor } from './store'
import { Canvas } from './canvas'
import { DndArea } from './dnd-area'
import { BarraVersoes, PainelPropriedades, PaletaElementos } from './pontes'

const DISPOSITIVOS: { v: Dispositivo; rotulo: string; Icone: typeof Monitor }[] = [
  { v: 'desktop', rotulo: 'Desktop', Icone: Monitor }, { v: 'tablet', rotulo: 'Tablet', Icone: Tablet }, { v: 'mobile', rotulo: 'Mobile', Icone: Smartphone },
]

const ehCampoTexto = (t: EventTarget | null) => {
  const el = t as HTMLElement | null
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || !!el.closest?.('[role="dialog"]'))
}

function Interior({ voltarHref, slug, aviso }: { voltarHref: string; slug: string; aviso: string | null }) {
  const ed = useEditor()
  const { pagina, dispositivo, setDispositivo, desfazer, refazer, podeDesfazer, podeRefazer, sujo, adicionar, marcarSalvo, definirPagina, produtoId, selecaoId, selecionar, remover, duplicar, mover, blocos } = ed
  const [paletaAberta, setPaletaAberta] = useState(true)

  // Aviso de alterações não salvas ao fechar/recarregar.
  useEffect(() => {
    if (!sujo) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [sujo])

  // Atalhos. Campos de texto/contentEditable mantêm o comportamento nativo (exceto Ctrl+S).
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      const k = e.key.toLowerCase()
      if (mod && k === 's') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('pagina:salvar')) // BarraVersoes (P4) escuta este evento
        return
      }
      if (ehCampoTexto(e.target)) return
      if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? refazer() : desfazer(); return }
      if (mod && k === 'y') { e.preventDefault(); refazer(); return }
      if (!selecaoId) return
      const i = blocos.findIndex((b) => b.id === selecaoId)
      if (mod && k === 'd') { e.preventDefault(); duplicar(selecaoId); return }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remover(selecaoId); return }
      if (e.key === 'Escape') { selecionar(null); return }
      if (e.key === 'ArrowUp' && i > 0) { e.preventDefault(); mover(selecaoId, i - 1) }
      if (e.key === 'ArrowDown' && i >= 0 && i < blocos.length - 1) { e.preventDefault(); mover(selecaoId, i + 1) }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [selecaoId, blocos, desfazer, refazer, duplicar, remover, mover, selecionar])

  const onSalvo = useCallback((_p: PaginaV1) => marcarSalvo(), [marcarSalvo])
  const sair = (e: React.MouseEvent) => { if (sujo && !window.confirm('Há alterações não salvas. Sair mesmo assim?')) e.preventDefault() }

  return (
    <DndArea>
      {/* Tela cheia: esconde o botão flutuante de recolher a sidebar do admin (fica por cima do cabeçalho). */}
      <style>{String.raw`.group\/sbcol{display:none!important}[data-edge-toggle]{display:none!important}`}</style>
      <div className="fixed inset-0 z-40 flex flex-col bg-background">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-card px-3">
          <Link href={voltarHref} onClick={sair} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />Produto
          </Link>
          <button type="button" title={paletaAberta ? 'Recolher elementos' : 'Mostrar elementos'} onClick={() => setPaletaAberta((v) => !v)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground">
            {paletaAberta ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
          </button>
          <div className="mx-1 flex rounded-lg border bg-muted/50 p-0.5" role="group" aria-label="Dispositivo">
            {DISPOSITIVOS.map(({ v, rotulo, Icone }) => (
              <button key={v} type="button" title={rotulo} aria-label={rotulo} aria-pressed={dispositivo === v} onClick={() => setDispositivo(v)}
                className={cn('flex h-8 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors', dispositivo === v ? 'bg-card text-foreground shadow-sm' : 'hover:text-foreground')}>
                <Icone className="h-4 w-4" />
              </button>
            ))}
          </div>
          <button type="button" title="Desfazer (Ctrl+Z)" aria-label="Desfazer" disabled={!podeDesfazer} onClick={desfazer} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"><Undo2 className="h-4 w-4" /></button>
          <button type="button" title="Refazer (Ctrl+Shift+Z)" aria-label="Refazer" disabled={!podeRefazer} onClick={refazer} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"><Redo2 className="h-4 w-4" /></button>
          {sujo && <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Alterações não salvas</span>}
          <div className="ml-auto flex items-center gap-2">
            {slug && (
              <a href={`/aluno/extensivos/${slug}?preview=rascunho`} target="_blank" rel="noreferrer"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium hover:bg-muted"><ExternalLink className="h-4 w-4" />Visualizar como aluno</a>
            )}
            <BarraVersoes produtoId={produtoId} pagina={pagina} sujo={sujo} onSalvo={onSalvo} onRestaurar={(p) => definirPagina(p)} />
          </div>
        </header>
        {aviso && <div className="shrink-0 border-b bg-muted/50 px-4 py-1.5 text-xs text-muted-foreground">{aviso}</div>}
        <div className="flex min-h-0 flex-1">
          <aside className={cn('shrink-0 overflow-y-auto border-r bg-card transition-[width] duration-200', paletaAberta ? 'w-64' : 'w-0 border-r-0')} aria-hidden={!paletaAberta}>
            {paletaAberta && <PaletaElementos onAdicionar={(tipo, variacao) => { adicionar(tipo, selecaoId ?? undefined, variacao) }} />}
          </aside>
          <Canvas />
          <aside className="w-80 shrink-0 overflow-y-auto border-l bg-card"><PainelPropriedades /></aside>
        </div>
      </div>
    </DndArea>
  )
}

export function EditorShell({ inicial, dadosAmostra, produtoId, slug, voltarHref, aviso }: {
  inicial: PaginaV1; dadosAmostra: DadosPagina; produtoId: string; slug: string; voltarHref: string; aviso: string | null
}) {
  return (
    <EditorProvider inicial={inicial} dadosAmostra={dadosAmostra} produtoId={produtoId}>
      <Interior voltarHref={voltarHref} slug={slug} aviso={aviso} />
    </EditorProvider>
  )
}
