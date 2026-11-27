import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ChevronRight } from 'lucide-react'
import { checkPermission } from '@/lib/auth/permissions'
import { getCurrentTenantId } from '@/lib/tenant'
import { createAdminClient } from '@/lib/supabase/server'
import { SemAcessoArea } from '@/app/admin/conteudos/_components/sem-acesso-area'
import { CabecalhoArea } from '@/components/admin/cabecalho-area'
import { AbasLinha } from '@/components/ui/abas-linha'
import { ABAS_DETALHE, abaDetalheValida, origemDocValida, sortDocsValido } from '@/lib/conteudo/classificacao/detalhe'
import {
  carregarDetalhe, carregarRegrasDaClassificacao, listarDocumentosDaClasse, listarHistoricoDaClasse, listarPastasDaClasse,
  listarPendenciasDaClasse,
} from '@/lib/conteudo/classificacao/detalhe-server'
import { Bolinha, ROTULO_PAPEL, Selo, hrefDetalhe, voltarSeguro } from '../classificacao-comuns'
import { AbaDocumentos } from './aba-documentos'
import { AbaRegras } from './aba-regras'
import { AbaHistorico, AbaPastas, AbaPendencias } from './abas-listas'
import { CabecalhoAcoes } from './cabecalho-acoes'
import { EdicaoClassificacao } from './edicao-classificacao'

export const metadata: Metadata = { title: 'Classificação' }
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PP = [10, 25, 50, 100]
const fmt = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('pt-BR'))

// PÁGINA DA CLASSIFICAÇÃO (área interna). ?aba=visao|exibicao|regras|documentos|pastas|pendencias|historico
// Backend-first: o cabeçalho (1 linha + uso) carrega sempre; cada aba busca SÓ o seu (paginado .range()/SQL com count). O client só exibe
// e chama as rotas /api/admin/biblioteca/classificacao/{tipos,regras-uso,[id]}.
export default async function ClassificacaoDetalhePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  if (!(await checkPermission('configuracoes:view'))) return <SemAcessoArea />
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return <SemAcessoArea mensagem="Tenant não resolvido." />
  const { id } = await params
  if (!UUID.test(id)) notFound()
  const sp = await searchParams
  const svc = createAdminClient()
  const det = await carregarDetalhe(svc, tenantId, id)
  if (!det) notFound()
  const { tipo } = det
  const aba = abaDetalheValida(sp.aba)
  const podeEditar = await checkPermission('configuracoes:update')
  const pp = PP.includes(Number(sp.pp)) ? Number(sp.pp) : 10
  const page = Math.max(1, Number(sp.page ?? 1) || 1)
  const dir = sp.dir === 'desc' ? 'desc' : 'asc'
  const q = (sp.q ?? '').trim()
  const voltar = voltarSeguro(sp.voltar)
  const voltarHref = voltar ?? '/admin/biblioteca/classificacao'

  let corpo: React.ReactNode
  if (aba === 'visao') {
    const u = tipo.uso
    const cartoes = [
      { r: 'Documentos', n: u?.documentos, aba: 'documentos' }, { r: 'Pastas (marcadas)', n: u?.pastas, aba: 'pastas' },
{ r: 'Áreas com regras', n: u?.regras, aba: 'regras' },
    ]
    corpo = (
      <div className="w-full space-y-4">
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Resumo de uso">
          {cartoes.map((c) => (
            <Link key={c.r} href={`${hrefDetalhe(id, c.aba, voltar ?? undefined)}`} className="rounded-xl border bg-card p-4 transition-colors hover:bg-muted/40">
              <span className="block text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">{c.r}</span>
              <span className="mt-1 block text-[26px] font-extrabold leading-none tabular-nums">{fmt(c.n)}</span>
            </Link>
          ))}
        </section>
        {!u && <p className="text-[13px] text-muted-foreground">A contagem de uso não está disponível agora (SQL direto desligado). Apagar fica bloqueado; arquivar funciona.</p>}
        <EdicaoClassificacao tipo={tipo} secao="visao" podeEditar={podeEditar} />
      </div>
    )
  } else if (aba === 'exibicao') {
    corpo = <EdicaoClassificacao tipo={tipo} secao="exibicao" podeEditar={podeEditar} />
  } else if (aba === 'regras') {
    corpo = <AbaRegras matriz={await carregarRegrasDaClassificacao(svc, tenantId, id)} classId={id} outras={det.outras} podeEditar={podeEditar} />
  } else if (aba === 'documentos') {
    const dados = await listarDocumentosDaClasse(svc, tenantId, id, { q, pastaId: sp.pasta, origem: origemDocValida(sp.origem), sort: sortDocsValido(sp.sort), dir, page, pp })
    corpo = <AbaDocumentos dados={dados} classId={id} nome={tipo.nome} outras={det.outras} podeEditar={podeEditar} pp={pp} />
  } else if (aba === 'pastas') {
    const pastas = await listarPastasDaClasse(svc, tenantId, id, { q, sort: sp.sort === 'origem' ? 'origem' : 'nome', dir, page, pp })
    corpo = <AbaPastas pastas={pastas} pp={pp} />
  } else if (aba === 'pendencias') {
    const dados = await listarPendenciasDaClasse(svc, tenantId, { id, slug: tipo.slug }, { page, pp })
    corpo = <AbaPendencias dados={dados} classId={id} nome={tipo.nome} podeEditar={podeEditar} pp={pp} />
  } else {
    const dados = await listarHistoricoDaClasse(svc, tenantId, id, { op: sp.op, escopo: sp.escopo, page, pp: [10, 25, 50].includes(pp) ? pp : 25 })
    corpo = <AbaHistorico dados={dados} pp={[10, 25, 50].includes(pp) ? pp : 25} />
  }

  const badge = (k: string) => (k === 'documentos' ? fmt(tipo.uso?.documentos) : undefined)
  return (
    <div className="w-full space-y-5">
      <nav aria-label="Trilha" className="flex flex-wrap items-center gap-1 text-[13px] text-muted-foreground">
        <Link href={voltarHref} className="mr-2 inline-flex h-8 items-center gap-1 rounded-lg border bg-card px-2.5 text-[12px] font-medium text-foreground hover:bg-muted"><ArrowLeft className="h-3.5 w-3.5" aria-hidden />Voltar</Link>
        <Link href={voltarHref} className="hover:text-foreground hover:underline">Classificação</Link>
        <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        <span className="font-medium text-foreground" aria-current="page">{tipo.nome}</span>
      </nav>
      <CabecalhoArea
        eyebrow={null}
        semBarraSetor
        titulo={tipo.nome}
        descricao={(
          <span className="flex flex-wrap items-center gap-1.5">
            <Bolinha cor={tipo.cor} />
            <span className="text-foreground">{ROTULO_PAPEL[tipo.papel] ?? tipo.papel}</span>
            {tipo.ativo ? <Selo cls="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">Ativa</Selo> : <Selo cls="bg-muted text-muted-foreground">Arquivada</Selo>}
            <Selo cls={tipo.sistema ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}>{tipo.sistema ? 'Modelo-base' : 'Personalizada'}</Selo>
            <span className="text-[12px]">{tipo.slug}</span>
          </span>
        )}
        acoes={<CabecalhoAcoes id={id} nome={tipo.nome} ativo={tipo.ativo} sistema={tipo.sistema} versao={tipo.versao} anteriorId={det.anteriorId} proximoId={det.proximoId} bloqueioApagar={det.bloqueioApagar} podeEditar={podeEditar} />}
        abas={<AbasLinha aria-label="Seções da classificação" ativo={aba} itens={ABAS_DETALHE.map((a) => ({ key: a.key, label: a.label, href: hrefDetalhe(id, a.key, voltar ?? undefined), badge: badge(a.key), prefetch: false }))} />}
      />
      {corpo}
    </div>
  )
}
