'use server'

/**
 * Importação do catálogo (spec §9).
 *
 * Divisão de trabalho pensada para o tamanho real dos dados (atividades.json tem 4 MB):
 * a VALIDAÇÃO roda no navegador — `lib/cronograma/importar.ts` é puro e importável do
 * cliente — e só o resultado sobe. O servidor recebe um cronograma por vez, com suas
 * metas, e grava pela RPC atômica.
 *
 * Importar em blocos por cronograma, e não tudo numa chamada, tem três ganhos: o payload
 * fica em centenas de KB (o maior cronograma tem 1.142 metas), a tela mostra progresso
 * numa operação que leva segundos, e uma falha no meio não desfaz o que já entrou. A
 * atomicidade que a spec exige continua onde importa: dentro de cada cronograma, é tudo
 * ou nada.
 */

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { chaveLink } from '@/lib/cronograma/formato-meta'
import type { CronogramaImportado, LinkImportado, MetaImportada } from '@/lib/cronograma/importar'

async function guard(perm: string) {
  if (!(await checkPermission(perm))) return { ok: false as const, error: 'Sem permissão.' }
  const access = await getCurrentAccess()
  if (!access.tenantId) return { ok: false as const, error: 'Tenant não resolvido.' }
  return { ok: true as const, tenantId: access.tenantId, atorId: access.userId ?? null }
}

export type EstadoAtual = {
  cronogramas: { slug: string; nome: string; status: string; metas: number }[]
  linksChaves: string[]
  plataformas: { id: string; nome: string; slug: string }[]
  /** Slugs de tipo cadastrados — a validação das metas confere contra eles. */
  tiposMeta: string[]
}

/** O que já existe no catálogo — o cliente usa para montar a prévia (o que entra/muda). */
export async function carregarEstadoAtual(): Promise<{ ok: boolean; estado?: EstadoAtual; error?: string }> {
  const g = await guard('cronogramas:view')
  if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()

  const [cronogramas, metas, links, plataformas, tipos] = await Promise.all([
    fetchAll<{ id: string; slug: string; nome: string; status: string }>(() =>
      svc
        .from('simulado_cronogramas')
        .select('id, slug, nome, status')
        .eq('tenant_id', g.tenantId)
        .eq('deletado', false)
        .order('slug') as any,
    ),
    fetchAll<{ cronograma_id: string }>(() =>
      svc.from('simulado_cronograma_metas').select('cronograma_id').eq('tenant_id', g.tenantId).order('id') as any,
    ),
    fetchAll<{ disciplina: string; aula: string }>(() =>
      svc.from('simulado_cronograma_links').select('disciplina, aula').eq('tenant_id', g.tenantId).order('disciplina').order('aula') as any,
    ),
    fetchAll<{ id: string; nome: string; slug: string }>(() =>
      svc.from('simulado_cronograma_plataformas').select('id, nome, slug').eq('tenant_id', g.tenantId).order('ordem') as any,
    ),
    fetchAll<{ slug: string }>(() =>
      svc.from('simulado_cronograma_tipos_meta').select('slug').eq('tenant_id', g.tenantId).eq('ativo', true).order('ordem') as any,
    ),
  ])

  const porCron = new Map<string, number>()
  for (const m of metas) porCron.set(m.cronograma_id, (porCron.get(m.cronograma_id) ?? 0) + 1)

  return {
    ok: true,
    estado: {
      cronogramas: cronogramas.map((c) => ({ slug: c.slug, nome: c.nome, status: c.status, metas: porCron.get(c.id) ?? 0 })),
      linksChaves: links.map((l) => chaveLink(l.disciplina, l.aula)).filter(Boolean) as string[],
      plataformas,
      tiposMeta: tipos.map((t) => t.slug),
    },
  }
}

/**
 * Importa UM cronograma e substitui todas as suas metas.
 *
 * A substituição vai pela função `simulado_cronograma_substituir_metas`, que faz
 * DELETE + INSERT numa transação só — o PostgREST não oferece transação multi-statement,
 * e um DELETE seguido de INSERT pela API deixaria o cronograma sem metas se o segundo
 * falhasse.
 */
export async function importarCronograma(
  cron: CronogramaImportado,
  metas: MetaImportada[],
): Promise<{ ok: boolean; criado?: boolean; antes?: number; depois?: number; error?: string }> {
  const g = await guard('cronogramas:update')
  if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()

  const { data: existente } = await svc
    .from('simulado_cronogramas')
    .select('id, status')
    .eq('tenant_id', g.tenantId)
    .eq('slug', cron.slug)
    .eq('deletado', false)
    .maybeSingle()

  // A categoria vem como TEXTO nos arquivos (é assim que o gerador legado a registra) e
  // aqui vira referência: resolve pelo nome, e cria se ainda não existir — importar não
  // deveria falhar por falta de cadastro prévio.
  const categoriaId = cron.categoria ? await resolverCategoria(svc, g.tenantId, cron.categoria) : null

  // Metadados do cronograma. `status` NUNCA entra no update: reimportar não pode
  // rebaixar um cronograma liberado (spec §9, item 5).
  const campos = {
    nome: cron.nome,
    subtitulo: cron.subtitulo,
    total_semanas: cron.total_semanas,
    dias_curso: cron.dias_curso,
    dias_nome: cron.dias_nome,
    semanas_revisao: cron.semanas_revisao,
    carga_horaria: cron.carga_horaria,
    categoria_id: categoriaId,
    fonte: cron.fonte,
    ordem: cron.ordem,
    atualizado_em: new Date().toISOString(),
  }

  let id: string
  let criado = false
  if (existente) {
    id = (existente as any).id
    const { error } = await svc.from('simulado_cronogramas').update(campos).eq('id', id).eq('tenant_id', g.tenantId)
    if (error) return { ok: false, error: `${cron.nome}: ${error.message}` }
  } else {
    const { data, error } = await svc
      .from('simulado_cronogramas')
      .insert({ tenant_id: g.tenantId, slug: cron.slug, status: 'rascunho', ...campos })
      .select('id')
      .single()
    if (error) return { ok: false, error: `${cron.nome}: ${error.message}` }
    id = (data as any).id
    criado = true
  }

  const { data: resultado, error: erroRpc } = await svc.rpc('simulado_cronograma_substituir_metas', {
    p_tenant: g.tenantId,
    p_cronograma: id,
    p_metas: metas.map((m) => ({
      semana: m.semana,
      dia: m.dia,
      tipo: m.tipo,
      disciplina: m.disciplina,
      aula: m.aula, // texto sempre — "01" não pode virar 1
      conteudo: m.conteudo,
      duracao: m.duracao,
      ordem: m.ordem,
    })),
  })
  if (erroRpc) return { ok: false, error: `${cron.nome}: ${erroRpc.message}` }

  const antes = (resultado as any)?.antes ?? 0
  const depois = (resultado as any)?.depois ?? 0
  await registrarAudit({
    operacao: criado ? 'INSERT' : 'UPDATE',
    entidade: 'simulado_cronograma_metas',
    entidadeId: id,
    depois: { cronograma_nome: cron.nome, importadas: depois, removidas: antes },
    atorId: g.atorId,
    tenantId: g.tenantId,
  })

  return { ok: true, criado, antes, depois }
}

/**
 * Importa os links de aula e seus N links por plataforma.
 *
 * Plataforma citada por slug que ainda não existe é CRIADA — importar um arquivo com
 * uma plataforma nova não deveria falhar por falta de cadastro prévio.
 */
export async function importarLinks(links: LinkImportado[]): Promise<{ ok: boolean; total?: number; urls?: number; plataformasNovas?: string[]; error?: string }> {
  const g = await guard('cronogramas:update')
  if (!g.ok) return { ok: false, error: g.error }
  if (!links.length) return { ok: true, total: 0, urls: 0, plataformasNovas: [] }
  const svc = createAdminClient()

  const { data: existentes } = await svc
    .from('simulado_cronograma_plataformas')
    .select('id, slug')
    .eq('tenant_id', g.tenantId)
  const porSlug = new Map<string, string>(((existentes ?? []) as any[]).map((p) => [p.slug, p.id]))

  const slugsCitados = new Set<string>()
  for (const l of links) for (const slug of Object.keys(l.urls)) slugsCitados.add(slug)

  const plataformasNovas: string[] = []
  for (const slug of slugsCitados) {
    if (porSlug.has(slug)) continue
    const { data } = await svc
      .from('simulado_cronograma_plataformas')
      .insert({ tenant_id: g.tenantId, nome: slug.toUpperCase(), slug, ordem: porSlug.size })
      .select('id')
      .single()
    if (data) {
      porSlug.set(slug, (data as any).id)
      plataformasNovas.push(slug)
    }
  }

  // Upsert das aulas em lotes (o par disciplina+aula é a chave natural).
  let urlsGravadas = 0
  for (let i = 0; i < links.length; i += 200) {
    const lote = links.slice(i, i + 200)
    const { data: gravados, error } = await svc
      .from('simulado_cronograma_links')
      .upsert(
        lote.map((l) => ({ tenant_id: g.tenantId, disciplina: l.disciplina, aula: l.aula, tema: l.tema, atualizado_em: new Date().toISOString() })),
        { onConflict: 'tenant_id,disciplina,aula' },
      )
      .select('id, disciplina, aula')
    if (error) return { ok: false, error: error.message }

    const idPorChave = new Map<string, string>()
    for (const gr of (gravados ?? []) as any[]) {
      const k = chaveLink(gr.disciplina, gr.aula)
      if (k) idPorChave.set(k, gr.id)
    }

    // Substitui os links daquelas aulas: apaga os atuais e insere os do arquivo.
    const ids = [...idPorChave.values()]
    if (ids.length) await svc.from('simulado_cronograma_aula_links').delete().eq('tenant_id', g.tenantId).in('link_id', ids)

    const novas: { tenant_id: string; link_id: string; plataforma_id: string; url: string }[] = []
    for (const l of lote) {
      const linkId = idPorChave.get(chaveLink(l.disciplina, l.aula) as string)
      if (!linkId) continue
      for (const [slug, url] of Object.entries(l.urls)) {
        const plataformaId = porSlug.get(slug)
        if (plataformaId && url) novas.push({ tenant_id: g.tenantId, link_id: linkId, plataforma_id: plataformaId, url })
      }
    }
    if (novas.length) {
      const { error: erroUrls } = await svc.from('simulado_cronograma_aula_links').insert(novas)
      if (erroUrls) return { ok: false, error: erroUrls.message }
      urlsGravadas += novas.length
    }
  }

  await registrarAudit({
    operacao: 'UPDATE',
    entidade: 'simulado_cronograma_links',
    depois: { aulas: links.length, links: urlsGravadas, plataformas_criadas: plataformasNovas },
    atorId: g.atorId,
    tenantId: g.tenantId,
  })
  revalidatePath('/admin/cronogramas/links')
  return { ok: true, total: links.length, urls: urlsGravadas, plataformasNovas }
}

/** Acha a categoria pelo nome (sem diferenciar caixa) ou cria uma nova. */
async function resolverCategoria(svc: any, tenantId: string, nome: string): Promise<string | null> {
  const n = nome.trim()
  if (!n) return null
  const { data: existente } = await svc
    .from('simulado_cronograma_categorias')
    .select('id')
    .eq('tenant_id', tenantId)
    .ilike('nome', n)
    .maybeSingle()
  if (existente) return (existente as any).id

  const slug = n
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const { data } = await svc
    .from('simulado_cronograma_categorias')
    .insert({ tenant_id: tenantId, nome: n, slug, ordem: 99 })
    .select('id')
    .single()
  return (data as any)?.id ?? null
}

/** Chamada no fim da importação, para as telas refletirem o catálogo novo. */
export async function finalizarImportacao(): Promise<{ ok: boolean }> {
  revalidatePath('/admin/cronogramas')
  revalidatePath('/admin/cronogramas/links')
  return { ok: true }
}
