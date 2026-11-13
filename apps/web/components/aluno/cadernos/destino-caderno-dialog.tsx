'use client'

// Dialog "Salvar nos cadernos" do leitor da Biblioteca: o aluno escolhe o caderno de DESTINO da leitura (ou
// "Perguntar sempre"), cria um novo inline e liga o salvamento automático. Irmão visual do SalvarComentarioCaderno
// (mesmo Dialog/Button/Input shadcn, tokens, lucide). Controlado pelo host (leitor-biblioteca.tsx), que é dono dos dados.
// A cor de destaque é a da BARRA SUPERIOR do leitor (o host a recebe do iframe e passa em `cor`) -> var local --dst-brand.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { BookMarked, Check, ChevronDown, HelpCircle, Loader2, NotebookPen, Plus, Search } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'

type Caderno = { id: string; nome: string; total: number }

const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const BRAND = 'var(--dst-brand,var(--primary))'

export function DestinoCadernoDialog({
  open, onOpenChange, cadernos, cadernoId, automatico, carregando, erro, cor, onEscolher, onAutomatico, onCriar, onVer, onRetentar,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  cadernos: Caderno[]
  /** Caderno de destino atual (null = perguntar sempre). */
  cadernoId: string | null
  automatico: boolean
  carregando?: boolean
  erro?: boolean
  /** Cor sólida da barra superior do leitor (resolvida no iframe). Sem ela, usa o primary do tema. */
  cor?: string | null
  onEscolher: (id: string | null) => void
  onAutomatico: (v: boolean) => void
  /** Cria o caderno (vira destino). Devolve true se deu certo. */
  onCriar: (nome: string) => Promise<boolean>
  onVer: () => void
  onRetentar?: () => void
}) {
  const [q, setQ] = useState('')
  const [aberto, setAberto] = useState(false) // painel do combobox
  const [ativo, setAtivo] = useState(0)
  const [criando, setCriando] = useState(false)
  const [nome, setNome] = useState('')
  const [busy, setBusy] = useState(false)
  const lista = useRef<HTMLDivElement>(null)
  const gatilho = useRef<HTMLButtonElement>(null)
  const entrada = useRef<HTMLInputElement>(null)
  const caixa = useRef<HTMLDivElement>(null)

  useEffect(() => { if (!open) { setQ(''); setAberto(false); setCriando(false); setNome(''); setBusy(false) } }, [open])

  const temBusca = cadernos.length > 5
  const existe = cadernoId !== null && cadernos.some((c) => c.id === cadernoId)
  const efetivo = existe ? cadernoId : null // destino que sumiu da lista = "Perguntar sempre"
  const atual = cadernos.find((c) => c.id === efetivo) ?? null
  const buscando = q.trim().length > 0

  const filtrados = useMemo(() => {
    const t = norm(q.trim())
    return t ? cadernos.filter((c) => norm(c.nome).includes(t)) : cadernos
  }, [cadernos, q])
  // Opções do listbox: "Perguntar sempre" fixa no topo (some só durante a busca).
  const opcoes: { id: string | null; nome: string; total: number | null }[] = [
    ...(!buscando ? [{ id: null, nome: 'Perguntar sempre', total: null }] : []),
    ...filtrados.map((c) => ({ id: c.id, nome: c.nome, total: Number(c.total) || 0 })),
  ]

  function abrir() {
    setQ('')
    const i = Math.max(0, opcoes.findIndex((o) => o.id === efetivo))
    setAtivo(i); setAberto(true)
  }
  function fechar(devolverFoco = true) { setAberto(false); setQ(''); if (devolverFoco) setTimeout(() => gatilho.current?.focus(), 0) }
  function escolher(id: string | null) { if (id !== efetivo) onEscolher(id); fechar() }

  // foco ao abrir: busca (se existir) ou a própria lista
  useEffect(() => {
    if (!aberto) return
    const t = setTimeout(() => { (temBusca ? entrada.current : caixa.current)?.focus() }, 0)
    return () => clearTimeout(t)
  }, [aberto, temBusca])
  // mantém a opção ativa visível
  useEffect(() => {
    if (!aberto) return
    lista.current?.querySelector<HTMLElement>(`[data-i="${ativo}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [ativo, aberto])
  useEffect(() => { setAtivo(0) }, [q])

  function teclasPainel(e: React.KeyboardEvent) {
    const n = opcoes.length
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fechar(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setAtivo((a) => (n ? (a + 1) % n : 0)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAtivo((a) => (n ? (a - 1 + n) % n : 0)) }
    else if (e.key === 'Home') { e.preventDefault(); setAtivo(0) }
    else if (e.key === 'End') { e.preventDefault(); setAtivo(Math.max(0, n - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (opcoes[ativo]) escolher(opcoes[ativo].id) }
    else if (e.key === 'Tab') { fechar(false) }
  }

  async function criar() {
    const n = nome.trim()
    if (!n || busy) return
    setBusy(true)
    const ok = await onCriar(n)
    setBusy(false)
    if (ok) { setCriando(false); setNome('') }
  }

  const vazio = !carregando && !erro && cadernos.length === 0
  const estilo = (cor ? { '--dst-brand': cor } : undefined) as CSSProperties | undefined
  const idOpt = (i: number) => `destino-opt-${i}`

  return (
    <Dialog open={open} onOpenChange={(o) => {
      if (!o && aberto) { fechar(); return }
      if (!o && criando) { setCriando(false); setNome(''); return }
      onOpenChange(o)
    }}>
      <DialogContent overlayClassName="z-[300]" className="z-[301] max-h-[calc(100dvh-2rem)] overflow-x-hidden overflow-y-auto sm:max-w-md [&>*]:min-w-0" style={estilo}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5 text-base">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white" style={{ background: BRAND }}>
              <BookMarked aria-hidden="true" className="h-4 w-4" />
            </span>
            Salvar nos cadernos
          </DialogTitle>
          <DialogDescription>Escolha onde guardar seus grifos, notas e anotações desta leitura.</DialogDescription>
        </DialogHeader>

        {erro ? (
          <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <span>Não consegui carregar seus cadernos.</span>
            {onRetentar && <Button type="button" variant="outline" className="h-10 sm:h-8" onClick={onRetentar}>Tentar de novo</Button>}
          </div>
        ) : carregando ? (
          <div className="flex justify-center py-6 text-muted-foreground"><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /><span className="sr-only">Carregando</span></div>
        ) : vazio ? (
          <div className="rounded-lg border bg-muted/30 p-4 text-center text-sm text-muted-foreground">
            <NotebookPen aria-hidden="true" className="mx-auto mb-2 h-5 w-5" />
            Você ainda não tem cadernos. Crie o primeiro para guardar seus grifos e anotações.
          </div>
        ) : (
          <div className="space-y-2">
            <span id="destino-lbl" className="text-xs font-medium text-muted-foreground">Caderno de destino</span>
            <div>
              <button ref={gatilho} type="button" role="combobox" aria-haspopup="listbox" aria-expanded={aberto} aria-controls="destino-lista" aria-labelledby="destino-lbl destino-val"
                onClick={() => (aberto ? fechar() : abrir())}
                onKeyDown={(e) => { if (!aberto && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); abrir() } }}
                className={`flex h-10 w-full items-center gap-2 rounded-lg border bg-background px-3 text-left text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${aberto ? 'border-ring ring-2 ring-ring/40' : ''}`}>
                {atual ? <NotebookPen aria-hidden="true" className="h-4 w-4 shrink-0" style={{ color: BRAND }} /> : <HelpCircle aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />}
                <span id="destino-val" className="min-w-0 flex-1 truncate">{atual ? atual.nome : 'Perguntar sempre'}</span>
                {atual && <span className="text-xs tabular-nums text-muted-foreground">{Number(atual.total) || 0}<span className="sr-only"> {Number(atual.total) === 1 ? 'item' : 'itens'}</span></span>}
                <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none ${aberto ? 'rotate-180' : ''}`} />
              </button>

              {aberto && (
                <div ref={caixa} tabIndex={temBusca ? -1 : 0} onKeyDown={teclasPainel} role="presentation"
                  className="mt-1.5 overflow-hidden rounded-lg border bg-popover text-popover-foreground outline-none">
                  {temBusca && (
                    <div className="relative border-b">
                      <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <input ref={entrada} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar caderno" aria-label="Buscar caderno"
                        role="combobox" aria-expanded="true" aria-controls="destino-lista" aria-autocomplete="list" aria-activedescendant={opcoes[ativo] ? idOpt(ativo) : undefined}
                        autoComplete="off" className="h-10 w-full bg-transparent pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground" />
                    </div>
                  )}
                  <div ref={lista} id="destino-lista" role="listbox" aria-label="Cadernos" aria-activedescendant={!temBusca && opcoes[ativo] ? idOpt(ativo) : undefined}
                    className="relative max-h-[13.5rem] overflow-y-auto overscroll-contain py-1">
                    {opcoes.map((o, i) => {
                      const on = o.id === efetivo
                      return (
                        <div key={o.id ?? 'nenhum'} id={idOpt(i)} data-i={i} role="option" aria-selected={on} title={o.nome}
                          onMouseMove={() => { if (ativo !== i) setAtivo(i) }}
                          onClick={() => escolher(o.id)}
                          className={`flex h-9 cursor-pointer items-center gap-2 px-3 text-sm ${i === ativo ? 'bg-muted' : ''} ${o.id === null ? 'border-b' : ''}`}>
                          {o.id === null
                            ? <HelpCircle aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
                            : <NotebookPen aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />}
                          <span className={`min-w-0 flex-1 truncate ${on ? 'font-medium' : ''}`}>{o.nome}</span>
                          {o.total !== null && <span className="text-xs tabular-nums text-muted-foreground">{o.total}<span className="sr-only"> {o.total === 1 ? 'item' : 'itens'}</span></span>}
                          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-white" style={on ? { background: BRAND } : undefined}>
                            {on && <Check aria-hidden="true" className="h-3 w-3" />}
                          </span>
                        </div>
                      )
                    })}
                    {buscando && filtrados.length === 0 && <p className="px-3 py-3 text-center text-xs text-muted-foreground">Nenhum resultado</p>}
                  </div>
                  <div className="border-t px-3 py-1.5 text-[11px] text-muted-foreground" aria-live="polite">
                    {buscando ? (filtrados.length ? `${filtrados.length} de ${cadernos.length} cadernos` : 'Nenhum resultado') : `${cadernos.length} ${cadernos.length === 1 ? 'caderno' : 'cadernos'}`}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {!erro && !carregando && (criando || vazio ? (
          <div className="flex gap-2">
            <Input autoFocus value={nome} maxLength={120} onChange={(e) => setNome(e.target.value)} disabled={busy}
              className="h-10 sm:h-8"
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); void criar() }
                if (e.key === 'Escape' && !vazio) { e.preventDefault(); e.stopPropagation(); setCriando(false); setNome('') }
              }}
              placeholder="Nome do novo caderno" aria-label="Nome do novo caderno" />
            <Button type="button" className="h-10 text-white hover:brightness-110 sm:h-8" style={{ background: BRAND }} onClick={criar} disabled={busy || !nome.trim()}>
              {busy && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />} Criar
            </Button>
          </div>
        ) : (
          <button type="button" onClick={() => setCriando(true)}
            className="flex h-10 w-full items-center gap-2 rounded-lg border border-dashed px-3 text-left text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Plus aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="flex-1">Novo caderno</span>
          </button>
        ))}

        {!erro && !vazio && !carregando && (
          <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/40 p-3">
            <div className="min-w-0">
              <label htmlFor="destino-auto" className="text-sm font-medium">Salvar automaticamente</label>
              <p id="destino-auto-desc" className="text-xs text-muted-foreground">
                {efetivo ? 'Grifos, notas e anotações vão direto para o caderno escolhido.' : 'Escolha um caderno acima para ativar.'}
              </p>
            </div>
            <Switch id="destino-auto" aria-describedby="destino-auto-desc" checked={automatico && !!efetivo} disabled={!efetivo} onCheckedChange={(v) => onAutomatico(!!v)}
              className="data-checked:bg-[var(--dst-brand,var(--primary))]" />
          </div>
        )}

        <DialogFooter className="sm:flex-wrap sm:justify-between">
          <Button type="button" variant="outline" className="h-10 sm:h-8" onClick={onVer}>Ver meus cadernos</Button>
          <Button type="button" className="h-10 text-white hover:brightness-110 sm:h-8" style={{ background: BRAND }} onClick={() => onOpenChange(false)}>Concluir</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
