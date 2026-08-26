'use client'

import Link from 'next/link'
import { HardDrive, ExternalLink } from 'lucide-react'
import { UsoArmazenamentoBar } from '@/components/super/uso-armazenamento-bar'
import { formatarBytes } from '@/lib/storage/formato'
import type { UsoSnapshot } from '@/lib/storage/uso'

// Uso de storage DESTA plataforma (derivado do catálogo por tenant_id). Sem limite por
// tenant — os buckets são compartilhados; o teto é global (Console → Armazenamento).
export function PlataformaArmazenamento({ uso }: { uso: UsoSnapshot }) {
  const buckets = uso.buckets.filter((b) => b.arquivos > 0)
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><HardDrive className="h-5 w-5" /></span>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Uso desta plataforma</p>
            <p className="text-2xl font-bold tracking-tight">{formatarBytes(uso.totalBytes)}</p>
            <p className="text-xs text-muted-foreground">{uso.totalArquivos.toLocaleString('pt-BR')} arquivo(s) · baseado no último cálculo global</p>
          </div>
        </div>
        <Link href="/super/armazenamento" className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted">
          <ExternalLink className="h-4 w-4" /> Visão global
        </Link>
      </div>

      {buckets.length === 0 ? (
        <div className="rounded-2xl border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
          Nenhum arquivo atribuído a esta plataforma. Se acabou de subir conteúdo, recalcule em <strong>Console → Armazenamento</strong>.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {buckets.map((b) => (
            <UsoArmazenamentoBar key={b.bucket} b={b} />
          ))}
        </div>
      )}
    </div>
  )
}
