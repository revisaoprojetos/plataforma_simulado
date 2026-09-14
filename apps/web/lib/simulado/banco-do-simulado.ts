import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAll } from '@/lib/supabase/fetch-all'

/**
 * Ponte simulado → banco (container de conteúdo).
 *
 * Um simulado referencia seu banco por `regras.banco_base_id`. As questões, HUD, caderno, grupos e
 * o visual (capa/cor/ícone) moram no BANCO (`simulado_pastas`), resolvidos por esse id. A
 * consolidação "Banco dentro da Aplicação" mantém o banco como container INTERNO e edita tudo a
 * partir da tela do simulado — então toda aba de conteúdo precisa de um banco válido para operar.
 *
 * Simulados antigos/avulsos podem não ter `banco_base_id` (as questões estão só em
 * `simulado_prova_questoes`). `garantirBancoDoSimulado` cria o banco e faz o backfill sob demanda.
 */

type Svc = SupabaseClient

/** True se a pasta existe, é um banco (não pasta-folder) e não foi deletada. */
async function bancoValido(svc: Svc, tenantId: string, bancoId: string): Promise<boolean> {
  const { data } = await svc
    .from('simulado_pastas')
    .select('id, is_folder, deletado')
    .eq('id', bancoId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (!data) return false
  const d = data as { is_folder?: boolean | null; deletado?: boolean | null }
  return !d.deletado && d.is_folder !== true
}

/**
 * Resolve (SEM escrever) o `banco_base_id` de um simulado, validando que o banco existe e não foi
 * removido. Retorna null quando o simulado não tem banco vinculado ou o vínculo está quebrado.
 */
export async function bancoDoSimulado(svc: Svc, tenantId: string, simuladoId: string): Promise<string | null> {
  const { data } = await svc
    .from('simulado_simulados')
    .select('regras')
    .eq('id', simuladoId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  const bb = (data as { regras?: { banco_base_id?: string } | null } | null)?.regras?.banco_base_id
  if (!bb) return null
  return (await bancoValido(svc, tenantId, bb)) ? bb : null
}

/**
 * Lista os simulados (não deletados) que herdam de um mesmo banco. Base do aviso de "desmembrar"
 * (fork) da decisão D1 — quando um banco alimenta >1 simulado, editar conteúdo num deles afetaria
 * os outros.
 */
export async function simuladosDoBanco(svc: Svc, tenantId: string, bancoId: string): Promise<string[]> {
  const { data } = await svc
    .from('simulado_simulados')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('deletado', false)
    .filter('regras->>banco_base_id', 'eq', bancoId)
  return ((data ?? []) as { id: string }[]).map((s) => s.id).filter(Boolean)
}

export interface GarantirBancoResult {
  bancoId: string | null
  /** true quando um banco foi criado agora (backfill de simulado antigo/avulso). */
  criado: boolean
  error?: string
}

/**
 * Garante que o simulado tenha um banco container. Se já houver um válido, devolve-o. Senão, cria um
 * banco (`simulado_pastas`, is_folder=false, folder_area='banco'), copia as questões da prova para
 * `simulado_questao_pasta` (preservando a ordem em `ordem_questoes`) e grava `regras.banco_base_id`.
 * Idempotente. Não redireciona nem audita — o chamador (server action da aba) cuida disso.
 */
export async function garantirBancoDoSimulado(
  svc: Svc,
  tenantId: string,
  simuladoId: string,
): Promise<GarantirBancoResult> {
  const { data: sim } = await svc
    .from('simulado_simulados')
    .select('titulo, regras')
    .eq('id', simuladoId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (!sim) return { bancoId: null, criado: false, error: 'Simulado não encontrado.' }
  const regras = ((sim as { regras?: Record<string, unknown> | null }).regras ?? {}) as Record<string, unknown>
  const bbAtual = regras.banco_base_id as string | undefined
  if (bbAtual && (await bancoValido(svc, tenantId, bbAtual))) return { bancoId: bbAtual, criado: false }

  // Questões da prova, na ordem — vira o conteúdo do novo banco.
  const provas = await fetchAll<any>(() =>
    svc
      .from('simulado_prova_questoes')
      .select('questao_id, ordem, questoes:simulado_questoes(tipo)')
      .eq('simulado_id', simuladoId)
      .eq('tenant_id', tenantId)
      .order('ordem', { ascending: true }),
  )
  // O relacionamento embedado vem como array na tipagem do supabase; normaliza p/ o tipo.
  const tipoDa = (p: any): string | undefined => (Array.isArray(p?.questoes) ? p.questoes[0]?.tipo : p?.questoes?.tipo)
  const ordenadas: string[] = []
  const visto = new Set<string>()
  for (const p of provas) if (p.questao_id && !visto.has(p.questao_id)) { visto.add(p.questao_id); ordenadas.push(p.questao_id) }
  const tipo = provas.length > 0 && provas.every((p) => tipoDa(p) === 'discursiva') ? 'discursiva' : 'objetiva'

  // Cria o banco container (tolerante a colunas ainda não migradas: folder_area, is_folder, tipo).
  const nome = ((sim as { titulo?: string }).titulo ?? 'Simulado').trim() || 'Simulado'
  const base: Record<string, unknown> = { tenant_id: tenantId, nome, tipo, is_folder: false, folder_area: 'banco' }
  let ins = await svc.from('simulado_pastas').insert(base).select('id').single()
  if (ins.error && /folder_area/i.test(ins.error.message) && 'folder_area' in base) { delete base.folder_area; ins = await svc.from('simulado_pastas').insert(base).select('id').single() }
  if (ins.error && /is_folder/i.test(ins.error.message) && 'is_folder' in base) { delete base.is_folder; ins = await svc.from('simulado_pastas').insert(base).select('id').single() }
  if (ins.error && /tipo/i.test(ins.error.message) && 'tipo' in base) { delete base.tipo; ins = await svc.from('simulado_pastas').insert(base).select('id').single() }
  if (ins.error || !ins.data) return { bancoId: null, criado: false, error: ins.error?.message ?? 'Falha ao criar o banco container.' }
  const bancoId = (ins.data as { id: string }).id

  // Backfill das questões no banco (simulado_questao_pasta) em lotes.
  if (ordenadas.length) {
    const rows = ordenadas.map((questao_id) => ({ tenant_id: tenantId, pasta_id: bancoId, questao_id }))
    for (let i = 0; i < rows.length; i += 500) {
      const lote = rows.slice(i, i + 500)
      const { error } = await svc.from('simulado_questao_pasta').upsert(lote, { onConflict: 'tenant_id,pasta_id,questao_id', ignoreDuplicates: true })
      if (error && /no unique|on conflict|42P10/i.test(error.message)) await svc.from('simulado_questao_pasta').insert(lote)
    }
    // Ordem manual do banco (tolerante à coluna).
    const { error: eOrd } = await svc.from('simulado_pastas').update({ ordem_questoes: ordenadas }).eq('id', bancoId).eq('tenant_id', tenantId)
    if (eOrd && !/ordem_questoes|column/i.test(eOrd.message)) { /* ordem best-effort */ }
  }

  // Vincula o simulado ao novo banco.
  const { error: eUpd } = await svc
    .from('simulado_simulados')
    .update({ regras: { ...regras, banco_base_id: bancoId } })
    .eq('id', simuladoId)
    .eq('tenant_id', tenantId)
  if (eUpd) return { bancoId: null, criado: false, error: eUpd.message }

  return { bancoId, criado: true }
}
