'use client'

// Aba "Lista": DataTable canônico do admin (server-driven: busca/filtros/ordenação/paginação vêm da URL).
import { useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Download, FileSpreadsheet, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { DataTable, type DataTableColumn } from '@/components/admin/data-table'
import { Button } from '@/components/ui/button'
import { confirmar } from '@/components/ui/confirm-dialog'
import { navProgressStart } from '@/lib/nav-progress'
import { cn } from '@/lib/utils'
import {
  AREAS, STATUS, PRIORIDADES, ROTULO_AREA, ROTULO_STATUS, ROTULO_PRIORIDADE, COR_STATUS,
  type Problema, type StatusProblema,
} from '@/lib/auditoria-problemas/tipos'
import { PrioridadeChip, dataBr } from './comuns'
import { ProblemaPainel, type PermsProblemas } from './painel'

const SELECT = 'h-11 rounded-xl border bg-card px-3 text-[13.5px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring'
const PRAZOS = [{ v: 'atrasado', l: 'Atrasados' }, { v: '7d', l: 'Próximos 7 dias' }, { v: '30d', l: 'Próximos 30 dias' }, { v: 'sem', l: 'Sem prazo' }]

export function ProblemasLista({ rows, total, perms, podeExportar }: { rows: Problema[]; total: number; perms: PermsProblemas; podeExportar: boolean }) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const [aberto, setAberto] = useState<{ problema: Problema | null; novo: boolean } | null>(null)

  function setParam(k: string, v: string) {
    const p = new URLSearchParams(sp.toString())
    v ? p.set(k, v) : p.delete(k)
    p.delete('page')
    navProgressStart()
    router.push(`${pathname}?${p}`)
  }

  async function mudarStatus(p: Problema, status: StatusProblema) {
    if (status === p.status) return
    const r = await fetch(`/api/admin/auditoria-problemas/${p.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { toast.error(j.message ?? 'Não foi possível alterar o status.'); return }
    toast.success(`Status: ${ROTULO_STATUS[status]}`)
    router.refresh()
  }

  async function excluir(p: Problema) {
    if (!(await confirmar({ titulo: 'Excluir problema', mensagem: `Excluir "${p.assunto}"? O histórico fica guardado.`, confirmar: 'Excluir', destrutivo: true }))) return
    const r = await fetch(`/api/admin/auditoria-problemas/${p.id}`, { method: 'DELETE' })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { toast.error(j.message ?? 'Não foi possível excluir.'); return }
    toast.success('Problema excluído.')
    router.refresh()
  }

  // Exportação respeita os filtros atuais (sem page/pp/sort).
  const qsExport = (formato: string) => {
    const p = new URLSearchParams()
    for (const k of ['q', 'area', 'status', 'prioridade', 'prazo', 'responsavel']) { const v = sp.get(k); if (v) p.set(k, v) }
    p.set('formato', formato)
    return `/api/admin/auditoria-problemas/exportar?${p}`
  }

  const colunas: DataTableColumn<Problema>[] = [
    {
      key: 'status', header: 'Status', sortable: true, width: '9.5rem', truncate: false,
      render: (r) => perms.editar ? (
        <select
          aria-label="Alterar status" value={r.status} onChange={(e) => mudarStatus(r, e.target.value as StatusProblema)}
          className={cn('h-7 cursor-pointer rounded-full border px-2 text-[11px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring', COR_STATUS[r.status])}
        >
          {STATUS.map((s) => <option key={s} value={s} className="bg-card text-foreground">{ROTULO_STATUS[s]}</option>)}
        </select>
      ) : <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium', COR_STATUS[r.status])}>{ROTULO_STATUS[r.status]}</span>,
    },
    { key: 'assunto', header: 'Assunto', sortable: true, width: '22rem', title: (r) => r.assunto, render: (r) => <button type="button" className="text-left font-medium hover:underline" onClick={() => setAberto({ problema: r, novo: false })}>{r.assunto}</button> },
    { key: 'area', header: 'Área', sortable: true, width: '14rem', render: (r) => ROTULO_AREA[r.area] },
    { key: 'prioridade', header: 'Prioridade', sortable: true, width: '7.5rem', truncate: false, render: (r) => <PrioridadeChip prioridade={r.prioridade} /> },
    {
      key: 'prazo', header: 'Prazo', sortable: true, width: '9rem', title: (r) => r.prazo_texto ?? undefined,
      render: (r) => r.prazo ? <span className={cn('tabular-nums', r.atrasado && 'font-semibold text-rose-600 dark:text-rose-400')}>{dataBr(r.prazo)}{r.atrasado ? ' · atrasado' : ''}</span> : <span className="text-muted-foreground">{r.prazo_texto ?? '—'}</span>,
    },
    { key: 'responsavel', header: 'Responsável', sortable: true, width: '10rem', render: (r) => r.responsavel ?? '—' },
    { key: 'versao', header: 'Versão', width: '7rem', render: (r) => r.versao ?? '—' },
    { key: 'data_registro', header: 'Data', sortable: true, width: '7rem', render: (r) => <span className="tabular-nums">{dataBr(r.data_registro)}</span> },
  ]

  return (
    <>
      <DataTable
        rows={rows} total={total} getRowId={(r) => r.id} columns={colunas} selectable={false} searchable
        searchPlaceholder="Buscar por assunto, razão, ação, responsável…" defaultSort={{ key: 'atualizado_em', dir: 'desc' }}
        nomeSingular="problema" redimensionavel
        onRowClick={(r) => setAberto({ problema: r, novo: false })} activeRowId={aberto?.problema?.id ?? null}
        rowActions={(r) => [
          { label: perms.editar ? 'Ver / editar' : 'Ver', icon: <Pencil className="h-4 w-4" />, onClick: () => setAberto({ problema: r, novo: false }) },
          ...(perms.excluir ? [{ label: 'Excluir', icon: <Trash2 className="h-4 w-4" />, destructive: true, separatorBefore: true, onClick: () => excluir(r) }] : []),
        ]}
        filters={
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label="Área" className={SELECT} value={sp.get('area') ?? ''} onChange={(e) => setParam('area', e.target.value)}>
              <option value="">Todas as áreas</option>{AREAS.map((a) => <option key={a} value={a}>{ROTULO_AREA[a]}</option>)}
            </select>
            <select aria-label="Status" className={SELECT} value={sp.get('status') ?? ''} onChange={(e) => setParam('status', e.target.value)}>
              <option value="">Todos os status</option>{STATUS.map((a) => <option key={a} value={a}>{ROTULO_STATUS[a]}</option>)}
            </select>
            <select aria-label="Prioridade" className={SELECT} value={sp.get('prioridade') ?? ''} onChange={(e) => setParam('prioridade', e.target.value)}>
              <option value="">Toda prioridade</option>{PRIORIDADES.map((a) => <option key={a} value={a}>{ROTULO_PRIORIDADE[a]}</option>)}
            </select>
            <select aria-label="Prazo" className={SELECT} value={sp.get('prazo') ?? ''} onChange={(e) => setParam('prazo', e.target.value)}>
              <option value="">Qualquer prazo</option>{PRAZOS.map((a) => <option key={a.v} value={a.v}>{a.l}</option>)}
            </select>
            <input
              key={sp.get('responsavel') ?? ''} type="search" aria-label="Responsável" placeholder="Responsável…" defaultValue={sp.get('responsavel') ?? ''}
              className={cn(SELECT, 'w-40 placeholder:text-muted-foreground')}
              onKeyDown={(e) => { if (e.key === 'Enter') setParam('responsavel', (e.target as HTMLInputElement).value.trim()) }}
              onBlur={(e) => { if (e.target.value.trim() !== (sp.get('responsavel') ?? '')) setParam('responsavel', e.target.value.trim()) }}
            />
            {perms.criar && <Button className="h-11 rounded-xl" onClick={() => setAberto({ problema: null, novo: true })}><Plus className="h-4 w-4" /> Novo problema</Button>}
            {podeExportar && (
              <>
                <a href={qsExport('csv')} className="inline-flex h-11 items-center gap-1.5 rounded-xl border bg-card px-3 text-[13.5px] font-medium hover:bg-muted"><Download className="h-4 w-4" /> CSV</a>
                <a href={qsExport('xlsx')} className="inline-flex h-11 items-center gap-1.5 rounded-xl border bg-card px-3 text-[13.5px] font-medium hover:bg-muted"><FileSpreadsheet className="h-4 w-4" /> XLSX</a>
              </>
            )}
          </div>
        }
      />
      <ProblemaPainel aberto={!!aberto} problema={aberto?.problema ?? null} novo={aberto?.novo} perms={perms} onFechar={() => setAberto(null)} />
    </>
  )
}
