import { createAdminClient } from '@/lib/supabase/server'
import { CORRECOES } from './correcoes-data'
import type { Correcao, CorrecaoVerificada, StatusCorrecao } from './tipos'

/**
 * Correções aplicadas + verificação automática contra achados/varreduras atuais.
 * Decisão: o "verificado em" é DERIVADO (correção x achados abertos x última varredura), sem tabela própria:
 * sempre consistente com a realidade e sem migration. A fonte das correções é o registro versionado no código.
 */

export const casaFingerprint = (fp: string, padroes: string[]) => padroes.some((p) => (p.endsWith('*') ? fp.startsWith(p.slice(0, -1)) : fp === p))

/** Data só (YYYY-MM-DD) vale fim do dia em BRT: só varreduras do dia seguinte em diante verificam. */
export function dataCorrecaoMs(c: Pick<Correcao, 'data'>): number {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(c.data) ? `${c.data}T23:59:59-03:00` : c.data
  const ms = Date.parse(d)
  return Number.isNaN(ms) ? 0 : ms
}

/** Correções vigentes (oculta o exemplo se houver ≥1 real), da mais nova para a mais antiga. */
export function correcoesRegistradas(): Correcao[] {
  const reais = CORRECOES.filter((c) => !c.exemplo)
  return [...(reais.length ? reais : CORRECOES)].sort((a, b) => dataCorrecaoMs(b) - dataCorrecaoMs(a))
}

let cache: { em: number; itens: CorrecaoVerificada[]; ultima: string | null } | null = null
const TTL_MS = 60_000

/** Calcula o status de cada correção (servidor; cache de 60s em memória). */
export async function correcoesVerificadas(): Promise<{ itens: CorrecaoVerificada[]; ultimaVarredura: string | null }> {
  if (cache && Date.now() - cache.em < TTL_MS) return { itens: cache.itens, ultimaVarredura: cache.ultima }
  const regs = correcoesRegistradas()
  const svc = createAdminClient()
  let ultima: string | null = null
  const abertos: { fingerprint: string; titulo: string }[] = []
  try {
    const { data: v } = await svc.from('seguranca_varreduras').select('iniciado_em').not('finalizado_em', 'is', null).order('iniciado_em', { ascending: false }).limit(1)
    ultima = v?.[0]?.iniciado_em ?? null
    const exatos = [...new Set(regs.flatMap((c) => c.fingerprints.filter((p) => !p.endsWith('*'))))]
    const prefixos = [...new Set(regs.flatMap((c) => c.fingerprints.filter((p) => p.endsWith('*')).map((p) => p.slice(0, -1).replace(/[%_,()"\\]/g, ''))))]
    const base = () => svc.from('seguranca_achados').select('fingerprint, titulo').eq('status', 'aberto')
    for (let i = 0; i < exatos.length; i += 80) {
      const { data } = await base().in('fingerprint', exatos.slice(i, i + 80))
      abertos.push(...((data ?? []) as any[]))
    }
    for (const p of prefixos) {
      if (!p) continue
      const { data } = await base().like('fingerprint', `${p}%`).limit(500)
      abertos.push(...((data ?? []) as any[]))
    }
  } catch { /* tabelas ausentes: tolera; status cai em 'aguardando' */ }

  const ultimaMs = ultima ? Date.parse(ultima) : 0
  const itens: CorrecaoVerificada[] = regs.map((c) => {
    const casados = c.fingerprints.length ? abertos.filter((a) => casaFingerprint(a.fingerprint, c.fingerprints)) : []
    // Achados 'manual-*' (auditoria manual) NÃO são reabertos pelo scanner: ficam abertos até alguém validar e marcar
    // como resolvido em Achados. Isso é "validar", não "reapareceu". Só achado detectado pelo scanner pode 'reaparecer'.
    const ab = casados.filter((a) => !a.fingerprint.startsWith('manual-'))
    const pendenteManual = casados.some((a) => a.fingerprint.startsWith('manual-'))
    let status: StatusCorrecao
    if (!c.fingerprints.length) status = 'manual'
    else if (ultimaMs <= dataCorrecaoMs(c)) status = 'aguardando'
    else if (ab.length) status = 'reapareceu'
    else status = pendenteManual ? 'validar' : 'verificada'
    return { ...c, status, verificadaEm: status === 'verificada' || status === 'reapareceu' ? ultima : null, abertos: status === 'reapareceu' ? ab.slice(0, 10) : [] }
  })
  cache = { em: Date.now(), itens, ultima }
  return { itens, ultimaVarredura: ultima }
}

export function contagemCorrecoes(itens: CorrecaoVerificada[]) {
  const corrigidos = itens.filter((c) => c.status === 'verificada').length
  return { total: itens.length, corrigidos, reapareceram: itens.filter((c) => c.status === 'reapareceu').length, pendentes: itens.length - corrigidos }
}

/**
 * Para o relatório de UMA varredura: correções feitas até a data dela, as que ela verificou
 * (fingerprint ausente do conjunto `atual`) e as que ainda aparecem nela.
 */
export function correcoesDaVarredura(iniciadoEm: string, fpsAtuais: string[]) {
  const ms = Date.parse(iniciadoEm)
  const feitasAte = correcoesRegistradas().filter((c) => dataCorrecaoMs(c) <= ms)
  const comVinculo = feitasAte.filter((c) => c.fingerprints.length)
  return {
    feitasAte,
    verificadas: comVinculo.filter((c) => !fpsAtuais.some((fp) => casaFingerprint(fp, c.fingerprints))),
    reapareceram: comVinculo.filter((c) => fpsAtuais.some((fp) => casaFingerprint(fp, c.fingerprints))),
  }
}
