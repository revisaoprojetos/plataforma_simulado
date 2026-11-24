import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/server'
import { listarGerador } from '@/lib/revisao/cronograma'
import { BarraBusca, Nota, ParamsInt, Pilula, ThFixo, ThOrd, type QS } from '../../../_comp/lista'
import { TabelaCron } from '../../tabela-cron'
import { BASE, porPagina, qsAdaptativo } from '../comum'

// Sub-abas "Faixas de horas" (?sub=faixas) e "Semana especial" (?sub=especial) do Adaptativo: parâmetros do motor (leitura).

export default async function AdaptativoParametros({ grupo, sp, tenantId }: { grupo: 'faixas' | 'especial'; sp: QS; tenantId: string }) {
  const qs = qsAdaptativo(sp, grupo)
  const svc = createAdminClient()
  const r = await listarGerador(svc, tenantId, { grupo, q: qs.q, origem: qs.situ, ordem: qs.ord, dir: qs.dir === 'desc' ? 'desc' : 'asc', pagina: ParamsInt(qs.pag, 1), porPagina: porPagina(qs.pps) })
  return (
    <>
      <Nota tipo="info">
        {grupo === 'faixas'
          ? 'O gerador escolhe a faixa de cada semana pela soma de horas da rotina do aluno. Os limites das faixas são regras fixas do motor 3.0; os demais valores são editados em '
          : 'A semana especial pausa o conteúdo novo e revisa os temas anteriores pelo desempenho do aluno. A frequência e os critérios são fixos no motor 3.0; as durações são editadas em '}
        <Link href="/admin/cronogramas/adaptativo/metas" className="underline">Metas &amp; inteligência</Link>.
      </Nota>
      <BarraBusca base={BASE} qs={qs} preservar={['aba', 'sub', 'v']} placeholder="Buscar parâmetro" filtros={[
        { nome: 'situ', rotulo: 'Todas as origens', opcoes: [{ v: 'fixo', l: 'Regra fixa do motor' }, { v: 'cfg', l: 'Configurável' }] },
      ]} />
      <TabelaCron tipo="leitura" podeEditar={false} colunas={4} total={r.total} page={r.pagina} pp={r.porPagina} vazio="Nada encontrado com esses filtros."
        head={<><ThOrd rotulo="Parâmetro" col="nome" base={BASE} qs={qs} /><ThFixo>Valor</ThFixo><ThOrd rotulo="Origem" col="origem" base={BASE} qs={qs} /><ThFixo>Como funciona</ThFixo></>}
        rows={r.itens.map((i) => ({ id: i.id, cells: [
          <span key="n" className="font-medium">{i.nome}</span>, <span key="v" className="font-semibold tabular-nums">{i.valor}</span>,
          <Pilula key="o" tipo={i.origem === 'configurável' ? 'vio' : 'mut'}>{i.origem}</Pilula>, <span key="d" className="text-muted-foreground">{i.descricao}</span>] }))} />
    </>
  )
}
