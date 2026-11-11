import { SemPermissao } from '@/components/ui/alert-box'
import { checkPermission } from '@/lib/auth/permissions'
import { montarQsGerador, paginaGerador, porPaginaGerador } from '@/lib/revisao/gerador/metas'
import { paginarPacotes } from '@/lib/revisao/gerador/acessos'
import { BarraBusca, KpiCard, KpiGrid, Nota, Pilula, ThFixo, ThOrd } from '../../../_comp/lista'
import { AcoesPacote, NovoPacote, TabelaAcessos } from './acessos-client'

// Sub-aba "Grupos de acessos" do Gerador: pacotes de cronogramas e quem os recebe (grupos de alunos / avulsos / todos).
// Só LÊ dados prontos (lib/revisao/gerador/acessos); mutações = actions existentes de /admin/cronogramas/pacotes.
// Vincular cronogramas/grupos/alunos continua no editor do pacote (link "Abrir editor").

const PRESERVAR = ['aba', 'sub', 'ord', 'dir', 'pps']

export default async function GeradorAcessos({ sp, tenantId, basePath }: { sp: Record<string, string | string[] | undefined>; tenantId: string; basePath: string }) {
  const { path, qs } = montarQsGerador(sp, basePath)
  const [editar, excluir, liberar] = await Promise.all([checkPermission('cronogramas:update'), checkPermission('cronogramas:delete'), checkPermission('cronogramas:liberar')])
  const r = await paginarPacotes(tenantId, { q: qs.q, status: qs.status, ord: qs.ord, dir: qs.dir === 'desc' ? 'desc' : 'asc', pagina: paginaGerador(qs.pag), por: porPaginaGerador(qs.pps) })
  if (!r.ok) return <SemPermissao>{r.error}</SemPermissao>
  const nf = (n: number) => n.toLocaleString('pt-BR')

  return (
    <>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground">É por aqui que o aluno recebe acesso: cada grupo de acesso reúne cronogramas e é liberado para grupos de alunos ou alunos avulsos. O vínculo é uma linha só — o acesso é resolvido na leitura, sem copiar alunos.</p>
        {editar && <NovoPacote />}
      </div>
      <KpiGrid cols={3}>
        <KpiCard rotulo="Grupos de acesso" valor={nf(r.kpis.pacotes)} />
        <KpiCard rotulo="Cronogramas vinculados" valor={nf(r.kpis.cronogramas)} />
        <KpiCard rotulo="Alunos alcançados" valor={nf(r.kpis.alcance)} />
      </KpiGrid>
      {r.kpis.gratuitos > 0 && <Nota tipo="aviso">{r.kpis.gratuitos} grupo(s) liberado(s) para TODOS os alunos da plataforma (filtro “Liberado a todos”).</Nota>}
      <BarraBusca base={path} qs={qs} preservar={PRESERVAR} placeholder="Buscar grupo de acesso (nome ou descrição)"
        filtros={[{ nome: 'status', rotulo: 'Todos os status', opcoes: [{ v: 'ativo', l: 'Ativos' }, { v: 'inativo', l: 'Inativos' }, { v: 'gratuito', l: 'Liberado a todos' }] }]} />
      <TabelaAcessos perm={{ editar, excluir, liberar }} total={r.total} page={paginaGerador(qs.pag)} pp={porPaginaGerador(qs.pps)} colunas={7}
        vazio={r.kpis.pacotes ? 'Nenhum grupo de acesso encontrado com esses filtros.' : 'Nenhum grupo de acesso ainda.'}
        head={<><ThOrd rotulo="Grupo de acesso" col="nome" base={path} qs={qs} /><ThOrd rotulo="Cronogramas" col="cronogramas" base={path} qs={qs} /><ThOrd rotulo="Grupos de alunos" col="grupos" base={path} qs={qs} /><ThFixo>Avulsos</ThFixo><ThOrd rotulo="Alunos alcançados" col="alcance" base={path} qs={qs} /><ThOrd rotulo="Status" col="status" base={path} qs={qs} /><ThFixo align="right">Ações</ThFixo></>}
        rows={r.linhas.map((p) => ({
          id: p.id,
          dados: { id: p.id, nome: p.nome, descricao: p.descricao, ativo: p.ativo, acesso_gratuito: p.acesso_gratuito, cronogramas: p.cronogramas, grupos: p.grupos, estudantes: p.estudantes, alcance: p.alcance },
          cells: [
            <span key="n" className="block max-w-[22rem]"><b className="block truncate font-medium" title={p.nome}>{p.nome}</b>{p.descricao && <span className="block truncate text-xs text-muted-foreground" title={p.descricao}>{p.descricao}</span>}</span>,
            <span key="c" className="tabular-nums">{nf(p.cronogramas)}</span>,
            <span key="g" className="tabular-nums">{nf(p.grupos)}</span>,
            <span key="e" className="tabular-nums">{nf(p.estudantes)}</span>,
            <span key="a" className="font-semibold tabular-nums">{nf(p.alcance)}</span>,
            <span key="s" className="flex flex-wrap gap-1"><Pilula tipo={p.ativo ? 'ok' : 'mut'}>{p.ativo ? 'Ativo' : 'Inativo'}</Pilula>{p.acesso_gratuito && <Pilula tipo="vio">Liberado a todos</Pilula>}</span>,
            <AcoesPacote key="x" p={{ id: p.id, nome: p.nome, descricao: p.descricao, ativo: p.ativo, acesso_gratuito: p.acesso_gratuito, cronogramas: p.cronogramas, grupos: p.grupos, estudantes: p.estudantes, alcance: p.alcance }} perm={{ editar, excluir, liberar }} />,
          ],
        }))} />
    </>
  )
}
