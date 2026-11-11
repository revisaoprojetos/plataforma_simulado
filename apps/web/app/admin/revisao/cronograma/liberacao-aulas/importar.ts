import { createAdminClient } from '@/lib/supabase/server'
import { registrarAudit } from '@/lib/audit'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { casarLinhas, type ModuloMin } from '@/lib/produtos/liberacao-aulas-match'
import { lerPlanilhaLiberacao, type LinhaPlanilha } from '@/lib/produtos/liberacao-aulas-import'
import { semTabela } from './dados'
import type { PreviaImportacao, PreviaLinha } from './tipos'

// Núcleo SERVER da importação (usado pela rota de API): lê o .xlsx, casa com as aulas do produto, monta a PRÉVIA e,
// ao confirmar, substitui as linhas do produto (upsert por (produto_id, ordem) + remove as que não vieram no arquivo).

type Svc = ReturnType<typeof createAdminClient>
export interface Preparada { linhas: LinhaPlanilha[]; previa: PreviaImportacao; match: ReturnType<typeof casarLinhas> }

export async function prepararImportacao(svc: Svc, tenantId: string, produtoId: string, arquivo: ArrayBuffer): Promise<Preparada> {
  const { linhas, invalidas } = await lerPlanilhaLiberacao(arquivo)
  const mods = await fetchAll<ModuloMin>(() =>
    svc.from('simulado_produto_modulos').select('id, pai_id, titulo, ordem').eq('tenant_id', tenantId).eq('produto_id', produtoId).eq('deletado', false).order('ordem', { ascending: true }).order('id', { ascending: true }) as any)
  const match = casarLinhas(linhas.map((l) => ({ ordem: l.ordem, disciplina: l.disciplina, numeroAula: l.numeroAula, titulo: l.titulo })), mods)
  const titulo = new Map(mods.map((m) => [m.id, m.titulo]))
  const porOrdem = new Map(match.map((m) => [m.ordem, m]))
  const previaLinhas: PreviaLinha[] = linhas.map((l) => {
    const m = porOrdem.get(l.ordem)!
    return { ordem: l.ordem, disciplina: l.disciplina, numeroAula: l.numeroAula, titulo: l.titulo, dataLiberacao: l.dataLiberacao, aulaId: m.aulaId, aulaTitulo: m.aulaId ? titulo.get(m.aulaId) ?? null : null, metodo: m.metodo, suspeito: m.suspeito, motivo: m.motivo }
  })
  const { count } = await svc.from('simulado_produto_liberacao_aulas').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('produto_id', produtoId)
  const casadas = previaLinhas.filter((p) => p.aulaId).length
  return {
    linhas, match,
    previa: { total: linhas.length, casadas, semVinculo: linhas.length - casadas, suspeitas: previaLinhas.filter((p) => p.suspeito).length, invalidas, existentes: count ?? 0, linhas: previaLinhas },
  }
}

export async function gravarImportacao(svc: Svc, p: { tenantId: string; produtoId: string; atorId: string | null; preparada: Preparada; nomeArquivo: string }): Promise<{ ok: true; gravadas: number; removidas: number } | { ok: false; error: string }> {
  const { tenantId, produtoId, atorId, preparada } = p
  if (!preparada.linhas.length) return { ok: false, error: 'A planilha não tem linhas válidas.' }
  const porOrdem = new Map(preparada.match.map((m) => [m.ordem, m]))
  const agora = new Date().toISOString()
  const rows = preparada.linhas.map((l) => {
    const m = porOrdem.get(l.ordem)!
    return {
      tenant_id: tenantId, produto_id: produtoId, ordem: l.ordem, modulo_id: m.moduloId, aula_id: m.aulaId, disciplina: l.disciplina, numero_aula: l.numeroAula,
      titulo: l.titulo, data_liberacao: l.dataLiberacao, cronogramas: l.cronogramas, semana: l.semana, observacao: l.observacao, data_original: l.dataOriginal,
      ativo: true, criado_por: atorId, atualizado_em: agora,
    }
  })
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await svc.from('simulado_produto_liberacao_aulas').upsert(rows.slice(i, i + 200), { onConflict: 'produto_id,ordem' })
    if (error) return { ok: false, error: semTabela(error) ? 'Aplique a migração 20261117010000 antes de importar.' : `Não foi possível gravar: ${error.message}` }
  }
  // substitui: remove as linhas antigas que não vieram no arquivo
  const novas = new Set(rows.map((r) => r.ordem))
  const antigas = await fetchAll<{ id: string; ordem: number }>(() => svc.from('simulado_produto_liberacao_aulas').select('id, ordem').eq('tenant_id', tenantId).eq('produto_id', produtoId).order('id', { ascending: true }) as any)
  const apagar = antigas.filter((a) => !novas.has(a.ordem)).map((a) => a.id)
  for (let i = 0; i < apagar.length; i += 100) await svc.from('simulado_produto_liberacao_aulas').delete().eq('tenant_id', tenantId).eq('produto_id', produtoId).in('id', apagar.slice(i, i + 100))
  const casadas = rows.filter((r) => r.aula_id).length
  await registrarAudit({
    operacao: 'UPDATE', entidade: 'simulado_produto_liberacao_aulas', entidadeId: produtoId,
    antes: { linhas: antigas.length }, depois: { importacao: p.nomeArquivo, linhas: rows.length, vinculadas: casadas, sem_vinculo: rows.length - casadas, removidas: apagar.length },
    atorId, tenantId,
  })
  return { ok: true, gravadas: rows.length, removidas: apagar.length }
}
