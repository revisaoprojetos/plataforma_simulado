import Link from 'next/link'
import { Search } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/server'
import { checkPermission } from '@/lib/auth/permissions'
import { SemPermissao } from '@/components/ui/alert-box'
import { KpiCard, KpiGrid, Nota, ParamsInt, ThFixo, ThOrd, hrefCom, type QS } from '../../_comp/lista'
import { lerAulasProduto, lerCfg, lerResumo, listarMaterias, listarPagina, listarProdutos } from './dados'
import { ConfigPainel, SeletorProduto } from './config-painel'
import { TabelaLiberacao } from './tabela-liberacao'
import { dataBr, PPS_LIBERACAO, PP_PADRAO_LIBERACAO, type FiltrosLiberacao } from './tipos'
import { VIS_LIBERACAO, type VisLiberacao } from './tipos-trilhas'
import { hrefMapaRegras } from '@/lib/produtos/mapa-regras-tipos'
import { AbaCronogramas } from './cronogramas/aba-cronogramas'
import { AbaRegras } from './regras/aba-regras'
import AlunosExcecoesLog from './alunos'

// Sub-aba "Liberação de aulas" do Gerador de Cronograma: consulta e edição da data em que cada aula do extensivo
// abre para o aluno. Navegação interna por ?vis= (aulas | cronogramas | regras | alunos | excecoes | log). Só LÊ dados prontos (./dados): filtro, ordenação e paginação no banco. Param: ?produto=…&q&disc&vinc&ativo&de&ate&ord&dir&pag&pps.

type SP = Record<string, string | string[] | undefined>
const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CAMPO = 'h-9 rounded-lg border bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'

export default async function GeradorLiberacaoAulas({ sp, tenantId, basePath }: { sp: SP; tenantId: string; basePath: string }) {
  const [pathname, queryBase = ''] = basePath.split('?')
  const qs: QS = {}
  for (const [k, v] of new URLSearchParams(queryBase)) qs[k] = v
  for (const [k, v] of Object.entries(sp)) { const s = um(v); if (s) qs[k] = s }

  const [pode, podeEditar] = await Promise.all([checkPermission('cronogramas:view'), checkPermission('cronogramas:update')])
  if (!pode) return <SemPermissao>Você não tem permissão para ver a liberação de aulas.</SemPermissao>

  const svc = createAdminClient()
  const produtos = await listarProdutos(svc, tenantId)
  const produtoId = qs.produto && UUID_RE.test(qs.produto) && produtos.some((p) => p.id === qs.produto) ? qs.produto : ''

  const seletor = (
    <div className="flex flex-wrap items-center justify-between gap-x-4">
      <SeletorProduto produtos={produtos} atual={produtoId} />
      {produtoId && <Link href={hrefMapaRegras(produtoId)} className="mb-4 text-sm font-medium text-primary hover:underline">Ver mapa de regras deste produto</Link>}
    </div>
  )
  if (!produtoId) {
    return (
      <div className="w-full">
        {seletor}
        <Nota tipo="info">{produtos.length ? 'Escolha um produto para consultar e editar a liberação das aulas dos módulos dele.' : 'Nenhum produto cadastrado neste tenant.'}</Nota>
      </div>
    )
  }

  const vis: VisLiberacao = VIS_LIBERACAO.some((v) => v.id === qs.vis) ? (qs.vis as VisLiberacao) : 'aulas'
  const manter = ['aba', 'sub', 'produto', 'pps']
  const abas = (
    <nav role="tablist" aria-label="Liberação de aulas" className="mb-4 flex flex-wrap gap-x-5 border-b">
      {VIS_LIBERACAO.map((v) => (
        <Link key={v.id} role="tab" aria-selected={vis === v.id} href={hrefCom(pathname, Object.fromEntries(manter.map((k) => [k, qs[k]])), { vis: v.id === 'aulas' ? undefined : v.id })}
          className={`-mb-px border-b-2 px-1 pb-2.5 text-sm font-medium transition-colors ${vis === v.id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
          {v.titulo}
        </Link>
      ))}
    </nav>
  )
  if (vis === 'cronogramas') return <div className="w-full">{seletor}{abas}<AbaCronogramas svc={svc} tenantId={tenantId} produtoId={produtoId} qs={qs} pathname={pathname} podeEditar={podeEditar} /></div>
  if (vis === 'regras') return <div className="w-full">{seletor}{abas}<AbaRegras svc={svc} tenantId={tenantId} produtoId={produtoId} podeEditar={podeEditar} /></div>
  if (vis === 'alunos' || vis === 'excecoes' || vis === 'log') return <div className="w-full">{seletor}{abas}<AlunosExcecoesLog produtoId={produtoId} vis={vis} sp={sp} basePath={basePath} /></div>

  const dir = qs.dir === 'desc' ? 'desc' : 'asc'
  const pagina = ParamsInt(qs.pag, 1)
  const pp = PPS_LIBERACAO.includes(ParamsInt(qs.pps, PP_PADRAO_LIBERACAO)) ? ParamsInt(qs.pps, PP_PADRAO_LIBERACAO) : PP_PADRAO_LIBERACAO
  const filtros: FiltrosLiberacao = {
    q: qs.q, disc: qs.disc, vinc: qs.vinc === 'sim' || qs.vinc === 'nao' ? qs.vinc : undefined, ativo: qs.ativo === 'sim' || qs.ativo === 'nao' ? qs.ativo : undefined,
    de: qs.de, ate: qs.ate, ord: qs.ord, dir,
  }

  const [{ migrado, cfg }, resumo, lista, materias, produtoAulas] = await Promise.all([
    lerCfg(svc, tenantId, produtoId),
    lerResumo(svc, tenantId, produtoId),
    listarPagina(svc, tenantId, produtoId, filtros, pagina, pp),
    listarMaterias(svc, tenantId, produtoId),
    lerAulasProduto(svc, tenantId, produtoId),
  ])
  const tabelasOk = migrado && lista.migrado && resumo !== null
  const editavel = podeEditar && tabelasOk

  const preservar = ['aba', 'sub', 'produto', 'pps']
  const limpar = hrefCom(pathname, Object.fromEntries(preservar.map((k) => [k, qs[k]])))
  const temFiltro = !!(qs.q || qs.disc || qs.vinc || qs.ativo || qs.de || qs.ate)

  return (
    <div className="w-full">
      {seletor}
      {abas}
      {!tabelasOk && <Nota tipo="aviso">As tabelas da liberação de aulas ainda não existem neste banco: aplique a migração 20261117010000_produto_liberacao_aulas.sql (e recarregue o schema). Até lá esta aba fica somente para consulta e nada é gravado.</Nota>}

      <KpiGrid cols={4}>
        <KpiCard rotulo="Aulas na planilha" valor={(resumo?.total ?? 0).toLocaleString('pt-BR')} />
        <KpiCard rotulo="Vinculadas a aula do produto" valor={(resumo?.vinculadas ?? 0).toLocaleString('pt-BR')} />
        <KpiCard rotulo="Sem vínculo" valor={(resumo?.semVinculo ?? 0).toLocaleString('pt-BR')} alerta={(resumo?.semVinculo ?? 0) > 0} />
        <KpiCard rotulo="Já liberadas hoje" valor={`${(resumo?.jaLiberadas ?? 0).toLocaleString('pt-BR')} de ${(resumo?.total ?? 0).toLocaleString('pt-BR')}`} />
      </KpiGrid>
      {resumo?.proxima && (
        <p className="-mt-2 mb-4 text-sm text-muted-foreground">Próxima a liberar: <b className="text-foreground">{dataBr(resumo.proxima.data)}</b> · {resumo.proxima.disciplina} — {resumo.proxima.titulo}</p>
      )}

      <ConfigPainel key={produtoId + JSON.stringify(cfg)} produtoId={produtoId} inicial={cfg} podeEditar={podeEditar} migrado={tabelasOk} />

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
        <select name="vinc" defaultValue={qs.vinc ?? ''} aria-label="Vínculo" className={CAMPO}>
          <option value="">Vinculadas e sem vínculo</option>
          <option value="sim">Só vinculadas</option>
          <option value="nao">Só sem vínculo</option>
        </select>
        <select name="ativo" defaultValue={qs.ativo ?? ''} aria-label="Situação" className={CAMPO}>
          <option value="">Ativas e inativas</option>
          <option value="sim">Só ativas</option>
          <option value="nao">Só inativas</option>
        </select>
        <label className="flex items-center gap-1 text-xs text-muted-foreground">De<input type="date" name="de" defaultValue={qs.de ?? ''} className={CAMPO} /></label>
        <label className="flex items-center gap-1 text-xs text-muted-foreground">até<input type="date" name="ate" defaultValue={qs.ate ?? ''} className={CAMPO} /></label>
        <button type="submit" className="h-9 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90">Filtrar</button>
        {temFiltro && <Link href={limpar} className="h-9 content-center text-sm text-muted-foreground underline-offset-2 hover:underline">Limpar</Link>}
      </form>

      <TabelaLiberacao
        produtoId={produtoId} linhas={lista.linhas} total={lista.total} page={pagina} pp={pp} podeEditar={editavel}
        aulas={produtoAulas.aulas} materias={materias} filtros={filtros}
        head={<>
          <ThOrd rotulo="Nº" col="ordem" base={pathname} qs={qs} />
          <ThOrd rotulo="Liberação" col="data" base={pathname} qs={qs} />
          <ThFixo>Dia</ThFixo>
          <ThOrd rotulo="Matéria" col="disciplina" base={pathname} qs={qs} />
          <ThOrd rotulo="Aula" col="numero" base={pathname} qs={qs} />
          <ThOrd rotulo="Título" col="titulo" base={pathname} qs={qs} />
          <ThOrd rotulo="Aparece primeiro em" col="cronograma" base={pathname} qs={qs} />
          <ThOrd rotulo="Semana" col="semana" base={pathname} qs={qs} />
          <ThOrd rotulo="Aula vinculada" col="vinculo" base={pathname} qs={qs} />
          <ThOrd rotulo="Situação" col="ativo" base={pathname} qs={qs} />
          {editavel && <ThFixo>Ações</ThFixo>}
        </>}
      />
    </div>
  )
}
