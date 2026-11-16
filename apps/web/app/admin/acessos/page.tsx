import Link from 'next/link'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { EstudioHeader } from '@/components/admin/estudio/estudio-header'
import { formatBrt } from '@/lib/brt'
import { rotuloAparelho } from '@/lib/acessos/user-agent'
import {
  resumoGlobal, listarAcessosGlobal, contasPorIp, duracaoMin, statusSessao,
  ROTULO_METODO, ROTULO_ORIGEM, ROTULO_ATIVIDADE, METODOS, PERIODOS, MSG_NAO_ATIVADO, metricasPainel,
  type MetricasPainel,
} from '@/lib/acessos/leitura'
import { CartoesResumo, AvisoNaoAtivado } from '@/components/admin/acessos/blocos'
import { AcessosFiltros } from '@/components/admin/acessos/acessos-filtros'
import { AcessosGlobalTable, type SessaoLinha } from '@/components/admin/acessos/tabelas'

export const dynamic = 'force-dynamic'

type SP = { page?: string; pp?: string; sort?: string; dir?: string; q?: string; ip?: string; periodo?: string; metodo?: string; dispositivo?: string; alerta?: string; ativas?: string }

const fmtSeg = (s: number | null) => (s == null ? '—' : s < 60 ? `${s} s` : s < 3600 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1)} h`)
const BARRA = 'min-w-[2px] flex-1 rounded-t bg-[var(--brand-primary,hsl(var(--primary)))]'

/** Métricas de uso (calculadas no banco): DAU/WAU, acessos por dia, páginas mais vistas, tempo, tipos e horário de pico. */
function MetricasBloco({ m, periodo }: { m: MetricasPainel; periodo: string }) {
  const maxDia = Math.max(1, ...m.por_dia.map((d) => d.acessos))
  const horas = Array.from({ length: 24 }, (_, h) => m.por_hora.find((x) => x.hora === h)?.acessos ?? 0)
  const maxHora = Math.max(1, ...horas)
  const pico = maxHora > 1 || horas.some((v) => v > 0) ? horas.indexOf(maxHora) : -1
  const cartao = 'rounded-2xl border bg-card p-4 shadow-sm'
  const tit = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground'
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold">Uso da plataforma <span className="font-normal text-muted-foreground">— {periodo}</span></h2>
      <CartoesResumo itens={[
        { label: 'Ativos hoje (DAU)', valor: m.dau, dica: 'Alunos com acesso nas últimas 24 h' },
        { label: 'Ativos na semana (WAU)', valor: m.wau },
        { label: 'Ativos no mês (MAU)', valor: m.mau },
        { label: 'Alunos no período', valor: m.alunos_periodo },
        { label: 'Tempo médio / página', valor: fmtSeg(m.tempo_medio_pagina_seg) },
        { label: 'Horário de pico', valor: pico >= 0 ? `${String(pico).padStart(2, '0')}h` : '—', dica: 'Horário (BRT) com mais acessos' },
      ]} />
      <div className="grid gap-3 lg:grid-cols-2">
        <div className={cartao}>
          <h3 className={tit}>Acessos por dia</h3>
          <div className="mt-3 flex h-28 items-end gap-0.5" role="img" aria-label="Acessos por dia">
            {m.por_dia.map((d) => <div key={d.dia} className={BARRA} style={{ height: `${Math.max(4, (d.acessos / maxDia) * 100)}%` }} title={`${d.dia}: ${d.acessos} acessos, ${d.alunos} alunos`} />)}
          </div>
        </div>
        <div className={cartao}>
          <h3 className={tit}>Acessos por hora (BRT)</h3>
          <div className="mt-3 flex h-28 items-end gap-0.5" role="img" aria-label="Acessos por hora">
            {horas.map((v, h) => <div key={h} className={BARRA} style={{ height: `${Math.max(3, (v / maxHora) * 100)}%` }} title={`${h}h: ${v}`} />)}
          </div>
        </div>
        <div className={cartao}>
          <h3 className={tit}>Páginas mais vistas</h3>
          {m.top_paginas.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">Sem dados ainda.</p> : (
            <ul className="mt-2 divide-y text-sm">
              {m.top_paginas.map((p) => (
                <li key={p.rota} className="flex items-center justify-between gap-2 py-1.5"><span className="min-w-0 truncate font-mono text-xs">{p.rota}</span><span className="shrink-0 text-xs tabular-nums text-muted-foreground">{p.vistas} vistas · {p.alunos} alunos</span></li>
              ))}
            </ul>
          )}
        </div>
        <div className={cartao}>
          <h3 className={tit}>Atividades por tipo</h3>
          {m.por_tipo.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">Sem dados ainda.</p> : (
            <ul className="mt-2 divide-y text-sm">
              {m.por_tipo.map((t) => (
                <li key={t.tipo} className="flex items-center justify-between gap-2 py-1.5"><span>{ROTULO_ATIVIDADE[t.tipo] ?? t.tipo}</span><span className="text-xs tabular-nums text-muted-foreground">{t.total}</span></li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}

/**
 * Segurança › Acessos de alunos: painel global do registro de acessos (IP/aparelho/método), com contadores,
 * lista paginada no servidor, busca por IP/aluno e "contas que usaram o mesmo IP". Exige `acessos:view`.
 */
export default async function AcessosGlobalPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const access = await getCurrentAccess()
  if (!access.userId || !access.tenantId || !accessCan(access, 'acessos:view')) {
    return <div className="rounded-2xl border bg-card p-8 text-sm text-muted-foreground">Sem permissão para ver o registro de acessos de alunos.</div>
  }
  const tenantId = access.tenantId
  const page = Math.max(1, Number(sp.page ?? 1) || 1)
  const pp = [10, 25, 50].includes(Number(sp.pp)) ? Number(sp.pp) : 25
  const ip = (sp.ip ?? '').trim().slice(0, 64)

  const { indisponivel, resumo } = await resumoGlobal(tenantId)
  if (indisponivel || !resumo) {
    return (
      <div className="space-y-6">
        <EstudioHeader eyebrow="Segurança" titulo="Acessos de alunos" semAbas />
        <AvisoNaoAtivado msg={MSG_NAO_ATIVADO} />
      </div>
    )
  }

  const [metricas, lista, contas] = await Promise.all([
    metricasPainel(tenantId, sp.periodo),
    listarAcessosGlobal(tenantId, {
      page, pp, sort: sp.sort ?? 'iniciado_em', dir: sp.dir === 'asc' ? 'asc' : 'desc', q: (sp.q ?? '').trim().slice(0, 80),
      ip: ip || undefined, periodo: sp.periodo, metodo: sp.metodo, dispositivo: sp.dispositivo,
      alerta: sp.alerta === '1', ativas: sp.ativas === '1', alertaIds: resumo.alertaIds,
    }),
    ip ? contasPorIp(tenantId, ip) : Promise.resolve([]),
  ])

  const agora = Date.now()
  const alertaSet = new Set(resumo.alertaIds)
  const rows: SessaoLinha[] = lista.rows.map((a) => ({
    id: a.id, estudanteId: a.estudante_id, nome: a.nome, email: a.email,
    inicio: formatBrt(a.iniciado_em) ?? '—', visto: formatBrt(a.ultimo_visto_em) ?? '—', duracao: String(duracaoMin(a)),
    ip: a.ip, aparelho: rotuloAparelho(a), metodo: ROTULO_METODO[a.metodo] ?? a.metodo, origem: ROTULO_ORIGEM[a.origem] ?? a.origem,
    status: statusSessao(a, agora), motivo: a.motivo_encerramento, impersonado: !!a.impersonado_por, alerta: alertaSet.has(a.estudante_id),
  }))

  return (
    <div className="space-y-6">
      <EstudioHeader eyebrow="Segurança" titulo="Acessos de alunos" semAbas />
      {metricas && <MetricasBloco m={metricas} periodo={PERIODOS[sp.periodo ?? '']?.label ?? PERIODOS['7d'].label} />}
      <CartoesResumo itens={[
        { label: 'Sessões ativas agora', valor: resumo.sessoesAtivas, dica: 'Com sinal de vida nos últimos 30 minutos' },
        { label: 'Alunos com alerta (7d)', valor: resumo.alunosComAlerta },
        { label: 'Sessões (24h)', valor: resumo.sessoes24h },
        { label: 'IPs distintos (24h)', valor: resumo.ips24h },
      ]} />

      {ip && (
        <section className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Contas que usaram o IP <span className="tabular-nums">{ip}</span> (últimos 90 dias)</h2>
            <Link href="/admin/acessos" className="text-xs text-muted-foreground hover:underline">Limpar filtro de IP</Link>
          </div>
          {contas.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">Nenhuma conta encontrada para este IP.</p>
          ) : (
            <ul className="mt-2 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {contas.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-sm">
                  <Link href={`/admin/estudantes/${c.id}/acessos`} className="min-w-0 truncate font-medium hover:underline">{c.nome ?? c.email ?? c.id.slice(0, 8)}</Link>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{c.sessoes} sessão(ões)</span>
                </li>
              ))}
            </ul>
          )}
          {contas.length > 1 && <p className="mt-2 text-xs text-muted-foreground">Várias contas no mesmo IP podem ser uma casa/escritório ou a rede de uma operadora; só é suspeito junto com outros sinais.</p>}
        </section>
      )}

      <AcessosGlobalTable rows={rows} total={lista.total} filtros={
        <AcessosFiltros
          selects={[
            { param: 'periodo', label: 'Período', padrao: '7d', opcoes: Object.entries(PERIODOS).map(([value, v]) => ({ value, label: v.label })) },
            { param: 'metodo', label: 'Método', opcoes: [{ value: '', label: 'Todos' }, ...METODOS.map((m) => ({ value: m, label: ROTULO_METODO[m] }))] },
            { param: 'dispositivo', label: 'Aparelho', opcoes: [{ value: '', label: 'Todos' }, { value: 'desktop', label: 'Desktop' }, { value: 'celular', label: 'Celular' }, { value: 'tablet', label: 'Tablet' }] },
          ]}
          toggles={[{ param: 'alerta', label: 'Com alerta' }, { param: 'ativas', label: 'Ativas agora' }]}
        />
      } />
    </div>
  )
}
