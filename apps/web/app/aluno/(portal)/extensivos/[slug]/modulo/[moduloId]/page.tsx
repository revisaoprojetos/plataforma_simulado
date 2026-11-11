// Página de UM módulo do extensivo: aulas agrupadas por TIPO de material (PDFull, PDFlash, LegProc, Questões…),
// em 3 variações por produto (simulado_produtos.modulo_layout: cards_lista | colunas | abas). Sem coluna lateral
// de módulos — a navegação entre módulos é por setas/seletor. Agrupamento e progresso calculados AQUI (servidor).
// A vitrine (pôsteres dos módulos) fica em /aluno/extensivos/[slug]; o "Voltar" do leitor volta para cá.
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getSessaoAluno } from '@/lib/aluno-session'
import { getExtensivoDoAluno, curriculoDoExtensivo, moduloLayoutDoProduto } from '@/lib/produtos/aluno'
import { agruparModulo, localizarModulo, resumirSubmodulos, buscarAulasEmSubmodulos, type ModuloAluno } from '@/lib/produtos/curriculo-aluno'
import { ehModuloLayout } from '@/lib/produtos/tipos'
import { ModuloDetalhe, type NavModulo } from '../../modulo-detalhe'

export const dynamic = 'force-dynamic'

export default async function ModuloExtensivoPage({ params, searchParams }: { params: Promise<{ slug: string; moduloId: string }>; searchParams: Promise<{ layout?: string; q?: string }> }) {
  const { slug, moduloId } = await params
  const { layout: layoutQuery, q: qBusca } = await searchParams
  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')
  // Gate: só quem tem o produto (assinatura ativa OU grupo vinculado).
  const ext = await getExtensivoDoAluno(sessao.tenantId, sessao.estudanteId, slug)
  if (!ext) notFound()
  // Mesmo bloqueio TOTAL da vitrine: produto "em edição" → volta à página do extensivo (onde a mensagem
  // de atualização aparece). Bypass p/ admin visualizando (impersonation).
  if (ext.bloqueado && !sessao.impersonation) redirect(`/aluno/extensivos/${slug}`)
  const modulos = await curriculoDoExtensivo(sessao.tenantId, sessao.estudanteId, ext.id, slug)
  // Aceita módulo de topo OU submódulo (qualquer nível); o pai serve de breadcrumb e os irmãos de navegação.
  const achado = localizarModulo(modulos, moduloId)
  if (!achado) notFound() // módulo inexistente, de outro produto, vazio ou oculto até liberar
  const { atual, pai, irmaos } = achado
  // Layout do produto (coluna tolerante); ?layout= só PRÉ-VISUALIZA na leitura (nada é gravado).
  const layoutProduto = await moduloLayoutDoProduto(sessao.tenantId, ext.id)
  const layout = ehModuloLayout(layoutQuery) ? layoutQuery : layoutProduto
  const total = agruparModulo(atual)                                  // estatísticas do módulo INTEIRO (inclui submódulos)
  const agrupado = atual.submodulos.length ? agruparModulo({ ...atual, submodulos: [] }) : total // aulas DIRETAS (agrupadas por material)
  const submodulos = resumirSubmodulos(atual)
  const q = (qBusca ?? '').slice(0, 80)
  const achados = q.trim() ? buscarAulasEmSubmodulos(atual, q) : []
  const nav: NavModulo[] = irmaos.map((m) => { const a = agruparModulo(m); return { id: m.id, titulo: m.titulo, liberado: m.liberado, lidas: a.lidas, total: a.total } })
  // O client só precisa do cabeçalho do módulo (as aulas já vão em `agrupado`).
  const cab: ModuloAluno = { ...atual, aulas: [], submodulos: [] }
  const cor = ext.cor || 'var(--brand-primary, var(--primary))'
  const voltar = pai ? { href: `/aluno/extensivos/${slug}/modulo/${pai.id}`, nome: pai.titulo } : { href: `/aluno/extensivos/${slug}`, nome: ext.nome }

  return (
    <div className="w-full space-y-4">
      <Link href={voltar.href} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />{voltar.nome}
      </Link>
      <ModuloDetalhe nav={nav} atual={cab} agrupado={agrupado} total={total} submodulos={submodulos} achados={achados} qInicial={q}
        ehSub={!!pai} layout={layout} slug={slug} cor={cor} />
    </div>
  )
}
