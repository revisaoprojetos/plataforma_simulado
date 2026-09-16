'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Check, Play, BookOpen, ExternalLink, Rocket } from 'lucide-react'
import { cn } from '@/lib/utils'
import { salvarIntroModulo, listarAulasDoModulo } from '@/app/admin/leitura/actions'
import { type IntroConfig, type IntroTipo } from '@/lib/leitura/intro'

const TIPOS: { id: IntroTipo; label: string; Icon: typeof Play }[] = [
  { id: 'video', label: 'Vídeo', Icon: Play },
  { id: 'leitura', label: 'Leitura', Icon: BookOpen },
  { id: 'link', label: 'Link', Icon: ExternalLink },
]

/**
 * "Comece por aqui" do módulo (LegProc): pré-aula/introdução no TOPO da trilha do aluno. Pode ser um
 * VÍDEO (URL), uma LEITURA (uma aula do módulo) ou um LINK externo (regulamento, guia…).
 */
export function ModuloIntroForm({ pastaId, atual }: { pastaId: string; atual: IntroConfig }) {
  const [cfg, setCfg] = useState<IntroConfig>(atual)
  const [salvando, setSalvando] = useState(false)
  const [aulas, setAulas] = useState<{ id: string; titulo: string }[] | null>(null)

  // Carrega as aulas do módulo (para o seletor de leitura) sob demanda.
  useEffect(() => {
    if (cfg.tipo !== 'leitura' || aulas !== null) return
    listarAulasDoModulo(pastaId).then(setAulas).catch(() => setAulas([]))
  }, [cfg.tipo, aulas, pastaId])

  async function salvar() {
    setSalvando(true)
    const r = await salvarIntroModulo(pastaId, cfg)
    setSalvando(false)
    if (r.ok) { toast.success('“Comece por aqui” salvo') } else { toast.error(r.error ?? 'Erro ao salvar') }
  }

  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Rocket className="h-5 w-5" /></span>
          <div>
            <h3 className="text-sm font-semibold tracking-tight">Comece por aqui (pré-aula)</h3>
            <p className="text-xs text-muted-foreground">Um nó de introdução no topo da trilha — regulamento, guia ou o “vídeo do REI”. Pode ser vídeo, uma leitura ou um link externo.</p>
          </div>
        </div>
        <label className="inline-flex shrink-0 cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={cfg.ativo} onChange={(e) => setCfg((c) => ({ ...c, ativo: e.target.checked }))} className="h-4 w-4 rounded border" />
          Ativo
        </label>
      </div>

      {cfg.ativo && (
        <div className="space-y-3">
          {/* Tipo */}
          <div className="flex items-center gap-1 rounded-lg border bg-muted/40 p-1 text-sm">
            {TIPOS.map(({ id, label, Icon }) => (
              <button key={id} type="button" onClick={() => setCfg((c) => ({ ...c, tipo: id }))}
                className={cn('inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors', cfg.tipo === id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>

          {/* Alvo */}
          {cfg.tipo === 'leitura' ? (
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Aula de introdução</span>
              <select value={cfg.documento_id ?? ''} onChange={(e) => setCfg((c) => ({ ...c, documento_id: e.target.value || null }))}
                className="h-9 w-full rounded-lg border bg-[var(--input-bg,transparent)] px-2 text-sm outline-none focus:ring-1 focus:ring-ring">
                <option value="">{aulas === null ? 'Carregando…' : 'Selecione uma aula…'}</option>
                {(aulas ?? []).map((a) => <option key={a.id} value={a.id}>{a.titulo}</option>)}
              </select>
            </label>
          ) : (
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">{cfg.tipo === 'video' ? 'URL do vídeo (YouTube, etc.)' : 'URL do link'}</span>
              <input value={cfg.url ?? ''} onChange={(e) => setCfg((c) => ({ ...c, url: e.target.value || null }))} placeholder="https://…"
                className="h-9 w-full rounded-lg border bg-[var(--input-bg,transparent)] px-3 text-sm outline-none focus:ring-1 focus:ring-ring" />
            </label>
          )}

          {/* Título + descrição */}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Título</span>
              <input value={cfg.titulo} onChange={(e) => setCfg((c) => ({ ...c, titulo: e.target.value }))} maxLength={60} placeholder="Comece por aqui"
                className="h-9 w-full rounded-lg border bg-[var(--input-bg,transparent)] px-3 text-sm outline-none focus:ring-1 focus:ring-ring" />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Descrição (opcional)</span>
              <input value={cfg.descricao} onChange={(e) => setCfg((c) => ({ ...c, descricao: e.target.value }))} maxLength={140} placeholder="Ex.: assista antes de começar"
                className="h-9 w-full rounded-lg border bg-[var(--input-bg,transparent)] px-3 text-sm outline-none focus:ring-1 focus:ring-ring" />
            </label>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <button type="button" onClick={salvar} disabled={salvando}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50">
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Salvar
        </button>
      </div>
    </div>
  )
}
