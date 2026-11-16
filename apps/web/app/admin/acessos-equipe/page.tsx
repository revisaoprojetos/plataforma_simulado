import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { EstudioHeader } from '@/components/admin/estudio/estudio-header'
import { listarEquipe, MSG_NAO_ATIVADO_ADMIN } from '@/lib/admin-rastreio/leitura'
import { CartoesResumo, AvisoNaoAtivado } from '@/components/admin/acessos/blocos'
import { AcessosFiltros } from '@/components/admin/acessos/acessos-filtros'
import { EquipeOnlineTable, type EquipeLinhaUi } from '@/components/admin/acessos-equipe/tabelas'

export const dynamic = 'force-dynamic'

type SP = { page?: string; pp?: string; sort?: string; dir?: string; q?: string; status?: string; papel?: string }

/**
 * Segurança › Equipe online: quem da equipe (admins) está conectado agora, em que página, de qual aparelho.
 * Tudo agregado no servidor (lib/admin-rastreio/leitura). Exige `acessos:view`; aluno nunca chega aqui (gate do /admin).
 */
export default async function EquipeOnlinePage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const access = await getCurrentAccess()
  if (!access.userId || !access.tenantId || !accessCan(access, 'acessos:view')) {
    return <div className="rounded-2xl border bg-card p-8 text-sm text-muted-foreground">Sem permissão para ver o registro de acessos da equipe.</div>
  }
  const page = Math.max(1, Number(sp.page ?? 1) || 1)
  const pp = [10, 25, 50].includes(Number(sp.pp)) ? Number(sp.pp) : 25

  const r = await listarEquipe(access.tenantId, access.userId, {
    page, pp, sort: sp.sort ?? 'ultima', dir: sp.dir === 'asc' ? 'asc' : 'desc', q: (sp.q ?? '').trim().slice(0, 80),
    status: sp.status, papel: sp.papel,
  })
  if (r.indisponivel) {
    return (
      <div className="space-y-6">
        <EstudioHeader eyebrow="Segurança" titulo="Equipe online" semAbas />
        <AvisoNaoAtivado msg={MSG_NAO_ATIVADO_ADMIN} />
      </div>
    )
  }

  const rows: EquipeLinhaUi[] = r.rows.map((l) => ({
    userId: l.userId, nome: l.nome, email: l.email, papel: l.papel, voce: l.voce, online: l.online, sessoes: l.sessoes, paginas: l.paginas,
    conectadoHa: l.conectadoHa, tempoAtivo: l.tempoAtivo, ultimaAtividade: l.ultimaAtividade, dispositivos: l.dispositivos,
  }))

  return (
    <div className="space-y-6">
      <EstudioHeader eyebrow="Segurança" titulo="Equipe online" semAbas />
      <CartoesResumo itens={[
        { label: 'Online agora', valor: r.resumo.online, dica: 'Com sinal de vida nos últimos 3 minutos' },
        { label: 'Sessões abertas', valor: r.resumo.sessoesAtivas },
        { label: 'Membros da equipe', valor: r.resumo.total },
      ]} />
      <EquipeOnlineTable rows={rows} total={r.total} podeEncerrar={accessCan(access, 'acessos:manage')} filtros={
        <AcessosFiltros selects={[
          { param: 'status', label: 'Status', opcoes: [{ value: '', label: 'Todos' }, { value: 'online', label: 'Online' }, { value: 'offline', label: 'Offline' }] },
          { param: 'papel', label: 'Papel', opcoes: [{ value: '', label: 'Todos' }, ...r.papeis.map((p) => ({ value: p, label: p }))] },
        ]} />
      } />
      <p className="text-xs text-muted-foreground">Dados coletados a partir da ativação do rastreio, mantidos por 180 dias. IP e aparelho são dados pessoais: acesso restrito a quem tem a permissão de acessos.</p>
    </div>
  )
}
