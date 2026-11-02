import { getCurrentAccess } from '@/lib/auth/permissions'
import { SemAcessoArea } from '@/app/admin/conteudos/_components/sem-acesso-area'
import { listarTrilhasAction, getTrilhaAction } from './actions'
import { TrilhasClient } from './trilhas-client'

export const dynamic = 'force-dynamic'
const PER_PAGE = [5, 10, 25, 50]

// TRILHAS (Estúdio): lista (master, <DataTable> server-driven) + detalhe lateral da trilha selecionada.
export default async function TrilhasPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const access = await getCurrentAccess()
  const podeVer = access.isAdmin || access.permissions.includes('trilhas:view') || access.permissions.includes('trilhas:manage')
  if (!podeVer) return <SemAcessoArea />
  const podeEditar = access.isAdmin || access.permissions.includes('trilhas:manage')
    || access.permissions.includes('trilhas:update') || access.permissions.includes('trilhas:create')

  const sp = await searchParams
  const page = Math.max(1, Number(sp.page ?? 1) || 1)
  const perPage = PER_PAGE.includes(Number(sp.pp)) ? Number(sp.pp) : 5
  const q = (sp.q ?? '').trim()
  const sort = sp.sort ?? 'codigo'
  const dir = sp.dir === 'asc' ? 'asc' : 'desc'
  const sel = sp.sel ?? null

  const lista = await listarTrilhasAction({ q, page, perPage, sort, dir })
  const selecionado = sel ? (await getTrilhaAction(sel)).trilha ?? null : null

  return (
    <TrilhasClient
      rows={lista.rows}
      total={lista.total}
      selecionado={selecionado}
      aviso={lista.aviso ?? null}
      podeEditar={podeEditar}
    />
  )
}
