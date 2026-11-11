'use client'

// Peças da visão em CARDS da aba Conteúdos: card de módulo (agregados vindos do servidor) e diálogo "Reordenar módulos".
// Só apresentação — nenhum cálculo sobre as aulas acontece aqui.

import { SinaisSegmento, type SinaisSeg } from './segmentos-dialog'
import { useState } from 'react'
import { ArrowDown, ArrowUp, FolderPlus, GripVertical, Loader2, MoreVertical, Pencil, Plus, Save } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { CaixaSelecao } from '@/components/admin/caixa-selecao'
import { cn } from '@/lib/utils'
import { MATERIAIS, type ModuloCard, type ModuloRow } from '@/lib/produtos/curriculo'
import { reordenarModulosAction } from '../actions'

const dataCurta = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' })

/** Resumo de liberação do módulo (ex.: "todas liberadas" · "3 programadas a partir de 12/03" · "2 em rascunho"). */
export function resumoLiberacaoCard(c: ModuloCard): { texto: string; alerta: boolean }[] {
  if (c.aulas === 0) return [{ texto: 'Sem aulas', alerta: false }]
  const out: { texto: string; alerta: boolean }[] = []
  if (c.programadas === 0) out.push({ texto: 'Todas liberadas', alerta: false })
  else out.push({ texto: c.proxData ? `${c.programadas} com data a partir de ${dataCurta(c.proxData)}` : `${c.programadas} com liberação programada`, alerta: true })
  if (c.rascunhos > 0) out.push({ texto: `${c.rascunhos} em rascunho`, alerta: true })
  return out
}

export function CardModulo({ m, podeEditar, marcado, onMarcar, onAbrir, onEditar, onSub, onConteudo, sinais }: {
  sinais?: SinaisSeg | null
  m: ModuloCard; podeEditar: boolean; marcado?: boolean; onMarcar?: () => void
  onAbrir: () => void; onEditar: () => void; onSub?: () => void; onConteudo: () => void
}) {
  const chips = MATERIAIS.filter((x) => (m.materiais[x.v] ?? 0) > 0)
  const lib = resumoLiberacaoCard(m)
  const cor = 'var(--primary)'
  const nome = m.titulo
  return (
    <div className={cn('min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-card shadow-md transition-shadow hover:shadow-xl', marcado && 'ring-2 ring-primary/60')}>
      {/* Pôster: MESMAS proporção (2/3), raio, gradiente e tipografia do <Poster> da vitrine do aluno (extensivos/[slug]/curriculo.tsx) */}
      <div className="group/card relative aspect-[2/3] w-full overflow-hidden">
        <button type="button" onClick={onAbrir} aria-label={`Abrir ${m.titulo}`} className="absolute inset-0 text-left">
          {m.imagem_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={m.imagem_url} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover/card:scale-105" />
          ) : (
            <div className="absolute inset-0" style={{ background: `radial-gradient(120% 80% at 30% 0%, color-mix(in srgb, ${cor} 75%, #fff 10%), transparent 60%), linear-gradient(170deg, color-mix(in srgb, ${cor} 85%, #000), var(--pn-0b0820,#0b0820) 92%)` }}>
              <span aria-hidden className="absolute inset-0 opacity-30" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.07) 1px,transparent 1px)', backgroundSize: '18px 18px' }} />
              <span aria-hidden className="absolute -right-3 top-2 select-none text-[110px] font-black italic leading-none text-white/[.08]">{m.ordem + 1}</span>
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/55 to-transparent px-3 pb-3 pt-16">
            {m.ocultar_titulo ? null : <div className={`font-extrabold uppercase leading-[1.05] tracking-tight text-[color:var(--pn-f1c232,#F1C232)] ${nome.length > 28 ? 'text-[15px]' : 'text-lg'} ${m.imagem_url ? 'line-clamp-2' : 'line-clamp-4'}`}>{nome}</div>}
            <div className="mt-1.5 flex items-center gap-1.5 text-[11px] font-medium text-white/80">
              {m.aulas} {m.aulas === 1 ? 'aula' : 'aulas'} · {m.submodulos} {m.submodulos === 1 ? 'submódulo' : 'submódulos'}
            </div>
          </div>
        </button>
        {podeEditar && onMarcar && (
          <span className="absolute left-2 top-2 rounded-md bg-card/90 p-1 shadow-sm"><CaixaSelecao checked={!!marcado} onChange={onMarcar} label={`Selecionar ${m.titulo}`} /></span>
        )}
        {/* Selos de segmento: logo abaixo do checkbox de seleção (não cobrem o título) */}
        <SinaisSegmento sinais={sinais} sobreImagem compacto className="pointer-events-none absolute left-2 top-11 flex-nowrap" />
        {podeEditar && (
          <div className="absolute right-2 top-2">
            <DropdownMenu>
              <DropdownMenuTrigger aria-label="Ações do módulo" className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-card/90 text-muted-foreground shadow-sm hover:bg-card hover:text-foreground data-popup-open:bg-card"><MoreVertical className="h-4 w-4" /></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onEditar}><Pencil className="h-4 w-4" />Editar módulo</DropdownMenuItem>
                {onSub && <DropdownMenuItem onClick={onSub}><FolderPlus className="h-4 w-4" />Novo submódulo</DropdownMenuItem>}
                <DropdownMenuItem onClick={onConteudo}><Plus className="h-4 w-4" />Novo conteúdo</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
      {/* Faixa de admin (compacta): sinais de segmento + tipos de material + resumo de liberação */}
      <button type="button" onClick={onAbrir} className="flex w-full min-w-0 flex-col gap-1.5 p-2 text-left">
        {chips.length > 0 && (
          <span className="flex flex-wrap gap-1">
            {chips.slice(0, 3).map((c) => (
              <span key={c.v} className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">{c.label} <span className="tabular-nums">{m.materiais[c.v]}</span></span>
            ))}
            {chips.length > 3 && <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground" title={chips.slice(3).map((c) => `${c.label} ${m.materiais[c.v]}`).join(' · ')}>+{chips.length - 3}</span>}
          </span>
        )}
        <span className="flex flex-wrap gap-x-2 gap-y-0.5 text-[10px]">
          {lib.map((l) => <span key={l.texto} className={l.alerta ? 'font-medium text-foreground' : 'text-muted-foreground'}>{l.texto}</span>)}
        </span>
      </button>
    </div>
  )
}

/** Situação derivada dos agregados do servidor (sem recalcular aulas). */
export function situacaoModulo(c: ModuloCard): { texto: string; ativo: boolean } {
  if (c.aulas === 0) return { texto: 'Vazio', ativo: false }
  if (c.rascunhos >= c.aulas) return { texto: 'Rascunho', ativo: false }
  if (c.rascunhos > 0) return { texto: `${c.rascunhos} em rascunho`, ativo: false }
  return { texto: 'Ativo', ativo: true }
}

/** Reordenar módulos de topo: arrastar ou subir/descer; grava a ordem inteira numa só chamada. */
export function ReordenarModulosDialog({ produtoId, modulos, paiId = null, onClose, onPronto }: {
  produtoId: string; modulos: ModuloRow[]; /** irmãos de qual nível (null = topo) */ paiId?: string | null; onClose: () => void; onPronto: () => void
}) {
  const [ids, setIds] = useState(() => modulos.filter((m) => (m.pai_id ?? null) === paiId).sort((a, b) => a.ordem - b.ordem).map((m) => m.id))
  const [drag, setDrag] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const nome = (id: string) => modulos.find((m) => m.id === id)?.titulo ?? ''
  const mover = (i: number, d: number) => setIds((p) => { const j = i + d; if (j < 0 || j >= p.length) return p; const n = [...p]; [n[i], n[j]] = [n[j], n[i]]; return n })
  function soltar(alvo: string) {
    if (!drag || drag === alvo) return
    setIds((p) => { const n = p.filter((x) => x !== drag); n.splice(n.indexOf(alvo), 0, drag); return n })
    setDrag(null)
  }
  async function salvar() {
    setSalvando(true)
    const r = await reordenarModulosAction(produtoId, ids)
    setSalvando(false)
    if ('error' in r && r.error) { toast.error(r.error); return }
    toast.success('Ordem dos módulos salva.'); onPronto(); onClose()
  }
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent showCloseButton className="sm:max-w-lg">
        <DialogTitle>{paiId ? 'Reordenar submódulos' : 'Reordenar módulos'}</DialogTitle>
        <p className="text-sm text-muted-foreground">Arraste ou use as setas. A ordem vale para o aluno.</p>
        <ul className="max-h-[55vh] space-y-1.5 overflow-y-auto pr-1">
          {ids.map((id, i) => (
            <li key={id} draggable onDragStart={() => setDrag(id)} onDragOver={(e) => e.preventDefault()} onDrop={() => soltar(id)} onDragEnd={() => setDrag(null)}
              className={cn('flex items-center gap-2 rounded-lg border bg-card px-2 py-1.5 text-sm', drag === id && 'opacity-50')}>
              <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground/60" aria-hidden />
              <span className="w-6 shrink-0 text-xs tabular-nums text-muted-foreground">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate">{nome(id)}</span>
              <Button variant="ghost" size="icon-sm" aria-label="Subir" disabled={i === 0} onClick={() => mover(i, -1)}><ArrowUp className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon-sm" aria-label="Descer" disabled={i === ids.length - 1} onClick={() => mover(i, 1)}><ArrowDown className="h-4 w-4" /></Button>
            </li>
          ))}
        </ul>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando}>{salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Salvar ordem</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
