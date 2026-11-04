// Página de UM módulo do extensivo: índice dos módulos (com progresso) + aulas do módulo em linha única.
// A vitrine (pôsteres dos módulos) fica em /aluno/extensivos/[slug]; o "Voltar" do leitor volta para cá.
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getSessaoAluno } from '@/lib/aluno-session'
import { getExtensivoDoAluno, curriculoDoExtensivo } from '@/lib/produtos/aluno'
import { ModuloDetalhe } from '../../curriculo'

export const dynamic = 'force-dynamic'

export default async function ModuloExtensivoPage({ params }: { params: Promise<{ slug: string; moduloId: string }> }) {
  const { slug, moduloId } = await params
  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')
  // Gate: só quem tem o produto (assinatura ativa OU grupo vinculado).
  const ext = await getExtensivoDoAluno(sessao.tenantId, sessao.estudanteId, slug)
  if (!ext) notFound()
  // Mesmo bloqueio TOTAL da vitrine: produto "em edição" → volta à página do extensivo (onde a mensagem
  // de atualização aparece). Bypass p/ admin visualizando (impersonation).
  if (ext.bloqueado && !sessao.impersonation) redirect(`/aluno/extensivos/${slug}`)
  const modulos = await curriculoDoExtensivo(sessao.tenantId, sessao.estudanteId, ext.id, slug)
  const atual = modulos.find((m) => m.id === moduloId)
  if (!atual) notFound() // módulo inexistente, de outro produto, vazio ou oculto até liberar
  const cor = ext.cor || 'var(--brand-primary, var(--primary))'

  return (
    <div className="w-full space-y-4">
      <Link href={`/aluno/extensivos/${slug}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />{ext.nome}
      </Link>
      <ModuloDetalhe modulos={modulos} atual={atual} slug={slug} cor={cor} />
    </div>
  )
}
