'use server'
import { revalidatePath } from 'next/cache'
import { getSessaoAluno } from '@/lib/aluno-session'
import { createAdminClient } from '@/lib/supabase/server'
import {
  criarDuvida as _criarDuvida, responderDuvidaAluno as _responder,
  definirResolvidaAluno as _resolver,
} from '@/lib/duvidas/duvidas'
import type { OrigemDuvida } from '@/lib/duvidas/tipos'
import { criarRequerimento as _criarReq } from '@/lib/requerimentos/requerimentos'

// Ações do aluno para a Central de Dúvidas e Requerimentos (/nova/duvidas, /nova/duvidas/requerimentos).
// A sessão do aluno define tenant/estudante (nunca o host) — padrão das telas /nova.

export async function criarDuvida(input: {
  titulo: string; categoria?: string | null; disciplinaId?: string | null; origem?: OrigemDuvida; texto?: string | null
}): Promise<{ ok: boolean; id?: string; erro?: string }> {
  const s = await getSessaoAluno()
  if (!s) return { ok: false, erro: 'sessão inválida' }
  const r = await _criarDuvida(createAdminClient(), {
    tenantId: s.tenantId, estudanteId: s.estudanteId, alunoNome: s.nome, ...input,
  })
  if ('erro' in r) return { ok: false, erro: r.erro }
  revalidatePath('/nova/duvidas')
  return { ok: true, id: r.id }
}

export async function responderDuvida(duvidaId: string, texto: string): Promise<{ ok: boolean; erro?: string }> {
  const s = await getSessaoAluno()
  if (!s) return { ok: false, erro: 'sessão inválida' }
  const r = await _responder(createAdminClient(), { tenantId: s.tenantId, estudanteId: s.estudanteId, alunoNome: s.nome, duvidaId, texto })
  if (r.ok) revalidatePath('/nova/duvidas')
  return r
}

export async function marcarDuvidaResolvida(duvidaId: string, resolvida: boolean): Promise<{ ok: boolean; erro?: string }> {
  const s = await getSessaoAluno()
  if (!s) return { ok: false, erro: 'sessão inválida' }
  const r = await _resolver(createAdminClient(), s.tenantId, s.estudanteId, duvidaId, resolvida)
  if (r.ok) revalidatePath('/nova/duvidas')
  return r
}

export async function criarRequerimento(input: {
  tipo: string; descricao: string; contexto?: string | null
}): Promise<{ ok: boolean; protocolo?: string; erro?: string }> {
  const s = await getSessaoAluno()
  if (!s) return { ok: false, erro: 'sessão inválida' }
  const r = await _criarReq(createAdminClient(), { tenantId: s.tenantId, estudanteId: s.estudanteId, ...input })
  if ('erro' in r) return { ok: false, erro: r.erro }
  revalidatePath('/nova/duvidas/requerimentos')
  return { ok: true, protocolo: r.protocolo }
}
