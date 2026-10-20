import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { fetchAll } from '@/lib/supabase/fetch-all'

// REGRAS do desafio (Fase 5) — recortar/ocultar/lacuna sobre os trechos de uma versão, ancoradas por
// uid (sobrevivem à atualização, A5). REGRA DE OURO (R3/A7): o `gabarito` da lacuna é SERVER-ONLY —
// `montarPayloadAluno` nunca o devolve; a conferência (`corrigirLacuna`) acontece só no servidor.

const T_REG = 'simulado_conteudo_regras'
const T_TR = 'simulado_conteudo_trechos'

export type AcaoRegra = 'recortar' | 'ocultar' | 'lacuna'
export interface Regra {
  id: string; desafio_id: string; acao: AcaoRegra
  trecho_uid_inicio: string; trecho_uid_fim: string | null
  inicio_offset: number | null; fim_offset: number | null
  texto_ancora: string | null; gabarito: string | null; estado: 'ativa' | 'invalida'
}

export async function criarRegra(input: {
  desafioId: string; acao: AcaoRegra; trechoUidInicio: string; trechoUidFim?: string | null
  inicioOffset?: number | null; fimOffset?: number | null; textoAncora?: string | null; gabarito?: string | null
}): Promise<{ id: string } | { erro: string }> {
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return { erro: 'tenant não resolvido' }
  if (input.acao === 'lacuna' && !input.gabarito?.trim()) return { erro: 'lacuna exige gabarito' }
  const svc = createAdminClient()
  const { data, error } = await svc.from(T_REG).insert({
    tenant_id: tenantId, desafio_id: input.desafioId, acao: input.acao,
    trecho_uid_inicio: input.trechoUidInicio, trecho_uid_fim: input.trechoUidFim ?? null,
    inicio_offset: input.inicioOffset ?? null, fim_offset: input.fimOffset ?? null,
    texto_ancora: input.textoAncora ?? null, gabarito: input.acao === 'lacuna' ? input.gabarito : null, estado: 'ativa',
  }).select('id').single()
  if (error || !data) return { erro: error?.message || 'falha ao criar regra' }
  return { id: data.id }
}

/** Regras do desafio — visão ADMIN (inclui gabarito). Nunca use isto num payload de aluno. */
export async function listarRegrasAdmin(desafioId: string): Promise<Regra[]> {
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return []
  const svc = createAdminClient()
  const rows = await fetchAll<Regra>(() => svc.from(T_REG)
    .select('id, desafio_id, acao, trecho_uid_inicio, trecho_uid_fim, inicio_offset, fim_offset, texto_ancora, gabarito, estado')
    .eq('tenant_id', tenantId).eq('desafio_id', desafioId).order('id', { ascending: true }))
  return rows ?? []
}

export async function removerRegra(id: string): Promise<{ ok: boolean }> {
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return { ok: false }
  const svc = createAdminClient()
  await svc.from(T_REG).delete().eq('tenant_id', tenantId).eq('id', id)
  return { ok: true }
}

// ── Payload do aluno (SEM gabarito) ──────────────────────────────────────────────
export interface TrechoAluno { uid: string; ordem: number; tipo: string; rotulo: string | null; texto: string; oculto?: boolean; lacunas?: { id: string; inicio: number; fim: number }[] }
export interface PayloadDesafioAluno { trechos: TrechoAluno[]; temLacuna: boolean }

/** Aplica as regras do desafio sobre os trechos da versão e devolve SÓ o que o aluno pode ver.
 *  recortar = mantém apenas a faixa [inicio..fim]; ocultar = esconde a faixa; lacuna = vira espaço a preencher. */
export async function montarPayloadAluno(desafioId: string, versaoId: string): Promise<PayloadDesafioAluno> {
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return { trechos: [], temLacuna: false }
  const svc = createAdminClient()
  const [trechos, regras] = await Promise.all([
    fetchAll<any>(() => svc.from(T_TR).select('uid, ordem, tipo, rotulo, texto').eq('tenant_id', tenantId).eq('versao_id', versaoId).order('ordem', { ascending: true })),
    listarRegrasAdmin(desafioId),
  ])
  let lista: TrechoAluno[] = (trechos ?? []).map((t) => ({ uid: t.uid, ordem: t.ordem, tipo: t.tipo, rotulo: t.rotulo, texto: t.texto }))
  const ordemDe = new Map(lista.map((t) => [t.uid, t.ordem]))
  const ativas = regras.filter((r) => r.estado === 'ativa')

  // recortar: interseção de todas as faixas de recorte
  const recortes = ativas.filter((r) => r.acao === 'recortar')
  if (recortes.length) {
    const manter = new Set<number>()
    for (const r of recortes) {
      const a = ordemDe.get(r.trecho_uid_inicio); const b = r.trecho_uid_fim ? ordemDe.get(r.trecho_uid_fim) : a
      if (a == null) continue
      const [lo, hi] = [a, b ?? a].sort((x, y) => x - y)
      for (let o = lo; o <= hi; o++) manter.add(o)
    }
    lista = lista.filter((t) => manter.has(t.ordem))
  }

  // 1º passo: aplica OCULTAR e COLETA as lacunas por trecho (offsets do texto ORIGINAL).
  const lacunasPorOrdem = new Map<number, { id: string; ini: number; fim: number }[]>()
  for (const r of ativas) {
    if (r.acao === 'recortar') continue
    const a = ordemDe.get(r.trecho_uid_inicio); const b = r.trecho_uid_fim ? ordemDe.get(r.trecho_uid_fim) : a
    if (a == null) continue
    const [lo, hi] = [a, b ?? a].sort((x, y) => x - y)
    for (const t of lista) {
      if (t.ordem < lo || t.ordem > hi) continue
      if (r.acao === 'ocultar') { t.oculto = true; t.texto = '' }
      else if (r.acao === 'lacuna') {
        const ini = Math.max(0, r.inicio_offset ?? 0)
        const fim = Math.min(t.texto.length, r.fim_offset ?? t.texto.length)
        if (fim <= ini) continue
        const l = lacunasPorOrdem.get(t.ordem) ?? []
        l.push({ id: r.id, ini, fim }); lacunasPorOrdem.set(t.ordem, l)
      }
    }
  }
  // 2º passo: aplica as lacunas em ordem DECRESCENTE de offset (não desloca as posteriores) → sem corrupção.
  for (const t of lista) {
    const ls = lacunasPorOrdem.get(t.ordem)
    if (!ls || t.oculto) continue
    t.lacunas = ls.map((x) => ({ id: x.id, inicio: x.ini, fim: x.fim })).sort((x, y) => x.inicio - y.inicio)
    for (const x of [...ls].sort((x, y) => y.ini - x.ini)) t.texto = t.texto.slice(0, x.ini) + '＿＿＿＿' + t.texto.slice(x.fim)
  }
  return { trechos: lista.filter((t) => !t.oculto), temLacuna: ativas.some((r) => r.acao === 'lacuna') }
}

/** Confere a resposta de uma lacuna SÓ no servidor (comparação normalizada). Nunca expõe o gabarito. */
export async function corrigirLacuna(regraId: string, resposta: string): Promise<{ correta: boolean }> {
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return { correta: false }
  const svc = createAdminClient()
  const { data } = await svc.from(T_REG).select('gabarito, acao').eq('tenant_id', tenantId).eq('id', regraId).maybeSingle()
  if (!data || data.acao !== 'lacuna' || !data.gabarito) return { correta: false }
  const norm = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
  return { correta: norm(resposta) === norm(data.gabarito) }
}
