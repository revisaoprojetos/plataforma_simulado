'use client'

import { KeyRound } from 'lucide-react'
import { formatBrt } from '@/lib/brt'
import type { AcessoProdutoAluno, StatusAcesso, OrigemAcesso } from '@/lib/acesso/aluno-efetivo'

const STATUS: Record<StatusAcesso, { label: string; cls: string }> = {
  active: { label: 'Ativo', cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  scheduled: { label: 'Agendado', cls: 'bg-sky-500/10 text-sky-600 dark:text-sky-400' },
  expired: { label: 'Expirado', cls: 'bg-muted text-muted-foreground' },
  revoked: { label: 'Revogado', cls: 'bg-rose-500/10 text-rose-600 dark:text-rose-400' },
}
const ORIGEM: Record<OrigemAcesso, string> = { regra: 'Regra de venda', integracao: 'Integração', manual: 'Manual' }
const fmt = (d: string | null) => (d ? formatBrt(d) : null)

function validade(it: AcessoProdutoAluno): string {
  if (it.status === 'active') return it.fimEm ? `até ${fmt(it.fimEm)}` : 'Vitalício'
  if (it.status === 'scheduled') return it.inicioEm ? `a partir de ${fmt(it.inicioEm)}` : 'Agendado'
  return it.fimEm ? `encerrou em ${fmt(it.fimEm)}` : '—'
}

export function EstudanteAcesso({ itens }: { itens: AcessoProdutoAluno[] }) {
  if (!itens.length) {
    return (
      <div className="rounded-2xl border bg-card p-10 text-center">
        <KeyRound className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Este aluno não tem produtos liberados (por regra de venda nem por integração/manual).</p>
      </div>
    )
  }
  const ativos = itens.filter((i) => i.temAcesso).length
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{ativos} produto(s) com acesso ativo · {itens.length} no total (une regras de venda e catálogo).</p>
      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Produto</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Validade</th>
                <th className="px-4 py-2.5 font-medium">Origem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {itens.map((it) => (
                <tr key={it.produtoId} className="hover:bg-muted/30">
                  <td className="px-4 py-2.5">
                    <span className="font-medium">{it.nome}</span>
                    {it.tier && it.tier !== 'normal' && <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{it.tier}</span>}
                  </td>
                  <td className="px-4 py-2.5"><span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS[it.status].cls}`}>{STATUS[it.status].label}</span></td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">{validade(it)}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {it.origens.map((o) => <span key={o} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{ORIGEM[o]}</span>)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
