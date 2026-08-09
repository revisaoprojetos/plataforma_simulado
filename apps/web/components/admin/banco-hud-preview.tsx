'use client'

import Link from 'next/link'
import { Pencil, Palette } from 'lucide-react'
import { type HudCores, type HudPorPagina, efetivarHud } from '@/lib/caderno-designer/types'
import { hudCssVars } from '@/lib/caderno-designer/hud'
import { ProvaHud } from '@/components/prova/prova-hud'
import { ProvaIntro, ProvaLoading, type EstiloProvaLoading } from '@/components/prova/prova-intro'
import { ProvaLoginPreview, ProvaEncerradaPreview } from '@/components/prova/prova-previews'
import { SCREENS, STATUS_POR_TAB, DEMO_Q, type ScreenKey } from '@/lib/hud/campos'

/** Aba "HUD do simulado": mostra a prévia de TODAS as telas (uma ao lado da outra) + botão que abre o editor. */
export function BancoHudPreview({ bancoId, titulo, base, porPagina }: {
  bancoId: string; titulo: string; base: Partial<HudCores>; porPagina: HudPorPagina
}) {
  const noop = () => {}

  const demoHud = (
    <ProvaHud compact titulo={titulo} tempoLabel="45:00" timerWarning={false} salvando={false}
      questaoIndex={1} totalQuestoes={5} totalRespondidas={1} progresso={20}
      questaoAtual={DEMO_Q} respostaId="b" eliminadas={['c']}
      respondidas={[true, false, false, false, false]} marcadas={[false, true, true, false, false]} marcadaAtual numMarcadas={2}
      mostrarTempo onResponder={noop} onPrev={noop} onNext={noop} onRevisar={noop} onGoto={noop} />
  )

  const conteudo = (tela: ScreenKey, c: HudCores) => {
    if (tela === 'loading') return <ProvaLoading compact loop mensagem="Carregando simulado..." tipo={c.loadingTipo as EstiloProvaLoading} />
    if (tela === 'login') return (
      <div className="relative h-full"><ProvaLoginPreview compact branding={null} titulo={titulo} status={STATUS_POR_TAB['form']} /></div>
    )
    if (tela === 'entrada') return (
      <div className="relative h-full overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0 select-none blur-[2px]" style={hudCssVars(efetivarHud(base, porPagina, 'prova')) as React.CSSProperties}>{demoHud}</div>
        <ProvaIntro compact overlay titulo={titulo} inicioLabel="00:00" tempoLabel="45:00" totalQuestoes={5} onIniciar={noop} />
      </div>
    )
    if (tela === 'encerrada') return <ProvaEncerradaPreview compact branding={null} titulo={titulo} liberado />
    return demoHud
  }

  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3" style={{ background: `linear-gradient(90deg, ${efetivarHud(base, porPagina, 'prova').primaria}1f, transparent 55%)` }}>
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white shadow-sm" style={{ background: efetivarHud(base, porPagina, 'prova').primaria }}><Palette className="h-5 w-5" /></span>
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
        <p className="mb-3 text-center text-xs text-muted-foreground">Prévia de todas as telas com o tema atual — clique em <span className="font-medium text-foreground">Editar HUD</span> para ajustar.</p>
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
    </div>
  )
}
