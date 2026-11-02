import { notFound } from 'next/navigation'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { SemAcessoArea } from '@/app/admin/conteudos/_components/sem-acesso-area'
import { getBaralhoAction } from '../actions'
import { BaralhoEditor } from './baralho-editor'

export const dynamic = 'force-dynamic'

// FLASHCARDS › editor do baralho (cartões). `?novo=1` já abre o modal de novo cartão.
export default async function BaralhoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const access = await getCurrentAccess()
  const podeVer = access.isAdmin || access.permissions.includes('flashcards:view') || access.permissions.includes('flashcards:manage')
  if (!podeVer) return <SemAcessoArea />
  const podeEditar = access.isAdmin || access.permissions.includes('flashcards:manage')
    || access.permissions.includes('flashcards:update') || access.permissions.includes('flashcards:create')

  const { id } = await params
  const sp = await searchParams
  const r = await getBaralhoAction(id)
  if (!r.ok || !r.baralho) notFound()

  return <BaralhoEditor baralho={r.baralho} abrirNovo={sp.novo === '1'} podeEditar={podeEditar} />
}
