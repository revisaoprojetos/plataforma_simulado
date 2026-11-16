import Link from 'next/link'
import { Download } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatBrt } from '@/lib/brt'
import { rotuloIp } from '@/lib/acessos/ip'
import {
  resumoAluno, listarAtividadesAluno, fmtDuracao,
  ROTULO_METODO, ROTULO_ORIGEM, ROTULO_ATIVIDADE, METODOS, TIPOS_ATIVIDADE, PERIODOS, MSG_NAO_ATIVADO,
} from '@/lib/acessos/leitura'
import { CartoesResumo, BlocoAlertas, AvisoNaoAtivado, AbasLinks } from '@/components/admin/acessos/blocos'
import { AcessosFiltros } from '@/components/admin/acessos/acessos-filtros'
import { EncerrarSessoesButton } from '@/components/admin/acessos/encerrar-sessoes-button'
import { AtividadesAlunoTable, type AtividadeLinha } from '@/components/admin/acessos/tabelas'
import { AcessosPorDiaTable } from '@/components/admin/acessos/dias-tabela'
import { listarDiasAluno } from '@/lib/acessos/dias'
import { linhaDoDia } from '@/lib/acessos/dia-tipos'

export type AcessosSP = { aba?: string; page?: string; pp?: string; sort?: string; dir?: string; q?: string; periodo?: string; metodo?: string; tipo?: string }
type SP = AcessosSP

/** Conteúdo da aba "Acessos e atividade" do PERFIL do aluno (o cabeçalho e as abas do perfil ficam fora). */
export async function AcessosAlunoConteudo({ id, sp }: { id: string; sp: SP }) {
  const access = await getCurrentAccess()
  if (!access.userId || !access.tenantId || !accessCan(access, 'acessos:view')) {
    return <div className="rounded-2xl border bg-card p-8 text-sm text-muted-foreground">Sem permissão para ver o registro de acessos de alunos.</div>
  }
  const tenantId = access.tenantId
  const { data: est } = await createAdminClient().from('simulado_estudantes').select('id, nome, email').eq('id', id).eq('tenant_id', tenantId).maybeSingle()
  if (!est) return null
  const nome = (est.nome as string | null) ?? 'Aluno'

  const aba = sp.aba === 'atividade' ? 'atividade' : 'sessoes'
  const page = Math.max(1, Number(sp.page ?? 1) || 1)
  const pp = [10, 25, 50].includes(Number(sp.pp)) ? Number(sp.pp) : (aba === 'atividade' ? 25 : 10)
  const dir = sp.dir === 'asc' ? 'asc' : 'desc'
  const q = (sp.q ?? '').trim().slice(0, 80)
  const podeExportar = accessCan(access, 'acessos:export')
  const podeEncerrar = accessCan(access, 'acessos:manage')

  const { indisponivel, resumo } = await resumoAluno(tenantId, id)
  const base = `/admin/estudantes/${id}?tab=acessos`

  const acoes = (
    <>
      {podeExportar && !indisponivel && (
        <a href={`/api/admin/acessos/exportar?estudante=${id}`} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}><Download className="h-4 w-4" />Exportar CSV</a>
      )}
      {podeEncerrar && !indisponivel && <EncerrarSessoesButton estudanteId={id} nome={nome} />}
    </>
  )

  if (indisponivel || !resumo) {
    return (
      <div className="space-y-6">
        <AvisoNaoAtivado msg={MSG_NAO_ATIVADO} />
      </div>
    )
  }

  let tabela: React.ReactNode
  if (aba === 'sessoes') {
    const r = await listarDiasAluno(tenantId, id, { page, pp, sort: sp.sort ?? 'dia', dir, q, periodo: sp.periodo, metodo: sp.metodo })
    tabela = (
      <AcessosPorDiaTable rows={r.rows.map(linhaDoDia)} total={r.total} endpoint={`/api/admin/acessos/dia?estudante=${id}`} nomePessoa={nome} fonteMemoria={r.fonte === 'memoria'} filtros={
        <AcessosFiltros selects={[
          { param: 'periodo', label: 'Período', padrao: '180d', opcoes: Object.entries(PERIODOS).map(([value, v]) => ({ value, label: v.label })) },
          { param: 'metodo', label: 'Método', opcoes: [{ value: '', label: 'Todos' }, ...METODOS.map((m) => ({ value: m, label: ROTULO_METODO[m] }))] },
        ]} />
      } />
    )
  } else {
    const r = await listarAtividadesAluno(tenantId, id, { page, pp, sort: sp.sort ?? 'criado_em', dir, q, periodo: sp.periodo, tipo: sp.tipo })
    const rows: AtividadeLinha[] = r.rows.map((a) => {
      const m = (a.meta ?? {}) as Record<string, unknown>
      const det: string[] = []
      if (m.qtd && Number(m.qtd) > 1) det.push(`${m.qtd} no lote (${m.janela_seg ?? 0}s)`)
      if (m.origem) det.push(m.origem === 'pdf' ? 'PDF' : 'texto')
      if (m.pct != null) det.push(`${m.pct}%`)
      if (m.acertos != null) det.push(`${m.acertos}/${m.total}`)
      if (m.rajada) det.push(`rajada: ${m.rajada_max_10s} em 10s`)
      if (a.duracao_seg != null) det.push(`${a.duracao_seg >= 60 ? `${Math.floor(a.duracao_seg / 60)}min ${a.duracao_seg % 60}s` : `${a.duracao_seg}s`} na página`)
      if (m.teste) det.push('teste')
      return {
        id: a.id, quando: formatBrt(a.criado_em) ?? '—', tipo: a.tipo, tipoRotulo: ROTULO_ATIVIDADE[a.tipo] ?? a.tipo,
        item: a.itemTitulo ?? a.rota ?? a.ref_id ?? '—', detalhe: det.join(' · ') || '—', ip: rotuloIp(a.ip), impersonado: !!m.impersonado_por, rajada: m.rajada === true,
      }
    })
    tabela = (
      <AtividadesAlunoTable rows={rows} total={r.total} filtros={
        <AcessosFiltros selects={[
          { param: 'periodo', label: 'Período', padrao: '30d', opcoes: Object.entries(PERIODOS).map(([value, v]) => ({ value, label: v.label })) },
          { param: 'tipo', label: 'Tipo', opcoes: [{ value: '', label: 'Todos' }, ...TIPOS_ATIVIDADE.map((t) => ({ value: t, label: ROTULO_ATIVIDADE[t] }))] },
        ]} />
      } />
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Acessos e atividade · {nome}</h2>
        <div className="flex flex-wrap items-center gap-2">{acoes}</div>
      </div>
      <CartoesResumo itens={[
        { label: 'Último acesso', valor: <span className="text-base">{formatBrt(resumo.ultimoAcesso) ?? 'sem registro'}</span> },
        { label: 'Sessões (7 dias)', valor: resumo.sessoes7d },
        { label: 'Sessões (30 dias)', valor: resumo.sessoes30d },
        { label: 'IPs distintos (30d)', valor: resumo.ipsDistintos30d },
        { label: 'Aparelhos distintos (30d)', valor: resumo.aparelhosDistintos30d },
        { label: 'Tempo estimado (30d)', valor: <span className="text-xl">{fmtDuracao(resumo.tempoTotalMin30d)}</span>, dica: 'Por sessão: o maior entre (último visto − início) e a soma do tempo nas páginas; mesma fonte da tabela por dia.' },
      ]} />
      <BlocoAlertas alertas={resumo.alertas} />
      <AbasLinks itens={[
        { label: 'Sessões', href: base, ativo: aba === 'sessoes' },
        { label: 'Atividade', href: `${base}&aba=atividade`, ativo: aba === 'atividade' },
      ]} />
      {tabela}
    </div>
  )
}
