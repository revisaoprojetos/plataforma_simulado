import Link from 'next/link'
import { BookOpen, Users, ClipboardList, FileText, Plus, Calendar, ExternalLink, MessageCircle, History } from 'lucide-react'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { SemPermissao } from '@/components/ui/alert-box'
import { RevisaoHead } from '@/components/admin/revisao/ui'
import { carregarDashboardRevisao, EVENTO_TIPOS, type DiaCal, type EventoCal, type TipoEvento } from '@/lib/admin/revisao/dashboard'
import { DIAS_SEM, MESES, dataBr } from '@/lib/admin/revisao/datas'
import { RR } from '@/lib/admin/revisao/rotas'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

// Cores por tipo de evento (categorias semânticas do calendário; as do protótipo: live=rosa, aula=azul,
// simulado=dourado, mentoria=verde-água, prazo=vermelho).
const COR: Record<TipoEvento, string> = {
  live: 'bg-pink-600 text-white',
  aula: 'bg-blue-600 text-white',
  sim: 'bg-amber-600 text-white',
  mentoria: 'bg-teal-600 text-white',
  prazo: 'bg-red-600 text-white',
}
const PONTO: Record<TipoEvento, string> = { live: 'bg-pink-600', aula: 'bg-blue-600', sim: 'bg-amber-600', mentoria: 'bg-teal-600', prazo: 'bg-red-600' }
const nf = (n: number) => n.toLocaleString('pt-BR')

function Kpi({ rotulo, valor, sub, href, Icon }: { rotulo: string; valor: string; sub: string; href: string; Icon: React.ComponentType<{ className?: string }> }) {
  return (
    <Link href={href} className="group relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/[0.06] via-card to-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{rotulo}</p>
          <p className="mt-2 text-[2.1rem] font-bold leading-none tracking-tight tabular-nums">{valor}</p>
          <p className="mt-2 text-xs text-muted-foreground">{sub}</p>
        </div>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-md shadow-primary/25">
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </Link>
  )
}

function Secao({ titulo, sub, acao }: { titulo: string; sub: string; acao?: React.ReactNode }) {
  return (
    <div className="mb-3 mt-8 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{titulo}</h2>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </div>
      {acao}
    </div>
  )
}

function CardH({ Icon, titulo, sub, direita }: { Icon: React.ComponentType<{ className?: string }>; titulo: string; sub: string; direita?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-primary/10 text-primary"><Icon className="h-4 w-4" /></span>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">{titulo}</h3>
          <p className="truncate text-[11px] text-muted-foreground">{sub}</p>
        </div>
      </div>
      {direita}
    </div>
  )
}

const BTN_SM = 'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[10px] border bg-background px-3 text-[13px] font-medium transition hover:bg-muted'

function EventoChip({ e }: { e: EventoCal }) {
  return <span className={cn('block rounded-md px-1.5 py-1 text-[10px] font-semibold leading-tight', COR[e.tipo])} title={e.titulo}>{e.hora} {e.titulo}</span>
}

function Semana({ dias }: { dias: DiaCal[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
      {dias.map((d) => (
        <Link key={d.iso} href={`${RR.calendario}?dia=${d.iso}`}
          className={cn('flex min-h-32 flex-col gap-1 rounded-xl border bg-muted/30 p-2.5 transition hover:border-primary/40', d.hoje && 'border-2 border-amber-500 bg-card')}>
          <span className="text-[11px] font-medium uppercase text-muted-foreground">{DIAS_SEM[d.sem]}</span>
          <b className="text-xl leading-none">{d.dia}</b>
          {d.eventos.length ? d.eventos.map((e) => <EventoChip key={e.id} e={e} />) : <span className="text-xs text-muted-foreground/60">—</span>}
        </Link>
      ))}
    </div>
  )
}

function Mes({ dias }: { dias: DiaCal[] }) {
  return (
    <div className="grid grid-cols-7 gap-1.5">
      {DIAS_SEM.map((w) => <span key={w} className="pb-1 text-center text-[11px] font-medium uppercase text-muted-foreground">{w}</span>)}
      {dias.map((d) => (
        <Link key={d.iso} href={`${RR.calendario}?dia=${d.iso}`}
          className={cn('flex min-h-12 flex-col justify-between rounded-lg bg-muted/40 p-1.5 text-sm font-semibold transition hover:bg-muted sm:min-h-14', d.fora && 'text-muted-foreground/50', d.hoje && 'border-2 border-amber-500 bg-card')}>
          <b>{d.dia}</b>
          <span className="flex flex-wrap gap-0.5">{d.eventos.map((e) => <i key={e.id} className={cn('h-1.5 w-1.5 rounded-full', PONTO[e.tipo])} title={e.titulo} />)}</span>
        </Link>
      ))}
    </div>
  )
}

export default async function InicioRevisaoPage({ searchParams }: { searchParams: Promise<{ cal?: string }> }) {
  const access = await getCurrentAccess()
  if (!(access.isAdmin || accessCan(access, 'relatorios:view') || accessCan(access, 'estudantes:view'))) {
    return <SemPermissao>Você não tem permissão para ver o Dashboard.</SemPermissao>
  }
  const modo = (await searchParams).cal === 'mes' ? 'mes' : 'sem'
  const d = await carregarDashboardRevisao(access.tenantId ?? '00000000-0000-0000-0000-000000000000')
  const du = d.duvidas
  const max = Math.max(...du.porDisciplina.map((x) => x.n), 1)

  return (
    <div>
      <RevisaoHead titulo="Dashboard" subtitulo="Visão geral da plataforma" acoes={
        <>
          <Link href={RR.calendario} className="inline-flex h-9 items-center gap-1.5 rounded-lg border bg-background px-3 text-sm font-medium transition hover:bg-muted"><Plus className="h-4 w-4" />Novo evento</Link>
          <Link href={RR.biblioteca} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90"><Plus className="h-4 w-4" />Incluir material</Link>
        </>
      } />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi rotulo="Cursos em aberto" valor={nf(d.kpis.cursosAbertos)} sub="com tempo de acesso aberto" href={RR.cursosAtivos} Icon={BookOpen} />
        <Kpi rotulo="Alunos ativos" valor={nf(d.kpis.alunosAtivos)} sub={`${nf(d.kpis.estudaramHoje)} estudaram hoje`} href={RR.membros} Icon={Users} />
        <Kpi rotulo="Questões no banco" valor={nf(d.kpis.questoes)} sub="no admin de simulados" href={RR.banco} Icon={ClipboardList} />
        <Kpi rotulo="PDFs na biblioteca" valor={nf(d.kpis.pdfs)} sub="PDFull, PDFlash e PDFight" href={RR.biblioteca} Icon={FileText} />
      </div>

      <Secao titulo="Calendário do Revisão" sub={`${d.totalProximos} ${d.totalProximos === 1 ? 'evento' : 'eventos'} a partir de hoje`} acao={
        <div className="inline-flex gap-1 rounded-[14px] border bg-muted/40 p-1" role="group" aria-label="Ver calendário por">
          {([['sem', 'Semana'], ['mes', 'Mês']] as const).map(([id, rot]) => (
            <Link key={id} href={`${RR.inicio}?cal=${id}`} scroll={false}
              className={cn('rounded-[10px] px-3.5 py-1.5 text-sm font-semibold transition', modo === id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>{rot}</Link>
          ))}
        </div>
      } />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className="overflow-hidden rounded-2xl border bg-card">
          <CardH Icon={Calendar} titulo={modo === 'sem' ? 'Esta semana' : d.mesRotulo} sub="Lives, simulados, mentorias, aulas e prazos"
            direita={<Link href={RR.calendario} className={BTN_SM}><ExternalLink className="h-3.5 w-3.5" />Abrir calendário</Link>} />
          <div className="p-4">
            {modo === 'sem' ? <Semana dias={d.semana} /> : <Mes dias={d.mes} />}
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {EVENTO_TIPOS.map((e) => <span key={e.id} className="inline-flex items-center gap-1.5"><i className={cn('h-2 w-2 rounded-full', PONTO[e.id])} />{e.rotulo}</span>)}
            </div>
          </div>
        </section>
        <section className="overflow-hidden rounded-2xl border bg-card">
          <CardH Icon={Calendar} titulo="Próximos eventos" sub="Os 4 mais próximos" direita={<b className="text-xs">{d.totalProximos} no total</b>} />
          <div className="divide-y px-4">
            {d.proximos.length === 0 && <p className="py-6 text-sm text-muted-foreground">Nenhum evento marcado.</p>}
            {d.proximos.map((e) => (
              <Link key={e.id} href={`${RR.calendario}?dia=${e.data}`} className="flex items-center gap-3 py-3 transition hover:opacity-80">
                <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg bg-muted leading-none">
                  <b className="text-base">{e.data.slice(8)}</b><small className="mt-0.5 text-[9px] font-bold text-muted-foreground">{MESES[Number(e.data.slice(5, 7)) - 1].slice(0, 3).toUpperCase()}</small>
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-sm">{e.titulo}</b>
                  <small className="block truncate text-xs text-muted-foreground">{e.hora}{e.grupos.length ? ` · ${e.grupos.join(', ')}` : ' · Todos'}</small>
                </span>
                <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold', COR[e.tipo])}>{EVENTO_TIPOS.find((t) => t.id === e.tipo)?.rotulo}</span>
              </Link>
            ))}
          </div>
        </section>
      </div>

      <Secao titulo="Central de Dúvidas" sub="Dúvidas dos alunos, problemas reportados e avaliações dos materiais"
        acao={<Link href={RR.duvidas} className={BTN_SM}><MessageCircle className="h-3.5 w-3.5" />Abrir a Central</Link>} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { n: nf(du.semResposta), t: 'sem resposta', s: du.semResposta && du.maisAntiga ? `A mais antiga é de ${du.maisAntiga}` : 'Fila zerada', warn: du.semResposta > 0 },
          { n: nf(du.respondidas7d), t: 'respondidas', s: 'nos últimos 7 dias', warn: false },
          { n: nf(du.problemasAbertos), t: 'problemas em materiais', s: 'reportados pelos alunos', warn: du.problemasAbertos > 0 },
          { n: du.mediaAval != null ? `${du.mediaAval.toFixed(1).replace('.', ',')} ★` : '—', t: 'média das avaliações', s: `${du.notasBaixas} notas de 1 ou 2 estrelas`, warn: false },
        ].map((k) => (
          <Link key={k.t} href={k.t.includes('avalia') ? RR.avaliacoes : k.t.includes('problemas') ? RR.problemas : RR.duvidas} className="rounded-2xl border bg-card p-4 transition hover:border-primary/40">
            <b className={cn('block text-3xl font-bold tabular-nums', k.warn && 'text-amber-600 dark:text-amber-500')}>{k.n}</b>
            <span className="mt-1 block text-sm font-semibold">{k.t}</span>
            <small className="text-xs text-muted-foreground">{k.s}</small>
          </Link>
        ))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="overflow-hidden rounded-2xl border bg-card">
          <CardH Icon={MessageCircle} titulo="Dúvidas sem resposta por disciplina" sub="Onde a fila está maior" direita={<b className="text-xs">{du.semResposta} abertas</b>} />
          <div className="space-y-2.5 p-4">
            {du.porDisciplina.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma dúvida aguardando resposta.</p>}
            {du.porDisciplina.slice(0, 8).map((x) => (
              <div key={x.nome} className="grid grid-cols-[minmax(0,10rem)_1fr_2rem] items-center gap-3 text-sm sm:grid-cols-[minmax(0,12rem)_1fr_2rem]">
                <span className="truncate">{x.nome}</span>
                <span className="h-2 overflow-hidden rounded-full bg-muted"><i className="block h-full rounded-full bg-primary" style={{ width: `${(x.n / max) * 100}%` }} /></span>
                <b className="text-right">{x.n}</b>
              </div>
            ))}
          </div>
        </section>
        <section className="overflow-hidden rounded-2xl border bg-card">
          <CardH Icon={MessageCircle} titulo="Últimas dúvidas" sub="Esperando resposta" direita={<Link href={RR.duvidas} className={BTN_SM}>Responder</Link>} />
          <div className="divide-y px-4">
            {du.ultimas.length === 0 && <p className="py-6 text-sm text-muted-foreground">Nada esperando resposta.</p>}
            {du.ultimas.map((u) => (
              <Link key={u.id} href={`${RR.duvidas}?sel=${u.id}`} className="flex items-center justify-between gap-3 py-3 transition hover:opacity-80">
                <span className="min-w-0"><b className="block truncate text-sm">{u.tema}</b><small className="block truncate text-xs text-muted-foreground">{u.disciplina} · {u.aluno} · {u.quando}</small></span>
                <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold text-primary">{u.onde}</span>
              </Link>
            ))}
          </div>
        </section>
      </div>

      <Secao titulo="Atualizações em massa" sub="Mudanças aplicadas a vários materiais de uma vez"
        acao={<Link href={RR.atualizacoes} className={BTN_SM}><History className="h-3.5 w-3.5" />Central de Atualizações</Link>} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2.4fr)]">
        <section className="relative self-start overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/[0.06] via-card to-card p-5">
          <p className="pr-14 text-xs font-medium uppercase tracking-wide text-muted-foreground">Última atualização em massa</p>
          {d.massa.ultima ? (
            <>
              <p className="mt-2 text-[2.1rem] font-bold leading-none tracking-tight tabular-nums">{dataBr(d.massa.ultima.data).slice(0, 5)}</p>
              <p className="mt-2 text-xs text-muted-foreground">{d.massa.ultima.titulo} · {d.massa.ultima.materiais} materiais · {d.massa.ultima.quando === 'hoje' ? 'hoje' : d.massa.ultima.quando === 'ontem' ? 'há 1 dia' : d.massa.ultima.quando}</p>
            </>
          ) : <p className="mt-3 text-sm text-muted-foreground">Nenhuma atualização em massa registrada.</p>}
          <span className="absolute right-5 top-5 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-md shadow-primary/25"><History className="h-5 w-5" /></span>
        </section>
        <section className="overflow-x-auto rounded-2xl border bg-card">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3">Data</th><th className="px-4 py-3">O que mudou</th><th className="px-4 py-3">Tipo</th><th className="px-4 py-3">Materiais</th><th className="px-4 py-3">Alunos avisados</th>
            </tr></thead>
            <tbody>
              {d.massa.linhas.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-muted-foreground">Sem atualizações em massa ainda.</td></tr>}
              {d.massa.linhas.map((u) => (
                <tr key={u.id} className="border-b last:border-0">
                  <td className="px-4 py-3 font-semibold tabular-nums">{dataBr(u.data)}</td>
                  <td className="px-4 py-3"><b className="block">{u.titulo}</b><span className="text-xs text-muted-foreground">{u.descricao}</span></td>
                  <td className="px-4 py-3"><span className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-bold', u.tipo === 'Legislação' ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400' : u.tipo === 'Jurisprudência' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>{u.tipo}</span></td>
                  <td className="px-4 py-3 tabular-nums">{u.materiais}</td>
                  <td className="px-4 py-3 tabular-nums">{u.alunosAvisados ? nf(u.alunosAvisados) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  )
}
