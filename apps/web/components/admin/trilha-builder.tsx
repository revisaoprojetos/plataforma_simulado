'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { ArrowLeft, Loader2, Save, RotateCcw, Wand2, Spline, ArrowDownUp, Image as ImageIcon, ZoomIn, ZoomOut, Route } from 'lucide-react'
import { salvarTrilhaAparenciaModulo } from '@/app/admin/leitura/actions'
import { ESCALA_MIN, ESCALA_MAX, type TrilhaAparencia, type TrilhaLivreConfig, type PosXY } from '@/lib/leitura/trilha-aparencia'
import { DEFAULT_TRILHA_SIMBOLOS, type TrilhaSimbolos, type SimboloEstado } from '@/lib/gamificacao/trilha-simbolos'
import { TrilhaSimbolosEditor } from '@/components/gamificacao/trilha-simbolos-editor'
import { TrilhaLivre, defaultPos, type NoLivre } from '@/components/aluno/trilha-livre'

/**
 * Construtor de trilha PERSONALIZADA em tela cheia (estilo construtor de caderno): painel de configurações
 * à esquerda + canvas grande à direita para arrastar as aulas e as curvas sobre a imagem de fundo.
 * Salva formato='livre' + posições/curvas + símbolos em simulado_pastas.trilha_aparencia.
 */
export function TrilhaBuilder({ pastaId, moduloNome, capa, aulas, atual }: {
  pastaId: string
  moduloNome: string
  capa?: string | null
  aulas: { id: string; titulo: string }[]
  atual: TrilhaAparencia
}) {
  const [simbolos, setSimbolos] = useState<TrilhaSimbolos>(atual.simbolos)
  const [livre, setLivre] = useState<TrilhaLivreConfig>(atual.livre)
  const [mostrarFundo, setMostrarFundo] = useState(true)
  const [pending, start] = useTransition()
  // Zoom do editor: mede a área disponível, calcula o tamanho que "encaixa" (fit) e multiplica pelo zoom;
  // acima de 100% o canvas ultrapassa a área e a rolagem (scroll/pan) entra.
  const areaRef = useRef<HTMLDivElement>(null)
  const [area, setArea] = useState({ w: 0, h: 0 })
  const [zoom, setZoom] = useState(1)
  useEffect(() => {
    const el = areaRef.current; if (!el) return
    const calc = () => setArea({ w: el.clientWidth, h: el.clientHeight })
    calc()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(calc) : null
    ro?.observe(el); return () => ro?.disconnect()
  }, [])
  const PAD = 24
  const aspecto = livre.aspecto ?? 0.8
  const availW = Math.max(60, area.w - PAD * 2)
  const availH = Math.max(60, area.h - PAD * 2)
  let fitH = availH, fitW = fitH * aspecto
  if (fitW > availW) { fitW = availW; fitH = fitW / aspecto }
  const canvasW = Math.round(fitW * zoom)
  const canvasH = Math.round(fitH * zoom)
  const setZoomClamp = (z: number) => setZoom(Math.max(0.5, Math.min(4, Math.round(z * 100) / 100)))

  const voltarHref = `/admin/leitura?pasta=${pastaId}&tab=trilha`

  // Estados só p/ ilustrar os 3 estilos de símbolo (o real vem do progresso do aluno).
  const estadoDe = (i: number): SimboloEstado => (i === 0 ? 'concluido' : i === 1 ? 'atual' : 'disponivel')
  const nos: NoLivre[] = useMemo(() => aulas.map((a, i) => ({ id: a.id, titulo: a.titulo, estado: estadoDe(i) })), [aulas])

  function salvar() {
    start(async () => {
      const r = await salvarTrilhaAparenciaModulo(pastaId, { simbolos, formato: 'livre', livre, inverter: atual.inverter, degrade: atual.degrade, degradeTrilha: atual.degradeTrilha })
      if (r.ok) toast.success('Trilha personalizada salva.')
      else toast.error(r.error ?? 'Erro ao salvar')
    })
  }

  // Inverte a posição vertical de todos os nós (início embaixo, fim em cima). Considera as posições
  // já definidas e também as padrão (serpentina), gravando todas espelhadas de uma vez.
  function inverterPosicoes() {
    const espelha = (p: PosXY): PosXY => ({ x: p.x, y: 100 - p.y })
    const novos: Record<string, PosXY> = {}
    nos.forEach((n, i) => { novos[n.id] = espelha(livre.nos[n.id] ?? defaultPos(i, nos.length)) })
    const novasCurvas: Record<string, PosXY> = {}
    for (const [k, p] of Object.entries(livre.curvas)) novasCurvas[k] = espelha(p)
    setLivre((l) => ({ ...l, nos: novos, curvas: novasCurvas }))
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-muted dark:bg-background">
      {/* Top bar */}
      <header className="flex shrink-0 items-center justify-between gap-3 border-b bg-card px-4 py-2.5 shadow-sm">
        <div className="flex min-w-0 items-center gap-2.5">
          <Link href={voltarHref} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label="Voltar">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Route className="h-5 w-5" /></span>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold tracking-tight">Construtor de trilha</h1>
            <p className="truncate text-xs text-muted-foreground">{moduloNome} · trilha 100% personalizada</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => { setSimbolos(DEFAULT_TRILHA_SIMBOLOS); setLivre((l) => ({ nos: {}, curvas: {}, aspecto: l.aspecto, fundo: l.fundo })) }}
            className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground">
            <RotateCcw className="h-3.5 w-3.5" /> Restaurar padrão
          </button>
          <button type="button" onClick={salvar} disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-50">
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Salvar
          </button>
        </div>
      </header>

      {/* Corpo: painel de configurações + canvas */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Painel */}
        <aside className="min-h-0 shrink-0 space-y-5 overflow-y-auto border-b bg-card p-4 lg:w-80 lg:border-b-0 lg:border-r">
          <div className="space-y-2">
            <h2 className="text-sm font-semibold">Ferramentas</h2>
            <div className="grid grid-cols-1 gap-2">
              <button type="button" onClick={() => setLivre((l) => ({ ...l, nos: {}, curvas: {} }))}
                className="inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-xs font-medium shadow-sm transition-colors hover:bg-muted">
                <Wand2 className="h-4 w-4 text-primary" /> Organizar automaticamente (serpentina)
              </button>
              <button type="button" onClick={() => setLivre((l) => ({ ...l, curvas: {} }))}
                className="inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-xs font-medium shadow-sm transition-colors hover:bg-muted">
                <Spline className="h-4 w-4 text-primary" /> Zerar curvas (linhas retas)
              </button>
              <button type="button" onClick={inverterPosicoes}
                className="inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-xs font-medium shadow-sm transition-colors hover:bg-muted">
                <ArrowDownUp className="h-4 w-4 text-primary" /> Inverter posições (início embaixo)
              </button>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border bg-card px-3 py-2 text-xs font-medium shadow-sm transition-colors hover:bg-muted">
                <input type="checkbox" checked={mostrarFundo} onChange={(e) => setMostrarFundo(e.target.checked)} className="h-3.5 w-3.5 accent-[var(--primary)]" />
                <ImageIcon className="h-4 w-4 text-primary" /> Mostrar imagem de fundo
              </label>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Arraste cada <strong>aula</strong> para posicioná-la e arraste o <strong>ponto roxo</strong> de cada trecho para desenhar a curva. As posições são salvas em % — a trilha fica responsiva.
            </p>
          </div>

          <div className="flex items-start gap-2 rounded-xl border border-dashed bg-muted/20 p-3 text-[11px] leading-relaxed text-muted-foreground">
            <ImageIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>A <strong>imagem de fundo</strong>, o <strong>formato do canvas</strong>, desfoque, transparência e ajuste ficam na aba <strong>Configurações</strong> do módulo (abaixo do banner). Aqui você só posiciona as aulas.</span>
          </div>

          <div className="space-y-2">
            <h2 className="text-sm font-semibold">Tamanho dos símbolos e trilha</h2>
            <p className="text-[11px] text-muted-foreground">Os nós já ficam proporcionais à imagem. Aqui você aumenta ou diminui todos de uma vez.</p>
            <label className="block">
              <span className="mb-1 flex items-center justify-between text-[11px] font-medium text-muted-foreground"><span>Escala</span><span className="tabular-nums">{Math.round((livre.escala ?? 1) * 100)}%</span></span>
              <input type="range" min={ESCALA_MIN} max={ESCALA_MAX} step={0.05} value={livre.escala ?? 1}
                onChange={(e) => setLivre((l) => ({ ...l, escala: Number(e.target.value) }))} className="w-full accent-[var(--primary)]" />
            </label>
          </div>

          <div className="space-y-2">
            <h2 className="text-sm font-semibold">Símbolos dos nós</h2>
            <TrilhaSimbolosEditor value={simbolos} onChange={setSimbolos} stacked />
          </div>
        </aside>

        {/* Canvas — usa a proporção escolhida (WYSIWYG com o que o aluno vê) + zoom com rolagem. */}
        <div className="relative min-h-0 min-w-0 flex-1">
          {/* Barra de zoom */}
          {aulas.length > 0 && (
            <div className="absolute right-3 top-3 z-20 flex items-center gap-1 rounded-xl border bg-card/95 p-1 shadow-md backdrop-blur">
              <button type="button" onClick={() => setZoomClamp(zoom - 0.15)} title="Diminuir zoom" className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><ZoomOut className="h-4 w-4" /></button>
              <button type="button" onClick={() => setZoom(1)} title="Ajustar à tela" className="min-w-[3rem] rounded-lg px-2 py-1 text-xs font-semibold tabular-nums text-foreground transition-colors hover:bg-muted">{Math.round(zoom * 100)}%</button>
              <button type="button" onClick={() => setZoomClamp(zoom + 0.15)} title="Aumentar zoom" className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><ZoomIn className="h-4 w-4" /></button>
            </div>
          )}
          <div ref={areaRef} className="h-full overflow-auto p-6">
            {aulas.length > 0 ? (
              <div className="mx-auto" style={{ width: canvasW || undefined, height: canvasH || undefined, minHeight: 320 }}>
                <TrilhaLivre full editavel nodes={nos} livre={livre} onChange={setLivre} capa={capa ?? null} ocultarFundo={!mostrarFundo} simbolos={simbolos} />
              </div>
            ) : (
              <div className="flex h-full min-h-[420px] w-full items-center justify-center rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                Adicione aulas ao módulo (aba "Aulas") para posicioná-las na trilha.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
