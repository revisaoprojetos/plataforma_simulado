'use client'

/**
 * "Transferir metas" (Biblioteca): leva as metas dos planos dos alunos de um documento ORIGEM para um DESTINO,
 * com ou sem arquivar a origem. Mesma estrutura do diálogo de "Substituir" (cabeçalho, corpo rolável, rodapé fixo).
 * Seletor do destino = <FilePicker> (o mesmo da Biblioteca/Estúdio). Tudo o que muda vem pronto do servidor
 * (`previaTransferenciaMetas`); aqui só se escolhe e se mostra.
 */

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, ArrowRight, CheckCircle2, FileText, Loader2, Lock, Repeat } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { FilePicker } from '@/components/admin/file-picker'
import { cn } from '@/lib/utils'
import { previaTransferenciaMetas, transferirMetas } from '@/app/admin/biblioteca/transferir-metas-actions'
import type { PreviaTransferencia, ResultadoTransferencia } from '@/app/admin/biblioteca/transferir-metas-tipos'
import { ITENS_BLOQUEADOS, ITENS_PADRAO, linhasAntesDepois, nadaATransferir, type ItensTransferencia } from '@/lib/conteudo/transferir-metas-pura'

export type SaidaTransferencia =
  | { tipo: 'concluido'; arquivou: boolean; resultado: ResultadoTransferencia }
  | { tipo: 'arquivar_assim' }

const fmt = (n: number) => n.toLocaleString('pt-BR')

export function TransferirMetasDialog({ origem, arquivarInicial = false, permitirArquivarAssim = false, onFechar }: {
  origem: { id: string; titulo: string }
  arquivarInicial?: boolean
  /** vindo do fluxo de ARQUIVAR: mostra o botão "Arquivar mesmo assim" (segue o fluxo de 4 confirmações) */
  permitirArquivarAssim?: boolean
  onFechar: (s: SaidaTransferencia | null) => void
}) {
  const [destino, setDestino] = useState<{ id: string; titulo?: string } | null>(null)
  const [picker, setPicker] = useState(false)
  const [previa, setPrevia] = useState<PreviaTransferencia | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [itens, setItens] = useState<ItensTransferencia>(ITENS_PADRAO)
  const [arquivar, setArquivar] = useState(arquivarInicial)
  const [motivo, setMotivo] = useState('')
  const [confirmando, setConfirmando] = useState(false)
  const [rodando, setRodando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const seq = useRef(0)

  useEffect(() => {
    const n = ++seq.current
    setCarregando(true); setConfirmando(false)
    previaTransferenciaMetas(origem.id, destino?.id ?? null)
      .then((r) => { if (n === seq.current) setPrevia(r) })
      .catch(() => { if (n === seq.current) setPrevia({ ok: false, error: 'Falha ao montar a prévia.' }) })
      .finally(() => { if (n === seq.current) setCarregando(false) })
  }, [origem.id, destino?.id])

  const c = previa?.contagens
  const bloqueado = !!previa?.bloqueios?.length
  const vazio = !!c && nadaATransferir(c, itens) && !arquivar
  const linhas = c && previa?.destinoContagens ? linhasAntesDepois(c, itens, previa.destinoContagens, previa.origem?.planosAtivos ?? 0) : []
  const pronto = !!destino && !!previa?.ok && !bloqueado && !carregando && !vazio && (itens.planos || itens.conteudoMeta || itens.catalogo || arquivar)

  function fechar(s: SaidaTransferencia | null) { if (!rodando) onFechar(s) }

  async function executar() {
    if (!destino || !pronto || rodando) return
    setRodando(true); setErro(null)
    try {
      const r = await transferirMetas(origem.id, destino.id, { motivo, itens, arquivarOrigem: arquivar })
      if (!r.ok) { setErro(r.error || 'Falha ao transferir.'); setConfirmando(false); if (r.planos != null) toast.warning(r.error || 'Concluído com ressalvas.', { duration: 15000 }); return }
      toast.success(r.mensagem || 'Metas transferidas.', { duration: 8000 })
      onFechar({ tipo: 'concluido', arquivou: !!r.arquivou, resultado: r })
    } catch (e: any) { setErro(e?.message || 'Falha ao transferir.'); setConfirmando(false) } finally { setRodando(false) }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) fechar(null) }}>
      <DialogContent showCloseButton className="flex h-[min(88vh,760px)] max-h-[88vh] w-[min(1000px,calc(100vw-2rem))] max-w-[min(1000px,calc(100vw-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(1000px,calc(100vw-2rem))]">
        <div className="border-b px-5 pt-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Biblioteca › Transferir metas</p>
          <DialogTitle className="mt-1 mb-4">Transferir metas de “{origem.titulo}”</DialogTitle>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          {/* 1) origem × destino */}
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-stretch">
            <CartaoDoc rotulo="Origem" lado={previa?.origem} titulo={origem.titulo} carregando={carregando && !previa} />
            <div className="hidden items-center text-muted-foreground md:flex"><ArrowRight className="h-5 w-5" aria-hidden /></div>
            <div className="min-w-0">
              {destino && previa?.destino ? (
                <CartaoDoc rotulo="Destino" lado={previa.destino} titulo={destino.titulo ?? previa.destino.titulo} carregando={false}
                  acao={<button type="button" onClick={() => setPicker(true)} disabled={rodando} className="rounded-md border px-2 py-1 text-xs font-medium hover:bg-muted"><Repeat className="mr-1 inline h-3 w-3" />Trocar</button>}
                  destinoInfo={previa.destinoContagens} />
              ) : (
                <div className="flex h-full min-h-32 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed bg-muted/20 p-4 text-center">
                  {destino && carregando ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : (
                    <>
                      <div className="text-sm font-medium">Documento de destino</div>
                      <div className="text-xs text-muted-foreground">Escolha o documento que passa a ser aberto pelas metas.</div>
                      <Button size="sm" variant="outline" onClick={() => setPicker(true)} disabled={rodando}><FileText />Escolher destino</Button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {previa && !previa.ok && <Faixa tom="erro">{previa.error}</Faixa>}
          {previa?.bloqueios?.map((b) => <Faixa key={b} tom="erro">{b}</Faixa>)}
          {previa?.avisos?.map((a) => <Faixa key={a} tom="aviso">{a}</Faixa>)}

          {/* 2) o que transferir */}
          <div className="rounded-xl border">
            <div className="border-b bg-muted/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">O que transferir</div>
            <div className="divide-y text-sm">
              <ItemCheck marcado={itens.planos} onChange={(v) => setItens((s) => ({ ...s, planos: v }))} desabilitado={rodando}
                titulo="Metas dos planos de alunos ativos" qtd={c ? `${fmt(c.planosTransferiveis)} planos · ${fmt(c.metasTransferiveis)} metas` : null}
                texto="A aula passa a abrir o documento de destino. Progresso, concluídas e grade acompanham a aula (histórico mantido). Planos arquivados não mudam." />
              <ItemCheck marcado={itens.conteudoMeta} onChange={(v) => setItens((s) => ({ ...s, conteudoMeta: v }))} desabilitado={rodando}
                titulo="Vínculos de meta do cronograma Revisão (legado)" qtd={c ? `${fmt(c.metaConteudo)} vínculos` : null}
                texto="Metas do cronograma fixo ligadas manualmente ao documento. A página inicial escolhida é zerada (era da origem)." />
              <ItemCheck marcado={itens.catalogo} onChange={(v) => setItens((s) => ({ ...s, catalogo: v }))} desabilitado={rodando}
                titulo="Catálogo de metas (definições)" qtd={c ? `${fmt(c.defsAtivas)} definições ativas` : null}
                texto="Ressincroniza o catálogo: o destino ganha a definição da aula e a origem sai quando for arquivada." />
              {ITENS_BLOQUEADOS.map((b) => (
                <div key={b.chave} className="flex items-start gap-2 px-3 py-2.5 opacity-70">
                  <input type="checkbox" disabled className="mt-0.5 h-4 w-4" aria-label={b.rotulo} />
                  <div className="min-w-0"><div className="flex items-center gap-1.5 font-medium"><Lock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />{b.rotulo}<span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">indisponível</span></div>
                    <p className="text-xs text-muted-foreground">{b.motivo}</p></div>
                </div>
              ))}
            </div>
          </div>

          {/* 3) prévia antes → depois */}
          {destino && linhas.length > 0 && (
            <div className="overflow-hidden rounded-xl border">
              <div className="grid grid-cols-[minmax(0,1fr)_7rem_7rem] gap-3 border-b bg-muted/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <span>Prévia (antes → depois)</span><span className="text-right">Origem</span><span className="text-right">Destino</span>
              </div>
              <div className="divide-y text-sm">
                {linhas.map((l) => (
                  <div key={l.chave} className="grid grid-cols-[minmax(0,1fr)_7rem_7rem] items-center gap-3 px-3 py-2">
                    <span className="min-w-0 truncate" title={l.rotulo}>{l.rotulo}</span>
                    <span className="text-right tabular-nums text-muted-foreground">{fmt(l.origemAntes)} → <b className="text-foreground">{fmt(l.origemDepois)}</b></span>
                    <span className="text-right tabular-nums text-muted-foreground">{fmt(l.destinoAntes)} → <b className="text-foreground">{fmt(l.destinoDepois)}</b></span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 4) arquivar + motivo */}
          <div className="space-y-3 rounded-xl border bg-muted/20 p-3 text-sm">
            <label className="flex items-start gap-2">
              <input type="checkbox" checked={arquivar} onChange={(e) => setArquivar(e.target.checked)} disabled={rodando} className="mt-0.5 h-4 w-4 accent-[var(--primary)]" />
              <span><b>Transferir e arquivar a origem</b><br /><span className="text-xs text-muted-foreground">Desmarcado: só transfere as metas e a origem continua publicada. Marcado: depois de transferir, a origem vira “Arquivado” (os alunos deixam de vê-la; grifos e progresso continuam no banco).{c && (c.planosConflito + c.planosLegados + c.planosOrfas) > 0 ? ' Planos não transferidos continuarão apontando para a origem e ficarão sem material.' : ''}</span></span>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">Motivo (opcional — fica na auditoria)</span>
              <input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} disabled={rodando} placeholder="Ex.: material atualizado pelo professor"
                className="mt-1 h-9 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            </label>
          </div>
          {erro && <Faixa tom="erro">{erro}</Faixa>}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t bg-muted/40 px-5 py-3">
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {rodando ? 'Transferindo…' : confirmando && c ? `Confirma? ${fmt(c.planosTransferiveis)} planos serão repontados para “${previa?.destino?.titulo ?? ''}”.` : !destino ? 'Escolha o documento de destino para ver a prévia' : carregando ? 'Calculando a prévia…' : ''}
          </span>
          <div className="flex flex-wrap gap-2">
            {permitirArquivarAssim && <Button variant="ghost" size="sm" onClick={() => fechar({ tipo: 'arquivar_assim' })} disabled={rodando}>Arquivar mesmo assim</Button>}
            <Button variant="outline" size="sm" onClick={() => (confirmando ? setConfirmando(false) : fechar(null))} disabled={rodando}>{confirmando ? 'Voltar' : 'Cancelar'}</Button>
            {confirmando ? (
              <Button size="sm" onClick={() => void executar()} disabled={rodando || !pronto} variant={arquivar ? 'destructive' : 'default'}>
                {rodando ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}{arquivar ? 'Confirmar: transferir e arquivar' : 'Confirmar transferência'}
              </Button>
            ) : (
              <Button size="sm" onClick={() => setConfirmando(true)} disabled={!pronto}>{arquivar ? 'Transferir e arquivar…' : 'Transferir metas…'}</Button>
            )}
          </div>
        </div>
      </DialogContent>
      {picker && (
        <FilePicker open tenantId="" abaInicial="biblioteca" onClose={() => setPicker(false)}
          onSelecionar={(r) => {
            if (r.tipo !== 'biblioteca' && r.tipo !== 'upload') { toast.info('Escolha um documento da Biblioteca.'); return }
            if (r.documentoId === origem.id) { toast.error('O destino precisa ser outro documento.'); return }
            setDestino({ id: r.documentoId, titulo: r.titulo }); setPicker(false)
          }} />
      )}
    </Dialog>
  )
}

function CartaoDoc({ rotulo, lado, titulo, carregando, acao, destinoInfo }: {
  rotulo: string; lado?: PreviaTransferencia['origem'] | null; titulo: string; carregando: boolean; acao?: React.ReactNode
  destinoInfo?: { planos: number; defs: number; metaConteudo: number }
}) {
  const status = lado?.deletado ? 'Lixeira' : lado?.status === 'publicado' ? 'Publicado' : lado?.status === 'arquivado' ? 'Arquivado' : lado?.status ? 'Rascunho' : null
  return (
    <div className="flex h-full min-w-0 flex-col gap-1.5 rounded-xl border p-3">
      <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{rotulo}</span>{acao}</div>
      <div className="flex items-start gap-1.5 font-medium"><FileText className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden /><span className="min-w-0 break-words" title={titulo}>{titulo}</span></div>
      {carregando ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : lado && (
        <>
          <div className="flex flex-wrap gap-1.5 text-[11px] font-medium">
            {status && <span className={cn('rounded-full px-1.5 py-0.5', status === 'Publicado' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : status === 'Rascunho' ? 'bg-muted text-muted-foreground' : 'bg-destructive/10 text-destructive')}>{status}</span>}
            {lado.tipo && <span className="rounded-full bg-muted px-1.5 py-0.5 uppercase text-muted-foreground">{lado.tipo}</span>}
            {lado.emAulas != null && <span className={cn('rounded-full px-1.5 py-0.5', lado.emAulas ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>{lado.emAulas ? 'É aula do cronograma' : 'Fora das aulas do cronograma'}</span>}
          </div>
          <p className="text-xs text-muted-foreground">
            {lado.resumo ? `Vínculos: ${lado.resumo}` : 'Sem vínculos'}
            {lado.planosAtivos > 0 && ` · em ${fmt(lado.planosAtivos)} ${lado.planosAtivos === 1 ? 'plano ativo' : 'planos ativos'}`}
            {destinoInfo && destinoInfo.planos > 0 && lado.planosAtivos === 0 && ` · ${fmt(destinoInfo.planos)} planos ativos já o têm`}
          </p>
        </>
      )}
    </div>
  )
}

function ItemCheck({ marcado, onChange, desabilitado, titulo, qtd, texto }: { marcado: boolean; onChange: (v: boolean) => void; desabilitado: boolean; titulo: string; qtd: string | null; texto: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 px-3 py-2.5">
      <input type="checkbox" checked={marcado} onChange={(e) => onChange(e.target.checked)} disabled={desabilitado} className="mt-0.5 h-4 w-4 accent-[var(--primary)]" />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5 font-medium">{titulo}{qtd && <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">{qtd}</span>}</div>
        <p className="text-xs text-muted-foreground">{texto}</p>
      </div>
    </label>
  )
}

function Faixa({ tom, children }: { tom: 'erro' | 'aviso'; children: React.ReactNode }) {
  return (
    <div className={cn('flex items-start gap-1.5 rounded-xl border p-3 text-xs', tom === 'erro' ? 'border-destructive/40 bg-destructive/5 text-destructive' : 'border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-400')}>
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /><span>{children}</span>
    </div>
  )
}
