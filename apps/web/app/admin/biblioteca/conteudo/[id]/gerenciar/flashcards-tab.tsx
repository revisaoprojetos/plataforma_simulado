'use client'

// AUTORIA DE FLASHCARDS do material (aba "Flashcards" do gerenciamento). CRUD scoped a 1 documento:
// listar (frente/verso/ordem/ativo), criar/editar (Dialog shadcn), excluir (confirmar()), ativar/desativar
// (Switch) e reordenar (setas ↑/↓). Consome flashcards-actions (server) — toda autorização é server-side.
// Cores/estilo via tokens shadcn; pt-BR; datas via @/lib/brt. Trata tabela não-migrada sem quebrar.

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ArrowDown, ArrowUp, Layers, Pencil, Plus, Power, Search, Trash2 } from 'lucide-react'
import { formatBrt } from '@/lib/brt'
import { confirmar } from '@/components/ui/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  listarFlashcardsDoMaterial, criarFlashcardMaterial, atualizarFlashcardMaterial,
  removerFlashcardMaterial, reordenarFlashcardsMaterial, type FlashcardAdmin,
} from '@/app/admin/biblioteca/flashcards-actions'

const dt = (s: string | null) => (s ? formatBrt(s) : '—')

export function AbaFlashcards({ documentoId }: { documentoId: string }) {
  const [estado, setEstado] = useState<'carregando' | 'pronto' | 'erro'>('carregando')
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [cards, setCards] = useState<FlashcardAdmin[]>([])
  const [busca, setBusca] = useState('')
  const [editando, setEditando] = useState<FlashcardAdmin | 'novo' | null>(null)
  const [movendo, setMovendo] = useState(false)

  async function recarregar() {
    const r = await listarFlashcardsDoMaterial(documentoId)
    if (!r.ok) { setEstado('erro'); setErro(r.error ?? 'Falha ao carregar.'); return }
    setCards(r.itens); setAviso(r.aviso ?? null); setEstado('pronto')
  }

  useEffect(() => {
    let vivo = true
    listarFlashcardsDoMaterial(documentoId)
      .then((r) => {
        if (!vivo) return
        if (!r.ok) { setEstado('erro'); setErro(r.error ?? 'Falha ao carregar.'); return }
        setCards(r.itens); setAviso(r.aviso ?? null); setEstado('pronto')
      })
      .catch((e) => { if (vivo) { setEstado('erro'); setErro(e?.message ?? 'Falha ao carregar.') } })
    return () => { vivo = false }
  }, [documentoId])

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase()
    if (!t) return cards
    return cards.filter((c) => c.frente.toLowerCase().includes(t) || c.verso.toLowerCase().includes(t))
  }, [cards, busca])

  const ativos = cards.filter((c) => c.ativo).length

  async function toggleAtivo(c: FlashcardAdmin) {
    const alvo = !c.ativo
    setCards((p) => p.map((x) => (x.id === c.id ? { ...x, ativo: alvo } : x)))
    const r = await atualizarFlashcardMaterial(c.id, { ativo: alvo })
    if (!r.ok) {
      setCards((p) => p.map((x) => (x.id === c.id ? { ...x, ativo: c.ativo } : x)))
      toast.error(r.error || 'Falha ao atualizar.')
    } else toast.success(alvo ? 'Flashcard ativado.' : 'Flashcard desativado.')
  }

  async function excluir(c: FlashcardAdmin) {
    const ok = await confirmar({
      titulo: 'Excluir flashcard',
      mensagem: 'Isto remove o cartão e todo o progresso de revisão dos alunos vinculado a ele. Não há como desfazer.',
      destrutivo: true, confirmar: 'Excluir',
    })
    if (!ok) return
    const antes = cards
    setCards((p) => p.filter((x) => x.id !== c.id))
    const r = await removerFlashcardMaterial(c.id)
    if (!r.ok) { setCards(antes); toast.error(r.error || 'Falha ao excluir.') }
    else toast.success('Flashcard excluído.')
  }

  // Reordena trocando a ORDEM entre o cartão e o vizinho (robusto a ordens não-contíguas).
  async function mover(idx: number, dir: -1 | 1) {
    const j = idx + dir
    if (j < 0 || j >= cards.length || movendo) return
    const a = cards[idx], b = cards[j]
    const novo = [...cards]
    novo[idx] = { ...b, ordem: a.ordem }
    novo[j] = { ...a, ordem: b.ordem }
    const anterior = cards
    setCards(novo); setMovendo(true)
    const r = await reordenarFlashcardsMaterial([{ id: a.id, ordem: b.ordem }, { id: b.id, ordem: a.ordem }])
    setMovendo(false)
    if (!r.ok) { setCards(anterior); toast.error(r.error || 'Falha ao reordenar.') }
  }

  if (estado === 'carregando') {
    return <div className="rounded-2xl border border-dashed bg-muted/40 p-10 text-center text-sm text-muted-foreground">Carregando flashcards…</div>
  }
  if (estado === 'erro') {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
        {erro}
        <div className="mt-3"><Button variant="outline" size="sm" onClick={() => { setEstado('carregando'); recarregar() }}>Tentar de novo</Button></div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Cabeçalho da aba */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><Layers className="size-4" /></span>
          <div>
            <h2 className="text-[15px] font-bold leading-tight text-foreground">Flashcards deste material</h2>
            <p className="text-xs text-muted-foreground">{cards.length} cartão(ões) · {ativos} ativo(s). Frente (pergunta) e verso (resposta) são revisados pelos alunos no modo SRS.</p>
          </div>
        </div>
        <span className="flex-1" />
        {cards.length > 0 && (
          <label className="flex h-8 w-56 items-center gap-2 rounded-lg border px-2.5 text-muted-foreground">
            <Search className="size-3.5" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar na frente/verso" aria-label="Buscar flashcard"
              className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-foreground outline-none" />
          </label>
        )}
        <Button size="sm" onClick={() => setEditando('novo')}><Plus className="size-3.5" />Novo flashcard</Button>
      </div>

      {aviso && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-2.5 text-[13px] text-amber-700 dark:text-amber-400">{aviso}</div>
      )}

      {/* Lista */}
      {cards.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed bg-muted/40 p-12 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Layers className="size-6" /></span>
          <div>
            <p className="text-sm font-semibold text-foreground">Nenhum flashcard ainda</p>
            <p className="mt-1 text-[13px] text-muted-foreground">Crie o primeiro cartão de revisão para este material.</p>
          </div>
          <Button size="sm" onClick={() => setEditando('novo')}><Plus className="size-3.5" />Criar flashcard</Button>
        </div>
      ) : filtrados.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-muted/40 p-10 text-center text-sm text-muted-foreground">Nenhum flashcard encontrado para “{busca}”.</div>
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card">
          <div className="grid grid-cols-[52px_minmax(0,1.2fr)_minmax(0,1.2fr)_92px_96px_132px] gap-3 border-b bg-muted/60 px-4 py-2.5 text-[10.5px] font-extrabold tracking-wider text-muted-foreground">
            <span>ORDEM</span><span>FRENTE</span><span>VERSO</span><span>STATUS</span><span>CRIADO</span><span className="text-right">AÇÕES</span>
          </div>
          {filtrados.map((c) => {
            const idx = cards.findIndex((x) => x.id === c.id)
            const semBusca = busca.trim() === ''
            return (
              <div key={c.id} className="grid grid-cols-[52px_minmax(0,1.2fr)_minmax(0,1.2fr)_92px_96px_132px] items-center gap-3 border-b px-4 py-2.5 text-[13px] last:border-b-0 hover:bg-muted/30">
                <span className="flex items-center gap-0.5">
                  <Button variant="ghost" size="icon-xs" disabled={!semBusca || idx === 0 || movendo} onClick={() => mover(idx, -1)} aria-label="Mover para cima" title={semBusca ? 'Mover para cima' : 'Limpe a busca para reordenar'}><ArrowUp /></Button>
                  <Button variant="ghost" size="icon-xs" disabled={!semBusca || idx === cards.length - 1 || movendo} onClick={() => mover(idx, 1)} aria-label="Mover para baixo"><ArrowDown /></Button>
                </span>
                <span className={`line-clamp-2 ${c.ativo ? 'text-foreground' : 'text-muted-foreground'}`}>{c.frente}</span>
                <span className="line-clamp-2 text-muted-foreground">{c.verso}</span>
                <span>
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${c.ativo ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400' : 'bg-muted text-muted-foreground'}`}>
                    <span className={`size-1.5 rounded-full ${c.ativo ? 'bg-emerald-600' : 'bg-muted-foreground'}`} />{c.ativo ? 'Ativo' : 'Inativo'}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">{dt(c.criado_em)}</span>
                <span className="flex items-center justify-end gap-1">
                  <Switch checked={c.ativo} onCheckedChange={() => toggleAtivo(c)} aria-label={c.ativo ? 'Desativar' : 'Ativar'} />
                  <Button variant="ghost" size="icon-sm" onClick={() => setEditando(c)} aria-label="Editar"><Pencil /></Button>
                  <Button variant="ghost" size="icon-sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => excluir(c)} aria-label="Excluir"><Trash2 /></Button>
                </span>
              </div>
            )
          })}
        </div>
      )}
      <p className="text-xs text-muted-foreground">As setas reordenam os cartões para os alunos. Desativar preserva o progresso de revisão; excluir apaga tudo. <Power className="inline size-3" /> o progresso SRS é por aluno.</p>

      {editando && (
        <FlashcardDialog
          documentoId={documentoId}
          card={editando === 'novo' ? null : editando}
          onClose={() => setEditando(null)}
          onSalvo={() => { setEditando(null); recarregar() }}
        />
      )}
    </div>
  )
}

function FlashcardDialog({
  documentoId, card, onClose, onSalvo,
}: { documentoId: string; card: FlashcardAdmin | null; onClose: () => void; onSalvo: () => void }) {
  const [frente, setFrente] = useState(card?.frente ?? '')
  const [verso, setVerso] = useState(card?.verso ?? '')
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    const f = frente.trim(), v = verso.trim()
    if (!f || !v) { toast.error('Preencha a frente e o verso.'); return }
    setSalvando(true)
    const r = card
      ? await atualizarFlashcardMaterial(card.id, { frente: f, verso: v })
      : await criarFlashcardMaterial(documentoId, f, v)
    setSalvando(false)
    if (!r.ok) { toast.error(r.error || 'Falha ao salvar.'); return }
    toast.success(card ? 'Flashcard atualizado.' : 'Flashcard criado.')
    onSalvo()
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{card ? 'Editar flashcard' : 'Novo flashcard'}</DialogTitle>
          <DialogDescription>Frente é a pergunta/estímulo; verso é a resposta. Os alunos revisam no modo SRS.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-1">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fc-frente">Frente (pergunta)</Label>
            <Textarea id="fc-frente" autoFocus value={frente} onChange={(e) => setFrente(e.target.value)} rows={3} placeholder="Ex.: Qual o prazo para contestação no procedimento comum?" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fc-verso">Verso (resposta)</Label>
            <Textarea id="fc-verso" value={verso} onChange={(e) => setVerso(e.target.value)} rows={4} placeholder="Ex.: 15 dias úteis (art. 335, CPC)." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando || !frente.trim() || !verso.trim()}>{salvando ? 'Salvando…' : card ? 'Salvar' : 'Criar flashcard'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
