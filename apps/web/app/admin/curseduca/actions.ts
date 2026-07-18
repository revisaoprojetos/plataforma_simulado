'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { configDoEnv, testarCredenciais, listarTodosGrupos, contarMembros, listarMembrosDoGrupo, mapaMatriculasGrupo, contarMuitosGrupos } from '@/lib/curseduca/client'
import { resolverCfg, executarImport, envAplicaAoTenant } from '@/lib/curseduca/import-core'
import type { DestinoImport, ResultadoImportCurseduca } from '@/lib/curseduca/tipos'
import { criptografar, descriptografar, estaCriptografado, criptografiaAtiva } from '@/lib/crypto'
import { selecionarGrupos } from '@/lib/simulado/grupos'
import { fetchAll } from '@/lib/supabase/fetch-all'

export type GrupoCurseducaDTO = { id: number; nome: string; criadoEm: string | null }
export type GrupoSistema = { id: string; nome: string; cor: string | null; pai_id: string | null; is_mestre: boolean; membros: number }

/** Árvore de grupos do sistema (pastas + grupos) com contagem de membros — para o seletor de destino. */
async function carregarGruposSistema(tenantId: string): Promise<GrupoSistema[]> {
  const svc = createAdminClient()
  const grupos = await selecionarGrupos(svc, tenantId)
  const ids = grupos.filter((x) => !x.is_mestre).map((x) => x.id)
  const membros = new Map<string, number>()
  if (ids.length) {
    const gm = await fetchAll<{ grupo_id: string }>(() =>
      svc.from('simulado_grupo_membros').select('grupo_id').in('grupo_id', ids).order('id', { ascending: true }))
    for (const m of gm) membros.set(m.grupo_id, (membros.get(m.grupo_id) ?? 0) + 1)
  }
  return grupos.map((x) => ({ id: x.id, nome: x.nome, cor: x.cor, pai_id: x.pai_id, is_mestre: x.is_mestre, membros: membros.get(x.id) ?? 0 }))
}

/** Recarrega só os grupos do sistema (sem tocar na API da Curseduca) — usado após criar grupo/pasta no seletor. */
export async function listarGruposSistema(): Promise<{ ok: boolean; error?: string; sistema?: GrupoSistema[] }> {
  if (!(await checkPermission('estudantes:view')) && !(await checkPermission('estudantes:create'))) return { ok: false, error: 'Sem permissão.' }
  const access = await getCurrentAccess()
  if (!access.tenantId) return { ok: false, error: 'Tenant não resolvido.' }
  try { return { ok: true, sistema: await carregarGruposSistema(access.tenantId) } }
  catch (e: any) { return { ok: false, error: e?.message ?? 'Falha ao carregar grupos.' } }
}

/** Contexto: tenant resolvido + credenciais Curseduca (do tenant ou do .env). */
async function ctx() {
  const access = await getCurrentAccess()
  if (!access.tenantId) return { ok: false as const, error: 'Tenant não resolvido.' }
  const cfg = await resolverCfg(access.tenantId)
  if (!cfg) return { ok: false as const, error: 'Integração Curseduca não configurada. Configure as credenciais nesta tela (aba Credenciais).' }
  return { ok: true as const, tenantId: access.tenantId, userId: access.userId, cfg }
}

/** Lista os grupos de acesso da Curseduca + os grupos do sistema (para destino). */
export async function listarGruposCurseduca(): Promise<{ ok: boolean; error?: string; grupos?: GrupoCurseducaDTO[]; sistema?: GrupoSistema[] }> {
  if (!(await checkPermission('estudantes:view')) && !(await checkPermission('estudantes:create'))) return { ok: false, error: 'Sem permissão.' }
  const g = await ctx(); if (!g.ok) return { ok: false, error: g.error }
  try {
    const grupos = (await listarTodosGrupos(g.cfg))
      .map((x) => ({ id: x.id, nome: x.nome, criadoEm: x.criadoEm }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    const sistema = await carregarGruposSistema(g.tenantId)
    return { ok: true, grupos, sistema }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Falha ao consultar a Curseduca.' }
  }
}

/** Conta quantos membros há nos grupos selecionados (rápido). */
export async function contarMembrosGrupos(ids: number[]): Promise<{ ok: boolean; total?: number; porGrupo?: Record<number, number>; error?: string }> {
  if (!(await checkPermission('estudantes:view')) && !(await checkPermission('estudantes:create'))) return { ok: false, error: 'Sem permissão.' }
  const g = await ctx(); if (!g.ok) return { ok: false, error: g.error }
  try {
    const porGrupo: Record<number, number> = {}
    let total = 0
    for (const id of ids) { const n = await contarMembros(g.cfg, id); porGrupo[id] = n; total += n }
    return { ok: true, total, porGrupo }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Falha ao contar membros.' }
  }
}

/** Conta membros de TODOS os grupos informados (para exibir a coluna de contagem na lista). */
export async function contarTodosGrupos(ids: number[]): Promise<{ ok: boolean; contagens?: Record<number, number>; error?: string }> {
  if (!(await checkPermission('estudantes:view')) && !(await checkPermission('estudantes:create'))) return { ok: false, error: 'Sem permissão.' }
  const g = await ctx(); if (!g.ok) return { ok: false, error: g.error }
  try {
    return { ok: true, contagens: await contarMuitosGrupos(g.cfg, ids) }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Falha ao contar membros.' }
  }
}

// ── Credenciais por tenant ──────────────────────────────────────────────────
export type CurseducaConfigDTO = { base_url: string; usuario: string; ativo: boolean; temApiKey: boolean; temSenha: boolean; usandoEnv: boolean; existe: boolean; criptografado: boolean; criptografiaAtiva: boolean }

/** Estado da config Curseduca do tenant (nunca devolve api_key/senha — só se estão preenchidas). */
export async function getCurseducaConfig(): Promise<{ ok: boolean; error?: string; config?: CurseducaConfigDTO }> {
  if (!(await checkPermission('estudantes:create'))) return { ok: false, error: 'Sem permissão.' }
  const access = await getCurrentAccess()
  if (!access.tenantId) return { ok: false, error: 'Tenant não resolvido.' }
  // O .env global só vale para o tenant designado (evita uma empresa usar a conta de outra).
  const env = envAplicaAoTenant(access.tenantId) ? configDoEnv() : null
  const cripAtiva = criptografiaAtiva()
  const doEnv = (): CurseducaConfigDTO => ({ base_url: env?.base || 'https://prof.curseduca.pro', usuario: env?.user || '', ativo: !!env, temApiKey: !!env?.apiKey, temSenha: !!env?.pass, usandoEnv: !!env, existe: false, criptografado: false, criptografiaAtiva: cripAtiva })
  try {
    const svc = createAdminClient()
    const { data } = await svc.from('simulado_curseduca_config').select('base_url, api_key, usuario, senha, ativo').eq('tenant_id', access.tenantId).maybeSingle()
    const d = data as any
    if (d) return { ok: true, config: { base_url: d.base_url || 'https://prof.curseduca.pro', usuario: d.usuario || '', ativo: !!d.ativo, temApiKey: !!d.api_key, temSenha: !!d.senha, usandoEnv: false, existe: true, criptografado: estaCriptografado(d.api_key) || estaCriptografado(d.senha), criptografiaAtiva: cripAtiva } }
    return { ok: true, config: doEnv() }
  } catch {
    return { ok: true, config: doEnv() } // tabela ainda não existe → usa env
  }
}

/** Checagem LEVE se a integração está configurada (DB/.env) — sem puxar grupos da API. */
export async function curseducaConfigurado(): Promise<boolean> {
  const access = await getCurrentAccess()
  if (!access.tenantId) return false
  try { return !!(await resolverCfg(access.tenantId)) } catch { return false }
}

/**
 * Estado da integração para a UI: distingue "não configurada" de "configurada mas INATIVA".
 * `resolverCfg` só resolve com `ativo=true`; sem isto, a aba Importar dizia "não configurada"
 * mesmo com as credenciais salvas — mensagem enganosa. `inativo=true` sinaliza esse caso.
 */
export async function curseducaEstado(): Promise<{ configurado: boolean; inativo: boolean }> {
  const access = await getCurrentAccess()
  if (!access.tenantId) return { configurado: false, inativo: false }
  try {
    if (await resolverCfg(access.tenantId)) return { configurado: true, inativo: false }
    // Não resolveu: existe uma linha com credenciais completas porém desativada?
    const svc = createAdminClient()
    const { data } = await svc.from('simulado_curseduca_config').select('api_key, usuario, senha, ativo').eq('tenant_id', access.tenantId).maybeSingle()
    const d = data as any
    return { configurado: false, inativo: !!(d && d.api_key && d.usuario && d.senha && !d.ativo) }
  } catch { return { configurado: false, inativo: false } }
}

/** Salva as credenciais do tenant (testa login antes de gravar). Campos em branco preservam o valor atual. */
export async function salvarCurseducaConfig(dados: { base_url?: string; api_key?: string; usuario?: string; senha?: string; ativo?: boolean }): Promise<{ ok: boolean; error?: string }> {
  if (!(await checkPermission('estudantes:create'))) return { ok: false, error: 'Sem permissão.' }
  const access = await getCurrentAccess()
  if (!access.tenantId) return { ok: false, error: 'Tenant não resolvido.' }
  const svc = createAdminClient()
  try {
    const { data: atual } = await svc.from('simulado_curseduca_config').select('base_url, api_key, usuario, senha, ativo').eq('tenant_id', access.tenantId).maybeSingle()
    const a = atual as any
    const base = dados.base_url?.trim() || a?.base_url || 'https://prof.curseduca.pro'
    const usuario = dados.usuario?.trim() || a?.usuario || ''
    // Valores em PLAINTEXT: do formulário, ou os já salvos (descriptografados) quando o campo vem em branco.
    const apiKey = dados.api_key?.trim() || (descriptografar(a?.api_key) ?? '')
    const senha = dados.senha?.trim() || (descriptografar(a?.senha) ?? '')
    const ativo = dados.ativo ?? a?.ativo ?? true
    if (!apiKey || !usuario || !senha) return { ok: false, error: 'Informe API key, usuário e senha.' }
    if (ativo) {
      const teste = await testarCredenciais({ base, apiKey, user: usuario, pass: senha })
      if (!teste.ok) return { ok: false, error: `Credenciais inválidas: ${teste.error ?? 'login falhou'}` }
    }
    // Grava CRIPTOGRAFADO em repouso (AES-256-GCM). Sem APP_ENCRYPTION_KEY, cai para texto puro (com aviso).
    const { error } = await svc.from('simulado_curseduca_config').upsert(
      { tenant_id: access.tenantId, base_url: base, api_key: criptografar(apiKey), usuario, senha: criptografar(senha), ativo, atualizado_em: new Date().toISOString() },
      { onConflict: 'tenant_id' },
    )
    if (error) {
      if (/relation|does not exist|schema cache|column/i.test(error.message)) return { ok: false, error: 'Rode a migration da tabela simulado_curseduca_config (SQL fornecido) e tente de novo.' }
      return { ok: false, error: error.message }
    }
    await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_curseduca_config', entidadeId: access.tenantId, depois: { usuario, ativo, base } })
    revalidatePath('/admin/curseduca')
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Falha ao salvar credenciais.' }
  }
}

export type MembroPreview = {
  id: number; nome: string; email: string | null; cpf: string | null; telefone: string | null
  situacao: string | null; criadoEm: string | null; ultimoAcesso: string | null; cidade: string | null; uf: string | null
  entrouEm: string | null       // entrada no grupo (enteredAt)
  expiraEm: string | null       // data de expiração (null quando vitalício)
  temMatricula: boolean         // se há registro de matrícula no grupo (p/ distinguir vitalício de desconhecido)
}

/** Lista os membros de um grupo (perfil + matrícula: entrada/expiração no grupo) para pré-visualização. */
export async function previewMembrosGrupo(groupId: number): Promise<{ ok: boolean; error?: string; membros?: MembroPreview[] }> {
  if (!(await checkPermission('estudantes:view')) && !(await checkPermission('estudantes:create'))) return { ok: false, error: 'Sem permissão.' }
  const g = await ctx(); if (!g.ok) return { ok: false, error: g.error }
  try {
    const [lista, matriculas] = await Promise.all([listarMembrosDoGrupo(g.cfg, groupId), mapaMatriculasGrupo(g.cfg, groupId)])
    const membros = lista.map((m) => {
      const mat = matriculas.get(m.id)
      return {
        id: m.id, nome: m.nome, email: m.email, cpf: m.cpf, telefone: m.telefone,
        situacao: m.situacao, criadoEm: m.criadoEm, ultimoAcesso: m.ultimoAcesso, cidade: m.cidade, uf: m.uf,
        entrouEm: mat?.entrouEm ?? null, expiraEm: mat?.expiraEm ?? null, temMatricula: !!mat,
      }
    })
    return { ok: true, membros }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Falha ao carregar membros.' }
  }
}

/**
 * Importa os membros dos grupos selecionados da Curseduca.
 * - Cria só quem ainda não existe (dedupe por matrícula Curseduca, e-mail ou CPF).
 * - Se um destino de grupo for informado, VINCULA todos (novos e já existentes) a ele.
 */
export async function importarGruposCurseduca(ids: number[], destino: DestinoImport, sincronizar = false): Promise<ResultadoImportCurseduca> {
  if (!(await checkPermission('estudantes:create'))) return { ok: false, error: 'Sem permissão para cadastrar estudantes.' }
  const g = await ctx(); if (!g.ok) return { ok: false, error: g.error }
  if (!ids?.length) return { ok: false, error: 'Selecione ao menos um grupo.' }
  return executarImport({ tenantId: g.tenantId, cfg: g.cfg }, ids, destino, sincronizar, 400)
}

/** Cria um grupo (tolerante a pai_id ausente). Retorna o id ou null. */
async function inserirGrupo(svc: ReturnType<typeof createAdminClient>, tenantId: string, nome: string, paiId: string | null): Promise<string | null> {
  const payload: any = { tenant_id: tenantId, nome }
  if (paiId) payload.pai_id = paiId
  let r = await svc.from('simulado_grupos').insert(payload).select('id').single()
  if (r.error && /pai_id/i.test(r.error.message)) { delete payload.pai_id; r = await svc.from('simulado_grupos').insert(payload).select('id').single() }
  return r.error ? null : (r.data as any).id
}

export type ResultadoPorCanal = ResultadoImportCurseduca & { canais?: number; gruposCriados?: number; gruposReusados?: number }

/**
 * Importa vários canais da Curseduca criando UM grupo por canal (com o nome do canal),
 * dentro da pasta escolhida. Se já existir um grupo com aquele nome, reaproveita e só
 * ADICIONA os alunos (nunca remove os já vinculados). Agiliza importar muitos canais.
 */
export async function importarCurseducaPorCanal(ids: number[], paiId: string | null): Promise<ResultadoPorCanal> {
  if (!(await checkPermission('estudantes:create'))) return { ok: false, error: 'Sem permissão para cadastrar estudantes.' }
  const g = await ctx(); if (!g.ok) return { ok: false, error: g.error }
  if (!ids?.length) return { ok: false, error: 'Selecione ao menos um canal.' }
  const svc = createAdminClient()

  // Nomes dos canais da Curseduca.
  let nomePorId = new Map<number, string>()
  try {
    const canais = await listarTodosGrupos(g.cfg)
    nomePorId = new Map(canais.map((c) => [c.id, c.nome]))
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Falha ao consultar a Curseduca.' }
  }

  // Grupos existentes (nome→id), ignorando pastas (mestre). Reaproveita por nome.
  const existentes = await selecionarGrupos(svc, g.tenantId)
  const idPorNome = new Map<string, string>()
  for (const gr of existentes) if (!gr.is_mestre) { const k = gr.nome.trim().toLowerCase(); if (!idPorNome.has(k)) idPorNome.set(k, gr.id) }

  const agg: ResultadoPorCanal = { ok: true, total: 0, novos: 0, jaExistiam: 0, atualizados: 0, vinculados: 0, removidos: 0, semIdentificador: 0, semDetalhe: 0, restante: 0, canais: ids.length, gruposCriados: 0, gruposReusados: 0 }
  for (const id of ids) {
    const nome = (nomePorId.get(id) ?? `Curseduca ${id}`).trim()
    const key = nome.toLowerCase()
    let grupoId = idPorNome.get(key)
    if (grupoId) {
      agg.gruposReusados = (agg.gruposReusados ?? 0) + 1
    } else {
      grupoId = (await inserirGrupo(svc, g.tenantId, nome, paiId)) ?? undefined
      if (!grupoId) continue
      idPorNome.set(key, grupoId)
      agg.gruposCriados = (agg.gruposCriados ?? 0) + 1
    }
    // sincronizar=false → só ADICIONA alunos ao grupo, nunca remove os já vinculados.
    const r = await executarImport({ tenantId: g.tenantId, cfg: g.cfg }, [id], { tipo: 'existente', grupoId }, false, 400)
    if (r.ok) {
      agg.total! += r.total ?? 0; agg.novos! += r.novos ?? 0; agg.jaExistiam! += r.jaExistiam ?? 0
      agg.atualizados! += r.atualizados ?? 0; agg.vinculados! += r.vinculados ?? 0
      agg.semIdentificador! += r.semIdentificador ?? 0; agg.semDetalhe! += r.semDetalhe ?? 0; agg.restante! += r.restante ?? 0
    }
  }
  revalidatePath('/admin/estudantes'); revalidatePath('/admin/grupos')
  return agg
}

// ── Import em segundo plano (job) ────────────────────────────────────────────
/** Agenda uma importação para rodar em segundo plano (worker → /api/cron/curseduca-jobs). */
export async function agendarImportacaoCurseduca(ids: number[], destino: DestinoImport, sincronizar = false): Promise<{ ok: boolean; jobId?: string; error?: string }> {
  if (!(await checkPermission('estudantes:create'))) return { ok: false, error: 'Sem permissão.' }
  const g = await ctx(); if (!g.ok) return { ok: false, error: g.error }
  if (!ids?.length) return { ok: false, error: 'Selecione ao menos um grupo.' }
  const svc = createAdminClient()
  const { data, error } = await svc
    .from('simulado_curseduca_jobs')
    .insert({ tenant_id: g.tenantId, status: 'pendente', grupos: ids, destino, sincronizar, criado_por: g.userId ?? null })
    .select('id')
    .single()
  if (error) {
    if (/relation|does not exist|schema cache|column/i.test(error.message)) return { ok: false, error: 'Rode a migration da tabela simulado_curseduca_jobs (SQL fornecido).' }
    return { ok: false, error: error.message }
  }
  return { ok: true, jobId: (data as any).id }
}

/** Status de um job de importação (para a UI acompanhar). */
export async function statusImportacaoCurseduca(jobId: string): Promise<{ ok: boolean; status?: string; resultado?: ResultadoImportCurseduca | null; erro?: string | null; error?: string }> {
  if (!(await checkPermission('estudantes:view')) && !(await checkPermission('estudantes:create'))) return { ok: false, error: 'Sem permissão.' }
  const access = await getCurrentAccess()
  if (!access.tenantId) return { ok: false, error: 'Tenant não resolvido.' }
  const svc = createAdminClient()
  const { data } = await svc.from('simulado_curseduca_jobs').select('status, resultado, erro').eq('id', jobId).eq('tenant_id', access.tenantId).maybeSingle()
  if (!data) return { ok: false, error: 'Job não encontrado.' }
  const d = data as any
  return { ok: true, status: d.status, resultado: d.resultado ?? null, erro: d.erro ?? null }
}

// ── Sincronização automática (regras de polling) ────────────────────────────
export type RegraSyncDTO = {
  id: string; grupos: number[]; destino: DestinoImport; sincronizar: boolean; intervalo_min: number
  ativo: boolean; ultima_execucao: string | null; ultimo_resultado: ResultadoImportCurseduca | null; grupoDestinoNome: string | null
}
const INTERVALOS_OK = new Set([15, 30, 60, 120, 240])

/** Lista as regras de sincronização automática do tenant (com nome do grupo de destino). */
export async function listarRegrasSync(): Promise<{ ok: boolean; error?: string; regras?: RegraSyncDTO[] }> {
  if (!(await checkPermission('estudantes:create'))) return { ok: false, error: 'Sem permissão.' }
  const access = await getCurrentAccess()
  if (!access.tenantId) return { ok: false, error: 'Tenant não resolvido.' }
  const svc = createAdminClient()
  try {
    const { data } = await svc.from('simulado_curseduca_sync').select('id, grupos, destino, sincronizar, intervalo_min, ativo, ultima_execucao, ultimo_resultado').eq('tenant_id', access.tenantId).order('created_at', { ascending: false })
    const rows = (data ?? []) as any[]
    const gids = [...new Set(rows.map((r) => r.destino?.grupoId).filter(Boolean))]
    const nomes = new Map<string, string>()
    if (gids.length) {
      const { data: gs } = await svc.from('simulado_grupos').select('id, nome').in('id', gids)
      for (const g of gs ?? []) nomes.set((g as any).id, (g as any).nome)
    }
    const regras: RegraSyncDTO[] = rows.map((r) => ({
      id: r.id, grupos: r.grupos ?? [], destino: r.destino ?? { tipo: 'nenhum' }, sincronizar: !!r.sincronizar,
      intervalo_min: r.intervalo_min ?? 30, ativo: !!r.ativo, ultima_execucao: r.ultima_execucao ?? null,
      ultimo_resultado: r.ultimo_resultado ?? null, grupoDestinoNome: r.destino?.grupoId ? (nomes.get(r.destino.grupoId) ?? null) : null,
    }))
    return { ok: true, regras }
  } catch {
    return { ok: false, error: 'Rode a migration da tabela simulado_curseduca_sync (SQL fornecido).' }
  }
}

/** Cria uma regra de sincronização automática. */
export async function criarRegraSync(grupos: number[], destino: DestinoImport, sincronizar: boolean, intervaloMin: number): Promise<{ ok: boolean; error?: string }> {
  if (!(await checkPermission('estudantes:create'))) return { ok: false, error: 'Sem permissão.' }
  const g = await ctx(); if (!g.ok) return { ok: false, error: g.error }
  if (!grupos?.length) return { ok: false, error: 'Selecione ao menos um grupo.' }
  if (destino.tipo === 'novo') return { ok: false, error: 'Sincronização automática só aceita destino “nenhum” ou grupo existente (não criar novo a cada ciclo).' }
  const intervalo = INTERVALOS_OK.has(intervaloMin) ? intervaloMin : 30
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_curseduca_sync').insert({
    tenant_id: g.tenantId, grupos, destino: { tipo: destino.tipo, grupoId: destino.grupoId }, sincronizar: destino.tipo === 'existente' && sincronizar,
    intervalo_min: intervalo, ativo: true, criado_por: g.userId ?? null,
  })
  if (error) {
    if (/relation|does not exist|schema cache|column/i.test(error.message)) return { ok: false, error: 'Rode a migration da tabela simulado_curseduca_sync (SQL fornecido).' }
    return { ok: false, error: error.message }
  }
  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_curseduca_sync', depois: { grupos, destino, intervalo } })
  revalidatePath('/admin/curseduca/sincronizacao')
  return { ok: true }
}

/** Estado da "sincronização simples" (card do Importar): ativo + intervalo da regra global. */
export async function getSyncSimples(): Promise<{ ok: boolean; ativo: boolean; intervaloMin: number }> {
  const access = await getCurrentAccess()
  if (!access.tenantId) return { ok: false, ativo: false, intervaloMin: 30 }
  const svc = createAdminClient()
  try {
    const { data } = await svc.from('simulado_curseduca_sync').select('ativo, intervalo_min').eq('tenant_id', access.tenantId).order('created_at', { ascending: true }).limit(1).maybeSingle()
    return { ok: true, ativo: !!(data as any)?.ativo, intervaloMin: (data as any)?.intervalo_min ?? 30 }
  } catch { return { ok: true, ativo: false, intervaloMin: 30 } }
}

/**
 * Card do Importar: liga/desliga a sincronização automática (reimporta os grupos no intervalo)
 * e define o intervalo. Mantém UMA regra "global" — destino 'nenhum', sincronizar=false
 * (só adiciona alunos novos, nunca remove). Substitui a UI de regras avançada (oculta por ora).
 */
export async function salvarSyncSimples(intervaloMin: number, ativo: boolean, grupos: number[]): Promise<{ ok: boolean; error?: string }> {
  if (!(await checkPermission('estudantes:create'))) return { ok: false, error: 'Sem permissão.' }
  const access = await getCurrentAccess()
  if (!access.tenantId) return { ok: false, error: 'Tenant não resolvido.' }
  const intervalo = INTERVALOS_OK.has(intervaloMin) ? intervaloMin : 30
  const svc = createAdminClient()
  // TRAVA (incidente 17k): a sync só cobre grupos VINCULADOS — logo o nº de grupos jamais
  // pode exceder o nº de grupos do sistema. Bloqueia qualquer tentativa de sincronizar a
  // conta inteira da Curseduca (~200 grupos), mesmo por um caminho fora da UI.
  if (ativo && grupos.length) {
    const { count } = await svc.from('simulado_grupos').select('id', { count: 'exact', head: true }).eq('tenant_id', access.tenantId).eq('deletado', false)
    const max = Math.max(1, count ?? 0)
    if (grupos.length > max) return { ok: false, error: `A sincronização automática só cobre grupos vinculados (máx. ${max} = nº de grupos do sistema). Você tentou sincronizar ${grupos.length}. Crie/renomeie grupos do sistema com o mesmo nome, ou reduza a seleção.` }
  }
  try {
    const { data: existentes } = await svc.from('simulado_curseduca_sync').select('id').eq('tenant_id', access.tenantId).order('created_at', { ascending: true })
    const lista = (existentes ?? []) as any[]
    if (lista.length) {
      await svc.from('simulado_curseduca_sync').update({ intervalo_min: intervalo, ativo, grupos, destino: { tipo: 'nenhum' }, sincronizar: false }).eq('id', lista[0].id).eq('tenant_id', access.tenantId)
      if (lista.length > 1) await svc.from('simulado_curseduca_sync').delete().in('id', lista.slice(1).map((r) => r.id)).eq('tenant_id', access.tenantId)
    } else if (ativo) {
      if (!grupos.length) return { ok: false, error: 'Carregue os grupos antes de ativar.' }
      await svc.from('simulado_curseduca_sync').insert({ tenant_id: access.tenantId, grupos, destino: { tipo: 'nenhum' }, sincronizar: false, intervalo_min: intervalo, ativo: true, criado_por: access.userId ?? null })
    }
    revalidatePath('/admin/integracoes/curseduca')
    return { ok: true }
  } catch (e: any) {
    if (/relation|does not exist|schema cache|column/i.test(e?.message ?? '')) return { ok: false, error: 'Rode a migration da tabela simulado_curseduca_sync.' }
    return { ok: false, error: e?.message ?? 'Erro ao salvar.' }
  }
}

export async function toggleRegraSync(id: string, ativo: boolean): Promise<{ ok: boolean; error?: string }> {
  if (!(await checkPermission('estudantes:create'))) return { ok: false, error: 'Sem permissão.' }
  const access = await getCurrentAccess()
  if (!access.tenantId) return { ok: false, error: 'Tenant não resolvido.' }
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_curseduca_sync').update({ ativo }).eq('id', id).eq('tenant_id', access.tenantId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/curseduca/sincronizacao')
  return { ok: true }
}

export async function excluirRegraSync(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!(await checkPermission('estudantes:create'))) return { ok: false, error: 'Sem permissão.' }
  const access = await getCurrentAccess()
  if (!access.tenantId) return { ok: false, error: 'Tenant não resolvido.' }
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_curseduca_sync').delete().eq('id', id).eq('tenant_id', access.tenantId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/curseduca/sincronizacao')
  return { ok: true }
}

/** Roda uma regra AGORA (manual), independentemente do intervalo. */
export async function rodarRegraSyncAgora(id: string): Promise<{ ok: boolean; error?: string; resultado?: ResultadoImportCurseduca }> {
  if (!(await checkPermission('estudantes:create'))) return { ok: false, error: 'Sem permissão.' }
  const g = await ctx(); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const { data } = await svc.from('simulado_curseduca_sync').select('grupos, destino, sincronizar').eq('id', id).eq('tenant_id', g.tenantId).maybeSingle()
  if (!data) return { ok: false, error: 'Regra não encontrada.' }
  const r = data as any
  const resultado = await executarImport({ tenantId: g.tenantId, cfg: g.cfg }, r.grupos ?? [], r.destino ?? { tipo: 'nenhum' }, !!r.sincronizar, Number.MAX_SAFE_INTEGER)
  await svc.from('simulado_curseduca_sync').update({ ultima_execucao: new Date().toISOString(), ultimo_resultado: resultado }).eq('id', id).eq('tenant_id', g.tenantId)
  revalidatePath('/admin/curseduca/sincronizacao'); revalidatePath('/admin/estudantes')
  return { ok: true, resultado }
}
