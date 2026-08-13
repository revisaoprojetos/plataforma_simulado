import { createServiceClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { getGamConfig } from '@/lib/gamificacao'
import { resumoGamificacao, posicaoNaLiga } from '@/lib/gamificacao/leitura'
import { RankingLiga } from '@/components/aluno/ranking-liga'
import { EscudoLiga } from '@/components/aluno/escudo-liga'
import { Trophy } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function LigasPage() {
  const sessao = await getSessaoAluno()
  const svc = await createServiceClient()
  const config = await getGamConfig(svc, sessao!.tenantId)

  if (!config?.ativo) {
    return (
      <div className="animate-page mx-auto max-w-lg py-16 text-center">
        <Trophy className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
        <h1 className="text-xl font-bold">Ligas em breve</h1>
        <p className="mt-1 text-muted-foreground">A competição por ligas ainda não está ativa nesta plataforma.</p>
      </div>
    )
  }

  const resumo = await resumoGamificacao(svc, sessao!.tenantId, sessao!.estudanteId, config)
  const posicao = resumo ? await posicaoNaLiga(svc, sessao!.tenantId, resumo.liga.id, resumo.xpTotal) : null
  const ligasOrd = [...config.ligas].sort((a, b) => a.xp_min - b.xp_min)

  return (
    <div className="animate-page space-y-6">
      <div>
        <div className="mb-1.5 flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--brand-accent)' }} />
          <span className="text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--brand-accent)' }}>Competição</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Ligas & Divisões</h1>
        <p className="mt-1 text-muted-foreground">Suba de liga acumulando XP. {resumo && <>Você está na <span className="font-semibold" style={{ color: resumo.liga.cor }}>{resumo.liga.nome}</span>{posicao ? <> · {posicao}º lugar</> : null}.</>}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        {/* Escada de ligas */}
        <div className="space-y-2">
          {ligasOrd.map((l) => {
            const atual = resumo?.liga.id === l.id
            return (
              <div key={l.id} className={`flex items-center gap-3 rounded-xl border p-3.5 ${atual ? 'ring-2' : ''}`} style={atual ? { borderColor: l.cor, boxShadow: `inset 0 0 0 1px ${l.cor}` } : undefined}>
                <EscudoLiga cor={l.cor} ativo={atual} className="h-11 w-11" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{l.nome}</span>
                    {atual && <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ background: l.cor, color: '#fff' }}>Você</span>}
                  </div>
                  <div className="text-xs text-muted-foreground">a partir de {l.xp_min.toLocaleString('pt-BR')} XP</div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Ranking */}
        <RankingLiga inicial="total" />
      </div>
    </div>
  )
}
