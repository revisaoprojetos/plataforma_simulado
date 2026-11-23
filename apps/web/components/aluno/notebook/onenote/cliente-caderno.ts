// Cliente (fetch) ÚNICO do Caderno OneNote: um só `chamar`, todos os métodos aqui. Só fala com /api/aluno/notebook/**.
// NUNCA importar lib/aluno/notebook-api.ts (server-only).
import type { Lixeira, Regua } from '@/lib/aluno/notebook-tipos'
import { novoUuid } from '@/lib/aluno/notebook-uuid'
import type { Arvore, Ordenacao, Pagina } from './tipos'

const uuid = novoUuid

export type Resp<T = unknown> = { ok: boolean; status: number; code?: string; dados: (T & Record<string, any>) | null }
export type Entre = { antes_id?: string | null; depois_id?: string | null }

async function chamar<T = unknown>(url: string, metodo = 'GET', corpo?: unknown): Promise<Resp<T>> {
  try {
    const r = await fetch(url, {
      method: metodo, credentials: 'same-origin',
      headers: corpo === undefined ? undefined : { 'content-type': 'application/json' },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    })
    const j = await r.json().catch(() => null)
    return { ok: r.ok && j?.ok !== false, status: r.status, code: j?.code, dados: j }
  } catch { return { ok: false, status: 0, dados: null } }
}
const B = '/api/aluno/notebook'

// ---------------------------------------------------------------- existentes
export const carregarArvore = () => chamar<Arvore>(B)
export const carregarMaisPaginas = (secaoId: string, offset: number) =>
  chamar<{ paginas: Pagina[] }>(`${B}/arvore?secao_id=${secaoId}&offset=${offset}&limit=200`)
export const criarSecao = (nome: string, cor?: string) => chamar<{ secao: any }>(`${B}/secoes`, 'POST', { nome, ...(cor ? { cor } : {}), client_op_id: uuid() })
export const editarSecao = (id: string, corpo: { nome?: string; cor?: string | null; entre?: Entre }) => chamar(`${B}/secoes/${id}`, 'PATCH', corpo)
export const excluirSecao = (id: string) => chamar(`${B}/secoes/${id}`, 'DELETE')
/** Criação. `id` (uuid do cliente) + `client_op_id` => idempotente; `antes_de_id`/`nivel` (subpágina) são opcionais e o servidor pode ignorá-los
 *  (a casca confere `pagina.nivel` na resposta e completa em segundo plano). */
export const criarPagina = (secaoId: string, tipo: 'texto' | 'folha_livre' = 'texto', o: { id?: string; clientOpId?: string; antesDeId?: string | null; nivel?: number } = {}) =>
  chamar<{ pagina: any }>(`${B}/paginas`, 'POST', {
    secao_id: secaoId, titulo: 'Sem título', tipo_pagina: tipo, client_op_id: o.clientOpId ?? uuid(),
    ...(o.id ? { id: o.id } : {}), ...(o.antesDeId ? { antes_de_id: o.antesDeId } : {}), ...(o.nivel ? { nivel: o.nivel } : {}),
  })
export const excluirPagina = (id: string) => chamar(`${B}/paginas/${id}`, 'DELETE')
export const restaurarPagina = (id: string) => chamar(`${B}/paginas/${id}/restaurar`, 'POST')
export const buscar = (q: string, escopo: 'pagina' | 'secao' | 'caderno', secaoId?: string, paginaId?: string, signal?: AbortSignal) => {
  const p = new URLSearchParams({ q: q.slice(0, 100), limit: '30', escopo })
  if (escopo === 'secao' && secaoId) p.set('secao_id', secaoId)
  if (escopo === 'pagina' && paginaId) p.set('pagina_id', paginaId)
  return fetch(`${B}/busca?${p}`, { signal, credentials: 'same-origin' })
    .then(async (r) => ({ ok: r.ok, itens: ((await r.json().catch(() => null))?.itens ?? []) as { id: string; secao_id: string; titulo: string; trecho?: string; ocorrencias?: string[] }[] }))
}
export const urlExportar = (paginaId: string, formato: 'pdf' | 'docx') => `${B}/paginas/${paginaId}/exportar?formato=${formato}`


// ---------------------------------------------------------------- fase 2 (mover/copiar/lixeira/aparência)
/** 503 `migracao_pendente`: a migração da fase 2 ainda não foi aplicada (a UI mostra aviso discreto). */
export const migracaoPendente = (r: { status: number; code?: string }) => r.status === 503 || r.code === 'migracao_pendente'

/** Move a página (e subpáginas contíguas) para `secaoId`, antes da página `antesDeId` (null = fim). O servidor reordena. */
export const moverPagina = (id: string, secaoId: string, antesDeId?: string | null) =>
  chamar<{ secao_id: string; ids: string[]; ordens: Record<string, number> }>(`${B}/paginas/${id}/mover`, 'POST', { secao_id: secaoId, ...(antesDeId ? { antes_de_id: antesDeId } : {}) })
/** Duplica a página no fim da seção destino. `client_op_id` gerado (reenvie o MESMO em retry de rede). */
export const copiarPagina = (id: string, secaoId: string, clientOpId: string = uuid()) =>
  chamar<{ pagina: { id: string; secao_id: string; titulo: string; ordem: number; versao: number } }>(`${B}/paginas/${id}/copiar`, 'POST', { secao_id: secaoId, client_op_id: clientOpId })
export const listarLixeira = (offset = 0, limit = 30) => chamar<Lixeira>(`${B}/lixeira?offset=${offset}&limit=${limit}`)
export const restaurarSecao = (id: string) => chamar<{ id: string; paginas_restauradas: number }>(`${B}/secoes/${id}/restaurar`, 'POST', {})
export const definirOrdenacaoSecao = (id: string, ordenar_por: Ordenacao) => chamar<{ secao: { id: string; ordenar_por: Ordenacao } }>(`${B}/secoes/${id}`, 'PATCH', { ordenar_por })

/** Seções automáticas (erros/favoritos): somente leitura, paginadas no servidor. */
export const carregarAuto = (tipo: 'erros' | 'favoritos', offset = 0, limit = 20) =>
  chamar<{ itens: any[]; total: number }>(`${B}/auto/${tipo}?offset=${offset}&limit=${limit}`)
/** Página inteira (abrir/recarregar). */
export const carregarPagina = (id: string) => chamar<{ pagina: any; refs?: { questoes?: any[] } }>(`${B}/paginas/${id}`)

/** Lê a versão atual da página. Envia `?campos=versao` (o servidor pode responder só com a versão); TOLERANTE: sem suporte, a
 *  rota devolve a página inteira e lemos `pagina.versao` do mesmo jeito. TODO(servidor): honrar `campos=versao` (rota GET). */
export async function lerVersao(id: string): Promise<number | null> {
  const r = await chamar<{ pagina?: { versao: number }; versao?: number }>(`${B}/paginas/${id}?campos=versao`)
  if (!r.ok) return null
  const v = r.dados?.pagina?.versao ?? r.dados?.versao
  return typeof v === 'number' ? v : null
}
const patchPagina = (id: string, versao: number, campos: Record<string, unknown>) =>
  chamar<{ versao: number; atualizado_em: string; nivel: number; replay: boolean }>(`${B}/paginas/${id}`, 'PATCH', { versao, client_op_id: uuid(), ...campos })
async function comVersao(id: string, campos: Record<string, unknown>) {
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const v = await lerVersao(id)
    if (v == null) return { ok: false, status: 0, dados: null } as Resp<{ versao: number; atualizado_em: string; nivel: number; replay: boolean }>
    const r = await patchPagina(id, v, campos)
    if (r.status !== 409) return r
  }
  return { ok: false, status: 409, dados: null } as Resp<{ versao: number; atualizado_em: string; nivel: number; replay: boolean }>
}
/** nivel 0..2 (o servidor faz o clamp e devolve o nível efetivo em `dados.nivel` e a nova `dados.versao`). */
export const definirNivel = (id: string, nivel: number) => comVersao(id, { nivel })
/** Fundo (chave de PALETA_FUNDO; null = branco) e/ou régua (null = sem régua). Devolve a nova `dados.versao`. */
export const definirAparencia = (id: string, ap: { fundo?: string | null; regua?: Regua | null }) => comVersao(id, ap)
