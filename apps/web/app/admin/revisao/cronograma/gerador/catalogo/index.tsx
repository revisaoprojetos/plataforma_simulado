import Link from 'next/link'
import { Plus, Upload } from 'lucide-react'
import { checkPermission } from '@/lib/auth/permissions'
import { buttonVariants } from '@/components/ui/button'
import { SemPermissao } from '@/components/ui/alert-box'
import { listarCategorias } from '@/app/admin/cronogramas/actions'
import { carregarCatalogo, ORDS_CATALOGO, type OrdCatalogo, type ParamsCatalogo, type StatusFiltro } from '@/lib/revisao/gerador/catalogo'
import { KpiCard, KpiGrid, Nota, ParamsInt, ThFixo, ThOrd, BarraBusca, hrefCom, type QS } from '../../../_comp/lista'
import { DivisoesBotao, TabelaCatalogo } from './tabela-catalogo'

export const dynamic = 'force-dynamic'

const STATUS: StatusFiltro[] = ['todos', 'liberados', 'rascunhos', 'sem_pacote', 'sem_metas', 'invisiveis']
const PPS = [10, 14, 25, 50, 100]
const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ''

export default async function GeradorCatalogo({ sp, tenantId, basePath }: {
  sp: Record<string, string | string[] | undefined>; tenantId: string; basePath: string
}) {
  const base = basePath.split('?')[0]
  const qs: QS = {}
  for (const k of Object.keys(sp)) { const v = um(sp[k]); if (v) qs[k] = v }

  const st = um(sp.status) as StatusFiltro
  const ord = um(sp.ord) as OrdCatalogo
  const pps = Number(um(sp.pps))
  const carga = Number(um(sp.carga))
  const p: ParamsCatalogo = {
    q: um(sp.q).trim().slice(0, 80),
    status: STATUS.includes(st) ? st : 'todos',
    cat: um(sp.cat),
    carga: Number.isFinite(carga) && um(sp.carga) !== '' ? carga : null,
    ord: (ORDS_CATALOGO as readonly string[]).includes(ord) ? ord : 'padrao',
    dir: um(sp.dir) === 'desc' ? 'desc' : 'asc',
    pag: ParamsInt(um(sp.pag), 1),
    pps: PPS.includes(pps) ? pps : 14,
  }

  const [r, cats, podeCriar, podeEditar, podeLiberar, podeExcluir] = await Promise.all([
    carregarCatalogo(tenantId, p),
    listarCategorias(),
    checkPermission('cronogramas:create'),
    checkPermission('cronogramas:update'),
    checkPermission('cronogramas:liberar'),
    checkPermission('cronogramas:delete'),
  ])
  if (!r.ok) return <SemPermissao>{r.error ?? 'Não foi possível carregar o catálogo.'}</SemPermissao>
  const categorias = cats.itens ?? []

  const chip = (v: StatusFiltro, rotulo: string, n: number) => (
    <Link key={v} href={hrefCom(base, qs, { status: v === 'todos' ? undefined : v, pag: undefined })}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors ${p.status === v ? 'border-transparent bg-primary text-primary-foreground' : 'bg-card hover:bg-muted'}`}>
      {rotulo}<span className="text-xs tabular-nums opacity-70">{n}</span>
    </Link>
  )

  const head = (
    <>
      <ThOrd rotulo="Cronograma" col="nome" base={base} qs={qs} />
      <ThOrd rotulo="Status" col="status" base={base} qs={qs} />
      <ThFixo>Divisão</ThFixo>
      <ThOrd rotulo="Carga" col="carga" base={base} qs={qs} />
      <ThOrd rotulo="Semanas" col="semanas" base={base} qs={qs} />
      <ThOrd rotulo="Metas" col="metas" base={base} qs={qs} align="right" />
      <ThOrd rotulo="Pacotes" col="pacotes" base={base} qs={qs} align="right" />
      <ThFixo align="right">Ações</ThFixo>
    </>
  )

  return (
    <div className="animate-page">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <p className="min-w-0 max-w-3xl text-sm text-muted-foreground">
          O catálogo que o aluno escolhe. Cada cronograma é uma grade fixa de semanas; o aluno informa a data de início e o sistema reprograma a grade para ele.
        </p>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <DivisoesBotao categorias={categorias} podeEditar={podeEditar} />
          {podeCriar && <Link href="/admin/cronogramas/importar" className={buttonVariants({ variant: 'outline' })}><Upload />Importar modelo</Link>}
          {podeCriar && <Link href="/admin/cronogramas/criar" className={buttonVariants()}><Plus />Novo cronograma</Link>}
        </div>
      </div>

      <KpiGrid>
        <KpiCard rotulo="No catálogo" valor={r.kpis.todos} />
        <KpiCard rotulo="Liberados" valor={r.kpis.liberados} />
        <KpiCard rotulo="Rascunhos" valor={r.kpis.rascunhos} />
        <KpiCard rotulo="Sem metas" valor={r.kpis.semMetas} alerta={r.kpis.semMetas > 0} />
      </KpiGrid>

      {r.kpis.invisiveis > 0 && p.status !== 'invisiveis' && (
        <Nota tipo="aviso">
          {r.kpis.invisiveis} cronograma(s) liberado(s) fora de qualquer pacote — nenhum aluno recebe.{' '}
          <Link className="font-medium underline" href={hrefCom(base, qs, { status: 'invisiveis', pag: undefined })}>Ver quais</Link>
        </Nota>
      )}

      <BarraBusca base={base} qs={qs} placeholder="Buscar por nome (várias palavras)…" preservar={['aba', 'sub', 'pps', 'ord', 'dir']}
        filtros={[
          { nome: 'cat', rotulo: 'Todas as divisões', opcoes: [{ v: 'sem', l: 'Sem divisão' }, ...categorias.map((c) => ({ v: c.id, l: c.nome }))] },
          { nome: 'carga', rotulo: 'Toda carga', opcoes: r.cargas.map((h) => ({ v: String(h), l: `${h}h por dia` })) },
        ]} />
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {chip('todos', 'Todos', r.kpis.todos)}
        {chip('liberados', 'Liberados', r.kpis.liberados)}
        {chip('rascunhos', 'Rascunhos', r.kpis.rascunhos)}
        {chip('sem_pacote', 'Sem pacote', r.kpis.semPacote)}
        {chip('sem_metas', 'Sem metas', r.kpis.semMetas)}
        {chip('invisiveis', 'Liberados sem pacote', r.kpis.invisiveis)}
      </div>

      <TabelaCatalogo head={head} itens={r.itens} total={r.total} page={p.pag} pp={p.pps} categorias={categorias}
        perm={{ liberar: podeLiberar, editar: podeEditar, excluir: podeExcluir }}
        vazio={r.kpis.todos === 0 ? 'Nenhum cronograma no catálogo. Crie um ou importe um modelo.' : 'Nenhum cronograma com esses filtros.'} />
    </div>
  )
}
