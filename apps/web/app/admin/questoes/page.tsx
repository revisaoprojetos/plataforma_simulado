import { createServiceClient } from '@/lib/supabase/server'
import { CabecalhoArea } from '@/components/admin/cabecalho-area'
import { AbasLinha } from '@/components/ui/abas-linha'
import { getCurrentTenantId } from '@/lib/tenant'
import { isSuperAdmin } from '@/lib/auth/permissions'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { BookOpen, Merge, Tag, Layers } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Suspense } from 'react'
import { QuestoesFiltrosLista } from '@/components/admin/questoes-filtros-lista'
import { listarQuestoes, opcoesQuestoes } from '@/lib/admin-revisao/biblioteca-questoes'
import { paramsDeEstadoQ, type OpcoesQ } from '@/lib/admin-revisao/biblioteca-questoes-tipos'
import { estadoQDeUrlAdmin } from '@/lib/admin-revisao/questoes-lista-url'
import { PaginationControls } from '@/components/admin/pagination-controls'
import { NovaQuestaoDialog } from '@/components/admin/nova-questao-dialog'
import { ExportQuestoesButton } from '@/components/admin/export-questoes-button'
import { QuestoesUnificar } from '../revisao/biblioteca/questoes-unificar'
import { QuestoesEtiquetas } from '../revisao/biblioteca/questoes-etiquetas'
import { ClassificacaoUnificada } from './classificacao-unificada'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { carregarInicialUnificar } from '@/lib/admin-revisao/questoes-unificar'
import { carregarInicialClassificacao } from '@/lib/admin-revisao/questoes-classificacao'
import { carregarInicialEtiquetas } from '@/lib/admin-revisao/questoes-etiquetas'
import { carregarInicialUnificarDisciplinas } from '@/lib/admin-revisao/biblioteca-pastas-unificar'
import { listarDisciplinasClassificacao, listarPastasConteudo } from './disciplinas-actions'
import { QuestoesTabela } from '@/components/admin/questoes-tabela'
import { ehTipoTaxonomia } from './taxonomia-tipos'

const PER_PAGE_OPTIONS = [10, 12, 15, 20]
const PER_PAGE_DEFAULT = 12
const NADA = '00000000-0000-0000-0000-000000000000'

interface PageProps {
  searchParams: Promise<{
    page?: string
    q?: string
    disciplina?: string
    dificuldade?: string
    tipo?: string
    status?: string
    /** filtros multi do card (listas "a|b"): disc, ass, det, banca, orgao, cargo, ano, dif, etq — lidos via estadoQDeUrlAdmin */
    [filtroMulti: string]: string | undefined
    tab?: string
    tipoTax?: string
    pp?: string
  }>
}

export default async function QuestoesPage({ searchParams }: PageProps) {
  const params = await searchParams
  const page = Number(params.page ?? 1)
  const perPage = PER_PAGE_OPTIONS.includes(Number(params.pp)) ? Number(params.pp) : PER_PAGE_DEFAULT
  // Filtros multi-valor ("a|b") + links antigos de valor único; higienizados (uuid/ano/whitelist) no SQL (montarWhere). Código "Q-XXXXXXXX" também é tratado lá.
  const paramsUrl = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (typeof v === 'string' && v) paramsUrl.set(k, v)
  const estado = { ...estadoQDeUrlAdmin(paramsUrl), page: Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1, pp: perPage }
  const q = estado.q
  const qsExport = paramsDeEstadoQ(estado).toString()

  const tab = params.tab === 'etiquetas'
    ? 'etiquetas'
    : params.tab === 'classificacao'
      ? 'classificacao'
      : (params.tab === 'unificacao' || params.tab === 'disciplinas')
        ? 'unificacao'
        : 'questoes'
  const tipoTax = ehTipoTaxonomia(params.tipoTax) ? params.tipoTax : 'disciplina'

  // Super-admin: libera a aba "Plataformas" do "Nova Questão" (importar questões de outro tenant).
  const [supabase, tenantId, podeImportarPlataforma] = await Promise.all([createServiceClient(), getCurrentTenantId(), isSuperAdmin()])

  // ── Aba QUESTÕES: filtro (disciplinas) + lista paginada (só busca aqui) ──
  let opcoesFiltro: OpcoesQ = { bancas: [], orgaos: [], anos: [], etiquetas: [], disciplinas: [] }
  let questoes: Awaited<ReturnType<typeof listarQuestoes>>['rows'] = []
  let count: number | null = 0
  let totalPages = 1
  if (tab === 'questoes') {
    // Lista + total filtrados em SQL agregado (mesmo núcleo da Biblioteca: tenant sempre no $1, multi-valor, busca por código) + opções do card (cache por tenant).
    const [lista, opc] = await Promise.all([
      listarQuestoes(supabase, tenantId ?? NADA, estado),
      opcoesQuestoes(supabase, tenantId ?? NADA).catch(() => opcoesFiltro),
    ])
    opcoesFiltro = opc
    questoes = lista.rows
    count = lista.total
    totalPages = Math.ceil((count ?? 0) / perPage)
  }

  // ── Aba UNIFICAÇÃO: itens da taxonomia escolhida + (só disciplina) unificações recentes p/ desfazer ──
  // As 3 abas abaixo renderizam os MESMOS componentes da Biblioteca (SSR `inicial` só da aba ativa; o resto vai pelas rotas /api/admin/revisao/biblioteca/*).
  const ehGestao = tab !== 'questoes'
  const acesso = ehGestao ? await getCurrentAccess() : null
  const podeEditarQ = !!acesso && accessCan(acesso, 'questoes:update')
  const podeTaxonomia = !!acesso && accessCan(acesso, 'classificacao:manage')
  const podeVerQ = !!acesso && accessCan(acesso, 'questoes:view')
  const podeMateriais = !!acesso && accessCan(acesso, 'configuracoes:update')
  const secaoUnificar = params.tab === 'disciplinas' ? 'disciplinas' as const : (params.tipoTax && ehTipoTaxonomia(params.tipoTax) ? 'termos' as const : undefined)
  const [ssrDup, ssrDisc, ssrClassif, ssrEtiq, discClass, pastasConteudo] = await Promise.all([
    tab === 'unificacao' && tenantId && !secaoUnificar ? carregarInicialUnificar(tenantId).catch(() => null) : null,
    tab === 'unificacao' && tenantId && secaoUnificar === 'disciplinas' ? carregarInicialUnificarDisciplinas(tenantId, 'conteudo').catch(() => null) : null,
    tab === 'classificacao' && tenantId ? carregarInicialClassificacao(tenantId).catch(() => null) : null,
    tab === 'etiquetas' && tenantId ? carregarInicialEtiquetas(tenantId).catch(() => null) : null,
    tab === 'classificacao' ? listarDisciplinasClassificacao().then((r) => (r.ok ? r.itens ?? [] : [])) : [],
    tab === 'classificacao' ? listarPastasConteudo().then((r) => (r.ok ? r.itens ?? [] : [])) : [],
  ])


  return (
    <div className="space-y-5">
      <CabecalhoArea
        titulo="Questões"
        descricao={tab === 'questoes'
              ? `${count ?? 0} questões cadastradas`
              : tab === 'etiquetas'
                ? 'Etiquetas — rótulos para organizar e sinalizar questões'
                : tab === 'classificacao'
                  ? 'Classificação — qualidade, cadastro da taxonomia e disciplinas'
                  : 'Unificação — questões duplicadas, termos, etiquetas e disciplinas'}
        acoes={tab === 'questoes' ? (
          <>
            <ExportQuestoesButton filtros={{ q, status: estado.status, disciplina: estado.disc, dificuldade: estado.dif, tipo: estado.tipo, qs: qsExport }} />
            <NovaQuestaoDialog podeImportarPlataforma={podeImportarPlataforma} />
          </>
        ) : undefined}
        abas={
          <AbasLinha ativo={tab} itens={[
        { key: 'questoes', label: 'Questões', href: '/admin/questoes' },
        { key: 'unificacao', label: 'Unificação', href: '/admin/questoes?tab=unificacao' },
        { key: 'classificacao', label: 'Classificação', href: '/admin/questoes?tab=classificacao' },
        { key: 'etiquetas', label: 'Etiquetas', href: '/admin/questoes?tab=etiquetas' },
      ]} />
        }
      />

      {tab === 'classificacao' ? (
        <ClassificacaoUnificada podeEditar={podeEditarQ} podeTaxonomia={podeTaxonomia} inicial={ssrClassif ?? undefined} disciplinas={discClass} pastas={pastasConteudo} />
      ) : tab === 'etiquetas' ? (
        <QuestoesEtiquetas podeEditar={podeEditarQ} inicial={ssrEtiq} />
      ) : tab === 'unificacao' ? (
        <QuestoesUnificar podeEditar={podeEditarQ} secaoInicial={secaoUnificar} inicial={ssrDup ? { duplicadas: ssrDup } : null}
          disciplinas={{ podeEditarMateriais: podeMateriais, podeTaxonomiaVer: podeVerQ, podeTaxonomiaEditar: podeEditarQ, inicial: ssrDisc }} />
      ) : (
      // marginTop inline vence o space-y-5 do pai (senão o gap de cima ficaria 20px e o de baixo 12px).
      // space-y-3 dá o mesmo respiro (12px) entre linha de filtros ↔ tabela ↔ paginação.
      <div className="space-y-3" style={{ marginTop: '0.75rem' }}>
      <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-1.5">
        <Suspense fallback={<div className="h-10 w-full animate-pulse rounded-lg bg-muted lg:w-[520px]" />}>
          <QuestoesFiltrosLista opcoes={opcoesFiltro} />
        </Suspense>
      </div>

      <Card className="overflow-hidden" style={{ ['--card-spacing' as any]: '0px' }}>
        <CardContent className="p-0">
          <QuestoesTabela questoes={questoes.map((q) => ({
            id: q.id, codigo: q.codigo ?? null, enunciado: q.enunciado ?? '', status: q.status ?? null, tipo: q.tipo ?? null,
            formato: q.formato,
            nivel_dificuldade: q.nivel_dificuldade ?? null, ano: q.ano ?? null, cargo: q.cargo ?? null, assunto_detalhe: q.assuntoDetalhe ?? null,
            disciplina: q.disciplina, assunto: q.assunto, banca: q.banca, orgao: q.orgao,
          }))} />
        </CardContent>
      </Card>

      <PaginationControls page={page} totalPages={totalPages} perPage={perPage} perPageOptions={PER_PAGE_OPTIONS} />
      </div>
      )}
    </div>
  )
}
