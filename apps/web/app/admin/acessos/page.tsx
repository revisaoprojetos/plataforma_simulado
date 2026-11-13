import Link from 'next/link'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { EstudioHeader } from '@/components/admin/estudio/estudio-header'
import { formatBrt } from '@/lib/brt'
import { rotuloAparelho } from '@/lib/acessos/user-agent'
import {
  resumoGlobal, listarAcessosGlobal, contasPorIp, duracaoMin, statusSessao,
  ROTULO_METODO, ROTULO_ORIGEM, METODOS, PERIODOS, MSG_NAO_ATIVADO,
} from '@/lib/acessos/leitura'
import { CartoesResumo, AvisoNaoAtivado } from '@/components/admin/acessos/blocos'
import { AcessosFiltros } from '@/components/admin/acessos/acessos-filtros'
import { AcessosGlobalTable, type SessaoLinha } from '@/components/admin/acessos/tabelas'

export const dynamic = 'force-dynamic'

type SP = { page?: string; pp?: string; sort?: string; dir?: string; q?: string; ip?: string; periodo?: string; metodo?: string; dispositivo?: string; alerta?: string; ativas?: string }

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

  const [lista, contas] = await Promise.all([
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
