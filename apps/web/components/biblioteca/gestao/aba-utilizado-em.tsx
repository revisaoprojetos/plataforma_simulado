'use client'
// 03b §2.5 — Utilizado em (vínculos do conteúdo, REAIS: lib/conteudo/vinculos + vínculos de leitor).

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ExternalLink, Unlink, Plus } from 'lucide-react'
import type { VinculoConteudo } from '@/app/admin/biblioteca/gestao-actions'
import { Chip } from '@/components/biblioteca/pilulas'
import { Vazio } from './ui'

const FILTROS: [string, string][] = [['todos', 'Todos'], ['Simulado', 'Simulados'], ['Cronograma', 'Cronogramas'], ['Desafio', 'Desafios'], ['Questão', 'Questões'], ['outros', 'Outros conteúdos']]

export function AbaUtilizadoEm({ vinculos }: { vinculos: VinculoConteudo[] }) {
  const [f, setF] = useState('todos')
  const filtrados = useMemo(() => vinculos.filter((v) => {
    if (f === 'todos') return true
    if (f === 'outros') return !['Simulado', 'Cronograma', 'Desafio', 'Questão'].includes(v.categoria)
    return v.categoria.startsWith(f)
  }), [vinculos, f])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">{FILTROS.map(([k, l]) => <Chip key={k} ativo={f === k} onClick={() => setF(k)}>{l}</Chip>)}</div>
        <button onClick={() => toast.info('Vincular a… — em construção (seletor de módulo/item).')} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold hover:bg-muted"><Plus className="h-3.5 w-3.5" />Vincular a…</button>
      </div>

      {vinculos.length === 0 ? (
        <Vazio>Este conteúdo ainda não está vinculado a nenhum simulado, cronograma, desafio ou questão.</Vazio>
      ) : filtrados.length === 0 ? (
        <Vazio>Nenhum vínculo deste tipo.</Vazio>
      ) : (
        <div className="space-y-3">
          {filtrados.map((v) => (
            <div key={v.id} className="flex items-start gap-3 rounded-2xl border bg-card p-4 shadow-sm">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-xs font-bold text-primary">{v.selo}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2"><span className="truncate text-sm font-semibold text-foreground" title={v.nome}>{v.nome}</span><span className="rounded-full border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{v.status}</span></div>
                <div className="mt-0.5 text-xs text-muted-foreground">{v.categoria}</div>
                <div className="mt-1 text-[11px] text-muted-foreground">{v.comoLigado}</div>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <button onClick={() => toast.info('Abrir — em construção.')} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold hover:bg-muted"><ExternalLink className="h-3.5 w-3.5" />Abrir</button>
                <button onClick={() => toast.info('Desvincular — em construção.')} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold text-destructive hover:bg-destructive/10"><Unlink className="h-3.5 w-3.5" />Desvincular</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">Quando você publica uma nova versão, todos os vínculos passam a usar a versão nova. Desvincular não remove o acesso de quem já recebeu.</p>
    </div>
  )
}
