import Link from 'next/link'
import { ExternalLink, History } from 'lucide-react'
import { NOME_TIPO_ATUALIZACAO, type TipoAtualizacao } from '@/lib/admin-revisao/biblioteca-tipos'
import type { LinhaHistorico } from '@/lib/admin-revisao/atualizacoes'
import { formatBrt } from '@/lib/brt'
import { cn } from '@/lib/utils'
import { MaterialAbreEditor } from '../duvidas/duvidas-client'

export const PILL: Record<TipoAtualizacao, string> = {
  legislacao: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  jurisprudencia: 'bg-primary/10 text-primary',
  correcao: 'bg-muted text-muted-foreground',
  conteudo_novo: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  sem_atualizacao: 'bg-muted text-muted-foreground',
}

/** Detalhes da especificação (fonte, link, trecho afetado, "avisar quem já baixou") — só os preenchidos. Reusado no Histórico e na linha do tempo. */
export function EspecificacaoAtualizacao({ r }: { r: Pick<LinhaHistorico, 'fonteOrigem' | 'fonteUrl' | 'trechoAfetado' | 'avisarJaBaixou' | 'rotulo'> }) {
  if (!r.fonteOrigem && !r.fonteUrl && !r.trechoAfetado && !r.avisarJaBaixou && !r.rotulo) return null
  return (
    <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
      {r.rotulo && <div><b className="font-medium text-foreground">{r.rotulo}</b></div>}
      {(r.fonteOrigem || r.fonteUrl) && (
        <div>Fonte: {r.fonteOrigem ?? r.fonteUrl}
          {r.fonteUrl && <a href={r.fonteUrl} target="_blank" rel="noopener noreferrer" className="ml-1 inline-flex items-center gap-0.5 text-primary hover:underline"><ExternalLink className="h-3 w-3" />abrir</a>}
        </div>
      )}
      {r.trechoAfetado && <div>Trecho: {r.trechoAfetado}</div>}
      {r.avisarJaBaixou && <div>Intenção registrada: avisar quem já baixou</div>}
    </div>
  )
}

export function LinhaHist({ r, podeEditar }: { r: LinhaHistorico; podeEditar: boolean }) {
  return (
    <tr className="border-b align-top last:border-0">
      <td className="px-3 py-2.5">
        <b className="block font-medium">{r.material}</b>
        {r.disciplina && <span className="block text-xs text-muted-foreground">{r.disciplina}</span>}
        <span className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs">
          {podeEditar && <MaterialAbreEditor documentoId={r.documentoId} titulo="Abrir no editor" />}
          <Link href={`/admin/revisao/atualizacoes/material/${r.documentoId}`} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"><History className="h-3 w-3" />Linha do tempo</Link>
        </span>
      </td>
      <td className="px-3 py-2.5"><span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', PILL[r.tipo])}>{NOME_TIPO_ATUALIZACAO[r.tipo]}</span></td>
      <td className="min-w-[240px] px-3 py-2.5">{r.texto}<EspecificacaoAtualizacao r={r} /></td>
      <td className="px-3 py-2.5 tabular-nums">{formatBrt(r.quando)}</td>
      <td className="px-3 py-2.5 text-xs">{r.registradoPor ?? '—'}</td>
      <td className="px-3 py-2.5"><span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', r.avisou ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : 'bg-muted text-muted-foreground')}>{r.avisou ? 'Avisados' : 'Sem aviso'}</span></td>
    </tr>
  )
}
