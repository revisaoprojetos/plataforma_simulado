'use client'

// PAINEL "VERIFICAÇÃO DO SISTEMA": só exibe o resultado calculado no servidor (`verificarFluxoSistema`); nada é recalculado no render.
import { AlertTriangle, CheckCircle2, Info, Loader2, RefreshCw, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { resumirVerificacao, type ItemVerificacao, type Severidade } from '@/lib/admin/fluxo/verificacao'

const ROTULO_CAT = { grafo: 'Grafo', regra: 'Regra do usuário', sistema: 'Regras do sistema' } as const
const ICONE: Record<Severidade, typeof Info> = { erro: XCircle, aviso: AlertTriangle, info: Info }
const COR: Record<Severidade, string> = { erro: 'text-destructive', aviso: 'text-amber-700 dark:text-amber-400', info: 'text-muted-foreground' }

export interface PainelVerificacaoProps {
  itens: ItemVerificacao[] | null
  geradoEm: string | null
  pendente: boolean
  /** o rascunho mudou desde a última verificação. */
  desatualizado: boolean
  onVerificar: () => void
  onFocar: (item: ItemVerificacao) => void
}

export function PainelVerificacao({ itens, geradoEm, pendente, desatualizado, onVerificar, onFocar }: PainelVerificacaoProps) {
  const r = itens ? resumirVerificacao(itens) : null
  return (
    <div className="flex flex-col gap-3 p-1" aria-live="polite">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">Verificação do sistema</h3>
          <p className="text-[11px] text-muted-foreground">Grafo, regras do usuário e regras vigentes do motor, conferidos no servidor.</p>
        </div>
        <button type="button" onClick={onVerificar} disabled={pendente} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-primary bg-primary px-2.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
          {pendente ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}Verificar agora
        </button>
      </div>
      {!itens && !pendente && <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">Ainda não verificado. Clique em “Verificar agora”.</p>}
      {r && (
        <div className={cn('flex flex-wrap items-center gap-2 rounded-lg border p-2.5 text-xs', r.erros ? 'border-destructive/60 bg-destructive/10' : r.avisos ? 'border-amber-500/60 bg-amber-500/10' : 'border-emerald-500/60 bg-emerald-500/10')}>
          {r.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> : r.erros ? <XCircle className="h-4 w-4 text-destructive" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}
          <b>{r.ok ? 'Tudo ok' : `${r.erros} erro${r.erros === 1 ? '' : 's'} / ${r.avisos} aviso${r.avisos === 1 ? '' : 's'}`}</b>
          {r.infos > 0 && <span className="text-muted-foreground">· {r.infos} informaç{r.infos === 1 ? 'ão' : 'ões'}</span>}
          {geradoEm && <span className="ml-auto text-[11px] text-muted-foreground">{new Date(geradoEm).toLocaleTimeString('pt-BR')}</span>}
        </div>
      )}
      {desatualizado && itens && <p className="rounded-md border border-dashed border-amber-500 bg-amber-500/10 px-2 py-1 text-[11px]">O rascunho mudou desde esta verificação. Verifique novamente.</p>}
      {itens && itens.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {itens.map((i) => {
            const Ic = ICONE[i.severidade]
            const focavel = !!(i.diagrama || i.noId)
            return (
              <li key={i.id}>
                <button type="button" disabled={!focavel} onClick={() => onFocar(i)} className={cn('flex w-full items-start gap-2 rounded-lg border p-2 text-left text-xs', focavel ? 'hover:bg-muted' : 'cursor-default')} title={focavel ? 'Focar no canvas' : undefined}>
                  <Ic className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', COR[i.severidade])} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5"><b className={COR[i.severidade]}>{i.titulo}</b><span className="rounded border px-1 text-[10px] text-muted-foreground">{ROTULO_CAT[i.categoria]}</span></span>
                    <span className="mt-0.5 block text-muted-foreground">{i.descricao}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
