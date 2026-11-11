'use server'
// CS › Membros — ações. Reusa as actions EXISTENTES de Estudantes/Grupos (mesmo cadastro, mesmas regras de
// duplicidade/soft-delete/auditoria/sincronia de bancos) e acrescenta bloqueio de acesso (migração 20261112040000).
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { registrarAudit } from '@/lib/audit'
import { createEstudanteAction, deleteEstudanteAction } from '@/app/admin/estudantes/actions'
import { adicionarMembros, removerMembro } from '@/app/admin/grupos/actions'
import { esquecer } from '@/lib/cache/relatorio-cache'
import { chaveBloqueioAluno } from '@/lib/aluno-bloqueio'
import { guardCs, isUuid, limparCachesCs, aplicarValidadeGrupo } from '@/lib/admin-revisao/cs-server'

type R = { ok: boolean; error?: string }
const EMAIL = /^\S+@\S+\.\S+$/

function revalidar() { revalidatePath('/admin/revisao/membros') }

async function idPorEmail(tenantId: string, email: string): Promise<string | null> {
  const svc = createAdminClient()
  const alvo = email.trim().toLowerCase()
  const { data } = await svc.from('simulado_estudantes').select('id, email').eq('tenant_id', tenantId).eq('deletado', false).ilike('email', email.trim()).limit(5)
  return ((data ?? []) as { id: string; email: string | null }[]).find((r) => (r.email ?? '').trim().toLowerCase() === alvo)?.id ?? null
}

async function colocarNoGrupo(tenantId: string, grupoId: string, ids: string[]): Promise<R> {
  const r = await adicionarMembros(grupoId, ids)
  if (!r.ok) return r
  await aplicarValidadeGrupo(tenantId, grupoId, ids)
  return { ok: true }
}

/** "Adicionar membro": cria o aluno (mesma regra do cadastro de Estudantes) e já o coloca no grupo escolhido. */
export async function adicionarMembroAction(input: { nome: string; email: string; grupoId?: string | null }): Promise<R & { id?: string }> {
  const g = await guardCs('estudantes:create'); if (!g.ok) return g
  const nome = (input.nome ?? '').trim(), email = (input.email ?? '').trim()
  if (!nome) return { ok: false, error: 'Escreva o nome.' }
  if (!EMAIL.test(email)) return { ok: false, error: 'Confira o e-mail.' }
  if (input.grupoId && !isUuid(input.grupoId)) return { ok: false, error: 'Grupo inválido.' }
  const c = await createEstudanteAction({ nome, email })
  if ('error' in c && c.error) return { ok: false, error: c.error }
  const id = await idPorEmail(g.tenantId, email)
  if (!id) return { ok: false, error: 'Aluno criado, mas não foi possível localizá-lo para vincular ao grupo.' }
  if (input.grupoId) { const v = await colocarNoGrupo(g.tenantId, input.grupoId, [id]); if (!v.ok) return { ok: false, error: `Aluno criado, mas o grupo falhou: ${v.error}` } }
  await limparCachesCs(g.tenantId)
  revalidar()
  return { ok: true, id }
}

const LIMITE_IMPORTACAO = 200

/** "Importar lista" (uma pessoa por linha, nome;e-mail): cria quem não existe e coloca todos no grupo. */
export async function importarListaAction(input: { texto: string; grupoId: string }): Promise<R & { criados?: number; jaExistiam?: number; invalidas?: number; ignoradas?: number }> {
  const g = await guardCs('estudantes:create'); if (!g.ok) return g
  if (!isUuid(input.grupoId)) return { ok: false, error: 'Escolha o grupo de acesso.' }
  const linhas = (input.texto ?? '').split(/\r?\n/).map((l) => l.split(/[;,\t]/).map((x) => x.trim()))
  const validas: { nome: string; email: string }[] = []
  const vistos = new Set<string>()
  let invalidas = 0
  for (const l of linhas) {
    if (!l.some(Boolean)) continue
    if (!l[0] || !EMAIL.test(l[1] ?? '')) { invalidas++; continue }
    const k = l[1].toLowerCase()
    if (vistos.has(k)) continue
    vistos.add(k); validas.push({ nome: l[0], email: l[1] })
  }
  if (!validas.length) return { ok: false, error: 'Nenhuma linha válida. Use nome;e-mail.' }
  const lote = validas.slice(0, LIMITE_IMPORTACAO)
  const ids: string[] = []
  let criados = 0, jaExistiam = 0
  for (const v of lote) {
    let id = await idPorEmail(g.tenantId, v.email)
    if (id) jaExistiam++
    else {
      const c = await createEstudanteAction({ nome: v.nome, email: v.email })
      if ('error' in c && c.error) { invalidas++; continue }
      id = await idPorEmail(g.tenantId, v.email)
      if (id) criados++
    }
    if (id) ids.push(id)
  }
  if (ids.length) { const r = await colocarNoGrupo(g.tenantId, input.grupoId, ids); if (!r.ok) return r }
  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_estudantes', depois: { importacao_lista: true, criados, ja_existiam: jaExistiam, grupo_id: input.grupoId } })
  await limparCachesCs(g.tenantId)
  revalidar()
  return { ok: true, criados, jaExistiam, invalidas, ignoradas: validas.length - lote.length }
}

/** Bloquear / desbloquear o acesso (o progresso fica guardado). O login do aluno consulta `acesso_bloqueado`. */
export async function alternarBloqueioAction(id: string): Promise<R & { bloqueado?: boolean }> {
  const g = await guardCs('estudantes:update'); if (!g.ok) return g
  if (!isUuid(id)) return { ok: false, error: 'Aluno inválido.' }
  const svc = createAdminClient()
  const atual = await svc.from('simulado_estudantes').select('nome, acesso_bloqueado').eq('tenant_id', g.tenantId).eq('id', id).eq('deletado', false).maybeSingle()
  if (atual.error) return { ok: false, error: /acesso_bloqueado|column/i.test(atual.error.message) ? 'Aplique a migração 20261112040000 (bloqueio de acesso) e tente de novo.' : atual.error.message }
  if (!atual.data) return { ok: false, error: 'Aluno não encontrado.' }
  const novo = (atual.data as any).acesso_bloqueado !== true
  const { error } = await svc.from('simulado_estudantes').update({ acesso_bloqueado: novo, bloqueado_em: novo ? new Date().toISOString() : null }).eq('tenant_id', g.tenantId).eq('id', id)
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: novo ? 'BLOQUEAR' : 'LIBERAR', entidade: 'simulado_estudantes', entidadeId: id, antes: { acesso_bloqueado: !novo }, depois: { acesso_bloqueado: novo, nome: (atual.data as any).nome ?? null } })
  await esquecer(chaveBloqueioAluno(id))
  await limparCachesCs(g.tenantId)
  revalidar()
  return { ok: true, bloqueado: novo }
}

/** "Remover": soft delete (vai para a Lixeira, recuperável) — mesma action de Estudantes. */
export async function removerMembroAction(id: string): Promise<R> {
  const g = await guardCs('estudantes:delete'); if (!g.ok) return g
  if (!isUuid(id)) return { ok: false, error: 'Aluno inválido.' }
  const r = await deleteEstudanteAction(id)
  if ('error' in r && r.error) return { ok: false, error: r.error }
  await limparCachesCs(g.tenantId)
  revalidar()
  return { ok: true }
}

export async function tirarDoGrupoAction(estudanteId: string, grupoId: string): Promise<R> {
  const g = await guardCs('estudantes:update'); if (!g.ok) return g
  if (!isUuid(estudanteId) || !isUuid(grupoId)) return { ok: false, error: 'Dados inválidos.' }
  const r = await removerMembro(grupoId, estudanteId)
  if (!r.ok) return r
  await limparCachesCs(g.tenantId)
  revalidar()
  return { ok: true }
}

/** "Liberar outro curso": coloca o membro num grupo (o grupo define os cursos e a validade). */
export async function liberarAcessoAction(estudanteId: string, grupoId: string): Promise<R> {
  const g = await guardCs('estudantes:update'); if (!g.ok) return g
  if (!isUuid(estudanteId) || !isUuid(grupoId)) return { ok: false, error: 'Escolha o grupo.' }
  const r = await colocarNoGrupo(g.tenantId, grupoId, [estudanteId])
  if (!r.ok) return r
  await limparCachesCs(g.tenantId)
  revalidar()
  return { ok: true }
}
