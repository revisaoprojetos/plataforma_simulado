'use server'

// Leituras LAZY / com BUSCA no servidor do editor de Produto (Estúdio).
// Regra backend-first: o page.tsx só traz o leve (Informações); cada aba busca os PRÓPRIOS dados na
// 1ª abertura, e os seletores consultam o banco (ilike + count + .range) em vez de receber listões.
// Toda leitura: guard (produtos:view) + isolamento por tenant_id (service-role bypassa RLS).

import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import {
  getProdutoCurriculo, gruposDoProduto, buscarRecursos, nomesDeRecursos, listarPastasProduto,
  type FiltroCurriculo, type RecursoTipo, type RecursoBusca,
} from '@/lib/produtos/estudio'

async function guard() {
  const access = await getCurrentAccess()
  const ok = access.isAdmin || access.permissions.includes('produtos:view') || access.permissions.includes('produtos:manage')
  if (!ok) return { error: 'Sem permissão.' as const }
  if (!access.tenantId) return { error: 'Tenant não resolvido — recarregue a página.' as const }
  return { tenantId: access.tenantId }
}

const TIPOS: RecursoTipo[] = ['simulado', 'pasta', 'cronograma', 'grupo']
const FILTROS: FiltroCurriculo[] = ['todos', 'arquivo', 'video', 'outros']

/** Aba CONTEÚDOS: módulos (árvore) + aulas; busca por título e filtro de tipo aplicados no banco. */
export async function carregarCurriculoAction(produtoId: string, opts: { q?: string; filtro?: string } = {}) {
  const g = await guard(); if ('error' in g) return { error: g.error }
  const filtro = FILTROS.includes(opts.filtro as FiltroCurriculo) ? (opts.filtro as FiltroCurriculo) : 'todos'
  const { modulos, itens } = await getProdutoCurriculo(g.tenantId, produtoId, { q: (opts.q ?? '').slice(0, 120), filtro })
  return { ok: true as const, modulos, itens }
}

/** Aba VITRINE: resolve SÓ os nomes dos itens já escolhidos nas seções (chave `kind:id`). */
export async function carregarVitrineAction(produtoId: string) {
  const g = await guard(); if ('error' in g) return { error: g.error }
  const svc = createAdminClient()
  const ids: Record<'simulado' | 'pasta' | 'cronograma', string[]> = { simulado: [], pasta: [], cronograma: [] }
  try {
    const { data } = await svc.from('simulado_produto_secoes').select('config')
      .eq('tenant_id', g.tenantId).eq('produto_id', produtoId).limit(200)
    for (const s of (data ?? []) as any[]) for (const it of (s.config?.itens ?? []) as { tipo_item: string; item_id: string }[]) {
      if (!it?.item_id) continue
      if (it.tipo_item === 'simulado') ids.simulado.push(it.item_id)
      else if (it.tipo_item === 'cronograma') ids.cronograma.push(it.item_id)
      else if (it.tipo_item === 'banco' || it.tipo_item === 'biblioteca_pasta' || it.tipo_item === 'desafio') ids.pasta.push(it.item_id)
    }
  } catch { /* tabela ausente → vazio */ }
  const [sim, pas, cro] = await Promise.all([
    nomesDeRecursos(g.tenantId, 'simulado', ids.simulado),
    nomesDeRecursos(g.tenantId, 'pasta', ids.pasta),
    nomesDeRecursos(g.tenantId, 'cronograma', ids.cronograma),
  ])
  const nomes: Record<string, RecursoBusca> = {}
  for (const [k, m] of [['simulado', sim], ['pasta', pas], ['cronograma', cro]] as const) for (const r of Object.values(m)) nomes[`${k}:${r.id}`] = r
  return { ok: true as const, nomes }
}

/** Busca paginada no banco (ilike + count + .range) de simulados/pastas/cronogramas/grupos. */
export async function buscarRecursosAction(tipo: string, q: string, page = 1, soIds?: string[]) {
  const g = await guard(); if ('error' in g) return { error: g.error }
  if (!TIPOS.includes(tipo as RecursoTipo)) return { error: 'Tipo inválido.' }
  const r = await buscarRecursos(g.tenantId, tipo as RecursoTipo, (q ?? '').slice(0, 120), Math.max(1, Math.floor(page) || 1), 20, soIds)
  return { ok: true as const, ...r }
}

/** Nome de recursos já escolhidos (ex.: simulado atual de uma aula) — sem baixar a lista. */
export async function nomesRecursosAction(tipo: string, ids: string[]) {
  const g = await guard(); if ('error' in g) return { error: g.error }
  if (!TIPOS.includes(tipo as RecursoTipo)) return { error: 'Tipo inválido.' }
  return { ok: true as const, nomes: await nomesDeRecursos(g.tenantId, tipo as RecursoTipo, (ids ?? []).slice(0, 200)) }
}

/** Aba GRUPOS: só os grupos vinculados a ESTE produto (ids + nomes). */
export async function carregarGruposDoProdutoAction(produtoId: string) {
  const g = await guard(); if ('error' in g) return { error: g.error }
  return { ok: true as const, grupos: await gruposDoProduto(g.tenantId, produtoId) }
}

/** Árvore de pastas de produto — só quando o diálogo "Mover" é aberto (não vai no page). */
export async function listarPastasProdutoAction() {
  const g = await guard(); if ('error' in g) return { error: g.error }
  return { ok: true as const, pastas: await listarPastasProduto(g.tenantId) }
}
