'use client'

import { useState, useTransition, useRef, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Loader2, Save, Palette, RotateCcw, Zap } from 'lucide-react'
import { salvarAparenciaDesafio } from '@/app/admin/jurisprudencia/actions'

// Paleta do jogo (CSS vars em :root do estilos.css — documentadas em design-tokens.json). O bootstrap
// injeta estes valores como override, recolorindo TODO o chrome do jogo sem tocar no motor/estilos.css.
// Obs.: as cores do CANVAS (herói, paredes, armadilhas) são pixel-art fixa no motor (à risca) e não mudam aqui.
const CORES: { k: string; label: string; def: string; uso: string }[] = [
  { k: 'bg', label: 'Fundo', def: '#040830', uso: 'Fundo da página' },
  { k: 'bg-dot', label: 'Grade de fundo', def: '#131b63', uso: 'Pontos da grade' },
  { k: 'panel', label: 'Painéis', def: '#070f45', uso: 'Painéis e cabeçalho' },
  { k: 'panel-2', label: 'Cabeçalho (topo)', def: '#0c1657', uso: 'Gradiente do cabeçalho' },
  { k: 'line', label: 'Bordas', def: '#1c2678', uso: 'Bordas e divisórias' },
  { k: 'neon', label: 'Neon', def: '#8b5cf6', uso: 'Botões, brilho, d-pad' },
  { k: 'neon-hi', label: 'Neon destaque', def: '#c08cff', uso: 'Matéria, HOJE, hover' },
  { k: 'lav', label: 'Texto secundário', def: '#a7a4ff', uso: 'Rótulos/textos 2º' },
  { k: 'muted', label: 'Bloqueado', def: '#7a80d4', uso: 'Dias bloqueados' },
  { k: 'text', label: 'Texto principal', def: '#eef0ff', uso: 'Texto' },
  { k: 'gold', label: 'Dourado', def: '#ffc83d', uso: 'Teses, recorde, top 3' },
  { k: 'gold-deep', label: 'Dourado (sombra)', def: '#c98a00', uso: 'Sombra do dourado' },
  { k: 'cyan', label: 'Ciano', def: '#3fd5ff', uso: '"Você", Vade Mécum, disponível' },
  { k: 'pink', label: 'Rosa', def: '#ff4f9a', uso: 'Vidas, erro, tempo' },
  { k: 'ok', label: 'Verde', def: '#4ef0a0', uso: 'Resposta correta' },
  { k: 'ink', label: 'Tinta', def: '#08103f', uso: 'Texto sobre botão branco' },
]
const DEFAULTS = Object.fromEntries(CORES.map((c) => [c.k, c.def]))

// Normaliza qualquer valor para um hex #rrggbb válido (o <input type=color> exige isso).
const hex = (v: string | undefined, def: string) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : def)

// Prévia AO VIVO = o JOGO REAL num iframe (mesma origem). Ao mudar as cores, injetamos as CSS vars
// direto no documento do iframe (:root), então a prévia é EXATAMENTE a aplicação real, recolorindo na hora.
function PreviaJogo({ desafioId, cores, efeitos }: { desafioId: string; cores: Record<string, string>; efeitos: { glow: number; confete?: boolean } }) {
  const ref = useRef<HTMLIFrameElement>(null)
  const aplicar = useCallback(() => {
    try {
      const doc = ref.current?.contentDocument
      if (!doc || !doc.head) return
      let st = doc.getElementById('juris-preview-cores') as HTMLStyleElement | null
      if (!st) { st = doc.createElement('style'); st.id = 'juris-preview-cores'; doc.head.appendChild(st) }
      const glow = Number.isFinite(efeitos?.glow) ? efeitos.glow : 1
      const semConfete = efeitos?.confete === false ? '.confetti{display:none!important}' : '' // liga/desliga ao vivo
      st.textContent = `:root{${CORES.map((c) => `--${c.k}:${hex(cores[c.k], DEFAULTS[c.k])};`).join('')}--glow:${glow};}${semConfete}`
    } catch { /* iframe ainda carregando / cross-origin momentâneo */ }
  }, [cores, efeitos])
  // Reaplica a cada mudança de cor/efeito; polling curto garante aplicar assim que o doc do iframe existir.
  useEffect(() => {
    aplicar()
    const iv = setInterval(aplicar, 500)
    const to = setTimeout(() => clearInterval(iv), 8000)
    return () => { clearInterval(iv); clearTimeout(to) }
  }, [aplicar])
  return (
    <div className="overflow-hidden rounded-xl border bg-black">
      <iframe
        ref={ref}
        src={`/jurisprudencia/index.html?desafio=${encodeURIComponent(desafioId)}&preview=1`}
        title="Prévia do Desafio de Jurisprudência"
        allow="autoplay"
        onLoad={aplicar}
        className="block h-[560px] w-full border-0 lg:h-[calc(100vh-8rem)] lg:min-h-[620px]"
      />
    </div>
  )
}

type Efeitos = { glow: number; confete: boolean }
const EFEITOS_DEF: Efeitos = { glow: 1, confete: true }

export function JurisDesigner({ desafioId, aparencia }: { desafioId: string; aparencia: Record<string, any> }) {
  const [cores, setCores] = useState<Record<string, string>>(() => ({ ...DEFAULTS, ...(aparencia?.cores ?? {}) }))
  const [efeitos, setEfeitos] = useState<Efeitos>(() => ({ glow: Number(aparencia?.efeitos?.glow ?? 1) || 1, confete: aparencia?.efeitos?.confete !== false }))
  const [pend, start] = useTransition()
  const set = (k: string, v: string) => setCores((c) => ({ ...c, [k]: v }))

  function salvar() {
    start(async () => {
      const r = await salvarAparenciaDesafio(desafioId, { ...(aparencia ?? {}), cores, efeitos })
      if (!r.ok) { toast.error(r.error ?? 'Erro ao salvar o visual.'); return }
      toast.success('Visual salvo. Abra o jogo para ver aplicado.')
    })
  }

  return (
    // Edição à ESQUERDA (rolável) · prévia grande à DIREITA (sticky).
    <div className="grid gap-4 lg:grid-cols-[minmax(0,430px)_minmax(0,1fr)]">
      {/* ESQUERDA — edição rolável */}
      <div className="space-y-4 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto lg:pr-1">
        {/* Cores */}
        <section className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><Palette className="h-4 w-4 text-primary" /> Cores do jogo</h3>
            <button type="button" onClick={() => setCores({ ...DEFAULTS })} className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              <RotateCcw className="h-3.5 w-3.5" /> Restaurar
            </button>
          </div>
          <p className="text-xs text-muted-foreground">Tema arcade neon (escuro). Recolorem toda a interface do jogo. O labirinto/personagens (pixel art) são fixos.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {CORES.map(({ k, label, uso }) => (
              <label key={k} className="flex items-center gap-2.5 rounded-lg border bg-background px-2.5 py-2">
                <input type="color" value={hex(cores[k], DEFAULTS[k])} onChange={(e) => set(k, e.target.value)}
                  className="h-8 w-9 shrink-0 cursor-pointer rounded border bg-transparent p-0" aria-label={label} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{label}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{uso}</span>
                </span>
                <input value={cores[k] ?? ''} onChange={(e) => set(k, e.target.value)}
                  className="w-[82px] shrink-0 rounded-md border bg-card px-2 py-1 text-right font-mono text-[11px] tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring/40" />
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {CORES.map(({ k }) => <span key={k} className="h-6 w-6 rounded border" style={{ background: hex(cores[k], DEFAULTS[k]) }} title={k} />)}
          </div>
        </section>

        {/* Efeitos & brilhos */}
        <section className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><Zap className="h-4 w-4 text-primary" /> Efeitos &amp; brilhos</h3>
            <button type="button" onClick={() => setEfeitos({ ...EFEITOS_DEF })} className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              <RotateCcw className="h-3.5 w-3.5" /> Restaurar
            </button>
          </div>
          <p className="text-xs text-muted-foreground">Intensidade do brilho (glow neon/dourado de bordas, botões, telas, cartuchos e selos). O brilho segue as cores acima.</p>
          <label className="block space-y-1.5">
            <span className="flex items-center justify-between text-xs font-medium text-muted-foreground">
              <span>Intensidade do brilho</span>
              <span className="tabular-nums">{Math.round(efeitos.glow * 100)}%</span>
            </span>
            <input type="range" min={0.2} max={1.6} step={0.05} value={efeitos.glow}
              onChange={(e) => setEfeitos((f) => ({ ...f, glow: Number(e.target.value) }))} className="w-full accent-[var(--primary)]" />
            <span className="flex justify-between text-[10px] text-muted-foreground"><span>sutil</span><span>padrão</span><span>intenso</span></span>
          </label>
          <label className="flex w-fit cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground">
            <input type="checkbox" checked={efeitos.confete} onChange={(e) => setEfeitos((f) => ({ ...f, confete: e.target.checked }))} className="h-4 w-4 accent-[var(--primary)]" />
            Confete no Hall da Fama (pódio)
          </label>
        </section>

        <div className="flex justify-end">
          <button type="button" onClick={salvar} disabled={pend} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60">
            {pend ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar visual
          </button>
        </div>
      </div>

      {/* DIREITA — prévia grande (o jogo real), sticky */}
      <div className="space-y-1.5 lg:sticky lg:top-4 lg:self-start">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Prévia (o jogo real — atualiza ao vivo)</span>
        <PreviaJogo desafioId={desafioId} cores={cores} efeitos={efeitos} />
      </div>
    </div>
  )
}
