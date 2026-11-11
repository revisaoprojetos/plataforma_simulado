import Link from 'next/link'
import { SemPermissao } from '@/components/ui/alert-box'
import { RevisaoAbas } from '@/components/admin/revisao/ui'
import { checkPermission } from '@/lib/auth/permissions'
import { listarTiposMeta } from '@/lib/cronograma/carregar-tipos'
import { carregarDuracoes, carregarVariantesAula, buscarGrupos } from '@/app/admin/cronogramas/metas/actions'
import {
  idsTiposEmOrdem, montarQsGerador, paginaGerador, paginarDuracoes, paginarTipos, paginarVariantes, porPaginaGerador, termoSeguro,
} from '@/lib/revisao/gerador/metas'
import { BarraBusca, Nota, Pilula, ThFixo, ThOrd } from '../../../_comp/lista'
import { TabelaCron } from '../../tabela-cron'
import { AcoesTipo, NovoTipo } from './tipos-acoes'
import { OndeMeta, PadronizarDisciplina, UniformizarDuracao } from './auditoria-acoes'

// Sub-aba "Metas" do Gerador: Tipos de meta + Auditoria de metas (formato de aula, durações, busca de metas).
// Só LÊ dados prontos (lib/revisao/gerador/metas); as mutações são as server actions já existentes de /admin/cronogramas.

type Vista = 'tipos' | 'aula' | 'duracao' | 'buscar'
const VISTAS: Vista[] = ['tipos', 'aula', 'duracao', 'buscar']
const PRESERVAR = ['aba', 'sub', 'vista', 'ord', 'dir', 'pps']

export default async function GeradorMetas({ sp, tenantId, basePath }: { sp: Record<string, string | string[] | undefined>; tenantId: string; basePath: string }) {
  const { path, qs } = montarQsGerador(sp, basePath)
  const vista: Vista = VISTAS.includes(qs.vista as Vista) ? (qs.vista as Vista) : 'tipos'
  const podeEditar = await checkPermission('cronogramas:update')
  const por = porPaginaGerador(qs.pps)
  const pagina = paginaGerador(qs.pag)
  const dir = qs.dir === 'desc' ? 'desc' : 'asc'

  // Contagens nas abas: só da vista carregada (as outras exigiriam as RPCs de auditoria a cada abertura).
  const contagem: Partial<Record<Vista, number>> = {}
  let corpo: React.ReactNode

  if (vista === 'tipos') {
    const r = await paginarTipos(tenantId, { q: qs.q, status: qs.status, ord: qs.ord, dir, pagina, por })
    if (!r.ok) corpo = <SemPermissao>{r.error}</SemPermissao>
    else {
      const reordenavel = podeEditar && !qs.q && !qs.status && (!qs.ord || (qs.ord === 'ordem' && dir === 'asc'))
      const ordemIds = reordenavel ? await idsTiposEmOrdem(tenantId) : []
      contagem.tipos = r.total
      corpo = (
        <>
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <p className="text-sm text-muted-foreground">As linhas que aparecem em cada dia do cronograma. A <b>ordem</b> é a sequência das metas dentro do dia; as demais opções definem como o conteúdo é escrito, se os links de questões aparecem e se conta como atividade. Para reordenar, deixe a lista sem busca/filtro, na ordem “Ordem”.</p>
            {podeEditar && <NovoTipo />}
          </div>
          <BarraBusca base={path} qs={qs} preservar={PRESERVAR} placeholder="Buscar tipo (nome, chave ou nome no documento)"
            filtros={[{ nome: 'status', rotulo: 'Todos os status', opcoes: [{ v: 'ativo', l: 'Ativos' }, { v: 'inativo', l: 'Inativos' }] }]} />
          <TabelaCron tipo="leitura" podeEditar={podeEditar} colunas={7} total={r.total} page={pagina} pp={por} vazio="Nenhum tipo de meta encontrado."
            head={<><ThOrd rotulo="Ordem" col="ordem" base={path} qs={qs} /><ThOrd rotulo="Tipo" col="nome" base={path} qs={qs} /><ThOrd rotulo="Chave" col="slug" base={path} qs={qs} /><ThOrd rotulo="No documento" col="docx" base={path} qs={qs} /><ThFixo>Comportamento</ThFixo><ThFixo>Metas</ThFixo><ThOrd rotulo="Status" col="status" base={path} qs={qs} /><ThFixo align="right">Ações</ThFixo></>}
            rows={r.linhas.map((t) => ({ id: t.id, fraca: !t.ativo, cells: [
              <span key="o" className="tabular-nums">{t.ordem + 1}</span>,
              <span key="n" className="flex items-center gap-2 font-medium">
                <span className={`h-3 w-1 shrink-0 rounded-full ${t.cor ? '' : 'bg-primary'}`} style={t.cor ? { background: t.cor } : undefined} />{t.nome}
              </span>,
              <span key="s" className="font-mono text-xs text-muted-foreground">{t.slug}</span>,
              <span key="d" className="text-muted-foreground">{t.rotulo_docx}</span>,
              <span key="c" className="flex flex-wrap gap-1">{t.chips.length ? t.chips.map((c) => <Pilula key={c}>{c}</Pilula>) : <span className="text-xs italic text-muted-foreground">comportamento padrão</span>}</span>,
              <span key="u" className="tabular-nums">{t.usos === 0 ? <span className="text-muted-foreground">sem uso</span> : t.usos.toLocaleString('pt-BR')}</span>,
              <Pilula key="st" tipo={t.ativo ? 'ok' : 'mut'}>{t.ativo ? 'Ativo' : 'Inativo'}</Pilula>,
              podeEditar
                ? <AcoesTipo key="a" tipo={{ id: t.id, slug: t.slug, ativo: t.ativo, usos: t.usos, nome: t.nome, rotulo_docx: t.rotulo_docx, cor: t.cor, mostra_links: t.mostra_links, prefixo_aula: t.prefixo_aula, aula_no_titulo: t.aula_no_titulo, quebra_conteudo: t.quebra_conteudo, conta_atividade: t.conta_atividade, destaque_docx: t.destaque_docx, sempre_no_docx: t.sempre_no_docx }} ordemIds={ordemIds} reordenavel={reordenavel} />
                : <span key="a" className="text-xs text-muted-foreground">somente leitura</span>,
            ] }))} />
        </>
      )
    }
  } else if (vista === 'aula') {
    const v = await carregarVariantesAula()
    if (!v.ok) corpo = <SemPermissao>{v.error ?? 'Não foi possível carregar.'}</SemPermissao>
    else {
      const r = paginarVariantes(v.itens ?? [], { q: qs.q, ord: qs.ord, dir: qs.ord ? dir : 'desc', pagina, por })
      contagem.aula = r.totalDisciplinas
      corpo = (
        <>
          <Nota tipo={r.totalDisciplinas ? 'aviso' : 'ok'}>
            {r.totalDisciplinas
              ? <>O link da aula casa por texto <b>exato</b>: uma meta com “01” não encontra o link cadastrado como “1”, e some sem erro. Hoje os links usam o formato <b>sem zero</b>; o risco é a próxima meta nascer no formato errado. A decisão é uma por disciplina.</>
              : 'Toda aula usa uma grafia só. Nada para padronizar.'}
          </Nota>
          <BarraBusca base={path} qs={qs} preservar={PRESERVAR} placeholder="Buscar disciplina" />
          <TabelaCron tipo="leitura" podeEditar={podeEditar} colunas={7} total={r.total} page={pagina} pp={por} vazio={r.totalDisciplinas ? 'Nada encontrado com esses filtros.' : 'Tudo em ordem: nenhuma disciplina com formato de aula divergente.'}
            head={<><ThOrd rotulo="Disciplina" col="disc" base={path} qs={qs} /><ThOrd rotulo="Aulas" col="aulas" base={path} qs={qs} /><ThOrd rotulo="Metas" col="metas" base={path} qs={qs} /><ThOrd rotulo="Cronogramas" col="cron" base={path} qs={qs} /><ThFixo>Formatos hoje</ThFixo><ThFixo>Aulas afetadas</ThFixo><ThFixo>Padronizar tudo para</ThFixo></>}
            rows={r.linhas.map((d) => ({ id: d.disciplina, cells: [
              <b key="d" className="block max-w-[16rem] truncate font-medium" title={d.disciplina}>{d.disciplina}</b>,
              <span key="a" className="tabular-nums">{d.aulas.length}</span>,
              <span key="m" className="tabular-nums">{d.metas.toLocaleString('pt-BR')}</span>,
              <span key="c" className="tabular-nums" title={d.nomesCron.join(' · ')}>{d.cronogramas}</span>,
              <span key="f" className="flex items-center gap-2 text-xs"><span><span className="font-mono font-medium">01</span> em {d.comZero.toLocaleString('pt-BR')}</span><span><span className="font-mono font-medium">1</span> em {d.semZero.toLocaleString('pt-BR')}</span></span>,
              <span key="x" className="block max-w-[14rem] truncate font-mono text-xs text-muted-foreground" title={d.aulas.join(', ')}>{d.aulas.join(', ')}</span>,
              <PadronizarDisciplina key="p" disciplina={d.disciplina} metas={d.metas} podeEditar={podeEditar} />,
            ] }))} />
        </>
      )
    }
  } else if (vista === 'duracao') {
    const v = await carregarDuracoes()
    if (!v.ok) corpo = <SemPermissao>{v.error ?? 'Não foi possível carregar.'}</SemPermissao>
    else {
      const todas = v.itens ?? []
      const r = paginarDuracoes(todas, { q: qs.q, ord: qs.ord, dir, pagina, por })
      contagem.duracao = todas.length
      corpo = (
        <>
          <Nota tipo={todas.length ? 'aviso' : 'ok'}>
            {todas.length
              ? <>No documento impresso a duração vai no rótulo do tipo e só a <b>primeira</b> é usada; as outras somem da folha sem aviso — o aluno planeja o dia por um número que não é o cadastrado.</>
              : 'Cada semana usa uma duração por tipo. Nada para uniformizar.'}
          </Nota>
          <BarraBusca base={path} qs={qs} preservar={PRESERVAR} placeholder="Buscar cronograma ou tipo" />
          <TabelaCron tipo="leitura" podeEditar={podeEditar} colunas={5} total={r.total} page={pagina} pp={por} vazio={todas.length ? 'Nada encontrado com esses filtros.' : 'Tudo em ordem: nenhuma duração se contradizendo.'}
            head={<><ThOrd rotulo="Cronograma" col="cron" base={path} qs={qs} /><ThOrd rotulo="Semana" col="semana" base={path} qs={qs} /><ThOrd rotulo="Tipo" col="tipo" base={path} qs={qs} /><ThOrd rotulo="Metas" col="total" base={path} qs={qs} /><ThFixo>Uniformizar para</ThFixo></>}
            rows={r.linhas.map((d) => ({ id: `${d.cronograma_id}:${d.semana}:${d.tipo}`, cells: [
              <Link key="c" href={`/admin/cronogramas/${d.cronograma_id}?semana=${d.semana}`} className="block max-w-[20rem] truncate font-medium hover:underline" title={d.cronograma_nome}>{d.cronograma_nome}</Link>,
              <span key="s" className="tabular-nums">{d.semana}</span>,
              <Pilula key="t">{d.tipo}</Pilula>,
              <span key="m" className="tabular-nums">{d.total}</span>,
              <UniformizarDuracao key="u" d={d} podeEditar={podeEditar} />,
            ] }))} />
        </>
      )
    }
  } else {
    const tipos = await listarTiposMeta(tenantId, true)
    const nomeTipo = new Map(tipos.map((t) => [t.slug, t.nome]))
    const termo = termoSeguro(qs.q)
    const minc = [2, 3, 5, 10].includes(Number(qs.minc)) ? Number(qs.minc) : 1
    const tipoSel = qs.tipo && nomeTipo.has(qs.tipo) ? qs.tipo : null
    const buscou = termo.length >= 2 || minc > 1 || !!tipoSel
    const r = buscou ? await buscarGrupos(termo, minc, tipoSel, pagina - 1, por) : { ok: true, itens: [], total: 0 }
    corpo = (
      <>
        <Nota>Consulta: veja em quais cronogramas uma meta aparece. É normal a mesma aula servir a vários cronogramas — isto não é um problema. A busca começa vazia, esperando a pergunta (mín. 2 letras ou algum filtro).</Nota>
        <BarraBusca base={path} qs={qs} preservar={['aba', 'sub', 'vista', 'pps']} placeholder="Buscar por disciplina, conteúdo ou aula" filtros={[
          { nome: 'tipo', rotulo: 'Todos os tipos', opcoes: tipos.map((t) => ({ v: t.slug, l: t.nome })) },
          { nome: 'minc', rotulo: 'Em qualquer cronograma', opcoes: [2, 3, 5, 10].map((k) => ({ v: String(k), l: `Em ${k}+ cronogramas` })) },
        ]} />
        {!r.ok
          ? <SemPermissao>{r.error ?? 'Não foi possível buscar.'}</SemPermissao>
          : <TabelaCron tipo="leitura" podeEditar={podeEditar} colunas={6} total={r.total ?? 0} page={pagina} pp={por}
              vazio={buscou ? 'Nenhuma meta encontrada.' : 'Procure uma meta: digite a disciplina, o conteúdo ou o número da aula.'}
              head={<><ThFixo>Disciplina / aula</ThFixo><ThFixo>Conteúdo</ThFixo><ThFixo>Tipo</ThFixo><ThFixo>Formatos</ThFixo><ThFixo>Cronogramas</ThFixo><ThFixo align="right">Onde está</ThFixo></>}
              rows={(r.itens ?? []).map((g) => ({ id: g.chave, cells: [
                <b key="d" className="block max-w-[16rem] truncate font-medium" title={g.disciplina}>{g.disciplina}{g.aula_chave && <span className="font-normal text-muted-foreground"> · aula {g.aula_chave}</span>}</b>,
                <span key="c" className="block max-w-[22rem] truncate text-muted-foreground" title={g.conteudo ?? ''}>{g.conteudo || <em>sem conteúdo</em>}</span>,
                <Pilula key="t">{nomeTipo.get(g.tipo) ?? g.tipo}</Pilula>,
                g.n_formas_aula > 1 ? <Pilula key="f" tipo="warn">{g.n_formas_aula} formatos</Pilula> : <span key="f" className="text-muted-foreground">—</span>,
                <span key="n" className="tabular-nums">{g.n_cronogramas}</span>,
                <span key="o" className="flex justify-end"><OndeMeta g={g} podeEditar={podeEditar} /></span>,
              ] }))} />}
      </>
    )
  }

  return (
    <>
      <RevisaoAbas base={path} param="vista" atual={vista} extra={{ aba: qs.aba, sub: qs.sub }} abas={[
        { id: 'tipos', titulo: 'Tipos de meta', contagem: contagem.tipos },
        { id: 'aula', titulo: 'Auditoria: formato de aula', contagem: contagem.aula },
        { id: 'duracao', titulo: 'Auditoria: durações', contagem: contagem.duracao },
        { id: 'buscar', titulo: 'Buscar metas' },
      ]} />
      {corpo}
    </>
  )
}
