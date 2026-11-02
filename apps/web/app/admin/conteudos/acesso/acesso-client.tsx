'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ShieldCheck, RefreshCw, ChevronRight, Users } from 'lucide-react'
import { DataTable } from '@/components/admin/data-table'
import { Button } from '@/components/ui/button'
import { reconciliarAgoraAction } from './actions'

export type AcessoLinha = {
  id: string
  nome: string
  email: string | null
  classificacao: string | null
  produtosAtivos: number
}

export function AcessoClient({ rows, total, podeReconciliar }: { rows: AcessoLinha[]; total: number; podeReconciliar: boolean }) {
  const router = useRouter()
  const [reconciliando, setReconciliando] = React.useState(false)

  async function reconciliar() {
    setReconciliando(true)
    const r = await reconciliarAgoraAction()
    setReconciliando(false)
    if (!r.ok) { toast.error(r.error ?? 'Falha ao reconciliar.'); return }
    toast.success(`Reconciliado: ${r.pastaInseridos ?? 0} vínculo(s) de banco · ${r.matriculasInseridas ?? 0} matrícula(s) criadas.`)
    router.refresh()
  }

  return (
    <div className="w-full space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Conteúdos</p>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><ShieldCheck className="h-6 w-6 text-primary" /> Quem tem acesso</h1>
          <p className="text-sm text-muted-foreground">Acesso efetivo por aluno (une regras de venda, integração e matrícula manual). Abra um aluno para ver por quê.</p>
        </div>
        {podeReconciliar && (
          <Button size="lg" variant="outline" onClick={reconciliar} disabled={reconciliando}>
            <RefreshCw className={reconciliando ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} /> Reconciliar grupos ↔ bancos
          </Button>
        )}
      </div>

      {podeReconciliar && (
        <p className="rounded-lg border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          A reconciliação em 1 clique garante que todo membro de grupo esteja no banco vinculado e matriculado nos simulados que herdam dele (rede de segurança do cron, sob demanda).
        </p>
      )}

      <DataTable<AcessoLinha>
        rows={rows}
        total={total}
        getRowId={(r) => r.id}
        searchable
        searchPlaceholder="Buscar aluno por nome ou e-mail"
        selectable={false}
        nomeSingular="aluno"
        nomePlural="alunos"
        columns={[
          {
            key: 'nome', header: 'Aluno',
            render: (r) => (
              <Link href={`/admin/conteudos/acesso/${r.id}`} className="min-w-0 hover:text-primary">
                <div className="truncate font-medium text-foreground">{r.nome}</div>
                <div className="truncate text-xs text-muted-foreground">{r.email ?? '—'}</div>
              </Link>
            ),
            title: (r) => `${r.nome} · ${r.email ?? ''}`,
          },
          {
            key: 'produtos', header: 'Produtos ativos', width: '12rem', align: 'right',
            render: (r) => r.produtosAtivos > 0
              ? <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 tabular-nums">{r.produtosAtivos} ativo(s)</span>
              : <span className="text-xs text-muted-foreground">Sem acesso</span>,
          },
          {
            key: 'abrir', header: '', width: '3rem', align: 'right',
            render: (r) => <Link href={`/admin/conteudos/acesso/${r.id}`} aria-label="Abrir" className="inline-flex text-muted-foreground hover:text-foreground"><ChevronRight className="h-4 w-4" /></Link>,
          },
        ]}
        empty={<span className="inline-flex flex-col items-center gap-2"><Users className="h-6 w-6 opacity-50" />Nenhum aluno encontrado.</span>}
      />
    </div>
  )
}
