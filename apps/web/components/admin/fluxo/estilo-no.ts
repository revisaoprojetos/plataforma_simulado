import type { TipoNo } from '@/lib/admin/fluxo/adaptador'

export const ROTULO_NO: Record<TipoNo, string> = { inicio: 'Início', etapa: 'Etapa', decisao: 'Decisão', resultado: 'Resultado', rejeicao: 'Rejeição / adia', aberto: 'Em aberto', condicao: 'Condição', acao: 'Ação', aviso: 'Aviso', nota: 'Nota' }
/** Estilo por tipo de nó (tokens do tema; sem hex). */
export const ESTILO_NO: Record<TipoNo, string> = {
  inicio: 'border-primary bg-primary text-primary-foreground',
  etapa: 'border-border bg-card text-card-foreground',
  decisao: 'border-primary/60 bg-primary/10 text-foreground',
  resultado: 'border-emerald-500/60 bg-emerald-500/10 text-foreground',
  rejeicao: 'border-destructive/60 bg-destructive/10 text-foreground',
  aberto: 'border-dashed border-amber-500 bg-amber-500/10 text-foreground',
  condicao: 'border-sky-500/60 bg-sky-500/10 text-foreground',
  acao: 'border-violet-500/60 bg-violet-500/10 text-foreground',
  aviso: 'border-amber-500/60 bg-amber-500/15 text-foreground',
  nota: 'border-dashed border-muted-foreground/50 bg-muted/40 text-foreground',
}
export { GEO } from '@/lib/admin/fluxo/geometria'
