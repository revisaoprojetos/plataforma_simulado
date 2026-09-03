import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import Link from 'next/link'
import { Suspense } from 'react'
import { buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent } from '@/components/ui/card'
import { Pencil, BookOpen, Merge } from 'lucide-react'
import { cn } from '@/lib/utils'
import { QuestoesFilters } from '@/components/admin/questoes-filters'
import { PaginationControls } from '@/components/admin/pagination-controls'
import { CopiarCodigo } from '@/components/admin/copiar-codigo'
import { codigoQuestao, faixaUuidDoCodigo } from '@/lib/codigo-questao'
import { NovaQuestaoDialog } from '@/components/admin/nova-questao-dialog'
import { ExportQuestoesButton } from '@/components/admin/export-questoes-button'
import { SecaoHeader } from '@/components/admin/secao-header'
import { TaxonomiaUnificacao } from '@/components/admin/taxonomia-unificacao'
import { listarTaxonomia } from './taxonomia-actions'
import { ehTipoTaxonomia } from './taxonomia-tipos'
import { listarUnificacoesRecentes } from './disciplinas-actions'

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

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  publicada: { label: 'Publicada', variant: 'default' },
  rascunho: { label: 'Rascunho', variant: 'outline' },
  arquivada: { label: 'Arquivada', variant: 'secondary' },
}

const dificuldadeLabel: Record<string, string> = {
  facil: 'Fácil',
  medio: 'Médio',
  dificil: 'Difícil',
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

  const tab = (params.tab === 'unificacao' || params.tab === 'disciplinas') ? 'unificacao' : 'questoes'
  const tipoTax = ehTipoTaxonomia(params.tipoTax) ? params.tipoTax : 'disciplina'

  const supabase = await createServiceClient()
  const tenantId = await getCurrentTenantId()

  // ── Aba QUESTÕES: filtro (disciplinas) + lista paginada (só busca aqui) ──
  let disciplinas: { id: string; nome: string }[] = []
  let questoes: any[] = []
  let count: number | null = 0
  let totalPages = 1
  if (tab === 'questoes') {
    const { data: disc } = await supabase
      .from('simulado_disciplinas').select('id, nome')
      .eq('tenant_id', tenantId ?? NADA).order('nome')
    disciplinas = (disc ?? []) as { id: string; nome: string }[]

    // Busca por código OU enunciado. Tolerante: se `codigo` não existir, refaz sem ela.
    const montarQuery = (comCodigo: boolean) => {
      const sel: string = comCodigo
        ? 'id, codigo, enunciado, status, tipo, nivel_dificuldade, ano, disciplinas:simulado_disciplinas(nome), bancas:simulado_bancas(nome)'
        : 'id, enunciado, status, tipo, nivel_dificuldade, ano, disciplinas:simulado_disciplinas(nome), bancas:simulado_bancas(nome)'
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
    let res = await montarQuery(true)
    if (res.error && /codigo/i.test(res.error.message)) res = await montarQuery(false)
    questoes = (res.data ?? []) as any[]
    count = res.count
    totalPages = Math.ceil((count ?? 0) / perPage)
  }

  // ── Aba UNIFICAÇÃO: itens da taxonomia escolhida + (só disciplina) unificações recentes p/ desfazer ──
  const [itensTax, recentesUnif] = tab === 'unificacao'
    ? await Promise.all([
        listarTaxonomia(tipoTax).then((r) => r.itens ?? []),
        tipoTax === 'disciplina' ? listarUnificacoesRecentes().then((r) => r.itens ?? []) : Promise.resolve([] as { id: string; mantida: string; duplicadas: string[]; questoes: number; criado_em: string }[]),
      ])
    : [[], []]

  const tabCls = (ativo: boolean) => cn('flex items-center gap-1.5 border-b-2 px-1 pb-2 font-medium transition-colors', ativo ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Questões</h1>
          <p className="text-muted-foreground">
            {tab === 'questoes' ? `${count ?? 0} questões cadastradas` : `${itensTax.length} item(ns) — mescle os duplicados`}
          </p>
        </div>
        {tab === 'questoes' && (
          <div className="flex items-center gap-2">
            <ExportQuestoesButton filtros={{ q, status, disciplina, dificuldade, tipo }} />
            <NovaQuestaoDialog />
          </div>
        )}
      </div>

      {/* Abas: Questões · Unificação de disciplinas */}
      <div className="flex gap-4 border-b text-sm">
        <Link href="/admin/questoes" className={tabCls(tab === 'questoes')}><BookOpen className="h-4 w-4" /> Questões</Link>
        <Link href="/admin/questoes?tab=unificacao" className={tabCls(tab === 'unificacao')}><Merge className="h-4 w-4" /> Unificação</Link>
      </div>

      {tab === 'unificacao' ? (
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[130px]">Código</TableHead>
                <TableHead>Enunciado</TableHead>
                <TableHead>Disciplina</TableHead>
                <TableHead>Banca</TableHead>
                <TableHead>Dificuldade</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {!questoes || questoes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    Nenhuma questão encontrada.
                  </TableCell>
                </TableRow>
              ) : (
                questoes.map((q) => {
                  const cfg = statusConfig[q.status ?? 'rascunho'] ?? statusConfig.rascunho
                  const enunciado = q.enunciado ?? ''
                  const preview = enunciado.length > 80
                    ? enunciado.slice(0, 80) + '…'
                    : enunciado
                  const disciplina = (q.disciplinas as { nome?: string } | null)?.nome
                  const banca = (q.bancas as { nome?: string } | null)?.nome

                  return (
                    <TableRow key={q.id}>
                      <TableCell>
                        <CopiarCodigo codigo={codigoQuestao(q.id, (q as any).codigo)} />
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <Link href={`/admin/questoes/${q.id}/editar`} className="text-sm line-clamp-2 hover:text-primary hover:underline">{preview}</Link>
                      </TableCell>
                      <TableCell className="text-sm">
                        {disciplina ?? '—'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {banca ?? '—'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {q.nivel_dificuldade ? dificuldadeLabel[q.nivel_dificuldade] ?? q.nivel_dificuldade : '—'}
                      </TableCell>
                      <TableCell className="text-sm capitalize">
                        {q.tipo ?? '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={cfg.variant}>{cfg.label}</Badge>
                      </TableCell>
                      <TableCell>
                        <Link href={`/admin/questoes/${q.id}/editar`} className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <PaginationControls page={page} totalPages={totalPages} perPage={perPage} perPageOptions={PER_PAGE_OPTIONS} />
      </>)}
    </div>
  )
}
