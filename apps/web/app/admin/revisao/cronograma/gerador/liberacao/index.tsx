import { createAdminClient } from '@/lib/supabase/server'
import { checkPermission } from '@/lib/auth/permissions'
import { RevisaoAbas } from '@/components/admin/revisao/ui'
import { dirDe, inteiro, lerQs, porPaginaDe, type SP } from '@/lib/revisao/gerador/comum-ger3'
import { carregarBaseLiberacao, listarAlunosExcecao, listarGruposLiberacao } from '@/lib/revisao/gerador/liberacao'
import { BarraBusca, Nota, ThFixo, ThOrd } from '../../../_comp/lista'
import { LiberacaoPainel } from './liberacao-painel'

// Sub-aba "Liberação" (Gerador): mesma configuração do Adaptativo · Liberação (liberação dos materiais por data do plano),
// com as exceções (grupos e alunos) numa tabela paginada no servidor. Gravação: action existente salvarPainelLiberacao.

type Vista = 'grupos' | 'alunos'

export default async function LiberacaoGerador({ sp, tenantId, basePath }: { sp: SP; tenantId: string; basePath: string }) {
  const { base, qs } = lerQs(sp, basePath)
  const vis: Vista = qs.vis === 'alunos' ? 'alunos' : 'grupos'
  const por = porPaginaDe(qs.pps)
  const pagina = inteiro(qs.pag, 1)
  const dir = dirDe(qs.dir)
  const svc = createAdminClient()

  let b, pg
  try {
    b = await carregarBaseLiberacao(svc, tenantId)
    pg = vis === 'grupos'
      ? await listarGruposLiberacao(svc, tenantId, b.cfg.grupos, { q: qs.q, situ: qs.situ, dir, pagina, porPagina: por })
      : await listarAlunosExcecao(svc, tenantId, b.cfg.alunos, { q: qs.q, dir, pagina, porPagina: por })
  } catch (e) {
    return <Nota tipo="aviso">Não foi possível carregar a liberação: {(e as Error)?.message ?? 'erro desconhecido'}.</Nota>
  }
  const podeEditar = await checkPermission('cronogramas:update')

  const topo = (
    <>
      <RevisaoAbas base={base} param="vis" atual={vis} extra={{ aba: qs.aba, sub: qs.sub }} abas={[
        { id: 'grupos', titulo: 'Grupos', contagem: b.cfg.grupos.length },
        { id: 'alunos', titulo: 'Alunos', contagem: b.cfg.alunos.length },
      ]} />
      <BarraBusca base={base} qs={qs} preservar={['aba', 'sub', 'vis']} placeholder={vis === 'grupos' ? 'Buscar grupo' : 'Buscar aluno da exceção por nome ou e-mail'}
        filtros={vis === 'grupos' ? [{ nome: 'situ', rotulo: 'Todos os grupos', opcoes: [{ v: 'isento', l: 'Sem bloqueio (exceção)' }, { v: 'nao', l: 'Com bloqueio' }] }] : []} />
    </>
  )
  const head = vis === 'grupos'
    ? <><ThOrd rotulo="Grupo" col="nome" base={base} qs={qs} /><ThFixo>Situação</ThFixo></>
    : <><ThOrd rotulo="Aluno" col="nome" base={base} qs={qs} /><ThFixo>Situação</ThFixo></>

  return (
    <div className="w-full">
      <LiberacaoPainel inicial={b} vis={vis} topo={topo} head={head} linhas={pg.itens} total={pg.total} page={pg.pagina} pp={por} podeEditar={podeEditar}
        vazio={qs.q || qs.situ ? 'Nada encontrado com esses filtros.' : vis === 'grupos' ? 'Nenhum grupo cadastrado.' : 'Nenhum aluno na lista de exceções.'} />
    </div>
  )
}
