'use server'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { resolverReporte } from '@/lib/demandas/demandas'
import { criarNotificacoesEmMassa } from '@/lib/notificacoes/criar'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { NOME_TIPO_ATUALIZACAO } from '@/lib/admin-revisao/biblioteca-tipos'
import { TIPOS_ATUALIZACAO, type TipoAtualizacao } from '@/lib/admin-revisao/biblioteca-tipos'

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

/** Alunos que "têm" o material: acesso direto + membros de grupos (do doc e das pastas ancestrais) + quem já leu/anotou. */
async function destinatariosDoMaterial(svc: ReturnType<typeof createAdminClient>, tenantId: string, documentoId: string, pastaId: string | null): Promise<string[]> {
  const est = new Set<string>()
  const grupos = new Set<string>()
  const q = async (fn: () => PromiseLike<{ data: any[] | null }>) => { try { return ((await fn()).data ?? []) as any[] } catch { return [] as any[] } }
  // pasta do doc + ancestrais
  const pastas: string[] = []
  let atual = pastaId
  for (let i = 0; atual && i < 30; i++) {
    pastas.push(atual)
    const r = await q(() => svc.from('simulado_pastas').select('pai_id').eq('tenant_id', tenantId).eq('id', atual!).limit(1))
    atual = r[0]?.pai_id ?? null
  }
  const [dg, de, pg, pe, lp, an] = await Promise.all([
    q(() => svc.from('simulado_conteudo_documento_grupos').select('grupo_id').eq('tenant_id', tenantId).eq('documento_id', documentoId).limit(2000)),
    q(() => svc.from('simulado_conteudo_documento_estudantes').select('estudante_id').eq('tenant_id', tenantId).eq('documento_id', documentoId).limit(5000)),
    pastas.length ? q(() => svc.from('simulado_pasta_grupos').select('grupo_id').eq('tenant_id', tenantId).in('pasta_id', pastas).limit(2000)) : Promise.resolve([]),
    pastas.length ? q(() => svc.from('simulado_pasta_estudantes').select('estudante_id').eq('tenant_id', tenantId).in('pasta_id', pastas).limit(5000)) : Promise.resolve([]),
    q(() => svc.from('simulado_conteudo_leitura_progresso').select('aluno_id').eq('tenant_id', tenantId).eq('documento_id', documentoId).limit(5000)),
    q(() => svc.from('simulado_conteudo_anotacoes').select('aluno_id').eq('tenant_id', tenantId).eq('documento_id', documentoId).limit(5000)),
  ])
  for (const r of [...de, ...pe]) if (r.estudante_id) est.add(r.estudante_id)
  for (const r of [...lp, ...an]) if (r.aluno_id) est.add(r.aluno_id)
  for (const r of [...dg, ...pg]) if (r.grupo_id) grupos.add(r.grupo_id)
  if (grupos.size) {
    try {
      const m = await fetchAllByIn<any>([...grupos], (c) => svc.from('simulado_grupo_membros').select('estudante_id').in('grupo_id', c).order('estudante_id', { ascending: true }))
      for (const r of m) if (r.estudante_id) est.add(r.estudante_id)
    } catch { /* sem membros */ }
  }
  void fetchAll
  return [...est].slice(0, 20000)
}

export async function registrarAtualizacaoAction(input: {
  documentoId: string; tipo: TipoAtualizacao; texto: string; avisarAlunos: boolean; mostrarInicio: boolean
  origem?: { tipo: 'reporte' | 'pedido'; id: string } | null
}): Promise<{ ok: boolean; error?: string; id?: string; avisados?: number }> {
  const g = await guard(); if (!g.ok) return g
  if (!UUID.test(input.documentoId)) return { ok: false, error: 'Escolha o material.' }
  if (!TIPOS_ATUALIZACAO.some((t) => t.id === input.tipo)) return { ok: false, error: 'Tipo de atualização inválido.' }
  const texto = String(input.texto ?? '').trim()
  if (!texto) return { ok: false, error: 'Escreva o que mudou.' }
  if (texto.length > 2000) return { ok: false, error: 'O texto passou de 2.000 caracteres.' }
  const origem = input.origem && UUID.test(input.origem.id) && (input.origem.tipo === 'reporte' || input.origem.tipo === 'pedido') ? input.origem : null

  const svc = createAdminClient()
  const { data: doc } = await svc.from('simulado_conteudo_documentos').select('id, titulo, pasta_id, versao_atual_id').eq('tenant_id', g.tenantId).eq('id', input.documentoId).eq('deletado', false).maybeSingle()
  if (!doc) return { ok: false, error: 'Material não encontrado.' }

  const { data, error } = await svc.from('simulado_conteudo_atualizacoes').insert({
    tenant_id: g.tenantId, documento_id: input.documentoId, versao_id: (doc as any).versao_atual_id ?? null, tipo: input.tipo, texto,
    avisar_alunos: !!input.avisarAlunos, mostrar_inicio: !!input.mostrarInicio,
    origem_tipo: origem?.tipo ?? null, origem_id: origem?.id ?? null, criado_por: g.atorId,
  }).select('id').single()
  if (error || !data) return { ok: false, error: error && TABELA_AUSENTE.test(error.message) ? AVISO : error?.message || 'Falha ao registrar.' }
  const id = (data as any).id as string

  // Fecha a origem na fila: reporte vira "resolvido" (mesmo fluxo da Central de Demandas); pedido vira "atendido".
  if (origem?.tipo === 'reporte') {
    await resolverReporte(svc, { tenantId: g.tenantId, id: origem.id, status: 'resolvido', resolvidoPor: g.atorId }).catch(() => {})
  } else if (origem?.tipo === 'pedido') {
    await svc.from('simulado_conteudo_atualizacao_pedidos').update({ status: 'atendido', atualizacao_id: id, atendido_em: new Date().toISOString() }).eq('tenant_id', g.tenantId).eq('id', origem.id).eq('status', 'pendente')
  }
  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_conteudo_atualizacoes', entidadeId: id, atorId: g.atorId, tenantId: g.tenantId, depois: { documento_id: input.documentoId, tipo: input.tipo, avisar_alunos: !!input.avisarAlunos, origem } }).catch(() => {})
  // Aviso in-app (sino do aluno): best-effort, mesma fila de notificações do resto da plataforma.
  let avisados = 0
  if (input.avisarAlunos) {
    const dest = await destinatariosDoMaterial(svc, g.tenantId, input.documentoId, (doc as any).pasta_id ?? null)
    avisados = await criarNotificacoesEmMassa(svc, g.tenantId, dest, {
      tipo: 'material_atualizado', titulo: `Material atualizado: ${(doc as any).titulo ?? 'material'}`,
      mensagem: `${NOME_TIPO_ATUALIZACAO[input.tipo]}: ${texto.slice(0, 200)}`, link: `/aluno/nova/painel/leitor/${input.documentoId}`,
    })
  }
  // "Novidades do Início": uma novidade na categoria Materiais (lista do Início do aluno). Best-effort.
  if (input.mostrarInicio) {
    await svc.from('simulado_novidades').insert({
      tenant_id: g.tenantId, categoria: 'materiais', titulo: `Material atualizado: ${(doc as any).titulo ?? 'material'}`,
      descricao: `${NOME_TIPO_ATUALIZACAO[input.tipo]}: ${texto.slice(0, 400)}`, destaque: false, ativo: true,
      cta_label: 'Abrir o material', cta_url: `/aluno/nova/painel/leitor/${input.documentoId}`, publicado_em: new Date().toISOString(),
    }).then(() => {}, () => {})
  }
  revalidatePath('/admin/revisao/atualizacoes')
  return { ok: true, id, avisados }
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
