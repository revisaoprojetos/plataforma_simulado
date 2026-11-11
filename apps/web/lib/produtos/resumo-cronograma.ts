import 'server-only'
import { carregarPainel } from '@/lib/painel/snapshot'
import { listarPlanosAdaptativo } from '@/lib/cronograma/adaptativo/dados'
import { lerAparenciaAuth } from '@/lib/brand/aparencia-auth'

/**
 * RESUMO do item "Cronograma" do currículo do produto (card "Plano de estudo" do aluno). SÓ LEITURA:
 *  - tenant Adaptativo (marca 'revisao'): plano FIXADO do aluno → snapshot do painel já pronto
 *    (carregarPainel = 1 linha em simulado_painel_snapshot; nada é recalculado aqui) — próximas metas
 *    do dia, % da semana e metas atrasadas;
 *  - demais tenants (catálogo padrão): última emissão não arquivada do aluno (opcionalmente do
 *    cronograma do catálogo ligado ao item via ref_id).
 * Calculado UMA vez por carga do currículo (não por item).
 */
export interface ResumoCronograma {
  modo: 'adaptativo' | 'padrao'
  temPlano: boolean
  titulo: string | null
  /** Adaptativo: próximas metas (até 3 por padrão; o bloco da vitrine pede até 5) + progresso. */
  metas: { titulo: string; sub: string; concluida: boolean }[]
  pctSemana: number
  pendencias: number
  feitasHoje: number
  totalHoje: number
  /** Padrão: dados da emissão. */
  criadoEm: string | null
  totalSemanas: number | null
  /** Destino do botão "Abrir cronograma". */
  href: string
}

const HREF = '/aluno/cronograma'

async function ehAdaptativo(svc: any, tenantId: string): Promise<boolean> {
  try {
    const { data } = await svc.from('simulado_tenants').select('slug, nome, tema').eq('id', tenantId).maybeSingle()
    const t = data as { slug?: string; nome?: string; tema?: any } | null
    if (!t) return false
    return lerAparenciaAuth(t.tema, { slug: t.slug, nome: t.nome }).brand === 'revisao'
  } catch { return false }
}

export async function resumoCronogramaDoAluno(svc: any, tenantId: string, estudanteId: string, cronogramaRefIds: string[] = [], maxMetas = 3): Promise<ResumoCronograma> {
  const base: ResumoCronograma = { modo: 'padrao', temPlano: false, titulo: null, metas: [], pctSemana: 0, pendencias: 0, feitasHoje: 0, totalHoje: 0, criadoEm: null, totalSemanas: null, href: HREF }
  if (await ehAdaptativo(svc, tenantId)) {
    const [painel, planos] = await Promise.all([
      carregarPainel(svc, tenantId, estudanteId).catch(() => null),
      listarPlanosAdaptativo(svc, tenantId, estudanteId).catch(() => []),
    ])
    const fixado = planos.find((p) => p.fixado) ?? planos[0] ?? null
    const fp = painel?.foco ?? null // plano em foco de QUALQUER tipo
    const tem = !!painel?.temCronograma && (!!fixado || !!fp)
    return {
      ...base, modo: 'adaptativo', href: fp?.href ?? base.href, temPlano: tem, titulo: fp?.titulo || fixado?.titulo?.trim() || (fixado ? 'Meu cronograma' : null),
      metas: tem ? (painel!.metas.filter((m) => !m.concluida).slice(0, Math.min(5, Math.max(1, maxMetas))).map((m) => ({ titulo: m.titulo, sub: [m.sel, m.dur].filter(Boolean).join(' · '), concluida: false }))) : [],
      pctSemana: painel?.pctSemana ?? 0, pendencias: painel?.pendencias ?? 0, feitasHoje: painel?.feitasHoje ?? 0, totalHoje: painel?.totalHoje ?? 0,
    }
  }
  try {
    let q = svc.from('simulado_cronograma_emissoes').select('id, cronograma_id, cronograma_nome, titulo, criado_em, resumo')
      .eq('tenant_id', tenantId).eq('estudante_id', estudanteId).eq('arquivada', false)
    if (cronogramaRefIds.length) q = q.in('cronograma_id', cronogramaRefIds)
    const { data } = await q.order('criado_em', { ascending: false }).limit(1)
    const e = ((data ?? []) as any[])[0]
    if (e) {
      return { ...base, temPlano: true, titulo: e.titulo || e.cronograma_nome || 'Meu cronograma', criadoEm: e.criado_em ?? null, totalSemanas: Number(e.resumo?.totalSemanas) || null, href: `${HREF}/${e.id}` }
    }
  } catch { /* sem emissões / tabela ausente */ }
  return base
}
