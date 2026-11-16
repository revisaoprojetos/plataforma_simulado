import Link from 'next/link'
import { ArrowLeft, ClipboardList, Download } from 'lucide-react'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { EstudioHeader } from '@/components/admin/estudio/estudio-header'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatBrt } from '@/lib/brt'
import {
  resumoMembro, listarAtividadesMembro, aparelhosPorSessao, tempoRelativo, fmtSeg,
  ROTULO_TIPO_ADMIN, TIPOS_ADMIN, PERIODOS_ADMIN, MSG_NAO_ATIVADO_ADMIN,
} from '@/lib/admin-rastreio/leitura'
import { CartoesResumo, BlocoAlertas, AvisoNaoAtivado, AbasLinks } from '@/components/admin/acessos/blocos'
import { AcessosFiltros } from '@/components/admin/acessos/acessos-filtros'
import { AtividadesAdminTable, type AtivAdminLinha } from '@/components/admin/acessos-equipe/tabelas'
import { AcessosPorDiaTable } from '@/components/admin/acessos/dias-tabela'
import { listarDiasMembro } from '@/lib/admin-rastreio/dias'
import { linhaDoDia } from '@/lib/acessos/dia-tipos'
import { rotuloIp } from '@/lib/acessos/ip'

export const dynamic = 'force-dynamic'

type SP = { aba?: string; page?: string; pp?: string; sort?: string; dir?: string; q?: string; periodo?: string; tipo?: string }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Segurança › Equipe online › [admin]: ficha de acessos (cartões, alertas, linha do tempo e sessões). Exige `acessos:view`. */
export default async function AcessosMembroPage({ params, searchParams }: { params: Promise<{ userId: string }>; searchParams: Promise<SP> }) {
  const { userId } = await params
  const sp = await searchParams
  const access = await getCurrentAccess()
  if (!access.userId || !access.tenantId || !accessCan(access, 'acessos:view')) {
    return <div className="rounded-2xl border bg-card p-8 text-sm text-muted-foreground">Sem permissão para ver o registro de acessos da equipe.</div>
  }
  if (!UUID.test(userId)) return <div className="rounded-2xl border bg-card p-8 text-sm text-muted-foreground">Usuário inválido.</div>
  const tenantId = access.tenantId

  const aba = sp.aba === 'sessoes' ? 'sessoes' : 'atividade'
  const page = Math.max(1, Number(sp.page ?? 1) || 1)
  const pp = [10, 25, 50].includes(Number(sp.pp)) ? Number(sp.pp) : (aba === 'sessoes' ? 10 : 25)
  const dir = sp.dir === 'asc' ? 'asc' : 'desc'
  const q = (sp.q ?? '').trim().slice(0, 80)
  const base = `/admin/acessos-equipe/${userId}`

  const { indisponivel, resumo } = await resumoMembro(tenantId, userId)
  const nome = resumo?.nome ?? resumo?.email ?? 'Administrador'

  const acoes = (
    <>
      <Link href="/admin/acessos-equipe" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}><ArrowLeft className="h-4 w-4" />Equipe online</Link>
      <Link href={`/admin/auditoria?ator=${userId}`} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}><ClipboardList className="h-4 w-4" />Ver auditoria deste usuário</Link>
      {accessCan(access, 'acessos:export') && !indisponivel && (
        <a href={`/api/admin/acessos-equipe/exportar?user=${userId}`} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}><Download className="h-4 w-4" />Exportar CSV</a>
      )}
    </>
  )

  if (indisponivel || !resumo) {
    return (
      <div className="space-y-6">
        <EstudioHeader eyebrow="Segurança" titulo={`Acessos · ${nome}`} acoes={acoes} semAbas />
        <AvisoNaoAtivado msg={MSG_NAO_ATIVADO_ADMIN} />
      </div>
    )
  }

  const agora = Date.now()
  let tabela: React.ReactNode
  if (aba === 'sessoes') {
    const r = await listarDiasMembro(tenantId, userId, { page, pp, sort: sp.sort ?? 'dia', dir, q, periodo: sp.periodo })
    tabela = (
      <AcessosPorDiaTable rows={r.rows.map(linhaDoDia)} total={r.total} endpoint={`/api/admin/acessos-equipe/dia?user=${userId}`} nomePessoa={nome} fonteMemoria={r.fonte === 'memoria'} filtros={
        <AcessosFiltros selects={[{ param: 'periodo', label: 'Período', padrao: '30d', opcoes: Object.entries(PERIODOS_ADMIN).map(([value, v]) => ({ value, label: v.label })) }]} />
      } />
    )
  } else {
    const r = await listarAtividadesMembro(tenantId, userId, { page, pp, sort: sp.sort ?? 'criado_em', dir, q, periodo: sp.periodo, tipo: sp.tipo })
    const aps = await aparelhosPorSessao(tenantId, r.rows.map((a) => a.sessao_id ?? ''))
    const rows: AtivAdminLinha[] = r.rows.map((a) => {
      const det: string[] = []
      if (a.duracao_seg != null) det.push(`${fmtSeg(a.duracao_seg)} na página`)
      const m = (a.meta ?? {}) as Record<string, unknown>
      if (m.operacao) det.push(`${m.operacao} ${m.entidade ?? ''}`.trim())
      if (a.status != null && a.tipo === 'acao_api') det.push(a.status < 400 ? 'Sucesso' : 'Erro')
      return {
        id: a.id, quando: formatBrt(a.criado_em) ?? '—', relativo: tempoRelativo(a.criado_em, agora), tipo: a.tipo, tipoRotulo: ROTULO_TIPO_ADMIN[a.tipo] ?? a.tipo,
        pagina: a.rota ?? '—', rotaApi: a.rota_api ? `${a.metodo ? a.metodo + ' ' : ''}${a.rota_api}` : '—', ip: rotuloIp(a.ip),
        aparelho: (a.sessao_id && aps.get(a.sessao_id)) || '—', detalhe: det.join(' · ') || '—',
        sessao: a.sessao_id ? a.sessao_id.slice(0, 8) : '—', requestId: a.request_id ?? '',
      }
    })
    tabela = (
      <AtividadesAdminTable rows={rows} total={r.total} filtros={
        <AcessosFiltros selects={[
          { param: 'periodo', label: 'Período', padrao: '7d', opcoes: Object.entries(PERIODOS_ADMIN).map(([value, v]) => ({ value, label: v.label })) },
          { param: 'tipo', label: 'Ação', opcoes: [{ value: '', label: 'Todas' }, ...TIPOS_ADMIN.map((t) => ({ value: t, label: ROTULO_TIPO_ADMIN[t] }))] },
        ]} />
      } />
    )
  }

  return (
    <div className="space-y-6">
      <EstudioHeader eyebrow="Segurança" titulo={`Acessos · ${nome}`} acoes={acoes} semAbas />
      <p className="-mt-3 text-sm text-muted-foreground">
        {[resumo.email, resumo.papel].filter(Boolean).join(' · ')} {resumo.online ? '· Online agora' : '· Offline'}
      </p>
      <CartoesResumo itens={[
        { label: 'Último acesso', valor: <span className="text-base">{resumo.ultimoAcesso ? `${tempoRelativo(resumo.ultimoAcesso, agora)} · ${formatBrt(resumo.ultimoAcesso)}` : 'sem registro'}</span> },
        { label: 'Sessões (7 dias)', valor: resumo.sessoes7d },
        { label: 'Sessões (30 dias)', valor: resumo.sessoes30d },
        { label: 'IPs distintos (30d)', valor: resumo.ipsDistintos30d },
        { label: 'Aparelhos distintos (30d)', valor: resumo.aparelhosDistintos30d },
        { label: 'Tempo ativo (30d)', valor: <span className="text-xl">{fmtSeg(resumo.tempoAtivoSeg30d)}</span>, dica: 'Por sessão: o maior entre o tempo com a aba visível e (último visto − início); mesma fonte da tabela por dia.' },
      ]} />
      <BlocoAlertas alertas={resumo.alertas} />
      <AbasLinks itens={[
        { label: 'Atividade', href: base, ativo: aba === 'atividade' },
        { label: 'Sessões', href: `${base}?aba=sessoes`, ativo: aba === 'sessoes' },
      ]} />
      {tabela}
    </div>
  )
}
