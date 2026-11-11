import { cn } from '@/lib/utils'
import { avatarPadraoDe } from '@/lib/aluno/avatar-padrao'
import type { OrigemGrupo } from '@/lib/admin-revisao/cs-tipos'

// Primitivas visuais das telas CS (KPIs, pílulas de status e origem). Só apresentação.

export function KpisCs({ itens, className }: { itens: { valor: string | number; rotulo: string; alerta?: boolean }[]; className?: string }) {
  return (
    <div className={cn('mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4', className)}>
      {itens.map((k) => (
        <div key={k.rotulo} className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{k.rotulo}</div>
          <div className={cn('mt-1 text-3xl font-bold tracking-tight tabular-nums', k.alerta && 'text-amber-600 dark:text-amber-400')}>
            {typeof k.valor === 'number' ? k.valor.toLocaleString('pt-BR') : k.valor}
          </div>
        </div>
      ))}
    </div>
  )
}

const PILL = 'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold'

/** Avatar do aluno EXATAMENTE como no perfil dele (app/aluno/perfil): foto escolhida ou a capivara padrão (determinística pelo
 *  nome), sobre a cor de avatar do aluno (branco se não escolheu), `object-contain`, e foco em 82% quando é foto própria. */
export function AvatarMembro({ nome, avatar, cor, className }: { nome: string; avatar?: string | null; cor?: string | null; className?: string }) {
  return (
    <span className={cn('relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full shadow-sm ring-1 ring-black/10', className)} style={{ background: cor ?? '#ffffff' }} aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={avatar || avatarPadraoDe(nome)} alt="" loading="lazy" className={cn('h-full w-full object-contain', avatar ? 'object-[center_82%]' : 'object-center')} />
    </span>
  )
}

/** "Nv 12 · Cargo" — nível e cargo da gamificação do tenant. Sem registro = nada (não inventa). */
export function NivelCargo({ nivel, cargo, className, curto }: { nivel: number | null; cargo: string | null; className?: string; curto?: boolean }) {
  if (nivel == null) return null
  return <span className={cn('inline-block min-w-0 truncate rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary', curto ? 'shrink-0' : 'max-w-[55%]', className)} title={cargo ? `Nível ${nivel} · ${cargo}` : `Nível ${nivel}`}>Nv {nivel}{cargo && !curto ? ` · ${cargo}` : ''}</span>
}

export function PillStatusMembro({ bloqueado, risco }: { bloqueado: boolean; risco: boolean }) {
  if (bloqueado) return <span className={cn(PILL, 'bg-rose-500/15 text-rose-700 dark:text-rose-400')}>Bloqueado</span>
  if (risco) return <span className={cn(PILL, 'bg-amber-500/15 text-amber-700 dark:text-amber-400')}>Sem acesso há dias</span>
  return <span className={cn(PILL, 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400')}>Ativo</span>
}

export function PillOrigem({ origem }: { origem: OrigemGrupo }) {
  if (origem === 'guru') return <span className={cn(PILL, 'bg-primary/10 text-primary')}>Guru</span>
  if (origem === 'curseduca') return <span className={cn(PILL, 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400')}>Curseduca</span>
  return <span className={cn(PILL, 'bg-muted text-muted-foreground')}>Manual</span>
}

export function NotaCs({ children, tom = 'info' }: { children: React.ReactNode; tom?: 'info' | 'aviso' }) {
  return (
    <div className={cn('flex items-start gap-2 rounded-xl px-3 py-2.5 text-[13px]', tom === 'aviso' ? 'bg-amber-500/10 text-amber-800 dark:text-amber-300' : 'bg-muted text-muted-foreground')}>
      {children}
    </div>
  )
}

/** Cartão-formulário inline ("upform" do protótipo). */
export function FormCs({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mb-4 rounded-2xl border bg-card p-4 shadow-sm">
      <h2 className="mb-3 text-base font-semibold">{titulo}</h2>
      <div className="grid gap-3">{children}</div>
    </section>
  )
}

export function CampoCs({ rotulo, dica, children, className }: { rotulo: string; dica?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn('grid gap-1.5 text-sm', className)}>
      <span className="font-medium">{rotulo}</span>
      {children}
      {dica && <small className="text-xs text-muted-foreground">{dica}</small>}
    </label>
  )
}

export const INPUT_CS = 'h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20'
export const TEXTAREA_CS = 'w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20'

/** Chip selecionável (filtros/públicos/tipos). */
export function chipCls(on: boolean) {
  return cn('inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors', on ? 'border-primary bg-primary text-primary-foreground' : 'bg-card text-foreground hover:bg-muted')
}
