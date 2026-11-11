'use server'
// CS › Grupos de acesso — criar / editar / "criar turma a partir de outra". Reusa criarGrupo/moverGrupo/excluir
// das actions EXISTENTES de /admin/grupos e acrescenta: validade padrão, produto no Guru (mapeamento da
// integração) e cursos que o grupo libera (simulado_produto_itens tipo_item='grupo').
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { registrarAudit } from '@/lib/audit'
import { criarGrupo, moverGrupo } from '@/app/admin/grupos/actions'
import type { GrupoForm } from '@/lib/admin-revisao/cs-tipos'
import { guardCs, isUuid, limparCachesCs } from '@/lib/admin-revisao/cs-server'

type R = { ok: boolean; error?: string; id?: string }


function revalidar(id?: string) {
  revalidatePath('/admin/revisao/grupos')
  revalidatePath('/admin/revisao/membros')
  revalidatePath('/admin/grupos')
  if (id) revalidatePath(`/admin/grupos/${id}`)
}

async function definirCursos(tenantId: string, grupoId: string, produtoIds: string[]) {
  const svc = createAdminClient()
  const { data: atuais } = await svc.from('simulado_produto_itens').select('id, produto_id').eq('tenant_id', tenantId).eq('tipo_item', 'grupo').eq('item_id', grupoId).limit(500)
  const querem = new Set(produtoIds)
  const remover = ((atuais ?? []) as { id: string; produto_id: string }[]).filter((i) => !querem.has(i.produto_id)).map((i) => i.id)
  for (let i = 0; i < remover.length; i += 80) await svc.from('simulado_produto_itens').delete().eq('tenant_id', tenantId).in('id', remover.slice(i, i + 80))
  if (produtoIds.length) {
    const { error } = await svc.from('simulado_produto_itens').upsert(
      produtoIds.map((produto_id) => ({ tenant_id: tenantId, produto_id, tipo_item: 'grupo', item_id: grupoId, ativo: true })),
      { onConflict: 'produto_id,tipo_item,item_id' })
    if (error) throw new Error(error.message)
  }
}

async function definirGuru(tenantId: string, grupoId: string, nome: string, codigo: string | null) {
  const svc = createAdminClient()
  if (codigo) {
    // 1 fonte (provider+código) → 1 grupo: se já apontava para outro grupo, passa a apontar para este.
    const { error } = await svc.from('simulado_integracao_mapeamentos').upsert(
      { tenant_id: tenantId, provider: 'guru', fonte_ref: codigo, fonte_nome: nome, grupo_id: grupoId, ativo: true, atualizado_em: new Date().toISOString() },
      { onConflict: 'tenant_id,provider,fonte_ref' })
    if (error) throw new Error(error.message)
    // remove outros códigos Guru que apontavam para ESTE grupo (edição trocou o código)
    await svc.from('simulado_integracao_mapeamentos').delete().eq('tenant_id', tenantId).eq('provider', 'guru').eq('grupo_id', grupoId).neq('fonte_ref', codigo)
  } else {
    await svc.from('simulado_integracao_mapeamentos').delete().eq('tenant_id', tenantId).eq('provider', 'guru').eq('grupo_id', grupoId)
  }
}

function validar(f: GrupoForm): string | null {
  if (!f.nome?.trim()) return 'Dê um nome ao grupo.'
  if (f.pastaId && !isUuid(f.pastaId)) return 'Pasta inválida.'
  if (f.validadeTipo === 'meses_apos_compra' && !(Number(f.validadeMeses) >= 1 && Number(f.validadeMeses) <= 240)) return 'Informe a quantidade de meses (1 a 240).'
  if (f.validadeTipo === 'ate_data' && !/^\d{4}-\d{2}-\d{2}$/.test(f.validadeAte ?? '')) return 'Informe a data de validade.'
  if (f.cursoIds.some((c) => !isUuid(c))) return 'Curso inválido.'
  if (f.codigoGuru && !/^[\w\-.]{1,80}$/.test(f.codigoGuru.trim())) return 'Código do produto no Guru inválido.'
  return null
}

async function gravarExtras(tenantId: string, id: string, f: GrupoForm) {
  const svc = createAdminClient()
  const val = {
    validade_tipo: f.validadeTipo || null,
    validade_meses: f.validadeTipo === 'meses_apos_compra' ? Number(f.validadeMeses) : null,
    validade_ate: f.validadeTipo === 'ate_data' ? f.validadeAte : null,
  }
  const { error } = await svc.from('simulado_grupos').update(val).eq('tenant_id', tenantId).eq('id', id)
  if (error && /column|schema cache/i.test(error.message)) throw new Error('Aplique a migração 20261112040000 (validade do grupo) e tente de novo.')
  if (error) throw new Error(error.message)
  await definirCursos(tenantId, id, f.cursoIds)
  await definirGuru(tenantId, id, f.nome.trim(), f.codigoGuru?.trim() || null)
}

/** "Criar grupo" e "Criar turma a partir de outra" (copiarDeId: copia cursos, pasta e validade — NÃO copia alunos). */
export async function criarGrupoRevisaoAction(f: GrupoForm): Promise<R> {
  const g = await guardCs('grupos:view'); if (!g.ok) return g
  const erro = validar(f); if (erro) return { ok: false, error: erro }
  const r = await criarGrupo(f.nome)
  if (!r.ok || !r.id) return { ok: false, error: r.error ?? 'Falha ao criar o grupo.' }
  try {
    if (f.pastaId) { const m = await moverGrupo(r.id, f.pastaId); if (!m.ok) throw new Error(m.error) }
    await gravarExtras(g.tenantId, r.id, f)
  } catch (e: any) {
    return { ok: false, id: r.id, error: `Grupo criado, mas faltou salvar os detalhes: ${e?.message ?? e}` }
  }
  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_grupos', entidadeId: r.id, depois: { nome: f.nome.trim(), pasta_id: f.pastaId ?? null, validade_tipo: f.validadeTipo || null, cursos: f.cursoIds.length, guru: f.codigoGuru || null, copiado_de: f.copiarDeId ?? null } })
  await limparCachesCs(g.tenantId)
  revalidar(r.id)
  return { ok: true, id: r.id }
}

export async function editarGrupoRevisaoAction(f: GrupoForm): Promise<R> {
  const g = await guardCs('grupos:view'); if (!g.ok) return g
  if (!isUuid(f.id)) return { ok: false, error: 'Grupo inválido.' }
  const erro = validar(f); if (erro) return { ok: false, error: erro }
  const svc = createAdminClient()
  const { data: antes } = await svc.from('simulado_grupos').select('nome, pai_id').eq('tenant_id', g.tenantId).eq('id', f.id).maybeSingle()
  if (!antes) return { ok: false, error: 'Grupo não encontrado.' }
  const { error } = await svc.from('simulado_grupos').update({ nome: f.nome.trim() }).eq('tenant_id', g.tenantId).eq('id', f.id)
  if (error) return { ok: false, error: error.message }
  try {
    const m = await moverGrupo(f.id, f.pastaId || null); if (!m.ok) throw new Error(m.error)
    await gravarExtras(g.tenantId, f.id, f)
  } catch (e: any) { return { ok: false, error: e?.message ?? String(e) } }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_grupos', entidadeId: f.id, antes: antes as Record<string, unknown>, depois: { nome: f.nome.trim(), pasta_id: f.pastaId ?? null, validade_tipo: f.validadeTipo || null, cursos: f.cursoIds.length, guru: f.codigoGuru || null } })
  await limparCachesCs(g.tenantId)
  revalidar(f.id)
  return { ok: true, id: f.id }
}

/** Dados do grupo-base para "Criar turma a partir de outra" (pasta, validade e cursos já preenchem o formulário). */
export async function lerGrupoBaseAction(id: string): Promise<{ ok: boolean; error?: string; base?: Omit<GrupoForm, 'nome' | 'id' | 'copiarDeId' | 'codigoGuru'> }> {
  const g = await guardCs('grupos:view'); if (!g.ok) return g
  if (!isUuid(id)) return { ok: false, error: 'Grupo inválido.' }
  const svc = createAdminClient()
  let r: any = await svc.from('simulado_grupos').select('pai_id, validade_tipo, validade_meses, validade_ate').eq('tenant_id', g.tenantId).eq('id', id).maybeSingle()
  if (r.error) r = await svc.from('simulado_grupos').select('pai_id').eq('tenant_id', g.tenantId).eq('id', id).maybeSingle()
  if (!r.data) return { ok: false, error: 'Grupo não encontrado.' }
  const { data: it } = await svc.from('simulado_produto_itens').select('produto_id').eq('tenant_id', g.tenantId).eq('tipo_item', 'grupo').eq('item_id', id).eq('ativo', true).limit(200)
  return {
    ok: true,
    base: {
      pastaId: r.data.pai_id ?? null, validadeTipo: (r.data.validade_tipo ?? '') as GrupoForm['validadeTipo'],
      validadeMeses: r.data.validade_meses ?? null, validadeAte: r.data.validade_ate ?? null,
      cursoIds: ((it ?? []) as { produto_id: string }[]).map((x) => x.produto_id),
    },
  }
}
