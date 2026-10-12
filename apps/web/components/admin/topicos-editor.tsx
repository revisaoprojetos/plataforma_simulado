'use client'

// Editor dos "Temas do dia" (híbrido): os tópicos são extraídos automaticamente dos TÍTULOS do
// conteúdo (htmlAtual). Para cada um, o admin escolhe as TAGS (selos), o nº de QUESTÕES e se INCLUI
// na barra. Salva em quiz_config.topicos (chaveado pelo slug do título). Auto-save (useTransition).

import { useEffect, useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Loader2, Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SELOS } from '@/lib/leitura/selos'
import { extrairTopicos, TOPICO_DEFAULT, type TopicosConfig } from '@/lib/leitura/topicos'
import { salvarTopicos } from '@/app/admin/leitura/actions'

const SELO_ENTRIES = Object.entries(SELOS) // [slug, def]

export function TopicosEditor({ documentoId, htmlAtual, topicosInicial }: {
  documentoId: string; htmlAtual: string; topicosInicial: TopicosConfig
}) {
  // Tópicos extraídos dos títulos (h1/h2/h3) do HTML atual.
  const topicos = useMemo(() => {
    if (typeof window === 'undefined' || !htmlAtual) return []
    try { return extrairTopicos(new DOMParser().parseFromString(htmlAtual, 'text/html').body) } catch { return [] }
  }, [htmlAtual])

  const [cfg, setCfg] = useState<TopicosConfig>(topicosInicial ?? {})
  const [saving, start] = useTransition()
  useEffect(() => { setCfg(topicosInicial ?? {}) }, [topicosInicial])

  const persistir = (next: TopicosConfig) => {
    setCfg(next)
    start(async () => { const r = await salvarTopicos(documentoId, next); if (!r.ok) toast.error(r.error ?? 'Erro ao salvar tópicos') })
  }
  const patch = (key: string, p: Partial<typeof TOPICO_DEFAULT>) => {
    const atual = cfg[key] ?? TOPICO_DEFAULT
    persistir({ ...cfg, [key]: { ...TOPICO_DEFAULT, ...atual, ...p } })
  }
  const toggleTag = (key: string, slug: string) => {
    const atual = cfg[key] ?? TOPICO_DEFAULT
    const tags = atual.tags.includes(slug) ? atual.tags.filter((t) => t !== slug) : [...atual.tags, slug]
    patch(key, { tags })
  }

  if (!topicos.length) return <p className="text-xs text-muted-foreground">Nenhum título encontrado no conteúdo. Os tópicos vêm dos títulos (h1/h2/h3) — adicione títulos na aba Conteúdo.</p>

  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">Tópicos automáticos dos títulos. Escolha as <strong>tags</strong> e o nº de <strong>questões</strong> de cada um. {saving && <Loader2 className="h-3 w-3 animate-spin" />}</p>
      {topicos.map((t, i) => {
        const c = cfg[t.key] ?? TOPICO_DEFAULT
        return (
          <div key={t.key} className={cn('rounded-xl border p-3', c.incluido ? '' : 'opacity-55')}>
            <div className="flex items-start gap-2">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-muted text-[11px] font-bold text-muted-foreground">{String(i + 1).padStart(2, '0')}</span>
              <span className="min-w-0 flex-1 text-sm font-semibold leading-snug">{t.nome}</span>
              <label className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                <input type="number" min={0} value={c.questoes || 0} onChange={(e) => patch(t.key, { questoes: Math.max(0, Number(e.target.value) || 0) })} className="h-7 w-14 rounded-md border bg-background px-1.5 text-center text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40" /> questões
              </label>
              <button type="button" onClick={() => patch(t.key, { incluido: !c.incluido })} title={c.incluido ? 'Ocultar da barra' : 'Mostrar na barra'} className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted">
                {c.incluido ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {SELO_ENTRIES.map(([slug, def]) => {
                const on = c.tags.includes(slug)
                return (
                  <button key={slug} type="button" onClick={() => toggleTag(t.key, slug)} title={def.nome}
                    className={cn('inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium transition-colors',
                      on ? 'border-primary bg-primary/10 text-primary' : 'border-transparent text-muted-foreground hover:bg-muted')}>
                    <img src={`/leitura/selos/${slug}-ic.png`} alt="" className="h-3.5 w-3.5" draggable={false} />
                    <span className="max-w-[9rem] truncate">{def.nome}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
