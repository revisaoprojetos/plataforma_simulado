'use server'
import type { ResultadoDuvidas } from './actions-tipos'

// Central de Dúvidas (admin Plataforma Revisão) — responder, encaminhar ao professor e marcar problema como corrigido.
// Reusa as libs existentes (lib/duvidas, lib/demandas) + padrão de segurança das actions admin:
// checkPermission('estudantes:update') + service role + tenant/ator da SESSÃO + auditoria + aviso ao aluno + revalidate.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { checkPermission, getCurrentAccess, getAuthUser } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { responderDuvidaAdmin } from '@/lib/duvidas/duvidas'
import { resolverReporte } from '@/lib/demandas/demandas'
import { criarNotificacao } from '@/lib/notificacoes/criar'

const TABELA_AUSENTE = /relation .* does not exist|could not find the table|schema cache|does not exist/i
const ROTA = '/admin/revisao/duvidas'

async function guard() {
  if (!(await checkPermission('estudantes:update'))) return null
  const a = await getCurrentAccess()
  if (!a.tenantId) return null
  let autorNome = 'Equipe'
  try { const u = await getAuthUser(); autorNome = (u?.user_metadata?.nome as string | undefined) || u?.email || 'Equipe' } catch { /* sem sessão supabase */ }
  return { tenantId: a.tenantId, userId: a.userId ?? null, autorNome }
}
const msg = (e: string | undefined, fb: string) => (e && TABELA_AUSENTE.test(e) ? 'Aplique as migrações de dúvidas/demandas (20261027010000/20261027020000) e a 20261112050000.' : e || fb)

export async function responderDuvidaRevisao(duvidaId: string, texto: string): Promise<ResultadoDuvidas> {
  const g = await guard(); if (!g) return { ok: false, error: 'Sem permissão.' }
  if (!texto?.trim()) return { ok: false, error: 'Escreva a resposta antes de enviar.' }
  const svc = createAdminClient()
  const { data: d } = await svc.from('simulado_duvidas').select('estudante_id, titulo').eq('tenant_id', g.tenantId).eq('id', duvidaId).maybeSingle()
  const r = await responderDuvidaAdmin(svc, { tenantId: g.tenantId, duvidaId, autorId: g.userId, autorNome: g.autorNome, texto })
  if (!r.ok) return { ok: false, error: msg(r.erro, 'Falha ao enviar a resposta.') }
  const dv = d as { estudante_id: string; titulo: string } | null
  if (dv) await criarNotificacao(svc, g.tenantId, dv.estudante_id, { tipo: 'duvida', titulo: 'Sua dúvida foi respondida', mensagem: dv.titulo, link: '/aluno/nova/duvidas' })
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_duvidas', entidadeId: duvidaId, tenantId: g.tenantId, atorId: g.userId, depois: { status: 'respondida', resposta: texto.trim() } }).catch(() => {})
  revalidatePath(ROTA)
  return { ok: true }
}

export async function encaminharDuvidaRevisao(duvidaId: string, professorId: string, professorNome: string, nota?: string): Promise<ResultadoDuvidas> {
  const g = await guard(); if (!g) return { ok: false, error: 'Sem permissão.' }
  const nome = (professorNome ?? '').trim().slice(0, 120)
  if (!nome) return { ok: false, error: 'Escolha o professor.' }
  const svc = createAdminClient()
  const { data: d } = await svc.from('simulado_duvidas').select('id').eq('tenant_id', g.tenantId).eq('id', duvidaId).maybeSingle()
  if (!d) return { ok: false, error: 'Dúvida não encontrada.' }
  const { error } = await svc.from('simulado_revisao_duvida_encaminhamentos').insert({
    tenant_id: g.tenantId, duvida_id: duvidaId, professor_id: /^[0-9a-f-]{36}$/i.test(professorId) ? professorId : null,
    professor_nome: nome, nota: (nota ?? '').trim().slice(0, 500) || null, encaminhado_por: g.userId,
  })
  if (error) return { ok: false, error: msg(error.message, 'Falha ao encaminhar.') }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_duvidas', entidadeId: duvidaId, tenantId: g.tenantId, atorId: g.userId, depois: { encaminhada_para: nome } }).catch(() => {})
  revalidatePath(ROTA)
  return { ok: true }
}

export async function marcarReporteCorrigido(id: string): Promise<ResultadoDuvidas> {
  const g = await guard(); if (!g) return { ok: false, error: 'Sem permissão.' }
  const svc = createAdminClient()
  const { data: rep } = await svc.from('simulado_material_reportes').select('estudante_id, documento_id, status').eq('tenant_id', g.tenantId).eq('id', id).maybeSingle()
  if (!rep) return { ok: false, error: 'Problema não encontrado.' }
  const r = await resolverReporte(svc, { tenantId: g.tenantId, id, status: 'resolvido', resolvidoPor: g.userId })
  if (!r.ok) return { ok: false, error: msg(r.erro, 'Falha ao marcar como corrigido.') }
  const rp = rep as { estudante_id: string; documento_id: string; status: string }
  const { data: doc } = await svc.from('simulado_conteudo_documentos').select('titulo').eq('tenant_id', g.tenantId).eq('id', rp.documento_id).maybeSingle()
  await criarNotificacao(svc, g.tenantId, rp.estudante_id, { tipo: 'material', titulo: 'O problema que você reportou foi corrigido', mensagem: (doc as { titulo: string } | null)?.titulo ?? 'Material' })
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_material_reportes', entidadeId: id, tenantId: g.tenantId, atorId: g.userId, antes: { status: rp.status }, depois: { status: 'resolvido' } }).catch(() => {})
  revalidatePath(ROTA)
  return { ok: true }
}
