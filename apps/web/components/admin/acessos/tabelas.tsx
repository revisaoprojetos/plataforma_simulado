'use client'

import * as React from 'react'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { DataTable } from '@/components/admin/data-table'
import { Badge } from '@/components/ui/badge'

// Linhas JÁ formatadas pelo servidor (datas em BRT, duração, rótulos) — o cliente só exibe.
export interface SessaoLinha {
  id: string; estudanteId: string; nome?: string | null; email?: string | null
  inicio: string; visto: string; duracao: string; ip: string | null; aparelho: string
  metodo: string; origem: string; status: 'ativa' | 'inativa' | 'encerrada'; motivo: string | null
  impersonado: boolean; alerta?: boolean
}
export interface AtividadeLinha { id: string; quando: string; tipo: string; tipoRotulo: string; item: string; detalhe: string; ip: string | null; impersonado: boolean; rajada: boolean }

const PP = [10, 25, 50]

function StatusBadge({ s, motivo, imp }: { s: SessaoLinha['status']; motivo: string | null; imp: boolean }) {
  if (imp) return <Badge variant="outline">Visualização admin</Badge>
  if (s === 'ativa') return <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">Ativa</Badge>
  if (s === 'inativa') return <Badge variant="secondary">Inativa</Badge>
  return <Badge variant="outline">Encerrada{motivo === 'revogado_admin' ? ' (admin)' : motivo === 'logout' ? ' (saiu)' : ''}</Badge>
}

const IpLink = ({ ip }: { ip: string | null }) => ip
  ? <Link href={`/admin/acessos?ip=${encodeURIComponent(ip)}`} className="tabular-nums hover:underline" title="Ver todas as contas que usaram este IP">{ip}</Link>
  : <span className="text-muted-foreground">—</span>

/** Sessões de UM aluno (ficha). */
export function SessoesAlunoTable({ rows, total, filtros }: { rows: SessaoLinha[]; total: number; filtros: React.ReactNode }) {
  return (
    <DataTable<SessaoLinha>
      rows={rows} total={total} getRowId={(r) => r.id} selectable={false} searchable searchPlaceholder="Buscar por IP, navegador ou sistema…"
      perPageOptions={PP} defaultPerPage={10} defaultSort={{ key: 'iniciado_em', dir: 'desc' }} filters={filtros}
      nomeSingular="sessão" nomePlural="sessões" empty="Nenhuma sessão registrada neste período."
      columns={[
        { key: 'iniciado_em', header: 'Início', sortable: true, width: '10rem', render: (r) => r.inicio },
        { key: 'ultimo_visto_em', header: 'Último visto', sortable: true, width: '10rem', render: (r) => r.visto },
        { key: 'duracao', header: 'Duração', width: '7rem', render: (r) => r.duracao },
        { key: 'ip', header: 'IP', sortable: true, width: '10rem', render: (r) => <IpLink ip={r.ip} /> },
        { key: 'aparelho', header: 'Aparelho', render: (r) => r.aparelho, title: (r) => r.aparelho },
        { key: 'metodo', header: 'Método', sortable: true, width: '9rem', render: (r) => r.metodo },
        { key: 'origem', header: 'Origem', sortable: true, width: '9rem', render: (r) => r.origem },
        { key: 'status', header: 'Status', width: '9rem', render: (r) => <StatusBadge s={r.status} motivo={r.motivo} imp={r.impersonado} /> },
      ]}
    />
  )
}

/** Linha do tempo de atividades de UM aluno (ficha). */
export function AtividadesAlunoTable({ rows, total, filtros }: { rows: AtividadeLinha[]; total: number; filtros: React.ReactNode }) {
  return (
    <DataTable<AtividadeLinha>
      rows={rows} total={total} getRowId={(r) => r.id} selectable={false} searchable searchPlaceholder="Buscar por item ou IP…"
      perPageOptions={PP} defaultPerPage={25} defaultSort={{ key: 'criado_em', dir: 'desc' }} filters={filtros}
      nomeSingular="atividade" nomePlural="atividades" empty="Nenhuma atividade registrada neste período."
      columns={[
        { key: 'criado_em', header: 'Quando', sortable: true, width: '10rem', render: (r) => r.quando },
        { key: 'tipo', header: 'Tipo', sortable: true, width: '12rem', render: (r) => (
          <span className="inline-flex items-center gap-1.5">
            {r.tipoRotulo}
            {r.rajada && <Badge variant="destructive"><AlertTriangle className="h-3 w-3" />Rajada</Badge>}
            {r.impersonado && <Badge variant="outline">admin</Badge>}
          </span>
        ) },
        { key: 'item', header: 'Item', render: (r) => r.item, title: (r) => r.item },
        { key: 'detalhe', header: 'Detalhe', render: (r) => r.detalhe, title: (r) => r.detalhe },
        { key: 'ip', header: 'IP', sortable: true, width: '10rem', render: (r) => <IpLink ip={r.ip} /> },
      ]}
    />
  )
}

/** Acessos recentes de TODOS os alunos (painel global). */
export function AcessosGlobalTable({ rows, total, filtros }: { rows: SessaoLinha[]; total: number; filtros: React.ReactNode }) {
  return (
    <DataTable<SessaoLinha>
      rows={rows} total={total} getRowId={(r) => r.id} selectable={false} searchable searchPlaceholder="Buscar por aluno, e-mail ou IP…"
      perPageOptions={[10, 25, 50]} defaultPerPage={25} defaultSort={{ key: 'iniciado_em', dir: 'desc' }} filters={filtros}
      nomeSingular="acesso" nomePlural="acessos" empty="Nenhum acesso registrado com estes filtros."
      columns={[
        { key: 'aluno', header: 'Aluno', render: (r) => (
          <Link href={`/admin/estudantes/${r.estudanteId}/acessos`} className="inline-flex items-center gap-1.5 font-medium hover:underline">
            {r.alerta && <AlertTriangle className="h-3.5 w-3.5 text-destructive" aria-label="Aluno com alerta" />}
            <span className="truncate">{r.nome ?? '—'}</span>
            {r.email && <span className="truncate text-xs font-normal text-muted-foreground">{r.email}</span>}
          </Link>
        ), title: (r) => `${r.nome ?? ''} ${r.email ?? ''}` },
        { key: 'iniciado_em', header: 'Início', sortable: true, width: '10rem', render: (r) => r.inicio },
        { key: 'ultimo_visto_em', header: 'Último visto', sortable: true, width: '10rem', render: (r) => r.visto },
        { key: 'ip', header: 'IP', sortable: true, width: '10rem', render: (r) => <IpLink ip={r.ip} /> },
        { key: 'aparelho', header: 'Aparelho', render: (r) => r.aparelho, title: (r) => r.aparelho },
        { key: 'metodo', header: 'Método', sortable: true, width: '9rem', render: (r) => r.metodo },
        { key: 'origem', header: 'Origem', sortable: true, width: '9rem', render: (r) => r.origem },
        { key: 'status', header: 'Status', width: '9rem', render: (r) => <StatusBadge s={r.status} motivo={r.motivo} imp={r.impersonado} /> },
      ]}
    />
  )
}
