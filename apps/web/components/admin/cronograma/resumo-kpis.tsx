import { Children } from 'react'
import { Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  NOTA_CONTAGEM_AULAS, NOTA_RECONCILIACAO, cardsPorTipo, cardsPrincipais, fmtN, totalMetas, type ResumoCronograma,
} from '@/lib/admin/cronogramas-resumo'

/**
 * Resumo de Cronogramas REUTILIZADO nos dois lados (Gerador e Adaptativo): UM painel compacto, mesma anatomia e mesma ordem.
 * Blocos: Conteúdo (Aulas, Disciplinas/conjuntos, Links/materiais, Páginas de PDFull*) · Metas por tipo (PDFull…Jurisprudência;
 * "não se aplica" vira nota pequena, sem card) · Operação (Cronogramas/planos, Materiais pendentes*, Regras diferentes do 2.0*).
 * (*) só aparecem quando o lado informa `extras` (Adaptativo).
 * Aparece SÓ nas telas "Visão geral" de cada modalidade. Server component puro: só exibe números já agregados.
 */
const VAZIO_TIPOS: ResumoCronograma['metasPorTipo'] = { pdfull: null, pdflash: null, pdfight: null, quest: null, legproc: null, juris: null }

export interface ExtrasResumo { paginasPdfull?: number | null; pendentes?: number | null; alteradas?: number | null }

function Stat({ rotulo, valor, dica, alerta }: { rotulo: string; valor: string; dica?: string; alerta?: boolean }) {
  return (
    <div className="min-w-[92px]" title={dica}>
      <span className="block text-[11px] font-medium uppercase leading-tight tracking-wide text-muted-foreground">{rotulo}</span>
      <b className={cn('mt-0.5 block text-[22px] font-bold leading-none tabular-nums', alerta && 'text-amber-700 dark:text-amber-400')}>{valor}</b>
    </div>
  )
}

const vazioV = (v: string | null | undefined) => v == null || v === '—' || v === '0'
function Bloco({ titulo, children, nota }: { titulo: string; children: React.ReactNode; nota?: React.ReactNode }) {
  if (Children.toArray(children).length === 0) return null // bloco sem nenhum valor não é desenhado
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <h3 className="m-0 text-[11px] font-semibold uppercase tracking-[.14em] text-muted-foreground/80">{titulo}</h3>
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:flex sm:flex-wrap">{children}</div>
      {nota}
    </div>
  )
}

export function ResumoKpis({ resumo: r, lado = 'gerador', extras }: { resumo: ResumoCronograma | null; lado?: 'gerador' | 'adaptativo'; extras?: ExtrasResumo }) {
  // Sem dados: "—" (nunca tela vazia); quem chama mostra o aviso do erro.
  const resumo: ResumoCronograma = r ?? { lado, aulas: null, disciplinas: null, links: null, cronogramas: null, metasPorTipo: VAZIO_TIPOS }
  const p = Object.fromEntries(cardsPrincipais(resumo).map((c) => [c.id, c]))
  const tipos = cardsPorTipo(resumo)
  const aplicam = tipos.filter((t) => !t.naoSeAplica), naoAplicam = tipos.filter((t) => t.naoSeAplica)
  const total = totalMetas(resumo.metasPorTipo)
  const pend = extras?.pendentes
  return (
    <section aria-label="Resumo do cronograma" className="relative mb-5 rounded-2xl border bg-card px-5 py-4 shadow-sm">
      <details className="group absolute right-3 top-3 z-10">
        <summary className="flex h-7 w-7 cursor-pointer list-none items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&::-webkit-details-marker]:hidden" aria-label="O que cada contagem significa" title="O que cada contagem significa">
          <Info className="h-4 w-4" />
        </summary>
        <div className="absolute right-0 mt-1 w-[min(22rem,80vw)] rounded-xl border bg-popover p-3 text-xs text-popover-foreground shadow-lg">
          <p className="m-0 text-muted-foreground">{NOTA_CONTAGEM_AULAS[resumo.lado]}</p>
          <p className="mt-2 text-muted-foreground">{NOTA_RECONCILIACAO}</p>
          <p className="mt-2 text-muted-foreground">* PDFight existe só no Adaptativo; no Gerador é &quot;não se aplica&quot;.</p>
        </div>
      </details>
      <div className="flex flex-wrap gap-x-10 gap-y-5 pr-8">
        <Bloco titulo="Conteúdo">
          {!vazioV(p.aulas.valor) && <Stat rotulo="Aulas" valor={p.aulas.valor} dica={NOTA_CONTAGEM_AULAS[resumo.lado]} />}
          {!vazioV(p.disciplinas.valor) && <Stat rotulo="Disciplinas / conjuntos" valor={p.disciplinas.valor} dica={p.disciplinas.dica} />}
          {!vazioV(p.links.valor) && <Stat rotulo="Links / materiais" valor={p.links.valor} dica={p.links.dica} />}
          {!!extras?.paginasPdfull && <Stat rotulo="Páginas de PDFull" valor={fmtN(extras.paginasPdfull)} />}
        </Bloco>
        <Bloco
          titulo={`Metas por tipo${total != null ? ` · ${fmtN(total)}` : ''}`}
          nota={naoAplicam.length > 0 ? <p className="m-0 text-[11px] text-muted-foreground">Não se aplica: {naoAplicam.map((t) => t.rotulo).join(', ')}</p> : undefined}
        >
          {aplicam.filter((t) => !vazioV(t.valor)).map((t) => <Stat key={t.id} rotulo={`${t.rotulo}${t.id === 'pdfight' ? '*' : ''}`} valor={t.valor} />)}
        </Bloco>
        <Bloco titulo="Operação">
          {!vazioV(p.cronogramas.valor) && <Stat rotulo="Cronogramas / planos" valor={p.cronogramas.valor} dica={p.cronogramas.dica} />}
          {!!pend && <Stat rotulo="Materiais pendentes" valor={fmtN(pend)} alerta={pend > 0} />}
          {!!extras?.alteradas && <Stat rotulo="Regras ≠ do 2.0" valor={fmtN(extras.alteradas)} />}
        </Bloco>
      </div>
    </section>
  )
}
