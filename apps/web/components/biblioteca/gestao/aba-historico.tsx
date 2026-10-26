'use client'
// 03b §2.8 — Histórico (3 subabas): Versões (REAIS, simulado_conteudo_versoes) · Acessos dos alunos
// (registro completo — em construção, depende da telemetria) · Entregas e permissões (auditoria REAL).

import { useState } from 'react'
import { toast } from 'sonner'
import { GitBranch, Eye, GitCompare, RotateCcw, CheckCircle2 } from 'lucide-react'
import type { GestaoBase, VersaoHistorico, EventoEntrega } from '@/app/admin/biblioteca/gestao-actions'
import type { GestaoTipo } from '@/lib/biblioteca/gestao-tipos'
import { EmConstrucao, Vazio, fmtDataHora } from './ui'

type Sub = 'versoes' | 'acessos' | 'entregas'

export function AbaHistorico({ base, versoes, entregas, tipo }: { base: GestaoBase; versoes: VersaoHistorico[]; entregas: EventoEntrega[]; tipo: GestaoTipo }) {
  const [sub, setSub] = useState<Sub>('versoes')
  const TABS: [Sub, string][] = [['versoes', `Versões do arquivo (${versoes.length})`], ['acessos', 'Acessos dos alunos'], ['entregas', `Entregas e permissões (${entregas.length})`]]

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 border-b">
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => setSub(k)} className={`border-b-2 px-3 py-2 text-xs font-semibold transition ${sub === k ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{l}</button>
        ))}
      </div>

      {sub === 'versoes' && (
        versoes.length === 0 ? <Vazio>Sem versões registradas.</Vazio> : (
          <div className="space-y-2.5">
            {versoes.map((v) => (
              <div key={v.id} className={`rounded-2xl border p-4 shadow-sm ${v.atual ? 'border-primary/40 bg-primary/5' : 'bg-card'}`}>
                <div className="flex items-start gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><GitBranch className="h-4 w-4" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2"><span className="text-sm font-semibold text-foreground">Versão {v.numero}</span>{v.atual && <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary"><CheckCircle2 className="h-3 w-3" />Atual</span>}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{v.origem} · {fmtDataHora(v.em)} · conversão: {v.status}</div>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <button onClick={() => toast.info('Visualizar versão — em construção.')} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold hover:bg-muted"><Eye className="h-3.5 w-3.5" />Visualizar</button>
                    {!v.atual && <button onClick={() => toast.info('Comparar (diff) — em construção.')} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold hover:bg-muted"><GitCompare className="h-3.5 w-3.5" />Comparar</button>}
                    {!v.atual && <button onClick={() => toast.info('Restaurar versão — em construção.')} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold hover:bg-muted"><RotateCcw className="h-3.5 w-3.5" />Restaurar</button>}
                  </div>
                </div>
              </div>
            ))}
            <p className="text-[11px] text-muted-foreground">{tipo.migracao}: as marcações do aluno migram para a versão nova. Comparar/Restaurar serão religados ao pipeline de versões.</p>
          </div>
        )
      )}

      {sub === 'acessos' && (
        <EmConstrucao titulo="Registro completo de acessos em construção">
          O registro consolidado de todos os alunos (primeiro acesso, aberturas, downloads, grifos, bloqueios) depende da telemetria de leitura/reprodução. O registro por aluno já está disponível na aba “Alunos” (expandir a linha).
        </EmConstrucao>
      )}

      {sub === 'entregas' && (
        entregas.length === 0 ? <Vazio>Sem eventos de entrega/permissão registrados.</Vazio> : (
          <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-2.5 font-semibold">Evento</th><th className="px-4 py-2.5 font-semibold">Operação</th><th className="px-4 py-2.5 font-semibold">Quando</th></tr></thead>
              <tbody>
                {entregas.map((e, i) => (
                  <tr key={i} className="border-b last:border-0"><td className="px-4 py-2.5 font-medium text-foreground">{e.titulo}</td><td className="px-4 py-2.5 text-xs text-muted-foreground">{e.operacao}</td><td className="px-4 py-2.5 text-xs text-muted-foreground">{fmtDataHora(e.em)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  )
}
