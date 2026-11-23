'use server'
// Server actions da aba INTELIGÊNCIA do Cronograma Adaptativo. Só exporta funções async; tipos em `inteligencia-actions-tipos.ts`.
// Tudo aqui é SOMENTE LEITURA (simulações em memória) exceto `salvarRegrasComTrava`, que delega a gravação à action existente `salvarRegras`.
// Permissões: exportar = cronogramas:view; simular/laboratório/importar/aplicar = cronogramas:update.
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { REGRAS_PADRAO, hashRegras, type RegrasMotor } from '@/lib/cronograma/adaptativo/regras'
import { validarRegras } from '@/lib/cronograma/adaptativo/regras-validacao'
import { lerRegistroRegras } from '@/lib/cronograma/adaptativo/config-regras'
import { TODOS_CAMPOS, diffRegras, gravarCaminho, textoParaValor } from '@/lib/cronograma/adaptativo/regras-campos'
import { acharChavePerigosa, exportarRegras, importarRegras, mesclarParcial, LIMITE_BYTES_IMPORTACAO } from '@/lib/cronograma/adaptativo/regras-io'
import { exigeConfirmacao, resumirTrava } from '@/lib/cronograma/adaptativo/impacto-regras'
import { amostrarPlanos, carregarBaseSimulacao, impactoDoPlano, nomesEstudantes, rodarAmostraTrava, rodarLab } from '@/lib/cronograma/adaptativo/inteligencia-server'
import { rastroDoAluno } from '@/lib/cronograma/adaptativo/rastro-plano-server'
import { salvarRegras } from './regras-actions'
import { AMOSTRA_MAX, AMOSTRA_MIN, AMOSTRA_PADRAO, LOTE_MAX, LOTE_PADRAO } from './inteligencia-actions-tipos'
import type { AlteracaoCampo, ArquivoRegras, LinhaImpacto, LoteImpacto, ParamsAmostra, RespostaAcao, ResultadoImportacao, ResultadoLab, ResultadoTrava } from './inteligencia-actions-tipos'

async function acesso(acao: 'view' | 'update') {
  const a = await getCurrentAccess()
  if (!a.tenantId || !accessCan(a, `cronogramas:${acao}`)) return null
  return { tenantId: a.tenantId, userId: a.userId ?? null }
}
const SEM_PERMISSAO = 'Sem permissão.'

function paramsAmostra(p: Partial<ParamsAmostra> | undefined): ParamsAmostra {
  const tamanho = Math.max(AMOSTRA_MIN, Math.min(AMOSTRA_MAX, Math.trunc(Number(p?.tamanho)) || AMOSTRA_PADRAO))
  const criterio = p?.criterio === 'aleatoria' || p?.criterio === 'faixa' ? p.criterio : 'recentes'
  return { tamanho, criterio, seed: String(p?.seed ?? '1').slice(0, 40) || '1' }
}

/** (a) Painel de impacto: roda SÓ os planos do lote pedido (a UI chama lote 1..k em série). Nunca grava. */
export async function impactoLote(entrada: { amostra?: Partial<ParamsAmostra>; rascunho?: unknown; lote?: number; limite?: number }): Promise<RespostaAcao<LoteImpacto>> {
  const g = await acesso('update'); if (!g) return { ok: false, error: SEM_PERMISSAO }
  const am = paramsAmostra(entrada?.amostra)
  const limite = Math.max(1, Math.min(LOTE_MAX, Math.trunc(Number(entrada?.limite)) || LOTE_PADRAO))
  let rascunho: RegrasMotor | null = null
  if (entrada?.rascunho != null) {
    const bad = acharChavePerigosa(entrada.rascunho)
    if (bad) return { ok: false, error: bad }
    const v = validarRegras(entrada.rascunho)
    if (!v.ok) return { ok: false, error: v.erros[0] ?? 'Rascunho inválido.', erros: v.erros }
    rascunho = v.regras
  }
  const svc = createAdminClient()
  const vig = await lerRegistroRegras(svc, g.tenantId)
  const amostra = await amostrarPlanos(svc, g.tenantId, am, vig.regras)
  const lotes = Math.max(1, Math.ceil(amostra.ids.length / limite))
  const lote = Math.max(1, Math.min(lotes, Math.trunc(Number(entrada?.lote)) || 1))
  const ids = amostra.ids.slice((lote - 1) * limite, lote * limite)
  const base = await carregarBaseSimulacao(svc, g.tenantId)
  const reg = { vigente: vig.regras, padrao: REGRAS_PADRAO, rascunho }
  const resultados = []
  for (const id of ids) resultados.push(await impactoDoPlano(svc, g.tenantId, id, base.banco, base.params, reg, amostra.faixas[id] ?? null))
  const nomes = await nomesEstudantes(svc, g.tenantId, resultados.flatMap((r) => (r?.estudanteId ? [r.estudanteId] : [])))
  const linhas: LinhaImpacto[] = []
  let ignorados = 0
  for (const r of resultados) {
    if (!r) { ignorados++; continue }
    linhas.push({ planoId: r.planoId, titulo: r.titulo, aluno: (r.estudanteId && nomes.get(r.estudanteId)) || 'Aluno', faixa: r.faixa, violacoesVigente: r.violacoesVigente, erroVigente: r.erroVigente, padrao: r.padrao, rascunho: r.rascunho })
  }
  return { ok: true, dados: { total: amostra.ids.length, lote, lotes, ignorados, linhas, hashes: { vigente: vig.hash, padrao: hashRegras(REGRAS_PADRAO), rascunho: rascunho ? hashRegras(rascunho) : null } } }
}

/** (b) Laboratório de bug: rastro com as regras vigentes × regras alteradas EM MEMÓRIA (campos e/ou JSON parcial). Nada é gravado. */
export async function laboratorioRastro(entrada: { email: string; planoId?: string | null; alteracoes?: AlteracaoCampo[]; jsonParcial?: string }): Promise<RespostaAcao<ResultadoLab>> {
  const g = await acesso('update'); if (!g) return { ok: false, error: SEM_PERMISSAO }
  const alts = Array.isArray(entrada?.alteracoes) ? entrada.alteracoes.slice(0, 40) : []
  const jtxt = (entrada?.jsonParcial ?? '').trim()
  if (!alts.length && !jtxt) return { ok: false, error: 'Informe ao menos um campo alterado ou um JSON parcial.' }
  const svc = createAdminClient()
  const vig = await lerRegistroRegras(svc, g.tenantId)
  let alterada: unknown = vig.regras
  for (const a of alts) {
    const campo = TODOS_CAMPOS.find((c) => c.path === a?.path)
    if (!campo) return { ok: false, error: `Campo desconhecido: ${String(a?.path).slice(0, 60)}.` }
    alterada = gravarCaminho(alterada, campo.path, textoParaValor(campo, String(a.texto ?? '')))
  }
  if (jtxt) {
    if (jtxt.length > LIMITE_BYTES_IMPORTACAO) return { ok: false, error: 'JSON grande demais (máximo de 200 KB).' }
    let parcial: unknown
    try { parcial = JSON.parse(jtxt) } catch { return { ok: false, error: 'JSON parcial inválido.' } }
    if (!parcial || typeof parcial !== 'object' || Array.isArray(parcial)) return { ok: false, error: 'O JSON parcial deve ser um objeto.' }
    const bad = acharChavePerigosa(parcial); if (bad) return { ok: false, error: bad }
    alterada = mesclarParcial(alterada, parcial)
  }
  const v = validarRegras(alterada)
  if (!v.ok || !v.regras) return { ok: false, error: v.erros[0] ?? 'Regras alteradas inválidas.', erros: v.erros }
  const busca = await rastroDoAluno(svc, g.tenantId, String(entrada?.email ?? ''), entrada?.planoId ?? null)
  if (!busca.ok) return { ok: false, error: busca.error }
  const d = busca.dados
  if (d.legado || !d.planoId) return { ok: false, error: 'Plano legado (motor 2.8.1): o laboratório só analisa planos do motor atual.' }
  const r = await rodarLab(svc, g.tenantId, d.planoId, vig.regras, v.regras)
  if (!r) return { ok: false, error: 'Plano não encontrado.' }
  return {
    ok: true,
    dados: {
      aluno: d.aluno, planos: d.planos, planoId: d.planoId, titulo: d.titulo, hoje: d.hoje,
      hashes: { vigente: vig.hash, alterada: hashRegras(v.regras) },
      campos: diffRegras(vig.regras, v.regras),
      vigente: { fim: r.a.fim, violacoes: r.a.violacoes, eventos: r.a.eventos?.length ?? 0, erro: r.a.erro },
      alterada: { fim: r.b.fim, violacoes: r.b.violacoes, eventos: r.b.eventos?.length ?? 0, erro: r.b.erro },
      impacto: r.impacto, eventos: r.eventos, mudancas: r.mudancas, mudancasTotal: r.mudancasTotal,
    },
  }
}

/** (c) Exportação das regras vigentes (JSON do arquivo). */
export async function exportarRegrasVigentes(): Promise<RespostaAcao<ArquivoRegras>> {
  const g = await acesso('view'); if (!g) return { ok: false, error: SEM_PERMISSAO }
  const vig = await lerRegistroRegras(createAdminClient(), g.tenantId)
  return { ok: true, dados: exportarRegras(vig.regras, { exportadoEm: new Date().toISOString() }) }
}

/** (c) Pré-visualização do import: valida e devolve o diff contra as vigentes. Não grava. */
export async function previewImportacao(texto: string): Promise<RespostaAcao<ResultadoImportacao>> {
  const g = await acesso('update'); if (!g) return { ok: false, error: SEM_PERMISSAO }
  const vig = await lerRegistroRegras(createAdminClient(), g.tenantId)
  return { ok: true, dados: importarRegras(typeof texto === 'string' ? texto : '', vig.regras) }
}

/**
 * (e) Salva as regras com TRAVA: simula a amostra (padrão 20 planos) proposta × vigente. Se houver concluídas divergentes ou erro de
 * geração NOVO e `confirmarRisco !== true`, devolve `exigeConfirmacao` SEM salvar. Só então delega a `salvarRegras` (versão + auditoria).
 */
export async function salvarRegrasComTrava(regras: unknown, versaoEsperada: number, motivo?: string, confirmarRisco?: boolean, tamanhoAmostra?: number): Promise<ResultadoTrava> {
  const g = await acesso('update'); if (!g) return { ok: false, error: SEM_PERMISSAO }
  const bad = acharChavePerigosa(regras); if (bad) return { ok: false, error: bad }
  const v = validarRegras(regras)
  if (!v.ok || !v.regras) return { ok: false, error: v.erros[0] ?? 'Regras inválidas.', erros: v.erros }
  const svc = createAdminClient()
  const vig = await lerRegistroRegras(svc, g.tenantId)
  const n = Math.max(AMOSTRA_MIN, Math.min(AMOSTRA_MAX, Math.trunc(Number(tamanhoAmostra)) || 20))
  const { itens, parcial } = hashRegras(v.regras) === vig.hash ? { itens: [], parcial: false } : await rodarAmostraTrava(svc, g.tenantId, vig.regras, v.regras, n)
  const resumo = resumirTrava(itens)
  if (exigeConfirmacao(resumo) && confirmarRisco !== true) return { ok: false, exigeConfirmacao: true, resumo, parcial }
  const s = await salvarRegras(v.regras, versaoEsperada, motivo)
  if (!s.ok || !s.dados) return { ok: false, error: s.error ?? 'Falha ao salvar.', erros: s.erros, conflito: s.conflito }
  return { ok: true, versao: s.dados.versao, hash: s.dados.hash, avisos: s.avisos, resumo, parcial }
}
