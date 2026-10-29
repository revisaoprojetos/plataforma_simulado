import 'server-only'
import { esquecer, esquecerPrefixo, chaveRelatorio } from '@/lib/cache/relatorio-cache'

/**
 * Invalidação EXPLÍCITA do cache read-through de trilha/leitura de UM aluno (LACUNA 1).
 *
 * As chaves `relatorio:{tenant}:...:{estId}` da Fase 4 usam TTL curto (30s) como rede de segurança,
 * então sem invalidação o aluno pode ver estado ≤30s velho logo após concluir uma aula/quiz. Este
 * helper apaga, na hora, as chaves por-aluno afetadas por uma mutação de progresso:
 *
 *  • `trilha-leitura:{estId}`          — trilha serpenteada (carregarTrilhaLeituraAluno)
 *  • `modulo-completo:{estId}:{modId}` — por PREFIXO: cobre TODOS os módulos do aluno numa chamada
 *  • `gam-rail:{estId}`                — rail de gamificação (carregarGamRail)
 *  • `juris-desafios-aluno:{estId}`    — desafios de jurisprudência do aluno (desafiosDoAluno)
 *
 * Best-effort: NUNCA lança e NUNCA deve bloquear o caminho crítico — chamar como
 * `void invalidarLeituraAluno(tenant, est).catch(() => {})` DEPOIS da mutação.
 */
export async function invalidarLeituraAluno(tenantId: string | null, estId: string): Promise<void> {
  if (!estId) return
  await Promise.allSettled([
    esquecer(chaveRelatorio(tenantId, 'trilha-leitura', estId)),
    esquecer(chaveRelatorio(tenantId, 'gam-rail', estId)),
    esquecer(chaveRelatorio(tenantId, 'juris-desafios-aluno', estId)),
    // `modulo-completo` varia por módulo → invalidação por prefixo (SCAN) cobre todos de uma vez.
    esquecerPrefixo(tenantId, `modulo-completo:${estId}:`),
  ])
}
