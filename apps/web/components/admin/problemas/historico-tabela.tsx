'use client'

// Aba "Histórico": quem mudou o quê (todas as alterações do tenant), paginado no servidor.
import { DataTable, type DataTableColumn } from '@/components/admin/data-table'
import type { HistoricoItem } from '@/lib/auditoria-problemas/tipos'

const ROTULO: Record<string, string> = { criado: 'Criado', editado: 'Editado', status: 'Status alterado', excluido: 'Excluído', restaurado: 'Restaurado', importado: 'Importado' }
const v = (x: unknown) => (x == null || x === '' ? '—' : String(x))

function resumo(h: HistoricoItem): string {
  const chaves = [...new Set([...Object.keys(h.antes ?? {}), ...Object.keys(h.depois ?? {})])]
  if (h.acao === 'excluido') return 'Registro excluído'
  return chaves.slice(0, 6).map((k) => (h.antes ? `${k}: ${v(h.antes[k]).slice(0, 40)} → ${v(h.depois?.[k]).slice(0, 40)}` : `${k}: ${v(h.depois?.[k]).slice(0, 40)}`)).join(' · ')
}

export function HistoricoTabela({ rows, total }: { rows: HistoricoItem[]; total: number }) {
  const colunas: DataTableColumn<HistoricoItem>[] = [
    { key: 'criado_em', header: 'Quando', width: '11rem', render: (r) => <span className="tabular-nums">{new Date(r.criado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</span> },
    { key: 'ator', header: 'Quem', width: '11rem', render: (r) => r.ator ?? 'Sistema' },
    { key: 'acao', header: 'Ação', width: '9rem', render: (r) => ROTULO[r.acao] ?? r.acao },
    { key: 'assunto', header: 'Problema', width: '22rem', title: (r) => r.assunto ?? undefined, render: (r) => r.assunto ?? <span className="text-muted-foreground">(excluído)</span> },
    { key: 'mudancas', header: 'Mudanças (antes → depois)', title: (r) => resumo(r), render: (r) => <span className="text-muted-foreground">{resumo(r)}</span> },
  ]
  return <DataTable rows={rows} total={total} columns={colunas} getRowId={(r) => r.id} selectable={false} nomeSingular="registro" redimensionavel />
}
