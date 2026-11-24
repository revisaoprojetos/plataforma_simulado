import { createAdminClient } from '@/lib/supabase/server'
import { formatBrt } from '@/lib/brt'
import { listarSprints } from '@/lib/revisao/cronograma'
import { RevisaoCard } from '@/components/admin/revisao/ui'
import { BarraBusca, Nota, ParamsInt, Pilula, ThFixo, ThOrd } from '../../../_comp/lista'
import { TabelaCron } from '../../tabela-cron'
import { ExcluirSprint, SprintDialogo } from '../../acoes-client'
import { BASE, porPagina, qsAdaptativo, type PropsAbaAdaptativo } from '../comum'

// Sub-aba "Sprints" do Adaptativo (?aba=adaptativo&sub=sprint).

const STATUS_SPRINT = { rascunho: { l: 'Rascunho', t: 'mut' }, ativo: { l: 'Ativo', t: 'ok' }, encerrado: { l: 'Encerrado', t: 'warn' } } as const

export default async function AdaptativoSprints({ sp, tenantId, podeEditar }: PropsAbaAdaptativo) {
  const qs = qsAdaptativo(sp, 'sprint')
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
      <BarraBusca base={BASE} qs={qs} preservar={['aba', 'sub', 'v']} placeholder="Buscar sprint" filtros={[{ nome: 'status', rotulo: 'Todas as situações', opcoes: [{ v: 'rascunho', l: 'Rascunho' }, { v: 'ativo', l: 'Ativo' }, { v: 'encerrado', l: 'Encerrado' }] }]} />
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
