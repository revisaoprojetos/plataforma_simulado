import { Card } from '@/components/ui/card'
import { Zap, Flame, Trophy } from 'lucide-react'
import { EscudoLiga } from '@/components/aluno/escudo-liga'
import { ConquistasGrid } from '@/components/aluno/conquistas-grid'
import type { ResumoGamificacao } from '@/lib/gamificacao/leitura'

const fmt = (n: number) => n.toLocaleString('pt-BR')

/**
 * Painel de gamificação do estudante no ADMIN: nível + barra de XP, cargo, liga e conquistas —
 * para o admin conferir sem entrar na conta do aluno. Só aparece quando a gamificação está ativa.
 */
export function GamificacaoEstudante({ resumo, conquistas }: { resumo: ResumoGamificacao; conquistas: any[] }) {
  const p = resumo.progresso
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 border-b px-4 py-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><Trophy className="h-4 w-4" /></span>
        <div className="min-w-0 leading-tight">
          <p className="text-sm font-semibold">Gamificação</p>
          <p className="text-[11px] text-muted-foreground">Nível, cargo, liga e conquistas do aluno</p>
        </div>
      </div>

      <div className="grid items-center gap-4 p-4 md:grid-cols-[auto_1fr_auto]">
        {/* Nível + cargo */}
        <div className="flex items-center gap-3">
          <span className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-full border-[3px] leading-none" style={{ borderColor: 'var(--brand-primary, var(--primary))', color: 'var(--brand-primary, var(--primary))' }}>
            <span className="text-lg font-extrabold tabular-nums">{p.nivel}</span>
            <span className="text-[8px] font-semibold uppercase tracking-wide">nível</span>
          </span>
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Cargo</p>
            <p className="truncate text-sm font-bold">{p.titulo || '—'}</p>
          </div>
        </div>

        {/* Barra de XP do nível + chips */}
        <div className="min-w-0">
          <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Progresso do nível</span>
            <span className="tabular-nums">{fmt(p.xpNoNivel)} / {fmt(p.xpDoNivel)} XP</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-primary/10">
            <div className="h-full rounded-full" style={{ width: `${p.pct}%`, background: 'var(--brand-primary, var(--primary))' }} />
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <Chip icon={<Zap className="h-3.5 w-3.5 text-amber-500" />}>{fmt(resumo.xpTotal)} XP total</Chip>
            <Chip icon={<Flame className="h-3.5 w-3.5 text-orange-500" />}>{resumo.streakAtual} {resumo.streakAtual === 1 ? 'dia' : 'dias'}</Chip>
            <Chip icon={<Zap className="h-3.5 w-3.5 text-primary" />}>{fmt(resumo.xpMes)} XP no mês</Chip>
          </div>
        </div>

        {/* Liga */}
        <div className="flex items-center gap-2.5 rounded-xl border bg-muted/30 px-3 py-2">
          <EscudoLiga cor={resumo.liga.cor} nome={resumo.liga.nome} ativo className="h-10 w-10" />
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Liga</p>
            <p className="text-sm font-bold" style={{ color: resumo.liga.cor }}>{resumo.liga.nome}</p>
          </div>
        </div>
      </div>

      {/* Conquistas */}
      {conquistas.length > 0 && (
        <div className="border-t p-4">
          <p className="mb-2.5 text-xs font-semibold text-muted-foreground">Conquistas</p>
          <ConquistasGrid conquistas={conquistas} />
        </div>
      )}
    </Card>
  )
}

function Chip({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return <span className="inline-flex items-center gap-1 rounded-full border bg-card px-2 py-0.5 text-[11px] font-medium">{icon}{children}</span>
}
