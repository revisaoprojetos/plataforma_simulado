'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, CheckCircle2, Sparkles, Info, Loader2, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSWRGet } from '@/hooks/use-swr-get'

interface NotifItem { id: string; tipo: string; titulo: string; mensagem: string | null; link: string | null; lida: boolean; criado_em: string }

function tempoRelativo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h} hora${h > 1 ? 's' : ''}`
  const d = Math.floor(h / 24)
  if (d === 1) return 'ontem'
  if (d < 7) return `há ${d} dias`
  return new Date(iso).toLocaleDateString('pt-BR')
}

// Tile colorido por tipo de notificação (cores semânticas fixas — ok/atenção/info).
function estiloDe(tipo: string): { icon: LucideIcon; cls: string } {
  if (tipo === 'liberacao') return { icon: CheckCircle2, cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' }
  if (tipo === 'alerta') return { icon: Bell, cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' }
  if (tipo === 'recomendacao') return { icon: Sparkles, cls: 'bg-primary/15 text-primary' }
  return { icon: Info, cls: 'bg-sky-500/15 text-sky-600 dark:text-sky-400' }
}

/** Lista de notificações do aluno (tela dedicada, destino do sino/aba no mobile). */
export function NotificacoesLista() {
  const [marcadasTodas, setMarcadasTodas] = useState(false)
  const router = useRouter()
  // SWR: mostra as notificações do cache NA HORA (ao voltar à tela) e revalida em 2º plano.
  const { data, carregando, recarregar } = useSWRGet<{ items?: NotifItem[] }>('/api/aluno/notificacoes')
  const items: NotifItem[] = (Array.isArray(data?.items) ? data!.items! : []).map((i) => (marcadasTodas ? { ...i, lida: true } : i))

  const temNaoLidas = items.some((i) => !i.lida)
  async function marcarTodas() {
    setMarcadasTodas(true) // otimista
    await fetch('/api/aluno/notificacoes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }).catch(() => {})
    recarregar()
  }

  if (carregando) return <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
  if (!items.length) return <div className="rounded-2xl border bg-muted/30 p-10 text-center text-sm text-muted-foreground">Nenhuma notificação por aqui. ✨</div>

  return (
    <div className="space-y-3">
      {temNaoLidas && (
        <div className="flex justify-end">
          <button onClick={marcarTodas} className="text-xs font-medium text-primary transition-opacity hover:opacity-80">Marcar todas como lidas</button>
        </div>
      )}
      {items.map((i) => {
        const e = estiloDe(i.tipo); const Icon = e.icon
        return (
          <button key={i.id} onClick={() => { if (i.link) router.push(i.link) }} className={cn('flex w-full gap-3 rounded-2xl border bg-card p-4 text-left shadow-sm transition-colors', i.link ? 'hover:bg-muted/40' : 'cursor-default')}>
            <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', e.cls)}><Icon className="h-5 w-5" /></span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="text-sm font-semibold text-foreground">{i.titulo}</span>
                {!i.lida && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: 'var(--brand-accent, var(--primary))' }} />}
              </span>
              {i.mensagem && <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">{i.mensagem}</span>}
              <span className="mt-1.5 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">{tempoRelativo(i.criado_em)}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
