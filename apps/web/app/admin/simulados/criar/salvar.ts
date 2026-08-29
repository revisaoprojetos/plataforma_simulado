'use server'

// Ação PESADA da criação (cria banco + simulado + questões + estudantes + cadernos). Fica num
// módulo próprio e é carregada SOB DEMANDA pelo stepper (import dinâmico no clique "Criar"),
// para não pesar a compilação do layout/etapas no dev.
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { checkPermission } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { brtLocalParaIso } from '@/lib/brt'
import { criarBanco, criarPastaFolder, adicionarQuestoes, confirmarImportQuestoes, atualizarBanco } from '@/app/admin/banco-questoes/actions'
import { vincularEstudantes, vincularGrupoAoBanco } from '@/app/admin/banco-questoes/estudantes-actions'
import { criarCadernoParaSlot } from '@/app/admin/cadernos-teste/actions'

interface CriarSimuladoPayload {
  bancoNome: string
  simuladoNome: string
  tipo: 'objetivo' | 'discursivo'
  cor: string | null
  icone: string | null
  capaUrl: string | null
  capaCardUrl: string | null
  questoesSelecionadas: string[]
  questoesImportadas: any[]
  folhaModeloId: string | null
  enunciadoPdf: { url: string; nome: string } | null
  gabaritoPdf: { url: string; nome: string } | null
  estudanteIds: string[]
  grupoIds: string[]
  info: {
    descricao: string; instrucoes: string; modo_aplicacao: string
    data_inicio: string; data_fim: string; prazo_valor: number | null; prazo_unidade: string
    tempo_limite_min: number | null; metodo_identificacao: string; embed_ativo: boolean
  }
  regras: Record<string, any>
  simuladoFolder: { mode: 'raiz' | 'existente' | 'nova'; id?: string | null; nome?: string }
  bancoFolder: { mode: 'raiz' | 'existente' | 'nova'; id?: string | null; nome?: string }
}

/** Normaliza a `regras` (campos vindos como string) + acrescenta prazo. */
function montarRegrasCriar(p: CriarSimuladoPayload): Record<string, unknown> {
  const r: Record<string, any> = { ...p.regras }
  r.retentativas = r.retentativas_ilimitadas ? null : (Number(r.retentativas) || 1)
  r.peso_padrao = Number(r.peso_padrao) || 1
  r.tempo_por_questao_seg = r.tempo_por_questao_seg ? (Number(r.tempo_por_questao_seg) || null) : null
  r.tolerancia_atraso_min = r.iniciar_atrasado ? (Number(r.tolerancia_atraso_min) || null) : null
  r.instrucoes = p.info.instrucoes || null
  if (p.info.modo_aplicacao === 'prazo_relativo') {
    r.prazo_valor = p.info.prazo_valor || null
    r.prazo_unidade = p.info.prazo_unidade
  }
  return r
}

/**
 * Cria, em UMA chamada, o BANCO (com questões/estudantes) e o SIMULADO (rascunho) baseado nele —
 * o fluxo página-por-página. Banco antes do simulado; se o simulado falhar, o banco é removido
 * (best-effort) p/ não deixar órfão. NÃO redireciona: devolve os ids p/ o cliente navegar.
 */
export async function criarSimuladoCompletoAction(p: CriarSimuladoPayload): Promise<{ error?: string; simuladoId?: string; bancoId?: string }> {
  if (!(await checkPermission('simulados:create'))) return { error: 'Você não tem permissão para criar simulados.' }
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return { error: 'Tenant não resolvido. Verifique o acesso.' }
  if (!p.bancoNome?.trim() || !p.simuladoNome?.trim()) return { error: 'Informe os nomes do banco e do simulado.' }

  const svc = createAdminClient()
  const tipoBanco = p.tipo === 'discursivo' ? 'discursiva' : 'objetiva'

  // 1) Pastas (cria as "novas").
  async function resolverPasta(f: CriarSimuladoPayload['bancoFolder'], area: 'simulado' | 'banco'): Promise<string | null> {
    if (f.mode === 'existente' && f.id) return f.id
    if (f.mode === 'nova' && f.nome?.trim()) { const r = await criarPastaFolder(f.nome.trim(), null, area); return r.ok ? (r.id ?? null) : null }
    return null
  }
  const bancoFolderId = await resolverPasta(p.bancoFolder, 'banco')
  const simuladoFolderId = await resolverPasta(p.simuladoFolder, 'simulado')

  // 2) BANCO (reusa criarBanco + atualizarBanco p/ visual).
  const cb = await criarBanco(p.bancoNome.trim(), tipoBanco, bancoFolderId)
  if (!cb.ok || !cb.id) return { error: cb.error ?? 'Falha ao criar o banco.' }
  const bancoId = cb.id
  try { await atualizarBanco(bancoId, p.bancoNome.trim(), p.cor, p.icone, p.capaUrl, p.capaCardUrl) } catch { /* visual best-effort */ }

  // 3) Questões → banco (import cria; seleção vincula).
  if (p.questoesImportadas?.length) {
    const imp = await confirmarImportQuestoes(bancoId, p.questoesImportadas)
    if (!imp.ok) return { error: imp.error ?? 'Falha na importação das questões.', bancoId }
  }
  if (p.questoesSelecionadas?.length) await adicionarQuestoes(bancoId, p.questoesSelecionadas)

  // Ordem canônica das questões do banco → prova.
  const ordered: string[] = []
  {
    const seen = new Set<string>()
    let off = 0
    while (true) {
      const { data } = await svc.from('simulado_questao_pasta').select('questao_id').eq('pasta_id', bancoId).range(off, off + 999)
      if (!Array.isArray(data) || data.length === 0) break
      for (const v of data as any[]) if (v.questao_id && !seen.has(v.questao_id)) { seen.add(v.questao_id); ordered.push(v.questao_id) }
      if (data.length < 1000) break
      off += 1000
    }
  }

  // 4) Estudantes/grupos → banco (best-effort).
  for (const gid of p.grupoIds ?? []) { try { await vincularGrupoAoBanco(bancoId, gid) } catch { /* ignora */ } }
  if (p.estudanteIds?.length) { try { await vincularEstudantes(bancoId, p.estudanteIds) } catch { /* ignora */ } }

  // 4b) Cadernos → banco (folha = modelo do sistema; enunciado/gabarito = PDFs já hospedados). Best-effort.
  try {
    if (p.folhaModeloId) await criarCadernoParaSlot(bancoId, 'folha', p.folhaModeloId)
    if (p.enunciadoPdf || p.gabaritoPdf) {
      const { data: pastaC } = await svc.from('simulado_pastas').select('caderno_entrega').eq('id', bancoId).eq('tenant_id', tenantId).maybeSingle()
      const ent = (((pastaC as any)?.caderno_entrega) ?? {}) as Record<string, unknown>
      if (p.enunciadoPdf) ent.enunciado = { pdfUrl: p.enunciadoPdf.url, pdfNome: p.enunciadoPdf.nome }
      if (p.gabaritoPdf) ent.gabarito = { pdfUrl: p.gabaritoPdf.url, pdfNome: p.gabaritoPdf.nome }
      await svc.from('simulado_pastas').update({ caderno_entrega: ent }).eq('id', bancoId).eq('tenant_id', tenantId)
    }
  } catch { /* cadernos best-effort */ }

  // 5) SIMULADO (rascunho, na pasta escolhida).
  const regras = montarRegrasCriar(p)
  const baseInsert: Record<string, unknown> = {
    tenant_id: tenantId,
    titulo: p.simuladoNome.trim(),
    descricao: p.info.descricao || null,
    modo_aplicacao: p.info.modo_aplicacao,
    data_inicio: brtLocalParaIso(p.info.data_inicio || undefined),
    data_fim: brtLocalParaIso(p.info.data_fim || undefined),
    tempo_limite_min: p.info.tempo_limite_min || null,
    metodo_identificacao: p.info.metodo_identificacao || null,
    embed_ativo: p.info.embed_ativo ?? false,
    regras: { ...regras, tipo: p.tipo, banco_base_id: bancoId },
    status: 'rascunho',
    created_at: new Date().toISOString(),
  }
  let ins = await svc.from('simulado_simulados').insert({ ...baseInsert, pasta_id: simuladoFolderId }).select().single()
  if (ins.error && /pasta_id/i.test(ins.error.message)) ins = await svc.from('simulado_simulados').insert(baseInsert).select().single()
  const simulado = ins.data
  if (ins.error || !simulado) {
    try { await svc.from('simulado_pastas').update({ deletado: true }).eq('id', bancoId).eq('tenant_id', tenantId) } catch { /* ignora */ }
    return { error: ins.error?.message ?? 'Falha ao criar o simulado.', bancoId }
  }

  // 6) prova_questoes (herda anulada; tolerante à coluna).
  if (ordered.length) {
    const { data: anulRows } = await svc.from('simulado_questoes').select('id').eq('tenant_id', tenantId).eq('anulada', true).in('id', ordered)
    const anulSet = new Set(((anulRows ?? []) as any[]).map((r) => r.id as string))
    const rows = ordered.map((questao_id, i) => ({ tenant_id: tenantId, simulado_id: simulado.id, questao_id, ordem: i, ...(anulSet.has(questao_id) ? { anulada: true } : {}) }))
    const insQ = await svc.from('simulado_prova_questoes').insert(rows)
    if (insQ.error && /anulada/i.test(insQ.error.message)) {
      await svc.from('simulado_prova_questoes').insert(ordered.map((questao_id, i) => ({ tenant_id: tenantId, simulado_id: simulado.id, questao_id, ordem: i })))
    }
  }

  // 7) matriculas (roster do banco + individuais; upsert idempotente).
  {
    const aMatricular = new Set<string>((p.estudanteIds ?? []).filter(Boolean))
    const { data: alunos } = await svc.from('simulado_pasta_estudantes').select('estudante_id').eq('pasta_id', bancoId).eq('tenant_id', tenantId)
    for (const a of (alunos ?? []) as any[]) if (a.estudante_id) aMatricular.add(a.estudante_id)
    const estIds = [...aMatricular]
    for (let i = 0; i < estIds.length; i += 500) {
      const lote = estIds.slice(i, i + 500).map((estudante_id) => ({ tenant_id: tenantId, estudante_id, simulado_id: simulado.id, liberado: true }))
      const { error } = await svc.from('simulado_matriculas').upsert(lote, { onConflict: 'tenant_id,estudante_id,simulado_id', ignoreDuplicates: true })
      if (error && /no unique|exclusion constraint|on conflict|42P10/i.test(error.message)) await svc.from('simulado_matriculas').insert(lote)
    }
  }

  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_simulados', entidadeId: simulado.id, depois: { banco_id: bancoId, questoes: ordered.length, estudantes: p.estudanteIds?.length ?? 0, grupos: p.grupoIds?.length ?? 0 } })
  revalidatePath('/admin/simulados')
  revalidatePath('/admin/banco-questoes')
  return { simuladoId: simulado.id, bancoId }
}
