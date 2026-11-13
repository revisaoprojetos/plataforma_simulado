import Link from 'next/link'
import { Search } from 'lucide-react'
import type { createAdminClient } from '@/lib/supabase/server'
import { KpiCard, KpiGrid, Nota, ParamsInt, ThOrd, hrefCom, type QS } from '../../../_comp/lista'
import { listarMaterias } from '../dados'
import { lerGrade, listarTrilhas } from '../dados-trilhas'
import { AVISO_MIGRACAO, PPS_GRADE, PP_PADRAO_GRADE, type FiltrosGrade } from '../tipos-trilhas'
import { GradeTrilhas } from './grade-trilhas'
import { TrilhasPainel } from './trilhas-painel'

// Aba “Cronogramas”: trilhas (CRUD/importar/recalcular) + grade aulas × trilhas. Só LÊ dados prontos (../dados-trilhas).
// Params: ?produto&vis=cronogramas&q&disc&ord&dir&pag&pps.

const CAMPO = 'h-9 rounded-lg border bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'

export async function AbaCronogramas({ svc, tenantId, produtoId, qs, pathname, podeEditar }: {
  svc: ReturnType<typeof createAdminClient>; tenantId: string; produtoId: string; qs: QS; pathname: string; podeEditar: boolean
}) {
  const pagina = ParamsInt(qs.pag, 1)
  const pp = PPS_GRADE.includes(ParamsInt(qs.pps, PP_PADRAO_GRADE)) ? ParamsInt(qs.pps, PP_PADRAO_GRADE) : PP_PADRAO_GRADE
  const filtros: FiltrosGrade = { q: qs.q, disc: qs.disc, ord: qs.ord, dir: qs.dir === 'desc' ? 'desc' : 'asc' }

  const { migrado, trilhas } = await listarTrilhas(svc, tenantId, produtoId)
  if (!migrado) return <Nota tipo="aviso">{AVISO_MIGRACAO} Até lá esta aba não funciona e nada é gravado.</Nota>

  const [grade, materias] = await Promise.all([
    lerGrade(svc, tenantId, produtoId, trilhas, filtros, pagina, pp),
    listarMaterias(svc, tenantId, produtoId),
  ])
  const ativas = trilhas.filter((t) => t.ativo)
  const comData = trilhas.reduce((s, t) => s + t.aulasComData, 0)
  const preservar = ['aba', 'sub', 'produto', 'vis', 'pps']
  const limpar = hrefCom(pathname, Object.fromEntries(preservar.map((k) => [k, qs[k]])))
  const temFiltro = !!(qs.q || qs.disc)

  return (
    <>
      <KpiGrid cols={4}>
        <KpiCard rotulo="Trilhas ativas" valor={`${ativas.length} de ${trilhas.length}`} />
        <KpiCard rotulo="Aulas na planilha" valor={grade.total.toLocaleString('pt-BR')} />
        <KpiCard rotulo="Datas nos cronogramas de ref." valor={comData.toLocaleString('pt-BR')} />
        <KpiCard rotulo="Trilhas sem regra" valor={trilhas.filter((t) => t.ativo && !t.segmentoIds.length).length} alerta={trilhas.some((t) => t.ativo && !t.segmentoIds.length)} />
      </KpiGrid>

      <TrilhasPainel produtoId={produtoId} trilhas={trilhas} podeEditar={podeEditar} />

      {ativas.length > 0 && (
        <>
          <form method="get" action={pathname} className="mb-3 flex flex-wrap items-center gap-2">
            {preservar.map((k) => qs[k] ? <input key={k} type="hidden" name={k} value={qs[k]} /> : null)}
            <label className="relative min-w-[14rem] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input name="q" defaultValue={qs.q ?? ''} placeholder="Buscar por matéria ou título da aula" autoComplete="off" className={`${CAMPO} w-full pl-8 pr-3`} />
            </label>
            <select name="disc" defaultValue={qs.disc ?? ''} aria-label="Matéria" className={CAMPO}>
              <option value="">Todas as matérias</option>
              {materias.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <button type="submit" className="h-9 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90">Filtrar</button>
            {temFiltro && <Link href={limpar} className="h-9 content-center text-sm text-muted-foreground underline-offset-2 hover:underline">Limpar</Link>}
          </form>

          <GradeTrilhas
            produtoId={produtoId} trilhas={trilhas} linhas={grade.linhas} total={grade.total} page={pagina} pp={pp} filtros={filtros} podeEditar={podeEditar}
            headFixas={<>
              <ThOrd rotulo="Nº" col="ordem" base={pathname} qs={qs} />
              <ThOrd rotulo="Matéria" col="disciplina" base={pathname} qs={qs} />
              <ThOrd rotulo="Aula" col="titulo" base={pathname} qs={qs} />
              <ThOrd rotulo="Data-base atual" col="data" base={pathname} qs={qs} />
            </>}
          />
        </>
      )}
    </>
  )
}
