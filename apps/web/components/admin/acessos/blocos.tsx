import Link from 'next/link'
import { AlertTriangle, ShieldCheck, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Alerta } from '@/lib/acessos/alertas'

/** Cartões de números (servidor). */
export function CartoesResumo({ itens }: { itens: { label: string; valor: React.ReactNode; dica?: string }[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {itens.map((i) => (
        <div key={i.label} className="rounded-2xl border bg-card p-4 shadow-sm" title={i.dica}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{i.label}</p>
          <p className="mt-1 text-2xl font-extrabold leading-none tracking-tight tabular-nums">{i.valor}</p>
        </div>
      ))}
    </div>
  )
}

const NIVEL: Record<Alerta['nivel'], { rot: string; cls: string }> = {
  alto: { rot: 'Alto', cls: 'bg-destructive/10 text-destructive' },
  medio: { rot: 'Médio', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
  baixo: { rot: 'Baixo', cls: 'bg-muted text-muted-foreground' },
}

/** Bloco "Alertas" com a explicação em português do porquê de cada um. */
export function BlocoAlertas({ alertas }: { alertas: Alerta[] }) {
  return (
    <section className="rounded-2xl border bg-card p-4 shadow-sm">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        {alertas.length ? <AlertTriangle className="h-4 w-4 text-destructive" /> : <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
        Alertas
      </h2>
      {alertas.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Nenhum comportamento suspeito detectado nos dados registrados.</p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {alertas.map((a) => (
            <li key={a.codigo} className="rounded-xl border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', NIVEL[a.nivel].cls)}>{NIVEL[a.nivel].rot}</span>
                <span className="text-sm font-semibold">{a.titulo}</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{a.explicacao}</p>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Alertas são indícios para investigar, não provas: o IP muda em redes móveis/VPN e o aparelho é identificado só pelo navegador. Dados coletados apenas a partir da ativação do registro; mantidos por 180 dias.
      </p>
    </section>
  )
}

export function AvisoNaoAtivado({ msg }: { msg: string }) {
  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6 text-sm text-amber-700 dark:text-amber-300">
      <p className="font-semibold">Registro de acessos ainda não ativado</p>
      <p className="mt-1">{msg}</p>
    </div>
  )
}

/** Abas de linha (sublinhado border-b-2), navegação por URL. */
export function AbasLinks({ itens }: { itens: { label: string; href: string; ativo: boolean }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-7 gap-y-1 overflow-x-auto border-b">
      {itens.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={cn(
            '-mb-px shrink-0 whitespace-nowrap border-b-2 pb-2.5 pt-1 text-[14px] tracking-[-0.01em] transition-colors',
            t.ativo ? 'border-primary font-extrabold text-foreground' : 'border-transparent font-semibold text-muted-foreground hover:text-foreground',
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  )
}
