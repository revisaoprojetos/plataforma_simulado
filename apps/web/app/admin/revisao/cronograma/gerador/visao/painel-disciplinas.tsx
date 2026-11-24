import { BarraBusca, Nota, PaginaNav, ParamsInt, Pilula, ThOrd, type QS } from '../../../_comp/lista'
import { ROTULO_COBERTURA, paginarDisciplinasGerador, situacaoCobertura, type LinhaDisciplinaGerador, type SituacaoCobertura } from '@/lib/admin/cronogramas-resumo'

// Totais por disciplina x tipo de meta + cobertura (aulas do conjunto x metas x links) — Gerador › Visão geral.
// Server component: a base já vem agregada (SQL + cache 60 s); aqui só filtra/ordena/pagina (nada pesado no render).

const PPS = [10, 14, 25, 50]
const PILULA: Record<SituacaoCobertura, 'ok' | 'warn' | 'bad' | 'mut'> = { completa: 'ok', parcial: 'warn', 'sem-metas': 'bad', 'sem-aulas': 'mut' }
const f = (n: number) => n.toLocaleString('pt-BR')

export default function PainelDisciplinas({ base, sp, href }: { base: LinhaDisciplinaGerador[]; sp: QS; href: string }) {
  const qs: QS = { aba: 'gerador', sub: 'visao', q: sp.q, situ: sp.situ, ord: sp.ord, dir: sp.dir, pag: sp.pag, pps: sp.pps }
  const pp = ParamsInt(sp.pps, 14); const porPagina = PPS.includes(pp) ? pp : 14
  const pg = paginarDisciplinasGerador(base, { q: qs.q, situ: qs.situ, ord: qs.ord, dir: qs.dir === 'desc' ? 'desc' : 'asc', pagina: ParamsInt(qs.pag, 1), porPagina })
  const tot = base.reduce((a, l) => ({ aulas: a.aulas + l.aulas, metas: a.metas + l.metas, links: a.links + l.links }), { aulas: 0, metas: 0, links: 0 })
  return (
    <section className="mt-2" aria-label="Totais por disciplina">
      <h2 className="mb-1 text-base font-semibold">Totais por disciplina e tipo de meta</h2>
      <p className="mb-3 text-sm text-muted-foreground">Cobertura = aulas do conjunto × metas dos cronogramas × links de aula. {f(tot.aulas)} aulas · {f(tot.metas)} metas · {f(tot.links)} links no total.</p>
      <BarraBusca base={href} qs={qs} preservar={['aba', 'sub', 'v']} placeholder="Buscar disciplina" filtros={[
        { nome: 'situ', rotulo: 'Todas as situações', opcoes: (Object.keys(ROTULO_COBERTURA) as SituacaoCobertura[]).map((v) => ({ v, l: ROTULO_COBERTURA[v] })) },
      ]} />
      <div className="overflow-x-auto rounded-2xl border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40">
            <tr>
              <ThOrd rotulo="Disciplina" col="disciplina" base={href} qs={qs} />
              <ThOrd rotulo="Aulas" col="aulas" base={href} qs={qs} align="right" />
              <ThOrd rotulo="PDFull" col="pdfull" base={href} qs={qs} align="right" />
              <ThOrd rotulo="PDFlash" col="pdflash" base={href} qs={qs} align="right" />
              <th className="px-3 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground" title="PDFight não se aplica ao Gerador">PDFight</th>
              <ThOrd rotulo="Questões" col="quest" base={href} qs={qs} align="right" />
              <ThOrd rotulo="LegProc" col="legproc" base={href} qs={qs} align="right" />
              <ThOrd rotulo="Juris." col="juris" base={href} qs={qs} align="right" />
              <ThOrd rotulo="Metas" col="metas" base={href} qs={qs} align="right" />
              <ThOrd rotulo="Links" col="links" base={href} qs={qs} align="right" />
              <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Cobertura</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {pg.itens.length === 0 && (
              <tr><td colSpan={11} className="px-3 py-8 text-center text-muted-foreground">{base.length ? 'Nada encontrado com esses filtros.' : 'Nenhuma disciplina com conjuntos ou metas ainda.'}</td></tr>
            )}
            {pg.itens.map((l) => {
              const s = situacaoCobertura(l)
              return (
                <tr key={l.disciplina} className="hover:bg-muted/30">
                  <td className="px-3 py-2 font-medium">{l.disciplina}</td>
                  <td className="px-3 py-2 text-right tabular-nums" title={`${f(l.itens)} itens aula × material`}>{f(l.aulas)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{f(l.pdfull)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{f(l.pdflash)}</td>
                  <td className="px-3 py-2 text-right text-xs text-muted-foreground">não se aplica</td>
                  <td className="px-3 py-2 text-right tabular-nums">{f(l.quest)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{f(l.legproc)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{f(l.juris)}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{f(l.metas)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{f(l.links)}</td>
                  <td className="px-3 py-2"><Pilula tipo={PILULA[s]}>{ROTULO_COBERTURA[s]}</Pilula></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <PaginaNav base={href} qs={qs} pagina={pg.pagina} porPagina={pg.porPagina} total={pg.total} />
      {base.some((l) => l.outros > 0) && <Nota tipo="info">Há metas de outros tipos fora das colunas acima; elas entram no total de Metas.</Nota>}
    </section>
  )
}
