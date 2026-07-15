'use client'

import { useState, useTransition, useMemo, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog'
import { FileText, Check, Loader2, Search, ChevronDown, ChevronLeft, ChevronRight, Ban, ListChecks, PenLine, BookOpenCheck, Stethoscope, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { iconeBanco } from '@/lib/banco-visual'
import { associarCaderno } from '@/app/admin/banco-questoes/estudantes-actions'

interface Caderno { id: string; nome: string; descricao?: string | null; cor?: string | null; icone?: string | null; capa?: string | null }
interface Modalidade { id: string; nome: string }
const SEM = '__sem__'

/** Ícone por modalidade interna do caderno. */
function iconeModalidade(id: string) {
  if (id === 'gabarito_objetivo') return ListChecks
  if (id === 'gabarito_discursivo') return PenLine
  if (id === 'caderno_completo') return BookOpenCheck
  if (id === 'diagnostico') return Stethoscope
  return FileText
}

export function BancoCadernoClient({
  bancoId,
  cadernoAtualId,
  cadernos,
  modalidades = [],
  cor = '#6d28d9',
}: {
  bancoId: string
  cadernoAtualId: string | null
  cadernos: Caderno[]
  /** Cadernos internos (Objetivo / Completo / Diagnóstico…) do caderno associado. */
  modalidades?: Modalidade[]
  cor?: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [atual, setAtual] = useState(cadernoAtualId)
  const [escolha, setEscolha] = useState<string>(cadernoAtualId ?? SEM)
  const [busca, setBusca] = useState('')
  const [pending, start] = useTransition()
  const [salvandoId, setSalvandoId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const cadernoAtual = useMemo(() => cadernos.find((c) => c.id === atual) ?? null, [atual, cadernos])
  const filtrados = useMemo(() => {
    const q = busca.toLowerCase().trim()
    return q ? cadernos.filter((c) => c.nome.toLowerCase().includes(q) || (c.descricao ?? '').toLowerCase().includes(q)) : cadernos
  }, [busca, cadernos])

  // Associa direto (usado tanto no "Salvar" do pop-up quanto no clique dos cards da galeria).
  function associar(id: string | null, fecharPopup = false) {
    setSalvandoId(id ?? SEM)
    start(async () => {
      const r = await associarCaderno(bancoId, id)
      setSalvandoId(null)
      if (r.ok) { setAtual(id); setEscolha(id ?? SEM); if (fecharPopup) setOpen(false); router.refresh(); toast.success(id ? 'Caderno associado' : 'Associação removida') }
      else toast.error(r.error ?? 'Erro')
    })
  }

  function paginar(dir: -1 | 1) {
    const el = scrollRef.current
    if (!el) return
    el.scrollBy({ left: dir * Math.round(el.clientWidth * 0.85), behavior: 'smooth' })
  }

  return (
    <Card className="w-full overflow-hidden" style={{ ['--card-spacing' as any]: '0px' }}>
      <div className="flex items-center gap-3 border-b px-4 py-3.5" style={{ background: `linear-gradient(90deg, ${cor}1f, transparent 55%)` }}>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white shadow-sm" style={{ background: cor }}><FileText className="h-5 w-5" /></span>
        <div>
          <h3 className="text-sm font-semibold leading-tight">Moldura do caderno</h3>
          <p className="text-xs text-muted-foreground">Capa, contracapa e fundo dos documentos</p>
        </div>
      </div>
      <CardContent className="space-y-4 px-4 pb-4 pt-4">
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) { setEscolha(atual ?? SEM); setBusca('') } }}>
        {/* Barra de seleção — mostra a miniatura da capa do caderno escolhido */}
        <DialogTrigger
          className="flex w-full items-center justify-between gap-2 rounded-lg border bg-[var(--input-bg,transparent)] p-2 pr-3 text-left text-sm outline-none hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex min-w-0 items-center gap-3">
            {cadernoAtual ? <CapaMiniatura caderno={cadernoAtual} /> : (
              <span className="flex h-11 w-16 shrink-0 items-center justify-center rounded-md border border-dashed text-muted-foreground"><FileText className="h-4 w-4" /></span>
            )}
            {cadernoAtual
              ? <span className="min-w-0"><span className="block truncate font-medium">{cadernoAtual.nome}</span>{cadernoAtual.descricao && <span className="block truncate text-xs text-muted-foreground">{cadernoAtual.descricao}</span>}</span>
              : <span className="text-muted-foreground">Selecionar caderno…</span>}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </DialogTrigger>

        <DialogContent className="flex max-h-[88vh] w-[95vw] max-w-[95vw] flex-col duration-300 ease-out data-open:zoom-in-95 data-open:slide-in-from-bottom-4 data-closed:zoom-out-95 data-closed:slide-out-to-bottom-2 sm:max-w-6xl">
          <DialogHeader>
            <DialogTitle>Selecionar caderno</DialogTitle>
          </DialogHeader>

          {/* Busca + "Sem moldura" na mesma linha (à direita) */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar caderno…" className="pl-8" autoFocus />
            </div>
            <button type="button" onClick={() => setEscolha(SEM)}
              className={cn('inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors',
                escolha === SEM ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted')}>
              {escolha === SEM ? <Check className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
              Sem moldura
            </button>
          </div>

          {/* Grade de cards (tamanho normal) com capa */}
          <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 py-1">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {filtrados.map((c) => (
                <CadernoCard key={c.id} c={c} selecionado={escolha === c.id} onClick={() => setEscolha(c.id)} />
              ))}
            </div>

            {filtrados.length === 0 && (
              <p className="py-10 text-center text-sm text-muted-foreground">
                {cadernos.length === 0 ? <>Nenhum caderno criado ainda. Crie em <strong>Cadernos de Prova</strong>.</> : 'Nenhum caderno encontrado.'}
              </p>
            )}
          </div>

          {/* Salvar embaixo */}
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancelar</DialogClose>
            <Button type="button" onClick={() => associar(escolha === SEM ? null : escolha, true)} disabled={pending}>
              {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Galeria dos CADERNOS INTERNOS (modalidades) do caderno selecionado */}
      {cadernoAtual && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Cadernos internos de “{cadernoAtual.nome}”</p>
          {modalidades.length === 0 ? (
            <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
              Este caderno ainda não tem modalidades com conteúdo. Monte-as em <strong>Cadernos de Prova</strong>.
            </p>
          ) : modalidades.length <= 5 ? (
            /* Poucas modalidades: colunas iguais preenchendo a largura (alinhadas). */
            <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${modalidades.length}, minmax(0, 1fr))` }}>
              {modalidades.map((m) => (
                <ColunaCaderno key={m.id} cadernoId={cadernoAtual.id} cor={cadernoAtual.cor ?? '#6d28d9'} modalidade={m} />
              ))}
            </div>
          ) : (
            /* Muitas modalidades: rolagem horizontal com setas. */
            <div className="relative">
              <button type="button" onClick={() => paginar(-1)} aria-label="Anterior"
                className="absolute -left-2 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border bg-background shadow-sm transition-colors hover:bg-muted">
                <ChevronLeft className="h-4 w-4" />
              </button>

              <div ref={scrollRef} className="flex gap-4 overflow-x-auto scroll-smooth px-6 pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {modalidades.map((m) => (
                  <div key={m.id} className="w-[320px] shrink-0">
                    <ColunaCaderno cadernoId={cadernoAtual.id} cor={cadernoAtual.cor ?? '#6d28d9'} modalidade={m} />
                  </div>
                ))}
              </div>

              <button type="button" onClick={() => paginar(1)} aria-label="Próximo"
                className="absolute -right-2 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border bg-background shadow-sm transition-colors hover:bg-muted">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      )}
      </CardContent>
    </Card>
  )
}

/** Coluna com o preview COMPLETO de um caderno interno (modalidade), rolável por página.
 *  A largura vem do layout (grid/flex); o preview A4 é escalado para caber e mostra uma
 *  folha inteira por vez (role dentro para as próximas páginas). */
function ColunaCaderno({ cadernoId, cor, modalidade }: { cadernoId: string; cor: string; modalidade: Modalidade }) {
  const A4_W = 794, A4_H = 1123 // folha A4 a 96dpi (px)
  const boxRef = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(320)
  const [carregado, setCarregado] = useState(false)
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const upd = () => setW(el.clientWidth || 320)
    upd()
    const ro = new ResizeObserver(upd)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const s = w / A4_W // escala para a folha caber na largura da coluna
  const boxH = Math.round(w * (A4_H / A4_W)) // altura = uma folha A4 inteira
  const Icon = iconeModalidade(modalidade.id)
  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
      {/* Cabeçalho da coluna */}
      <div className="flex items-center gap-2 border-b px-2.5 py-2" style={{ background: `linear-gradient(90deg, ${cor}1f, transparent)` }}>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white shadow-sm" style={{ background: cor }}><Icon className="h-3.5 w-3.5" /></span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{modalidade.nome}</span>
        <a href={`/imprimir/caderno/${cadernoId}?mod=${modalidade.id}`} target="_blank" rel="noreferrer" title="Abrir em tela cheia / imprimir"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><ExternalLink className="h-4 w-4" /></a>
      </div>
      {/* Preview embutido — role dentro para ver as próximas páginas */}
      <div ref={boxRef} className="relative w-full overflow-hidden bg-neutral-200" style={{ height: boxH }}>
        {!carregado && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-neutral-100 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="text-xs">Carregando preview…</span>
          </div>
        )}
        <iframe
          src={`/imprimir/caderno/${cadernoId}?mod=${modalidade.id}&embed=1&rawimg=1`}
          title={modalidade.nome}
          loading="lazy"
          onLoad={() => setCarregado(true)}
          style={{ width: A4_W, height: A4_H, transform: `scale(${s})`, transformOrigin: 'top left', border: 0 }}
        />
      </div>
    </div>
  )
}

/** Card de caderno usado na grade do pop-up. */
function CadernoCard({ c, selecionado, onClick }: { c: Caderno; selecionado: boolean; onClick: () => void }) {
  const Icon = iconeBanco(c.icone)
  const corC = c.cor ?? '#6d28d9'
  return (
    <button type="button" onClick={onClick}
      className={cn('group relative flex flex-col overflow-hidden rounded-2xl border bg-card text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg',
        selecionado ? 'border-primary ring-2 ring-primary' : 'hover:border-primary/40')}>
      <div className="relative h-24 overflow-hidden">
        {c.capa ? (
          <img src={c.capa} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
        ) : (
          <div className="h-full w-full" style={{ background: `linear-gradient(150deg, ${corC}, ${corC}bb)` }} />
        )}
        {!c.capa && <Icon className="absolute -right-3 -top-3 h-20 w-20 text-white/15" />}
        <div className="absolute inset-0 bg-gradient-to-t from-black/25 to-transparent" />
        <span className="absolute bottom-2 left-2 z-10 flex h-9 w-9 items-center justify-center rounded-lg text-white shadow-md ring-2 ring-white/25" style={{ background: corC }}><Icon className="h-4 w-4" /></span>
        {selecionado && (
          <span className="absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow"><Check className="h-3.5 w-3.5" /></span>
        )}
      </div>
      <div className="p-3">
        <p className="line-clamp-2 text-sm font-semibold leading-tight">{c.nome}</p>
        {c.descricao && <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{c.descricao}</p>}
      </div>
    </button>
  )
}

/** Miniatura da capa (imagem) ou gradiente da cor, com o ícone do caderno. */
function CapaMiniatura({ caderno }: { caderno: Caderno }) {
  const Icon = iconeBanco(caderno.icone)
  const corC = caderno.cor ?? '#6d28d9'
  return (
    <span className="relative flex h-11 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border">
      {caderno.capa ? (
        <img src={caderno.capa} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="h-full w-full" style={{ background: `linear-gradient(150deg, ${corC}, ${corC}bb)` }} />
      )}
      <Icon className="absolute h-4 w-4 text-white drop-shadow" />
    </span>
  )
}
