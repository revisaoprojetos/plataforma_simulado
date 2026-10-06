import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, CheckCircle2, BarChart3, FileText, Flame, Users, TrendingUp, Trophy, Zap } from 'lucide-react'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { relatorioLeitura, detalheDocumento, modulosLeitura } from './_dados'
import { carregarRankingModulo } from '@/lib/leitura/ranking'
import { KpiCard, BarrasH, Painel } from '@/components/admin/relatorios/viz'
import { AvatarEstudante } from '@/components/aluno/avatar-estudante'
import { formatBrt } from '@/lib/brt'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const fmt = (n: number) => n.toLocaleString('pt-BR')

export default async function AnaliseLeituraPage({ searchParams }: { searchParams: Promise<{ doc?: string; p?: string; tab?: string; mod?: string }> }) {
  if (!(await checkPermission('relatorios:view'))) redirect('/admin')
  const access = await getCurrentAccess()
  if (!access.tenantId) redirect('/admin')
  const { doc, p, tab, mod } = await searchParams

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

  // Tab 'assinaturas' foi movida para a área própria /admin/relatorios/engajamento; aqui cai no default.
  const aba = tab === 'sequencias' ? 'sequencias' : 'documentos'

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><BarChart3 className="h-6 w-6 text-primary" /> Análise · Desafio de Lei Seca</h1>
        <p className="text-muted-foreground">Progresso por documento e sequências do Desafio.</p>
      </div>

      {/* Abas */}
      <div className="flex gap-1 border-b">
        <AbaLink ativa={aba === 'documentos'} href="/admin/leitura/analise" icon={FileText}>Documentos</AbaLink>
        <AbaLink ativa={aba === 'sequencias'} href="/admin/leitura/analise?tab=sequencias" icon={Flame}>Sequências</AbaLink>
      </div>

      {aba === 'sequencias' ? (
        <SequenciasRelatorio tenantId={access.tenantId} mod={mod ?? ''} />
      ) : (
        <DocumentosTabela linhas={await relatorioLeitura(access.tenantId)} />
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
