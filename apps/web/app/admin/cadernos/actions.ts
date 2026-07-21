'use server'

import { createHash } from 'crypto'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { softDelete } from '@/lib/soft-delete'
import { hospedarImagensDoc } from '@/lib/caderno-designer/hospedar-imagens'

export interface CadernoBloco {
  id: string
  tipo: 'texto' | 'questao'
  conteudo?: string
  questao_id?: string
}
export interface CadernoConfig {
  cabecalho?: string
  instrucoes?: string
  blocos: CadernoBloco[]
}

export async function criarCaderno(nome: string, pastaId?: string | null): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!(await checkPermission('questoes:create')) && !(await checkPermission('questoes:update'))) {
    return { ok: false, error: 'Sem permissão.' }
  }
  const access = await getCurrentAccess()
  if (!nome.trim()) return { ok: false, error: 'Informe um nome.' }

  const svc = createAdminClient()
  // Nasce DENTRO da pasta atual (pasta_id) quando aberto de dentro de uma. Tolerante à coluna.
  const base: Record<string, unknown> = { tenant_id: access.tenantId, nome: nome.trim(), config: { blocos: [] } }
  if (pastaId) base.pasta_id = pastaId
  let ins = await svc.from('simulado_cadernos_designer').insert(base).select('id').single()
  if (ins.error && /pasta_id/i.test(ins.error.message) && 'pasta_id' in base) { delete base.pasta_id; ins = await svc.from('simulado_cadernos_designer').insert(base).select('id').single() }
  if (ins.error || !ins.data) return { ok: false, error: ins.error?.message ?? 'Erro ao criar' }

  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_cadernos_designer', entidadeId: ins.data.id, depois: { nome } })
  // Sem revalidatePath aqui: revalidar a rota atual corre com o redirect do cliente
  // pro editor e cancela a navegação. A lista revalida ao voltar.
  return { ok: true, id: ins.data.id }
}

function contarBlocosConfig(config: any): number {
  if (config?.docsV2) {
    let n = 0
    for (const doc of Object.values(config.docsV2) as any[]) for (const p of doc?.pages ?? []) n += (p.blocks?.length ?? 0)
    return n
  }
  return (config?.blocos ?? []).length
}

export type CadernoRow = { id: string; nome: string; blocos: number; cor: string | null; icone: string | null; capa: string | null }

/**
 * Cópia LITERAL de um caderno: TODA a config (docsV2/modalidadesV2/cores/material/bancoId…),
 * cor, ícone, capa E a pasta (pasta_id). `opts.nome`/`opts.pastaId` sobrescrevem; `sufixoCopia`
 * acrescenta " (cópia)". Retorna o item pronto pra lista (ou null). Reusável.
 */
async function copiarCadernoInterno(
  svc: ReturnType<typeof createAdminClient>, tenantId: string, origId: string,
  opts: { nome?: string; pastaId?: string | null; sufixoCopia?: boolean } = {},
): Promise<CadernoRow | null> {
  let origem: any = null
  {
    const r = await svc.from('simulado_cadernos_designer').select('nome, config, cor, icone, capa_url, pasta_id').eq('id', origId).eq('tenant_id', tenantId).eq('deletado', false).maybeSingle()
    if (r.error && /cor|icone|capa_url|pasta_id|column/i.test(r.error.message)) {
      const r2 = await svc.from('simulado_cadernos_designer').select('nome, config').eq('id', origId).eq('tenant_id', tenantId).eq('deletado', false).maybeSingle()
      origem = r2.data
    } else origem = r.data
  }
  if (!origem) return null
  const nome = opts.nome ?? (opts.sufixoCopia ? `${origem.nome} (cópia)` : origem.nome)
  const base: Record<string, unknown> = { tenant_id: tenantId, nome, config: origem.config ?? {}, cor: origem.cor ?? null, icone: origem.icone ?? null, capa_url: origem.capa_url ?? null }
  const pastaId = opts.pastaId !== undefined ? opts.pastaId : (origem.pasta_id ?? null)
  if (pastaId) base.pasta_id = pastaId
  // Insere; se colunas (cor/icone/capa_url/pasta_id) ainda não existirem, remove só a que faltar.
  let ins = await svc.from('simulado_cadernos_designer').insert(base).select('id').single()
  for (let t = 0; t < 6 && ins.error; t++) {
    const col = ins.error.message.match(/'([a-z0-9_]+)' column/i)?.[1] ?? ins.error.message.match(/column "?([a-z0-9_]+)"? does not exist/i)?.[1]
    if (col && col in base && !['tenant_id', 'nome', 'config'].includes(col)) { delete base[col]; ins = await svc.from('simulado_cadernos_designer').insert(base).select('id').single(); continue }
    break
  }
  if (!ins.data) return null
  return { id: ins.data.id, nome, blocos: contarBlocosConfig(origem.config), cor: origem.cor ?? null, icone: origem.icone ?? null, capa: origem.capa_url ?? null }
}

/** Duplica um caderno (cópia literal) — mantém a MESMA pasta do original. */
export async function duplicarCaderno(id: string): Promise<{ ok: boolean; error?: string; caderno?: CadernoRow }> {
  if (!(await checkPermission('questoes:create')) && !(await checkPermission('questoes:update'))) return { ok: false, error: 'Sem permissão.' }
  const access = await getCurrentAccess()
  if (!access.tenantId) return { ok: false, error: 'Tenant não resolvido.' }
  const svc = createAdminClient()
  const caderno = await copiarCadernoInterno(svc, access.tenantId, id, { sufixoCopia: true })
  if (!caderno) return { ok: false, error: 'Erro ao duplicar.' }
  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_cadernos_designer', entidadeId: caderno.id, depois: { nome: caderno.nome, duplicadoDe: id } })
  revalidatePath('/admin/cadernos')
  return { ok: true, caderno }
}

/** Move um caderno para dentro de uma pasta da área de Cadernos (ou raiz quando pastaId=null). */
export async function moverCadernoParaPasta(cadernoId: string, pastaId: string | null): Promise<{ ok: boolean; error?: string }> {
  if (!(await checkPermission('questoes:update'))) return { ok: false, error: 'Sem permissão.' }
  const access = await getCurrentAccess()
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_cadernos_designer').update({ pasta_id: pastaId }).eq('id', cadernoId).eq('tenant_id', access.tenantId ?? '00000000-0000-0000-0000-000000000000')
  if (error) {
    if (/pasta_id|column/i.test(error.message)) return { ok: false, error: 'Recurso de pastas indisponível: rode a migration caderno_pasta (simulado_cadernos_designer.pasta_id).' }
    return { ok: false, error: error.message }
  }
  revalidatePath('/admin/cadernos')
  return { ok: true }
}

/** Duplica uma PASTA (folder) de cadernos: copia a pasta (campos/capa) E cópia literal de todos os cadernos dentro. */
export async function duplicarPastaCaderno(id: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!(await checkPermission('questoes:create')) && !(await checkPermission('questoes:update'))) return { ok: false, error: 'Sem permissão.' }
  const access = await getCurrentAccess()
  if (!access.tenantId) return { ok: false, error: 'Tenant não resolvido.' }
  const svc = createAdminClient()
  const { data: orig } = await svc.from('simulado_pastas').select('*').eq('id', id).eq('tenant_id', access.tenantId).maybeSingle()
  if (!orig) return { ok: false, error: 'Pasta não encontrada.' }
  const o = orig as any
  const { id: _i, created_at: _c, criado_em: _cc, atualizado_em: _a, updated_at: _u, deletado: _d, deletado_em: _de, deletado_por: _dp, criado_por: _cp, atualizado_por: _ap, caderno_id: _cad, ...rest } = o
  const insBase: Record<string, unknown> = { ...rest, nome: `${o.nome} (cópia)` }
  let ins = await svc.from('simulado_pastas').insert(insBase).select('id').single()
  for (let t = 0; t < 8 && ins.error; t++) {
    const col = ins.error.message.match(/'([a-z0-9_]+)' column/i)?.[1] ?? ins.error.message.match(/column "?([a-z0-9_]+)"? does not exist/i)?.[1]
    if (col && col in insBase && !['tenant_id', 'nome'].includes(col)) { delete insBase[col]; ins = await svc.from('simulado_pastas').insert(insBase).select('id').single(); continue }
    break
  }
  const novoFolderId = ins.data?.id as string | undefined
  if (!novoFolderId) return { ok: false, error: ins.error?.message ?? 'Erro ao duplicar a pasta.' }
  const { data: dentro } = await svc.from('simulado_cadernos_designer').select('id').eq('pasta_id', id).eq('tenant_id', access.tenantId).eq('deletado', false)
  for (const c of dentro ?? []) await copiarCadernoInterno(svc, access.tenantId, (c as any).id, { pastaId: novoFolderId })
  revalidatePath('/admin/cadernos')
  return { ok: true, id: novoFolderId }
}

export async function salvarCadernoConfig(id: string, config: CadernoConfig): Promise<{ ok: boolean; error?: string }> {
  if (!(await checkPermission('questoes:update'))) return { ok: false, error: 'Sem permissão.' }
  const access = await getCurrentAccess()
  if (!access.tenantId) return { ok: false, error: 'Tenant não resolvido.' }
  const svc = createAdminClient()
  const { error } = await svc
    .from('simulado_cadernos_designer')
    .update({ config, atualizado_em: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', access.tenantId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/admin/cadernos/${id}`)
  return { ok: true }
}

/** Salva o documento do editor de blocos v2 (docsV2/modalidadesV2/cores), preservando campos legados. */
export async function salvarCadernoDesignerV2(
  id: string,
  payload: { docsV2: Record<string, unknown>; modalidadesV2: unknown[]; cores: Record<string, string>; bancoId?: string | null; hudCores?: Record<string, string>; hudPorPagina?: Record<string, Record<string, string>> },
): Promise<{ ok: boolean; error?: string; docsV2?: Record<string, unknown> }> {
  if (!(await checkPermission('questoes:update'))) return { ok: false, error: 'Sem permissão.' }
  const access = await getCurrentAccess()
  if (!access.tenantId) return { ok: false, error: 'Tenant não resolvido.' }
  const svc = createAdminClient()
  const { data: atual } = await svc.from('simulado_cadernos_designer').select('config').eq('id', id).eq('tenant_id', access.tenantId).maybeSingle()
  if (!atual) return { ok: false, error: 'Caderno não encontrado.' }
  // Sobe as imagens de fundo (base64) pro storage e troca por URL → o doc no banco fica LEVE
  // (evita config de vários MB, que estourava o limite do save e travava o editor).
  try { for (const d of Object.values(payload.docsV2 ?? {})) await hospedarImagensDoc(d, svc) } catch { /* se falhar, salva como está */ }
  const merged = { ...((atual.config as Record<string, unknown>) ?? {}), ...payload }
  const { error } = await svc
    .from('simulado_cadernos_designer')
    .update({ config: merged, atualizado_em: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', access.tenantId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/admin/cadernos/${id}`)
  // Devolve os docs já com URLs → o editor troca o estado e os próximos saves ficam leves.
  return { ok: true, docsV2: payload.docsV2 }
}

/**
 * Sobe UMA imagem (base64) do editor pro storage e devolve a URL pública. Usado pelo editor
 * ANTES de salvar: troca cada fundo base64 por URL em requests pequenos → o save final fica
 * leve e não estoura o limite do body. Dedupe por hash do conteúdo (não reenvia o mesmo fundo).
 */
export async function hospedarImagemCadernoAction(dataUri: string): Promise<{ ok: boolean; url?: string; error?: string }> {
  if (!(await checkPermission('questoes:update'))) return { ok: false, error: 'Sem permissão.' }
  const m = /^data:image\/([a-z0-9.+-]+);base64,(.+)$/i.exec(dataUri || '')
  if (!m) return { ok: false, error: 'Imagem inválida.' }
  const tipo = m[1].toLowerCase()
  const ext = tipo === 'jpeg' ? 'jpg' : tipo
  let buf: Buffer
  try { buf = Buffer.from(m[2], 'base64') } catch { return { ok: false, error: 'Imagem inválida.' } }
  if (!buf.length) return { ok: false, error: 'Imagem vazia.' }
  const svc = createAdminClient()
  const hash = createHash('sha1').update(buf).digest('hex').slice(0, 24)
  const path = `assets/${hash}.${ext}`
  try { await svc.storage.createBucket('pdfs', { public: true }) } catch { /* já existe */ }
  const { error } = await svc.storage.from('pdfs').upload(path, buf, { contentType: `image/${tipo}`, upsert: true })
  if (error && !/exists/i.test(error.message)) return { ok: false, error: error.message }
  const url = svc.storage.from('pdfs').getPublicUrl(path).data.publicUrl as string
  return { ok: true, url }
}

/**
 * Converte um .docx (enviado em base64) em um documento do caderno (blocos).
 * NÃO grava nada — o editor insere o resultado no estado e o admin revisa e salva.
 * O mammoth é carregado sob demanda (dynamic import) e roda fora do bundle (serverExternalPackages).
 */
export async function converterWordAction(base64: string): Promise<{ ok: boolean; doc?: unknown; avisos?: string[]; resumo?: { blocos: number; imagens: number; tipo: 'diagnostico' | 'generico' }; error?: string }> {
  if (!(await checkPermission('questoes:update'))) return { ok: false, error: 'Sem permissão.' }
  try {
    const b64 = base64.includes(',') ? base64.slice(base64.indexOf(',') + 1) : base64 // tolera "data:...;base64,"
    const buffer = Buffer.from(b64, 'base64')
    if (!buffer.length) return { ok: false, error: 'Arquivo vazio.' }
    const { converterWordParaDoc } = await import('@/lib/caderno-designer/import-word')
    const { doc, avisos, resumo } = await converterWordParaDoc(buffer)
    return { ok: true, doc, avisos, resumo }
  } catch (e) {
    return { ok: false, error: (e as Error).message || 'Falha ao ler o Word.' }
  }
}

/** Atualiza nome + personalização (cor/ícone/capa) do caderno. Tolerante caso as colunas não existam. */
export async function atualizarCaderno(id: string, nome: string, cor: string | null, icone: string | null, capaUrl?: string | null): Promise<{ ok: boolean; error?: string }> {
  if (!(await checkPermission('questoes:update'))) return { ok: false, error: 'Sem permissão.' }
  const access = await getCurrentAccess()
  const titulo = nome.trim()
  if (!titulo) return { ok: false, error: 'Informe um nome.' }

  const svc = createAdminClient()
  const { error } = await svc
    .from('simulado_cadernos_designer')
    .update({ nome: titulo, cor: cor || null, icone: icone || null, capa_url: capaUrl || null })
    .eq('id', id).eq('tenant_id', access.tenantId ?? '00000000-0000-0000-0000-000000000000')
  if (error && /cor|icone|capa_url|column/i.test(error.message)) {
    const { error: e2 } = await svc.from('simulado_cadernos_designer').update({ nome: titulo }).eq('id', id).eq('tenant_id', access.tenantId ?? '00000000-0000-0000-0000-000000000000')
    if (e2) return { ok: false, error: e2.message }
  } else if (error) {
    return { ok: false, error: error.message }
  }

  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_cadernos_designer', entidadeId: id, depois: { nome: titulo, cor, icone, capa: !!capaUrl } })
  revalidatePath('/admin/cadernos')
  return { ok: true }
}

export async function excluirCaderno(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!(await checkPermission('questoes:update'))) return { ok: false, error: 'Sem permissão.' }
  const { error } = await softDelete('simulado_cadernos_designer', id)
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: 'DELETE', entidade: 'simulado_cadernos_designer', entidadeId: id, depois: { deletado: true } })
  revalidatePath('/admin/cadernos')
  return { ok: true }
}

/** Grupos de disciplinas definidos no banco (pasta): [{ id, nome, disciplinas:[nomes] }]. */
export async function getGruposBanco(bancoId: string): Promise<{ ok: boolean; grupos?: { id: string; nome: string; disciplinas: string[] }[] }> {
  if (!bancoId) return { ok: true, grupos: [] }
  const access = await getCurrentAccess()
  if (!access.tenantId) return { ok: false }
  const svc = createAdminClient()
  const { data } = await svc.from('simulado_pastas').select('grupos').eq('id', bancoId).eq('tenant_id', access.tenantId).maybeSingle()
  const grupos = Array.isArray((data as any)?.grupos) ? (data as any).grupos : []
  return { ok: true, grupos: grupos.map((g: any) => ({ id: String(g.id ?? g.nome), nome: String(g.nome ?? ''), disciplinas: Array.isArray(g.disciplinas) ? g.disciplinas.map(String) : [] })) }
}

/** Assuntos principais das questões do banco, agrupados por disciplina (slug → nomes). */
export async function getAssuntosBanco(bancoId: string): Promise<{ ok: boolean; porDisciplina?: Record<string, string[]> }> {
  if (!bancoId) return { ok: true, porDisciplina: {} }
  const access = await getCurrentAccess()
  if (!access.tenantId) return { ok: false }
  const svc = createAdminClient()
  const { data: vinc } = await svc.from('simulado_questao_pasta').select('questao_id').eq('pasta_id', bancoId).eq('tenant_id', access.tenantId)
  const ids = [...new Set((vinc ?? []).map((v: any) => v.questao_id).filter(Boolean))]
  if (!ids.length) return { ok: true, porDisciplina: {} }
  const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  const porDisc: Record<string, Set<string>> = {}
  const CHUNK = 500
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data: qs } = await svc.from('simulado_questoes').select('disciplinas:simulado_disciplinas(nome), assuntos:simulado_assuntos(nome)').in('id', ids.slice(i, i + CHUNK)).eq('deletado', false)
    for (const q of qs ?? []) {
      const d = (q as any).disciplinas?.nome as string | undefined
      const a = (q as any).assuntos?.nome as string | undefined
      if (!d || !a) continue
      const k = slug(d); (porDisc[k] ??= new Set<string>()).add(a)
    }
  }
  const out: Record<string, string[]> = {}
  for (const k of Object.keys(porDisc)) out[k] = [...porDisc[k]].sort()
  return { ok: true, porDisciplina: out }
}
