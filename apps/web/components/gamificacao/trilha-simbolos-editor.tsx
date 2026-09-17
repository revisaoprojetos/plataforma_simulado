'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, ImagePlus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  ICONES_TRILHA, ICONES_TRILHA_NOMES, SIMBOLO_ESTADOS, DEFAULT_CORES_HEX, coresNo,
  type TrilhaSimbolos, type SimboloEstado, type SimboloConfig,
} from '@/lib/gamificacao/trilha-simbolos'
import { SimboloNo } from '@/components/gamificacao/simbolo-no'

/** Nó (círculo) com as cores efetivas — usado na prévia. */
function NoPreview({ estado, config, tam }: { estado: SimboloEstado; config: SimboloConfig; tam: number }) {
  const c = coresNo(estado, config)
  return (
    <span className="flex items-center justify-center rounded-full border-2 shadow-md" style={{ width: tam, height: tam, background: c.fundo, borderColor: c.borda }}>
      <SimboloNo config={config} escala={tam >= 56 ? 1 : 0.7} cor={c.simbolo} />
    </span>
  )
}

/** Seletor de cor com opção "padrão" (null = usa a cor padrão do estado). */
function ColorField({ label, value, defaultHex, onChange, disabled }: {
  label: string; value: string | null; defaultHex: string; onChange: (v: string | null) => void; disabled?: boolean
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-[11px]">
      <span className="font-medium text-muted-foreground">{label}{value == null && <span className="ml-1 opacity-60">(padrão)</span>}</span>
      <span className="flex items-center gap-1.5">
        <input type="color" value={value ?? defaultHex} disabled={disabled} onChange={(e) => onChange(e.target.value)}
          className="h-6 w-8 cursor-pointer rounded border bg-card p-0.5 disabled:opacity-50" />
        {value != null && (
          <button type="button" disabled={disabled} onClick={() => onChange(null)}
            className="rounded px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50">padrão</button>
        )}
      </span>
    </label>
  )
}

/**
 * Editor reutilizável dos símbolos da trilha (prévia + 3 estados: ícone/imagem, tamanho, cor de fundo e cor
 * do símbolo). Controlado: recebe `value` + `onChange`. Reusado no console (super) e no admin da plataforma.
 */
export function TrilhaSimbolosEditor({ value, onChange, disabled, stacked = false }: {
  value: TrilhaSimbolos
  onChange: (v: TrilhaSimbolos) => void
  disabled?: boolean
  /** Empilha os 3 estados em 1 coluna (para caber em rails/painéis estreitos). */
  stacked?: boolean
}) {
  const set = (estado: SimboloEstado, patch: Partial<SimboloConfig>) =>
    onChange({ ...value, [estado]: { ...value[estado], ...patch } })

  return (
    <div className="space-y-5">
      {/* Prévia dos 3 nós, como aparecem na trilha */}
      <div className={cn('rounded-2xl border bg-muted/30', stacked ? 'p-4' : 'p-5')}>
        <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Prévia</p>
        <div className={cn('flex flex-wrap items-start justify-center', stacked ? 'gap-5' : 'gap-8')}>
          {SIMBOLO_ESTADOS.map((e) => (
            <div key={e.id} className="flex flex-col items-center gap-2">
              <NoPreview estado={e.id} config={value[e.id]} tam={stacked ? 48 : 64} />
              <span className="text-[11px] font-medium text-muted-foreground">{e.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Editores por estado */}
      <div className={cn('grid gap-4', stacked ? 'grid-cols-1' : 'lg:grid-cols-3')}>
        {SIMBOLO_ESTADOS.map((e) => (
          <EstadoEditor key={e.id} estado={e} config={value[e.id]} onChange={(p) => set(e.id, p)} disabled={disabled} />
        ))}
      </div>
    </div>
  )
}

function EstadoEditor({ estado, config, onChange, disabled }: {
  estado: { id: SimboloEstado; label: string; hint: string }
  config: SimboloConfig
  onChange: (patch: Partial<SimboloConfig>) => void
  disabled?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [enviando, setEnviando] = useState(false)
  const hex = DEFAULT_CORES_HEX[estado.id]

  async function enviarImagem(file: File) {
    setEnviando(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/admin/gamificacao/simbolo', { method: 'POST', body: fd })
      const j = await res.json()
      if (!res.ok) throw new Error(j?.error || 'Falha no upload.')
      onChange({ tipo: 'imagem', imagemUrl: j.url })
      toast.success('Imagem enviada.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha no upload.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <NoPreview estado={estado.id} config={config} tam={44} />
        <div className="min-w-0">
          <p className="text-sm font-semibold">{estado.label}</p>
          <p className="text-[11px] text-muted-foreground">{estado.hint}</p>
        </div>
      </div>

      {/* Ícone × Imagem */}
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
        {(['icone', 'imagem'] as const).map((t) => (
          <button key={t} type="button" disabled={disabled} onClick={() => onChange({ tipo: t })}
            className={cn('rounded-md py-1.5 text-xs font-semibold transition-colors',
              config.tipo === t ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
            {t === 'icone' ? 'Ícone' : 'Imagem'}
          </button>
        ))}
      </div>

      {config.tipo === 'icone' ? (
        <div className="grid max-h-44 grid-cols-6 gap-1 overflow-y-auto rounded-lg border bg-muted/20 p-2">
          {ICONES_TRILHA_NOMES.map((nome) => {
            const Icon = ICONES_TRILHA[nome]
            const sel = config.icone === nome
            return (
              <button key={nome} type="button" disabled={disabled} title={nome} onClick={() => onChange({ icone: nome })}
                className={cn('flex h-9 items-center justify-center rounded-md border transition-colors',
                  sel ? 'border-primary bg-primary/10 text-primary' : 'border-transparent text-muted-foreground hover:bg-muted hover:text-foreground')}>
                <Icon className="h-4 w-4" />
              </button>
            )
          })}
        </div>
      ) : (
        <div className="space-y-2">
          <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) enviarImagem(f); e.target.value = '' }} />
          <div className="flex items-center gap-2">
            <button type="button" disabled={disabled || enviando} onClick={() => inputRef.current?.click()}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-dashed bg-muted/20 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary disabled:opacity-50">
              {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />} {config.imagemUrl ? 'Trocar imagem' : 'Enviar imagem'}
            </button>
            {config.imagemUrl && (
              <button type="button" disabled={disabled} onClick={() => onChange({ imagemUrl: null, tipo: 'icone' })} title="Remover"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border bg-card text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive disabled:opacity-50">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground">PNG/JPG/WEBP/SVG/GIF · até 1MB. Dica: defina a cor do símbolo p/ tingir imagens de silhueta (1 cor).</p>
        </div>
      )}

      {/* Cores */}
      <div className="space-y-1.5 rounded-lg border bg-muted/20 p-2.5">
        <ColorField label="Cor de fundo" value={config.corFundo} defaultHex={hex.fundo} onChange={(v) => onChange({ corFundo: v })} disabled={disabled} />
        <ColorField label="Cor do símbolo" value={config.corSimbolo} defaultHex={hex.simbolo} onChange={(v) => onChange({ corSimbolo: v })} disabled={disabled} />
      </div>

      {/* Tamanho */}
      <label className="block">
        <span className="mb-1 flex items-center justify-between text-[11px] font-medium text-muted-foreground">
          <span>Tamanho</span><span className="tabular-nums">{config.tamanho}px</span>
        </span>
        <input type="range" min={12} max={64} step={1} value={config.tamanho} disabled={disabled}
          onChange={(e) => onChange({ tamanho: Number(e.target.value) })} className="w-full accent-[var(--primary)]" />
      </label>
    </div>
  )
}
