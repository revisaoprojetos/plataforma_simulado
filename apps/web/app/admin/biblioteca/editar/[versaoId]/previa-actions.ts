'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { carregarQuestoesSimulado, carregarPicker, type QuestaoSim } from '@/lib/teste/simulado-dados'
import { computarPreviaDados, type TextosDesempenho } from '@/lib/conteudo/previa-compute'
import { carregarTextosDesempenho, salvarTextosDesempenho } from '@/lib/conteudo/textos-desempenho'

// Lab da PRÉVIA da Biblioteca — MESMAS funções do Teste (seleção de simulado + sliders), mas guardando os
// dados por VERSÃO (simulado_conteudo_versoes.previa_dados) em vez do store de disco do Teste. A /preview
// lê previa_dados || DADOS_PREVIA. Tenant-scoped; os dados do simulado reusam a lib compartilhada.

async function tenantOk() {
  if (!(await checkPermission('configuracoes:view'))) return null
  const a = await getCurrentAccess()
  return a.tenantId || null
}

/** Questões do simulado (ordem/disciplina/assunto/pilar) + disciplinas com contagem (pros sliders). */
export async function obterDisciplinasDoSimulado(simuladoId: string) {
  // try/catch para a mensagem REAL chegar à UI: se algo lançar fora do try interno (ex.: resolução de
  // tenant/headers), sem isto o cliente vê só o genérico "An error occurred in the Server Components render".
  try {
    return await carregarQuestoesSimulado(simuladoId)
  } catch (e) {
    return { disciplinas: [], questoes: [], erro: `Falha ao ler disciplinas: ${(e as any)?.message || String(e)}` }
  }
}

/** Dados do PICKER (pop-up): árvore de pastas + simulados com capa/visual. */
export async function carregarPickerSimulados() {
  return carregarPicker()
}

/** Calcula os dados a partir do simulado + reguladores e grava em previa_dados da versão. */
export async function aplicarPreviaSimulado(
  versaoId: string,
  payload: { simuladoTitulo?: string; disciplinas: { nome: string; acertos: number; total: number }[]; questoes?: QuestaoSim[] },
): Promise<{ version: string; erro?: string }> {
  try {
    const tenantId = await tenantOk()
    if (!tenantId) return { version: String(Date.now()), erro: 'Sem permissão.' }
    const textos = await carregarTextosDesempenho(tenantId)
    const data = computarPreviaDados({ ...payload, textos })
    const svc = createAdminClient()
    const { error } = await svc.from('simulado_conteudo_versoes').update({ previa_dados: data }).eq('tenant_id', tenantId).eq('id', versaoId)
    if (error) return { version: String(Date.now()), erro: error.message }
    return { version: String(Date.now()) }
  } catch (e) {
    return { version: String(Date.now()), erro: `Falha ao aplicar: ${(e as any)?.message || String(e)}` }
  }
}

/** Reseta a prévia para o exemplo estático (limpa previa_dados). */
export async function resetarPrevia(versaoId: string): Promise<{ ok: boolean }> {
  const tenantId = await tenantOk()
  if (!tenantId) return { ok: false }
  const svc = createAdminClient()
  await svc.from('simulado_conteudo_versoes').update({ previa_dados: null }).eq('tenant_id', tenantId).eq('id', versaoId)
  return { ok: true }
}

// ── Textos de desempenho (narrativa por faixa) — editados na aba do Lab, guardados no tema do tenant. ──
export type { TextosDesempenho }
export async function obterTextosDesempenho(): Promise<{ ok: boolean; textos?: TextosDesempenho | null; error?: string }> {
  const tenantId = await tenantOk(); if (!tenantId) return { ok: false, error: 'Sem permissão.' }
  return { ok: true, textos: await carregarTextosDesempenho(tenantId) }
}
export async function gravarTextosDesempenho(textos: TextosDesempenho): Promise<{ ok: boolean; error?: string }> {
  const tenantId = await tenantOk(); if (!tenantId) return { ok: false, error: 'Sem permissão.' }
  return salvarTextosDesempenho(tenantId, textos)
}
