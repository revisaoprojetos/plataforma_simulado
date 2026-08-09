'use client'

import Link from 'next/link'
import { Pencil, Palette } from 'lucide-react'
import { type HudCores, type HudPorPagina, efetivarHud } from '@/lib/caderno-designer/types'
import { hudCssVars } from '@/lib/caderno-designer/hud'
import { ProvaHud } from '@/components/prova/prova-hud'
import { DEMO_Q } from '@/lib/hud/campos'

/** Aba "HUD do simulado": mostra só a prévia do tema atual + botão que abre o editor dedicado. */
export function BancoHudPreview({ bancoId, titulo, base, porPagina }: {
  bancoId: string; titulo: string; base: Partial<HudCores>; porPagina: HudPorPagina
}) {
  const c = efetivarHud(base, porPagina, 'prova')
  const noop = () => {}
  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3" style={{ background: `linear-gradient(90deg, ${c.primaria}1f, transparent 55%)` }}>
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white shadow-sm" style={{ background: c.primaria }}><Palette className="h-5 w-5" /></span>
          <div>
            <h3 className="text-sm font-semibold leading-tight">HUD do simulado</h3>
            <p className="text-xs text-muted-foreground">Tema de cores da prova do aluno — vale p/ os simulados deste banco</p>
          </div>
        </div>
        <Link href={`/admin/banco-questoes/${bancoId}/hud`} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90">
          <Pencil className="h-4 w-4" /> Editar HUD
        </Link>
      </div>

      <div className="bg-muted/30 p-4 sm:p-6">
        <p className="mb-3 text-center text-xs text-muted-foreground">Prévia da tela de prova com o tema atual — clique em <span className="font-medium text-foreground">Editar HUD</span> para ajustar.</p>
        <div className="mx-auto max-w-3xl overflow-hidden rounded-xl border shadow-sm" style={hudCssVars(c) as React.CSSProperties}>
          <ProvaHud compact titulo={titulo} tempoLabel="45:00" timerWarning={false} salvando={false}
            questaoIndex={1} totalQuestoes={5} totalRespondidas={1} progresso={20}
            questaoAtual={DEMO_Q} respostaId="b" eliminadas={['c']}
            respondidas={[true, false, false, false, false]} marcadas={[false, true, true, false, false]} marcadaAtual numMarcadas={2}
            mostrarTempo onResponder={noop} onPrev={noop} onNext={noop} onRevisar={noop} onGoto={noop} />
        </div>
      </div>
    </div>
  )
}
