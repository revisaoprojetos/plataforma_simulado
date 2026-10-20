'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { resolverConfigIA } from '@/lib/ia/agentes'
import { NIVEL_LABEL, MODELO_POR_NIVEL, type Nivel } from '@/lib/ia/agentes/niveis'
import { rodarRevisaoDemo } from '@/lib/ia/agentes/demo-revisao'

export interface NivelAgregado { nivel: Nivel; label: string; modelo: string; itens: number; entrada: number; saida: number; custoUSD: number }
export type ResultadoDemo =
  | { ok: false; erro: string }
  | { ok: true; uso: { entrada: number; saida: number; custoUSD: number; chamadas: number }; niveis: NivelAgregado[]; resultados: any[]; trace: any[] }

/** Diz se há IA configurada (env ANTHROPIC_API_KEY ou chave do tenant) + os modelos de cada nível. */
export async function statusIA(): Promise<{ configurada: boolean; provider?: string; modelos: Record<Nivel, string> }> {
  const svc = createAdminClient()
  const tenantId = await getCurrentTenantId()
  const cfg = await resolverConfigIA(svc, tenantId)
  const prov = cfg?.provider ?? 'anthropic'
  return { configurada: !!cfg, provider: cfg?.provider, modelos: MODELO_POR_NIVEL[prov as 'anthropic'] ?? MODELO_POR_NIVEL.anthropic }
}

/** Roda o pipeline de 3 níveis sobre os itens (texto) e devolve resultado + agregados por nível. */
export async function rodarPipelineDemo(itens: string[]): Promise<ResultadoDemo> {
  const lista = (itens || []).map((s) => String(s).trim()).filter(Boolean)
  if (!lista.length) return { ok: false, erro: 'Cole ao menos um item (separe por uma linha com "---").' }
  if (lista.length > 20) return { ok: false, erro: 'Máximo de 20 itens por rodada (demo).' }

  const svc = createAdminClient()
  const tenantId = await getCurrentTenantId()
  const cfg = await resolverConfigIA(svc, tenantId)
  if (!cfg) return { ok: false, erro: 'IA não configurada: defina ANTHROPIC_API_KEY no servidor ou cadastre uma chave em Transcrição (IA).' }

  try {
    const r = await rodarRevisaoDemo(cfg, lista)
    const porNivel = new Map<Nivel, NivelAgregado>()
    for (const p of r.trace as any[]) {
      const a = porNivel.get(p.nivel) ?? { nivel: p.nivel, label: NIVEL_LABEL[p.nivel as Nivel], modelo: p.modelo, itens: 0, entrada: 0, saida: 0, custoUSD: 0 }
      a.itens++; a.entrada += p.usage.entrada; a.saida += p.usage.saida; a.custoUSD += p.custoUSD; a.modelo = p.modelo
      porNivel.set(p.nivel, a)
    }
    const niveis: NivelAgregado[] = (['triagem', 'execucao', 'consolidacao'] as Nivel[]).map((n) =>
      porNivel.get(n) ?? { nivel: n, label: NIVEL_LABEL[n], modelo: '—', itens: 0, entrada: 0, saida: 0, custoUSD: 0 })
    return { ok: true, uso: r.uso, niveis, resultados: r.resultados, trace: r.trace }
  } catch (e) {
    return { ok: false, erro: `Falha ao rodar o pipeline: ${(e as any)?.message || String(e)}` }
  }
}
