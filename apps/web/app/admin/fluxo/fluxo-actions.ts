'use server'
// Server action GENÉRICA do editor de fluxo: resolve o adaptador no registro e delega ao `salvar` dele (que chama a action existente do domínio).
// Só exporta funções async.
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { obterAdaptador } from '@/lib/admin/fluxo/registro'
import type { PatchFluxo, ResultadoSalvarFluxo } from '@/lib/admin/fluxo/adaptador'

const CHAVES_PROIBIDAS = new Set(['__proto__', 'constructor', 'prototype'])

export async function salvarFluxo(adaptadorId: string, patch: PatchFluxo, versaoEsperada: number, motivo: string, confirmarRisco = false): Promise<ResultadoSalvarFluxo> {
  const ad = obterAdaptador(String(adaptadorId))
  if (!ad) return { ok: false, error: 'Adaptador de fluxo desconhecido.' }
  const a = await getCurrentAccess()
  if (!a.tenantId || !accessCan(a, ad.permEditar)) return { ok: false, error: 'Sem permissão.' }
  const valores = patch?.valores
  if (!valores || typeof valores !== 'object' || Array.isArray(valores)) return { ok: false, error: 'Alteração inválida.' }
  const chaves = Object.keys(valores)
  if (!chaves.length || chaves.length > 200 || chaves.some((k) => CHAVES_PROIBIDAS.has(k) || k.length > 120)) return { ok: false, error: 'Alteração inválida.' }
  const alvo = patch.alvo == null ? undefined : String(patch.alvo).slice(0, 80)
  return ad.salvar({ tenantId: a.tenantId, userId: a.userId ?? null, podeEditar: true }, { alvo, valores }, Math.trunc(Number(versaoEsperada) || 0), String(motivo ?? '').slice(0, 300), confirmarRisco === true)
}

// ── CONSTRUTOR (overlay do usuário) ─────────────────────────────────────────────────────────────────
import { createAdminClient } from '@/lib/supabase/server'
import { lerRegistroOverlay, listarVersoesOverlay, obterVersaoOverlay, salvarOverlay } from '@/lib/admin/fluxo/overlay-server'
import { mesclar, normalizarOverlay, podarOverlay } from '@/lib/admin/fluxo/overlay'
import { validarGrafo, type ProblemaGrafo } from '@/lib/admin/fluxo/grafo'
import type { ContextoFluxo, FluxoAdaptador, ResultadoAvaliacao, VersaoOverlay } from '@/lib/admin/fluxo/adaptador'
import type { OverlayFluxo } from '@/lib/admin/fluxo/overlay'

async function acessoConstrutor(adaptadorId: string, modo: 'ver' | 'editar'): Promise<{ ad: FluxoAdaptador; ctx: ContextoFluxo } | { erro: string }> {
  const ad = obterAdaptador(String(adaptadorId))
  if (!ad?.construtor) return { erro: 'Este fluxo não tem construtor.' }
  const a = await getCurrentAccess()
  if (!a.tenantId || !accessCan(a, modo === 'editar' ? ad.permEditar : ad.permVer)) return { erro: 'Sem permissão.' }
  return { ad, ctx: { tenantId: a.tenantId, userId: a.userId ?? null, podeEditar: accessCan(a, ad.permEditar) } }
}

export interface ResultadoValidacaoOverlay { ok: true; overlay: OverlayFluxo; problemas: ProblemaGrafo[]; regras: ResultadoAvaliacao }
/** Poda + valida (grafo e regras executáveis) SEM gravar. */
async function validar(ad: FluxoAdaptador, ctx: ContextoFluxo, bruto: unknown): Promise<ResultadoValidacaoOverlay> {
  const c = ad.construtor!
  const base = (await ad.carregar(ctx)).diagramas
  const overlay = podarOverlay(base, normalizarOverlay(bruto, c.tiposNo))
  const problemas = validarGrafo(mesclar(base, overlay))
  const regras = c.avaliar && overlay.nos.some((n) => n.tipo === 'condicao' || n.tipo === 'acao') ? await c.avaliar(ctx, overlay) : { erros: [], avisos: [], diagnosticos: [] }
  return { ok: true, overlay, problemas, regras }
}

export async function avaliarOverlayFluxo(adaptadorId: string, overlay: unknown): Promise<ResultadoValidacaoOverlay | { ok: false; error: string }> {
  const g = await acessoConstrutor(adaptadorId, 'editar'); if ('erro' in g) return { ok: false, error: g.erro }
  return validar(g.ad, g.ctx, overlay)
}

export async function salvarOverlayFluxo(adaptadorId: string, overlay: unknown, versaoEsperada: number, motivo: string, confirmarRisco = false): Promise<
  { ok: true; versao: number; avisos: string[]; overlay: OverlayFluxo } | { ok: false; error: string; conflito?: boolean; erros?: string[]; confirmar?: { titulo: string; mensagem: string } }> {
  const g = await acessoConstrutor(adaptadorId, 'editar'); if ('erro' in g) return { ok: false, error: g.erro }
  if (!overlay || typeof overlay !== 'object' || JSON.stringify(overlay).length > 400_000) return { ok: false, error: 'Fluxo inválido.' }
  const v = await validar(g.ad, g.ctx, overlay)
  const erros = [...v.problemas.filter((p) => p.nivel === 'erro').map((p) => p.mensagem), ...v.regras.erros]
  if (erros.length) return { ok: false, error: erros[0], erros }
  const svc = createAdminClient()
  const atual = normalizarOverlay((await lerRegistroOverlay(svc, g.ctx.tenantId, g.ad.id)).overlay, g.ad.construtor!.tiposNo)
  if (g.ad.construtor!.antesDeSalvar) {
    const r = await g.ad.construtor!.antesDeSalvar(g.ctx, atual, v.overlay, confirmarRisco === true)
    if (!r.ok) return { ok: false, error: r.error, confirmar: r.confirmar }
  }
  const s = await salvarOverlay(svc, g.ctx.tenantId, g.ad.id, v.overlay, Math.trunc(Number(versaoEsperada) || 0), g.ctx.userId, String(motivo ?? '').slice(0, 300))
  if (!s.ok) return { ok: false, error: s.error, conflito: s.conflito }
  return { ok: true, versao: s.versao, overlay: v.overlay, avisos: [...v.problemas.filter((p) => p.nivel === 'aviso').map((p) => p.mensagem), ...v.regras.avisos] }
}

export async function listarVersoesOverlayFluxo(adaptadorId: string): Promise<VersaoOverlay[]> {
  const g = await acessoConstrutor(adaptadorId, 'ver'); if ('erro' in g) return []
  return listarVersoesOverlay(createAdminClient(), g.ctx.tenantId, g.ad.id)
}

/** Devolve o overlay de uma versão antiga para o cliente carregar como RASCUNHO (restaurar = carregar + salvar, gerando versão nova). */
export async function obterVersaoOverlayFluxo(adaptadorId: string, versao: number): Promise<{ ok: true; overlay: OverlayFluxo } | { ok: false; error: string }> {
  const g = await acessoConstrutor(adaptadorId, 'editar'); if ('erro' in g) return { ok: false, error: g.erro }
  const o = await obterVersaoOverlay(createAdminClient(), g.ctx.tenantId, g.ad.id, Math.trunc(Number(versao) || 0))
  return o ? { ok: true, overlay: normalizarOverlay(o, g.ad.construtor!.tiposNo) } : { ok: false, error: 'Versão não encontrada.' }
}


// ── VERIFICAÇÃO DO SISTEMA ─────────────────────────────────────────────────────────────────────────
import { ordenarVerificacao, verificarGrafoCompleto, type ItemVerificacao } from '@/lib/admin/fluxo/verificacao'

export interface ResultadoVerificacaoFluxo { ok: true; itens: ItemVerificacao[]; geradoEm: string }
/** Checagens determinísticas (grafo + regras do usuário + regras vigentes do domínio) sobre o rascunho enviado. Não grava nada; só exige poder VER o fluxo. */
export async function verificarFluxoSistema(adaptadorId: string, overlayBruto: unknown): Promise<ResultadoVerificacaoFluxo | { ok: false; error: string }> {
  const g = await acessoConstrutor(adaptadorId, 'ver'); if ('erro' in g) return { ok: false, error: g.erro }
  if (!overlayBruto || typeof overlayBruto !== 'object' || JSON.stringify(overlayBruto).length > 400_000) return { ok: false, error: 'Fluxo inválido.' }
  const c = g.ad.construtor!
  const base = (await g.ad.carregar(g.ctx)).diagramas
  const overlay = podarOverlay(base, normalizarOverlay(overlayBruto, c.tiposNo))
  const itens: ItemVerificacao[] = verificarGrafoCompleto(base, overlay)
  if (c.avaliar && overlay.nos.some((n) => n.tipo === 'condicao' || n.tipo === 'acao')) {
    const r = await c.avaliar(g.ctx, overlay)
    r.erros.forEach((m, k) => itens.push({ id: `rx:e${k}`, severidade: 'erro', categoria: 'regra', titulo: 'Regra do usuário inválida', descricao: m }))
    r.avisos.forEach((m, k) => itens.push({ id: `rx:a${k}`, severidade: 'aviso', categoria: 'regra', titulo: 'Atenção na regra do usuário', descricao: m }))
    r.diagnosticos.forEach((m, k) => itens.push({ id: `rx:d${k}`, severidade: 'info', categoria: 'regra', titulo: 'Efeito da regra', descricao: m }))
  }
  if (c.verificar) itens.push(...(await c.verificar(g.ctx, overlay)))
  return { ok: true, itens: ordenarVerificacao(itens), geradoEm: new Date().toISOString() }
}
