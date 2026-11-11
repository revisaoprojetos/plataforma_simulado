'use server'

// CONSTRUTOR DA PÁGINA DO EXTENSIVO (aba Vitrine): lista ordenada de blocos
// [Progresso] [Plano de estudo] [Seções de módulos 1..N] [Banner/Carrossel].
// Persistência em simulado_produto_secoes (colunas existentes; config jsonb) — ver lib/produtos/blocos-pagina.ts.
// Mutação: permissão produtos:manage + service role + tenant_id + auditoria + revalidate.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { lerVersao } from '@/lib/produtos/pagina/loader'
import { normConfigCronograma, normConfigModulos, type TipoBloco } from '@/lib/produtos/blocos-pagina'

async function guard(manage: boolean) {
  const access = await getCurrentAccess()
  const ok = access.isAdmin || access.permissions.includes('produtos:manage') || (!manage && access.permissions.includes('produtos:view'))
  if (!ok) return { error: 'Sem permissão.' as const }
  if (!access.tenantId) return { error: 'Tenant não resolvido — recarregue a página.' as const }
  return { tenantId: access.tenantId }
}

interface ModuloRaiz { id: string; titulo: string; imagem_url: string | null }

/** Módulos de TOPO do produto (os que viram cards na página do aluno), na ordem do currículo + nº de aulas ativas. */
export async function carregarModulosRaizAction(produtoId: string) {
  const g = await guard(false); if ('error' in g) return { error: g.error }
  const svc = createAdminClient()
  try {
    const mods = await fetchAll<any>(() => svc.from('simulado_produto_modulos').select('id, titulo, imagem_url, pai_id')
      .eq('tenant_id', g.tenantId).eq('produto_id', produtoId).eq('deletado', false)
      .order('ordem', { ascending: true }).order('id', { ascending: true }) as any, 1000, 'pagina:modulos')
    const raizes = mods.filter((m) => !m.pai_id)
    return { ok: true as const, modulos: raizes.map((m): ModuloRaiz => ({ id: m.id, titulo: m.titulo, imagem_url: m.imagem_url ?? null })) }
  } catch { return { ok: true as const, modulos: [] as ModuloRaiz[] } }
}

interface BlocoIn { tipo: TipoBloco; nome: string | null; tamanho?: string; ordenacao?: string; ativo: boolean; config: any }

const TIPOS: TipoBloco[] = ['banner', 'carrossel', 'progresso', 'cronograma', 'modulos']

export async function salvarPaginaExtensivoAction(produtoId: string, blocos: BlocoIn[]) {
  const g = await guard(true); if ('error' in g) return { error: g.error }
  if (!Array.isArray(blocos) || blocos.length > 120) return { error: 'Quantidade de blocos inválida.' }
  const svc = createAdminClient()
  const { data: prod } = await svc.from('simulado_produtos').select('id').eq('tenant_id', g.tenantId).eq('id', produtoId).maybeSingle()
  if (!prod) return { error: 'Produto não encontrado.' }
  // Página já gerida pelo editor visual (versão publicada na tabela nova): o modo simples não pode mais sobrescrever o legado.
  if (await lerVersao(g.tenantId, produtoId, 'publicado')) return { error: 'Esta página agora é gerida pelo editor visual (já existe uma versão publicada). Edite e publique por lá.' }

  // Sanitiza: tipos válidos; módulos só do próprio produto (sem duplicar em 2 seções); 1 única seção "restantes".
  let moduloValido: Set<string>
  try {
    const mods = await fetchAll<any>(() => svc.from('simulado_produto_modulos').select('id')
      .eq('tenant_id', g.tenantId).eq('produto_id', produtoId).eq('deletado', false).order('id', { ascending: true }) as any, 1000, 'pagina:valid')
    moduloValido = new Set(mods.map((m) => m.id as string))
  } catch { moduloValido = new Set() }
  const usados = new Set<string>()
  let temRestantes = false
  const rows = blocos.filter((b) => TIPOS.includes(b.tipo)).map((b, i) => {
    let config: any = b.config && typeof b.config === 'object' ? b.config : {}
    if (b.tipo === 'modulos') {
      const c = normConfigModulos(config)
      c.modulo_ids = c.modulo_ids.filter((id) => moduloValido.has(id) && !usados.has(id))
      c.modulo_ids.forEach((id) => usados.add(id))
      if (c.restantes) { if (temRestantes) c.restantes = false; else temRestantes = true }
      config = c
    } else if (b.tipo === 'cronograma') config = normConfigCronograma(config)
    else if (b.tipo === 'progresso') config = {}
    return {
      tenant_id: g.tenantId, produto_id: produtoId, ordem: i, tipo: b.tipo, nome: b.nome?.trim().slice(0, 120) || null,
      tamanho: b.tamanho || 'vertical_small', ordenacao: b.ordenacao || 'manual', config, ativo: b.ativo !== false,
    }
  })

  // Os itens liberados (não-grupo) derivam dos carrosséis. Só re-deriva se havia ou há carrosséis — salvar a
  // organização de módulos NÃO pode apagar itens liberados por outras vias.
  const { data: antes } = await svc.from('simulado_produto_secoes').select('id').eq('tenant_id', g.tenantId).eq('produto_id', produtoId).eq('tipo', 'carrossel').limit(1)
  const haCarrossel = rows.some((r) => r.tipo === 'carrossel') || (antes ?? []).length > 0

  const del = await svc.from('simulado_produto_secoes').delete().eq('produto_id', produtoId).eq('tenant_id', g.tenantId)
  if (del.error) return { error: del.error.message }
  if (rows.length) { const { error } = await svc.from('simulado_produto_secoes').insert(rows); if (error) return { error: error.message } }

  if (haCarrossel) {
    const seen = new Set<string>(); const itens: { tipo_item: string; item_id: string }[] = []
    for (const r of rows) if (r.tipo === 'carrossel') for (const it of ((r.config as any)?.itens ?? [])) {
      if (!it?.tipo_item || !it?.item_id || it.tipo_item === 'grupo') continue
      const k = `${it.tipo_item}:${it.item_id}`; if (seen.has(k)) continue; seen.add(k); itens.push({ tipo_item: it.tipo_item, item_id: it.item_id })
    }
    await svc.from('simulado_produto_itens').delete().eq('produto_id', produtoId).eq('tenant_id', g.tenantId).neq('tipo_item', 'grupo')
    if (itens.length) { const { error } = await svc.from('simulado_produto_itens').insert(itens.map((i) => ({ tenant_id: g.tenantId, produto_id: produtoId, tipo_item: i.tipo_item, item_id: i.item_id, ativo: true }))); if (error) return { error: error.message } }
  }

  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_produto_secoes', entidadeId: produtoId, depois: { blocos: rows.map((r) => ({ tipo: r.tipo, nome: r.nome, ativo: r.ativo, modulos: r.tipo === 'modulos' ? (r.config as any).modulo_ids?.length : undefined })) }, tenantId: g.tenantId })
  revalidatePath('/admin/produtos'); revalidatePath(`/admin/conteudos/produtos/${produtoId}`); revalidatePath('/aluno/extensivos', 'layout')
  return { ok: true as const }
}
