import { notFound } from 'next/navigation'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { SemAcessoArea } from '@/app/admin/conteudos/_components/sem-acesso-area'
import { getTrilhaAction, listarOpcoesTrilhaAction } from '../actions'
import { TrilhaEditor } from './trilha-editor'

export const dynamic = 'force-dynamic'
const SEM = '00000000-0000-0000-0000-000000000000'
const TABS = ['informacoes', 'imagens', 'conteudos'] as const

// TRILHAS › editor da trilha (Informações · Imagens · Conteúdos). `?tab=` faz deep-link da aba.
export default async function TrilhaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const access = await getCurrentAccess()
  const podeVer = access.isAdmin || access.permissions.includes('trilhas:view') || access.permissions.includes('trilhas:manage')
  if (!podeVer) return <SemAcessoArea />
  const podeEditar = access.isAdmin || access.permissions.includes('trilhas:manage')
    || access.permissions.includes('trilhas:update') || access.permissions.includes('trilhas:create')

  const { id } = await params
  const sp = await searchParams
  const r = await getTrilhaAction(id)
  if (!r.ok || !r.trilha) notFound()
  const opcoes = await listarOpcoesTrilhaAction(id)
  const tabInicial = (TABS as readonly string[]).includes(sp.tab) ? (sp.tab as (typeof TABS)[number]) : 'informacoes'

  return (
    <TrilhaEditor
      trilha={r.trilha}
      produtos={opcoes.produtos}
      outrasTrilhas={opcoes.trilhas}
      tenantId={access.tenantId ?? SEM}
      tabInicial={tabInicial}
      podeEditar={podeEditar}
    />
  )
}
