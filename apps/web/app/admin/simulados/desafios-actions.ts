'use server'

// Server actions dos DESAFIOS de simulados (maratona). O desafio é uma PASTA real
// (simulado_pastas, folder_area='maratona') — assim reusamos os componentes da plataforma
// (ModuloAcesso por pastaId, RankingAdmin por moduloId) exatamente como no JurisClub.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { checkPermission } from '@/lib/auth/permissions'
import { hospedarBase64 } from '@/lib/storage/hospedar-base64'
import { resolverVisualSimulados } from '@/lib/aluno/simulado-visual'
import { normalizarCarimbos, normalizarConquistasModulo, type CarimboDef, type ModuloConquistaDef } from '@/lib/leitura/carimbos'
import type { SimuladoCard } from '@/components/admin/simulados-board'
import { criarPastaFolder } from '@/app/admin/banco-questoes/actions'
import { MARATONA, type MaratonaConfig } from '@/lib/maratona/config'
import { normalizarRegulamento, type RegulamentoConfig } from '@/lib/leitura/regulamento'
import type { RankingLeituraItem } from '@/lib/leitura/ranking'

// Config do desafio (persistida em desafio_jogo.config). Além da MaratonaConfig que alimenta o card do
// aluno, guarda o estado do editor de capa (original + recorte) p/ reajustar de onde parou (não-destrutivo).
/** Uma ETAPA da maratona = um simulado colocado numa ÁREA do percurso. A maratona tem 3 áreas de simulado
 *  (os 3 checkpoints); `slot` (1,2,3) define EM QUAL área o link/acesso do simulado aparece. `slot` ausente
 *  = não incluído no percurso (fica só na ordem como fallback). Data/liberação/regras vêm do PRÓPRIO
 *  simulado. Persistida em `config.etapas` (jsonb, sem migração). */
export type EtapaMaratona = {
  simuladoId: string
  /** Área do percurso (1, 2 ou 3) onde este simulado aparece. Ausente = não incluído. */
  slot?: number
  /** Nome EXIBIDO na maratona (dropdown/percurso). Texto é SEMPRE preservado (mesmo com a opção desligada),
   *  pra não perder o que foi digitado; `rotuloOn` diz se ele deve ser APLICADO. Vazio = usa o nome real. */
  rotulo?: string
  /** Aplica o `rotulo` (nome personalizado) na maratona? false = usa o nome real, mas mantém o texto salvo.
   *  Ausente (dados antigos) = aplica se houver texto (retrocompat). */
  rotuloOn?: boolean
  /** Tempo MÍNIMO de permanência NO SIMULADO, em SEGUNDOS, para o aluno ganhar o CHECK-IN (selo) desta etapa.
   *  O aluno precisa ficar ao menos este tempo (ex.: 1200 = 20min). 0/ausente = sem mínimo (qualquer
   *  encerramento já dá o check). O tempo real do aluno é o que conta no "tempo decorrido". */
  segMin?: number
}

export type ConfigDesafioSim = MaratonaConfig & {
  lancada: boolean
  capaOrig?: string | null
  capaCrop?: { zoom: number; cx: number; cy: number } | null
  // Vínculo com o conteúdo real: quando `*Auto`, o card usa a contagem REAL (simulados na pasta /
  // alunos com acesso) em vez do número fixo. Default = automático (reflete o que existe de verdade).
  qtdSimuladosAuto?: boolean
  inscritosAuto?: boolean
  /** Ordem + organização das etapas da maratona (ordem do array = sequência). */
  etapas?: EtapaMaratona[]
  /** Visibilidade na HOME do aluno (default = OCULTO; o desafio vive na própria área). Quando ligado,
   *  a PASTA do desafio aparece na área de Pastas e/ou os simulados dele aparecem nos Recentes. */
  mostrarNasPastas?: boolean
  mostrarNosRecentes?: boolean
}

export type ContagemDesafio = { simulados: number; inscritos: number }
/** Contagens REAIS do desafio: simulados vinculados à pasta + alunos com acesso (p/ vincular ao card). */
export async function contarDesafio(pastaId: string): Promise<ContagemDesafio> {
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return { simulados: 0, inscritos: 0 }
  const svc = createAdminClient()
  let simulados = 0, inscritos = 0
  try {
    const { count } = await svc.from('simulado_simulados').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('pasta_id', pastaId)
    simulados = count ?? 0
  } catch { /* coluna pasta_id ausente → 0 */ }
  try {
    const { count } = await svc.from('simulado_pasta_estudantes').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('pasta_id', pastaId)
    inscritos = count ?? 0
  } catch { /* tabela/coluna ausente → 0 */ }
  return { simulados, inscritos }
}

/** Lê a config do desafio (desafio_jogo.config da pasta) + defaults da MARATONA. Editável no admin. */
export async function lerConfigMaratona(pastaId: string): Promise<ConfigDesafioSim> {
  const base: ConfigDesafioSim = { ...MARATONA, lancada: true }
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return base
  try {
    const svc = createAdminClient()
    const { data } = await svc.from('simulado_pastas').select('desafio_jogo').eq('id', pastaId).eq('tenant_id', tenantId).maybeSingle()
    const cfg = (data as any)?.desafio_jogo?.config
    return { ...base, ...(cfg && typeof cfg === 'object' ? cfg : {}) }
  } catch { return base }
}

/** Grava a config (MERGE em desafio_jogo.config da pasta). Toda a edição do bloco passa por aqui.
 *  Imagens base64 (capa/original) são hospedadas no storage antes de gravar — nunca infla o jsonb. */
export async function salvarConfigMaratona(pastaId: string, patch: Partial<ConfigDesafioSim>): Promise<{ ok: boolean; error?: string }> {
  if (!(await checkPermission('simulados:update'))) return { ok: false, error: 'Sem permissão.' }
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return { ok: false, error: 'Sem tenant.' }
  const svc = createAdminClient()
  const p: Partial<ConfigDesafioSim> = { ...patch }
  if (typeof p.capaUrl === 'string' && p.capaUrl.startsWith('data:image')) p.capaUrl = (await hospedarBase64(p.capaUrl, svc, { tenantId })) ?? p.capaUrl
  if (typeof p.capaOrig === 'string' && p.capaOrig.startsWith('data:image')) p.capaOrig = (await hospedarBase64(p.capaOrig, svc, { tenantId })) ?? p.capaOrig
  const { data } = await svc.from('simulado_pastas').select('desafio_jogo').eq('id', pastaId).eq('tenant_id', tenantId).maybeSingle()
  const dj = ((data as any)?.desafio_jogo && typeof (data as any).desafio_jogo === 'object') ? { ...(data as any).desafio_jogo } : {}
  dj.config = { ...(dj.config && typeof dj.config === 'object' ? dj.config : {}), ...p }
  const { error } = await svc.from('simulado_pastas').update({ desafio_jogo: dj }).eq('id', pastaId).eq('tenant_id', tenantId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/simulados') // reflete capa/título novos no board e nos diálogos de mover/copiar
  return { ok: true }
}

/** Salva o REGULAMENTO do desafio (merge em desafio_jogo.config.regulamento). Mesma assinatura do
 *  salvarRegulamentoModulo (Lei Seca) p/ injetar no ModuloRegulamentoForm. PDF/vídeo/descrição. */
export async function salvarRegulamentoDesafio(pastaId: string, cfg: RegulamentoConfig): Promise<{ ok: boolean; error?: string }> {
  return await salvarConfigMaratona(pastaId, { regulamento: normalizarRegulamento(cfg) })
}

/** Garante a pasta real do desafio Maratona (cria na 1ª vez). Retorna o id p/ wirar os componentes reais. */
export async function garantirDesafioMaratona(): Promise<{ ok: boolean; id?: string; error?: string }> {
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return { ok: false, error: 'Sem tenant.' }
  const svc = createAdminClient()
  try {
    const { data } = await svc.from('simulado_pastas').select('id').eq('tenant_id', tenantId).eq('folder_area', 'maratona').order('created_at', { ascending: true }).limit(1)
    if (data && data.length) return { ok: true, id: (data[0] as { id: string }).id }
  } catch { /* folder_area ausente → cai na criação (criarPastaFolder é tolerante) */ }
  return await criarPastaFolder(`${MARATONA.titulo} ${MARATONA.destaque}`, null, 'maratona')
}

/** Simulados REAIS vinculados ao desafio (pasta), no shape do card do board (ticket). */
export async function listarSimuladosDesafio(pastaId: string): Promise<SimuladoCard[]> {
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return []
  const svc = createAdminClient()
  const cols = 'id, titulo, status, data_inicio, data_fim, modo_aplicacao, tempo_limite_min, embed_token, created_at, regras, pasta_id'
  let rows: any[] = []
  try {
    const { data } = await svc.from('simulado_simulados').select(cols)
      .eq('tenant_id', tenantId).eq('pasta_id', pastaId).eq('deletado', false).is('owner_estudante_id', null)
      .order('created_at', { ascending: false }).order('id', { ascending: true })
    rows = data ?? []
  } catch { return [] }
  const vis = await resolverVisualSimulados(svc, rows.map((r) => ({ id: r.id, regras: r.regras })))
  return rows.map((r) => ({ ...r, pasta_id: r.pasta_id ?? null, vis: vis.get(r.id) ?? null })) as SimuladoCard[]
}

// ── SELOS do desafio (medalhas): Conquistas (ícone+condição) + Carimbos (imagem+condição). Reusa a
//    MESMA aba do Lei Seca (ModuloMedalhasForm), gravando nas colunas conquistas_def/carimbos_def da
//    pasta do desafio. Permissão simulados:update (não leitura). ───────────────────────────────────
/** Lê as conquistas + carimbos (selos) definidos no desafio. Tolerante a colunas ausentes. */
export async function carregarSelosDesafio(pastaId: string): Promise<{ conquistas: ModuloConquistaDef[]; carimbos: CarimboDef[] }> {
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return { conquistas: [], carimbos: [] }
  const svc = createAdminClient()
  try {
    const { data } = await svc.from('simulado_pastas').select('conquistas_def, carimbos_def').eq('id', pastaId).eq('tenant_id', tenantId).maybeSingle()
    return { conquistas: normalizarConquistasModulo((data as any)?.conquistas_def), carimbos: normalizarCarimbos((data as any)?.carimbos_def) }
  } catch { return { conquistas: [], carimbos: [] } }
}

/** Salva as CONQUISTAS do desafio. Mesma assinatura de salvarConquistasModulo (p/ injetar no form). */
export async function salvarConquistasDesafio(pastaId: string, conquistas: ModuloConquistaDef[]): Promise<{ ok: boolean; conquistas?: ModuloConquistaDef[]; error?: string }> {
  if (!(await checkPermission('simulados:update'))) return { ok: false, error: 'Sem permissão.' }
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return { ok: false, error: 'Sem tenant.' }
  const svc = createAdminClient()
  const norm = normalizarConquistasModulo(conquistas)
  const { error } = await svc.from('simulado_pastas').update({ conquistas_def: norm }).eq('id', pastaId).eq('tenant_id', tenantId)
  if (error) return { ok: false, error: /conquistas_def|column|schema cache/i.test(error.message) ? 'Migração pendente (conquistas_def).' : error.message }
  return { ok: true, conquistas: norm }
}

/** Salva os CARIMBOS do desafio. Imagens base64 vão pro storage (hospedarBase64). */
export async function salvarCarimbosDesafio(pastaId: string, carimbos: CarimboDef[]): Promise<{ ok: boolean; carimbos?: CarimboDef[]; error?: string }> {
  if (!(await checkPermission('simulados:update'))) return { ok: false, error: 'Sem permissão.' }
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return { ok: false, error: 'Sem tenant.' }
  const svc = createAdminClient()
  const norm = normalizarCarimbos(carimbos)
  for (const c of norm) {
    if (c.url && c.url.startsWith('data:')) { try { c.url = await hospedarBase64(c.url, svc, { tenantId }) } catch { c.url = null } }
  }
  const { error } = await svc.from('simulado_pastas').update({ carimbos_def: norm }).eq('id', pastaId).eq('tenant_id', tenantId)
  if (error) return { ok: false, error: /carimbos_def|column|schema cache/i.test(error.message) ? 'Migração pendente (carimbos_def).' : error.message }
  return { ok: true, carimbos: norm }
}

/** Simulados que NÃO estão neste desafio (p/ "Adicionar existente"). */
export async function listarSimuladosForaDesafio(pastaId: string): Promise<{ id: string; titulo: string; status: string }[]> {
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return []
  const svc = createAdminClient()
  try {
    const { data } = await svc.from('simulado_simulados').select('id, titulo, status, pasta_id')
      .eq('tenant_id', tenantId).eq('deletado', false).is('owner_estudante_id', null)
      .order('created_at', { ascending: false }).order('id', { ascending: true })
    return (data ?? []).filter((s: any) => (s.pasta_id ?? null) !== pastaId).map((s: any) => ({ id: s.id, titulo: s.titulo, status: s.status }))
  } catch { return [] }
}

/**
 * Ranking do desafio p/ o RankingAdmin. FASE 1: vazio (a jornada ainda não vincula simulados reais).
 * FASE 2: agrega os N simulados vinculados (reusa o motor do relatório). Assinatura = loader do RankingAdmin.
 */
export async function obterRankingMaratona(_moduloId: string, _fresco = false): Promise<{ ok: boolean; itens?: RankingLeituraItem[]; error?: string }> {
  return { ok: true, itens: [] }
}
