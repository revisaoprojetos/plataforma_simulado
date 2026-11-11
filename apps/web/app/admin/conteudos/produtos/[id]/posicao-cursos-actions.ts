'use server'

// POSIÇÃO do produto na área de Cursos do aluno (Meus Extensivos): card próprio (largura 1/2 colunas + ordem) OU agrupado dentro do card de
// outro produto. Colunas da migração 20261116010000 (leitura tolerante). Leitura: produtos:view · escrita: produtos:manage.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MIGRACAO = 'Recurso ainda não ativado no banco: aplique a migração 20261116010000_produto_posicao_cursos.sql.'

async function guard(manage = false) {
  const access = await getCurrentAccess()
  const ok = access.isAdmin || access.permissions.includes(manage ? 'produtos:manage' : 'produtos:view') || access.permissions.includes('produtos:manage')
  if (!ok) return { error: 'Sem permissão.' as const }
  if (!access.tenantId) return { error: 'Tenant não resolvido — recarregue a página.' as const }
  return { tenantId: access.tenantId, userId: access.userId }
}

export interface PosicaoCursos {
  disponivel: boolean
  modo: 'card' | 'agrupado'
  agrupar_em: string | null
  largura: 1 | 2
  ordem: number
  /** Produtos em que este pode ser agrupado (extensivos do tenant que não estão agrupados em outro). */
  candidatos: { id: string; nome: string }[]
  /** Produtos agrupados DENTRO deste (um produto com filhos não pode ser agrupado em outro). */
  filhos: { id: string; nome: string }[]
}

export async function lerPosicaoCursosAction(produtoId: string): Promise<{ ok: true; dados: PosicaoCursos } | { error: string }> {
  const g = await guard(); if ('error' in g) return { error: g.error ?? 'Sem permissão.' }
  if (!UUID.test(produtoId)) return { error: 'Produto inválido.' }
  const svc = createAdminClient()
  const base = await svc.from('simulado_produtos').select('ordem').eq('id', produtoId).eq('tenant_id', g.tenantId).maybeSingle()
  if (!base.data) return { error: 'Produto não encontrado.' }
  const ordem = Number((base.data as any).ordem ?? 0) || 0
  const r = await svc.from('simulado_produtos').select('cursos_modo, cursos_agrupar_em, cursos_largura').eq('id', produtoId).eq('tenant_id', g.tenantId).maybeSingle()
  if (r.error) return { ok: true, dados: { disponivel: false, modo: 'card', agrupar_em: null, largura: 1, ordem, candidatos: [], filhos: [] } }
  const p = (r.data ?? {}) as any
  const [cand, fil] = await Promise.all([
    svc.from('simulado_produtos').select('id, nome').eq('tenant_id', g.tenantId).eq('ativo', true).eq('tipo', 'extensivo').neq('id', produtoId).is('cursos_agrupar_em', null).order('nome', { ascending: true }).limit(300),
    svc.from('simulado_produtos').select('id, nome').eq('tenant_id', g.tenantId).eq('cursos_agrupar_em', produtoId).limit(100),
  ])
  return {
    ok: true,
    dados: {
      disponivel: true, modo: p.cursos_modo === 'agrupado' ? 'agrupado' : 'card', agrupar_em: p.cursos_agrupar_em ?? null,
      largura: Number(p.cursos_largura) === 2 ? 2 : 1, ordem,
      candidatos: ((cand.data ?? []) as any[]).map((x) => ({ id: x.id, nome: x.nome })),
      filhos: ((fil.data ?? []) as any[]).map((x) => ({ id: x.id, nome: x.nome })),
    },
  }
}

export async function salvarPosicaoCursosAction(produtoId: string, input: { modo: 'card' | 'agrupado'; agrupar_em?: string | null; largura?: number; ordem?: number }): Promise<{ ok: true } | { error: string }> {
  const g = await guard(true); if ('error' in g) return { error: g.error ?? 'Sem permissão.' }
  if (!UUID.test(produtoId)) return { error: 'Produto inválido.' }
  const modo = input.modo === 'agrupado' ? 'agrupado' : 'card'
  const largura = Number(input.largura) === 2 ? 2 : 1
  const ordem = Math.max(0, Math.min(9999, Math.floor(Number(input.ordem) || 0)))
  const svc = createAdminClient()
  let agrupar: string | null = null
  if (modo === 'agrupado') {
    agrupar = input.agrupar_em ?? null
    if (!agrupar || !UUID.test(agrupar)) return { error: 'Escolha o produto em cujo card este vai aparecer.' }
    if (agrupar === produtoId) return { error: 'Um produto não pode ser agrupado nele mesmo.' }
    const pai = await svc.from('simulado_produtos').select('id, cursos_agrupar_em').eq('id', agrupar).eq('tenant_id', g.tenantId).maybeSingle()
    if (!pai.data) return { error: 'Produto de destino não encontrado.' }
    if ((pai.data as any).cursos_agrupar_em) return { error: 'O produto de destino já está agrupado em outro — escolha um que tenha card próprio.' }
    const filhos = await svc.from('simulado_produtos').select('id', { count: 'exact', head: true }).eq('tenant_id', g.tenantId).eq('cursos_agrupar_em', produtoId)
    if ((filhos.count ?? 0) > 0) return { error: 'Este produto já tem outros agrupados dentro dele. Mova-os antes de agrupá-lo em outro.' }
  }
  const { error } = await svc.from('simulado_produtos').update({ cursos_modo: modo, cursos_agrupar_em: agrupar, cursos_largura: largura, ordem, atualizado_em: new Date().toISOString() }).eq('id', produtoId).eq('tenant_id', g.tenantId)
  if (error) return { error: /cursos_(modo|largura|agrupar)|schema cache|column/i.test(error.message) ? MIGRACAO : error.message }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_produtos', entidadeId: produtoId, depois: { cursos_modo: modo, cursos_agrupar_em: agrupar, cursos_largura: largura, ordem }, tenantId: g.tenantId })
  revalidatePath(`/admin/conteudos/produtos/${produtoId}`); revalidatePath('/aluno/extensivos')
  return { ok: true }
}
