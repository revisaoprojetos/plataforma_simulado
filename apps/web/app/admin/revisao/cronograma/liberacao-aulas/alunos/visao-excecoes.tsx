import { BarraBusca, Nota, ThFixo, ThOrd, ParamsInt } from '../../../_comp/lista'
import { listarExcecoes, listarGrupos } from './dados-alunos'
import { TabelaExcecoes } from './tabela-excecoes'
import { AVISO_MIGRACAO, PPS_LISTAS } from './tipos-alunos'
import { PRESERVAR, type PropsVisao } from './tipos-visao'

const PPS = [10, 25, 50, 100]

export async function VisaoExcecoes({ svc, tenantId, produtoId, base, qs, pathname, podeEditar }: PropsVisao) {
  const pagina = ParamsInt(qs.pag, 1)
  const pp = PPS.includes(ParamsInt(qs.pps, PPS_LISTAS)) ? ParamsInt(qs.pps, PPS_LISTAS) : PPS_LISTAS
  const titulos = new Map<string, string>([...base.aulas.map((a) => [a.id, a.titulo] as const), ...base.modulos.map((m) => [m.id, m.titulo] as const)])
  const [lista, grupos] = await Promise.all([
    listarExcecoes(svc, tenantId, produtoId, { q: qs.q, alvo: qs.alvo, acao: qs.acao, dest: qs.dest, ativo: qs.ativo, vig: qs.vig, ord: qs.ord, dir: qs.dir === 'asc' ? 'asc' : 'desc', aluno: qs.aluno }, pagina, pp, titulos),
    listarGrupos(svc, tenantId),
  ])
  if (!lista.migrado) return <Nota tipo="aviso">{AVISO_MIGRACAO}</Nota>
  const preservar = [...PRESERVAR, 'pps', 'aluno']
  return (
    <>
      <BarraBusca base={pathname} qs={qs} preservar={preservar} placeholder="Buscar por motivo, aluno, grupo ou aula/módulo"
        filtros={[
          { nome: 'alvo', rotulo: 'Aula e módulo', opcoes: [{ v: 'aula', l: 'Só aulas' }, { v: 'modulo', l: 'Só módulos' }] },
          { nome: 'dest', rotulo: 'Aluno e grupo', opcoes: [{ v: 'aluno', l: 'Só alunos' }, { v: 'grupo', l: 'Só grupos' }] },
          { nome: 'acao', rotulo: 'Liberar e bloquear', opcoes: [{ v: 'liberar', l: 'Liberar' }, { v: 'bloquear', l: 'Bloquear' }] },
          { nome: 'vig', rotulo: 'Qualquer vigência', opcoes: [{ v: 'vigente', l: 'Vigentes' }, { v: 'expirada', l: 'Expiradas' }] },
          { nome: 'ativo', rotulo: 'Ativas e desativadas', opcoes: [{ v: 'sim', l: 'Só ativas' }, { v: 'nao', l: 'Só desativadas' }] },
        ]} />
      <TabelaExcecoes
        produtoId={produtoId} linhas={lista.rows} total={lista.total} page={pagina} pp={pp} podeEditar={podeEditar}
        aulas={base.aulas.map((a) => ({ id: a.id, titulo: a.titulo, disciplina: a.disciplina }))} modulos={base.modulos} grupos={grupos}
        head={<>
          <ThOrd rotulo="Alvo" col="alvo" base={pathname} qs={qs} />
          <ThFixo>Destinatário</ThFixo>
          <ThOrd rotulo="Ação" col="acao" base={pathname} qs={qs} />
          <ThFixo>Motivo</ThFixo>
          <ThOrd rotulo="Validade" col="validade" base={pathname} qs={qs} />
          <ThOrd rotulo="Situação" col="ativo" base={pathname} qs={qs} />
          <ThOrd rotulo="Criada" col="criado" base={pathname} qs={qs} />
          {podeEditar && <ThFixo align="right">Ações</ThFixo>}
        </>}
      />
    </>
  )
}
