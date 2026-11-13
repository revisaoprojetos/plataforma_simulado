import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { hojeBrtISO } from '@/lib/brt'
import { nucleoDoAluno } from '@/lib/produtos/explicar-aluno'
import { hrefMapaRegras } from '@/lib/produtos/mapa-regras-tipos'
import { ehPassaporte, explicarLiberacaoAluno, resumirLiberacao, type ExplicacaoAula } from '@/lib/produtos/liberacao-consulta-aluno'
import { BarraBusca, KpiCard, KpiGrid, Nota, PaginaNav, Pilula, ThFixo, ThOrd, hrefCom, ParamsInt } from '../../../_comp/lista'
import { emLotes, excecoesDosAlunos, lerAluno, listarAlunos, listarGrupos, trilhasDoAluno } from './dados-alunos'
import { BotaoExcecaoAluno, TabelaAulasAluno } from './tabela-aulas-aluno'
import { PPS_ALUNOS, dataBrIso } from './tipos-alunos'
import { PRESERVAR, type PropsVisao } from './tipos-visao'

// vis=alunos: lista paginada de alunos (com trilhas que casam / Passaporte / aulas liberadas) e, com ?aluno=<id>, o painel
// do aluno com a data efetiva, a ORIGEM e o "porquê" por aula. Tudo calculado aqui no servidor.

const POR_PAGINA_AULAS = 50

export async function VisaoAlunos(p: PropsVisao) {
  return p.qs.aluno ? PainelAluno(p) : ListaAlunos(p)
}

async function ListaAlunos({ svc, tenantId, produtoId, base, qs, pathname }: PropsVisao) {
  const pagina = ParamsInt(qs.pag, 1)
  const hoje = hojeBrtISO()
  const agora = new Date().toISOString()
  const { rows, total } = await listarAlunos(svc, tenantId, { q: qs.q, ord: qs.ord, dir: qs.dir === 'desc' ? 'desc' : 'asc' }, pagina, PPS_ALUNOS)
  const [exc, trilhasPorAluno] = await Promise.all([
    excecoesDosAlunos(svc, tenantId, produtoId, rows.map((r) => r.id)),
    emLotes(rows, 5, (r) => trilhasDoAluno(svc, tenantId, r.id, base.trilhas)),
  ])
  const linhas = rows.map((r, i) => {
    const trilhas = trilhasPorAluno[i]
    const lista = explicarLiberacaoAluno({ hoje, agora, gateAtivo: base.gateAtivo, aulas: base.aulas, trilhasAluno: trilhas, excecoes: exc.porAluno.get(r.id) ?? [] })
    return { aluno: r, trilhas, passaporte: ehPassaporte(trilhas.length, base.trilhas.length), resumo: resumirLiberacao(lista, hoje), excecoes: (exc.porAluno.get(r.id) ?? []).length }
  })
  return (
    <>
      {!base.gateAtivo && <Nota tipo="info">O controle de liberação está desligado neste produto: todas as aulas aparecem abertas para o aluno (exceto onde não há regra). Ligue-o na aba de data-base.</Nota>}
      {base.trilhas.length === 0 && <Nota tipo="info">Nenhum cronograma de referência ativo neste produto: ninguém casa em cronograma e o Passaporte não pode ser identificado. Todos seguem a data-base da planilha.</Nota>}
      {base.trilhas.length > 0 && <p className="mb-3 text-xs text-muted-foreground">Passaporte Vitalício = o aluno casa em <b>todos</b> os {base.trilhas.length} cronogramas de referência ativos ({base.trilhas.map((t) => t.nome).join(', ')}).</p>}
      <BarraBusca base={pathname} qs={qs} preservar={PRESERVAR} placeholder="Buscar aluno por nome, e-mail ou CPF" />
      <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[56rem] text-sm">
            <thead className="border-b bg-muted/40"><tr>
              <ThOrd rotulo="Aluno" col="nome" base={pathname} qs={qs} />
              <ThOrd rotulo="E-mail" col="email" base={pathname} qs={qs} />
              <ThFixo>Passaporte Vitalício</ThFixo>
              <ThFixo>Cronogramas de ref. que casam</ThFixo>
              <ThFixo>Aulas liberadas</ThFixo>
              <ThFixo>Próxima liberação</ThFixo>
              <ThFixo>Exceções</ThFixo>
              <ThFixo align="right">Painel</ThFixo>
            </tr></thead>
            <tbody className="divide-y">
              {linhas.length === 0 && <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">Nenhum aluno encontrado.</td></tr>}
              {linhas.map((l) => (
                <tr key={l.aluno.id} className="align-top hover:bg-muted/30">
                  <td className="px-3 py-2 font-medium">{l.aluno.nome}</td>
                  <td className="px-3 py-2 text-muted-foreground">{l.aluno.email}</td>
                  <td className="px-3 py-2">{l.passaporte ? <Pilula tipo="vio">Sim</Pilula> : <span className="text-muted-foreground">Não</span>}</td>
                  <td className="px-3 py-2">{l.trilhas.length ? <div className="flex flex-wrap gap-1">{l.trilhas.map((t) => <Pilula key={t.id} tipo="mut">{t.nome}</Pilula>)}</div> : <span className="text-muted-foreground">Nenhuma (planilha)</span>}</td>
                  <td className="px-3 py-2 tabular-nums">{l.resumo.liberadas} / {l.resumo.total}</td>
                  <td className="px-3 py-2">{l.resumo.proxima ? <><span className="block tabular-nums">{dataBrIso(l.resumo.proxima.data)}</span><span className="text-xs text-muted-foreground">{l.resumo.proxima.titulo}</span></> : '—'}</td>
                  <td className="px-3 py-2 tabular-nums">{l.excecoes || '—'}</td>
                  <td className="px-3 py-2 text-right"><Link className="text-sm font-medium text-primary hover:underline" href={hrefCom(pathname, qs, { aluno: l.aluno.id, pag: undefined, q: undefined, ord: undefined, dir: undefined })}>Abrir</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <PaginaNav base={pathname} qs={qs} pagina={pagina} porPagina={PPS_ALUNOS} total={total} />
    </>
  )
}

async function PainelAluno({ svc, tenantId, produtoId, base, qs, pathname, podeEditar }: PropsVisao) {
  const aluno = await lerAluno(svc, tenantId, qs.aluno ?? '')
  const voltar = hrefCom(pathname, qs, { aluno: undefined, pag: undefined, q: undefined, ord: undefined, dir: undefined, estado: undefined, orig: undefined, disc: undefined })
  if (!aluno) return <><Link href={voltar} className="mb-3 inline-flex items-center gap-1 text-sm text-primary hover:underline"><ArrowLeft className="h-4 w-4" />Voltar</Link><Nota tipo="aviso">Aluno não encontrado nesta plataforma.</Nota></>

  const hoje = hojeBrtISO()
  const agora = new Date().toISOString()
  const [trilhas, exc, grupos, nucleo] = await Promise.all([
    trilhasDoAluno(svc, tenantId, aluno.id, base.trilhas),
    excecoesDosAlunos(svc, tenantId, produtoId, [aluno.id]),
    podeEditar ? listarGrupos(svc, tenantId) : Promise.resolve([]),
    nucleoDoAluno(tenantId, aluno.id, produtoId).catch(() => undefined), // MESMO núcleo do motor (plano fixado, regra por segmento, governança)
  ])
  const excecoes = exc.porAluno.get(aluno.id) ?? []
  const todas = explicarLiberacaoAluno({ hoje, agora, gateAtivo: base.gateAtivo, aulas: base.aulas, trilhasAluno: trilhas, excecoes, nucleo })
  const resumo = resumirLiberacao(todas, hoje)
  const passaporte = ehPassaporte(trilhas.length, base.trilhas.length)

  // filtro + ordenação + paginação (em memória: ~300 aulas, já calculadas)
  const termo = (qs.q ?? '').trim().toLowerCase()
  let vis: ExplicacaoAula[] = todas.filter((x) =>
    (!termo || `${x.titulo} ${x.disciplina}`.toLowerCase().includes(termo)) &&
    (!qs.estado || (qs.estado === 'liberada') === x.liberada) &&
    (!qs.orig || x.origem === qs.orig) &&
    (!qs.disc || x.disciplina === qs.disc))
  const dir = qs.dir === 'desc' ? -1 : 1
  const chave: Record<string, (x: ExplicacaoAula) => string> = { aula: (x) => `${x.disciplina}|${x.titulo}`, data: (x) => x.dataEfetiva ?? '9999', origem: (x) => x.origemRotulo, estado: (x) => (x.liberada ? '0' : '1') }
  if (qs.ord && chave[qs.ord]) vis = [...vis].sort((a, b) => dir * chave[qs.ord!](a).localeCompare(chave[qs.ord!](b), 'pt-BR'))
  const pagina = ParamsInt(qs.pag, 1)
  const fatia = vis.slice((pagina - 1) * POR_PAGINA_AULAS, pagina * POR_PAGINA_AULAS)
  const disciplinas = [...new Set(base.aulas.map((a) => a.disciplina))]
  const aulasOpt = base.aulas.map((a) => ({ id: a.id, titulo: a.titulo, disciplina: a.disciplina }))
  const vigentes = excecoes.filter((e) => !e.expiraEm || e.expiraEm > agora).length

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href={voltar} className="mb-1 inline-flex items-center gap-1 text-sm text-primary hover:underline"><ArrowLeft className="h-4 w-4" />Voltar para os alunos</Link>
          <h3 className="text-lg font-semibold">{aluno.nome} <span className="text-sm font-normal text-muted-foreground">{aluno.email}</span></h3>
        </div>
        {podeEditar && <BotaoExcecaoAluno produtoId={produtoId} aluno={aluno} aulas={aulasOpt} modulos={base.modulos} grupos={grupos} />}
      </div>
      <KpiGrid cols={4}>
        <KpiCard rotulo="Passaporte Vitalício" valor={passaporte ? 'Sim' : 'Não'} />
        <KpiCard rotulo="Cronogramas de ref. que casam" valor={trilhas.length ? trilhas.map((t) => t.nome).join(' · ') : 'Nenhuma'} />
        <KpiCard rotulo="Aulas liberadas" valor={`${resumo.liberadas} de ${resumo.total}`} />
        <KpiCard rotulo="Exceções vigentes" valor={vigentes} alerta={vigentes > 0} />
      </KpiGrid>
      {resumo.proxima && <p className="-mt-2 mb-3 text-sm text-muted-foreground">Próxima a liberar: <b className="text-foreground">{dataBrIso(resumo.proxima.data)}</b> · {resumo.proxima.titulo}</p>}
      {!nucleo && !base.gateAtivo && <Nota tipo="info">O controle de liberação está desligado neste produto: o aluno vê tudo aberto, exceto o que depender de outra regra.</Nota>}
      <p className="mb-3 text-sm text-muted-foreground">Para ver todas as camadas (acesso, segmento, visibilidade) de uma aula, abra <Link className="font-medium text-primary hover:underline" href={`${hrefMapaRegras(produtoId)}&rg=aluno&aluno=${aluno.id}`}>Mapa de regras › Por que este aluno</Link>.</p>

      <BarraBusca base={pathname} qs={qs} preservar={[...PRESERVAR, 'aluno']} placeholder="Buscar aula ou matéria"
        filtros={[
          { nome: 'estado', rotulo: 'Liberadas e bloqueadas', opcoes: [{ v: 'liberada', l: 'Só liberadas' }, { v: 'bloqueada', l: 'Só bloqueadas' }] },
          { nome: 'orig', rotulo: 'Qualquer origem', opcoes: [{ v: 'excecao', l: 'Exceção' }, { v: 'trilha', l: 'Cronograma de referência' }, { v: 'plano', l: 'Plano do aluno' }, { v: 'planilha', l: 'Planilha' }, { v: 'meta', l: 'Concluiu a meta' }, { v: 'sem-regra', l: 'Sem regra' }] },
          { nome: 'disc', rotulo: 'Todas as matérias', opcoes: disciplinas.map((d) => ({ v: d, l: d })) },
        ]} />
      <TabelaAulasAluno produtoId={produtoId} aluno={aluno} linhas={fatia} podeEditar={podeEditar} aulas={aulasOpt} modulos={base.modulos} grupos={grupos}
        head={<>
          <ThOrd rotulo="Aula" col="aula" base={pathname} qs={qs} />
          <ThOrd rotulo="Data efetiva" col="data" base={pathname} qs={qs} />
          <ThOrd rotulo="Origem" col="origem" base={pathname} qs={qs} />
          <ThOrd rotulo="Estado" col="estado" base={pathname} qs={qs} />
          <ThFixo>Por quê</ThFixo>
          {podeEditar && <ThFixo align="right">Exceção</ThFixo>}
        </>} />
      <PaginaNav base={pathname} qs={qs} pagina={pagina} porPagina={POR_PAGINA_AULAS} total={vis.length} />
    </>
  )
}
