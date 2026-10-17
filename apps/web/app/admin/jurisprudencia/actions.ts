'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { criarPastaFolder } from '@/app/admin/banco-questoes/actions'
import { criarDocumento } from '@/app/admin/leitura/actions'
import { hospedarAudioBase64, hospedarBase64 } from '@/lib/storage/hospedar-base64'
import type { DesafioJogo } from '@/lib/jurisprudencia/conteudo'
import { carregarRankingJuris, invalidarRankingJuris } from '@/lib/jurisprudencia/ranking'
import { carregarRelatorioJuris } from '@/lib/jurisprudencia/relatorio'
import { lerDesafioJogo, preencherTesesPorQuiz } from '@/lib/jurisprudencia/conteudo'
import { diasAtivosPorAluno } from '@/lib/jurisprudencia/sequencia'
import { calcularSequencia } from '@/lib/leitura/sequencia'
import type { RankingLeituraItem } from '@/lib/leitura/ranking'
import type { RelatorioModulo } from '@/lib/leitura/relatorio'
import type { DetalheRankingAluno, DetalheAulaRanking } from '@/app/admin/leitura/actions'

/**
 * Admin do Desafio de Jurisprudência (JurisClub). O desafio é uma PASTA
 * (simulado_pastas, folder_area='jurisprudencia'); todo o conteúdo do jogo mora no
 * jsonb `desafio_jogo` = { config, materias, final, dias, imagens }. Cada ação faz MERGE
 * nesse jsonb (preserva as demais chaves).
 */

async function guard(perm: string) {
  if (!(await checkPermission(perm))) return { ok: false as const, error: 'Sem permissão.' }
  const access = await getCurrentAccess()
  if (!access.tenantId) return { ok: false as const, error: 'Tenant não resolvido.' }
  return { ok: true as const, tenantId: access.tenantId, atorId: access.userId ?? null }
}

/** Ranking do admin do desafio (polling "ao vivo" do RankingAdmin). `fresco` invalida o cache antes.
 *  Default fresco=TRUE: o poll "ao vivo" do admin SEMPRE recalcula (instantâneo), sem esperar o TTL. */
export async function obterRankingJuris(desafioId: string, fresco = true): Promise<{ ok: boolean; itens?: RankingLeituraItem[]; error?: string }> {
  const g = await guard('leitura:view')
  if (!g.ok) return { ok: false, error: g.error }
  try {
    if (fresco) await invalidarRankingJuris(g.tenantId, desafioId)
    const r = await carregarRankingJuris(desafioId, g.tenantId)
    return { ok: true, itens: r.itens }
  } catch (e: any) { return { ok: false, error: e?.message ?? 'Falha ao carregar o ranking.' } }
}

/** Relatório do desafio — carregado SOB DEMANDA pelo cliente (não pendura o render). Timeout 45s. */
export async function obterRelatorioJuris(desafioId: string): Promise<{ ok: boolean; rel?: RelatorioModulo; error?: string }> {
  const g = await guard('leitura:view'); if (!g.ok) return { ok: false, error: g.error }
  try {
    const rel = await Promise.race([
      carregarRelatorioJuris(desafioId, g.tenantId),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('O relatório demorou demais para calcular.')), 45_000)),
    ])
    return { ok: true, rel }
  } catch (e: any) { return { ok: false, error: e?.message ?? 'Falha ao carregar o relatório.' } }
}

/**
 * Detalhe do aluno no ranking do desafio (modal dos 3 pontinhos — Visão geral + Sequência). Mesmo
 * shape do Lei Seca (`DetalheRankingAluno`) para reusar o `DetalheAlunoModal`. "Aulas feitas" = DIAS
 * DOMINADOS (sem horários de leitura/quiz — o arcade não registra duração); `diasAuto` = dias de
 * atividade do ledger (p/ o calendário da sequência); overrides = ajuste manual do suporte.
 */
export async function detalheRankingAlunoJuris(desafioId: string, estudanteId: string): Promise<{ ok: boolean; detalhe?: DetalheRankingAluno; error?: string }> {
  const g = await guard('leitura:view'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const dj = await lerDesafioJogo(svc, desafioId)
  const diasObj = dj?.dias && typeof dj.dias === 'object' ? (dj.dias as Record<string, any>) : {}
  const diasComTeses = await preencherTesesPorQuiz(svc, diasObj).catch(() => diasObj)
  const diasChaves = Object.keys(diasComTeses)
  const tesesDoDia = (k: string): number => { const t = diasComTeses[k]?.teses; return Array.isArray(t) ? t.length : 0 }
  const diaCompleto = (dom: any, k: string): boolean => { const arr = dom?.[k]; const n = tesesDoDia(k); return n > 0 && Array.isArray(arr) && arr.length >= n }
  const tituloDia = (k: string): string => (diasComTeses[k]?.titulo || '').toString().trim() || `Dia ${k}`

  const { data: prog } = await svc.from('simulado_jurisprudencia_progresso').select('dom, best, atualizado_em').eq('desafio_id', desafioId).eq('estudante_id', estudanteId).maybeSingle()
  const dom = (prog as any)?.dom ?? {}
  const best = (prog as any)?.best ?? {}

  const aulas: DetalheAulaRanking[] = []
  let pontosTotal = 0
  for (const k of diasChaves) {
    // Dia final/selo (0 teses próprias) NÃO soma pontos — senão duplica (alinha ao ranking/arcade).
    if (tesesDoDia(k) <= 0) continue
    const pts = Math.max(0, Number(best[k]) || 0)
    pontosTotal += pts
    if (diaCompleto(dom, k)) {
      const n = tesesDoDia(k)
      aulas.push({ titulo: tituloDia(k), data: null, pontos: pts, leituraInicio: null, leituraFim: null, leituraTempoSeg: null, quizInicio: null, quizFim: null, tentativas: 0, subtitulo: `${n} tese${n > 1 ? 's' : ''} dominada${n > 1 ? 's' : ''}` })
    }
  }

  const diasMap = await diasAtivosPorAluno(svc, g.tenantId, desafioId, new Map([[estudanteId, (prog as any)?.atualizado_em ?? null]]), [estudanteId]).catch(() => new Map<string, Set<string>>())
  const diasAuto = [...(diasMap.get(estudanteId) ?? new Set<string>())].sort()

  let overrides: Record<string, boolean> = {}
  try {
    const { data: aj } = await svc.from('simulado_jurisprudencia_sequencia_ajuste').select('overrides').eq('tenant_id', g.tenantId).eq('estudante_id', estudanteId).eq('desafio_id', desafioId).maybeSingle()
    if (aj && (aj as any).overrides && typeof (aj as any).overrides === 'object') overrides = (aj as any).overrides as Record<string, boolean>
  } catch { /* migração pendente → sem ajuste */ }

  const tz = 'America/Sao_Paulo'
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: tz })
  const ontem = new Date(Date.parse(hoje + 'T00:00:00Z') - 86_400_000).toISOString().slice(0, 10)
  const seq = calcularSequencia(diasAuto, overrides, hoje, ontem)

  const { data: est } = await svc.from('simulado_estudantes').select('nome, email').eq('id', estudanteId).eq('tenant_id', g.tenantId).maybeSingle()

  return {
    ok: true,
    detalhe: {
      nome: (est as any)?.nome ?? 'Aluno', email: (est as any)?.email ?? null,
      streakAtual: seq.streakAtual, streakMaior: seq.streakMaior, ultimoDiaAtivo: diasAuto[diasAuto.length - 1] ?? null,
      totalAulas: diasChaves.length, aulasConcluidas: aulas.length, pontosTotal, aulas,
      tz, hoje, diasAuto, overrides, diaAulas: {},
    },
  }
}

/** Salva o ajuste manual da sequência do aluno no desafio (calendário do suporte). Upsert por
 *  (tenant, aluno, desafio) + invalida o cache do ranking. Tolerante à migração ausente. */
export async function salvarSequenciaAjusteJuris(desafioId: string, estudanteId: string, overrides: Record<string, boolean>): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  const limpo: Record<string, boolean> = {}
  for (const [k, v] of Object.entries(overrides ?? {})) if (/^\d{4}-\d{2}-\d{2}$/.test(k)) limpo[k] = !!v
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_jurisprudencia_sequencia_ajuste').upsert(
    { tenant_id: g.tenantId, estudante_id: estudanteId, desafio_id: desafioId, overrides: limpo, atualizado_por: g.atorId, atualizado_em: new Date().toISOString() },
    { onConflict: 'tenant_id,estudante_id,desafio_id' },
  )
  if (error) {
    if (/does not exist|schema cache|42P01/i.test(error.message)) return { ok: false, error: 'Aplique a migração 20261013000003_juris_sequencia_ajuste.' }
    return { ok: false, error: error.message }
  }
  await invalidarRankingJuris(g.tenantId, desafioId).catch(() => {})
  revalidatePath('/admin/jurisprudencia')
  return { ok: true }
}

/** Lê o desafio_jogo atual da pasta (p/ merge). Retorna {} se vazio; null se a pasta não é válida. */
async function lerJogoParaMerge(
  svc: ReturnType<typeof createAdminClient>,
  tenantId: string,
  id: string,
): Promise<DesafioJogo | null> {
  const { data } = await svc
    .from('simulado_pastas')
    .select('desafio_jogo, folder_area')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (!data || (data as any).folder_area !== 'jurisprudencia') return null
  const dj = (data as any).desafio_jogo
  return dj && typeof dj === 'object' ? (dj as DesafioJogo) : {}
}

/** Grava o desafio_jogo mesclado + audita + revalida. */
async function salvarMerge(
  tenantId: string,
  atorId: string | null,
  id: string,
  patch: Partial<DesafioJogo>,
): Promise<{ ok: boolean; error?: string }> {
  const svc = createAdminClient()
  const atual = await lerJogoParaMerge(svc, tenantId, id)
  if (atual === null) return { ok: false, error: 'Desafio não encontrado.' }
  const merged: DesafioJogo = { ...atual, ...patch }
  const { error } = await svc
    .from('simulado_pastas')
    .update({ desafio_jogo: merged })
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .eq('folder_area', 'jurisprudencia')
  if (error) return { ok: false, error: /desafio_jogo|column|schema cache/i.test(error.message) ? 'Aplique a migração 20260929000005 (desafio_jogo).' : error.message }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_pastas', entidadeId: id, depois: { desafio_jogo: Object.keys(patch) }, atorId, tenantId })
  revalidatePath('/admin/jurisprudencia')
  return { ok: true }
}

export interface DesafioListagem { id: string; nome: string; imagens: Record<string, any> }

/** Lista os desafios (pastas jurisprudencia) do tenant. */
export async function listarDesafios(): Promise<DesafioListagem[]> {
  const g = await guard('leitura:view'); if (!g.ok) return []
  const svc = createAdminClient()
  const { data } = await svc
    .from('simulado_pastas')
    .select('id, nome, desafio_jogo')
    .eq('tenant_id', g.tenantId)
    .eq('folder_area', 'jurisprudencia')
    .eq('is_folder', true)
    .eq('deletado', false)
    .order('nome', { ascending: true })
  return ((data ?? []) as any[]).map((p) => ({
    id: p.id,
    nome: p.nome,
    imagens: (p.desafio_jogo && typeof p.desafio_jogo === 'object' ? (p.desafio_jogo.imagens ?? {}) : {}) as Record<string, any>,
  }))
}

/** Cria um novo desafio (pasta jurisprudencia) — reusa criarPastaFolder. */
export async function criarDesafio(nome: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  const g = await guard('leitura:create'); if (!g.ok) return { ok: false, error: g.error }
  const r = await criarPastaFolder(nome, null, 'jurisprudencia')
  if (r.ok) revalidatePath('/admin/jurisprudencia')
  return r
}

/** Renomeia o desafio (nome da pasta jurisprudencia). */
export async function renomearDesafio(id: string, nome: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  const n = (nome ?? '').trim(); if (!n) return { ok: false, error: 'Informe um nome.' }
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_pastas').update({ nome: n }).eq('id', id).eq('tenant_id', g.tenantId).eq('folder_area', 'jurisprudencia')
  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/jurisprudencia')
  return { ok: true }
}

/** Lê o conteúdo completo do desafio p/ o editor admin. */
export async function lerDesafio(id: string): Promise<{ ok: boolean; desafio?: Required<DesafioJogo>; error?: string }> {
  const g = await guard('leitura:view'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const dj = await lerJogoParaMerge(svc, g.tenantId, id)
  if (dj === null) return { ok: false, error: 'Desafio não encontrado.' }
  return {
    ok: true,
    desafio: {
      config: dj.config ?? {},
      materias: Array.isArray(dj.materias) ? dj.materias : [],
      final: dj.final ?? null,
      dias: dj.dias && typeof dj.dias === 'object' ? dj.dias : {},
      imagens: dj.imagens && typeof dj.imagens === 'object' ? dj.imagens : {},
      aparencia: dj.aparencia && typeof dj.aparencia === 'object' ? dj.aparencia : {},
    } as Required<DesafioJogo>,
  }
}

/** Salva a config do jogo (liberação, vidas, tempo, pontos, storageKey…). */
export async function salvarConfigDesafio(id: string, config: any): Promise<{ ok: boolean; error?: string; musicaFundo?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  const cfg = config && typeof config === 'object' ? { ...config } : {}
  // Música de fundo importada (data:audio base64) → sobe pro storage (bucket pdfs aceita áudio) e guarda
  // só a URL (não incha o banco). Se nenhum bucket aceitar, mantém base64 (toca embutido).
  if (typeof cfg.musicaFundo === 'string' && cfg.musicaFundo.startsWith('data:audio')) {
    cfg.musicaFundo = (await hospedarAudioBase64(cfg.musicaFundo, createAdminClient(), { tenantId: g.tenantId, criadoPor: g.atorId })) ?? ''
  }
  const r = await salvarMerge(g.tenantId, g.atorId, id, { config: cfg })
  return r.ok ? { ...r, musicaFundo: cfg.musicaFundo ?? '' } : r
}

/** Salva as matérias + o selo final. */
export async function salvarMateriasDesafio(id: string, materias: any[], final: any): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  return salvarMerge(g.tenantId, g.atorId, id, { materias: Array.isArray(materias) ? materias : [], final: final ?? null })
}

// Estados de publicação de um dia (espelha o modelo da Leitura/Lei Seca).
export type DiaEstado = 'publicada' | 'visualizavel' | 'rascunho'
type DiaPub = { estado?: DiaEstado; publicarEm?: string | null }
// `documento_id` liga o dia ao documento de LEITURA (simulado_documentos) que complementa o quiz do arcade.
type DiaJogo = { titulo?: string; teses?: any[]; materia?: string | null; ordem?: number; pub?: DiaPub; documento_id?: string | null }

const diasObj = (atual: DesafioJogo): Record<string, DiaJogo> => ({ ...(atual.dias && typeof atual.dias === 'object' ? atual.dias : {}) }) as any
// Ordena as chaves de dias por .ordem (fallback: chave numérica) — a ordem de exibição.
function ordenarChaves(dias: Record<string, DiaJogo>): string[] {
  return Object.keys(dias).sort((a, b) => ((dias[a]?.ordem ?? Number(a)) - (dias[b]?.ordem ?? Number(b))) || (Number(a) - Number(b)))
}

/** Salva um dia (título + teses + matéria). PRESERVA ordem/pub existentes. numeroDia é a chave em `dias`. */
export async function salvarDiaDesafio(
  id: string,
  numeroDia: number | string,
  dia: { titulo: string; teses: any[]; materia?: string | null },
): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const atual = await lerJogoParaMerge(svc, g.tenantId, id)
  if (atual === null) return { ok: false, error: 'Desafio não encontrado.' }
  const chave = String(Number(numeroDia))
  const dias = diasObj(atual)
  const prev = dias[chave] ?? {}
  dias[chave] = {
    ...prev,
    titulo: dia?.titulo ?? '',
    teses: Array.isArray(dia?.teses) ? dia.teses : [],
    materia: dia?.materia !== undefined ? dia.materia : (prev.materia ?? null),
  }
  return salvarMerge(g.tenantId, g.atorId, id, { dias })
}

/** Renomeia APENAS o título de um dia — preserva teses/matéria/ordem/pub/documento. numeroDia = chave em `dias`. */
export async function renomearDiaDesafio(id: string, numeroDia: number | string, titulo: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const atual = await lerJogoParaMerge(svc, g.tenantId, id)
  if (atual === null) return { ok: false, error: 'Desafio não encontrado.' }
  const chave = String(Number(numeroDia))
  const dias = diasObj(atual)
  if (!(chave in dias)) return { ok: false, error: 'Dia não encontrado.' }
  dias[chave] = { ...dias[chave], titulo: (titulo ?? '').toString().slice(0, 200) }
  return salvarMerge(g.tenantId, g.atorId, id, { dias })
}

/** Cria um novo dia (próximo slot livre; cap de 15 por causa do mapa do labirinto). Começa em rascunho. */
export async function criarDiaDesafio(id: string): Promise<{ ok: boolean; error?: string; chave?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const atual = await lerJogoParaMerge(svc, g.tenantId, id)
  if (atual === null) return { ok: false, error: 'Desafio não encontrado.' }
  const dias = diasObj(atual)
  const keys = Object.keys(dias).map(Number).filter((k) => !isNaN(k))
  if (keys.length >= 15) return { ok: false, error: 'Máximo de 15 dias (limite do mapa do jogo).' }
  const chave = String((keys.length ? Math.max(...keys) : 0) + 1)
  dias[chave] = { titulo: '', teses: [], materia: null, ordem: keys.length, pub: { estado: 'rascunho', publicarEm: null } }
  const r = await salvarMerge(g.tenantId, g.atorId, id, { dias })
  return r.ok ? { ok: true, chave } : r
}

/** Exclui um dia (remove a chave). Reindexa `ordem` dos restantes; a chave estável NÃO é reusada. */
export async function excluirDiaDesafio(id: string, numeroDia: number | string): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const atual = await lerJogoParaMerge(svc, g.tenantId, id)
  if (atual === null) return { ok: false, error: 'Desafio não encontrado.' }
  const dias = diasObj(atual)
  const chave = String(Number(numeroDia))
  if (!(chave in dias)) return { ok: false, error: 'Dia não encontrado.' }
  delete dias[chave]
  ordenarChaves(dias).forEach((k, i) => { dias[k] = { ...dias[k], ordem: i } })
  return salvarMerge(g.tenantId, g.atorId, id, { dias })
}

/** Reordena os dias: `chaves` na nova ordem → grava `ordem` por índice (chaves estáveis preservam o progresso). */
export async function reordenarDiasDesafio(id: string, chaves: (number | string)[]): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const atual = await lerJogoParaMerge(svc, g.tenantId, id)
  if (atual === null) return { ok: false, error: 'Desafio não encontrado.' }
  const dias = diasObj(atual)
  chaves.map(String).forEach((k, i) => { if (dias[k]) dias[k] = { ...dias[k], ordem: i } })
  return salvarMerge(g.tenantId, g.atorId, id, { dias })
}

/** Define a publicação (estado/agendamento) de um ou vários dias de uma vez. */
export async function definirPublicacaoDiasDesafio(
  id: string,
  numerosDia: (number | string)[],
  patch: { estado: DiaEstado; publicarEm?: string | null },
): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const atual = await lerJogoParaMerge(svc, g.tenantId, id)
  if (atual === null) return { ok: false, error: 'Desafio não encontrado.' }
  const dias = diasObj(atual)
  const pub: DiaPub = { estado: patch.estado, publicarEm: patch.publicarEm ?? null }
  for (const n of numerosDia.map(String)) if (dias[n]) dias[n] = { ...dias[n], pub }
  return salvarMerge(g.tenantId, g.atorId, id, { dias })
}

/**
 * Garante o documento de LEITURA do dia (cria vinculado à pasta do desafio se ainda não existir) e
 * devolve o id para abrir o editor de conteúdo da Lei Seca (`/admin/leitura/<id>`). A leitura
 * COMPLEMENTA o quiz (teses) do arcade; o aluno lê e só então libera o quiz daquele dia.
 */
export async function editarLeituraDia(id: string, numeroDia: number | string): Promise<{ ok: boolean; documentoId?: string; error?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const atual = await lerJogoParaMerge(svc, g.tenantId, id)
  if (atual === null) return { ok: false, error: 'Desafio não encontrado.' }
  const chave = String(Number(numeroDia))
  const dias = diasObj(atual)
  const dia = dias[chave]
  if (!dia) return { ok: false, error: 'Dia não encontrado.' }
  // Dois flags OBRIGATÓRIOS p/ o fluxo do ALUNO funcionar:
  //  • `desafio_ativo=true`: /api/leitura/progresso só marca a leitura como concluída (gate do quiz) com ele.
  //  • `publicado=true`: o leitor do aluno (carregarDocumentoAluno), a rota de progresso e a gravação da
  //    conclusão EXIGEM doc publicado — sem isso o botão de Leitura não aparece e a leitura não abre.
  //  A leitura do dia é parte do desafio e fica sempre "viva" (a visibilidade é gateada pelo PUB do dia).
  // Já existe e não foi apagado? reaproveita (garantindo os flags).
  if (dia.documento_id) {
    const { data } = await svc.from('simulado_documentos').select('id, desafio_ativo, publicado').eq('id', dia.documento_id).eq('tenant_id', g.tenantId).eq('deletado', false).maybeSingle()
    if (data) {
      const patch: Record<string, unknown> = {}
      if (!(data as any).desafio_ativo) patch.desafio_ativo = true
      if (!(data as any).publicado) patch.publicado = true
      if (Object.keys(patch).length) await svc.from('simulado_documentos').update(patch).eq('id', dia.documento_id).eq('tenant_id', g.tenantId)
      return { ok: true, documentoId: dia.documento_id }
    }
  }
  // Cria o documento de leitura vinculado à pasta do desafio (folder_area jurisprudencia).
  const titulo = `${dia.titulo?.trim() || `Dia ${chave}`} — Leitura`
  const r = await criarDocumento(titulo, id)
  if (!r.ok || !r.id) return { ok: false, error: r.error ?? 'Falha ao criar a leitura.' }
  await svc.from('simulado_documentos').update({ desafio_ativo: true, publicado: true }).eq('id', r.id).eq('tenant_id', g.tenantId)
  dias[chave] = { ...dia, documento_id: r.id }
  const s = await salvarMerge(g.tenantId, g.atorId, id, { dias })
  return s.ok ? { ok: true, documentoId: r.id } : { ok: false, error: s.error }
}

/** Salva as imagens anexadas (ticket, capa…) — base64/URL por chave. */
export async function salvarImagensDesafio(id: string, imagens: Record<string, any>): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  // MESCLA com as imagens já salvas (ticket/capa vêm da aba Config; selos/personagens da aba Medalhas)
  // para que uma aba não apague as chaves da outra.
  const svc = createAdminClient()
  // base64 (data:image) → storage, para TODAS as chaves (inclui os *_orig não-destrutivos) — evita
  // inflar o jsonb com imagens inteiras. '' limpa; URL passa direto.
  const hosteadas: Record<string, any> = {}
  for (const [k, v] of Object.entries(imagens && typeof imagens === 'object' ? imagens : {})) {
    hosteadas[k] = (typeof v === 'string' && v.startsWith('data:image')) ? ((await hospedarBase64(v, svc)) ?? v) : v
  }
  const atual = await lerJogoParaMerge(svc, g.tenantId, id)
  if (atual === null) return { ok: false, error: 'Desafio não encontrado.' }
  const base = atual.imagens && typeof atual.imagens === 'object' ? atual.imagens : {}
  const mescladas = { ...base, ...hosteadas }
  return salvarMerge(g.tenantId, g.atorId, id, { imagens: mescladas })
}

/** Salva a APARÊNCIA (cores/opções) — o bootstrap injeta as CSS vars no jogo (recolorir sem tocar no motor). */
export async function salvarAparenciaDesafio(id: string, aparencia: Record<string, any>): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  return salvarMerge(g.tenantId, g.atorId, id, { aparencia: aparencia && typeof aparencia === 'object' ? aparencia : {} })
}
