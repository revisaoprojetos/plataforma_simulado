'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient, createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { checkPermission } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { softDelete } from '@/lib/soft-delete'
import { rankearSimulado } from '@/lib/ranking'
import { invalidarRelatorios, remember, chaveRelatorio, esquecer } from '@/lib/cache/relatorio-cache'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { sincronizarGrupoPassaporte } from '@/lib/estudante/grupo-passaporte'
import { sincronizarGrupoVitalicio } from '@/lib/estudante/grupo-vitalicio'

const TENANT_VAZIO = '00000000-0000-0000-0000-000000000000'

export type EstudanteBase = {
  id: string; nome: string; email: string | null; cpf: string | null; telefone: string | null
  classificacao: string | null; created_at: string | null; avatar: string | null; avatarCor: string | null
  feitos: number; media: number | null
}

export type SortEstudante = { key: 'nome' | 'classificacao' | 'created_at'; dir: 'asc' | 'desc' }
export type FiltroEstudante = 'todos' | 'passaporte' | 'estudante'

/** Agrega feitos/média (sessões finalizadas, sem teste) SÓ dos estudantes da página — barato. */
async function agregarSessoes(svc: any, tenantId: string, ids: string[]): Promise<Record<string, { feitos: number; media: number | null }>> {
  const out: Record<string, { feitos: number; media: number | null }> = {}
  if (!ids.length) return out
  const sess = await fetchAllByIn<{ estudante_id: string; nota: number | null }>(ids, (chunk) =>
    svc.from('simulado_sessoes_prova').select('estudante_id, nota').eq('tenant_id', tenantId).eq('status', 'finalizada').eq('is_teste', false).eq('deletado', false).in('estudante_id', chunk).order('estudante_id', { ascending: true }))
  const soma: Record<string, number> = {}, cont: Record<string, number> = {}, feitos: Record<string, number> = {}
  for (const s of sess) {
    feitos[s.estudante_id] = (feitos[s.estudante_id] ?? 0) + 1
    if (s.nota != null) { soma[s.estudante_id] = (soma[s.estudante_id] ?? 0) + Number(s.nota); cont[s.estudante_id] = (cont[s.estudante_id] ?? 0) + 1 }
  }
  for (const id of ids) out[id] = { feitos: feitos[id] ?? 0, media: cont[id] ? Math.round(((soma[id] ?? 0) / cont[id]) * 10) / 10 : null }
  return out
}

/** Aplica o filtro de plano (passaporte / padrão) a uma query de estudantes. */
function aplicarFiltro(q: any, filtro?: FiltroEstudante) {
  if (filtro === 'passaporte') return q.eq('classificacao', 'passaporte')
  if (filtro === 'estudante') return q.or('classificacao.is.null,classificacao.neq.passaporte')
  return q
}

/**
 * Uma PÁGINA de estudantes (paginação server-side) com os agregados (feitos/média) SÓ dos alunos da
 * página. Suporta sort (nome/classificação/cadastro) e filtro (passaporte/padrão), tudo no servidor —
 * a lista não baixa mais os milhares de estudantes de uma vez.
 */
export async function carregarLoteEstudantes(offset: number, limit: number, comContagem = true, opts?: { sort?: SortEstudante; filtro?: FiltroEstudante; comAgregados?: boolean }): Promise<{ rows: EstudanteBase[]; total: number }> {
  if (!(await checkPermission('estudantes:view'))) return { rows: [], total: 0 }
  const svc = await createServiceClient()
  const tenantId = (await getCurrentTenantId()) ?? TENANT_VAZIO
  const lim = Math.min(Math.max(limit, 1), 1000) // teto do PostgREST
  let q = svc
    .from('simulado_estudantes')
    .select('id, nome, email, cpf, telefone, classificacao, created_at, avatar, perfil_avatar_cor', comContagem ? { count: 'exact' } : undefined)
    .eq('deletado', false)
    .eq('tenant_id', tenantId)
  q = aplicarFiltro(q, opts?.filtro)
  const col = opts?.sort?.key ?? 'created_at'
  const asc = opts?.sort ? opts.sort.dir === 'asc' : false
  q = q.order(col, { ascending: asc }).order('id', { ascending: true }).range(offset, offset + lim - 1)
  const { data, count } = await q
  const base = (data ?? []).map((e: any) => ({
    id: e.id, nome: e.nome, email: e.email ?? null, cpf: e.cpf ?? null, telefone: e.telefone ?? null,
    classificacao: e.classificacao ?? null, created_at: e.created_at ?? null,
    avatar: e.avatar ?? null, avatarCor: e.perfil_avatar_cor ?? null,
  }))
  // Agregados (feitos/média) só quando pedidos (default): outros consumidores (ex.: relatórios) têm
  // agregados próprios e não devem pagar essa query por lote.
  const agg = opts?.comAgregados === false ? {} : await agregarSessoes(svc, tenantId, base.map((r: any) => r.id))
  const rows: EstudanteBase[] = base.map((r: any) => ({ ...r, feitos: agg[r.id]?.feitos ?? 0, media: agg[r.id]?.media ?? null }))
  return { rows, total: count ?? rows.length }
}

/**
 * Busca estudantes no SERVIDOR (nome/e-mail/CPF/telefone) — para achar qualquer aluno na hora,
 * mesmo que a lista ainda esteja carregando os demais em segundo plano. Limitada a 200 resultados.
 */
export async function buscarEstudantes(termo: string): Promise<EstudanteBase[]> {
  const t = (termo ?? '').trim()
  if (!t) return []
  const svc = await createServiceClient()
  const tenantId = (await getCurrentTenantId()) ?? TENANT_VAZIO
  const like = t.replace(/[%,()*]/g, ' ')
  const ors = [`nome.ilike.%${like}%`, `email.ilike.%${like}%`, `cpf.ilike.%${like}%`, `telefone.ilike.%${like}%`]
  // E-mail SECUNDÁRIO (coluna text[]): casa o endereço exato quando o termo parece um e-mail
  // (operador `cs`/contém — o mesmo usado no login). Assim buscar pelo secundário também acha o aluno.
  if (t.includes('@')) {
    const alvo = t.toLowerCase().replace(/[{}(),*%]/g, '')
    if (alvo) ors.push(`emails_secundarios.cs.{${alvo}}`)
  }
  const { data } = await svc
    .from('simulado_estudantes')
    .select('id, nome, email, cpf, telefone, classificacao, created_at, avatar, perfil_avatar_cor')
    .eq('deletado', false)
    .eq('tenant_id', tenantId)
    .or(ors.join(','))
    .order('nome', { ascending: true })
    .limit(200)
  const base = (data ?? []).map((e: any) => ({
    id: e.id, nome: e.nome, email: e.email ?? null, cpf: e.cpf ?? null, telefone: e.telefone ?? null,
    classificacao: e.classificacao ?? null, created_at: e.created_at ?? null,
    avatar: e.avatar ?? null, avatarCor: e.perfil_avatar_cor ?? null,
  }))
  const agg = await agregarSessoes(svc, tenantId, base.map((r: any) => r.id))
  return base.map((r: any) => ({ ...r, feitos: agg[r.id]?.feitos ?? 0, media: agg[r.id]?.media ?? null }))
}

/** KPIs + e-mails de admin, CACHEADOS (remember, 5 min) — a parte cara (varrer sessões p/ "ativos"
 *  e resolver e-mails de staff no auth) não recomputa a cada visita/volta à lista. */
export type KpisEstudantes = { total: number; passaporte: number; feitos: number; ativos: number; adminEmails: string[] }
export async function kpisEstudantes(): Promise<KpisEstudantes> {
  if (!(await checkPermission('estudantes:view'))) return { total: 0, passaporte: 0, feitos: 0, ativos: 0, adminEmails: [] }
  const tenantId = (await getCurrentTenantId()) ?? TENANT_VAZIO
  return remember(chaveRelatorio(tenantId, 'estudantes-kpis'), 300, async () => {
    const svc = await createServiceClient()
    const [{ count: totalRaw }, { count: totalPass }, { count: totalFeitos }, sess, { data: acessos }] = await Promise.all([
      svc.from('simulado_estudantes').select('id', { count: 'exact', head: true }).eq('deletado', false).eq('tenant_id', tenantId),
      svc.from('simulado_estudantes').select('id', { count: 'exact', head: true }).eq('deletado', false).eq('tenant_id', tenantId).eq('classificacao', 'passaporte'),
      svc.from('simulado_sessoes_prova').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'finalizada').eq('is_teste', false).eq('deletado', false),
      fetchAll<{ estudante_id: string }>(() => svc.from('simulado_sessoes_prova').select('estudante_id').eq('tenant_id', tenantId).eq('status', 'finalizada').eq('is_teste', false).eq('deletado', false).order('estudante_id', { ascending: true })),
      svc.from('simulado_tenant_acessos').select('user_id').eq('tenant_id', tenantId).eq('ativo', true).neq('role', 'estudante'),
    ])
    const ativos = new Set(sess.map((s) => s.estudante_id)).size
    const staffIds = [...new Set((acessos ?? []).map((a: any) => a.user_id).filter(Boolean))] as string[]
    const adminSet = new Set<string>()
    await Promise.all(staffIds.map(async (uid) => { try { const { data } = await svc.auth.admin.getUserById(uid); const e = data?.user?.email?.toLowerCase(); if (e) adminSet.add(e) } catch { /* auth indisponível */ } }))
    const adminEmails = [...adminSet]
    let adminEstudantes = 0
    if (adminEmails.length) { const { count } = await svc.from('simulado_estudantes').select('id', { count: 'exact', head: true }).eq('deletado', false).eq('tenant_id', tenantId).in('email', adminEmails); adminEstudantes = count ?? 0 }
    return { total: Math.max(0, (totalRaw ?? 0) - adminEstudantes), passaporte: totalPass ?? 0, feitos: totalFeitos ?? 0, ativos, adminEmails }
  })
}

/** Exporta TODOS os estudantes (com agregados) — sob demanda, só ao clicar em Exportar. */
export async function exportarTodosEstudantes(): Promise<EstudanteBase[]> {
  if (!(await checkPermission('estudantes:view'))) return []
  const svc = await createServiceClient()
  const tenantId = (await getCurrentTenantId()) ?? TENANT_VAZIO
  const [base, sess] = await Promise.all([
    fetchAll<any>(() => svc.from('simulado_estudantes').select('id, nome, email, cpf, telefone, classificacao, created_at, avatar, perfil_avatar_cor').eq('deletado', false).eq('tenant_id', tenantId).order('created_at', { ascending: false }).order('id', { ascending: true })),
    fetchAll<{ estudante_id: string; nota: number | null }>(() => svc.from('simulado_sessoes_prova').select('estudante_id, nota').eq('tenant_id', tenantId).eq('status', 'finalizada').eq('is_teste', false).eq('deletado', false).order('estudante_id', { ascending: true })),
  ])
  const soma: Record<string, number> = {}, cont: Record<string, number> = {}, feitos: Record<string, number> = {}
  for (const s of sess) { feitos[s.estudante_id] = (feitos[s.estudante_id] ?? 0) + 1; if (s.nota != null) { soma[s.estudante_id] = (soma[s.estudante_id] ?? 0) + Number(s.nota); cont[s.estudante_id] = (cont[s.estudante_id] ?? 0) + 1 } }
  return base.map((e: any) => ({
    id: e.id, nome: e.nome, email: e.email ?? null, cpf: e.cpf ?? null, telefone: e.telefone ?? null,
    classificacao: e.classificacao ?? null, created_at: e.created_at ?? null, avatar: e.avatar ?? null, avatarCor: e.perfil_avatar_cor ?? null,
    feitos: feitos[e.id] ?? 0, media: cont[e.id] ? Math.round(((soma[e.id] ?? 0) / cont[e.id]) * 10) / 10 : null,
  }))
}

interface NovoEstudanteData {
  nome: string
  email: string
  cpf?: string
  telefone?: string
  classificacao?: 'normal' | 'passaporte' | 'vitalicio'
}

export async function createEstudanteAction(data: NovoEstudanteData) {
  if (!(await checkPermission('estudantes:create'))) return { error: 'Você não tem permissão para cadastrar estudantes.' }
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return { error: 'Tenant não resolvido. Verifique o acesso.' }

  const supabase = await createServiceClient()

  // Cria conta global (auth.users). Se o e-mail já existe, segue sem recriar.
  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email: data.email,
    email_confirm: true,
    user_metadata: { full_name: data.nome },
  })

  const userId = authUser?.user?.id ?? null
  if (authError && !/already.*registered|already.*exists/i.test(authError.message)) {
    return { error: authError.message }
  }

  // Cria o perfil do estudante no tenant atual.
  const { error: profileError } = await supabase.from('simulado_estudantes').insert({
    tenant_id: tenantId,
    user_id: userId,
    nome: data.nome,
    email: data.email,
    cpf: data.cpf || null,
    telefone: data.telefone || null,
    classificacao: data.classificacao ?? 'normal',
  })

  if (profileError) {
    // Rollback do auth user apenas se foi criado agora.
    if (userId && !authError) await supabase.auth.admin.deleteUser(userId)
    return { error: profileError.message }
  }

  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_estudantes', entidadeId: userId, depois: { nome: data.nome, email: data.email, classificacao: data.classificacao ?? 'normal' } })

  await esquecer(chaveRelatorio(tenantId, 'estudantes-kpis')) // KPIs (contagens) recomputam na próxima carga
  revalidatePath('/admin/estudantes')
  // NÃO redireciona no servidor: o form mostra o toast de sucesso e navega no cliente (evita cair
  // na tela "Sem acesso" quando o cargo não tem estudantes:view depois de criar).
  return { ok: true }
}

interface EditarEstudanteData {
  nome: string
  email: string
  cpf?: string | null
  telefone?: string | null
  data_nascimento?: string | null
  classificacao?: string | null
  matricula_externa?: string | null
  created_at?: string | null
}

/** Edita as informações de um estudante (perfil). */
export async function editarEstudanteAction(id: string, data: EditarEstudanteData) {
  if (!(await checkPermission('estudantes:update'))) return { error: 'Você não tem permissão para editar estudantes.' }
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return { error: 'Tenant não resolvido. Verifique o acesso.' }

  const nome = data.nome?.trim()
  const email = data.email?.trim()
  if (!nome) return { error: 'Informe o nome.' }
  if (!email) return { error: 'Informe o e-mail.' }

  const svc = createAdminClient()
  const { data: antes } = await svc
    .from('simulado_estudantes')
    .select('nome, email, cpf, telefone, data_nascimento, classificacao, matricula_externa, created_at')
    .eq('id', id).eq('tenant_id', tenantId).maybeSingle()

  const update: Record<string, unknown> = {
    nome,
    email,
    cpf: data.cpf?.trim() || null,
    telefone: data.telefone?.trim() || null,
    data_nascimento: data.data_nascimento || null,
    classificacao: data.classificacao || null,
    matricula_externa: data.matricula_externa?.trim() || null,
  }
  // Só altera a data de cadastro se foi informada (evita sobrescrever com vazio).
  if (data.created_at) update.created_at = data.created_at

  const { error } = await svc.from('simulado_estudantes').update(update).eq('id', id).eq('tenant_id', tenantId)
  if (error) return { error: error.message }

  // Reconhecimento de mudança de categoria: passaporte/vitalício entram no grupo "Passaporte";
  // ao sair, é removido. (não bloqueia o salvamento se falhar)
  await sincronizarGrupoPassaporte(svc, tenantId, id, data.classificacao || null)
  // Vitalício também entra no grupo "Passaporte Vitalício" (premium). Não remove de outros grupos.
  await sincronizarGrupoVitalicio(svc, tenantId, id, data.classificacao || null)

  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_estudantes', entidadeId: id, antes, depois: update })
  revalidatePath(`/admin/estudantes/${id}`)
  revalidatePath('/admin/estudantes')
  return { ok: true }
}

/** Soft delete do estudante → vai para a Lixeira (recuperável). Sessões/vínculos preservados. */
export async function deleteEstudanteAction(id: string) {
  if (!(await checkPermission('estudantes:delete'))) return { error: 'Você não tem permissão para excluir estudantes.' }
  const { error } = await softDelete('simulado_estudantes', id)
  if (error) return { error: error.message }
  await registrarAudit({ operacao: 'DELETE', entidade: 'simulado_estudantes', entidadeId: id, depois: { deletado: true } })
  revalidatePath('/admin/estudantes')
  return { ok: true }
}

/**
 * Apaga UMA tentativa (sessão) do estudante. Soft-delete → sai do histórico, dos resultados, do
 * ranking (recalculado) e da visão do ALUNO (todas as queries do aluno filtram deletado=false),
 * então NÃO conta mais como tentativa. Além disso DEVOLVE a vaga no acesso avulso
 * (tentativas_usadas--) para o aluno poder refazer — se foi a única tentativa, o simulado volta a
 * aparecer como "não feito" para ele. Vai para a Lixeira (recuperável). Invalida os relatórios.
 */
export async function excluirSessaoAction(sessaoId: string, simuladoId: string, estudanteId: string) {
  if (!(await checkPermission('simulados:update'))) return { error: 'Você não tem permissão.' }
  const tenantId = await getCurrentTenantId()
  const svc = createAdminClient()
  const { error } = await softDelete('simulado_sessoes_prova', sessaoId)
  if (error) return { error: error.message }

  // Devolve a tentativa no acesso avulso (tentativas_usadas--), para o aluno poder refazer.
  // Sem acesso avulso (simulado aberto / por matrícula) não há contador — nada a devolver.
  if (simuladoId && estudanteId) {
    try {
      const { data: ac } = await svc.from('simulado_acessos')
        .select('id, tentativas_usadas')
        .eq('simulado_id', simuladoId).eq('estudante_id', estudanteId)
        .order('criado_em', { ascending: false }).limit(1).maybeSingle()
      if (ac && (ac.tentativas_usadas ?? 0) > 0) {
        await svc.from('simulado_acessos').update({ tentativas_usadas: Math.max(0, (ac.tentativas_usadas ?? 0) - 1) }).eq('id', (ac as any).id)
      }
    } catch { /* ignora — acesso avulso pode não existir */ }
  }

  // A sessão excluída sai do cálculo: recalcula o ranking do simulado + invalida cache de relatórios.
  if (simuladoId) { try { await rankearSimulado(svc, simuladoId) } catch { /* ranking best-effort */ } }
  await invalidarRelatorios(tenantId)

  await registrarAudit({ operacao: 'DELETE', entidade: 'simulado_sessoes_prova', entidadeId: sessaoId, depois: { deletado: true } })
  revalidatePath(`/admin/estudantes/${estudanteId}`)
  if (simuladoId) revalidatePath(`/admin/simulados/${simuladoId}`)
  return { ok: true }
}
