'use client'

// REGISTRAR ATUALIZAÇÃO (ponto de versão escrito pelo professor) — componente REUTILIZÁVEL.
// Usado por: Estúdio › Produto › Atualizações, Biblioteca (multisseleção de documentos), editor OnlyOffice e aba Histórico.
// Aceita 1..N documentos (N>1 = um registro por documento, todos com o mesmo lote_id). Backend: atualizacoes-actions.ts.
// Armadilhas do shadcn Dialog respeitadas: DialogContent com sm:max-w-* explícito; DialogFooter já traz -mx-4 -mb-4.

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Plus, Trash2, FileText, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { hojeBrtISO } from '@/lib/brt'
import { TIPOS_ATUALIZACAO } from '@/lib/admin-revisao/biblioteca-tipos'
import type { ItemAlteracao, TipoAtualizacao } from '@/lib/conteudo/atualizacoes-tipos'
import { CamposQuando, type ExibicaoState } from './atualizacao-exibicao'
import { contextoRegistroAction, registrarPontoVersaoAction } from '@/app/admin/conteudos/atualizacoes-actions'

type Item = { texto: string; local: string }
type Resultado = { ids: string[]; loteId: string | null; publicouVersao: boolean }

export interface RegistrarAtualizacaoDialogProps {
  /** Documentos (Biblioteca) que recebem o registro. 1 = individual; vários = lote. */
  documentoIds: string[]
  /** Contexto: registro feito a partir de um Produto (aparece também na lista do produto). */
  produtoId?: string | null
  /** Editor/Histórico: versão em edição — habilita "Publicar esta versão ao registrar" (quando o tenant usa o registro como fonte de publicação). */
  versaoId?: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Chamado após registrar com sucesso (recarregue a lista). */
  onDone?: (r?: Resultado) => void
}

const exibicaoInicial = (): ExibicaoState => ({ data: hojeBrtISO(), hora: '', exibirData: true, exibirHora: true, exibirRotulo: true })

export function RegistrarAtualizacaoDialog({ documentoIds, produtoId = null, versaoId = null, open, onOpenChange, onDone }: RegistrarAtualizacaoDialogProps) {
  const [ctx, setCtx] = useState<{ materiais: { id: string; rotulo: string }[]; registroAtivo: boolean; exibicaoDisponivel: boolean; versao: { id: string; numero: number; atual: boolean } | null } | null>(null)
  const [rotulo, setRotulo] = useState('')
  const [tipo, setTipo] = useState<TipoAtualizacao>('legislacao')
  const [quando, setQuando] = useState<ExibicaoState>(exibicaoInicial())
  const [resumo, setResumo] = useState('')
  const [itens, setItens] = useState<Item[]>([{ texto: '', local: '' }])
  const [porDoc, setPorDoc] = useState<Record<string, { resumo: string; itens: string }>>({})
  const [personalizar, setPersonalizar] = useState(false)
  const [avisar, setAvisar] = useState(true)
  const [inicio, setInicio] = useState(true)
  const [visivel, setVisivel] = useState(true)
  const [publicar, setPublicar] = useState(true)
  const [publicarVersao, setPublicarVersao] = useState(true)
  const [salvando, setSalvando] = useState(false)

  const idsKey = documentoIds.join(',')
  useEffect(() => {
    if (!open) return
    setCtx(null); setRotulo(''); setTipo('legislacao'); setQuando(exibicaoInicial()); setResumo(''); setItens([{ texto: '', local: '' }])
    setPorDoc({}); setPersonalizar(false); setAvisar(true); setInicio(true); setVisivel(true); setPublicar(true); setPublicarVersao(true); setSalvando(false)
    let vivo = true
    contextoRegistroAction(documentoIds, versaoId).then((r) => {
      if (!vivo) return
      if (r.ok) setCtx({ materiais: r.materiais, registroAtivo: r.registroAtivo, exibicaoDisponivel: r.exibicaoDisponivel, versao: r.versao })
      else { toast.error(r.error); onOpenChange(false) }
    }).catch(() => { if (vivo) { toast.error('Falha ao carregar os materiais.'); onOpenChange(false) } })
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, idsKey, versaoId])

  const lote = documentoIds.length > 1
  const podePublicarVersao = !!ctx?.registroAtivo && !!ctx.versao && !ctx.versao.atual && documentoIds.length === 1
  const itensValidos = useMemo(() => itens.filter((i) => i.texto.trim()), [itens])

  function setItem(i: number, patch: Partial<Item>) { setItens((l) => l.map((x, k) => (k === i ? { ...x, ...patch } : x))) }

  async function salvar() {
    const gerais: ItemAlteracao[] = itensValidos.map((i) => ({ texto: i.texto.trim(), local: i.local.trim() || null }))
    const override: Record<string, { resumo?: string; itens?: ItemAlteracao[] }> = {}
    if (personalizar) {
      for (const [id, v] of Object.entries(porDoc)) {
        const linhas = v.itens.split('\n').map((s) => s.trim()).filter(Boolean).map((texto) => ({ texto }))
        if (v.resumo.trim() || linhas.length) override[id] = { resumo: v.resumo.trim() || resumo.trim(), itens: linhas.length ? linhas : gerais }
      }
    }
    setSalvando(true)
    const r = await registrarPontoVersaoAction({
      documentoIds, produtoId, rotulo, tipo, resumo, itens: gerais, porDocumento: override, data: quando.data || null, hora: quando.hora || null, exibirData: quando.exibirData, exibirHora: quando.exibirHora, exibirRotulo: quando.exibirRotulo,
      avisarAlunos: avisar && publicar, mostrarInicio: inicio && publicar, visivelAluno: visivel, status: publicar ? 'publicado' : 'rascunho',
      publicarVersaoId: podePublicarVersao && publicarVersao && publicar ? versaoId : null,
    }).catch(() => ({ ok: false as const, error: 'Falha de rede ao registrar.' }))
    setSalvando(false)
    if (!r.ok) { toast.error(r.error); return }
    toast.success(r.publicouVersao ? 'Versão publicada e atualização registrada.' : lote ? `${r.ids.length} atualizações registradas.` : publicar ? 'Atualização registrada.' : 'Rascunho de atualização salvo.')
    onOpenChange(false)
    onDone?.({ ids: r.ids, loteId: r.loteId, publicouVersao: r.publicouVersao })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!salvando) onOpenChange(o) }}>
      <DialogContent className="w-[min(720px,calc(100vw-2rem))] max-w-[min(720px,calc(100vw-2rem))] sm:max-w-[min(720px,calc(100vw-2rem))]">
        <DialogHeader>
          <DialogTitle>Registrar atualização</DialogTitle>
          <DialogDescription>
            {lote ? `Ponto de versão para ${documentoIds.length} materiais. ` : 'Ponto de versão do material. '}
            O aluno vê a data, o rótulo e a lista de alterações em “Novidades da versão” (você escolhe o que aparece).
          </DialogDescription>
        </DialogHeader>

        {ctx === null ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando…</div>
        ) : (
          <div className="-mx-1 max-h-[62vh] space-y-4 overflow-y-auto px-1">
            {/* Materiais */}
            <div className="rounded-lg border bg-muted/30 p-2.5">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{lote ? `${ctx.materiais.length} materiais (um registro para cada)` : 'Material'}</div>
              <ul className="max-h-24 space-y-0.5 overflow-y-auto text-sm">
                {ctx.materiais.map((m) => <li key={m.id} className="flex items-center gap-2"><FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /><span className="truncate">{m.rotulo}</span></li>)}
              </ul>
            </div>

            <label className="block space-y-1.5 text-sm">
              <span className="font-medium">Rótulo da versão</span>
              <Input value={rotulo} onChange={(e) => setRotulo(e.target.value)} maxLength={120} placeholder="Ex.: v2.1 ou Atualização de Nov/2026" />
            </label>
            <CamposQuando v={quando} onChange={(p) => setQuando((q) => ({ ...q, ...p }))} rotulo={rotulo} tipo={tipo} texto={resumo || itensValidos[0]?.texto || ''} disponivel={ctx.exibicaoDisponivel} />

            <div className="space-y-1.5 text-sm">
              <span className="font-medium">Tipo</span>
              <div className="flex flex-wrap gap-1.5">
                {TIPOS_ATUALIZACAO.map((t) => (
                  <button key={t.id} type="button" onClick={() => setTipo(t.id)}
                    className={cn('h-8 rounded-full border px-3 text-xs font-medium transition-colors', tipo === t.id ? 'border-primary bg-primary/10 text-primary' : 'bg-card text-muted-foreground hover:bg-muted')}>{t.nome}</button>
                ))}
              </div>
            </div>

            <label className="block space-y-1.5 text-sm">
              <span className="font-medium">Resumo <span className="font-normal text-muted-foreground">(opcional se houver itens)</span></span>
              <Textarea value={resumo} onChange={(e) => setResumo(e.target.value)} maxLength={2000} rows={2} placeholder="Em uma frase: o que mudou nesta versão." />
            </label>

            {/* Itens */}
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">O que mudou <span className="font-normal text-muted-foreground">({itensValidos.length})</span></span>
                <Button type="button" variant="outline" size="sm" onClick={() => setItens((l) => [...l, { texto: '', local: '' }])} disabled={itens.length >= 50}><Plus className="h-3.5 w-3.5" />Adicionar item</Button>
              </div>
              {itens.map((it, i) => (
                <div key={i} className="flex items-start gap-2">
                  <Input value={it.texto} onChange={(e) => setItem(i, { texto: e.target.value })} maxLength={500} placeholder="Ex.: Art. 5º alterado pela Lei nº 15.000/2026" className="min-w-0 flex-1" />
                  <Input value={it.local} onChange={(e) => setItem(i, { local: e.target.value })} maxLength={120} placeholder="Onde (opcional)" className="w-40 shrink-0" />
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="Remover item" onClick={() => setItens((l) => (l.length > 1 ? l.filter((_, k) => k !== i) : [{ texto: '', local: '' }]))}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
            </div>

            {/* Personalizar por material (lote) */}
            {lote && (
              <div className="rounded-lg border">
                <button type="button" onClick={() => setPersonalizar((v) => !v)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium">
                  Personalizar resumo e itens por material (opcional)
                  <ChevronDown className={cn('h-4 w-4 transition-transform', personalizar && 'rotate-180')} />
                </button>
                {personalizar && (
                  <div className="space-y-3 border-t p-3">
                    <p className="text-xs text-muted-foreground">Quem ficar em branco usa o resumo e os itens gerais acima. Um item por linha.</p>
                    {ctx.materiais.map((m) => (
                      <div key={m.id} className="space-y-1.5">
                        <div className="truncate text-xs font-semibold">{m.rotulo}</div>
                        <Input value={porDoc[m.id]?.resumo ?? ''} onChange={(e) => setPorDoc((p) => ({ ...p, [m.id]: { resumo: e.target.value, itens: p[m.id]?.itens ?? '' } }))} maxLength={2000} placeholder="Resumo específico" />
                        <Textarea value={porDoc[m.id]?.itens ?? ''} onChange={(e) => setPorDoc((p) => ({ ...p, [m.id]: { resumo: p[m.id]?.resumo ?? '', itens: e.target.value } }))} rows={2} placeholder="Itens específicos (um por linha)" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Publicação */}
            <div className="space-y-2 rounded-lg border p-3 text-sm">
              <Check checked={publicar} onChange={setPublicar} titulo="Publicar agora" desc="Desmarcado, salva como rascunho: o aluno só vê depois de publicar." />
              <Check checked={visivel} onChange={setVisivel} titulo="Visível ao aluno" desc="Aparece em “Novidades da versão” e na aba Atualizações do curso." />
              <Check checked={avisar} onChange={setAvisar} disabled={!publicar} titulo="Avisar os alunos" desc="Notificação no sino de quem tem o material." />
              <Check checked={inicio} onChange={setInicio} disabled={!publicar} titulo="Mostrar nas novidades do Início" desc="Entra na lista de novidades do Início do aluno." />
              {ctx.versao && ctx.registroAtivo && (
                <div className="border-t pt-2">
                  {podePublicarVersao ? (
                    <Check checked={publicarVersao} onChange={setPublicarVersao} disabled={!publicar} titulo={`Publicar a versão ${ctx.versao.numero} agora`} desc="Este tenant usa o registro de versões como fonte de publicação: os alunos só passam a ver o texto editado quando você publica aqui." />
                  ) : ctx.versao.atual ? (
                    <p className="text-xs text-muted-foreground">A versão {ctx.versao.numero} já é a versão vigente para os alunos.</p>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando || ctx === null || (!resumo.trim() && itensValidos.length === 0 && !(personalizar && Object.values(porDoc).some((v) => v.resumo.trim() || v.itens.trim())))}>
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
            {publicar ? (podePublicarVersao && publicarVersao ? 'Publicar versão e registrar' : 'Registrar atualização') : 'Salvar rascunho'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Check({ checked, onChange, titulo, desc, disabled }: { checked: boolean; onChange: (v: boolean) => void; titulo: string; desc: string; disabled?: boolean }) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}
      className="flex w-full items-start gap-2.5 text-left disabled:opacity-50">
      <span className={cn('mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px]', checked ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>{checked ? '✓' : ''}</span>
      <span className="min-w-0"><span className="block font-medium">{titulo}</span><span className="block text-xs text-muted-foreground">{desc}</span></span>
    </button>
  )
}
