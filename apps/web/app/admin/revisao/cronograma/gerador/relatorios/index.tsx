import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/server'
import { RevisaoAbas, RevisaoCard } from '@/components/admin/revisao/ui'
import { formatBrt } from '@/lib/brt'
import { dirDe, inteiro, lerQs, porPaginaDe, type QSn, type SP } from '@/lib/revisao/gerador/comum-ger3'
import {
  lerGeral, lerPorCronograma, lerSerieDias, listarAlunosRelatorio, listarDownloads, listarEmissoes, paginarPorCronograma, pct,
} from '@/lib/revisao/gerador/relatorios'
import { BarraBusca, KpiCard, KpiGrid, Nota, Pilula, ThFixo, ThOrd } from '../../../_comp/lista'
import { TabelaCron } from '../../tabela-cron'

// Sub-aba "Relatórios" (Gerador): mesmos números do admin/cronogramas/relatorios (RPCs agregadas), agora em
// tabelas paginadas no servidor (busca + filtros + ordenação por query string) e com as vistas Emissões e Downloads.

type Vista = 'alunos' | 'emissoes' | 'downloads' | 'cronogramas'
const VISTAS: Vista[] = ['alunos', 'emissoes', 'downloads', 'cronogramas']
const ROTULO_VIA: Record<string, string> = { matricula: 'Matrícula', avulso: 'Avulso', gratuito: 'Gratuito', testador: 'Testador', equipe: 'Equipe' }
const ROTULO_BOTAO: Record<string, string> = { docx: 'Word (.docx)', ficha: 'Ficha', csv: 'Planilha (.csv)' }

export default async function RelatoriosGerador({ sp, tenantId, basePath }: { sp: SP; tenantId: string; basePath: string }) {
  const { base, qs } = lerQs(sp, basePath)
  const vis: Vista = VISTAS.includes(qs.vis as Vista) ? (qs.vis as Vista) : 'alunos'
  const por = porPaginaDe(qs.pps)
  const pagina = inteiro(qs.pag, 1)
  const dir = dirDe(qs.dir)
  const svc = createAdminClient()

  let geral, dias
  try { [geral, dias] = await Promise.all([lerGeral(svc, tenantId), lerSerieDias(svc, tenantId, 30)]) }
  catch (e) { return <Nota tipo="aviso">Não foi possível carregar os relatórios: {(e as Error)?.message ?? 'erro desconhecido'}.</Nota> }
  const maxDia = Math.max(1, ...dias.map((d) => Math.max(d.emissoes, d.concluidas)))

  return (
    <div className="w-full">
      <KpiGrid>
        <KpiCard rotulo="Emissões" valor={geral.emissoes.toLocaleString('pt-BR')} />
        <KpiCard rotulo="Alunos que emitiram" valor={geral.alunos.toLocaleString('pt-BR')} />
        <KpiCard rotulo="Cronogramas usados" valor={geral.cronogramas_usados.toLocaleString('pt-BR')} />
        <KpiCard rotulo={`Metas concluídas (${pct(geral.concluidas, geral.planejadas)}%)`} valor={geral.concluidas.toLocaleString('pt-BR')} />
      </KpiGrid>

      <RevisaoCard titulo="Movimento dos últimos 30 dias" className="mb-4">
        <div className="flex items-end gap-[3px]" style={{ height: 96 }}>
          {dias.map((d) => (
            <div key={d.dia} className="flex h-full flex-1 flex-col justify-end gap-[2px]" title={`${d.dia}: ${d.emissoes} emissão(ões), ${d.concluidas} meta(s) concluída(s)`}>
              <div className="w-full rounded-t-sm bg-emerald-500/70" style={{ height: `${(d.concluidas / maxDia) * 55}%` }} />
              <div className="w-full rounded-t-sm bg-primary" style={{ height: `${(d.emissoes / maxDia) * 55}%` }} />
            </div>
          ))}
        </div>
        <p className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-primary" />emissões ({geral.emissoes_30d.toLocaleString('pt-BR')} em 30 dias)</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500/70" />metas concluídas</span>
        </p>
      </RevisaoCard>

      <RevisaoAbas base={base} param="vis" atual={vis} extra={{ aba: qs.aba, sub: qs.sub }} abas={[
        { id: 'alunos', titulo: 'Por aluno', contagem: geral.alunos },
        { id: 'emissoes', titulo: 'Emissões', contagem: geral.emissoes },
        { id: 'downloads', titulo: 'Downloads' },
        { id: 'cronogramas', titulo: 'Por cronograma', contagem: geral.cronogramas_usados },
      ]} />

      <RevisaoCard>
        {vis === 'alunos' && <Alunos svc={svc} tenantId={tenantId} base={base} qs={qs} por={por} pagina={pagina} dir={dir} />}
        {vis === 'emissoes' && <Emissoes svc={svc} tenantId={tenantId} base={base} qs={qs} por={por} pagina={pagina} dir={dir} />}
        {vis === 'downloads' && <Downloads svc={svc} tenantId={tenantId} base={base} qs={qs} por={por} pagina={pagina} dir={dir} />}
        {vis === 'cronogramas' && <PorCronograma svc={svc} tenantId={tenantId} base={base} qs={qs} por={por} pagina={pagina} dir={dir} />}
      </RevisaoCard>

      <p className="mt-3 text-xs text-muted-foreground">O progresso é a leitura do estado atual: o denominador é quantas metas o cronograma tem hoje, então reimportar um cronograma muda o número. Emissões de testador ficam de fora de todos os números.</p>
    </div>
  )
}

type P = { svc: ReturnType<typeof createAdminClient>; tenantId: string; base: string; qs: QSn; por: number; pagina: number; dir: 'asc' | 'desc' }

function Progresso({ feitas, total }: { feitas: number; total: number }) {
  const p = pct(feitas, total)
  const rotulo = feitas > 0 && p === 0 ? '<1%' : `${p}%`
  return (
    <span className="flex min-w-[10rem] items-center gap-2">
      <span className="h-1.5 w-full min-w-16 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-primary" style={{ width: feitas > 0 ? `max(3px, ${p}%)` : '0%' }} /></span>
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{rotulo} <span className="opacity-70">({feitas.toLocaleString('pt-BR')}/{total.toLocaleString('pt-BR')})</span></span>
    </span>
  )
}

async function Alunos({ svc, tenantId, base, qs, por, pagina, dir }: P) {
  let r
  try { r = await listarAlunosRelatorio(svc, tenantId, { q: qs.q, ordem: qs.ord, dir, situ: qs.situ, pagina, porPagina: por }) }
  catch (e) { return <Nota tipo="aviso">Não foi possível listar os alunos: {(e as Error)?.message}.</Nota> }
  return (
    <>
      {!r.v2 && <Nota tipo="aviso">Ordenação por coluna e filtro de andamento dependem da migração 20261113041500_cron_relatorio_alunos_ordenavel.sql, ainda não aplicada. Até lá a lista vem ordenada pela última emissão.</Nota>}
      <BarraBusca base={base} qs={qs} preservar={['aba', 'sub', 'vis']} placeholder="Buscar por nome ou e-mail" filtros={r.v2 ? [{ nome: 'situ', rotulo: 'Todo andamento', opcoes: [{ v: 'sem_progresso', l: 'Sem nenhuma meta concluída' }, { v: 'andamento', l: 'Em andamento' }, { v: 'completo', l: 'Plano concluído' }] }] : []} />
      <TabelaCron tipo="leitura" podeEditar={false} colunas={4} total={r.total} page={pagina} pp={por}
        vazio={qs.q || qs.situ ? 'Nenhum aluno encontrado com esses filtros.' : 'Nenhum aluno emitiu cronograma ainda.'}
        head={r.v2
          ? <><ThOrd rotulo="Aluno" col="nome" base={base} qs={qs} /><ThOrd rotulo="Emissões" col="emissoes" base={base} qs={qs} /><ThOrd rotulo="Última emissão" col="ultima" base={base} qs={qs} /><ThOrd rotulo="Progresso" col="progresso" base={base} qs={qs} /></>
          : <><ThFixo>Aluno</ThFixo><ThFixo>Emissões</ThFixo><ThFixo>Última emissão</ThFixo><ThFixo>Progresso</ThFixo></>}
        rows={r.itens.map((a) => ({ id: a.estudante_id, cells: [
          <span key="n" className="block min-w-[14rem]"><Link href={`/admin/estudantes/${a.estudante_id}`} className="font-medium hover:underline">{a.nome}</Link><small className="block text-muted-foreground">{a.email ?? 'sem e-mail'}</small></span>,
          <span key="e" className="tabular-nums">{a.emissoes.toLocaleString('pt-BR')}</span>,
          <span key="u" className="whitespace-nowrap tabular-nums text-muted-foreground">{formatBrt(a.ultima) ?? '—'}</span>,
          <Progresso key="p" feitas={a.concluidas} total={a.planejadas} />,
        ] }))} />
    </>
  )
}

async function Emissoes({ svc, tenantId, base, qs, por, pagina, dir }: P) {
  let r, cron
  try {
    ;[r, cron] = await Promise.all([
      listarEmissoes(svc, tenantId, { q: qs.q, via: qs.via, cronograma: qs.cron, arq: qs.arq, ordem: qs.ord, dir, pagina, porPagina: por }),
      lerPorCronograma(svc, tenantId),
    ])
  } catch (e) { return <Nota tipo="aviso">Não foi possível listar as emissões: {(e as Error)?.message}.</Nota> }
  return (
    <>
      <BarraBusca base={base} qs={qs} preservar={['aba', 'sub', 'vis']} placeholder="Buscar por aluno, cronograma ou título" filtros={[
        { nome: 'cron', rotulo: 'Todos os cronogramas', opcoes: cron.map((c) => ({ v: c.cronograma_id, l: c.nome })) },
        { nome: 'via', rotulo: 'Toda origem de acesso', opcoes: Object.entries(ROTULO_VIA).filter(([k]) => k !== 'testador').map(([v, l]) => ({ v, l })) },
        { nome: 'arq', rotulo: 'Ativas e arquivadas', opcoes: [{ v: 'nao', l: 'Só ativas' }, { v: 'sim', l: 'Só arquivadas' }] },
      ]} />
      <TabelaCron tipo="leitura" podeEditar={false} colunas={6} total={r.total} page={r.pagina} pp={por}
        vazio={qs.q || qs.via || qs.cron || qs.arq ? 'Nenhuma emissão com esses filtros.' : 'Nenhuma emissão ainda.'}
        head={<><ThOrd rotulo="Quando" col="quando" base={base} qs={qs} /><ThOrd rotulo="Aluno" col="aluno" base={base} qs={qs} /><ThOrd rotulo="Cronograma" col="cronograma" base={base} qs={qs} /><ThOrd rotulo="Acesso" col="via" base={base} qs={qs} /><ThFixo>Emitido por</ThFixo><ThFixo>Downloads</ThFixo></>}
        rows={r.itens.map((e) => ({ id: e.id, fraca: e.arquivada, cells: [
          <span key="q" className="whitespace-nowrap tabular-nums text-muted-foreground">{formatBrt(e.criadoEm) ?? '—'}</span>,
          <Link key="a" href={`/admin/estudantes/${e.estudanteId}`} className="font-medium hover:underline">{e.aluno}</Link>,
          <span key="c" className="block min-w-[12rem]"><Link href={`/admin/cronogramas/${e.cronogramaId}`} className="hover:underline">{e.cronograma}</Link>{e.titulo && <small className="block text-muted-foreground">{e.titulo}</small>}{e.arquivada && <Pilula tipo="mut" className="ml-1">arquivada</Pilula>}</span>,
          <span key="v">{e.via ? <Pilula tipo="vio">{ROTULO_VIA[e.via] ?? e.via}</Pilula> : <span className="text-muted-foreground">—</span>}</span>,
          <span key="t" className="text-muted-foreground">{e.atorTipo === 'usuario' ? 'Equipe' : 'Aluno'}</span>,
          <span key="d" className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">Word {e.downloads.docx} · Ficha {e.downloads.ficha} · CSV {e.downloads.csv}</span>,
        ] }))} />
    </>
  )
}

async function Downloads({ svc, tenantId, base, qs, por, pagina, dir }: P) {
  let r
  try { r = await listarDownloads(svc, tenantId, { q: qs.q, botao: qs.botao, ordem: qs.ord, dir, pagina, porPagina: por }) }
  catch (e) { return <Nota tipo="aviso">Não foi possível listar os downloads: {(e as Error)?.message}.</Nota> }
  return (
    <>
      <BarraBusca base={base} qs={qs} preservar={['aba', 'sub', 'vis']} placeholder="Buscar por aluno ou cronograma" filtros={[{ nome: 'botao', rotulo: 'Todos os formatos', opcoes: Object.entries(ROTULO_BOTAO).map(([v, l]) => ({ v, l })) }]} />
      <TabelaCron tipo="leitura" podeEditar={false} colunas={4} total={r.total} page={r.pagina} pp={por}
        vazio={qs.q || qs.botao ? 'Nenhum download com esses filtros.' : 'Nenhum download registrado ainda.'}
        head={<><ThOrd rotulo="Quando" col="quando" base={base} qs={qs} /><ThFixo>Aluno</ThFixo><ThFixo>Cronograma</ThFixo><ThOrd rotulo="Formato" col="botao" base={base} qs={qs} /></>}
        rows={r.itens.map((d) => ({ id: d.id, cells: [
          <span key="q" className="whitespace-nowrap tabular-nums text-muted-foreground">{formatBrt(d.criadoEm) ?? '—'}</span>,
          <span key="a" className="font-medium">{d.aluno}</span>,
          <span key="c">{d.cronograma}</span>,
          <Pilula key="b" tipo="vio">{ROTULO_BOTAO[d.botao] ?? d.botao}</Pilula>,
        ] }))} />
    </>
  )
}

async function PorCronograma({ svc, tenantId, base, qs, por, pagina, dir }: P) {
  let todos
  try { todos = await lerPorCronograma(svc, tenantId) }
  catch (e) { return <Nota tipo="aviso">Não foi possível carregar os cronogramas: {(e as Error)?.message}.</Nota> }
  const pg = paginarPorCronograma(todos, { q: qs.q, ordem: qs.ord, dir, pagina, porPagina: por })
  return (
    <>
      <BarraBusca base={base} qs={qs} preservar={['aba', 'sub', 'vis']} placeholder="Buscar cronograma" />
      <TabelaCron tipo="leitura" podeEditar={false} colunas={5} total={pg.total} page={pg.pagina} pp={por}
        vazio={qs.q ? 'Nenhum cronograma com esse nome.' : 'Nenhuma emissão ainda. Assim que um aluno gerar, os números aparecem aqui.'}
        head={<><ThOrd rotulo="Cronograma" col="nome" base={base} qs={qs} /><ThOrd rotulo="Carga" col="carga" base={base} qs={qs} /><ThOrd rotulo="Emissões" col="emissoes" base={base} qs={qs} /><ThOrd rotulo="Alunos" col="alunos" base={base} qs={qs} /><ThOrd rotulo="Progresso" col="progresso" base={base} qs={qs} /></>}
        rows={pg.itens.map((c) => ({ id: c.cronograma_id, cells: [
          <Link key="n" href={`/admin/cronogramas/${c.cronograma_id}`} className="font-medium hover:underline">{c.nome}</Link>,
          <span key="h" className="tabular-nums">{c.carga_horaria != null ? `${c.carga_horaria}h` : '—'}</span>,
          <span key="e" className="tabular-nums">{c.emissoes.toLocaleString('pt-BR')}</span>,
          <span key="a" className="tabular-nums">{c.alunos.toLocaleString('pt-BR')}</span>,
          <Progresso key="p" feitas={c.concluidas} total={c.planejadas} />,
        ] }))} />
    </>
  )
}
