import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BookOpen } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/server'
import { checkPermission, getCurrentAccess } from '@/lib/auth/permissions'
import { SemPermissao } from '@/components/ui/alert-box'
import { buttonVariants } from '@/components/ui/button'
import { RevisaoAbas, RevisaoCard, RevisaoHead } from '@/components/admin/revisao/ui'
import { formatBrt } from '@/lib/brt'
import { crAlteradas, crHm } from '@/lib/revisao/cronograma-schema'
import { lerCfgMetas } from '@/lib/cronograma/adaptativo/config-metas'
import {
  listarGerador, listarSprints, listarVersoes, lerRegras, montarCobertura, paginarCobertura, paginarDisciplinas, preencherQuestoes, resumoExportacao, totalVersoes, valoresDoMotor,
  type BaseCobertura, type PaginaDisciplinas,
} from '@/lib/revisao/cronograma'
import { BarraBusca, KpiCard, KpiGrid, Nota, ParamsInt, Pilula, ThFixo, ThOrd, type QS } from '../_comp/lista'
import { TabelaCron } from './tabela-cron'
import { RegrasClient } from './regras-client'
import {
  AdicionarDisciplina, CarregarVersao, ConfigIO, DiscSwitch, ExcluirSprint, RemoverDisciplina, SalvarVersaoBotao, SprintDialogo,
} from './acoes-client'

export const dynamic = 'force-dynamic'
import GeradorCatalogo from './gerador/catalogo'
import GeradorMetas from './gerador/metas'
import GeradorConteudos from './gerador/conteudos'
import GeradorAcessos from './gerador/acessos'
import GeradorImportacao from './gerador/importacao'
import GeradorRelatorios from './gerador/relatorios'
import GeradorLiberacao from './gerador/liberacao'
import GeradorLiberacaoAulas from './liberacao-aulas'

// Cronograma — admin "Plataforma Revisão". Só LÊ dados prontos (lib/revisao/cronograma).
// Navegação em 2 níveis por query string: `?aba=<gerador|adaptativo>&sub=<sub-aba>`. Busca/filtro/ordenação/paginação
// (`q`, `ord`, `dir`, `pag`, `pps`) também por query string, resolvidos no servidor.

const BASE = '/admin/revisao/cronograma'

type AbaPrincipal = 'gerador' | 'adaptativo'
type SubAdaptativo = 'mat' | 'disc' | 'regras' | 'sprint' | 'ver' | 'faixas' | 'especial'
type SubGerador = 'catalogo' | 'metas' | 'conteudos' | 'acessos' | 'importacao' | 'relatorios' | 'liberacao' | 'liberacao-aulas'
const SUBS_ADAPTATIVO: SubAdaptativo[] = ['mat', 'disc', 'regras', 'sprint', 'ver', 'faixas', 'especial']
const SUBS_GERADOR: SubGerador[] = ['catalogo', 'metas', 'conteudos', 'acessos', 'importacao', 'relatorios', 'liberacao', 'liberacao-aulas']
const TITULOS_GERADOR: Record<SubGerador, string> = { catalogo: 'Catálogo', metas: 'Metas', conteudos: 'Conteúdos', acessos: 'Acessos', importacao: 'Importação', relatorios: 'Relatórios', liberacao: 'Liberação', 'liberacao-aulas': 'Liberação de aulas' }
const PPS = [10, 14, 25, 50, 100]
const PP_PADRAO = 14 // mesmo padrão da Biblioteca
const porPagina = (v: string | undefined) => { const n = ParamsInt(v, PP_PADRAO); return PPS.includes(n) ? n : PP_PADRAO }

export default async function CronogramaRevisaoPage({ searchParams }: { searchParams: Promise<QS> }) {
  const sp = await searchParams

  // Links antigos (?aba=mat|disc|regras|sprint|ver) → nova estrutura (?aba=adaptativo&sub=…).
  if (SUBS_ADAPTATIVO.includes(sp.aba as SubAdaptativo)) {
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries(sp)) if (v && k !== 'aba' && k !== 'sub') q.set(k, v)
    q.set('aba', 'adaptativo'); q.set('sub', sp.aba as string)
    redirect(`${BASE}?${q.toString()}`)
  }

  // Faixas/semana especial/prévia eram sub-abas do Gerador na 1ª versão: agora vivem no Adaptativo.
  if (sp.aba === 'gerador' && (sp.sub === 'faixas' || sp.sub === 'especial' || sp.sub === 'previa')) {
    redirect(`${BASE}?aba=adaptativo&sub=${sp.sub === 'previa' ? 'regras' : sp.sub}`)
  }

  const aba: AbaPrincipal = sp.aba === 'gerador' ? 'gerador' : 'adaptativo'
  const subAd: SubAdaptativo = SUBS_ADAPTATIVO.includes(sp.sub as SubAdaptativo) ? (sp.sub as SubAdaptativo) : 'mat'
  const subGe: SubGerador = SUBS_GERADOR.includes(sp.sub as SubGerador) ? (sp.sub as SubGerador) : 'catalogo'
  const sub: string = aba === 'gerador' ? subGe : subAd

  const [pode, podeEditar, access] = await Promise.all([checkPermission('cronogramas:view'), checkPermission('cronogramas:update'), getCurrentAccess()])
  if (!pode || !access.tenantId) {
    return <div className="w-full space-y-4"><h1 className="text-2xl font-bold tracking-tight">Cronograma</h1><SemPermissao>Você não tem permissão para acessar o cronograma.</SemPermissao></div>
  }
  const svc = createAdminClient()
  const tenantId = access.tenantId

  // Gerador (cronograma padrão): cada sub-aba é um server component próprio; não carrega a base do Adaptativo.
  if (aba === 'gerador') {
    const basePath = `${BASE}?aba=gerador&sub=${subGe}`
    const props = { sp: sp as Record<string, string | undefined>, tenantId, basePath }
    return (
      <div className="w-full">
        <RevisaoHead
          secao="Pedagógico"
          titulo="Cronograma"
          subtitulo="O cronograma padrão da plataforma: catálogo, metas, conteúdos, acessos, importação, relatórios e liberação. O aluno gera o próprio cronograma a partir do catálogo."
        />
        <RevisaoAbas base={BASE} atual={aba} abas={[{ id: 'gerador', titulo: 'Gerador de Cronograma' }, { id: 'adaptativo', titulo: 'Cronograma Adaptativo' }]} />
        <RevisaoAbas base={BASE} atual={subGe} param="sub" extra={{ aba }} abas={SUBS_GERADOR.map((id) => ({ id, titulo: TITULOS_GERADOR[id] }))} />
        {subGe === 'catalogo' && <GeradorCatalogo {...props} />}
        {subGe === 'metas' && <GeradorMetas {...props} />}
        {subGe === 'conteudos' && <GeradorConteudos {...props} />}
        {subGe === 'acessos' && <GeradorAcessos {...props} />}
        {subGe === 'importacao' && <GeradorImportacao {...props} />}
        {subGe === 'relatorios' && <GeradorRelatorios {...props} />}
        {subGe === 'liberacao' && <GeradorLiberacao {...props} />}
        {subGe === 'liberacao-aulas' && <GeradorLiberacaoAulas {...props} />}
      </div>
    )
  }

  const regras = await lerRegras(svc, tenantId)
  let base: BaseCobertura
  try {
    base = await montarCobertura(svc, tenantId, regras.valores)
  } catch {
    return (
      <div className="w-full">
        <RevisaoHead secao="Pedagógico" titulo="Cronograma" />
        <Nota tipo="aviso">Não foi possível ler o catálogo do cronograma agora. Tente novamente em instantes.</Nota>
      </div>
    )
  }
  const alteradas = crAlteradas(regras.valores)
  const naDisc = aba === 'adaptativo' && subAd === 'disc'
  const [discs, nVersoes] = await Promise.all([
    paginarDisciplinas(svc, tenantId, {
      q: naDisc ? sp.q : undefined, situ: naDisc ? sp.situ : undefined, ordem: sp.ord, dir: sp.dir === 'desc' ? 'desc' : 'asc',
      pagina: naDisc ? ParamsInt(sp.pag, 1) : 1, porPagina: porPagina(sp.pps),
    }),
    totalVersoes(svc, tenantId),
  ])
  const ritmo = Number(regras.valores.ritmoPadrao) || 17

  const qs: QS = { aba, sub, q: sp.q, disc: sp.disc, situ: sp.situ, ord: sp.ord, dir: sp.dir, pag: sp.pag, status: sp.status, pps: sp.pps }

  return (
    <div className="w-full">
      <RevisaoHead
        secao="Pedagógico"
        titulo="Cronograma"
        subtitulo="O cronograma monta as metas de cada aluno a partir dos materiais e das regras cadastrados aqui. As regras começam com os valores do Cronograma Adaptativo 2.0."
        acoes={<>
          <Link href="/admin/biblioteca" className="inline-flex h-9 items-center gap-2 rounded-lg border bg-card px-3 text-sm font-medium hover:bg-accent"><BookOpen className="h-4 w-4" />Abrir a Biblioteca</Link>
          <SalvarVersaoBotao podeEditar={podeEditar} />
        </>}
      />
      <KpiGrid>
        <KpiCard rotulo="Aulas no cronograma" valor={base.kpis.aulas} />
        <KpiCard rotulo="Páginas de PDFull" valor={base.kpis.paginas.toLocaleString('pt-BR')} />
        <KpiCard rotulo="Materiais pendentes" valor={base.kpis.pendentes} alerta={base.kpis.pendentes > 0} />
        <KpiCard rotulo="Regras diferentes do 2.0" valor={alteradas.length} />
      </KpiGrid>
      <RevisaoAbas base={BASE} atual={aba} abas={[{ id: 'gerador', titulo: 'Gerador de Cronograma' }, { id: 'adaptativo', titulo: 'Cronograma Adaptativo' }]} />
      {aba === 'adaptativo' ? (
        <RevisaoAbas base={BASE} atual={sub} param="sub" extra={{ aba }} abas={[
          { id: 'mat', titulo: 'Cobertura das aulas', contagem: base.kpis.pendentes },
          { id: 'disc', titulo: 'Disciplinas', contagem: discs.totalGeral },
          { id: 'regras', titulo: 'Regras do cronograma', contagem: alteradas.length },
          { id: 'sprint', titulo: 'Sprints' },
          { id: 'ver', titulo: 'Versões e exportação', contagem: nVersoes },
          { id: 'faixas', titulo: 'Faixas de horas' },
          { id: 'especial', titulo: 'Semana especial' },
        ]} />
      ) : null}

      {!regras.migrado && aba === 'adaptativo' && <Nota tipo="aviso">As regras, disciplinas editadas, versões e sprints deste painel dependem da migração 20261112050000_revisao_cronograma_duvidas.sql, ainda não aplicada neste banco. Enquanto isso, a cobertura das aulas funciona normalmente e as regras mostram os valores do motor e os padrões do 2.0 (sem salvar).</Nota>}
      {subAd === 'faixas' || subAd === 'especial' ? <AbaGerador grupo={subAd} svc={svc} tenantId={tenantId} qs={qs} /> : null}
      {aba === 'adaptativo' && subAd === 'mat' && <AbaCobertura base={base} qs={qs} ritmo={ritmo} svc={svc} tenantId={tenantId} podeEditar={podeEditar} />}
      {aba === 'adaptativo' && subAd === 'disc' && <AbaDisciplinas pg={discs} qs={qs} podeEditar={podeEditar} />}
      {aba === 'adaptativo' && subAd === 'regras' && <RegrasClient inicial={regras.valores} motor={await valoresDoMotor(svc, tenantId)} migrado={regras.migrado} podeEditar={podeEditar} tiposBloqueados={(await lerCfgMetas(svc, tenantId)).tiposBloqueados ?? []} />}
      {aba === 'adaptativo' && subAd === 'sprint' && <AbaSprints tenantId={tenantId} qs={qs} podeEditar={podeEditar} />}
      {aba === 'adaptativo' && subAd === 'ver' && <AbaVersoes tenantId={tenantId} qs={qs} podeEditar={podeEditar} regrasAlteradas={alteradas.length} aulas={base.kpis.aulas} migrado={regras.migrado} resumo={await resumoExportacao(svc, tenantId, regras.valores, base.kpis.aulas)} />}
    </div>
  )
}

// ───────────────────────────── Gerador ─────────────────────────────

async function AbaGerador({ grupo, svc, tenantId, qs }: { grupo: 'faixas' | 'especial'; svc: ReturnType<typeof createAdminClient>; tenantId: string; qs: QS }) {
  const r = await listarGerador(svc, tenantId, { grupo, q: qs.q, origem: qs.situ, ordem: qs.ord, dir: qs.dir === 'desc' ? 'desc' : 'asc', pagina: ParamsInt(qs.pag, 1), porPagina: porPagina(qs.pps) })
  return (
    <>
      <Nota tipo="info">
        {grupo === 'faixas'
          ? 'O gerador escolhe a faixa de cada semana pela soma de horas da rotina do aluno. Os limites das faixas são regras fixas do motor 3.0; os demais valores são editados em '
          : 'A semana especial pausa o conteúdo novo e revisa os temas anteriores pelo desempenho do aluno. A frequência e os critérios são fixos no motor 3.0; as durações são editadas em '}
        <Link href="/admin/cronogramas/adaptativo/metas" className="underline">Metas &amp; inteligência</Link>.
      </Nota>
      <BarraBusca base={BASE} qs={qs} preservar={['aba', 'sub']} placeholder="Buscar parâmetro" filtros={[
        { nome: 'situ', rotulo: 'Todas as origens', opcoes: [{ v: 'fixo', l: 'Regra fixa do motor' }, { v: 'cfg', l: 'Configurável' }] },
      ]} />
      <TabelaCron tipo="leitura" podeEditar={false} colunas={4} total={r.total} page={r.pagina} pp={r.porPagina} vazio="Nada encontrado com esses filtros."
        head={<><ThOrd rotulo="Parâmetro" col="nome" base={BASE} qs={qs} /><ThFixo>Valor</ThFixo><ThOrd rotulo="Origem" col="origem" base={BASE} qs={qs} /><ThFixo>Como funciona</ThFixo></>}
        rows={r.itens.map((i) => ({ id: i.id, cells: [
          <span key="n" className="font-medium">{i.nome}</span>, <span key="v" className="font-semibold tabular-nums">{i.valor}</span>,
          <Pilula key="o" tipo={i.origem === 'configurável' ? 'vio' : 'mut'}>{i.origem}</Pilula>, <span key="d" className="text-muted-foreground">{i.descricao}</span>] }))} />
    </>
  )
}

// ───────────────────────────── Cobertura ─────────────────────────────

async function AbaCobertura({ base, qs, ritmo, svc, tenantId, podeEditar }: { base: BaseCobertura; qs: QS; ritmo: number; svc: ReturnType<typeof createAdminClient>; tenantId: string; podeEditar: boolean }) {
  const pendentes = base.kpis.pendentes
  const pg = paginarCobertura(base, {
    q: qs.q, disc: qs.disc, situ: qs.situ === 'pendentes' || qs.situ === 'completas' ? qs.situ : '',
    ordem: qs.ord, dir: qs.dir === 'desc' ? 'desc' : 'asc', pagina: ParamsInt(qs.pag, 1), porPagina: porPagina(qs.pps),
  })
  await preencherQuestoes(svc, tenantId, pg.linhas)
  const celula = (precisa: boolean, tem: boolean, pag: number) =>
    !precisa ? <Pilula tipo="mut">não se aplica</Pilula> : !tem ? <Pilula tipo="bad">falta</Pilula> : pag ? <Pilula tipo="ok">{pag} p.</Pilula> : <Pilula tipo="ok">na Biblioteca</Pilula>
  return (
    <>
      <Nota tipo="info">Os materiais são incluídos, trocados e excluídos na <Link href="/admin/biblioteca" className="underline">Biblioteca</Link>. Aqui você vê se cada aula do cronograma está completa e quanto tempo ela ocupa.</Nota>
      <Nota tipo={pendentes ? 'aviso' : 'ok'}>{pendentes ? <b>{pendentes} materiais pendentes. </b> : 'Todas as aulas estão completas. '}Tempo total de cada aula calculado no ritmo padrão de {ritmo} páginas por hora.</Nota>
      <BarraBusca base={BASE} qs={qs} preservar={['aba', 'sub']} placeholder="Buscar aula ou disciplina" filtros={[
        { nome: 'disc', rotulo: 'Todas as disciplinas', opcoes: pg.disciplinas.map((d) => ({ v: d, l: d })) },
        { nome: 'situ', rotulo: 'Todas as situações', opcoes: [{ v: 'pendentes', l: 'Com pendência' }, { v: 'completas', l: 'Completas' }] },
      ]} />
      <TabelaCron tipo="cobertura" podeEditar={podeEditar} colunas={9} total={pg.total} page={pg.pagina} pp={pg.porPagina}
        vazio={base.kpis.aulas ? 'Nada encontrado com esses filtros.' : <>Nenhuma aula cadastrada. Inclua os PDFull na <Link href="/admin/biblioteca" className="underline">Biblioteca</Link>.</>}
        head={<>
          <ThOrd rotulo="Ordem" col="ordem" base={BASE} qs={qs} /><ThOrd rotulo="Aula" col="aula" base={BASE} qs={qs} /><ThFixo>Ações</ThFixo><ThFixo>Disciplina</ThFixo><ThOrd rotulo="PDFull" col="pag" base={BASE} qs={qs} />
          <ThFixo>PDFlash</ThFixo><ThFixo>PDFight</ThFixo><ThFixo>Questões</ThFixo><ThOrd rotulo="Tempo total" col="tempo" base={BASE} qs={qs} />
        </>}
        rows={pg.linhas.map((l) => ({ id: l.chave, valor: l.disc, cells: [
          <span key="o" className="tabular-nums">{l.ordem}</span>,
          <b key="a" className="block max-w-[13rem] truncate font-medium" title={l.rotulo}>{l.rotulo}</b>,
          <span key="x" className="flex items-center gap-1.5">
            {l.documentoId
              ? <Link href={`/admin/biblioteca/conteudo/${l.documentoId}/gerenciar`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>Abrir</Link>
              : <Pilula tipo="warn">sem link</Pilula>}
            <Link href={`/admin/revisao/biblioteca?aba=pdfull&q=${encodeURIComponent(l.titulo)}`} className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })} title="Ver na Biblioteca" aria-label="Ver na Biblioteca"><BookOpen /></Link>
          </span>,
          <span key="dc" className="block max-w-[8rem] truncate text-muted-foreground" title={l.disc}>{l.disc}</span>,
          l.pag ? <Pilula key="p" tipo="ok">{l.pag} p.</Pilula> : <Pilula key="p" tipo="bad">sem páginas</Pilula>,
          <span key="f">{celula(l.precisaFlash, l.temFlash, l.flashPag)}</span>,
          <span key="g">{celula(l.precisaFight, l.temFight, l.fightPag)}</span>,
          <span key="q">{l.qFiltro ? (l.questoesQtd ? <Pilula tipo="ok">{l.questoesQtd.toLocaleString('pt-BR')} q.</Pilula> : <Pilula tipo="warn">{l.questoesQtd === 0 ? '0 q.' : 'filtro'}</Pilula>) : l.qLink ? <Pilula tipo="ok">com link</Pilula> : l.qDoc ? <Pilula tipo="ok">na Biblioteca</Pilula> : <Pilula tipo="bad">falta</Pilula>}</span>,
          <span key="t" className="font-semibold tabular-nums">{crHm(l.tempoMin)}</span>] }))} />
    </>
  )
}

// ───────────────────────────── Disciplinas ─────────────────────────────

function AbaDisciplinas({ pg, qs, podeEditar }: { pg: PaginaDisciplinas; qs: QS; podeEditar: boolean }) {
  return (
    <>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground">Disciplina sem PDFlash ou sem PDFight não recebe essa revisão e não aparece como pendente. PDFull, Juris e LegProc desligados fazem o gerador deixar de entregar esse tipo naquela disciplina (um tipo bloqueado em Regras do cronograma vale para todas). Disciplina desligada sai do cronograma, com as aulas guardadas.</p>
        {podeEditar && <AdicionarDisciplina />}
      </div>
      {!pg.migrado && <Nota tipo="aviso">Para salvar alterações nas disciplinas, aplique a migração 20261112050000_revisao_cronograma_duvidas.sql.</Nota>}
      {pg.migrado && !pg.tiposMigrado && <Nota tipo="aviso">PDFull, Juris e LegProc por disciplina dependem da migração 20261113030000_cron_disciplinas_tipos_material.sql, ainda não aplicada. Até lá os botões ficam desabilitados.</Nota>}
      <BarraBusca base={BASE} qs={qs} preservar={['aba', 'sub']} placeholder="Buscar disciplina" filtros={[{ nome: 'situ', rotulo: 'Todas', opcoes: [{ v: 'no', l: 'No cronograma' }, { v: 'fora', l: 'Fora do cronograma' }] }]} />
      <TabelaCron tipo="disciplinas" podeEditar={podeEditar} colunas={9} total={pg.total} page={pg.pagina} pp={pg.porPagina} vazio="Nenhuma disciplina encontrada."
        head={<><ThOrd rotulo="Disciplina" col="nome" base={BASE} qs={qs} /><ThFixo>Tem PDFlash</ThFixo><ThFixo>Tem PDFight</ThFixo><ThFixo>PDFull</ThFixo><ThFixo>Juris</ThFixo><ThFixo>LegProc</ThFixo><ThFixo>No cronograma</ThFixo><ThOrd rotulo="Aulas" col="aulas" base={BASE} qs={qs} /><ThFixo>Ações</ThFixo></>}
        rows={pg.itens.map((d) => ({ id: d.nome, valor: d.nome, fraca: !d.ativa, cells: [
          <span key="n" className="font-medium">{d.nome}{d.manual && <Pilula tipo="vio" className="ml-2">criada aqui</Pilula>}</span>,
          <DiscSwitch key="f" nome={d.nome} campo="pdflash" valor={d.pdflash} podeEditar={podeEditar} />,
          <DiscSwitch key="g" nome={d.nome} campo="pdfight" valor={d.pdfight} podeEditar={podeEditar} />,
          <DiscSwitch key="pf" nome={d.nome} campo="pdfull" valor={d.pdfull} podeEditar={podeEditar} desabilitado={!pg.tiposMigrado} />,
          <DiscSwitch key="jp" nome={d.nome} campo="juris" valor={d.juris} podeEditar={podeEditar} desabilitado={!pg.tiposMigrado} />,
          <DiscSwitch key="lp" nome={d.nome} campo="legproc" valor={d.legproc} podeEditar={podeEditar} desabilitado={!pg.tiposMigrado} />,
          <DiscSwitch key="a" nome={d.nome} campo="ativa" valor={d.ativa} podeEditar={podeEditar} />,
          <span key="u" className="tabular-nums">{d.aulas}</span>,
          <span key="x" className="flex items-center gap-1.5">
            <Link href={`${BASE}?aba=adaptativo&sub=mat&disc=${encodeURIComponent(d.nome)}`} className={buttonVariants({ variant: 'outline', size: 'sm' })} aria-label={`Abrir as aulas de ${d.nome}`}>Abrir aulas</Link>
            {podeEditar && d.manual && <RemoverDisciplina nome={d.nome} />}
          </span>] }))} />
    </>
  )
}

// ───────────────────────────── Sprints ─────────────────────────────

const STATUS_SPRINT = { rascunho: { l: 'Rascunho', t: 'mut' }, ativo: { l: 'Ativo', t: 'ok' }, encerrado: { l: 'Encerrado', t: 'warn' } } as const

async function AbaSprints({ tenantId, qs, podeEditar }: { tenantId: string; qs: QS; podeEditar: boolean }) {
  const por = porPagina(qs.pps)
  const pagina = ParamsInt(qs.pag, 1)
  const r = await listarSprints(createAdminClient(), tenantId, { q: qs.q, status: qs.status, ordem: qs.ord, dir: qs.dir === 'desc' ? 'desc' : 'asc', pagina, por })
  return (
    <RevisaoCard>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-base font-semibold">Trilhas de sprint</h2><p className="text-sm text-muted-foreground">Trilha comum, igual para todos os alunos do sprint</p></div>
        <SprintDialogo rotulo="Criar sprint" podeEditar={podeEditar} />
      </div>
      {!r.migrado && <Nota tipo="aviso">Os sprints ficam disponíveis após aplicar a migração 20261112050000_revisao_cronograma_duvidas.sql.</Nota>}
      <BarraBusca base={BASE} qs={qs} preservar={['aba', 'sub']} placeholder="Buscar sprint" filtros={[{ nome: 'status', rotulo: 'Todas as situações', opcoes: [{ v: 'rascunho', l: 'Rascunho' }, { v: 'ativo', l: 'Ativo' }, { v: 'encerrado', l: 'Encerrado' }] }]} />
      <TabelaCron tipo="sprints" podeEditar={podeEditar} colunas={6} total={r.total} page={pagina} pp={por}
        vazio={r.total || qs.q || qs.status ? 'Nada encontrado com esses filtros.' : 'Nenhum sprint ainda. Use “Criar sprint”.'}
        head={<><ThOrd rotulo="Sprint" col="nome" base={BASE} qs={qs} /><ThOrd rotulo="Dias" col="dias" base={BASE} qs={qs} /><ThOrd rotulo="Metas" col="metas" base={BASE} qs={qs} /><ThFixo>Situação</ThFixo><ThOrd rotulo="Criado em" col="criado" base={BASE} qs={qs} /><ThFixo>Ações</ThFixo></>}
        rows={r.itens.map((s) => ({ id: s.id, cells: [
          <span key="n" className="block min-w-[14rem]"><b className="block font-medium leading-tight">{s.nome}</b>{s.observacao && <small className="text-muted-foreground">{s.observacao}</small>}</span>,
          <span key="d" className="tabular-nums">{s.dias}</span>, <span key="m" className="tabular-nums">{s.metas}</span>,
          <Pilula key="s" tipo={STATUS_SPRINT[s.status].t}>{STATUS_SPRINT[s.status].l}</Pilula>,
          <span key="c" className="text-muted-foreground">{formatBrt(s.criadoEm)?.slice(0, 10)}</span>,
          <span key="x" className="flex items-center gap-1.5">
            <SprintDialogo rotulo="Editar" podeEditar={podeEditar} sprint={{ id: s.id, nome: s.nome, dias: s.dias, metas: s.metas, status: s.status, observacao: s.observacao }} />
            <ExcluirSprint id={s.id} nome={s.nome} podeEditar={podeEditar} />
          </span>] }))} />
      <div className="mt-4"><Nota tipo="info">Cada dia da trilha tem metas com material ligado (PDF, LegProc, questões, JurisClub). O recálculo adaptativo do sprint fica para a próxima versão — hoje o sprint registra nome, dias, metas e situação.</Nota></div>
    </RevisaoCard>
  )
}

// ───────────────────────────── Versões e exportação ─────────────────────────────

async function AbaVersoes({ tenantId, qs, podeEditar, aulas, regrasAlteradas, resumo, migrado }: { tenantId: string; qs: QS; podeEditar: boolean; aulas: number; regrasAlteradas: number; resumo: string; migrado: boolean }) {
  const por = porPagina(qs.pps)
  const pagina = ParamsInt(qs.pag, 1)
  const r = await listarVersoes(createAdminClient(), tenantId, { q: qs.q, ordem: qs.ord, dir: qs.dir === 'desc' ? 'desc' : 'asc', pagina, por })
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <RevisaoCard>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div><h2 className="text-base font-semibold">Versões salvas</h2><p className="text-sm text-muted-foreground">Cada versão guarda as regras e as disciplinas (agora {regrasAlteradas} regras alteradas · {aulas} aulas)</p></div>
          <SalvarVersaoBotao podeEditar={podeEditar} />
        </div>
        {!migrado && <Nota tipo="aviso">Aplique a migração 20261112050000_revisao_cronograma_duvidas.sql para salvar versões.</Nota>}
        <BarraBusca base={BASE} qs={qs} preservar={['aba', 'sub']} placeholder="Buscar pelo número da versão" />
        <TabelaCron tipo="versoes" podeEditar={podeEditar} colunas={5} total={r.total} page={pagina} pp={por} vazio={qs.q ? 'Nenhuma versão com esse número.' : 'Nenhuma versão salva ainda.'}
          head={<><ThOrd rotulo="Versão" col="numero" base={BASE} qs={qs} /><ThOrd rotulo="Salva em" col="data" base={BASE} qs={qs} /><ThOrd rotulo="Regras alteradas" col="alteradas" base={BASE} qs={qs} /><ThOrd rotulo="Aulas" col="aulas" base={BASE} qs={qs} /><ThFixo>Ações</ThFixo></>}
          rows={r.itens.map((v) => ({ id: v.id, cells: [
            <span key="n" className="font-medium">Versão {v.numero}</span>, <span key="d" className="text-muted-foreground">{formatBrt(v.criadoEm)}</span>,
            <span key="a" className="tabular-nums">{v.nAlteradas}</span>, <span key="u" className="tabular-nums">{v.aulas}</span>,
            <CarregarVersao key="x" id={v.id} numero={v.numero} podeEditar={podeEditar} />] }))} />
      </RevisaoCard>
      <RevisaoCard>
        <h2 className="text-base font-semibold">Levar para o cronograma</h2>
        <p className="mb-3 mt-1 text-sm text-muted-foreground">Regras, disciplinas e materiais num só arquivo, para o time de tecnologia ligar ao Cronograma Adaptativo.</p>
        <ConfigIO resumo={resumo} podeEditar={podeEditar} />
        <p className="mt-3 text-xs text-muted-foreground">Ao carregar, entram as regras e as disciplinas; os materiais vêm sempre da Biblioteca e não são sobrescritos.</p>
      </RevisaoCard>
    </div>
  )
}
