'use client'

import { AbasLinhaControlada } from '@/components/ui/abas-linha'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { Anomalia, TipoAnomalia } from '@/lib/cronograma/adaptativo/auditar-plano'

// Detalhe (somente leitura) das anomalias de UM plano: filtro por tipo no cliente sobre a lista JÁ calculada no servidor. Nenhuma ação de correção.
export interface DetalhePlano {
  planoId: string; estudanteId: string; nome: string; email: string; titulo: string | null; total: number
  anomalias: Anomalia[]
  rotulos: Record<TipoAnomalia, string>
}

export function DetalheIntegridade({ d }: { d: DetalhePlano }) {
  const [tipo, setTipo] = useState<string>('')
  const tipos = useMemo(() => [...new Set(d.anomalias.map((a) => a.tipo))], [d.anomalias])
  const lista = tipo ? d.anomalias.filter((a) => a.tipo === tipo) : d.anomalias
  return (
    <section className="w-full rounded-2xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{d.nome || 'Aluno'} <span className="text-sm font-normal text-muted-foreground">{d.email}</span></h2>
          <p className="text-sm text-muted-foreground">Plano {d.titulo ? `“${d.titulo}” ` : ''}· {d.total} anomalia(s){d.total > d.anomalias.length ? ` (mostrando as ${d.anomalias.length} primeiras)` : ''}</p>
        </div>
        <Link href={`/admin/estudantes/${d.estudanteId}`} className="inline-flex h-8 items-center rounded-[10px] border bg-background px-3 text-[13px] font-medium transition hover:bg-muted">Abrir aluno</Link>
      </div>
      <AbasLinhaControlada className="mb-3" valor={tipo} onChange={setTipo}
        itens={[{ valor: '', label: 'Todas' }, ...tipos.map((t) => ({ valor: t as string, label: d.rotulos[t] }))]} />
      <div className="w-full overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr><th className="px-3 py-2 text-left font-medium">Anomalia</th><th className="px-3 py-2 text-left font-medium">Meta</th><th className="px-3 py-2 text-left font-medium">Aula gravada</th><th className="px-3 py-2 text-left font-medium">Aula atual no catálogo</th><th className="px-3 py-2 text-left font-medium">Data</th><th className="px-3 py-2 text-left font-medium">Detalhe</th></tr>
          </thead>
          <tbody>
            {lista.map((a, i) => (
              <tr key={`${a.tipo}-${a.metaId ?? i}-${i}`} className="border-t align-top">
                <td className="whitespace-nowrap px-3 py-2 font-medium">{d.rotulos[a.tipo]}</td>
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{a.metaId ?? '—'}</td>
                <td className="px-3 py-2 font-mono text-xs break-all">{a.aulaGravada ?? '—'}</td>
                <td className="px-3 py-2 font-mono text-xs break-all">{a.aulaAtual ?? '—'}</td>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums">{a.data ?? '—'}</td>
                <td className="px-3 py-2 text-muted-foreground">{a.detalhe}</td>
              </tr>
            ))}
            {!lista.length && <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">Nenhuma anomalia deste tipo.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  )
}
