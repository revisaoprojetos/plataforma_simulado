'use server'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { resolverReporte } from '@/lib/demandas/demandas'
import { criarNotificacoesEmMassa } from '@/lib/notificacoes/criar'
import { destinatariosDoMaterial } from '@/lib/conteudo/atualizacoes-notificar'
import { NOME_TIPO_ATUALIZACAO } from '@/lib/admin-revisao/biblioteca-tipos'
import { TIPOS_ATUALIZACAO, type TipoAtualizacao } from '@/lib/admin-revisao/biblioteca-tipos'
import { TEXTO_SEM_ATUALIZACAO, combinarDataHoraBrt } from '@/lib/conteudo/atualizacoes-tipos'
import { LIMITE_LOTE, normalizarEspecificacao, normalizarIdsLote, temEspecificacao } from '@/lib/admin-revisao/atualizacoes-filtros'
import { opcoesMateriais, type OpcaoMaterial } from '@/lib/admin-revisao/atualizacoes'

// Central de Atualizações (Plataforma Revisão). Só async exportadas ('use server').
// Permissão reusa configuracoes:update (mesma da Biblioteca). Service role + tenant explícito + auditoria.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TABELA_AUSENTE = /relation .* does not exist|could not find the table|schema cache|does not exist/i
const AVISO = 'Aplique a migração 20261112010000 (Central de Atualizações) no banco.'

async function guard() {
  if (!(await checkPermission('configuracoes:update'))) return { ok: false as const, error: 'Sem permissão.' }
  const access = await getCurrentAccess()
  if (!access.tenantId) return { ok: false as const, error: 'Tenant não resolvido.' }
  return { ok: true as const, tenantId: access.tenantId, atorId: access.userId ?? null }
}

const COLUNAS_ESPEC = /fonte_origem|fonte_url|trecho_afetado|avisar_ja_baixou|registrado_por/i
const COLUNA_LOTE = /lote_id|ocorrida_em/i
const AVISO_ESPEC = 'Aplique a migração 20261126000000 (especificação das atualizações) para gravar fonte, trecho e "avisar quem já baixou".'

interface EntradaRegistro {
  tipo: TipoAtualizacao; texto: string; avisarAlunos: boolean; mostrarInicio: boolean
  fonteOrigem?: string; fonteUrl?: string; trechoAfetado?: string; avisarJaBaixou?: boolean
  /** Data da mudança em Brasília (YYYY-MM-DD) e hora opcional (HH:mm). Vazio = agora. */
  dataMudanca?: string; horaMudanca?: string
}

/**
 * Núcleo único (1 ou N materiais): valida, grava em chunks de 80 com fallback de coluna ausente, avisa os alunos
 * (best-effort) e registra UMA auditoria. `loteId` = chave de idempotência (reenvio não duplica materiais já gravados).
 */
async function registrarCore(
  g: { tenantId: string; atorId: string | null }, documentoIds: string[], input: EntradaRegistro, loteId: string | null,
): Promise<{ ok: boolean; error?: string; ids?: string[]; avisados?: number; ignorados?: number }> {
  if (!TIPOS_ATUALIZACAO.some((t) => t.id === input.tipo)) return { ok: false, error: 'Tipo de atualização inválido.' }
  const semAtu = input.tipo === 'sem_atualizacao'
  const texto = String(input.texto ?? '').trim() || (semAtu ? TEXTO_SEM_ATUALIZACAO : '')
  if (!texto) return { ok: false, error: 'Escreva o que mudou.' }
  if (texto.length > 2000) return { ok: false, error: 'O texto passou de 2.000 caracteres.' }
  const esp = normalizarEspecificacao(input)
  if (!esp.ok) return esp
  let ocorridaEm: string | null = null
  if ((input.dataMudanca ?? '').trim()) {
    ocorridaEm = combinarDataHoraBrt(input.dataMudanca, input.horaMudanca)
    if (!ocorridaEm) return { ok: false, error: 'Data da mudança inválida.' }
  }

  const svc = createAdminClient()
  const docs: any[] = []
  for (let i = 0; i < documentoIds.length; i += 80) {
    const { data } = await svc.from('simulado_conteudo_documentos').select('id, titulo, pasta_id, versao_atual_id').eq('tenant_id', g.tenantId).eq('deletado', false).in('id', documentoIds.slice(i, i + 80))
    docs.push(...((data ?? []) as any[]))
  }
  if (!docs.length) return { ok: false, error: documentoIds.length > 1 ? 'Nenhum dos materiais foi encontrado.' : 'Material não encontrado.' }

  // Idempotência: reenvio com o mesmo lote_id só grava o que ainda não foi gravado (best-effort; sem a coluna, segue sem).
  let jaFeitos = new Set<string>()
  if (loteId) {
    for (let i = 0; i < docs.length; i += 80) {
      const { data, error } = await svc.from('simulado_conteudo_atualizacoes').select('documento_id').eq('tenant_id', g.tenantId).eq('lote_id', loteId).in('documento_id', docs.slice(i, i + 80).map((d) => d.id))
      if (error) { jaFeitos = new Set(); break }
      for (const r of (data ?? []) as any[]) jaFeitos.add(r.documento_id)
    }
  }
  const alvo = docs.filter((d) => !jaFeitos.has(d.id))
  if (!alvo.length) return { ok: true, ids: [], avisados: 0, ignorados: docs.length }

  const linhas = alvo.map((d) => ({
    tenant_id: g.tenantId, documento_id: d.id, versao_id: d.versao_atual_id ?? null, tipo: input.tipo, texto,
    avisar_alunos: !semAtu && !!input.avisarAlunos, mostrar_inicio: !semAtu && !!input.mostrarInicio,
    criado_por: g.atorId, ...(ocorridaEm ? { ocorrida_em: ocorridaEm } : {}), ...(loteId ? { lote_id: loteId } : {}),
    registrado_por: g.atorId, fonte_origem: esp.espec.fonteOrigem, fonte_url: esp.espec.fonteUrl, trecho_afetado: esp.espec.trechoAfetado, avisar_ja_baixou: esp.espec.avisarJaBaixou,
  }))
  const ids: string[] = []
  for (let i = 0; i < linhas.length; i += 80) {
    let parte: any[] = linhas.slice(i, i + 80)
    let { data, error } = await svc.from('simulado_conteudo_atualizacoes').insert(parte).select('id')
    if (error && COLUNAS_ESPEC.test(error.message)) {
      // Sem a migração 20261126000000: se o usuário preencheu a especificação, não perde em silêncio.
      if (temEspecificacao(esp.espec)) return { ok: false, error: AVISO_ESPEC }
      parte = parte.map(({ registrado_por, fonte_origem, fonte_url, trecho_afetado, avisar_ja_baixou, ...r }) => r)
      ;({ data, error } = await svc.from('simulado_conteudo_atualizacoes').insert(parte).select('id'))
    }
    if (error && COLUNA_LOTE.test(error.message)) {
      parte = parte.map(({ lote_id, ocorrida_em, ...r }) => r)
      ;({ data, error } = await svc.from('simulado_conteudo_atualizacoes').insert(parte).select('id'))
    }
    if (error || !data) {
      const falha = error && /atualizacoes_tipo_check/i.test(error.message) ? 'O tipo "Sem atualizações" exige aplicar a migração 20261121000000.' : error && TABELA_AUSENTE.test(error.message) ? AVISO : error?.message || 'Falha ao registrar.'
      return { ok: false, error: ids.length ? `${falha} (${ids.length} já gravado(s); reenvie para completar.)` : falha }
    }
    ids.push(...(data as any[]).map((r) => r.id as string))
  }

  await registrarAudit({
    operacao: 'INSERT', entidade: 'simulado_conteudo_atualizacoes', entidadeId: alvo.length === 1 ? ids[0] : loteId, atorId: g.atorId, tenantId: g.tenantId,
    depois: { lote_id: loteId, total: alvo.length, documento_ids: alvo.map((d) => d.id).slice(0, 100), tipo: input.tipo, avisar_alunos: !!input.avisarAlunos, avisar_ja_baixou: esp.espec.avisarJaBaixou, fonte_origem: esp.espec.fonteOrigem },
  }).catch(() => {})

  // Aviso in-app (sino do aluno): best-effort, mesma fila de notificações do resto da plataforma. Em ondas de 5 documentos.
  let avisados = 0
  if (input.avisarAlunos && !semAtu) {
    for (let i = 0; i < alvo.length; i += 5) {
      const n = await Promise.all(alvo.slice(i, i + 5).map(async (d) => {
        try {
          const dest = await destinatariosDoMaterial(svc, g.tenantId, d.id, d.pasta_id ?? null)
          return await criarNotificacoesEmMassa(svc, g.tenantId, dest, {
            tipo: 'material_atualizado', titulo: `Material atualizado: ${d.titulo ?? 'material'}`,
            mensagem: `${NOME_TIPO_ATUALIZACAO[input.tipo]}: ${texto.slice(0, 200)}`, link: `/aluno/nova/painel/leitor/${d.id}`,
          })
        } catch { return 0 }
      }))
      avisados += n.reduce((a, b) => a + b, 0)
    }
  }
  // "Novidades do Início": uma novidade por material na categoria Materiais. Best-effort, em chunks de 80.
  if (input.mostrarInicio && !semAtu) {
    const agora = new Date().toISOString()
    for (let i = 0; i < alvo.length; i += 80) {
      await svc.from('simulado_novidades').insert(alvo.slice(i, i + 80).map((d) => ({
        tenant_id: g.tenantId, categoria: 'materiais', titulo: `Material atualizado: ${d.titulo ?? 'material'}`,
        descricao: `${NOME_TIPO_ATUALIZACAO[input.tipo]}: ${texto.slice(0, 400)}`, destaque: false, ativo: true,
        cta_label: 'Abrir o material', cta_url: `/aluno/nova/painel/leitor/${d.id}`, publicado_em: agora,
      }))).then(() => {}, () => {})
    }
  }
  revalidatePath('/admin/revisao/atualizacoes')
  return { ok: true, ids, avisados, ignorados: docs.length - alvo.length }
}

export async function registrarAtualizacaoAction(input: EntradaRegistro & {
  documentoId: string
  origem?: { tipo: 'reporte' | 'pedido'; id: string } | null
}): Promise<{ ok: boolean; error?: string; id?: string; avisados?: number }> {
  const g = await guard(); if (!g.ok) return g
  if (!UUID.test(input.documentoId)) return { ok: false, error: 'Escolha o material.' }
  const origem = input.origem && UUID.test(input.origem.id) && (input.origem.tipo === 'reporte' || input.origem.tipo === 'pedido') ? input.origem : null
  const r = await registrarCore(g, [input.documentoId], input, null)
  if (!r.ok || !r.ids?.[0]) return { ok: false, error: r.error || 'Falha ao registrar.' }
  const id = r.ids[0]
  const svc = createAdminClient()
  // Fecha a origem na fila: reporte vira "resolvido" (mesmo fluxo da Central de Demandas); pedido vira "atendido".
  if (origem?.tipo === 'reporte') {
    await resolverReporte(svc, { tenantId: g.tenantId, id: origem.id, status: 'resolvido', resolvidoPor: g.atorId }).catch(() => {})
  } else if (origem?.tipo === 'pedido') {
    await svc.from('simulado_conteudo_atualizacao_pedidos').update({ status: 'atendido', atualizacao_id: id, atendido_em: new Date().toISOString() }).eq('tenant_id', g.tenantId).eq('id', origem.id).eq('status', 'pendente')
  }
  return { ok: true, id, avisados: r.avisados }
}

/** Mesma atualização para vários materiais (até 100). `chave` (uuid gerado no formulário) torna o reenvio idempotente. */
export async function registrarAtualizacaoEmLoteAction(input: EntradaRegistro & { documentoIds: string[]; chave: string }): Promise<{ ok: boolean; error?: string; gravados?: number; ignorados?: number; avisados?: number }> {
  const g = await guard(); if (!g.ok) return g
  const { ids, excedeu } = normalizarIdsLote(input.documentoIds)
  if (excedeu) return { ok: false, error: `O lote aceita no máximo ${LIMITE_LOTE} materiais por vez.` }
  if (!ids.length) return { ok: false, error: 'Escolha ao menos um material.' }
  if (!UUID.test(input.chave ?? '')) return { ok: false, error: 'Chave do lote inválida. Recarregue a página.' }
  const r = await registrarCore(g, ids, input, input.chave.toLowerCase())
  if (!r.ok) return { ok: false, error: r.error }
  return { ok: true, gravados: r.ids?.length ?? 0, ignorados: r.ignorados ?? 0, avisados: r.avisados }
}

/** Busca de materiais por título para o seletor do lote (até 30; read-only). */
export async function buscarMateriaisAction(busca: string): Promise<{ ok: boolean; error?: string; itens?: OpcaoMaterial[] }> {
  if (!(await checkPermission('configuracoes:view'))) return { ok: false, error: 'Sem permissão.' }
  const access = await getCurrentAccess()
  if (!access.tenantId) return { ok: false, error: 'Tenant não resolvido.' }
  return { ok: true, itens: await opcoesMateriais(createAdminClient(), access.tenantId, String(busca ?? '').slice(0, 80), null) }
}

export async function criarPedidoAtualizacaoAction(input: { documentoId: string; texto: string; origem?: string }): Promise<{ ok: boolean; error?: string }> {
  const g = await guard(); if (!g.ok) return g
  if (!UUID.test(input.documentoId)) return { ok: false, error: 'Escolha o material.' }
  const texto = String(input.texto ?? '').trim()
  if (!texto) return { ok: false, error: 'Descreva o que precisa ser atualizado.' }
  const origem = String(input.origem ?? '').trim().slice(0, 120) || 'Pedido da Coordenação Pedagógica'
  const svc = createAdminClient()
  const { data: doc } = await svc.from('simulado_conteudo_documentos').select('id').eq('tenant_id', g.tenantId).eq('id', input.documentoId).eq('deletado', false).maybeSingle()
  if (!doc) return { ok: false, error: 'Material não encontrado.' }
  const { data, error } = await svc.from('simulado_conteudo_atualizacao_pedidos').insert({ tenant_id: g.tenantId, documento_id: input.documentoId, texto: texto.slice(0, 2000), origem, criado_por: g.atorId }).select('id').single()
  if (error) return { ok: false, error: TABELA_AUSENTE.test(error.message) ? AVISO : error.message }
  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_conteudo_atualizacao_pedidos', entidadeId: (data as any).id, atorId: g.atorId, tenantId: g.tenantId, depois: { documento_id: input.documentoId } }).catch(() => {})
  revalidatePath('/admin/revisao/atualizacoes')
  return { ok: true }
}

export async function descartarPedidoAction(id: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guard(); if (!g.ok) return g
  if (!UUID.test(id)) return { ok: false, error: 'Pedido inválido.' }
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_conteudo_atualizacao_pedidos').update({ status: 'cancelado', atendido_em: new Date().toISOString() }).eq('tenant_id', g.tenantId).eq('id', id).eq('status', 'pendente')
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_conteudo_atualizacao_pedidos', entidadeId: id, atorId: g.atorId, tenantId: g.tenantId, depois: { status: 'cancelado' } }).catch(() => {})
  revalidatePath('/admin/revisao/atualizacoes')
  return { ok: true }
}
