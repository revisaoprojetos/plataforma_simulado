'use client'

import Link from 'next/link'
import { Pencil } from 'lucide-react'
import { DataTable } from '@/components/admin/data-table'
import { JcStatusPill } from '@/components/admin/revisao/jurisclub-cards'
import { jcData, jcPasta, type EdicaoRow } from '@/lib/revisao/jurisclub-tipos'

// Visão "Linhas" do JurisClub: DataTable server-driven (busca ?q, ordenação ?sort/?dir, página ?page/?pp). Só renderiza.
export function LinhasTabela({ rows, total }: { rows: EdicaoRow[]; total: number }) {
  return (
    <DataTable<EdicaoRow>
      rows={rows}
      total={total}
      getRowId={(r) => r.id}
      selectable={false}
      searchable
      searchPlaceholder="Buscar edição ou dia"
      defaultSort={{ key: 'criado_em', dir: 'desc' }}
      nomeSingular="edição"
      nomePlural="edições"
      empty={<span>Nada com esse filtro.</span>}
      columns={[
        {
          key: 'titulo', header: 'Edição ou dia', sortable: true, truncate: false,
          render: (r) => (
            <div className="min-w-0">
              <b className="font-semibold">{r.titulo}</b>
              {r.falta && <span className="block text-xs text-muted-foreground">{r.falta}</span>}
            </div>
          ),
        },
        { key: 'pasta', header: 'Pasta', width: '11rem', render: (r) => jcPasta(r.pasta).n },
        { key: 'status', header: 'Situação', sortable: true, width: '8rem', render: (r) => <JcStatusPill status={r.status} /> },
        { key: 'n_julgados', header: 'Conteúdo', sortable: true, width: '9rem', align: 'right', render: (r) => `${r.n_julgados} ${jcPasta(r.pasta).item}` },
        { key: 'n_questoes', header: 'Questões', sortable: true, width: '7rem', align: 'right', render: (r) => (r.n_questoes || '—') },
        { key: 'publicado_em', header: 'No ar desde', sortable: true, width: '9rem', align: 'right', render: (r) => jcData(r.publicado_em) },
        {
          key: 'acoes', header: '', width: '7rem', align: 'right',
          render: (r) => (
            <Link href={`/admin/revisao/jurisclub/${r.id}`} className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-muted">
              <Pencil className="size-3.5" />Abrir
            </Link>
          ),
        },
      ]}
    />
  )
}
