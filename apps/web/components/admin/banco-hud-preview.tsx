'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { Pencil, Palette, Maximize2, X } from 'lucide-react'
import { type HudCores, type HudPorPagina, efetivarHud } from '@/lib/caderno-designer/types'
import { hudCssVars } from '@/lib/caderno-designer/hud'
import { ProvaHud } from '@/components/prova/prova-hud'
import { ProvaIntro, ProvaLoading, type EstiloProvaLoading } from '@/components/prova/prova-intro'
import { ProvaLoginPreview, ProvaEncerradaPreview } from '@/components/prova/prova-previews'
import { SCREENS, STATUS_POR_TAB, DEMO_Q, type ScreenKey } from '@/lib/hud/campos'

type QPrev = { id: string; enunciado: string; disciplina?: string | null; imagem_url?: string | null; alternativas: { id: string; texto: string }[] }

/** Aba "HUD do simulado": prévia de TODAS as telas (lado a lado, expansíveis) + botão que abre o editor. */
export function BancoHudPreview({ bancoId, titulo, base, porPagina, questoesIniciais }: {
  bancoId: string; titulo: string; base: Partial<HudCores>; porPagina: HudPorPagina
  questoesIniciais?: QPrev[] | null
}) {
  const noop = () => {}
  const questoes: QPrev[] = questoesIniciais && questoesIniciais.length ? questoesIniciais : [DEMO_Q as QPrev]

  // Estado interativo da prévia da prova.
  const [qi, setQi] = useState(0)
  const [respostas, setRespostas] = useState<Record<string, string>>(() => {
    const a = questoes[0]?.alternativas[1]?.id
    return a ? { [questoes[0].id]: a } : {}
  })
  const [marcadas, setMarcadas] = useState<Set<number>>(() => new Set([1, 2].filter((i) => i < questoes.length)))
  const [elimMap, setElimMap] = useState<Record<string, string[]>>(() => {
    const c = questoes[0]?.alternativas[2]?.id
    return c ? { [questoes[0].id]: [c] } : {}
  })
  const [expandida, setExpandida] = useState<ScreenKey | null>(null)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  useEffect(() => {
    if (!expandida) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpandida(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expandida])

  const qAtual = questoes[Math.min(qi, questoes.length - 1)]
  const toggleMarcar = () => setMarcadas((s) => { const n = new Set(s); n.has(qi) ? n.delete(qi) : n.add(qi); return n })
  const toggleEliminar = (altId: string) => setElimMap((m) => {
    const cur = m[qAtual.id] ?? []
    return { ...m, [qAtual.id]: cur.includes(altId) ? cur.filter((x) => x !== altId) : [...cur, altId] }
  })
  const respondidas = questoes.map((q) => !!respostas[q.id])
  const progresso = Math.round((respondidas.filter(Boolean).length / questoes.length) * 100)

  const demoHud = (
    <ProvaHud compact titulo={titulo} tempoLabel="45:00" timerWarning={false} salvando={false}
      questaoIndex={qi} totalQuestoes={questoes.length} totalRespondidas={respondidas.filter(Boolean).length} progresso={progresso}
      questaoAtual={qAtual} respostaId={respostas[qAtual.id]} eliminadas={elimMap[qAtual.id] ?? []} onToggleEliminar={toggleEliminar}
      respondidas={respondidas} marcadas={questoes.map((_, i) => marcadas.has(i))} marcadaAtual={marcadas.has(qi)} numMarcadas={marcadas.size}
      mostrarTempo onToggleMarcar={toggleMarcar}
      onResponder={(id) => setRespostas((r) => ({ ...r, [qAtual.id]: id }))}
      onPrev={() => setQi((i) => Math.max(0, i - 1))} onNext={() => setQi((i) => Math.min(questoes.length - 1, i + 1))}
      onRevisar={noop} onGoto={(i) => setQi(i)} />
  )

  const conteudo = (tela: ScreenKey, c: HudCores) => {
    if (tela === 'loading') return <ProvaLoading compact loop mensagem="Carregando simulado..." tipo={c.loadingTipo as EstiloProvaLoading} logoUrl={c.loadingLogoUrl || undefined} logoBg={c.loadingLogoBg} logoEstilo={c.loadingLogoEstilo} logoFiltro={c.loadingLogoFiltro} />
    if (tela === 'login') return (
      <div className="relative h-full"><ProvaLoginPreview compact branding={null} titulo={titulo} status={STATUS_POR_TAB['form']} /></div>
    )
    if (tela === 'entrada') return (
      <div className="relative h-full overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0 select-none blur-[2px]" style={hudCssVars(efetivarHud(base, porPagina, 'prova')) as React.CSSProperties}>{demoHud}</div>
        <ProvaIntro compact overlay titulo={titulo} inicioLabel="00:00" tempoLabel="45:00" totalQuestoes={questoes.length} onIniciar={noop} />
      </div>
    )
    if (tela === 'encerrada') return <ProvaEncerradaPreview compact branding={null} titulo={titulo} liberado />
    return demoHud
  }

  const corTopo = efetivarHud(base, porPagina, 'prova').primaria

  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3" style={{ background: `linear-gradient(90deg, ${corTopo}1f, transparent 55%)` }}>
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white shadow-sm" style={{ background: corTopo }}><Palette className="h-5 w-5" /></span>
          <div>
            <h3 className="text-sm font-semibold leading-tight">HUD do simulado</h3>
            <p className="text-xs text-muted-foreground">Tema de cores da prova do aluno — vale p/ os simulados deste banco</p>
          </div>
        </div>
        <Link href={`/admin/banco-questoes/${bancoId}/hud`} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90">
          <Pencil className="h-4 w-4" /> Editar HUD
        </Link>
      </div>

      <div className="bg-muted/30 p-4">
        <p className="mb-3 text-center text-xs text-muted-foreground">Prévia de todas as telas com o tema atual — a tela de prova é navegável; use <Maximize2 className="inline h-3.5 w-3.5" /> para expandir.</p>
        <div className="flex gap-4 overflow-x-auto pb-2">
          {SCREENS.map((s) => {
            const c = efetivarHud(base, porPagina, s.key)
            return (
              <div key={s.key} className="shrink-0">
                <p className="mb-2 flex items-center justify-center gap-1.5 text-center text-xs font-medium text-muted-foreground"><s.icon className="h-3.5 w-3.5" />{s.label}</p>
                <div className="w-[650px] overflow-hidden rounded-xl border bg-card shadow-sm">
                  {/* barra de janela (formato de tela) */}
                  <div className="flex items-center gap-1.5 border-b bg-muted/50 px-3 py-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-rose-400/70" />
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
                    <button onClick={() => setExpandida(s.key)} title="Expandir" className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-background hover:text-foreground">
                      <Maximize2 className="h-3.5 w-3.5" /> Expandir
                    </button>
                  </div>
                  <div className="h-[406px] w-full overflow-hidden">
                    <div className="h-[812px] w-[1300px] origin-top-left scale-[0.5] overflow-hidden" style={hudCssVars(c) as React.CSSProperties}>
                      {conteudo(s.key, c)}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Modal de tela expandida */}
      {mounted && expandida && createPortal(
        (() => {
          const s = SCREENS.find((x) => x.key === expandida)!
          const c = efetivarHud(base, porPagina, expandida)
          return (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={() => setExpandida(null)}>
              <div className="flex max-h-[92vh] max-w-[96vw] flex-col overflow-hidden rounded-2xl border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between gap-3 border-b px-4 py-2.5">
                  <p className="flex items-center gap-1.5 text-sm font-semibold"><s.icon className="h-4 w-4" />{s.label}</p>
                  <button onClick={() => setExpandida(null)} aria-label="Fechar" className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
                </div>
                <div className="max-h-[84vh] max-w-[94vw] overflow-auto">
                  <div className="h-[812px] w-[1300px]" style={hudCssVars(c) as React.CSSProperties}>
                    {conteudo(expandida, c)}
                  </div>
                </div>
              </div>
            </div>
          )
        })(),
        document.body,
      )}
    </div>
  )
}
