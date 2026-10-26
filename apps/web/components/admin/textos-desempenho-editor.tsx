'use client'

// Editor dos TEXTOS DE DESEMPENHO (narrativa por faixa) — aba do Laboratório da prévia. Genérico (default,
// com {nome}/{pct} que se adaptam) + overrides por pilar/disciplina. Guardado no tema do tenant. O template
// usa só {<slug>_texto}; aqui é onde a redação é escrita — editar nunca quebra o .docx.

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Plus, Trash2, Save, Info } from 'lucide-react'
import type { TextosDesempenho } from '@/lib/conteudo/previa-compute'

// Textos via ROTA DE API (não server action — rejeitada pelo check de origem do Next em domínio custom).
async function obterTextosDesempenho(versaoId: string): Promise<{ ok: boolean; textos?: TextosDesempenho | null; error?: string }> {
  return fetch(`/api/conteudo/previa/${versaoId}?textos=1`, { cache: 'no-store' }).then((r) => r.json()).catch(() => ({ ok: false, error: 'Falha de rede.' }))
}
async function gravarTextosDesempenho(versaoId: string, textos: TextosDesempenho): Promise<{ ok: boolean; error?: string }> {
  return fetch(`/api/conteudo/previa/${versaoId}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'textos', textos }) }).then((r) => r.json()).catch(() => ({ ok: false, error: 'Falha de rede.' }))
}

type Banda = { f1: string; f2: string; f3: string }
type Override = { slug: string; nome: string } & Banda

// Defaults do APP (iguais ao servidor) — usados como PLACEHOLDER (campo vazio = usa este texto).
const PH: Banda = {
  f1: 'Seu desempenho em {nome} ficou abaixo de 50% ({pct}) e merece atenção. Retome os fundamentos e pratique com questões no mesmo padrão da prova para consolidar a base.',
  f2: 'Seu desempenho em {nome} foi intermediário ({pct}): há base, mas ainda há espaço relevante para crescer. Reforce os pontos de maior incidência e mantenha a prática constante.',
  f3: 'Excelente desempenho em {nome} ({pct})! Você domina esta frente — mantenha o ritmo com revisões periódicas até a prova.',
}
const FAIXAS: [keyof Banda, string][] = [['f1', '0-49 (abaixo de 50%)'], ['f2', '50-80 (intermediário)'], ['f3', '81-100 (excelente)']]
const CANONICOS: { slug: string; nome: string }[] = [
  { slug: 'lei_seca', nome: 'Lei seca' }, { slug: 'jurisprudencia', nome: 'Jurisprudência' }, { slug: 'doutrina', nome: 'Doutrina' },
  { slug: 'stf', nome: 'STF' }, { slug: 'stj', nome: 'STJ' }, { slug: 'sistemas_internacionais', nome: 'Sistemas Internacionais' },
  { slug: 'lingua_portuguesa', nome: 'Língua Portuguesa' },
]
function slugify(s: string): string {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

export function TextosDesempenhoEditor({ disciplinas = [], versaoId }: { disciplinas?: { nome: string }[]; versaoId: string }) {
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [def, setDef] = useState<Banda>({ f1: '', f2: '', f3: '' })
  const [overrides, setOverrides] = useState<Override[]>([])
  const [addOpen, setAddOpen] = useState(false)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const r = await obterTextosDesempenho(versaoId)
        if (!vivo) return
        const t = r.textos || {}
        setDef({ f1: t.default?.f1 ?? '', f2: t.default?.f2 ?? '', f3: t.default?.f3 ?? '' })
        const ov: Override[] = Object.entries(t.por_pilar ?? {}).map(([slug, b]) => {
          const cand = CANONICOS.find((c) => c.slug === slug)
          return { slug, nome: cand?.nome ?? slug, f1: b?.f1 ?? '', f2: b?.f2 ?? '', f3: b?.f3 ?? '' }
        })
        setOverrides(ov)
      } finally { if (vivo) setCarregando(false) }
    })()
    return () => { vivo = false }
  }, [versaoId])

  const candidatos = useMemo(() => {
    const extras = disciplinas.map((d) => ({ slug: slugify(d.nome), nome: d.nome })).filter((x) => x.slug)
    const todos = [...CANONICOS, ...extras]
    const vistos = new Set(overrides.map((o) => o.slug))
    const unicos = new Map<string, { slug: string; nome: string }>()
    for (const c of todos) if (!vistos.has(c.slug) && !unicos.has(c.slug)) unicos.set(c.slug, c)
    return [...unicos.values()]
  }, [disciplinas, overrides])

  function addOverride(slug: string, nome: string) {
    setOverrides((prev) => [...prev, { slug, nome, f1: '', f2: '', f3: '' }])
    setAddOpen(false)
  }
  function setOv(i: number, k: keyof Banda, v: string) { setOverrides((prev) => prev.map((o, j) => (j === i ? { ...o, [k]: v } : o))) }

  async function salvar() {
    setSalvando(true)
    const por_pilar: Record<string, Banda> = {}
    for (const o of overrides) {
      const b: Partial<Banda> = {}
      if (o.f1.trim()) b.f1 = o.f1.trim(); if (o.f2.trim()) b.f2 = o.f2.trim(); if (o.f3.trim()) b.f3 = o.f3.trim()
      if (Object.keys(b).length) por_pilar[o.slug] = b as Banda
    }
    const payload: TextosDesempenho = {
      default: { f1: def.f1.trim() || undefined, f2: def.f2.trim() || undefined, f3: def.f3.trim() || undefined },
      por_pilar,
    }
    const r = await gravarTextosDesempenho(versaoId, payload)
    setSalvando(false)
    if (!r.ok) return toast.error(r.error || 'Falha ao salvar.')
    toast.success('Textos de desempenho salvos.')
  }

  if (carregando) return <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-2.5 text-[11px] text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
        <span>No template use só <code className="rounded bg-muted px-1 font-mono text-[10px]">{'{slug_texto}'}</code>. A redação fica aqui — editar nunca quebra o documento. <b className="text-foreground">{'{nome}'}</b> e <b className="text-foreground">{'{pct}'}</b> se adaptam.</span>
      </div>

      <div>
        <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Texto padrão (todos os pilares)</div>
        <div className="space-y-2.5">
          {FAIXAS.map(([k, label]) => (
            <label key={k} className="block">
              <span className="mb-1 block text-[11px] font-medium text-muted-foreground">{label}</span>
              <textarea value={def[k]} onChange={(e) => setDef((p) => ({ ...p, [k]: e.target.value }))} placeholder={PH[k]} rows={3}
                className="w-full resize-y rounded-lg border bg-background p-2 text-xs leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-primary/40" />
            </label>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Overrides por pilar</span>
        </div>
        {overrides.length === 0 && !addOpen && <p className="mb-2 text-[11px] text-muted-foreground">Sem overrides — todos usam o texto padrão. Adicione um pilar para escrever um texto específico.</p>}
        <div className="space-y-3">
          {overrides.map((o, i) => (
            <div key={o.slug} className="rounded-xl border bg-background p-2.5">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs font-semibold">{o.nome} <span className="font-mono text-[10px] text-muted-foreground">{`{${o.slug}_texto}`}</span></span>
                <button onClick={() => setOverrides((prev) => prev.filter((_, j) => j !== i))} aria-label="Remover override" className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
              <div className="space-y-2">
                {FAIXAS.map(([k, label]) => (
                  <label key={k} className="block">
                    <span className="mb-0.5 block text-[10px] font-medium text-muted-foreground">{label}</span>
                    <textarea value={o[k]} onChange={(e) => setOv(i, k, e.target.value)} placeholder={`(vazio = usa o texto padrão)`} rows={2}
                      className="w-full resize-y rounded-lg border bg-background p-2 text-xs leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-primary/40" />
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        {addOpen ? (
          <div className="mt-2 rounded-xl border bg-muted/30 p-2">
            <div className="mb-1 text-[11px] font-medium text-muted-foreground">Escolha o pilar/disciplina:</div>
            <div className="flex flex-wrap gap-1.5">
              {candidatos.map((c) => (
                <button key={c.slug} onClick={() => addOverride(c.slug, c.nome)} className="rounded-full border bg-background px-2.5 py-1 text-[11px] font-medium hover:border-primary hover:text-primary">{c.nome}</button>
              ))}
              {candidatos.length === 0 && <span className="text-[11px] text-muted-foreground">Todos já têm override.</span>}
            </div>
            <button onClick={() => setAddOpen(false)} className="mt-1.5 text-[11px] text-muted-foreground hover:text-foreground">cancelar</button>
          </div>
        ) : (
          <button onClick={() => setAddOpen(true)} className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed py-2 text-xs font-semibold text-primary hover:bg-primary/5"><Plus className="h-3.5 w-3.5" /> Adicionar override</button>
        )}
      </div>

      <button onClick={salvar} disabled={salvando} className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-110 disabled:opacity-60">
        {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar textos
      </button>
    </div>
  )
}
