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
import { Pencil, BookOpen } from 'lucide-react'
import { QuestoesFilters } from '@/components/admin/questoes-filters'
import { PaginationControls } from '@/components/admin/pagination-controls'
import { CopiarCodigo } from '@/components/admin/copiar-codigo'
import { codigoQuestao } from '@/lib/codigo-questao'
import { NovaQuestaoDialog } from '@/components/admin/nova-questao-dialog'
import { SecaoHeader } from '@/components/admin/secao-header'

const ITEMS_PER_PAGE = 20

interface PageProps {
  searchParams: Promise<{
    page?: string
    q?: string
    disciplina?: string
    dificuldade?: string
    tipo?: string
    status?: string
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
  const q = params.q ?? ''
  const status = params.status ?? ''
  const disciplina = params.disciplina ?? ''
  const dificuldade = params.dificuldade ?? ''
  const tipo = params.tipo ?? ''

  const supabase = await createServiceClient()
  const tenantId = await getCurrentTenantId()

  // Disciplinas do tenant para o filtro (dropdown).
  const { data: disciplinas } = await supabase
    .from('simulado_disciplinas')
    .select('id, nome')
    .eq('tenant_id', tenantId ?? '')
    .order('nome')

  // Busca por código OU enunciado. Tolerante: se a coluna `codigo` ainda não
  // existe (migration pendente), refaz sem ela e busca só por enunciado.
  function montarQuery(comCodigo: boolean) {
    const sel: string = comCodigo
      ? 'id, codigo, enunciado, status, tipo, nivel_dificuldade, ano, disciplinas:simulado_disciplinas(nome), bancas:simulado_bancas(nome)'
      : 'id, enunciado, status, tipo, nivel_dificuldade, ano, disciplinas:simulado_disciplinas(nome), bancas:simulado_bancas(nome)'
    let query = supabase
      .from('simulado_questoes')
      .select(sel, { count: 'exact' })
      .eq('deletado', false)
      .eq('tenant_id', tenantId ?? '')
      .order('created_at', { ascending: false })
      .range((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE - 1)

    if (q) query = comCodigo ? query.or(`enunciado.ilike.%${q}%,codigo.ilike.%${q}%`) : query.ilike('enunciado', `%${q}%`)
    if (status) query = query.eq('status', status)
    if (disciplina) query = query.eq('disciplina_id', disciplina)
    if (dificuldade) query = query.eq('nivel_dificuldade', dificuldade)
    if (tipo) query = query.eq('tipo', tipo)
    return query
  }

  let res = await montarQuery(true)
  if (res.error && /codigo/i.test(res.error.message)) res = await montarQuery(false)
  const questoes = (res.data ?? []) as any[]
  const count = res.count
  const totalPages = Math.ceil((count ?? 0) / ITEMS_PER_PAGE)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Questões</h1>
          <p className="text-muted-foreground">
            {count ?? 0} questões cadastradas
          </p>
        </div>
        <NovaQuestaoDialog />
      </div>

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

      <PaginationControls page={page} totalPages={totalPages} />
    </div>
  )
}
