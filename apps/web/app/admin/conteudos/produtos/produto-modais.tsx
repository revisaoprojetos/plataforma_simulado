'use client'

// Modais compartilhados do bloco Produtos do Estúdio: criar produto, mover (pasta/produto),
// renomear e duplicar produto. Reusa a action de criação de /admin/produtos (produção).

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Folder, FolderPlus, ChevronRight, ChevronDown, Check, Loader2, Layers, Lock, Boxes } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { PRODUTO_TIPOS, type ProdutoTipo } from '@/lib/produtos/tipos'
import { salvarProdutoAction } from '@/app/admin/produtos/actions'
import { criarPastaProdutoAction, moverPastaProdutoAction, moverProdutoAction, duplicarProdutoAction } from './actions'
import { pedirTexto } from '@/components/ui/confirm-dialog'
import { CampoImagem } from '@/components/admin/campo-imagem'
import type { PastaProdutoFlat } from '@/lib/produtos/estudio'

// ───────────────────────── Árvore de pastas (seleção de destino) ─────────────────────────
export function PastaTreePicker({ arvore, valor, onValor, excluirIds, rotuloRaiz = 'Produtos (raiz)' }: {
  arvore: PastaProdutoFlat[]; valor: string | null; onValor: (id: string | null) => void; excluirIds?: Set<string>; rotuloRaiz?: string
}) {
  const [busca, setBusca] = useState('')
  const filhosPorPai = useMemo(() => {
    const m = new Map<string | null, PastaProdutoFlat[]>()
    for (const p of arvore) { if (excluirIds?.has(p.id)) continue; const k = p.pai_id ?? null; const a = m.get(k) ?? []; a.push(p); m.set(k, a) }
    for (const a of m.values()) a.sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR'))
    return m
  }, [arvore, excluirIds])
  const q = busca.trim().toLowerCase()
  const filtrados = q ? arvore.filter((p) => !excluirIds?.has(p.id) && p.nome.toLowerCase().includes(q)) : null

  return (
    <div className="space-y-2">
      <div className="relative">
        <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar pasta" className="pl-3" />
      </div>
      <div className="max-h-72 overflow-y-auto rounded-xl border bg-background p-1.5">
        <button type="button" onClick={() => onValor(null)}
          className={cn('mb-0.5 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted', valor === null && 'bg-primary/10 font-semibold text-primary')}>
          <Layers className="h-4 w-4" /> {rotuloRaiz}{valor === null && <Check className="ml-auto h-4 w-4" />}
        </button>
        {filtrados ? (
          filtrados.length === 0 ? <div className="px-2 py-3 text-center text-xs text-muted-foreground">Nenhuma pasta.</div>
          : filtrados.map((p) => (
            <button key={p.id} type="button" onClick={() => onValor(p.id)}
              className={cn('flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted', valor === p.id && 'bg-primary/10 font-semibold text-primary')}>
              <Folder className="h-4 w-4 text-muted-foreground" /> <span className="truncate">{p.nome}</span>{valor === p.id && <Check className="ml-auto h-4 w-4" />}
            </button>
          ))
        ) : (
          (filhosPorPai.get(null) ?? []).map((p) => (
            <No key={p.id} no={p} filhosPorPai={filhosPorPai} valor={valor} onValor={onValor} nivel={0} />
          ))
        )}
      </div>
    </div>
  )
}

function No({ no, filhosPorPai, valor, onValor, nivel }: {
  no: PastaProdutoFlat; filhosPorPai: Map<string | null, PastaProdutoFlat[]>; valor: string | null; onValor: (id: string) => void; nivel: number
}) {
  const filhos = filhosPorPai.get(no.id) ?? []
  const [aberto, setAberto] = useState(nivel < 1)
  const ativo = valor === no.id
  return (
    <div>
      <div className={cn('flex items-center gap-0.5 rounded-lg pr-1 hover:bg-muted', ativo && 'bg-primary/10')} style={{ paddingLeft: nivel * 12 }}>
        {filhos.length > 0 ? (
          <button type="button" onClick={() => setAberto((v) => !v)} aria-label={aberto ? 'Recolher' : 'Expandir'} className="grid h-6 w-6 shrink-0 place-items-center rounded text-muted-foreground hover:text-foreground">
            {aberto ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        ) : <span className="h-6 w-6 shrink-0" />}
        <button type="button" onClick={() => onValor(no.id)} className={cn('flex min-w-0 flex-1 items-center gap-1.5 py-1.5 text-left text-sm', ativo ? 'font-semibold text-primary' : 'text-foreground')}>
          <Folder className="h-4 w-4 shrink-0 text-muted-foreground" /> <span className="truncate">{no.nome}</span>{ativo && <Check className="ml-auto h-4 w-4" />}
        </button>
      </div>
      {aberto && filhos.map((f) => <No key={f.id} no={f} filhosPorPai={filhosPorPai} valor={valor} onValor={onValor} nivel={nivel + 1} />)}
    </div>
  )
}

// ───────────────────────── Mover (pasta OU produto) para outra pasta ─────────────────────────
export function MoverDialog({ open, onClose, arvore, alvo, onMovido, moverCustom, criarPastaCustom }: {
  open: boolean; onClose: () => void; arvore: PastaProdutoFlat[]
  alvo: { kind: 'pasta' | 'produto' | 'simulado'; id: string; nome: string }
  onMovido: () => void
  /** Ação de mover própria (simulado / pasta de simulado). Retorna { error } ou { ok:false }. */
  moverCustom?: (destino: string | null) => Promise<any>
  criarPastaCustom?: (nome: string, pai: string | null) => Promise<any>
}) {
  const [destino, setDestino] = useState<string | null>(null)
  const [pending, start] = useTransition()
  // Mover uma pasta não pode cair nela mesma nem nas descendentes.
  const excluir = useMemo(() => {
    if (alvo.kind !== 'pasta') return undefined
    const set = new Set<string>([alvo.id]); let add = true
    while (add) { add = false; for (const p of arvore) if (p.pai_id && set.has(p.pai_id) && !set.has(p.id)) { set.add(p.id); add = true } }
    return set
  }, [alvo, arvore])

  function mover() {
    start(async () => {
      const r: any = moverCustom ? await moverCustom(destino)
        : alvo.kind === 'pasta' ? await moverPastaProdutoAction(alvo.id, destino) : await moverProdutoAction(alvo.id, destino)
      if (r?.error || r?.ok === false) { toast.error(r.error || 'Falha ao mover.'); return }
      toast.success('Movido.'); onMovido(); onClose()
    })
  }
  async function criarPastaAqui() {
    const nome = await pedirTexto({ titulo: 'Nova pasta', label: 'Nome da pasta', confirmar: 'Criar pasta' })
    if (!nome?.trim()) return
    const r: any = criarPastaCustom ? await criarPastaCustom(nome, destino) : await criarPastaProdutoAction(nome, destino)
    if (r?.error) { toast.error(r.error); return }
    toast.success('Pasta criada. Recarregando…'); onMovido()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent showCloseButton className="sm:max-w-lg">
        <DialogTitle>Mover para outra pasta</DialogTitle>
        <div className="rounded-xl border bg-muted/40 px-3 py-2.5 text-sm">
          <span className="font-medium">{alvo.nome}</span>
          <span className="ml-1 text-xs text-muted-foreground">· {alvo.kind === 'pasta' ? 'Pasta' : alvo.kind === 'simulado' ? 'Simulado' : 'Produto'}</span>
        </div>
        <PastaTreePicker arvore={arvore} valor={destino} onValor={setDestino} excluirIds={excluir} />
        <button type="button" onClick={criarPastaAqui} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
          <FolderPlus className="h-4 w-4" /> Criar pasta nova aqui
        </button>
        <p className="rounded-xl bg-primary/5 px-3 py-2 text-xs text-muted-foreground">Mover de pasta não muda grupos de acesso nem o que o aluno vê. A pasta só organiza o admin.</p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={pending}>Cancelar</Button>
          <Button onClick={mover} disabled={pending}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Folder className="h-4 w-4" />}Mover</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ───────────────────────── Renomear (genérico) ─────────────────────────
export function RenomearDialog({ open, onClose, titulo, valorInicial, onSalvar }: {
  open: boolean; onClose: () => void; titulo: string; valorInicial: string; onSalvar: (novo: string) => Promise<void> | void
}) {
  const [v, setV] = useState(valorInicial)
  const [pending, start] = useTransition()
  function salvar() { const nome = v.trim(); if (!nome) return; start(async () => { await onSalvar(nome); onClose() }) }
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent showCloseButton className="sm:max-w-sm">
        <DialogTitle>{titulo}</DialogTitle>
        <Input autoFocus value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); salvar() } }} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={pending}>Cancelar</Button>
          <Button onClick={salvar} disabled={pending || !v.trim()}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Salvar</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ───────────────────────── Duplicar produto ─────────────────────────
export function DuplicarProdutoDialog({ open, onClose, produto, onDuplicado }: {
  open: boolean; onClose: () => void; produto: { id: string; nome: string }; onDuplicado: (id: string) => void
}) {
  const [nome, setNome] = useState(`${produto.nome} (cópia)`)
  const [pending, start] = useTransition()
  function duplicar() {
    start(async () => {
      const r = await duplicarProdutoAction(produto.id, nome)
      if ('error' in r && r.error) { toast.error(r.error); return }
      toast.success('Produto duplicado (inativo).'); onDuplicado((r as { id: string }).id); onClose()
    })
  }
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent showCloseButton className="sm:max-w-md">
        <DialogTitle>Duplicar produto</DialogTitle>
        <label className="block"><span className="mb-1 block text-sm font-medium">Nome da cópia</span>
          <Input autoFocus value={nome} onChange={(e) => setNome(e.target.value)} /></label>
        <p className="text-xs text-muted-foreground">Copia identidade, vitrine, liberações, instrutores e currículo. A cópia nasce <strong>inativa</strong>. Os alunos já concedidos não são copiados.</p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={pending}>Cancelar</Button>
          <Button onClick={duplicar} disabled={pending || !nome.trim()}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Duplicar</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Tipos LIBERADOS (funcionais na plataforma hoje). Os demais ficam "Em breve" (desabilitados) para
// não criar produtos de um tipo que ainda não existe. Ajuste conforme a plataforma evoluir.
const TIPOS_LIBERADOS = new Set<ProdutoTipo>(['extensivo', 'jurisclub'])

/** Select de Tipo custom (não nativo) com divisão Liberados × Em breve. */
function TipoSelect({ valor, onValor }: { valor: ProdutoTipo; onValor: (v: ProdutoTipo) => void }) {
  const atual = PRODUTO_TIPOS.find((t) => t.v === valor) ?? PRODUTO_TIPOS[0]
  const liberados = PRODUTO_TIPOS.filter((t) => TIPOS_LIBERADOS.has(t.v))
  const bloqueados = PRODUTO_TIPOS.filter((t) => !TIPOS_LIBERADOS.has(t.v))
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="group inline-flex h-9 w-full items-center justify-between gap-2 rounded-lg border bg-background px-2.5 text-sm text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring data-popup-open:border-primary data-popup-open:bg-muted">
        <span className="truncate">{atual.label}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[popup-open]:rotate-180" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={6} className="max-h-72">
        <div className="px-1.5 pb-1 pt-0.5 text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">Liberados</div>
        {liberados.map((t) => (
          <DropdownMenuItem key={t.v} onClick={() => onValor(t.v)} className={cn('justify-between', t.v === valor && 'font-semibold text-primary')}>
            {t.label}{t.v === valor && <Check className="h-4 w-4" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <div className="px-1.5 pb-1 pt-0.5 text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">Em breve</div>
        {bloqueados.map((t) => (
          <DropdownMenuItem key={t.v} disabled className="justify-between">
            <span className="inline-flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" />{t.label}</span>
            <span className="rounded-full bg-muted px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Em breve</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ───────────────────────── Novo produto (tela NovoProduto.png) ─────────────────────────
export function NovoProdutoDialog({ open, onClose, arvore, pastaAtual }: {
  open: boolean; onClose: () => void; arvore: PastaProdutoFlat[]; pastaAtual: string | null
}) {
  const router = useRouter()
  const [titulo, setTitulo] = useState('')
  const [tipo, setTipo] = useState<ProdutoTipo>('extensivo')
  const [pastaId, setPastaId] = useState<string | null>(pastaAtual)
  const [capaUrl, setCapaUrl] = useState('')
  // Placeholder visual (sem coluna no backend): interativo mas não persistido.
  const [visibilidade, setVisibilidade] = useState('Aberto ao público')
  const [depois, setDepois] = useState<'conteudos' | 'informacoes'>('conteudos')
  const [pending, start] = useTransition()

  function criar() {
    const nome = titulo.trim(); if (!nome) return
    start(async () => {
      const r = await salvarProdutoAction({ nome, tipo, capa_url: capaUrl || null })
      if ('error' in r && r.error) { toast.error(r.error); return }
      const id = (r as { id: string }).id
      if (pastaId) { const mv = await moverProdutoAction(id, pastaId); if ('error' in mv && mv.error) toast.error(mv.error) }
      toast.success('Produto criado.')
      router.push(`/admin/conteudos/produtos/${id}?aba=${depois}`)
    })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !pending) onClose() }}>
      {/* flex-col + corpo rolável + rodapé fixo → cabe em monitores pequenos. Animação sobe de baixo. */}
      <DialogContent showCloseButton={!pending}
        className="flex max-h-[88vh] flex-col gap-0 overflow-hidden p-0 duration-200 sm:max-w-lg data-open:slide-in-from-bottom-2 data-closed:slide-out-to-bottom-1">
        {/* Cabeçalho fixo */}
        <div className="shrink-0 border-b px-5 pb-3 pt-4">
          <div className="text-[11px] font-extrabold uppercase tracking-[.16em]" style={{ color: 'var(--gold-ink, var(--pn-9a7400,#9A7400))' }}>Produtos › Criar produto</div>
          <DialogTitle className="mt-0.5 text-[20px] font-extrabold tracking-tight">Criar produto</DialogTitle>
        </div>

        {pending ? (
          /* Estado "gerando novo produto" */
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
            <span className="relative grid h-16 w-16 place-items-center rounded-2xl text-white shadow-lg"
              style={{ background: 'linear-gradient(145deg, color-mix(in oklab, var(--primary) 82%, white), var(--primary))' }}>
              <span className="absolute inset-0 animate-ping rounded-2xl bg-primary/30" />
              <Boxes className="relative h-7 w-7" />
            </span>
            <div>
              <div className="flex items-center justify-center gap-2 text-sm font-bold text-foreground"><Loader2 className="h-4 w-4 animate-spin" />Gerando o produto…</div>
              <div className="mt-0.5 text-xs text-muted-foreground">Montando a estrutura do seu produto.</div>
            </div>
          </div>
        ) : (
          /* Corpo rolável (compacto) */
          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <label className="block"><span className="mb-1 block text-sm font-medium">Título <span className="text-destructive">*</span></span>
              <Input autoFocus value={titulo} onChange={(e) => setTitulo(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); criar() } }} placeholder="Ex.: Sprint Discursiva PGM/Santos - Semana 08" /></label>

            <div className="grid gap-3 sm:grid-cols-2">
              <div><span className="mb-1 block text-sm font-medium">Tipo</span><TipoSelect valor={tipo} onValor={setTipo} /></div>
              <label className="block"><span className="mb-1 block text-sm font-medium">Salvar na pasta</span>
                <select value={pastaId ?? ''} onChange={(e) => setPastaId(e.target.value || null)} className="h-9 w-full rounded-lg border bg-background px-2.5 text-sm">
                  <option value="">Raiz de Produtos</option>
                  {[...arvore].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </label>
            </div>

            <PillsNovo titulo="Visibilidade" opcoes={['Aberto ao público', 'Apenas para matriculados', 'Apenas para logados']} valor={visibilidade} onValor={setVisibilidade} />

            {/* Capa compacta (thumb + ação) — não ocupa a altura toda */}
            <div>
              <span className="mb-1 block text-sm font-medium">Imagem horizontal · 16:9 <span className="font-normal text-muted-foreground">(opcional)</span></span>
              <CampoImagem variant="linha" value={capaUrl} onChange={setCapaUrl} />
              <div className="mt-1 text-xs text-muted-foreground">JPG, PNG ou WEBP · 1280 × 720</div>
            </div>

            {/* Depois de criar — 2 opções lado a lado (compacto) */}
            <div>
              <span className="mb-1 block text-sm font-medium">Depois de criar</span>
              <div className="grid gap-2 sm:grid-cols-2">
                {([['conteudos', 'Montar módulos e aulas'], ['informacoes', 'Continuar em Informações']] as const).map(([v, label]) => (
                  <label key={v} className={cn('flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-[13px]', depois === v && 'border-primary bg-primary/5')}>
                    <input type="radio" name="depois" checked={depois === v} onChange={() => setDepois(v)} className="h-4 w-4 shrink-0 accent-[var(--primary)]" />
                    <span className="font-medium leading-tight">{label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Rodapé fixo */}
        {!pending && (
          <div className="flex shrink-0 justify-end gap-2 border-t px-5 py-3">
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button onClick={criar} disabled={!titulo.trim()}><Check className="h-4 w-4" />Criar produto</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Grupo de pílulas do modal Novo produto (local; placeholder não persistido). */
function PillsNovo({ titulo, opcoes, valor, onValor }: { titulo: string; opcoes: string[]; valor: string; onValor: (v: string) => void }) {
  return (
    <div>
      <span className="mb-1 block text-sm font-medium">{titulo}</span>
      <div className="flex flex-wrap gap-2">
        {opcoes.map((o) => (
          <button key={o} type="button" onClick={() => onValor(o)} className={cn('rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors', o === valor ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')}>{o}</button>
        ))}
      </div>
    </div>
  )
}
