// Página de UM módulo do extensivo: aulas agrupadas por TIPO de material (PDFull, PDFlash, LegProc, Questões…),
// em 3 variações por produto (simulado_produtos.modulo_layout: cards_lista | colunas | abas). Sem coluna lateral
// de módulos — a navegação entre módulos é por setas/seletor. Agrupamento e progresso calculados AQUI (servidor).
// A vitrine (pôsteres dos módulos) fica em /aluno/extensivos/[slug]; o "Voltar" do leitor volta para cá.
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getSessaoAluno } from '@/lib/aluno-session'
import { getExtensivoDoAluno, curriculoDoExtensivo, moduloLayoutDoProduto } from '@/lib/produtos/aluno'
import { agruparModulo, type ModuloAluno } from '@/lib/produtos/curriculo-aluno'
import { ehModuloLayout } from '@/lib/produtos/tipos'
import { ModuloDetalhe, type NavModulo } from '../../modulo-detalhe'

export const dynamic = 'force-dynamic'

export default async function ModuloExtensivoPage({ params, searchParams }: { params: Promise<{ slug: string; moduloId: string }>; searchParams: Promise<{ layout?: string }> }) {
  const { slug, moduloId } = await params
  const { layout: layoutQuery } = await searchParams
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
  // Layout do produto (coluna tolerante); ?layout= só PRÉ-VISUALIZA na leitura (nada é gravado).
  const layoutProduto = await moduloLayoutDoProduto(sessao.tenantId, ext.id)
  const layout = ehModuloLayout(layoutQuery) ? layoutQuery : layoutProduto
  const agrupado = agruparModulo(atual)
  const nav: NavModulo[] = modulos.map((m) => { const a = agruparModulo(m); return { id: m.id, titulo: m.titulo, liberado: m.liberado, lidas: a.lidas, total: a.total } })
  // O client só precisa do cabeçalho do módulo (as aulas já vão em `agrupado`).
  const cab: ModuloAluno = { ...atual, aulas: [], submodulos: [] }
  const cor = ext.cor || 'var(--brand-primary, var(--primary))'

  return (
    <div className="w-full space-y-4">
      <Link href={`/aluno/extensivos/${slug}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />{ext.nome}
      </Link>
      <ModuloDetalhe nav={nav} atual={cab} agrupado={agrupado} layout={layout} slug={slug} cor={cor} />
    </div>
  )
}
