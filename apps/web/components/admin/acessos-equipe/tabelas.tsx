'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Activity, ClipboardList, LogOut } from 'lucide-react'
import { DataTable } from '@/components/admin/data-table'
import { Badge } from '@/components/ui/badge'
import { confirmar } from '@/components/ui/confirm-dialog'
import { rotuloIp } from '@/lib/acessos/ip'

// Linhas JÁ formatadas pelo servidor (tempos relativos, rótulos) — o cliente só exibe.
export interface EquipeLinhaUi {
  userId: string; nome: string | null; email: string | null; papel: string; voce: boolean; online: boolean
  sessoes: number; paginas: string[]; conectadoHa: string; tempoAtivo: string; ultimaAtividade: string; dispositivos: string[]
}
export interface AtivAdminLinha {
  id: string; quando: string; relativo: string; tipo: string; tipoRotulo: string; pagina: string; rotaApi: string; ip: string | null
  aparelho: string; detalhe: string; sessao: string; requestId: string
}
export interface SessaoAdminLinha {
  id: string; inicio: string; visto: string; duracao: string; ip: string | null; aparelho: string; pagina: string; tempoAtivo: string
  status: 'online' | 'inativa' | 'encerrada'; motivo: string | null
}

const PP = [10, 25, 50]

function Ident({ nome, email, voce }: { nome: string | null; email: string | null; voce: boolean }) {
  return (
    <span className="flex min-w-0 flex-col leading-tight">
      <span className="flex items-center gap-1.5 font-medium">
        <span className="truncate">{nome ?? email ?? '—'}</span>
        {voce && <Badge variant="outline" className="px-1.5 py-0 text-[10px]">você</Badge>}
      </span>
      {nome && email && <span className="truncate text-xs font-normal text-muted-foreground">{email}</span>}
    </span>
  )
}

/** Painel "Usuários online" (equipe). */
export function EquipeOnlineTable({ rows, total, filtros, podeEncerrar }: { rows: EquipeLinhaUi[]; total: number; filtros: React.ReactNode; podeEncerrar: boolean }) {
  const router = useRouter()

  async function encerrar(r: EquipeLinhaUi) {
    const ok = await confirmar({
      titulo: 'Encerrar sessão?',
      mensagem: `${r.nome ?? r.email ?? 'Este usuário'} será desconectado(a) do painel em até 1 minuto (no próximo sinal do navegador). Para impedir novo acesso, desative o administrador. Fica registrado na auditoria.`,
      confirmar: 'Encerrar sessão', destrutivo: true,
    })
    if (!ok) return
    try {
      const res = await fetch('/api/admin/acessos-equipe/encerrar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: r.userId }) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.message ?? 'Não foi possível encerrar a sessão.')
      toast.success(`Sessão encerrada (${j.sessoes ?? 0}).`)
      router.refresh()
    } catch (e) { toast.error((e as Error).message) }
  }

  return (
    <DataTable<EquipeLinhaUi>
      rows={rows} total={total} getRowId={(r) => r.userId} selectable={false} searchable searchPlaceholder="Buscar por nome, e-mail ou página…"
      perPageOptions={PP} defaultPerPage={25} defaultSort={{ key: 'ultima', dir: 'desc' }} filters={filtros}
      redimensionavel nomeSingular="usuário" nomePlural="usuários" empty="Nenhum membro da equipe com estes filtros."
      rowActions={(r) => [
        { label: 'Ver atividade', icon: <Activity className="h-4 w-4" />, href: `/admin/acessos-equipe/${r.userId}` },
        { label: 'Ver auditoria', icon: <ClipboardList className="h-4 w-4" />, href: `/admin/auditoria?ator=${r.userId}` },
        ...(podeEncerrar && !r.voce && r.sessoes > 0 ? [{ label: 'Encerrar sessão', icon: <LogOut className="h-4 w-4" />, destructive: true, separatorBefore: true, onClick: () => { void encerrar(r) } }] : []),
      ]}
      columns={[
        { key: 'usuario', header: 'Usuário', sortable: true, render: (r) => <Link href={`/admin/acessos-equipe/${r.userId}`} className="hover:underline"><Ident nome={r.nome} email={r.email} voce={r.voce} /></Link>, title: (r) => `${r.nome ?? ''} ${r.email ?? ''}` },
        { key: 'papel', header: 'Papel', sortable: true, width: '9rem', render: (r) => <Badge variant="secondary">{r.papel}</Badge> },
        { key: 'status', header: 'Status', sortable: true, width: '7rem', render: (r) => r.online
          ? <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">Online</Badge>
          : <Badge variant="outline">Offline</Badge> },
        { key: 'sessoes', header: 'Sessões', sortable: true, width: '6rem', render: (r) => <span className="tabular-nums">{r.sessoes}</span> },
        { key: 'paginas', header: 'Páginas atuais', render: (r) => r.paginas.length ? <span className="font-mono text-xs">{r.paginas.join(', ')}</span> : <span className="text-muted-foreground">—</span>, title: (r) => r.paginas.join(', ') },
        { key: 'conectado', header: 'Conectado há', width: '8rem', render: (r) => r.conectadoHa },
        { key: 'tempo', header: 'Tempo ativo (24h)', width: '9rem', render: (r) => r.tempoAtivo },
        { key: 'ultima', header: 'Última atividade', sortable: true, width: '9rem', render: (r) => r.ultimaAtividade },
        { key: 'dispositivos', header: 'Dispositivos', render: (r) => r.dispositivos.join(', '), title: (r) => r.dispositivos.join(', ') },
      ]}
    />
  )
}

/** Linha do tempo de atividades de UM admin. */
export function AtividadesAdminTable({ rows, total, filtros }: { rows: AtivAdminLinha[]; total: number; filtros: React.ReactNode }) {
  return (
    <DataTable<AtivAdminLinha>
      rows={rows} total={total} getRowId={(r) => r.id} selectable={false} searchable searchPlaceholder="Buscar por página, rota da API, IP ou ID da requisição…"
      perPageOptions={PP} defaultPerPage={25} defaultSort={{ key: 'criado_em', dir: 'desc' }} filters={filtros}
      redimensionavel nomeSingular="evento" nomePlural="eventos" empty="Nenhuma atividade registrada neste período."
      columns={[
        { key: 'criado_em', header: 'Quando', sortable: true, width: '11rem', render: (r) => <span className="flex flex-col leading-tight"><span>{r.relativo}</span><span className="text-xs text-muted-foreground">{r.quando}</span></span> },
        { key: 'tipo', header: 'Ação', sortable: true, width: '10rem', render: (r) => r.tipoRotulo },
        { key: 'rota', header: 'Página', sortable: true, render: (r) => <span className="font-mono text-xs">{r.pagina}</span>, title: (r) => r.pagina },
        { key: 'rota_api', header: 'Rota da API', render: (r) => <span className="font-mono text-xs">{r.rotaApi}</span>, title: (r) => r.rotaApi },
        { key: 'ip', header: 'IP', sortable: true, width: '9rem', render: (r) => rotuloIp(r.ip) },
        { key: 'aparelho', header: 'Dispositivo', width: '11rem', render: (r) => r.aparelho, title: (r) => r.aparelho },
        { key: 'detalhe', header: 'Detalhe', width: '10rem', render: (r) => r.detalhe },
        { key: 'sessao', header: 'Sessão', width: '6rem', render: (r) => <span className="font-mono text-xs" title={r.requestId ? `Requisição ${r.requestId}` : undefined}>{r.sessao}</span> },
      ]}
    />
  )
}

/** Sessões de UM admin. */
export function SessoesAdminTable({ rows, total, filtros }: { rows: SessaoAdminLinha[]; total: number; filtros: React.ReactNode }) {
  return (
    <DataTable<SessaoAdminLinha>
      rows={rows} total={total} getRowId={(r) => r.id} selectable={false} searchable searchPlaceholder="Buscar por IP, navegador ou sistema…"
      perPageOptions={PP} defaultPerPage={10} defaultSort={{ key: 'iniciado_em', dir: 'desc' }} filters={filtros}
      redimensionavel nomeSingular="sessão" nomePlural="sessões" empty="Nenhuma sessão registrada neste período."
      columns={[
        { key: 'iniciado_em', header: 'Início', sortable: true, width: '10rem', render: (r) => r.inicio },
        { key: 'ultimo_visto_em', header: 'Último visto', sortable: true, width: '10rem', render: (r) => r.visto },
        { key: 'duracao', header: 'Duração', width: '7rem', render: (r) => r.duracao },
        { key: 'tempo', header: 'Tempo ativo', width: '8rem', render: (r) => r.tempoAtivo },
        { key: 'ip', header: 'IP', sortable: true, width: '9rem', render: (r) => rotuloIp(r.ip) },
        { key: 'aparelho', header: 'Dispositivo', render: (r) => r.aparelho, title: (r) => r.aparelho },
        { key: 'pagina', header: 'Última página', render: (r) => <span className="font-mono text-xs">{r.pagina}</span> },
        { key: 'status', header: 'Status', width: '9rem', render: (r) => r.status === 'online'
          ? <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">Online</Badge>
          : r.status === 'inativa' ? <Badge variant="secondary">Inativa</Badge>
          : <Badge variant="outline">Encerrada{r.motivo === 'encerrada_admin' ? ' (admin)' : r.motivo === 'logout' ? ' (saiu)' : ''}</Badge> },
      ]}
    />
  )
}
