'use client'
// 03b §2.7 — Aba de análise por unidade (Páginas/Slides/Abas/Retenção). O gráfico por unidade e os
// "pontos de atenção" dependem de telemetria por página/slide/trecho, ainda sem pipeline → em construção.

import type { GestaoTipo } from '@/lib/biblioteca/gestao-tipos'
import { EmConstrucao, Secao } from './ui'

export function AbaTipo({ tipo }: { tipo: GestaoTipo }) {
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
      <Secao titulo={tipo.abaTipo.titulo}>
        <p className="mb-3 text-xs text-muted-foreground">{tipo.abaTipo.sub}</p>
        <EmConstrucao titulo={`Análise por ${tipo.abaTipo.tab.toLowerCase()} em construção`}>
          Este gráfico mede o avanço dos alunos por unidade do conteúdo. Depende da telemetria de leitura/reprodução por {tipo.abaTipo.tab.toLowerCase()}, ainda não coletada.
        </EmConstrucao>
      </Secao>
      <Secao titulo="Pontos de atenção">
        <EmConstrucao titulo="Sem dados ainda">
          Os achados são gerados automaticamente a partir das métricas por unidade quando houver volume suficiente.
        </EmConstrucao>
      </Secao>
    </div>
  )
}
