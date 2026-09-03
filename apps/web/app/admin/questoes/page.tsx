import { createServiceClient, createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import Link from 'next/link'
import { Suspense } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { BookOpen, Merge, Tag } from 'lucide-react'
import { cn } from '@/lib/utils'
import { QuestoesFilters } from '@/components/admin/questoes-filters'
import { PaginationControls } from '@/components/admin/pagination-controls'
import { faixaUuidDoCodigo } from '@/lib/codigo-questao'
import { NovaQuestaoDialog } from '@/components/admin/nova-questao-dialog'
import { ExportQuestoesButton } from '@/components/admin/export-questoes-button'
import { SecaoHeader } from '@/components/admin/secao-header'
import { TaxonomiaUnificacao } from '@/components/admin/taxonomia-unificacao'
import { QuestoesTabela } from '@/components/admin/questoes-tabela'
import { listarTaxonomia } from './taxonomia-actions'
import { ehTipoTaxonomia } from './taxonomia-tipos'
import { listarUnificacoesRecentes } from './disciplinas-actions'
import { EtiquetasClient } from '../etiquetas/etiquetas-client'
import { listarEtiquetas } from '../etiquetas/actions'

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
    tab?: string
    tipoTax?: string
    pp?: string
  }>
}

export default async function QuestoesPage({ searchParams }: PageProps) {
  const params = await searchParams
  const page = Number(params.page ?? 1)
  const perPage = PER_PAGE_OPTIONS.includes(Number(params.pp)) ? Number(params.pp) : PER_PAGE_DEFAULT
  const q = (params.q ?? '').trim()
  // Se o termo for um código de questão (ex.: "Q-6BA4EF94"), busca pelo id (faixa de UUID).
  const faixaCodigo = q ? faixaUuidDoCodigo(q) : null
  const status = params.status ?? ''
  const disciplina = params.disciplina ?? ''
  const dificuldade = params.dificuldade ?? ''
  const tipo = params.tipo ?? ''

  const tab = params.tab === 'etiquetas'
    ? 'etiquetas'
    : (params.tab === 'unificacao' || params.tab === 'disciplinas')
      ? 'unificacao'
      : 'questoes'
  const tipoTax = ehTipoTaxonomia(params.tipoTax) ? params.tipoTax : 'disciplina'

  const supabase = await createServiceClient()
  const tenantId = await getCurrentTenantId()

  // ── Aba QUESTÕES: filtro (disciplinas) + lista paginada (só busca aqui) ──
  let disciplinas: { id: string; nome: string }[] = []
  let questoes: any[] = []
  let count: number | null = 0
  let totalPages = 1
  const nomeAssunto = new Map<string, string>()
  const nomeOrgao = new Map<string, string>()
  if (tab === 'questoes') {
    const { data: disc } = await supabase
      .from('simulado_disciplinas').select('id, nome')
      .eq('tenant_id', tenantId ?? NADA).order('nome')
    disciplinas = (disc ?? []) as { id: string; nome: string }[]

    // Busca por código OU enunciado. Tolerante: `codigo` e os campos/embeds extras (cargo/assunto
    // específico/assunto/órgão) podem faltar em bases antigas → refaz com um select mínimo.
    const REST = 'enunciado, status, tipo, nivel_dificuldade, ano, disciplinas:simulado_disciplinas(nome), bancas:simulado_bancas(nome)'
    const EXTRAS = ', formato, cargo, assunto_detalhe, assunto_id, orgao_id'
    const montarQuery = (comCodigo: boolean, comExtras: boolean) => {
      const sel: string = (comCodigo ? 'id, codigo, ' : 'id, ') + REST + (comExtras ? EXTRAS : '')
      let query = supabase
        .from('simulado_questoes')
        .select(sel, { count: 'exact' })
        .eq('deletado', false)
        .eq('tenant_id', tenantId ?? NADA)
        .order('created_at', { ascending: false })
        .range((page - 1) * perPage, page * perPage - 1)
      if (faixaCodigo) query = query.gte('id', faixaCodigo.lo).lte('id', faixaCodigo.hi)
      else if (q) query = comCodigo ? query.or(`enunciado.ilike.%${q}%,codigo.ilike.%${q}%`) : query.ilike('enunciado', `%${q}%`)
      if (status) query = query.eq('status', status)
      if (disciplina) query = query.eq('disciplina_id', disciplina)
      if (dificuldade) query = query.eq('nivel_dificuldade', dificuldade)
      if (tipo) query = query.eq('tipo', tipo)
      return query
    }
    let res = await montarQuery(true, true)
    if (res.error && /(formato|cargo|assunto_detalhe|assunto_id|orgao_id)/i.test(res.error.message)) res = await montarQuery(true, false)
    if (res.error && /codigo/i.test(res.error.message)) res = await montarQuery(false, false)
    questoes = (res.data ?? []) as any[]
    count = res.count
    totalPages = Math.ceil((count ?? 0) / perPage)

    // Nomes de Assunto/Órgão via SERVICE ROLE: a taxonomia (simulado_assuntos/orgaos) tem RLS que barra
    // o embed sob a sessão do admin (por isso vinham vazios). Resolve pelos ids presentes na página.
    const admin = createAdminClient()
    const assIds = [...new Set(questoes.map((x) => x.assunto_id).filter(Boolean))]
    const orgIds = [...new Set(questoes.map((x) => x.orgao_id).filter(Boolean))]
    const [assRows, orgRows] = await Promise.all([
      assIds.length ? admin.from('simulado_assuntos').select('id, nome').in('id', assIds) : Promise.resolve({ data: [] as any[] }),
      orgIds.length ? admin.from('simulado_orgaos').select('id, nome').in('id', orgIds) : Promise.resolve({ data: [] as any[] }),
    ])
    for (const a of (assRows.data ?? []) as any[]) nomeAssunto.set(a.id, a.nome)
    for (const o of (orgRows.data ?? []) as any[]) nomeOrgao.set(o.id, o.nome)
  }

  // ── Aba UNIFICAÇÃO: itens da taxonomia escolhida + (só disciplina) unificações recentes p/ desfazer ──
  const [itensTax, recentesUnif] = tab === 'unificacao'
    ? await Promise.all([
        listarTaxonomia(tipoTax).then((r) => r.itens ?? []),
        tipoTax === 'disciplina' ? listarUnificacoesRecentes().then((r) => r.itens ?? []) : Promise.resolve([] as { id: string; mantida: string; duplicadas: string[]; questoes: number; criado_em: string }[]),
      ])
    : [[], []]

  // ── Aba ETIQUETAS: rótulos das questões (movida da sidebar para cá) ──
  const etiquetas = tab === 'etiquetas' ? await listarEtiquetas().then((r) => (r.ok ? r.itens ?? [] : [])) : []

  const tabCls = (ativo: boolean) => cn('flex items-center gap-1.5 border-b-2 px-1 pb-2 font-medium transition-colors', ativo ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Questões</h1>
          <p className="text-muted-foreground">
            {tab === 'questoes'
              ? `${count ?? 0} questões cadastradas`
              : tab === 'etiquetas'
                ? `${etiquetas.length} etiqueta(s) — rótulos para organizar e sinalizar questões`
                : `${itensTax.length} item(ns) — mescle os duplicados`}
          </p>
        </div>
        {tab === 'questoes' && (
          <div className="flex items-center gap-2">
            <ExportQuestoesButton filtros={{ q, status, disciplina, dificuldade, tipo }} />
            <NovaQuestaoDialog />
          </div>
        )}
      </div>

      {/* Abas: Questões · Unificação · Etiquetas */}
      <div className="flex gap-4 border-b text-sm">
        <Link href="/admin/questoes" className={tabCls(tab === 'questoes')}><BookOpen className="h-4 w-4" /> Questões</Link>
        <Link href="/admin/questoes?tab=unificacao" className={tabCls(tab === 'unificacao')}><Merge className="h-4 w-4" /> Unificação</Link>
        <Link href="/admin/questoes?tab=etiquetas" className={tabCls(tab === 'etiquetas')}><Tag className="h-4 w-4" /> Etiquetas</Link>
      </div>

      {tab === 'etiquetas' ? (
        <EtiquetasClient inicial={etiquetas} />
      ) : tab === 'unificacao' ? (
        <TaxonomiaUnificacao tipo={tipoTax} itens={itensTax} recentes={recentesUnif} />
      ) : (<>
      <Card className="overflow-hidden" style={{ ['--card-spacing' as any]: '0px' }}>
        <SecaoHeader
          icon={BookOpen}
          titulo="Questões"
          subtitulo={`${count ?? 0} cadastrada(s)`}
          acao={
            <Suspense fallback={<div className="h-10 w-full animate-pulse rounded-lg bg-muted lg:w-[520px]" />}>
              <QuestoesFilters disciplinas={disciplinas ?? []} />
            </Suspense>
          }
        />
        <CardContent className="p-0">
          <QuestoesTabela questoes={(questoes ?? []).map((q: any) => ({
            id: q.id, codigo: q.codigo ?? null, enunciado: q.enunciado ?? '', status: q.status ?? null, tipo: q.tipo ?? null, formato: q.formato ?? null,
            nivel_dificuldade: q.nivel_dificuldade ?? null, ano: q.ano ?? null, cargo: q.cargo ?? null, assunto_detalhe: q.assunto_detalhe ?? null,
            disciplina: (q.disciplinas as { nome?: string } | null)?.nome ?? null,
            assunto: q.assunto_id ? (nomeAssunto.get(q.assunto_id) ?? null) : null,
            banca: (q.bancas as { nome?: string } | null)?.nome ?? null,
            orgao: q.orgao_id ? (nomeOrgao.get(q.orgao_id) ?? null) : null,
          }))} />
        </CardContent>
      </Card>

      <PaginationControls page={page} totalPages={totalPages} perPage={perPage} perPageOptions={PER_PAGE_OPTIONS} />
      </>)}
    </div>
  )
}
