'use client'
// 03b §2.2 — Visão geral. KPIs/funil/alerta de uso incomum NÃO têm pipeline → "em construção" honesto.
// Linha do tempo da publicação usa dados REAIS (versões + eventos de auditoria do conteúdo).

import { GitBranch, Clock } from 'lucide-react'
import type { GestaoBase, GestaoDados } from '@/app/admin/biblioteca/gestao-actions'
import type { GestaoTipo } from '@/lib/biblioteca/gestao-tipos'
import { EmConstrucao, KpiCard, Secao, Vazio, fmtData, fmtDataHora } from './ui'

export function AbaVisaoGeral({ base, dados, tipo }: { base: GestaoBase; dados: GestaoDados; tipo: GestaoTipo }) {
  if (!base.liberado) {
    return (
      <div className="rounded-2xl border border-dashed bg-muted/30 px-6 py-10 text-center">
        <div className="text-sm font-semibold text-foreground">Ainda não liberado para nenhum aluno</div>
        <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
          {base.liberadoDe ? `Liberação agendada para ${fmtData(base.liberadoDe)}.` : 'Defina uma entrega em “Quem tem acesso” ou agende a publicação em Configurações.'}
        </p>
      </div>
    )
  }

  const linha = [
    ...dados.historico!.versoes.map((v) => ({ tipo: 'versao', titulo: `Versão ${v.numero} publicada`, detalhe: v.origem, em: v.em })),
    ...dados.historico!.entregas.map((e) => ({ tipo: 'audit', titulo: e.titulo, detalhe: null as string | null, em: e.em })),
  ].sort((a, b) => String(b.em).localeCompare(String(a.em))).slice(0, 12)

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {tipo.kpis.map((k, i) => <KpiCard key={k} rotulo={k} hint={i === 0 ? 'liberados / alcance' : tipo.hints[i - 1]} />)}
      </div>
      <EmConstrucao>
        Os indicadores ({tipo.kpis.join(', ')}) e o <strong>{tipo.funilTitulo.toLowerCase()}</strong> dependem do pipeline de eventos de leitura/reprodução, ainda em construção. Nenhum número é estimado aqui.
      </EmConstrucao>

      <Secao titulo="Linha do tempo da publicação">
        {linha.length === 0 ? (
          <Vazio>Sem eventos registrados ainda.</Vazio>
        ) : (
          <ol className="relative space-y-4 border-l pl-4">
            {linha.map((e, i) => (
              <li key={i} className="relative">
                <span className={`absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full ring-2 ring-card ${e.tipo === 'versao' ? 'bg-primary' : 'bg-muted-foreground'}`} />
                <div className="flex items-center gap-1.5 text-sm font-medium leading-tight text-foreground">
                  {e.tipo === 'versao' ? <GitBranch className="h-3.5 w-3.5 text-primary" /> : <Clock className="h-3.5 w-3.5 text-muted-foreground" />}
                  {e.titulo}
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">{fmtDataHora(e.em)}{e.detalhe ? ` · ${e.detalhe}` : ''}</div>
              </li>
            ))}
          </ol>
        )}
      </Secao>
    </div>
  )
}
