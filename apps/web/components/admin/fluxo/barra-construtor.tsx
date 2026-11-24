'use client'

// BARRA DO CONSTRUTOR (sempre visível): alterna o modo construir, paleta de nós (arrastar ou clicar), desfazer/refazer, verificação, histórico e salvar com motivo.
// Sem a migração do overlay: o modo construir funciona em RASCUNHO LOCAL (não persistido) e "Salvar" fica desabilitado com a faixa de aviso.
import { useState } from 'react'
import { AlertTriangle, Eye, History, Loader2, Pencil, Plus, Redo2, Save, ShieldCheck, Undo2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DadosConstrutor, TipoNo } from '@/lib/admin/fluxo/adaptador'
import { ESTILO_NO, ROTULO_NO } from './estilo-no'
import { TIPO_DRAG } from './canvas-fluxo'

const btn = 'inline-flex h-8 items-center gap-1.5 rounded-md border bg-card px-2.5 text-xs font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50'
const inputCls = 'h-8 rounded-lg border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-60'

export interface BarraConstrutorProps {
  cons: DadosConstrutor
  /** usuário tem permissão de editar (o modo construir/rascunho local exige). */
  podeConstruir: boolean
  /** true = existe a tabela e a permissão: salvar/persistir liberado. */
  persistente: boolean
  construir: boolean
  onAlternar: () => void
  sujo: boolean
  pendente: boolean
  podeDesfazer: boolean
  podeRefazer: boolean
  onDesfazer: () => void
  onRefazer: () => void
  onAdicionar: (t: TipoNo) => void
  ocultos: Array<{ id: string; titulo: string; diagrama: string }>
  onRestaurar: (id: string) => void
  /** abre a aba Verificação (e roda). */
  onVerificar: () => void
  /** badge da verificação (da última verificação ou dos problemas do grafo). */
  contagem: { erros: number; avisos: number }
  onCarregarVersao: (versao: number) => void
  motivo: string
  onMotivo: (m: string) => void
  onSalvar: () => void
  onDescartar: () => void
}

export function BarraConstrutor(p: BarraConstrutorProps) {
  const { cons } = p
  const [verHist, setVerHist] = useState(false)
  const { erros, avisos } = p.contagem
  const titSalvar = !cons.tabelaOk ? 'Aplique a migração 20261130000000_fluxo_overlay.sql para poder salvar' : !p.persistente ? 'Sem permissão para salvar' : !p.sujo ? 'Nada a salvar' : 'Salvar fluxo'

  return (
    <div className="space-y-2 rounded-xl border bg-card p-2.5" aria-label="Construtor do fluxo">
      {!cons.tabelaOk && (
        <p className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-amber-500 bg-amber-500/10 p-2 text-xs">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>Para editar de forma permanente, aplique a migração <code>20261130000000_fluxo_overlay.sql</code>. Enquanto isso, o modo construir funciona em <b>rascunho local</b>: você pode mover, adicionar e editar para experimentar, mas nada é salvo.</span>
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={p.onAlternar} disabled={!p.podeConstruir} aria-pressed={p.construir} title={p.podeConstruir ? undefined : 'Sem permissão para editar o fluxo'}
          className={cn(btn, p.construir && 'border-primary bg-primary text-primary-foreground hover:bg-primary/90')}>
          {p.construir ? <Eye className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}{p.construir ? 'Sair da construção' : 'Construir'}
        </button>
        {!p.podeConstruir && <span className="text-xs text-muted-foreground">Você pode ver o fluxo, mas não tem permissão para editar.</span>}
        {p.construir && (
          <>
            <button type="button" className={btn} onClick={p.onDesfazer} disabled={!p.podeDesfazer || p.pendente} title="Desfazer (Ctrl+Z)"><Undo2 className="h-3.5 w-3.5" />Desfazer</button>
            <button type="button" className={btn} onClick={p.onRefazer} disabled={!p.podeRefazer || p.pendente} title="Refazer (Ctrl+Y)"><Redo2 className="h-3.5 w-3.5" />Refazer</button>
            <button type="button" className={btn} onClick={p.onVerificar} disabled={p.pendente}><ShieldCheck className="h-3.5 w-3.5" />Verificar{erros ? ` (${erros} erro${erros > 1 ? 's' : ''})` : avisos ? ` (${avisos} aviso${avisos > 1 ? 's' : ''})` : ''}</button>
            <button type="button" className={btn} onClick={() => setVerHist((v) => !v)} disabled={!cons.tabelaOk} title={cons.tabelaOk ? undefined : 'Histórico indisponível sem a migração'}><History className="h-3.5 w-3.5" />Histórico ({cons.historico.length})</button>
            {p.ocultos.length > 0 && (
              <label className="inline-flex items-center gap-1.5 text-xs">Ocultos ({p.ocultos.length}):
                <select className={cn(inputCls, 'w-44')} value="" onChange={(e) => e.target.value && p.onRestaurar(e.target.value)} aria-label="Restaurar nó oculto">
                  <option value="">Restaurar…</option>
                  {p.ocultos.map((o) => <option key={o.id} value={o.id}>{o.titulo}</option>)}
                </select>
              </label>
            )}
            <span className="ml-auto text-xs text-muted-foreground">{!cons.tabelaOk ? (p.sujo ? 'Rascunho local · não salvo' : 'Rascunho local') : p.sujo ? 'Alterações não salvas' : `Salvo · versão ${cons.versao || 'inicial'}`}</span>
          </>
        )}
      </div>

      {p.construir && (
        <>
          <p className="text-xs text-muted-foreground">{cons.escopo}</p>
          <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Paleta de nós">
            <span className="text-xs font-medium">Paleta (arraste para o canvas ou clique):</span>
            {cons.tiposNo.map((t) => (
              <button key={t} type="button" draggable onDragStart={(e) => { e.dataTransfer.setData(TIPO_DRAG, t); e.dataTransfer.effectAllowed = 'copy' }} onClick={() => p.onAdicionar(t)}
                className={cn('cursor-grab rounded-md border-2 px-2.5 py-1 text-xs font-medium active:cursor-grabbing', ESTILO_NO[t])} title={`Adicionar ${ROTULO_NO[t].toLowerCase()}`}>
                <Plus className="mr-1 inline h-3 w-3" />{ROTULO_NO[t]}
              </button>
            ))}
          </div>

          {verHist && cons.tabelaOk && (
            <div className="space-y-1 rounded-lg border p-2.5 text-xs">
              {cons.historico.length === 0 && <p className="text-muted-foreground">Nenhuma versão salva ainda.</p>}
              {cons.historico.map((h) => (
                <div key={h.versao} className="flex flex-wrap items-center gap-2">
                  <b>v{h.versao}</b><span className="text-muted-foreground">{h.atualizadoEm ? new Date(h.atualizadoEm).toLocaleString('pt-BR') : ''}</span><span className="min-w-0 flex-1 truncate">{h.motivo ?? ''}</span>
                  <button type="button" className={btn} onClick={() => p.onCarregarVersao(h.versao)} disabled={p.pendente}>Carregar no rascunho</button>
                </div>
              ))}
              <p className="text-muted-foreground">“Carregar no rascunho” traz aquela versão para o canvas; ao salvar vira uma versão nova (nada é apagado).</p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 border-t pt-2">
            <input className={cn(inputCls, 'min-w-0 flex-1 sm:max-w-md')} value={p.motivo} onChange={(e) => p.onMotivo(e.target.value)} maxLength={300} placeholder="Motivo da alteração (vai para o histórico)" aria-label="Motivo" disabled={!p.persistente} />
            <button type="button" title={titSalvar} className={cn(btn, 'border-primary bg-primary text-primary-foreground hover:bg-primary/90')} onClick={p.onSalvar} disabled={!p.persistente || !p.sujo || p.pendente}>
              {p.pendente ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}Salvar fluxo
            </button>
            <button type="button" className={btn} onClick={p.onDescartar} disabled={!p.sujo || p.pendente}>Descartar alterações</button>
          </div>
        </>
      )}
    </div>
  )
}
