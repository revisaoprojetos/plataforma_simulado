'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { carregarQuestoesSimulado, carregarPicker, type QuestaoSim } from '@/lib/teste/simulado-dados'
import { computarPreviaDados } from '@/lib/conteudo/previa-compute'

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
  return carregarQuestoesSimulado(simuladoId)
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
    const data = computarPreviaDados(payload)
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
