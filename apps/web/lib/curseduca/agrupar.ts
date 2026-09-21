import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { listarTodosGrupos, type CurseducaCfg } from '@/lib/curseduca/client'
import { executarImport } from '@/lib/curseduca/import-core'

/** Normaliza nome p/ casar canal da Curseduca × grupo do sistema (sem acento/caixa/espaços extras). */
export function normNome(s?: string | null): string {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ')
}

/** Quantos pares canal→grupo processar por tick do cron (mantém cada tick curto). */
const LOTE = 8

/**
 * Um "tick" do agrupamento automático por nome: vincula cada canal da Curseduca ao grupo do sistema
 * de MESMO NOME (cria os que faltam + entra no grupo + propaga acesso, via executarImport com
 * destino='existente'). Processa só um LOTE por chamada, começando em `cursor` (round-robin), para
 * que cada tick do cron seja curto. Devolve um resumo + o próximo cursor.
 *
 * `sincronizar=false`: só ADICIONA ao grupo, nunca remove (não tira aluno que saiu do canal).
 */
export async function agruparPorNomeTick(
  svc: SupabaseClient, tenantId: string, cfg: CurseducaCfg, canais: number[], cursor: number,
): Promise<{ resultado: Record<string, unknown>; proximoCursor: number }> {
  // 1) Nome de cada canal da Curseduca (id → nome).
  const grupos = await listarTodosGrupos(cfg)
  const nomeCanal = new Map<number, string>(grupos.map((g) => [Number(g.id), g.nome]))

  // 2) Grupos do sistema por nome normalizado.
  const { data: sg } = await svc.from('simulado_grupos').select('id, nome').eq('tenant_id', tenantId).eq('deletado', false)
  const grpPorNome = new Map<string, string>((sg ?? []).map((x: any) => [normNome(x.nome), x.id]))

  // 3) Pares canal→grupo (só canais com grupo de mesmo nome no sistema).
  const pares: { canal: number; grupo: string; nome: string }[] = []
  const semGrupo: number[] = []
  for (const id of canais) {
    const nome = nomeCanal.get(Number(id))
    const grupo = nome ? grpPorNome.get(normNome(nome)) : undefined
    if (grupo) pares.push({ canal: Number(id), grupo, nome: nome as string })
    else semGrupo.push(Number(id))
  }
  if (!pares.length) {
    return { resultado: { ok: true, modo: 'agrupar', pares: 0, sem_grupo: semGrupo.length, obs: 'nenhum canal casou com grupo do sistema' }, proximoCursor: 0 }
  }

  // 4) Fatia deste tick (round-robin a partir do cursor).
  const ini = ((cursor % pares.length) + pares.length) % pares.length
  const fatia = pares.slice(ini, ini + LOTE)
  if (fatia.length < LOTE) fatia.push(...pares.slice(0, LOTE - fatia.length)) // wrap

  // 5) Re-sincroniza cada par (tolerante: um grupo que falhe não derruba os outros).
  let vinculadosTot = 0, novosTot = 0, falhas = 0
  const detalhe: { nome: string; vinculados: number; novos: number; erro?: string }[] = []
  for (const p of fatia) {
    try {
      const r = await executarImport({ tenantId, cfg }, [p.canal], { tipo: 'existente', grupoId: p.grupo }, false, Number.MAX_SAFE_INTEGER)
      vinculadosTot += r.vinculados ?? 0
      novosTot += r.novos ?? 0
      detalhe.push({ nome: p.nome, vinculados: r.vinculados ?? 0, novos: r.novos ?? 0, ...(r.ok ? {} : { erro: r.error }) })
      if (!r.ok) falhas++
    } catch (e: any) {
      falhas++
      detalhe.push({ nome: p.nome, vinculados: 0, novos: 0, erro: String(e?.message ?? e).slice(0, 120) })
    }
  }

  const proximoCursor = (ini + fatia.length) % pares.length
  return {
    resultado: {
      ok: falhas === 0, modo: 'agrupar', total_pares: pares.length, processados_neste_tick: fatia.length,
      faixa: `${ini + 1}..${ini + fatia.length} de ${pares.length}`,
      vinculados: vinculadosTot, novos: novosTot, falhas, sem_grupo: semGrupo.length, detalhe: detalhe.slice(0, 12),
      atualizado_em: new Date().toISOString(),
    },
    proximoCursor,
  }
}
