'use client'

// Painel LATERAL de visibilidade dos conteúdos (aulas e módulos): serve para UM item ou para VÁRIOS marcados.
// Mostra o estado atual (quais segmentos veem / não veem), deixa aplicar "Mostrar somente para" / "Ocultar para" um
// segmento em lote e limpar as regras. Backend: aplicarVisibilidadeEmLoteAction (uma ida ao servidor, valida e audita).
// Os segmentos em si são criados na aba Visibilidade; as regras valem junto com a disponibilidade por data.

import { useMemo, useState } from 'react'
import { Eye, EyeOff, Users, X, Loader2, Check, Trash2, Info, Layers, FileText, Plus, Pencil, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { confirmar } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import { EFEITO_LABEL, resumoRegra, type RegraVisibilidade, type Segmento } from '@/lib/segmentos/tipos'
import type { AlvoLote, VisibilidadeConteudo } from './visibilidade-actions-tipos'
import { aplicarVisibilidadeEmLoteAction, excluirRegraVisibilidadeAction, duplicarSegmentoAction, excluirSegmentoAction } from './visibilidade-actions'
import { SegmentoDialog } from './aba-visibilidade'

const sel = 'h-9 w-full rounded-lg border bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50'

/** Resumo curto das regras de UM alvo (p/ chip da linha e detalhe da aula). */
export function resumoRegrasAlvo(regras: RegraVisibilidade[] | undefined, nomeSeg: (id: string) => string): string | null {
  const ativas = (regras ?? []).filter((r) => r.ativo)
  if (!ativas.length) return null
  return ativas.map((r) => `${r.efeito === 'mostrar' ? 'só' : 'oculto p/'} ${nomeSeg(r.segmento_id)}`).join(' · ')
}

export function PainelVisibilidade({ produtoId, alvos, titulo, dados, podeEditar, onFechar, onMudou }: {
  produtoId: string
  alvos: AlvoLote[]
  /** Título do item quando é só um. */
  titulo?: string
  /** null = carregando. */
  dados: (VisibilidadeConteudo & { disponivel: boolean }) | null
  podeEditar: boolean
  onFechar: () => void
  /** Recarrega as regras no pai depois de aplicar/limpar/excluir. */
  onMudou: () => void | Promise<void>
}) {
  const [efeito, setEfeito] = useState<'mostrar' | 'ocultar'>('mostrar')
  const [segmentoId, setSegmentoId] = useState('')
  const [semAcesso, setSemAcesso] = useState<'oculto' | 'bloqueado_cadeado'>('oculto')
  const [substituir, setSubstituir] = useState(true)
  const [ocupado, setOcupado] = useState(false)
  const [editSeg, setEditSeg] = useState<null | { seg: Segmento | null }>(null)
  const [nomesExtra, setNomesExtra] = useState<Record<string, string>>({})

  const segs = dados?.segmentos ?? []
  const nomeSeg = (id: string) => segs.find((s) => s.id === id)?.nome ?? '(segmento removido)'
  const segEscolhido = segmentoId || segs[0]?.id || ''
  const segObj = segs.find((x) => x.id === segEscolhido) ?? null
  const nomesTodos = { ...(dados?.nomes ?? {}), ...nomesExtra }

  const ids = useMemo(() => new Set(alvos.map((a) => a.id)), [alvos])
  const regrasDosAlvos = useMemo(() => (dados?.regras ?? []).filter((r) => r.alvo_id && ids.has(r.alvo_id)), [dados, ids])
  // Agrupa por (efeito, segmento): quantos alvos selecionados têm aquela regra.
  const grupos = useMemo(() => {
    const m = new Map<string, { efeito: RegraVisibilidade['efeito']; segmento_id: string; alvos: Set<string>; regras: RegraVisibilidade[] }>()
    for (const r of regrasDosAlvos) {
      const k = `${r.efeito}:${r.segmento_id}`
      const g = m.get(k) ?? { efeito: r.efeito, segmento_id: r.segmento_id, alvos: new Set<string>(), regras: [] }
      g.alvos.add(r.alvo_id as string); g.regras.push(r); m.set(k, g)
    }
    return [...m.values()]
  }, [regrasDosAlvos])
  const comRegra = new Set(regrasDosAlvos.map((r) => r.alvo_id)).size
  const total = alvos.length
  const soModulos = alvos.length > 0 && alvos.every((a) => a.tipo === 'modulo')
  const rotuloItem = soModulos ? 'módulo' : alvos.every((a) => a.tipo === 'aula') ? 'aula' : 'item'
  const plural = (n: number) => (n === 1 ? `1 ${rotuloItem}` : `${n} ${rotuloItem === 'item' ? 'itens' : `${rotuloItem}s`}`)

  async function aplicar() {
    if (!segEscolhido) { toast.error('Escolha um segmento.'); return }
    const nome = nomeSeg(segEscolhido)
    if (total > 1 && !(await confirmar({
      titulo: 'Aplicar visibilidade',
      mensagem: `${efeito === 'mostrar' ? 'Mostrar somente para' : 'Ocultar para'} “${nome}” em ${plural(total)}${substituir ? ' (substitui as regras que já existem nesses itens)' : ''}.${soModulos ? ' Vale para tudo dentro dos módulos, inclusive submódulos.' : ''}`,
      confirmar: 'Aplicar',
    }))) return
    setOcupado(true)
    const r = await aplicarVisibilidadeEmLoteAction(produtoId, alvos, { tipo: 'aplicar', segmento_id: segEscolhido, efeito, sem_acesso: semAcesso, substituir })
    setOcupado(false)
    if ('error' in r) { toast.error(r.error); return }
    toast.success(`Regra aplicada em ${plural(r.alvos)}${r.removidas ? ` (${r.removidas} anterior${r.removidas === 1 ? '' : 'es'} substituída${r.removidas === 1 ? '' : 's'})` : ''}.`)
    await onMudou()
  }

  async function duplicarSeg() {
    if (!segObj) return
    setOcupado(true)
    const r = await duplicarSegmentoAction(segObj.id)
    setOcupado(false)
    if ('error' in r) { toast.error(r.error); return }
    toast.success('Segmento duplicado.'); await onMudou()
  }
  async function excluirSeg() {
    if (!segObj) return
    if (!(await confirmar({ titulo: 'Excluir segmento', mensagem: `Excluir o segmento "${segObj.nome}"? As regras (de qualquer produto) que usam esse segmento também serão excluídas.`, confirmar: 'Excluir', destrutivo: true }))) return
    setOcupado(true)
    const r = await excluirSegmentoAction(segObj.id, produtoId)
    setOcupado(false)
    if ('error' in r) { toast.error(r.error); return }
    setSegmentoId(''); toast.success('Segmento excluído.'); await onMudou()
  }

  async function limpar() {
    if (!(await confirmar({ titulo: 'Limpar visibilidade', mensagem: `Remover todas as regras de visibilidade de ${plural(total)}? Os itens voltam a aparecer para quem tem acesso ao produto. Os segmentos continuam existindo.`, confirmar: 'Limpar regras', destrutivo: true }))) return
    setOcupado(true)
    const r = await aplicarVisibilidadeEmLoteAction(produtoId, alvos, { tipo: 'limpar' })
    setOcupado(false)
    if ('error' in r) { toast.error(r.error); return }
    toast.success(`${r.removidas} regra${r.removidas === 1 ? '' : 's'} removida${r.removidas === 1 ? '' : 's'}.`)
    await onMudou()
  }

  async function removerRegra(r: RegraVisibilidade) {
    setOcupado(true)
    const res = await excluirRegraVisibilidadeAction(produtoId, r.id)
    setOcupado(false)
    if ('error' in res) { toast.error(res.error); return }
    toast.success('Regra removida.')
    await onMudou()
  }

  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-start gap-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Eye className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold">Visibilidade</div>
          <div className="truncate text-xs text-muted-foreground">
            {total === 0 ? 'Marque aulas na lista para aplicar em lote' : total === 1 && titulo ? titulo : `Seleção: ${plural(total)}`}
          </div>
        </div>
        <button type="button" onClick={onFechar} aria-label="Fechar painel de visibilidade" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>

      {!dados ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed bg-muted/30 p-6 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando regras…</div>
      ) : !dados.disponivel ? (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs">Visibilidade por segmentos ainda não ativada no banco — aplique a migração <code className="rounded bg-muted px-1">20261103130000_segmentos_visibilidade.sql</code>.</div>
      ) : total === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed bg-muted/30 px-4 py-8 text-center text-muted-foreground"><Layers className="h-6 w-6 opacity-50" />Marque uma ou mais aulas (caixas à esquerda) — este painel acompanha a seleção.</div>
      ) : (
        <>
          {/* Estado atual */}
          <section className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Estado atual</div>
            {grupos.length === 0 ? (
              <div className="flex items-start gap-2 rounded-xl border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground"><Eye className="mt-0.5 h-3.5 w-3.5 shrink-0" />{total === 1 ? 'Sem regra: visível para todos que têm acesso ao produto.' : `Nenhum dos ${total} itens tem regra: todos visíveis para quem tem acesso ao produto.`}</div>
            ) : (
              <div className="divide-y overflow-hidden rounded-xl border">
                {grupos.map((gr) => (
                  <div key={`${gr.efeito}:${gr.segmento_id}`} className="flex items-center gap-2 px-3 py-2">
                    <span className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-lg', gr.efeito === 'ocultar' ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary')}>{gr.efeito === 'ocultar' ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium">{EFEITO_LABEL[gr.efeito]} <span className="rounded-full border bg-background px-1.5 py-0.5 text-[11px]"><Users className="mr-1 inline h-3 w-3" />{nomeSeg(gr.segmento_id)}</span></div>
                      <div className="text-[11px] text-muted-foreground">{total > 1 ? `em ${gr.alvos.size} de ${total}` : gr.regras[0].sem_acesso === 'bloqueado_cadeado' ? 'demais alunos: com cadeado' : 'demais alunos: não aparece'}{!gr.regras.every((r) => r.ativo) && ' · pausada'}</div>
                    </div>
                    {podeEditar && total === 1 && <button type="button" disabled={ocupado} onClick={() => removerRegra(gr.regras[0])} aria-label="Remover regra" className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-50"><X className="h-3.5 w-3.5" /></button>}
                  </div>
                ))}
              </div>
            )}
            {total > 1 && <div className="text-[11px] text-muted-foreground">{comRegra} de {total} com alguma regra · {total - comRegra} sem regra</div>}
          </section>

          {/* Nova regra */}
          {podeEditar ? (
            <section className="space-y-3 rounded-xl border bg-card p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Aplicar regra</div>
              <div className="grid grid-cols-2 gap-2">
                {([['mostrar', 'Mostrar somente para', Eye], ['ocultar', 'Ocultar para', EyeOff]] as const).map(([v, label, Icone]) => (
                  <button key={v} type="button" onClick={() => setEfeito(v)} aria-pressed={efeito === v}
                    className={cn('flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-medium transition-colors', efeito === v ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')}>
                    <Icone className="h-3.5 w-3.5" />{label}
                  </button>
                ))}
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">Segmento</span>
                  <button type="button" onClick={() => setEditSeg({ seg: null })} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"><Plus className="h-3 w-3" />Criar segmento</button>
                </div>
                {segs.length === 0 ? (
                  <p className="rounded-lg border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">Nenhum segmento ainda. Use “Criar segmento” para montar um público com condições (grupos, assinaturas, datas, simulados, progresso…).</p>
                ) : (
                  <>
                    <select value={segEscolhido} onChange={(e) => setSegmentoId(e.target.value)} className={sel}>{segs.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}</select>
                    {segObj && (
                      <div className="rounded-lg border bg-muted/30 p-2">
                        <p className="line-clamp-4 text-[11px] text-muted-foreground">{resumoRegra(segObj.regra, nomesTodos)}</p>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          <button type="button" onClick={() => setEditSeg({ seg: segObj })} className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-[11px] font-medium hover:bg-muted"><Pencil className="h-3 w-3" />Editar</button>
                          <button type="button" disabled={ocupado} onClick={duplicarSeg} className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-[11px] font-medium hover:bg-muted disabled:opacity-50"><Copy className="h-3 w-3" />Duplicar</button>
                          <button type="button" disabled={ocupado} onClick={excluirSeg} className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-[11px] font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"><Trash2 className="h-3 w-3" />Excluir</button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
              <label className="block space-y-1">
                <span className="text-xs font-medium">Para quem não pode ver</span>
                <select value={semAcesso} onChange={(e) => setSemAcesso(e.target.value as 'oculto' | 'bloqueado_cadeado')} className={sel}>
                  <option value="oculto">Não aparece</option>
                  <option value="bloqueado_cadeado">Aparece com cadeado (“conteúdo exclusivo”)</option>
                </select>
              </label>
              <label className="flex cursor-pointer items-start gap-2 text-xs">
                <input type="checkbox" checked={substituir} onChange={(e) => setSubstituir(e.target.checked)} className="mt-0.5 h-3.5 w-3.5 accent-[var(--primary)]" />
                <span><span className="font-medium">Substituir as regras atuais</span><span className="block text-muted-foreground">{substituir ? 'Remove as regras que estes itens já têm e deixa só esta.' : 'Mantém as outras regras; troca só a deste segmento.'}</span></span>
              </label>
              <p className="flex items-start gap-1.5 rounded-lg bg-primary/5 px-2.5 py-2 text-[11px] text-muted-foreground"><Info className="mt-0.5 h-3 w-3 shrink-0" />
                {efeito === 'mostrar' ? 'Só quem está no segmento vê' : 'Quem está no segmento não vê'} o conteúdo ({plural(total)}){soModulos ? ' e tudo dentro dele' : ''}. Funciona junto com a disponibilidade por data.</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={aplicar} disabled={ocupado || !segEscolhido} className="flex-1">{ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Aplicar{total > 1 ? ` a ${total}` : ''}</Button>
                {comRegra > 0 && <Button size="sm" variant="outline" onClick={limpar} disabled={ocupado}><Trash2 className="h-4 w-4" />Limpar regras</Button>}
              </div>
            </section>
          ) : (
            <p className="rounded-xl border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">Você só pode visualizar a visibilidade.</p>
          )}
          <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">{soModulos ? <Layers className="mt-0.5 h-3 w-3 shrink-0" /> : <FileText className="mt-0.5 h-3 w-3 shrink-0" />}Segmentos e regras do produto inteiro ficam na aba Visibilidade.</p>
        </>
      )}
      {editSeg && (
        <SegmentoDialog seg={editSeg.seg} produtoId={produtoId} podeEditar={podeEditar} nomes={nomesTodos}
          onNomes={(n) => setNomesExtra((x) => ({ ...x, ...n }))} onClose={() => setEditSeg(null)}
          onSalvo={(sg) => { setEditSeg(null); setSegmentoId(sg.id); void onMudou() }} />
      )}
    </div>
  )
}
