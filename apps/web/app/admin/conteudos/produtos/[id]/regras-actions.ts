'use server'

// Aba "Regras" do Produto (Estúdio): leituras do MAPA ÚNICO de regras/liberações. SÓ LEITURA (nenhuma mutação aqui).
// Guard: produtos:view|manage (admin). Isolamento por tenant_id; filtro/ordem/paginação no servidor (lib/produtos/mapa-regras.ts).

import { getCurrentAccess } from '@/lib/auth/permissions'
import { mapaRegrasDoProduto, matrizDoProduto, regrasParaCsv } from '@/lib/produtos/mapa-regras'
import { explicarAlunoNoProduto, buscarAlvosProduto, type ExplicacaoAluno } from '@/lib/produtos/explicar-aluno'
import { listarHistoricoRegras } from '@/lib/produtos/regras-log'
import type { DadosMatriz, FiltroMapa, FiltroMatriz, ItemHistorico, MapaRegras } from '@/lib/produtos/mapa-regras-tipos'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function guard(produtoId: string) {
  const access = await getCurrentAccess()
  const ok = access.isAdmin || access.permissions.includes('produtos:view') || access.permissions.includes('produtos:manage')
  if (!ok) return { error: 'Sem permissão.' as const }
  if (!access.tenantId) return { error: 'Tenant não resolvido — recarregue a página.' as const }
  if (!UUID.test(produtoId)) return { error: 'Produto inválido.' as const }
  return { tenantId: access.tenantId }
}

const texto = (v: unknown, max = 120) => String(v ?? '').slice(0, max)

function limpar(f: FiltroMapa & { cols?: string }): FiltroMapa & { cols?: string } {
  return {
    q: texto(f.q), alvo: ['modulo', 'aula', 'todos'].includes(String(f.alvo)) ? f.alvo : 'todos',
    camada: f.camada ? (texto(f.camada, 30) as FiltroMapa['camada']) : '', efeito: f.efeito ? (texto(f.efeito, 20) as FiltroMapa['efeito']) : '',
    publico: texto(f.publico, 80), sort: texto(f.sort, 20), dir: f.dir === 'desc' ? 'desc' : 'asc',
    page: Math.max(1, Math.floor(Number(f.page)) || 1), pp: Number(f.pp) || 25, cols: texto(f.cols, 2000),
  }
}

export async function carregarMapaRegrasAction(produtoId: string, filtro: FiltroMapa & { cols?: string } = {}): Promise<{ ok: true; mapa: MapaRegras } | { error: string }> {
  const g = await guard(produtoId); if ('error' in g) return { error: g.error ?? 'Sem permissão.' }
  try {
    const mapa = await mapaRegrasDoProduto(g.tenantId, produtoId, limpar(filtro))
    return mapa ? { ok: true, mapa } : { error: 'Produto não encontrado.' }
  } catch (e) { return { error: e instanceof Error ? e.message : 'Falha ao montar o mapa de regras.' } }
}

/** Matriz hierárquica (módulo > aula): árvore leve + células só dos módulos raiz/expandidos; filtros e resumo no servidor. */
export async function carregarMatrizAction(produtoId: string, f: FiltroMatriz): Promise<{ ok: true; matriz: DadosMatriz } | { error: string }> {
  const g = await guard(produtoId); if ('error' in g) return { error: g.error ?? 'Sem permissão.' }
  const ids = (l: unknown, max: number) => [...new Set((Array.isArray(l) ? l : []).map((x) => texto(x, 80)).filter(Boolean))].slice(0, max)
  try {
    const m = await matrizDoProduto(g.tenantId, produtoId, {
      cols: ids(f?.cols, 40), expandir: ids(f?.expandir, 60).filter((i) => UUID.test(i)), q: texto(f?.q, 80),
      modulo: f?.modulo && UUID.test(f.modulo) ? f.modulo : undefined,
      efeito: ['liberado', 'cadeado', 'oculto', 'bloqueado'].includes(String(f?.efeito)) ? f.efeito : '', soDiferencas: !!f?.soDiferencas,
    })
    return m ? { ok: true, matriz: m } : { error: 'Produto não encontrado.' }
  } catch (e) { return { error: e instanceof Error ? e.message : 'Falha ao montar a matriz.' } }
}

export async function exportarRegrasCsvAction(produtoId: string, filtro: FiltroMapa = {}): Promise<{ ok: true; csv: string } | { error: string }> {
  const g = await guard(produtoId); if ('error' in g) return { error: g.error ?? 'Sem permissão.' }
  const csv = await regrasParaCsv(g.tenantId, produtoId, limpar(filtro)).catch(() => null)
  return csv ? { ok: true, csv } : { error: 'Não foi possível exportar.' }
}

export async function buscarAlvosRegrasAction(produtoId: string, q: string): Promise<{ ok: true; alvos: Array<{ id: string; titulo: string; tipo: 'modulo' | 'aula'; disciplina: string }> } | { error: string }> {
  const g = await guard(produtoId); if ('error' in g) return { error: g.error ?? 'Sem permissão.' }
  return { ok: true, alvos: await buscarAlvosProduto(g.tenantId, produtoId, texto(q, 80)).catch(() => []) }
}

export async function explicarAlunoAction(produtoId: string, estudanteId: string, alvoIds: string[]): Promise<{ ok: true; explicacao: ExplicacaoAluno } | { error: string }> {
  const g = await guard(produtoId); if ('error' in g) return { error: g.error ?? 'Sem permissão.' }
  if (!UUID.test(estudanteId)) return { error: 'Aluno inválido.' }
  const ids = [...new Set((alvoIds ?? []).filter((i) => UUID.test(i)))].slice(0, 20)
  if (!ids.length) return { error: 'Escolha uma aula ou módulo.' }
  try {
    const e = await explicarAlunoNoProduto(g.tenantId, estudanteId, produtoId, ids)
    return e ? { ok: true, explicacao: e } : { error: 'Aluno ou produto não encontrado neste tenant.' }
  } catch (err) { return { error: err instanceof Error ? err.message : 'Falha ao explicar a liberação.' } }
}

export async function carregarHistoricoRegrasAction(produtoId: string, f: { camada?: string; q?: string; page?: number; pp?: number } = {}): Promise<{ ok: true; migrado: boolean; rows: ItemHistorico[]; total: number } | { error: string }> {
  const g = await guard(produtoId); if ('error' in g) return { error: g.error ?? 'Sem permissão.' }
  const r = await listarHistoricoRegras(g.tenantId, produtoId, { camada: texto(f.camada, 30), q: texto(f.q, 80), page: f.page, pp: f.pp }).catch(() => ({ migrado: false, rows: [] as ItemHistorico[], total: 0 }))
  return { ok: true, ...r }
}
