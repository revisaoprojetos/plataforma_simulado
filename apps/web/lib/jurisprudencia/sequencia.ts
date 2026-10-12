// Sequência (streak) do Desafio de Jurisprudência — MESMO padrão do Lei Seca:
// fonte da verdade = ledger imutável `simulado_xp_eventos` (origem='jurisprudencia', meta.dia em BRT).
// Reaproveita o cálculo de `@/lib/leitura/sequencia` (dias consecutivos; zera se o último não é hoje/ontem).
import { calcularSequencia, type SequenciaResult } from '@/lib/leitura/sequencia'

const TZ = 'America/Sao_Paulo' // BRT (os desafios são br); mantém consistência com o Lei Seca

/** Data 'YYYY-MM-DD' no fuso BRT. `iso` opcional (default = agora). */
export function diaBRT(iso?: string | number | Date | null): string {
  const d = iso == null ? new Date() : new Date(iso)
  return d.toLocaleDateString('en-CA', { timeZone: TZ })
}
function ontemDe(hoje: string): string {
  return new Date(Date.parse(hoje + 'T00:00:00Z') - 86_400_000).toISOString().slice(0, 10)
}

/** Streak atual a partir de um conjunto de dias (YYYY-MM-DD, BRT). */
export function streakDe(dias: Iterable<string>): number {
  const hoje = diaBRT()
  return calcularSequencia(dias, null, hoje, ontemDe(hoje)).streakAtual
}
/** Resultado completo (atual + maior + dias efetivos). */
export function sequenciaDe(dias: Iterable<string>): SequenciaResult {
  const hoje = diaBRT()
  return calcularSequencia(dias, null, hoje, ontemDe(hoje))
}

/** Semana atual (domingo→sábado): [{lb, on, hoje, futuro}] para o card do jogo. */
export function semanaDe(dias: Iterable<string>): { lb: string; on: boolean; hoje: boolean; futuro: boolean }[] {
  const set = new Set(dias)
  const hoje = diaBRT()
  const base = new Date(hoje + 'T12:00:00Z') // meio-dia evita virada de fuso
  const dow = base.getUTCDay() // 0=domingo
  const LB = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
  return LB.map((lb, i) => {
    const dt = new Date(base.getTime() + (i - dow) * 86_400_000)
    const k = dt.toISOString().slice(0, 10)
    return { lb, on: set.has(k), hoje: k === hoje, futuro: k > hoje }
  })
}

/**
 * Dias de atividade por aluno no desafio, lidos do ledger (`simulado_xp_eventos`).
 * Fallback: se um aluno NÃO tem evento no ledger mas tem `atualizado_em` no progresso,
 * considera esse dia (backfill p/ atividade anterior à feature). `atualizadoPorAluno` é opcional.
 */
export async function diasAtivosPorAluno(
  svc: any,
  tenantId: string,
  desafioId: string,
  atualizadoPorAluno?: Map<string, string | null>,
  estudanteIds?: string[],
): Promise<Map<string, Set<string>>> {
  const map = new Map<string, Set<string>>()
  // Ledger do desafio. `estudanteIds` (ex.: linhas exibidas no ranking) limita a varredura. Pagina p/ não perder linhas.
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    let q = svc
      .from('simulado_xp_eventos')
      .select('estudante_id, meta')
      .eq('tenant_id', tenantId)
      .eq('origem', 'jurisprudencia')
      .eq('meta->>desafio', desafioId)
    if (estudanteIds && estudanteIds.length) q = q.in('estudante_id', estudanteIds)
    const { data, error } = await q.order('id', { ascending: true }).range(from, from + PAGE - 1)
    if (error || !data || !data.length) break
    for (const r of data as any[]) {
      const dia = r?.meta?.dia
      if (!dia) continue
      let s = map.get(r.estudante_id)
      if (!s) map.set(r.estudante_id, (s = new Set()))
      s.add(dia)
    }
    if (data.length < PAGE) break
  }
  // Backfill por atualizado_em (só p/ quem não tem nada no ledger).
  if (atualizadoPorAluno) {
    for (const [id, iso] of atualizadoPorAluno) {
      if (!iso || map.has(id)) continue
      map.set(id, new Set([diaBRT(iso)]))
    }
  }
  return map
}
