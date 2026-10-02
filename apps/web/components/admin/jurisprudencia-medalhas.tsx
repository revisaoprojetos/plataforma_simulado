'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Loader2, Save, Medal, Image as ImageIcon, X, Ghost } from 'lucide-react'
import { salvarImagensDesafio } from '@/app/admin/jurisprudencia/actions'

type Materia = { id: string; nome: string; curto: string; icon?: string; dias: number[] }
type SeloVal = { conquistado?: string; bloqueado?: string }

// Personagens do jogo (pixel art no motor, à risca). Aqui ficam slots de imagem anexável (catálogo/ticket/
// promoção) — "todos os elementos de imagem anexados, no caso de alguma alteração".
const PERSONAGENS: { k: string; nome: string; desc: string }[] = [
  { k: 'mascote', nome: 'Mascote (herói)', desc: 'O personagem do jogador' },
  { k: 'pegadinha', nome: 'Pegadinha', desc: 'Armadilha que persegue' },
  { k: 'sumula', nome: 'Súmula superada', desc: 'Armadilha que vagueia' },
  { k: 'informativo', nome: 'Informativo esquecido', desc: 'Armadilha que some/reaparece' },
]
// Cores de referência (aproximam o visual dos selos no jogo) — só para a prévia no admin.
const ACCENTS = ['#8b5cf6', '#ffc83d', '#3fd5ff', '#ff4f9a', '#4ef0a0', '#c08cff', '#a7a4ff']

function SlotImagem({ valor, onChange, dica }: { valor: string; onChange: (v: string) => void; dica?: string }) {
  return (
    <div className="space-y-1.5">
      {valor ? (
        <div className="relative overflow-hidden rounded-lg border bg-muted/30">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={valor} alt="" className="aspect-square w-full object-contain" />
          <button type="button" onClick={() => onChange('')} title="Remover" className="absolute right-1 top-1 rounded-md bg-background/80 p-1 text-destructive shadow transition hover:bg-background"><X className="h-3.5 w-3.5" /></button>
        </div>
      ) : (
        <div className="flex aspect-square items-center justify-center rounded-lg border border-dashed bg-muted/20 text-muted-foreground"><ImageIcon className="h-5 w-5" /></div>
      )}
      {dica && <span className="block text-[10px] text-muted-foreground">Recomendado: {dica}</span>}
      <input value={valor} onChange={(e) => onChange(e.target.value)} placeholder="URL ou data:image/…"
        className="w-full rounded-lg border bg-background px-2 py-1 text-[11px] outline-none focus-visible:ring-2 focus-visible:ring-ring/40" />
    </div>
  )
}

// Aba Medalhas: SELOS (por matéria + selo final) e PERSONAGENS, com imagem anexável por item.
export function JurisMedalhas({ desafioId, materias, final, imagens }: {
  desafioId: string
  materias: Materia[]
  final: Materia | null
  imagens: Record<string, any>
}) {
  const [selos, setSelos] = useState<Record<string, SeloVal>>(() => {
    const raw = (imagens?.selos ?? {}) as Record<string, any>
    const out: Record<string, SeloVal> = {}
    for (const [k, v] of Object.entries(raw)) out[k] = typeof v === 'string' ? { conquistado: v } : (v ?? {})
    return out
  })
  const [pers, setPers] = useState<Record<string, string>>(imagens?.personagens ?? {})
  const [pend, start] = useTransition()
  const setSelo = (id: string, estado: 'conquistado' | 'bloqueado', v: string) => setSelos((s) => ({ ...s, [id]: { ...(s[id] ?? {}), [estado]: v } }))
  const setPer = (k: string, v: string) => setPers((s) => ({ ...s, [k]: v }))

  const lista: Materia[] = [...(materias ?? []), ...(final ? [final] : [])]

  function salvar() {
    start(async () => {
      const limpar = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v && v.trim()))
      const limparSelos = (o: Record<string, SeloVal>) => {
        const out: Record<string, SeloVal> = {}
        for (const [k, v] of Object.entries(o)) {
          const vv: SeloVal = {}
          if (v.conquistado?.trim()) vv.conquistado = v.conquistado.trim()
          if (v.bloqueado?.trim()) vv.bloqueado = v.bloqueado.trim()
          if (Object.keys(vv).length) out[k] = vv
        }
        return out
      }
      const r = await salvarImagensDesafio(desafioId, { selos: limparSelos(selos), personagens: limpar(pers) })
      if (!r.ok) { toast.error(r.error ?? 'Erro ao salvar.'); return }
      toast.success('Selos e personagens salvos.')
    })
  }

  return (
    <div className="space-y-4">
      {/* Selos */}
      <section className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Medal className="h-4 w-4 text-primary" /> Selos</h3>
        <p className="text-xs text-muted-foreground">Um selo por matéria + o selo final (o aluno conquista ao dominar os dias). No jogo o selo é gerado em pixel art; a imagem aqui serve ao catálogo/ticket.</p>
        {lista.length === 0 ? (
          <p className="rounded-lg border border-dashed p-3 text-center text-sm text-muted-foreground">Defina as matérias na aba Configurações.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {lista.map((m, i) => (
              <div key={m.id ?? i} className="space-y-2 rounded-xl border bg-background p-2.5">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: ACCENTS[i % ACCENTS.length] }}>{(m.curto ?? '?').slice(0, 2)}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{m.nome || 'Matéria'}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">Dias {(m.dias ?? []).join(', ') || '—'} · ícone {m.icon ?? '—'}</span>
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1"><span className="block text-[11px] font-medium text-emerald-600 dark:text-emerald-400">Conquistado</span><SlotImagem valor={selos[m.id]?.conquistado ?? ''} onChange={(v) => setSelo(m.id, 'conquistado', v)} dica="256×256 (PNG)" /></div>
                  <div className="space-y-1"><span className="block text-[11px] font-medium text-muted-foreground">Bloqueado</span><SlotImagem valor={selos[m.id]?.bloqueado ?? ''} onChange={(v) => setSelo(m.id, 'bloqueado', v)} dica="256×256 (PNG)" /></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Personagens */}
      <section className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Ghost className="h-4 w-4 text-primary" /> Personagens</h3>
        <p className="text-xs text-muted-foreground">Imagens anexáveis dos personagens (no jogo usam a pixel art original; estas ficam disponíveis para alterações/catálogo).</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PERSONAGENS.map((p) => (
            <div key={p.k} className="space-y-2 rounded-xl border bg-background p-2.5">
              <div className="min-w-0">
                <span className="block truncate text-sm font-semibold">{p.nome}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{p.desc}</span>
              </div>
              <SlotImagem valor={pers[p.k] ?? ''} onChange={(v) => setPer(p.k, v)} dica="128×128 px (PNG transparente)" />
            </div>
          ))}
        </div>
      </section>

      <div className="flex justify-end">
        <button type="button" onClick={salvar} disabled={pend} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60">
          {pend ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar selos e personagens
        </button>
      </div>
    </div>
  )
}
