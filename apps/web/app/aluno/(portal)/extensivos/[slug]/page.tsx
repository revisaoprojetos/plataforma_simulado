import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { getSessaoAluno } from '@/lib/aluno-session'
import { vitrineDoAluno, progressoExtensivo, avisosDoProduto, getExtensivoDoAluno, curriculoDoExtensivo } from '@/lib/produtos/aluno'
import { carregarPaginaProduto, carregarDadosPagina, montarItensPagina } from '@/lib/produtos/pagina/loader'
import { voltarDoExtensivo } from '@/lib/nova/extensivos-aluno'
import { PaginaAluno } from './render-blocos' // → <PaginaRender modo="aluno"/> (components/produtos/pagina/blocos)
import { accessCan, getCurrentAccess } from '@/lib/auth/permissions'
import { FaixaPrevia } from '@/components/produtos/pagina/editor/versoes/faixa-previa'
import { ArrowLeft, ChevronRight, Layers, Wrench } from 'lucide-react'

export const dynamic = 'force-dynamic'

// Prévia do rascunho (?preview=rascunho): nunca indexar.
export async function generateMetadata({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const sp = await searchParams
  return sp?.preview ? { robots: { index: false, follow: false } } : {}
}

export default async function ExtensivoPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ preview?: string }> }) {
  const { slug } = await params
  const sp = await searchParams
  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')
  // Prévia do rascunho: SÓ com produtos:manage (checagem no servidor); sem a permissão o parâmetro é ignorado.
  const previa = sp?.preview === 'rascunho' && accessCan(await getCurrentAccess(), 'produtos:manage')
  const [ext, voltar] = await Promise.all([getExtensivoDoAluno(sessao.tenantId, sessao.estudanteId, slug), voltarDoExtensivo()])
  if (!ext) notFound()
  // Modo "em edição/manutenção": bloqueio TOTAL — todos os alunos (até matriculados) veem a mensagem de
  // atualização. Bypass: admin VISUALIZANDO a conta (impersonation) ignora o bloqueio p/ conferir antes de publicar.
  if (ext.bloqueado && !sessao.impersonation) {
    return (
      <div className="w-full">
        <Link href={voltar.href} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />{voltar.rotulo}
        </Link>
        <div className="mx-auto mt-10 max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
          <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <Wrench className="h-7 w-7" />
          </span>
          <h1 className="text-lg font-bold tracking-tight">Produto em atualização</h1>
          <p className="mt-2 text-sm text-muted-foreground">Este produto está temporariamente indisponível enquanto preparamos melhorias. Volte em breve.</p>
          <Link href={voltar.href} className="mt-5 inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted">
            <ArrowLeft className="h-4 w-4" />Voltar para {voltar.rotulo}
          </Link>
        </div>
      </div>
    )
  }
  // Leituras pesadas em PARALELO (como antes) + a página (blocos V1: versão publicada ou derivação legada).
  const [vit, progressoSimulados, avisos, curriculo, carregada] = await Promise.all([
    vitrineDoAluno(sessao.tenantId, sessao.estudanteId, slug),
    progressoExtensivo(sessao.tenantId, sessao.estudanteId, ext.id),
    avisosDoProduto(sessao.tenantId, ext.id),
    curriculoDoExtensivo(sessao.tenantId, sessao.estudanteId, ext.id, slug),
    carregarPaginaProduto(ext.id, { estado: previa ? 'rascunho' : 'publicado', tenantId: sessao.tenantId }),
  ])
  if (!vit) notFound()
  const dados = await carregarDadosPagina(ext.id, carregada.pagina, {
    tenantId: sessao.tenantId, estudanteId: sessao.estudanteId, vit, slug, voltar,
    pre: { avisos, progressoSimulados, curriculo },
  })
  if (!dados) notFound()
  // Itens da página (hero, avisos, continuar, progresso, cronograma, módulos, vitrine…) montados NO SERVIDOR.
  const itens = await montarItensPagina(carregada.pagina, dados, sessao.tenantId, sessao.estudanteId)
  const cor = dados.cor
  // Fallback: produto sem vitrine montada → lista simples do que foi liberado.
  // "Acessos incluídos" etc. só quando NÃO há vitrine NEM currículo (era o único conteúdo antes do currículo).
  const semVitrine = vit.secoes.length === 0 && curriculo.length === 0
  const fallback = ext

  return (
    <div className="w-full space-y-6">
      {previa && <FaixaPrevia sairHref={`/aluno/extensivos/${slug}`} />}
      <PaginaAluno itens={itens} dados={dados} />

      {/* Fallback quando a vitrine ainda não foi montada */}
      {semVitrine && fallback && (
        <div className="grid gap-4 md:grid-cols-2">
          {[
            { titulo: 'Simulados', itens: fallback.simulados, href: '/aluno/simulados' },
            { titulo: 'Conteúdo e videoaulas', itens: fallback.pastas.map((p) => p.nome), href: '/aluno/biblioteca' },
            { titulo: 'Cronogramas', itens: fallback.cronogramas, href: '/aluno/cronograma' },
            { titulo: 'Acessos incluídos', itens: fallback.grupos, href: null as string | null },
          ].filter((x) => x.itens.length > 0).map((s) => (
            <div key={s.titulo} className="rounded-2xl border bg-card p-4 shadow-sm">
              <div className="mb-2 flex items-center gap-2"><Layers className="h-4 w-4" style={{ color: cor }} /><h2 className="text-sm font-semibold">{s.titulo}</h2><span className="ml-auto text-xs text-muted-foreground">{s.itens.length}</span></div>
              <ul className="space-y-1">{s.itens.slice(0, 6).map((n, i) => <li key={i} className="truncate text-sm text-muted-foreground">• {String(n)}</li>)}</ul>
              {s.href && <Link href={s.href} className="mt-2 inline-flex items-center gap-1 text-sm font-medium" style={{ color: cor }}>Abrir<ChevronRight className="h-4 w-4" /></Link>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
