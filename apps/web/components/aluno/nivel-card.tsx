import type { ResumoGamificacao } from '@/lib/gamificacao/leitura'

const fmt = (n: number) => n.toLocaleString('pt-BR')

/** Card de nível (saudação + anel de nível + barra de XP), estilo trilha do topo da Início. */
export function NivelCard({ nome, resumo }: { nome: string; resumo: ResumoGamificacao }) {
  const p = resumo.progresso
  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1.5 flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--brand-accent)', boxShadow: '0 0 10px 1px color-mix(in oklab, var(--brand-accent) 60%, transparent)' }} />
          <span className="text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--brand-accent)' }}>Sua área de estudos</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-[2rem]">Olá, {nome.split(' ')[0]} 👋</h1>
        <p className="mt-1 text-muted-foreground">
          {p.xpParaProximo > 0
            ? <>Continue sua trilha — faltam <span className="font-semibold text-foreground">{fmt(p.xpParaProximo)} XP</span> para o próximo nível.</>
            : <>Você chegou ao nível máximo. Mandou muito bem! 🎉</>}
        </p>
      </div>

      <div className="rounded-2xl border bg-gradient-to-br from-card to-muted/30 p-5 shadow-sm">
        <div className="flex flex-col items-center gap-2">
          <span className="flex h-14 w-14 items-center justify-center rounded-full border-4 text-xl font-bold tabular-nums"
            style={{ borderColor: 'var(--brand-primary, var(--primary))', color: 'var(--brand-primary, var(--primary))' }}>
            {p.nivel}
          </span>
          <div className="text-center text-sm">
            <span className="font-semibold">Nível {p.nivel}{p.titulo ? ` · ${p.titulo}` : ''}</span>
            <span className="ml-2 text-xs text-muted-foreground tabular-nums">{fmt(p.xpNoNivel)} / {fmt(p.xpDoNivel)} XP</span>
          </div>
          <div className="h-2.5 w-full max-w-md overflow-hidden rounded-full ring-1 ring-black/10 dark:ring-white/10" style={{ background: 'color-mix(in oklab, var(--brand-primary, var(--primary)) 16%, transparent)' }}>
            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${p.pct}%`, background: 'var(--brand-primary, var(--primary))' }} />
          </div>
        </div>
      </div>
    </div>
  )
}
