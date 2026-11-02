import { getCurrentAccess } from '@/lib/auth/permissions'
import { SemAcessoArea } from '@/app/admin/conteudos/_components/sem-acesso-area'
import { listarBaralhosAction, getBaralhoAction } from './actions'
import { FlashcardsClient } from './flashcards-client'

export const dynamic = 'force-dynamic'
const SEM = '00000000-0000-0000-0000-000000000000'
const PER_PAGE = [5, 10, 25, 50]

// FLASHCARDS (Estúdio): lista de baralhos (master) + detalhe lateral. Paginação server-side via action.
export default async function FlashcardsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const access = await getCurrentAccess()
  const podeVer = access.isAdmin || access.permissions.includes('flashcards:view') || access.permissions.includes('flashcards:manage')
  if (!podeVer) return <SemAcessoArea />
  const podeEditar = access.isAdmin || access.permissions.includes('flashcards:manage')
    || access.permissions.includes('flashcards:update') || access.permissions.includes('flashcards:create')

  const sp = await searchParams
  const page = Math.max(1, Number(sp.page ?? 1) || 1)
  const perPage = PER_PAGE.includes(Number(sp.pp)) ? Number(sp.pp) : 10
  const q = (sp.q ?? '').trim()
  const sort = sp.sort ?? 'criado_em'
  const dir = sp.dir === 'asc' ? 'asc' : 'desc'
  const sel = sp.sel ?? null

  const lista = await listarBaralhosAction({ q, page, perPage, sort, dir })
  const selecionado = sel ? (await getBaralhoAction(sel)).baralho ?? null : null

  return (
    <FlashcardsClient
      tenantId={access.tenantId ?? SEM}
      rows={lista.rows}
      total={lista.total}
      selecionado={selecionado}
      aviso={lista.aviso ?? null}
      podeEditar={podeEditar}
    />
  )
}
