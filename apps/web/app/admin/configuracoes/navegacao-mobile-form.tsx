'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Loader2, Save, Smartphone, LayoutGrid, Menu, Home, ClipboardList, Bell, User, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

type NavMode = 'tabs' | 'menu'

const OPCOES: { v: NavMode; nome: string; desc: string }[] = [
  { v: 'tabs', nome: 'Abas (barra inferior)', desc: 'Barra fixa embaixo com 4 ícones (estilo Instagram). Sem barra superior — a Início encosta no topo.' },
  { v: 'menu', nome: 'Menu (hambúrguer)', desc: 'Barra superior com a marca, sino e avatar; o menu abre em um painel lateral. Sem barra inferior.' },
]

/** Mini-prévia de um celular mostrando cada layout de navegação. */
function Previa({ modo }: { modo: NavMode }) {
  const barra = '#2b2153'
  const ativo = 'var(--brand-accent, #f6c343)'
  return (
    <div className="mx-auto flex h-[188px] w-[104px] flex-col overflow-hidden rounded-[16px] border-2 border-muted-foreground/20 bg-[#f6f5fa] shadow-inner">
      {modo === 'menu' && (
        <div className="flex h-6 shrink-0 items-center justify-between px-1.5 text-white" style={{ background: barra }}>
          <Menu className="h-3 w-3" />
          <div className="h-2 w-2 rounded-full" style={{ background: ativo }} />
        </div>
      )}
      <div className="flex-1 space-y-1.5 p-1.5">
        <div className="h-8 rounded-md bg-gradient-to-br from-[#342866] to-[#2b2153]" />
        <div className="h-2 w-2/3 rounded bg-primary/25" />
        <div className="grid grid-cols-2 gap-1">
          <div className="h-9 rounded bg-black/80" />
          <div className="h-9 rounded bg-black/80" />
        </div>
      </div>
      {modo === 'tabs' && (
        <div className="flex h-7 shrink-0 items-center justify-around px-1" style={{ background: barra }}>
          <Home className="h-3.5 w-3.5" style={{ color: ativo, fill: ativo }} />
          <ClipboardList className="h-3.5 w-3.5 text-white/45" />
          <Bell className="h-3.5 w-3.5 text-white/45" />
          <User className="h-3.5 w-3.5 text-white/45" />
        </div>
      )}
    </div>
  )
}

/**
 * Escolhe o layout de navegação MOBILE do portal do aluno (tema.mobile_nav). Vale por tenant e
 * decide, server-side, qual chrome renderizar no celular. No desktop nada muda (sidebar).
 */
export function NavegacaoMobileForm({ tema, salvarTema }: { tema: any; salvarTema: (t: Record<string, unknown>) => Promise<{ ok?: boolean } | void> }) {
  const [modo, setModo] = useState<NavMode>((tema?.mobile_nav === 'menu' ? 'menu' : 'tabs'))
  const [dirty, setDirty] = useState(false)
  const [pending, start] = useTransition()

  function escolher(v: NavMode) { setModo(v); setDirty(true) }
  function salvar() {
    start(async () => {
      try { await salvarTema({ mobile_nav: modo }); setDirty(false); toast.success('Navegação mobile salva!') }
      catch (err) { toast.error(err instanceof Error ? err.message : 'Erro ao salvar') }
    })
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="mb-1 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><Smartphone className="h-4 w-4" /></span>
          <span className="text-sm font-semibold">Navegação no celular</span>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">Como o aluno navega pelo app <span className="font-medium text-foreground">no celular</span>. No computador a barra lateral continua igual.</p>

        <div className="grid gap-3 sm:grid-cols-2">
          {OPCOES.map((o) => {
            const on = modo === o.v
            const Icon = o.v === 'tabs' ? LayoutGrid : Menu
            return (
              <button key={o.v} type="button" onClick={() => escolher(o.v)}
                className={cn('flex gap-3 rounded-xl border p-3 text-left transition-colors', on ? 'border-primary/50 bg-primary/[0.06]' : 'hover:bg-muted/50')}>
                <Previa modo={o.v} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-sm font-semibold"><Icon className="h-4 w-4 text-primary" /> {o.nome}</span>
                    {on ? <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary"><Check className="h-3.5 w-3.5" /> ativo</span> : <span className="text-[11px] text-muted-foreground">selecionar</span>}
                  </div>
                  <p className="mt-1 text-xs leading-snug text-muted-foreground">{o.desc}</p>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <button type="button" onClick={salvar} disabled={pending || !dirty}
        className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar navegação
      </button>
    </div>
  )
}
