'use client'

import { useState } from 'react'
import { Trophy, Stamp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ModuloConquistasForm } from '@/components/admin/modulo-conquistas-form'
import { ModuloCarimbosForm, type CondicaoLabels, type AulasTextos, type MedalhaVariante } from '@/components/admin/modulo-carimbos-form'
import type { salvarConquistasModulo, salvarCarimbosModulo } from '@/app/admin/leitura/actions'
import type { ModuloConquistaDef, CarimboDef } from '@/lib/leitura/carimbos-tipos'

type Sub = 'conquistas' | 'carimbos'
export type AulaOpcao = { id: string; titulo: string }

/**
 * Aba "Medalhas" do módulo: agrupa as duas coleções — Conquistas (ícone + condição) e Carimbos
 * (imagem estampada na trilha). Sub-abas internas para gerenciar cada uma.
 * `salvarConquistas`/`salvarCarimbos` permitem reusar a aba em OUTROS desafios (ex.: Maratona de
 * Simulados) gravando nas actions daquele contexto; `rotuloAula` troca "dias" por "simulados" etc.
 */
export function ModuloMedalhasForm({ pastaId, conquistas, carimbos, aulas = [], salvarConquistas, salvarCarimbos, rotuloAula, condicaoLabels, aulasTextos, variante }: { pastaId: string; conquistas: ModuloConquistaDef[]; carimbos: CarimboDef[]; aulas?: AulaOpcao[]; salvarConquistas?: typeof salvarConquistasModulo; salvarCarimbos?: typeof salvarCarimbosModulo; rotuloAula?: { todas: string; especificas: string }; condicaoLabels?: CondicaoLabels; aulasTextos?: AulasTextos; variante?: MedalhaVariante }) {
  const [sub, setSub] = useState<Sub>('conquistas')
  const abas: { id: Sub; label: string; Icon: typeof Trophy; contagem: number }[] = [
    { id: 'conquistas', label: 'Conquistas', Icon: Trophy, contagem: conquistas.length },
    { id: 'carimbos', label: 'Carimbos', Icon: Stamp, contagem: carimbos.length },
  ]
  return (
    <div className="space-y-5">
      {/* Sub-abas (Conquistas | Carimbos) */}
      <div className="inline-flex rounded-xl border bg-muted/40 p-1">
        {abas.map(({ id, label, Icon, contagem }) => (
          <button key={id} type="button" onClick={() => setSub(id)}
            className={cn('inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              sub === id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
            <Icon className="h-4 w-4" /> {label}
            {contagem > 0 && <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">{contagem}</span>}
          </button>
        ))}
      </div>

      {sub === 'conquistas' && <ModuloConquistasForm pastaId={pastaId} inicial={conquistas} aulas={aulas} salvarAction={salvarConquistas} rotuloAula={rotuloAula} condicaoLabels={condicaoLabels} aulasTextos={aulasTextos} />}
      {sub === 'carimbos' && <ModuloCarimbosForm pastaId={pastaId} inicial={carimbos} aulas={aulas} salvarAction={salvarCarimbos} rotuloAula={rotuloAula} condicaoLabels={condicaoLabels} aulasTextos={aulasTextos} variante={variante} />}
    </div>
  )
}
