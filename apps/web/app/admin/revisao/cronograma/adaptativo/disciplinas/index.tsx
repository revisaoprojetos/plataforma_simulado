import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/server'
import { buttonVariants } from '@/components/ui/button'
import { paginarDisciplinas } from '@/lib/revisao/cronograma'
import { BarraBusca, Nota, ParamsInt, Pilula, ThFixo, ThOrd } from '../../../_comp/lista'
import { TabelaCron } from '../../tabela-cron'
import { AdicionarDisciplina, DiscSwitch, RemoverDisciplina } from '../../acoes-client'
import { BASE, porPagina, qsAdaptativo, type PropsAbaAdaptativo } from '../comum'

// Sub-aba "Disciplinas" do Adaptativo (?aba=adaptativo&sub=disc). Só ela lê as disciplinas.

export default async function AdaptativoDisciplinas({ sp, tenantId, podeEditar }: PropsAbaAdaptativo) {
  const qs = qsAdaptativo(sp, 'disc')
  const pg = await paginarDisciplinas(createAdminClient(), tenantId, {
    q: sp.q, situ: sp.situ, ordem: sp.ord, dir: sp.dir === 'desc' ? 'desc' : 'asc',
    pagina: ParamsInt(sp.pag, 1), porPagina: porPagina(sp.pps),
  })
  return (
    <>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground" title="Disciplina sem PDFlash ou sem PDFight não recebe essa revisão e não aparece como pendente. PDFull, Juris e LegProc desligados fazem o gerador deixar de entregar esse tipo naquela disciplina (um tipo bloqueado em Regras do cronograma vale para todas). Disciplina desligada sai do cronograma, com as aulas guardadas.">Ligue ou desligue o que cada disciplina recebe. Passe o mouse aqui para ver as regras.</p>
        {podeEditar && <AdicionarDisciplina />}
      </div>
      {!pg.migrado && <Nota tipo="aviso">Para salvar alterações nas disciplinas, aplique a migração 20261112050000_revisao_cronograma_duvidas.sql.</Nota>}
      {pg.migrado && !pg.tiposMigrado && <Nota tipo="aviso">PDFull, Juris e LegProc por disciplina dependem da migração 20261113030000_cron_disciplinas_tipos_material.sql, ainda não aplicada. Até lá os botões ficam desabilitados.</Nota>}
      <BarraBusca base={BASE} qs={qs} preservar={['aba', 'sub', 'v']} placeholder="Buscar disciplina" filtros={[{ nome: 'situ', rotulo: 'Todas', opcoes: [{ v: 'no', l: 'No cronograma' }, { v: 'fora', l: 'Fora do cronograma' }] }]} />
      <TabelaCron tipo="disciplinas" podeEditar={podeEditar} colunas={9} total={pg.total} page={pg.pagina} pp={pg.porPagina} vazio="Nenhuma disciplina encontrada."
        head={<><ThOrd rotulo="Disciplina" col="nome" base={BASE} qs={qs} /><ThFixo>Tem PDFlash</ThFixo><ThFixo>Tem PDFight</ThFixo><ThFixo>PDFull</ThFixo><ThFixo>Juris</ThFixo><ThFixo>LegProc</ThFixo><ThFixo>No cronograma</ThFixo><ThOrd rotulo="Aulas" col="aulas" base={BASE} qs={qs} /><ThFixo>Ações</ThFixo></>}
        rows={pg.itens.map((d) => ({ id: d.nome, valor: d.nome, fraca: !d.ativa, cells: [
          <span key="n" className="font-medium">{d.nome}{d.manual && <Pilula tipo="vio" className="ml-2">criada aqui</Pilula>}</span>,
          <DiscSwitch key="f" nome={d.nome} campo="pdflash" valor={d.pdflash} podeEditar={podeEditar} />,
          <DiscSwitch key="g" nome={d.nome} campo="pdfight" valor={d.pdfight} podeEditar={podeEditar} />,
          <DiscSwitch key="pf" nome={d.nome} campo="pdfull" valor={d.pdfull} podeEditar={podeEditar} desabilitado={!pg.tiposMigrado} />,
          <DiscSwitch key="jp" nome={d.nome} campo="juris" valor={d.juris} podeEditar={podeEditar} desabilitado={!pg.tiposMigrado} />,
          <DiscSwitch key="lp" nome={d.nome} campo="legproc" valor={d.legproc} podeEditar={podeEditar} desabilitado={!pg.tiposMigrado} />,
          <DiscSwitch key="a" nome={d.nome} campo="ativa" valor={d.ativa} podeEditar={podeEditar} />,
          <span key="u" className="tabular-nums">{d.aulas}</span>,
          <span key="x" className="flex items-center gap-1.5">
            <Link href={`${BASE}?aba=adaptativo&sub=conteudo&v=cobertura&disc=${encodeURIComponent(d.nome)}`} className={buttonVariants({ variant: 'outline', size: 'sm' })} aria-label={`Abrir as aulas de ${d.nome}`}>Abrir aulas</Link>
            {podeEditar && d.manual && <RemoverDisciplina nome={d.nome} />}
          </span>] }))} />
    </>
  )
}
