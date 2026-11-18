import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { createAdminClient } from '@/lib/supabase/server'
import { SemPermissao } from '@/components/ui/alert-box'
import { buttonVariants } from '@/components/ui/button'
import { RevisaoHead, RevisaoCard } from '@/components/admin/revisao/ui'
import { Nota, Paginacao, lerPaginacao } from '@/components/admin/revisao/pedagogico-ui'
import { NOME_TIPO_ATUALIZACAO } from '@/lib/admin-revisao/biblioteca-tipos'
import { AVISO_MIGRACAO_ATUALIZACOES, AVISO_MIGRACAO_ESPEC, listarHistorico, rotulosDeMateriais } from '@/lib/admin-revisao/atualizacoes'
import { UUID_RE } from '@/lib/admin-revisao/atualizacoes-filtros'
import { formatBrt } from '@/lib/brt'
import { cn } from '@/lib/utils'
import { MaterialAbreEditor } from '../../../duvidas/duvidas-client'
import { EspecificacaoAtualizacao, PILL } from '../../linha-hist'

export const metadata: Metadata = { title: 'Linha do tempo do material' }
export const dynamic = 'force-dynamic'

// LINHA DO TEMPO das atualizações de UM material (Central de Atualizações). A página só LÊ.
export default async function LinhaDoTempoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const access = await getCurrentAccess()
  if (!accessCan(access, 'configuracoes:view') || !access.tenantId) return <SemPermissao />
  const { id } = await params
  const base = `/admin/revisao/atualizacoes/material/${id}`
  if (!UUID_RE.test(id)) return <Nota destaque>Material inválido. <Link href="/admin/revisao/atualizacoes?aba=hist" className="underline">Voltar</Link></Nota>
  const podeEditar = accessCan(access, 'configuracoes:update')
  const svc = createAdminClient()
  const { pagina, porPagina } = lerPaginacao(await searchParams)
  const [h, rot] = await Promise.all([
    listarHistorico(svc, access.tenantId, { documentoId: id, pagina, porPagina }),
    rotulosDeMateriais(svc, access.tenantId, [id]),
  ])
  const nome = rot.get(id) ?? 'Material'
  return (
    <div className="w-full">
      <RevisaoHead
        secao="Central de Atualizações" titulo={nome} subtitulo="Linha do tempo: tudo o que já foi atualizado neste material, da mais recente para a mais antiga."
        acoes={<Link href="/admin/revisao/atualizacoes?aba=hist" className={buttonVariants({ variant: 'outline' })}><ArrowLeft />Histórico</Link>}
      />
      {podeEditar && <div className="mb-4 text-sm"><MaterialAbreEditor documentoId={id} titulo="Abrir no editor" /></div>}
      {h.semTabela && <Nota destaque>{AVISO_MIGRACAO_ATUALIZACOES}</Nota>}
      {h.semEspec && !h.semTabela && <Nota destaque>{AVISO_MIGRACAO_ESPEC}</Nota>}
      {h.rows.length === 0 && !h.semTabela && <p className="rounded-2xl border bg-card px-4 py-10 text-center text-sm text-muted-foreground">Nenhuma atualização registrada para este material.</p>}
      <ol className="space-y-3 border-l-2 pl-5">
        {h.rows.map((r) => (
          <li key={r.id} className="relative">
            <span className="absolute -left-[1.6rem] top-4 h-2.5 w-2.5 rounded-full bg-primary" aria-hidden />
            <RevisaoCard>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className={cn('rounded-full px-2 py-0.5 font-medium', PILL[r.tipo])}>{NOME_TIPO_ATUALIZACAO[r.tipo]}</span>
                <span className="tabular-nums text-muted-foreground">{formatBrt(r.quando)}</span>
                {r.registradoPor && <span className="text-muted-foreground">· {r.registradoPor}</span>}
                <span className={cn('rounded-full px-2 py-0.5 font-medium', r.avisou ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : 'bg-muted text-muted-foreground')}>{r.avisou ? 'Alunos avisados' : 'Sem aviso'}</span>
              </div>
              <p className="mt-2 text-sm">{r.texto}</p>
              <EspecificacaoAtualizacao r={r} />
            </RevisaoCard>
          </li>
        ))}
      </ol>
      <Paginacao total={h.total} pagina={pagina} porPagina={porPagina} base={base} params={{}} />
    </div>
  )
}
