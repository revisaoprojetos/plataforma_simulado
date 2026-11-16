'use client'

import * as React from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { DataTable } from '@/components/admin/data-table'
import { Badge } from '@/components/ui/badge'
import type { UsoLinha } from '@/lib/api-v1/uso-consulta'

// Linhas JÁ formatadas pelo servidor; o cliente só exibe e muda searchParams (filtro).
function StatusBadge({ r }: { r: UsoLinha }) {
  if (r.barrado) return <Badge variant="outline" className="border-amber-500/50 text-amber-700 dark:text-amber-300">429 limite</Badge>
  if (r.status >= 500) return <Badge variant="destructive">{r.status}</Badge>
  if (r.status >= 400) return <Badge variant="secondary" className="text-destructive">{r.status}</Badge>
  return <Badge variant="secondary">{r.status}</Badge>
}

export function UsoUltimas({ rows, total, chaves }: { rows: UsoLinha[]; total: number; chaves: { id: string; nome: string }[] }) {
  const router = useRouter(); const pathname = usePathname(); const sp = useSearchParams()
  function set(k: string, v: string) {
    const p = new URLSearchParams(sp.toString())
    if (v) p.set(k, v); else p.delete(k)
    p.delete('page')
    router.push(`${pathname}?${p.toString()}`)
  }
  const sel = 'h-9 rounded-md border bg-background px-2 text-sm'
  return (
    <DataTable<UsoLinha>
      rows={rows} total={total} getRowId={(r) => r.id}
      defaultSort={{ key: 'criado_em', dir: 'desc' }} defaultPerPage={25} perPageOptions={[10, 25, 50]}
      searchable searchPlaceholder="Buscar recurso, IP ou request-id…"
      nomeSingular="chamada" nomePlural="chamadas"
      filters={(
        <div className="flex flex-wrap items-center gap-2">
          <select className={sel} value={sp.get('st') ?? ''} onChange={(e) => set('st', e.target.value)} aria-label="Status">
            <option value="">Todos os status</option><option value="ok">Sucesso</option><option value="erro">Erros</option><option value="barrado">Barradas (limite)</option>
          </select>
          <select className={sel} value={sp.get('ck') ?? ''} onChange={(e) => set('ck', e.target.value)} aria-label="Chave">
            <option value="">Todas as chaves</option>
            {chaves.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </div>
      )}
      columns={[
        { key: 'criado_em', header: 'Quando', sortable: true, width: '10rem', render: (r) => r.quando },
        { key: 'chave', header: 'Chave', width: '14rem', render: (r) => <span className={r.chaveRevogada ? 'text-muted-foreground' : ''}>{r.chave}{r.chaveRevogada ? ' (revogada)' : ''}</span>, title: (r) => r.chave },
        { key: 'recurso', header: 'Recurso', sortable: true, render: (r) => <span className="font-mono text-xs">{r.recurso}</span>, title: (r) => r.metodoRota },
        { key: 'metodo', header: 'Método', width: '5rem', render: (r) => r.metodoRota.split(' ')[0] },
        { key: 'status', header: 'Status', sortable: true, width: '7rem', render: (r) => <StatusBadge r={r} />, title: (r) => r.erro ?? '' },
        { key: 'duracao_ms', header: 'ms', sortable: true, width: '5rem', align: 'right', render: (r) => <span className="tabular-nums">{r.ms}</span> },
        { key: 'ip', header: 'IP', width: '9rem', render: (r) => <span className="tabular-nums">{r.ip ?? '—'}</span> },
        { key: 'navegador', header: 'Navegador', width: '9rem', render: (r) => r.navegador },
      ]}
    />
  )
}
