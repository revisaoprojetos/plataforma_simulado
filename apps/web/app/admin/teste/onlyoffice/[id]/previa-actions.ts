'use server'

import { escreverPrevia, limparPrevia, versaoPrevia } from '@/lib/teste/store'
import { carregarQuestoesSimulado, carregarPicker } from '@/lib/teste/simulado-dados'
import type { QuestaoSim, PickerPasta as LPP, PickerSim as LPS } from '@/lib/teste/simulado-dados'
import { computarPreviaDados } from '@/lib/conteudo/previa-compute'
import { carregarTextosDesempenho } from '@/lib/conteudo/textos-desempenho'

// Server actions do laboratório da PRÉVIA (chamadas pelos componentes React). A lógica de dados mora em
// lib/teste/simulado-dados.ts (seleção/questões) e o CÁLCULO em lib/conteudo/previa-compute.ts — a MESMA
// fonte usada pelo lab da Biblioteca, para o conjunto de variáveis (pilares/sub-pilares/faixas) nunca
// divergir entre os dois. Aqui só gravamos o resultado no store de disco do Teste.
export type PickerPasta = LPP
export type PickerSim = LPS

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
  return carregarPicker('simulado')
}

/** Dados do PICKER — aba DESAFIOS: pastas de desafio (maratona…) + simulados INTERNOS delas. */
export async function carregarPickerDesafios() {
  return carregarPicker('desafio')
}

/** Recebe o estado dos reguladores + as questões, calcula (fonte única) e grava a prévia a renderizar. */
export async function aplicarPreviaSimulado(
  id: string,
  payload: { simuladoTitulo?: string; disciplinas: { nome: string; acertos: number; total: number }[]; questoes?: QuestaoSim[] },
): Promise<{ version: string; erro?: string }> {
  try {
    const data = computarPreviaDados({ ...payload, textos: await carregarTextosDesempenho() })
    await escreverPrevia(id, data)
    return { version: await versaoPrevia(id) }
  } catch (e) {
    return { version: String(Date.now()), erro: `Falha ao aplicar: ${(e as any)?.message || String(e)}` }
  }
}

/** Reseta a prévia para o exemplo estático (usado ao abrir o laboratório). */
export async function resetarPrevia(id: string): Promise<{ ok: true }> {
  await limparPrevia(id)
  return { ok: true }
}
