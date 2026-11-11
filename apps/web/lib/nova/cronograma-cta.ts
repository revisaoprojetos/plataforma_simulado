// Loader do CTA "Gerar meu cronograma" das telas de estudo (Cursos / Central de Estudos).
// Só LÊ: planos (listarPlanosAdaptativo) + snapshot do painel (carregarPainel, cacheado) ou catálogo padrão.
// Tenant Revisão (brand 'revisao' + visual interno) = Adaptativo; demais = catálogo (cronogramasDoAluno).
import { createAdminClient } from '@/lib/supabase/server'
import { resolverInterno } from '@/lib/aluno/interno-gate'
import { carregarPainel } from '@/lib/painel/snapshot'
import { listarPlanosAdaptativo } from '@/lib/cronograma/adaptativo/dados'
import { cronogramasDoAluno } from '@/lib/cronograma/acesso'
import type { ResumoPlanoProps } from '@/components/brand/interna/cronograma/resumo-plano'

const CRONOGRAMA = '/aluno/cronograma'

/** Devolve as props do <ResumoPlano/> ou null (nada a mostrar: módulo desligado/sem catálogo no fluxo padrão). */
export async function carregarCtaCronograma(tenantId: string, estudanteId: string): Promise<ResumoPlanoProps | null> {
  try {
    const svc = createAdminClient()
    const it = await resolverInterno()
    if (it.ativo && it.brand === 'revisao') {
      const [planos, painel] = await Promise.all([
        listarPlanosAdaptativo(svc, tenantId, estudanteId),
        carregarPainel(svc, tenantId, estudanteId),
      ])
      const foco = planos.find((p) => p.fixado) ?? planos[0]
      const fp = painel.foco // plano em foco de QUALQUER tipo (Adaptativo ou Revisão)
      return {
        temPlano: planos.length > 0 || !!fp,
        titulo: fp?.titulo ?? foco?.titulo ?? null,
        feitasHoje: painel.feitasHoje, totalHoje: painel.totalHoje,
        pctSemana: painel.pctSemana, pendencias: painel.pendencias,
        hrefAbrir: fp ? fp.href : planos.length > 0 ? `${CRONOGRAMA}?ver=adaptativo` : CRONOGRAMA, hrefGerar: `${CRONOGRAMA}?criar`,
      }
    }
    // Fluxo padrão: catálogo liberado ao aluno (módulo ligado por tenant).
    const { data: cfg } = await svc.from('simulado_cronograma_config').select('ativo').eq('tenant_id', tenantId).maybeSingle()
    if (!(cfg as { ativo?: boolean } | null)?.ativo) return null
    const catalogo = await cronogramasDoAluno(svc, tenantId, estudanteId)
    if (!catalogo.length) return null
    return {
      temPlano: false, hrefAbrir: CRONOGRAMA, hrefGerar: `${CRONOGRAMA}?criar`,
      textoVazio: 'Escolha um dos cronogramas liberados para você, defina a rotina e receba o plano semana a semana.',
    }
  } catch {
    return null
  }
}
