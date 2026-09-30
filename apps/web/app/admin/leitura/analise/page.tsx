import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, CheckCircle2, BarChart3, FileText, CreditCard, Search, Repeat, CircleSlash, ArrowUp, ArrowDown, ArrowUpDown, Maximize2, ExternalLink, Flame, Users, TrendingUp, Trophy, Zap } from 'lucide-react'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { relatorioLeitura, detalheDocumento, engajamentoKpis, engajamentoLista, engajamentoAlunoDetalhe, modulosLeitura, type EngajSortCol } from './_dados'
import { carregarRankingModulo } from '@/lib/leitura/ranking'
import { KpiCard, BarrasH, Painel } from '@/components/admin/relatorios/viz'
import { AvatarEstudante } from '@/components/aluno/avatar-estudante'
import { EngajamentoModulosTabela } from '@/components/admin/engajamento-modulos-tabela'
import { formatBrt } from '@/lib/brt'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const fmt = (n: number) => n.toLocaleString('pt-BR')

export default async function AnaliseLeituraPage({ searchParams }: { searchParams: Promise<{ doc?: string; p?: string; tab?: string; pag?: string; eng?: string; q?: string; pg?: string; sort?: string; dir?: string; aluno?: string; mod?: string }> }) {
  if (!(await checkPermission('relatorios:view'))) redirect('/admin')
  const access = await getCurrentAccess()
  if (!access.tenantId) redirect('/admin')
  const { doc, p, tab, pag, eng, q, pg, sort, dir, aluno, mod } = await searchParams

  // ── Detalhe de um aluno (drill-down "expandir informações" da aba Assinaturas) ──
  if (aluno) {
    const voltar = new URLSearchParams({ tab: 'assinaturas' })
    if (pag) voltar.set('pag', pag)
    if (eng) voltar.set('eng', eng)
    if (q) voltar.set('q', q)
    if (pg) voltar.set('pg', pg)
    if (sort) voltar.set('sort', sort)
    if (dir) voltar.set('dir', dir)
    return <AlunoDetalhe tenantId={access.tenantId} estudanteId={aluno} voltarHref={`/admin/leitura/analise?${voltar.toString()}`} />
  }

  // ── Detalhe de um documento (drill-down da aba Documentos) ──
  if (doc) {
    const pagina = Math.max(1, Number(p) || 1)
    const det = await detalheDocumento(access.tenantId, doc, pagina)
    if (!det) redirect('/admin/leitura/analise')
    const totalPaginas = Math.max(1, Math.ceil(det.total / det.porPagina))
    return (
      <div className="space-y-5">
        <Link href="/admin/leitura/analise" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Análise · Desafio de Lei Seca</Link>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h1 className="text-2xl font-bold tracking-tight">{det.titulo}</h1>
          <span className="text-sm text-muted-foreground tabular-nums">{det.total} aluno{det.total === 1 ? '' : 's'}</span>
        </div>
        <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr><th className="px-4 py-2.5">Aluno</th><th className="px-4 py-2.5">Progresso</th><th className="px-4 py-2.5">Tempo</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5">Atualizado</th></tr>
            </thead>
            <tbody>
              {det.alunos.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Nenhum aluno começou este documento ainda.</td></tr>
              ) : det.alunos.map((a) => (
                <tr key={a.estudanteId} className="border-t">
                  <td className="px-4 py-2.5 font-medium">{a.nome}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${a.pct}%` }} /></div>
                      <span className="text-xs tabular-nums text-muted-foreground">{a.pct}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{a.tempoMin} min</td>
                  <td className="px-4 py-2.5">
                    {a.concluido ? <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-4 w-4" /> Concluído</span> : <span className="text-muted-foreground">Em andamento</span>}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{a.atualizadoEm ? formatBrt(a.atualizadoEm) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPaginas > 1 && (
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-xs text-muted-foreground">Página <b className="tabular-nums text-foreground">{det.pagina}</b> de <b className="tabular-nums text-foreground">{totalPaginas}</b></span>
            <div className="flex items-center gap-1">
              <PagLink href={`/admin/leitura/analise?doc=${doc}&p=${det.pagina - 1}`} disabled={det.pagina <= 1}>Anterior</PagLink>
              <PagLink href={`/admin/leitura/analise?doc=${doc}&p=${det.pagina + 1}`} disabled={det.pagina >= totalPaginas}>Próxima</PagLink>
            </div>
          </div>
        )}
      </div>
    )
  }

  const aba = tab === 'assinaturas' ? 'assinaturas' : tab === 'sequencias' ? 'sequencias' : 'documentos'

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><BarChart3 className="h-6 w-6 text-primary" /> Análise · Desafio de Lei Seca</h1>
        <p className="text-muted-foreground">Progresso por documento e o cruzamento de <b>pagamento recorrente</b> com o engajamento no Desafio.</p>
      </div>

      {/* Abas */}
      <div className="flex gap-1 border-b">
        <AbaLink ativa={aba === 'documentos'} href="/admin/leitura/analise" icon={FileText}>Documentos</AbaLink>
        <AbaLink ativa={aba === 'assinaturas'} href="/admin/leitura/analise?tab=assinaturas" icon={CreditCard}>Assinaturas &amp; Engajamento</AbaLink>
        <AbaLink ativa={aba === 'sequencias'} href="/admin/leitura/analise?tab=sequencias" icon={Flame}>Sequências</AbaLink>
      </div>

      {aba === 'documentos' ? (
        <DocumentosTabela linhas={await relatorioLeitura(access.tenantId)} />
      ) : aba === 'sequencias' ? (
        <SequenciasRelatorio tenantId={access.tenantId} mod={mod ?? ''} />
      ) : (
        <AssinaturasEngajamento tenantId={access.tenantId} pag={pag ?? ''} eng={eng ?? ''} q={q ?? ''} pgina={Math.max(1, Number(pg) || 1)} sort={sort ?? ''} dir={dir ?? ''} />
      )}
    </div>
  )
}

async function SequenciasRelatorio({ tenantId, mod }: { tenantId: string; mod: string }) {
  const modulos = await modulosLeitura(tenantId)
  if (!modulos.length) return <div className="rounded-2xl border bg-muted/30 p-8 text-center text-sm text-muted-foreground">Nenhum módulo de leitura criado ainda.</div>
  const moduloId = modulos.some((m) => m.id === mod) ? mod : modulos[0].id
  const rank = await carregarRankingModulo(moduloId, tenantId)
  // Só quem compete (exclui contas de teste ocultas) e tem sequência; ordena por sequência atual desc.
  const linhas = rank.itens.filter((i) => !i.oculto).sort((a, b) => b.streakAtual - a.streakAtual || b.aulasConcluidas - a.aulasConcluidas || a.nome.localeCompare(b.nome, 'pt-BR'))
  const comSeqList = linhas.filter((i) => i.streakAtual > 0)
  const comSeq = comSeqList.length
  const mediaSeq = comSeq ? Math.round(comSeqList.reduce((s, i) => s + i.streakAtual, 0) / comSeq) : 0
  const maiorSeq = linhas.reduce((m, i) => Math.max(m, i.streakAtual), 0)
  const pontosTotais = linhas.reduce((s, i) => s + (i.score ?? 0), 0)
  // Distribuição da sequência (gráfico) — faixas alinhadas à tabela de bônus (semana/marcos).
  const BUCKETS = [
    { rotulo: '1–6 dias', min: 1, max: 6 },
    { rotulo: '1 semana (7–13)', min: 7, max: 13 },
    { rotulo: '2 semanas (14–20)', min: 14, max: 20 },
    { rotulo: '3 semanas (21–29)', min: 21, max: 29 },
    { rotulo: '1 mês+ (30+)', min: 30, max: Infinity },
  ]
  const distSeq = BUCKETS.map((b) => ({ rotulo: b.rotulo, valor: linhas.filter((i) => i.streakAtual >= b.min && i.streakAtual <= b.max).length }))

  return (
    <div className="space-y-4">
      {/* Seletor de módulo */}
      <form method="get" className="flex flex-wrap items-end gap-2 rounded-2xl border bg-card p-3 shadow-sm">
        <input type="hidden" name="tab" value="sequencias" />
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">Módulo
          <select name="mod" defaultValue={moduloId} className="h-9 min-w-[220px] rounded-lg border bg-background px-2 text-sm text-foreground">
            {modulos.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </select>
        </label>
        <button type="submit" className="h-9 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90">Ver</button>
        <span className="ml-auto self-center text-xs text-muted-foreground">{fmt(comSeq)} com sequência ativa · {fmt(linhas.length)} no ranking</span>
      </form>

      {/* Métricas dos alunos que estão MANTENDO a sequência + gráfico de distribuição. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={<Users className="h-4 w-4" />} label="Com sequência ativa" valor={fmt(comSeq)} sub={`de ${fmt(linhas.length)} no ranking`} />
        <KpiCard icon={<TrendingUp className="h-4 w-4" />} tom="sky" label="Sequência média" valor={`${mediaSeq}d`} sub="entre quem mantém" />
        <KpiCard icon={<Trophy className="h-4 w-4" />} tom="amber" label="Maior sequência" valor={`${maiorSeq}d`} />
        <KpiCard icon={<Zap className="h-4 w-4" />} tom="emerald" label="Pontos no módulo" valor={fmt(pontosTotais)} />
      </div>

      <Painel titulo="Distribuição da sequência" sub="Quantos alunos em cada faixa de dias consecutivos" icon={<Flame className="h-4 w-4" />} tom="amber">
        <BarrasH itens={distSeq} tom="amber" max={Math.max(1, ...distSeq.map((d) => d.valor))} />
      </Painel>

      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="w-14 px-4 py-2.5 text-center">#</th>
              <th className="px-4 py-2.5">Aluno</th>
              <th className="px-4 py-2.5 text-center"><span className="inline-flex items-center gap-1"><Flame className="h-3 w-3" /> Sequência</span></th>
              <th className="px-4 py-2.5 text-center">Aulas concluídas</th>
              <th className="px-4 py-2.5 text-center">Pontos</th>
              <th className="px-4 py-2.5 text-center">Acertos</th>
            </tr>
          </thead>
          <tbody>
            {linhas.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Ninguém com atividade neste módulo ainda.</td></tr>
            ) : linhas.map((i, idx) => (
              <tr key={i.estudanteId} className="border-t transition-colors hover:bg-muted/40">
                <td className="px-4 py-2.5 text-center tabular-nums text-muted-foreground">{idx + 1}</td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <AvatarEstudante nome={i.nome} avatar={i.avatar} cor={i.avatarCor} className="h-8 w-8 border bg-muted text-[11px] text-muted-foreground" />
                    <div className="min-w-0">
                      <Link href={`/admin/estudantes/${i.estudanteId}`} className="font-medium hover:text-primary hover:underline">{i.nome}</Link>
                      {i.email && <div className="truncate text-xs text-muted-foreground">{i.email}</div>}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-center">
                  {i.streakAtual > 0
                    ? <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400"><Flame className="h-3 w-3" /> {i.streakAtual} dia{i.streakAtual === 1 ? '' : 's'}</span>
                    : <span className="text-xs text-muted-foreground">—</span>}
                </td>
                <td className="px-4 py-2.5 text-center tabular-nums text-muted-foreground">{i.aulasConcluidas}</td>
                <td className="px-4 py-2.5 text-center font-semibold tabular-nums">{fmt(i.score)}</td>
                <td className="px-4 py-2.5 text-center tabular-nums text-muted-foreground">{i.acertos}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">Sequência = dias consecutivos concluindo aula (leitura + quiz) neste módulo, em horário de Brasília. Reflete os ajustes manuais do suporte. Contas de teste ocultas não entram.</p>
    </div>
  )
}

async function AssinaturasEngajamento({ tenantId, pag, eng, q, pgina, sort, dir }: { tenantId: string; pag: string; eng: string; q: string; pgina: number; sort: string; dir: string }) {
  const [k, lista] = await Promise.all([
    engajamentoKpis(tenantId),
    engajamentoLista(tenantId, { pagina: pgina, pag, eng, busca: q, sort, dir }),
  ])
  if (lista.sqlOff || !k) {
    return <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6 text-sm text-amber-700 dark:text-amber-300">O cruzamento com assinaturas depende do <b>SQL agregado</b> (DATABASE_URL). Ele está indisponível no momento — confira a configuração para liberar esta análise.</div>
  }
  const totalPaginas = Math.max(1, Math.ceil(lista.total / lista.porPagina))
  const pctRecAtivo = k.recorrenteTotal ? Math.round((k.recorrenteAtivo / k.recorrenteTotal) * 100) : 0
  // Constrói a URL preservando os parâmetros atuais, aplicando overrides (paginação/ordenação).
  const mkHref = (ov: { pg?: number; sort?: EngajSortCol; dir?: 'asc' | 'desc' } = {}) => {
    const s = new URLSearchParams({ tab: 'assinaturas' })
    if (pag) s.set('pag', pag)
    if (eng) s.set('eng', eng)
    if (q) s.set('q', q)
    s.set('pg', String(ov.pg ?? lista.pagina))
    s.set('sort', ov.sort ?? lista.sort)
    s.set('dir', ov.dir ?? lista.dir)
    return `/admin/leitura/analise?${s.toString()}`
  }
  const qs = (pgNum: number) => mkHref({ pg: pgNum })
  // Cabeçalho ordenável: ao clicar na coluna ativa inverte a direção; senão aplica a direção padrão dela.
  const th = (col: EngajSortCol, label: string, padrao: 'asc' | 'desc', align: 'left' | 'right' = 'left') => {
    const ativa = lista.sort === col
    const prox = ativa ? (lista.dir === 'asc' ? 'desc' : 'asc') : padrao
    const Icon = ativa ? (lista.dir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown
    return (
      <Link href={mkHref({ sort: col, dir: prox, pg: 1 })} className={cn('inline-flex items-center gap-1 hover:text-foreground', align === 'right' && 'flex-row-reverse', ativa && 'text-foreground')}>
        {label} <Icon className={cn('h-3 w-3', !ativa && 'opacity-40')} />
      </Link>
    )
  }

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Pagam recorrente" valor={k.recorrenteTotal} tom="primary" sub={`de ${fmt(k.baseTotal)} alunos`} />
        <Kpi label="No Desafio (ativos)" valor={k.desafioAtivos} tom="sky" />
        <Kpi label="Recorrente + ativo" valor={k.recorrenteAtivo} tom="emerald" sub={`${pctRecAtivo}% dos recorrentes`} />
        <Kpi label="Recorrente s/ atividade" valor={k.recorrenteSemAtividade} tom="amber" sub="pagam, não fizeram" />
        <Kpi label="Ativo s/ recorrente" valor={k.ativoSemRecorrente} tom="violet" />
      </div>

      {/* Filtros (GET) */}
      <form method="get" className="flex flex-wrap items-end gap-2 rounded-2xl border bg-card p-3 shadow-sm">
        <input type="hidden" name="tab" value="assinaturas" />
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">Pagamento
          <select name="pag" defaultValue={pag} className="h-9 w-44 rounded-lg border bg-background px-2 text-sm text-foreground">
            <option value="">Todos</option>
            <option value="recorrente">Recorrente (Guru)</option>
            <option value="nao">Não recorrente</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">No Desafio
          <select name="eng" defaultValue={eng} className="h-9 w-40 rounded-lg border bg-background px-2 text-sm text-foreground">
            <option value="">Todos</option>
            <option value="fez">Fez (ativo)</option>
            <option value="naofez">Cadastrou, não fez</option>
          </select>
        </label>
        <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground">Buscar
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input name="q" defaultValue={q} placeholder="Nome ou e-mail…" className="h-9 w-full min-w-[180px] rounded-lg border bg-background pl-8 pr-3 text-sm text-foreground" />
          </div>
        </label>
        <button type="submit" className="h-9 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90">Filtrar</button>
        {(pag || eng || q) && <Link href="/admin/leitura/analise?tab=assinaturas" className="h-9 rounded-lg border px-3 text-sm leading-9 text-muted-foreground transition hover:bg-muted">Limpar</Link>}
      </form>

      <div className="text-xs text-muted-foreground">{fmt(lista.total)} aluno(s) no filtro</div>

      {/* Tabela */}
      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5">{th('nome', 'Aluno', 'asc')}</th>
              <th className="px-4 py-2.5">{th('recorrente', 'Pagamento', 'desc')}</th>
              <th className="px-4 py-2.5">{th('fez', 'No Desafio', 'desc')}</th>
              <th className="px-4 py-2.5 text-right">{th('aulas', 'Aulas lidas', 'desc', 'right')}</th>
              <th className="px-4 py-2.5">{th('ultima', 'Última atividade', 'desc')}</th>
              <th className="px-4 py-2.5 text-right"><span className="sr-only">Ações</span></th>
            </tr>
          </thead>
          <tbody>
            {lista.linhas.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Nenhum aluno neste filtro.</td></tr>
            ) : lista.linhas.map((a) => (
              <tr key={a.id} className="border-t transition-colors hover:bg-muted/40">
                <td className="px-4 py-2.5">
                  <Link href={`/admin/estudantes/${a.id}`} className="font-medium hover:text-primary hover:underline">{a.nome}</Link>
                  {a.email && <div className="text-xs text-muted-foreground">{a.email}</div>}
                </td>
                <td className="px-4 py-2.5">
                  {a.recorrente
                    ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400"><Repeat className="h-3 w-3" /> Recorrente</span>
                    : <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><CircleSlash className="h-3 w-3" /> {a.classificacao ?? 'não recorrente'}</span>}
                </td>
                <td className="px-4 py-2.5">
                  {a.fez
                    ? <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-4 w-4" /> Fazendo</span>
                    : <span className="text-amber-600 dark:text-amber-400">Cadastrou, não fez</span>}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{a.aulas}</td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground">{a.ultimaAtividade ? formatBrt(a.ultimaAtividade) : '—'}</td>
                <td className="px-4 py-2.5 text-right">
                  <Link href={mkHref({}).replace('/admin/leitura/analise?', `/admin/leitura/analise?aluno=${a.id}&`)} title="Expandir informações do aluno" aria-label={`Expandir informações de ${a.nome}`} className="inline-flex h-7 w-7 items-center justify-center rounded-lg border text-muted-foreground transition hover:bg-muted hover:text-foreground">
                    <Maximize2 className="h-3.5 w-3.5" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      {totalPaginas > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-xs text-muted-foreground">Página <b className="tabular-nums text-foreground">{lista.pagina}</b> de <b className="tabular-nums text-foreground">{fmt(totalPaginas)}</b></span>
          <div className="flex items-center gap-1">
            <PagLink href={qs(1)} disabled={lista.pagina <= 1}>Início</PagLink>
            <PagLink href={qs(lista.pagina - 1)} disabled={lista.pagina <= 1}>Anterior</PagLink>
            <PagLink href={qs(lista.pagina + 1)} disabled={lista.pagina >= totalPaginas}>Próxima</PagLink>
            <PagLink href={qs(totalPaginas)} disabled={lista.pagina >= totalPaginas}>Final</PagLink>
          </div>
        </div>
      )}
    </div>
  )
}

async function AlunoDetalhe({ tenantId, estudanteId, voltarHref }: { tenantId: string; estudanteId: string; voltarHref: string }) {
  const det = await engajamentoAlunoDetalhe(tenantId, estudanteId)
  if (!det) redirect(voltarHref)
  const { info, modulos, gamAtivo, sqlOff } = det

  if (sqlOff) {
    return (
      <div className="space-y-5">
        <Link href={voltarHref} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Assinaturas &amp; Engajamento</Link>
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6 text-sm text-amber-700 dark:text-amber-300">O detalhe do aluno depende do <b>SQL agregado</b> (DATABASE_URL), indisponível no momento.</div>
      </div>
    )
  }

  const aulasConcluidas = modulos.reduce((s, m) => s + m.aulasConcluidas, 0)
  const quizzesOk = modulos.reduce((s, m) => s + m.quizzesCompletos, 0)
  const pontosTotal = modulos.reduce((s, m) => s + m.pontosTotal, 0)
  const datas = modulos.map((m) => m.ultima).filter(Boolean) as string[]
  const ultima = datas.length ? datas.reduce((mx, d) => (d > mx ? d : mx)) : null

  return (
    <div className="space-y-5">
      <Link href={voltarHref} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Assinaturas &amp; Engajamento</Link>

      {/* Cabeçalho do aluno (estilo perfil, com a foto) */}
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border bg-card p-5 shadow-sm">
        <div className="flex min-w-0 items-center gap-4">
          <AvatarEstudante nome={info.nome} avatar={info.avatar} cor={info.avatarCor} className="h-16 w-16 border bg-muted text-xl text-muted-foreground" />
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold tracking-tight">{info.nome}</h1>
            {info.email && <div className="mt-0.5 truncate text-sm text-muted-foreground">{info.email}</div>}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {info.recorrente
                ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400"><Repeat className="h-3 w-3" /> Pagamento recorrente</span>
                : <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"><CircleSlash className="h-3 w-3" /> {info.classificacao ?? 'não recorrente'}</span>}
            </div>
          </div>
        </div>
        <Link href={`/admin/estudantes/${info.id}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground">
          <ExternalLink className="h-4 w-4" /> Perfil completo
        </Link>
      </div>

      {/* Resumo do Desafio */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Módulos com atividade" valor={modulos.length} tom="primary" />
        <Kpi label="Aulas concluídas" valor={aulasConcluidas} tom="sky" />
        <Kpi label="Quizzes completos" valor={quizzesOk} tom="emerald" />
        <Kpi label={gamAtivo ? 'Pontuação total' : 'Pontuação (acertos)'} valor={pontosTotal} tom="amber" />
        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="text-xs font-medium text-muted-foreground">Última atividade</div>
          <div className="mt-1 text-sm font-semibold text-foreground">{ultima ? formatBrt(ultima) : '—'}</div>
        </div>
      </div>

      {/* Aulas por módulo — tabela externa (recolher/expandir) com a tabela de aulas interna, tudo ordenável */}
      {modulos.length === 0 ? (
        <div className="rounded-2xl border bg-muted/30 p-8 text-center text-sm text-muted-foreground">Este aluno ainda não iniciou nenhuma aula do Desafio.</div>
      ) : (
        <EngajamentoModulosTabela modulos={modulos} gamAtivo={gamAtivo} />
      )}
    </div>
  )
}

function DocumentosTabela({ linhas }: { linhas: Awaited<ReturnType<typeof relatorioLeitura>> }) {
  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr><th className="px-4 py-2.5">Documento</th><th className="px-4 py-2.5">Iniciaram</th><th className="px-4 py-2.5">Concluíram</th><th className="px-4 py-2.5">% médio</th><th className="px-4 py-2.5">Tempo médio</th></tr>
        </thead>
        <tbody>
          {linhas.length === 0 ? (
            <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Nenhum documento criado ainda.</td></tr>
          ) : linhas.map((l) => (
            <tr key={l.id} className="border-t transition-colors hover:bg-muted/40">
              <td className="px-4 py-2.5">
                <Link href={`/admin/leitura/analise?doc=${l.id}`} className="font-medium hover:text-primary hover:underline">{l.titulo}</Link>
                {!l.publicado && <span className="ml-2 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">rascunho</span>}
              </td>
              <td className="px-4 py-2.5 tabular-nums">{l.iniciaram}</td>
              <td className="px-4 py-2.5 tabular-nums">{l.concluiram}</td>
              <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{l.pctMedio}%</td>
              <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{l.tempoMedioMin} min</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const TONS: Record<string, string> = {
  primary: 'text-primary', sky: 'text-sky-600 dark:text-sky-400', emerald: 'text-emerald-600 dark:text-emerald-400',
  amber: 'text-amber-600 dark:text-amber-400', violet: 'text-violet-600 dark:text-violet-400',
}
function Kpi({ label, valor, tom = 'primary', sub }: { label: string; valor: number; tom?: string; sub?: string }) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className={cn('mt-1 text-2xl font-bold tabular-nums', TONS[tom])}>{fmt(valor)}</div>
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  )
}

function AbaLink({ ativa, href, icon: Icon, children }: { ativa: boolean; href: string; icon: typeof FileText; children: React.ReactNode }) {
  return (
    <Link href={href} className={cn('-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors', ativa ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
      <Icon className="h-4 w-4" /> {children}
    </Link>
  )
}

function PagLink({ href, disabled, children }: { href: string; disabled?: boolean; children: React.ReactNode }) {
  if (disabled) return <span className="inline-flex h-8 items-center rounded-lg border px-3 text-muted-foreground opacity-40">{children}</span>
  return <Link href={href} className="inline-flex h-8 items-center rounded-lg border px-3 text-muted-foreground transition hover:bg-muted">{children}</Link>
}
