import Link from 'next/link'
import { BookOpen } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/server'
import { comLimite } from '@/lib/admin/com-limite'
import { buttonVariants } from '@/components/ui/button'
import { crHm } from '@/lib/revisao/cronograma-schema'
import { montarCobertura, paginarCobertura, preencherQuestoes, type BaseCobertura } from '@/lib/revisao/cronograma'
import { BarraBusca, Nota, ParamsInt, Pilula, ThFixo, ThOrd, hrefCom } from '../../../_comp/lista'
import { TabelaCron } from '../../tabela-cron'
import { AvisoMigracao } from '../aviso-migracao'
import { BASE, porPagina, qsAdaptativo, regrasDaRequisicao, type PropsAbaAdaptativo } from '../comum'

// Sub-aba "Cobertura das aulas" do Adaptativo (?aba=adaptativo&sub=mat). Só ela monta a base de cobertura completa.

export default async function AdaptativoCobertura({ sp, tenantId, podeEditar }: PropsAbaAdaptativo) {
  const qs = qsAdaptativo(sp, 'mat')
  const svc = createAdminClient()
  const regras = await regrasDaRequisicao(tenantId)
  let base: BaseCobertura
  try {
    base = await comLimite(montarCobertura(svc, tenantId, regras.valores), 30_000, 'A leitura do catálogo')
  } catch {
    return <Nota tipo="aviso">Não foi possível ler o catálogo do cronograma agora. <Link href={hrefCom(BASE, qs, {})} className="ml-1 font-medium underline" prefetch={false}>Tentar de novo</Link></Nota>
  }
  const ritmo = Number(regras.valores.ritmoPadrao) || 17
  const pendentes = base.kpis.pendentes
  const pg = paginarCobertura(base, {
    q: qs.q, disc: qs.disc, situ: qs.situ === 'pendentes' || qs.situ === 'completas' ? qs.situ : '',
    ordem: qs.ord, dir: qs.dir === 'desc' ? 'desc' : 'asc', pagina: ParamsInt(qs.pag, 1), porPagina: porPagina(qs.pps),
  })
  await preencherQuestoes(svc, tenantId, pg.linhas)
  const celula = (precisa: boolean, tem: boolean, pag: number) =>
    !precisa ? <Pilula tipo="mut">não se aplica</Pilula> : !tem ? <Pilula tipo="bad">falta</Pilula> : pag ? <Pilula tipo="ok">{pag} p.</Pilula> : <Pilula tipo="ok">na Biblioteca</Pilula>
  return (
    <>
      {!regras.migrado && <AvisoMigracao />}
      {/* Uma linha de resumo (pendência primeiro); explicação no title, sem 2 faixas de texto. */}
      <Nota tipo={pendentes ? 'aviso' : 'ok'}>
        {pendentes ? <b>{pendentes.toLocaleString('pt-BR')} materiais pendentes</b> : <b>Todas as aulas estão completas</b>}
        {base.kpis.aulas ? <> · {base.kpis.aulas.toLocaleString('pt-BR')} aulas</> : null}
        {base.kpis.paginas ? <> · {base.kpis.paginas.toLocaleString('pt-BR')} páginas de PDFull</> : null}
        <span className="ml-1 text-muted-foreground" title={`Tempo de cada aula calculado no ritmo padrão de ${ritmo} páginas por hora. Materiais são incluídos, trocados e excluídos na Biblioteca.`}>(ritmo {ritmo} p/h) · <Link href="/admin/biblioteca" className="underline">gerenciar na Biblioteca</Link></span>
      </Nota>
      <BarraBusca base={BASE} qs={qs} preservar={['aba', 'sub', 'v']} placeholder="Buscar aula ou disciplina" filtros={[
        { nome: 'disc', rotulo: 'Todas as disciplinas', opcoes: pg.disciplinas.map((d) => ({ v: d, l: d })) },
        { nome: 'situ', rotulo: 'Todas as situações', opcoes: [{ v: 'pendentes', l: 'Com pendência' }, { v: 'completas', l: 'Completas' }] },
      ]} />
      <TabelaCron tipo="cobertura" podeEditar={podeEditar} colunas={9} total={pg.total} page={pg.pagina} pp={pg.porPagina}
        vazio={base.kpis.aulas ? 'Nada encontrado com esses filtros.' : <>Nenhuma aula cadastrada. Inclua os PDFull na <Link href="/admin/biblioteca" className="underline">Biblioteca</Link>.</>}
        head={<>
          <ThOrd rotulo="Ordem" col="ordem" base={BASE} qs={qs} /><ThOrd rotulo="Aula" col="aula" base={BASE} qs={qs} /><ThFixo>Ações</ThFixo><ThFixo>Disciplina</ThFixo><ThOrd rotulo="PDFull" col="pag" base={BASE} qs={qs} />
          <ThFixo>PDFlash</ThFixo><ThFixo>PDFight</ThFixo><ThFixo>Questões</ThFixo><ThOrd rotulo="Tempo total" col="tempo" base={BASE} qs={qs} />
        </>}
        rows={pg.linhas.map((l) => ({ id: l.chave, valor: l.disc, cells: [
          <span key="o" className="tabular-nums">{l.ordem}</span>,
          <b key="a" className="block max-w-[13rem] truncate font-medium" title={l.rotulo}>{l.rotulo}</b>,
          <span key="x" className="flex items-center gap-1.5">
            {l.documentoId
              ? <Link href={`/admin/biblioteca/conteudo/${l.documentoId}/gerenciar`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>Abrir</Link>
              : <Pilula tipo="warn">sem link</Pilula>}
            <Link href={`/admin/revisao/biblioteca?aba=pdfull&q=${encodeURIComponent(l.titulo)}`} className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })} title="Ver na Biblioteca" aria-label="Ver na Biblioteca"><BookOpen /></Link>
          </span>,
          <span key="dc" className="block max-w-[8rem] truncate text-muted-foreground" title={l.disc}>{l.disc}</span>,
          l.pag ? <Pilula key="p" tipo="ok">{l.pag} p.</Pilula> : <Pilula key="p" tipo="bad">sem páginas</Pilula>,
          <span key="f">{celula(l.precisaFlash, l.temFlash, l.flashPag)}</span>,
          <span key="g">{celula(l.precisaFight, l.temFight, l.fightPag)}</span>,
          <span key="q">{l.qFiltro ? (l.questoesQtd ? <Pilula tipo="ok">{l.questoesQtd.toLocaleString('pt-BR')} q.</Pilula> : <Pilula tipo="warn">{l.questoesQtd === 0 ? '0 q.' : 'filtro'}</Pilula>) : l.qLink ? <Pilula tipo="ok">com link</Pilula> : l.qDoc ? <Pilula tipo="ok">na Biblioteca</Pilula> : <Pilula tipo="bad">falta</Pilula>}</span>,
          <span key="t" className="font-semibold tabular-nums">{crHm(l.tempoMin)}</span>] }))} />
    </>
  )
}
