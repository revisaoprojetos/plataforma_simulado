import { NextRequest } from 'next/server'
import { autenticarBeta, lerJson, limiteEscrita, ordemEntre, resp400, resp404, resp429, respErroDb, respJson } from '@/lib/aluno/notebook-api'
import { calcularOrdem } from '@/lib/aluno/notebook-server'
import { secaoEditarSchema, uuidSchema } from '@/lib/aluno/notebook-tipos'

export const dynamic = 'force-dynamic'
const COLS = 'id, nome, cor, ordem, tipo, notebook_id'
type Ctx = { params: Promise<{ id: string }> }

async function carregar(a: { svc: any; tenantId: string; estudanteId: string }, id: string) {
  return a.svc.from('simulado_aluno_notebook_secoes').select(COLS).eq('id', id).eq('tenant_id', a.tenantId).eq('estudante_id', a.estudanteId).is('deletado_em', null).maybeSingle()
}
const publico = ({ notebook_id: _n, ...s }: any) => s

// PATCH /api/aluno/notebook/secoes/:id {nome?, cor?, ordem?, entre?:{antes_id,depois_id}} -> {ok, secao}. auto_*: só cor/ordem.
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const a = await autenticarBeta()
  if (!a.ok) return a.resposta
  const { id } = await params
  if (!uuidSchema.safeParse(id).success) return resp404()
  if (!limiteEscrita(a.estudanteId)) return resp429()
  const j = await lerJson(request)
  if (!j.ok) return j.resposta
  const p = secaoEditarSchema.safeParse(j.corpo)
  if (!p.success) return resp400('Dados inválidos.', { erros: p.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) })
  const b = p.data

  const s = await carregar(a, id)
  if (s.error) return respErroDb(s.error, 'secao.get')
  if (!s.data) return resp404()
  if (s.data.tipo.startsWith('auto_') && b.nome !== undefined) return resp400('Seção automática não pode ser renomeada.')

  const upd: Record<string, unknown> = {}
  if (b.nome !== undefined) upd.nome = b.nome
  if (b.cor !== undefined) upd.cor = b.cor
  if (b.ordenar_por !== undefined) upd.ordenar_por = b.ordenar_por // fase 2: sem a migração => 503 migracao_pendente
  if (b.ordem !== undefined) upd.ordem = b.ordem
  else if (b.entre) {
    const r = await ordemEntre(a.svc, 'simulado_aluno_notebook_secoes', a, { notebook_id: s.data.notebook_id }, b.entre, id, calcularOrdem)
    if ('error' in r) return respErroDb(r.error, 'secao.ordem')
    upd.ordem = r.ordem
  }
  if (Object.keys(upd).length === 0) return resp400('Nada para alterar.')
  const u = await a.svc.from('simulado_aluno_notebook_secoes').update(upd).eq('id', id).eq('tenant_id', a.tenantId).eq('estudante_id', a.estudanteId).is('deletado_em', null).select(b.ordenar_por !== undefined ? `${COLS}, ordenar_por` : COLS).maybeSingle()
  if (u.error) return respErroDb(u.error, 'secao.patch')
  if (!u.data) return resp404()
  return respJson({ secao: publico(u.data) })
}

// DELETE /api/aluno/notebook/secoes/:id — soft delete da seção e das suas páginas. auto_* => 400.
export async function DELETE(_request: NextRequest, { params }: Ctx) {
  const a = await autenticarBeta()
  if (!a.ok) return a.resposta
  const { id } = await params
  if (!uuidSchema.safeParse(id).success) return resp404()
  if (!limiteEscrita(a.estudanteId)) return resp429()
  const s = await carregar(a, id)
  if (s.error) return respErroDb(s.error, 'secao.del.get')
  if (!s.data) return resp404()
  if (s.data.tipo.startsWith('auto_')) return resp400('Seção automática não pode ser excluída.')
  const agora = new Date().toISOString()
  const pg = await a.svc.from('simulado_aluno_notebook_paginas').update({ deletado_em: agora }).eq('secao_id', id).eq('tenant_id', a.tenantId).eq('estudante_id', a.estudanteId).is('deletado_em', null)
  if (pg.error) return respErroDb(pg.error, 'secao.del.paginas')
  const sc = await a.svc.from('simulado_aluno_notebook_secoes').update({ deletado_em: agora }).eq('id', id).eq('tenant_id', a.tenantId).eq('estudante_id', a.estudanteId)
  if (sc.error) return respErroDb(sc.error, 'secao.del')
  console.info('[notebook] secao excluida', id)
  return respJson({ id })
}
