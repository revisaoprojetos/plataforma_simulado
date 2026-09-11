'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { faixaUuidDoCodigo } from '@/lib/codigo-questao'
import { espinhaDeHtml, reancorar } from '@/lib/leitura/reanchor'
import { limparCabecalhoHtml } from '@/lib/leitura/limpar-cabecalho'
import { esquecer } from '@/lib/cache/relatorio-cache'
import { confirmarImportQuestoes } from '@/app/admin/banco-questoes/actions'
import type { QuestaoImport } from '@/app/admin/banco-questoes/import-types'

export type SituacaoEditorial = 'em_preparacao' | 'rascunho' | 'em_revisao' | 'publicada' | 'arquivada' | 'revogada'

export type Documento = {
  id: string
  titulo: string
  descricao: string | null
  cor: string | null
  icone: string | null
  capa_url: string | null
  pasta_id: string | null
  versao: number
  publicado: boolean
  desafio_ativo: boolean
  desafio_exige_fim: boolean
  desafio_tempo_min: number | null
  artigos?: number
  // Metadados de LEI (Fase A / A1) — todos opcionais (documentos genéricos ficam null).
  materia_id?: string | null
  tipo_norma?: string | null
  numero?: string | null
  ano?: number | null
  titulo_oficial?: string | null
  ementa?: string | null
  slug?: string | null
  esfera?: string | null
  fonte_oficial?: string | null
  ultima_verificacao?: string | null
  ordem?: number | null
  situacao_editorial?: SituacaoEditorial | null
}

/** slug seguro a partir de um texto (sem acento, minúsculo, hífens). */
function slugify(s: string): string {
  return (s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)
}

async function guard(perm: string) {
  if (!(await checkPermission(perm))) return { ok: false as const, error: 'Sem permissão.' }
  const access = await getCurrentAccess()
  if (!access.tenantId) return { ok: false as const, error: 'Tenant não resolvido.' }
  return { ok: true as const, tenantId: access.tenantId, atorId: access.userId ?? null }
}

/** Cria um documento vazio (rascunho) — o conteúdo HTML entra no editor. */
export async function criarDocumento(titulo: string, pastaId?: string | null): Promise<{ ok: boolean; id?: string; error?: string }> {
  const g = await guard('leitura:create'); if (!g.ok) return { ok: false, error: g.error }
  const t = (titulo ?? '').trim() || 'Novo documento'
  const svc = createAdminClient()
  // ordem = último+1 dentro do módulo (p/ a aula entrar no fim da trilha).
  let ordem = 0
  try {
    const q = svc.from('simulado_documentos').select('ordem').eq('tenant_id', g.tenantId).eq('deletado', false)
    const r = await (pastaId ? q.eq('pasta_id', pastaId) : q.is('pasta_id', null)).order('ordem', { ascending: false }).limit(1).maybeSingle()
    ordem = ((r.data as any)?.ordem ?? -1) + 1
  } catch { /* ordem ausente */ }
  const { data, error } = await svc
    .from('simulado_documentos')
    .insert({ tenant_id: g.tenantId, titulo: t, pasta_id: pastaId ?? null, ordem, criado_por: g.atorId })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_documentos', entidadeId: (data as any).id, depois: { titulo: t }, atorId: g.atorId, tenantId: g.tenantId })
  revalidatePath('/admin/leitura')
  return { ok: true, id: (data as any).id }
}

const CAMPOS_DOC = [
  'titulo', 'descricao', 'cor', 'icone', 'capa_url', 'publicado', 'desafio_ativo', 'desafio_exige_fim', 'desafio_tempo_min', 'pasta_id',
  // metadados de lei (A1) — tolerante: se a coluna não existir, o update refaz sem elas.
  'materia_id', 'tipo_norma', 'numero', 'ano', 'titulo_oficial', 'ementa', 'slug', 'esfera', 'fonte_oficial', 'ultima_verificacao', 'ordem', 'situacao_editorial',
] as const
const CAMPOS_LEI = new Set(['materia_id', 'tipo_norma', 'numero', 'ano', 'titulo_oficial', 'ementa', 'slug', 'esfera', 'fonte_oficial', 'ultima_verificacao', 'ordem', 'situacao_editorial'])

export async function atualizarDocumento(
  id: string,
  patch: Partial<Pick<Documento, (typeof CAMPOS_DOC)[number]>>,
): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const dados: Record<string, unknown> = { atualizado_em: new Date().toISOString() }
  for (const k of CAMPOS_DOC) { if (k in patch) dados[k] = (patch as any)[k] }
  if (typeof dados.titulo === 'string') dados.titulo = (dados.titulo as string).trim() || 'Documento'
  // Slug: normaliza + registra o slug ANTERIOR no histórico (redireciona links antigos).
  if ('slug' in dados) {
    const novo = dados.slug ? slugify(String(dados.slug)) : null
    dados.slug = novo
    if (novo) {
      const { data: atual } = await svc.from('simulado_documentos').select('slug').eq('id', id).eq('tenant_id', g.tenantId).maybeSingle()
      const antigo = (atual as any)?.slug as string | null
      if (antigo && antigo !== novo) await svc.from('simulado_lei_slug_historico').upsert({ tenant_id: g.tenantId, documento_id: id, slug: antigo }, { onConflict: 'tenant_id,slug', ignoreDuplicates: true })
    }
  }

  let { error } = await svc.from('simulado_documentos').update(dados).eq('id', id).eq('tenant_id', g.tenantId)
  // Tolerante: se as colunas de lei ainda não migraram, salva só os campos base.
  if (error && /column|materia_id|situacao_editorial|titulo_oficial/i.test(error.message)) {
    const base: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(dados)) if (!CAMPOS_LEI.has(k)) base[k] = v
    ;({ error } = await svc.from('simulado_documentos').update(base).eq('id', id).eq('tenant_id', g.tenantId))
  }
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_documentos', entidadeId: id, depois: dados, atorId: g.atorId, tenantId: g.tenantId })
  revalidatePath('/admin/leitura'); revalidatePath(`/admin/leitura/${id}`)
  return { ok: true }
}

export async function publicarDocumento(id: string, publicado: boolean): Promise<{ ok: boolean; error?: string }> {
  return atualizarDocumento(id, { publicado })
}

// ── Versionamento / publicação (A2) ──────────────────────────────────────────

/** Carry-over aditivo da versão publicada → nova versão (progresso, questões, anotações). */
async function carryOver(svc: ReturnType<typeof createAdminClient>, tenantId: string, documentoId: string, vAnt: number, vNova: number, htmlNovo: string) {
  if (vAnt === vNova) return
  // Progresso: copia p/ a nova versão (ignora se já existir).
  const { data: prog } = await svc.from('simulado_leitura_progresso').select('estudante_id, pct, artigo_max, tempo_seg, iniciado_em, concluido_em').eq('tenant_id', tenantId).eq('documento_id', documentoId).eq('documento_versao', vAnt)
  if (prog?.length) await svc.from('simulado_leitura_progresso').upsert((prog as any[]).map((p) => ({ tenant_id: tenantId, estudante_id: p.estudante_id, documento_id: documentoId, documento_versao: vNova, pct: p.pct, artigo_max: p.artigo_max, tempo_seg: p.tempo_seg, iniciado_em: p.iniciado_em, concluido_em: p.concluido_em })), { onConflict: 'estudante_id,documento_id,documento_versao', ignoreDuplicates: true })
  // Questões inline: re-liga à nova versão.
  const { data: qs } = await svc.from('simulado_documento_questoes').select('questao_id, apos_artigo, obrigatoria, ordem').eq('tenant_id', tenantId).eq('documento_id', documentoId).eq('documento_versao', vAnt).eq('deletado', false)
  if (qs?.length) await svc.from('simulado_documento_questoes').upsert((qs as any[]).map((q) => ({ tenant_id: tenantId, documento_id: documentoId, documento_versao: vNova, questao_id: q.questao_id, apos_artigo: q.apos_artigo, obrigatoria: q.obrigatoria, ordem: q.ordem })), { onConflict: 'documento_id,documento_versao,questao_id', ignoreDuplicates: true })
  // Anotações (aluno + base): re-ancora pela espinha da nova versão; falha → revisao_necessaria.
  // Normaliza o cabeçalho ANTES de montar a espinha — o cliente/leitor usa limparCabecalhoHtml, então
  // ancorar sobre o HTML cru (com DOCTYPE/XML textual) deslocaria todos os offsets da nova versão.
  const S = espinhaDeHtml(limparCabecalhoHtml(htmlNovo))
  for (const tabela of ['simulado_leitura_anotacoes', 'simulado_documento_anotacoes_base'] as const) {
    const ehAluno = tabela === 'simulado_leitura_anotacoes'
    // Do aluno, carrega só as PRÓPRIAS (grifos base são re-clonados das novas base rows → sem duplicar).
    let q = svc.from(tabela).select('*').eq('tenant_id', tenantId).eq('documento_id', documentoId).eq('documento_versao', vAnt).eq('deletado', false)
    if (ehAluno) q = q.eq('origem', 'propria')
    const { data: anots, error } = await q
    if (error || !anots?.length) continue
    const novas = (anots as any[]).map((a) => {
      const rec = reancorar(S, { inicio: a.inicio_char, fim: a.fim_char, exact: a.exact, prefix: a.prefix ?? '', suffix: a.suffix ?? '' })
      const base: Record<string, unknown> = {
        tenant_id: tenantId, documento_id: documentoId, documento_versao: vNova,
        inicio_char: rec?.inicio ?? a.inicio_char, fim_char: rec?.fim ?? a.fim_char,
        exact: a.exact, prefix: a.prefix, suffix: a.suffix, cor: a.cor, nota: a.nota,
      }
      if (ehAluno) { base.estudante_id = a.estudante_id; base.origem = a.origem; base.base_id = a.base_id; base.revisao_necessaria = !rec }
      else { base.ordem = a.ordem; if ('tipo_grifo' in a) { base.tipo_grifo = a.tipo_grifo; base.editorial = a.editorial } }
      return base
    })
    // As PRÓPRIAS têm base_id=NULL — NÃO dá para usar upsert com onConflict incluindo base_id
    // (NULL não conflita de forma confiável → colapsaria/perderia os grifos do aluno). Insert direto,
    // como o ramo base. Carry-over roda 1x por publicação de versão (vNova nova), então não duplica.
    const { error: errIns } = await svc.from(tabela).insert(novas as any)
    if (errIns) console.error('[leitura] carryOver insert', tabela, errIns.message)
  }
}

/** Publica o rascunho como versão IMUTÁVEL e vira o ponteiro (commit num único UPDATE). */
export async function publicarVersao(documentoId: string, relatorio?: { tipo?: string; descricao?: string; substituir?: boolean; avisar?: boolean }): Promise<{ ok: boolean; versao?: number; error?: string }> {
  const g = await guard('leitura:publicar'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const { data: doc, error: derr } = await svc.from('simulado_documentos').select('titulo, versao, versao_publicada, versao_rascunho, publicado').eq('id', documentoId).eq('tenant_id', g.tenantId).maybeSingle()
  if (derr && /versao_publicada|column/i.test(derr.message)) return { ok: false, error: 'Rode a migração de versionamento (20260823000002).' }
  if (!doc) return { ok: false, error: 'Documento não encontrado.' }
  const pub = (doc as any).versao_publicada ?? (doc as any).versao ?? 1
  const rasc = (doc as any).versao_rascunho ?? pub
  if (rasc <= pub) return { ok: false, error: 'Não há rascunho novo para publicar. Edite o conteúdo primeiro.' }

  const { data: cont } = await svc.from('simulado_documento_conteudos').select('html, artigos').eq('documento_id', documentoId).eq('versao', rasc).maybeSingle()
  const html = (cont as any)?.html as string | undefined
  if (!html || !html.replace(/<[^>]+>/g, '').trim()) return { ok: false, error: 'Rascunho vazio — nada a publicar.' }
  // Coerência mínima: título definido (não o default). Não exigimos ≥1 dispositivo porque documentos
  // genéricos (não-lei) podem não ter artigos — o conteúdo não-vazio acima já é o piso desses.
  const titulo = String((doc as any).titulo ?? '').trim()
  if (!titulo || titulo === 'Documento') return { ok: false, error: 'Defina um título para o documento antes de publicar.' }

  // SUBSTITUIR a versão atual: aplica o rascunho SOBRE a versão já publicada, sem criar nova versão
  // nem relatório de "antes/depois" (correção silenciosa — o aluno não vê que mudou). Só faz sentido
  // quando já existe versão publicada; senão cai no fluxo normal (primeira publicação).
  if (relatorio?.substituir && (doc as any).publicado && pub >= 1) {
    const artigos = (cont as any)?.artigos ?? 0
    // 1) sobrescreve o conteúdo da versão publicada
    await svc.from('simulado_documento_conteudos').update({ html, artigos }).eq('documento_id', documentoId).eq('versao', pub)
    // 2) copia os dispositivos do rascunho para a versão publicada (tolerante à migração A3 ausente)
    try {
      const { data: disp } = await svc.from('simulado_lei_dispositivos').select('*').eq('documento_id', documentoId).eq('versao', rasc)
      await svc.from('simulado_lei_dispositivos').delete().eq('documento_id', documentoId).eq('versao', pub)
      if (disp?.length) await svc.from('simulado_lei_dispositivos').insert((disp as any[]).map(({ id, ...d }) => ({ ...d, versao: pub })))
    } catch { /* A3 ausente */ }
    // 3) descarta a linha de rascunho e volta o ponteiro para a publicada
    try { await svc.from('simulado_lei_dispositivos').delete().eq('documento_id', documentoId).eq('versao', rasc) } catch { /* A3 ausente */ }
    await svc.from('simulado_documento_conteudos').delete().eq('documento_id', documentoId).eq('versao', rasc)
    await svc.from('simulado_documentos').update({ versao_rascunho: pub, versao: pub, versao_publicada: pub, publicado: true, situacao_editorial: 'publicada', atualizado_em: new Date().toISOString() }).eq('id', documentoId).eq('tenant_id', g.tenantId)
    // CRÍTICO: o leitor cacheia o HTML por (doc, versão) com TTL 1h. Como "substituir" reescreve o
    // conteúdo MANTENDO o mesmo número de versão, é preciso invalidar a chave — senão o aluno vê o
    // texto antigo (com o erro) por até 1h. Ver acesso.ts (`leitura:conteudo:...`).
    await esquecer(`leitura:conteudo:${g.tenantId}:${documentoId}:${pub}`)
    await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_documentos', entidadeId: documentoId, depois: { substituiu_versao: pub }, atorId: g.atorId, tenantId: g.tenantId })
    revalidatePath('/admin/leitura'); revalidatePath(`/admin/leitura/${documentoId}`)
    return { ok: true, versao: pub }
  }

  // 1) carry-over aditivo (mantém linhas antigas → seguro/re-executável)
  try { await carryOver(svc, g.tenantId, documentoId, pub, rasc, html) } catch (e) { console.error('[leitura] carryOver:', (e as Error)?.message) }
  // 2) marca a linha como publicada (imutável a partir daqui)
  await svc.from('simulado_documento_conteudos').update({ estado: 'publicada', publicado_em: new Date().toISOString(), publicado_por: g.atorId }).eq('documento_id', documentoId).eq('versao', rasc)
  // 3) COMMIT — vira o ponteiro num único UPDATE (aluno passa a ver a nova versão)
  const { error } = await svc.from('simulado_documentos').update({ versao_publicada: rasc, versao: rasc, publicado: true, situacao_editorial: 'publicada', atualizado_em: new Date().toISOString() }).eq('id', documentoId).eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }
  // 4) relatório público (só se "avisar" — a pílula "lei atualizada"/antes-depois do aluno) + auditoria
  const tipo = relatorio?.tipo || (pub === rasc - 1 && pub <= 1 ? 'nova_lei' : 'alteracao')
  if (relatorio?.avisar !== false) {
    await svc.from('simulado_lei_atualizacoes').insert({ tenant_id: g.tenantId, documento_id: documentoId, versao: rasc, tipo, descricao: relatorio?.descricao || null, criado_por: g.atorId })
  }
  await registrarAudit({ operacao: 'LIBERAR', entidade: 'simulado_documentos', entidadeId: documentoId, depois: { versao_publicada: rasc, tipo, avisou: relatorio?.avisar !== false }, atorId: g.atorId, tenantId: g.tenantId })
  revalidatePath('/admin/leitura'); revalidatePath(`/admin/leitura/${documentoId}`)
  return { ok: true, versao: rasc }
}

/** Arquiva a lei (some do catálogo comum; preserva versões/anotações). */
export async function arquivarDocumento(documentoId: string, arquivar: boolean): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_documentos').update({ situacao_editorial: arquivar ? 'arquivada' : 'publicada', publicado: !arquivar, atualizado_em: new Date().toISOString() }).eq('id', documentoId).eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: arquivar ? 'BLOQUEAR' : 'LIBERAR', entidade: 'simulado_documentos', entidadeId: documentoId, depois: { arquivada: arquivar }, atorId: g.atorId, tenantId: g.tenantId })
  revalidatePath('/admin/leitura'); revalidatePath(`/admin/leitura/${documentoId}`)
  return { ok: true }
}

/** Soft-delete (some das listagens; a lixeira restaura). */
export async function excluirDocumento(id: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('leitura:delete'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_documentos').update({ deletado: true, atualizado_em: new Date().toISOString() }).eq('id', id).eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: 'DELETE', entidade: 'simulado_documentos', entidadeId: id, atorId: g.atorId, tenantId: g.tenantId })
  revalidatePath('/admin/leitura')
  return { ok: true }
}

/** Duplica o documento + a versão vigente do conteúdo. */
export async function duplicarDocumento(id: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  const g = await guard('leitura:create'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const { data: orig } = await svc.from('simulado_documentos').select('*').eq('id', id).eq('tenant_id', g.tenantId).maybeSingle()
  if (!orig) return { ok: false, error: 'Documento não encontrado.' }
  const { data: novo, error } = await svc.from('simulado_documentos').insert({
    tenant_id: g.tenantId, titulo: `${(orig as any).titulo} (cópia)`, descricao: (orig as any).descricao,
    cor: (orig as any).cor, icone: (orig as any).icone, capa_url: (orig as any).capa_url, pasta_id: (orig as any).pasta_id,
    versao: 1, publicado: false, desafio_ativo: (orig as any).desafio_ativo, desafio_exige_fim: (orig as any).desafio_exige_fim,
    desafio_tempo_min: (orig as any).desafio_tempo_min, criado_por: g.atorId,
  }).select('id').single()
  if (error) return { ok: false, error: error.message }
  const novoId = (novo as any).id
  // Copia a versão vigente do conteúdo (se houver).
  const { data: cont } = await svc.from('simulado_documento_conteudos').select('html, texto_hash, artigos').eq('documento_id', id).eq('versao', (orig as any).versao).maybeSingle()
  if (cont) await svc.from('simulado_documento_conteudos').insert({ tenant_id: g.tenantId, documento_id: novoId, versao: 1, html: (cont as any).html, texto_hash: (cont as any).texto_hash, artigos: (cont as any).artigos })
  revalidatePath('/admin/leitura')
  return { ok: true, id: novoId }
}

// ── Atribuição (grupos + estudantes). SEM atribuição = liberado a todos. ────────

/** Grupos atribuídos + todos os grupos do tenant (p/ o seletor). */
export async function carregarAtribuicao(documentoId: string): Promise<{ ok: boolean; grupos?: { id: string; nome: string; cor: string | null; atribuido: boolean }[]; error?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const { data: todos } = await svc.from('simulado_grupos').select('id, nome, cor').eq('tenant_id', g.tenantId).eq('deletado', false).order('nome')
  const { data: atrib } = await svc.from('simulado_documento_grupos').select('grupo_id').eq('documento_id', documentoId)
  const set = new Set((atrib ?? []).map((r: any) => r.grupo_id))
  return { ok: true, grupos: (todos ?? []).map((x: any) => ({ id: x.id, nome: x.nome, cor: x.cor ?? null, atribuido: set.has(x.id) })) }
}

/** Define os grupos atribuídos (substitui o conjunto atual). */
export async function definirGruposDocumento(documentoId: string, grupoIds: string[]): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const ids = [...new Set((grupoIds ?? []).filter(Boolean))]
  await svc.from('simulado_documento_grupos').delete().eq('documento_id', documentoId).eq('tenant_id', g.tenantId)
  if (ids.length) {
    const { error } = await svc.from('simulado_documento_grupos').insert(ids.map((grupo_id) => ({ tenant_id: g.tenantId, documento_id: documentoId, grupo_id })))
    if (error) return { ok: false, error: error.message }
  }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_documento_grupos', entidadeId: documentoId, depois: { grupos: ids.length }, atorId: g.atorId, tenantId: g.tenantId })
  revalidatePath(`/admin/leitura/${documentoId}`)
  return { ok: true }
}

// ── Atribuição por ALUNO individual (além dos grupos) ────────────────────────

export type EstudanteRef = { id: string; nome: string; email: string | null }

/** Alunos individualmente atribuídos a este documento. */
export async function carregarEstudantesDocumento(documentoId: string): Promise<{ ok: boolean; itens?: EstudanteRef[]; error?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const { data: at } = await svc.from('simulado_documento_estudantes').select('estudante_id').eq('documento_id', documentoId).eq('tenant_id', g.tenantId)
  const ids = [...new Set((at ?? []).map((r: any) => r.estudante_id))]
  if (!ids.length) return { ok: true, itens: [] }
  const { data: es } = await svc.from('simulado_estudantes').select('id, nome, email').in('id', ids)
  return { ok: true, itens: (es ?? []).map((e: any) => ({ id: e.id, nome: e.nome ?? 'Aluno', email: e.email ?? null })) }
}

/** Define os alunos atribuídos (substitui o conjunto atual). */
export async function definirEstudantesDocumento(documentoId: string, estudanteIds: string[]): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const ids = [...new Set((estudanteIds ?? []).filter(Boolean))]
  await svc.from('simulado_documento_estudantes').delete().eq('documento_id', documentoId).eq('tenant_id', g.tenantId)
  if (ids.length) {
    const { error } = await svc.from('simulado_documento_estudantes').insert(ids.map((estudante_id) => ({ tenant_id: g.tenantId, documento_id: documentoId, estudante_id })))
    if (error) return { ok: false, error: error.message }
  }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_documento_estudantes', entidadeId: documentoId, depois: { estudantes: ids.length }, atorId: g.atorId, tenantId: g.tenantId })
  revalidatePath(`/admin/leitura/${documentoId}`)
  return { ok: true }
}

/** Busca alunos do tenant (nome/email/cpf) para atribuir acesso. */
export async function buscarEstudantesLeitura(query: string): Promise<{ ok: boolean; itens?: EstudanteRef[]; error?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const q = (query ?? '').trim().replace(/[,%()]/g, ' ').trim()
  let sel = svc.from('simulado_estudantes').select('id, nome, email').eq('tenant_id', g.tenantId).eq('deletado', false).order('nome').limit(20)
  if (q) sel = sel.or(`nome.ilike.%${q}%,email.ilike.%${q}%,cpf.ilike.%${q}%`)
  const { data, error } = await sel
  if (error) return { ok: false, error: error.message }
  return { ok: true, itens: (data ?? []).map((e: any) => ({ id: e.id, nome: e.nome ?? 'Aluno', email: e.email ?? null })) }
}

export type EstudanteLinha = { id: string; nome: string; email: string | null; cpf: string | null }

/** Todos os alunos do tenant (para a tabela de acesso, estilo aba Estudantes do banco). */
export async function listarEstudantesTenant(): Promise<{ ok: boolean; itens?: EstudanteLinha[]; error?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const data = await fetchAll<any>(() => svc.from('simulado_estudantes').select('id, nome, email, cpf').eq('tenant_id', g.tenantId).eq('deletado', false).order('nome', { ascending: true }))
  return { ok: true, itens: data.map((e: any) => ({ id: e.id, nome: e.nome ?? 'Aluno', email: e.email ?? null, cpf: e.cpf ?? null })) }
}

// ── Anotações BASE (pré-definidas do admin) — vêm no documento p/ todos os alunos ──

export type AnotacaoBase = { id: string; inicio: number; fim: number; exact: string; prefix: string; suffix: string; cor: string; nota: string | null; tipoGrifo: string | null }

/** Lista as anotações/grifos base da versão vigente do documento. */
export async function listarAnotacoesBase(documentoId: string, versao: number): Promise<{ ok: boolean; itens?: AnotacaoBase[]; error?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  let sel = await svc.from('simulado_documento_anotacoes_base').select('id, inicio_char, fim_char, exact, prefix, suffix, cor, nota, tipo_grifo').eq('tenant_id', g.tenantId).eq('documento_id', documentoId).eq('documento_versao', versao).eq('deletado', false)
  if (sel.error && /tipo_grifo|column/i.test(String(sel.error.message))) sel = await svc.from('simulado_documento_anotacoes_base').select('id, inicio_char, fim_char, exact, prefix, suffix, cor, nota').eq('tenant_id', g.tenantId).eq('documento_id', documentoId).eq('documento_versao', versao).eq('deletado', false) as any
  if (sel.error) return { ok: false, error: sel.error.message }
  return { ok: true, itens: (sel.data ?? []).map((a: any) => ({ id: a.id, inicio: a.inicio_char, fim: a.fim_char, exact: a.exact, prefix: a.prefix ?? '', suffix: a.suffix ?? '', cor: a.cor, nota: a.nota ?? null, tipoGrifo: a.tipo_grifo ?? null })) }
}

export async function criarAnotacaoBase(documentoId: string, versao: number, a: { inicio: number; fim: number; exact: string; prefix: string; suffix: string; cor: string; nota?: string | null; tipoGrifo?: string | null }): Promise<{ ok: boolean; id?: string; error?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const base: Record<string, unknown> = { tenant_id: g.tenantId, documento_id: documentoId, documento_versao: versao, inicio_char: a.inicio, fim_char: a.fim, exact: String(a.exact).slice(0, 4000), prefix: a.prefix ?? null, suffix: a.suffix ?? null, cor: a.cor, nota: a.nota || null }
  let res = await svc.from('simulado_documento_anotacoes_base').insert({ ...base, tipo_grifo: a.tipoGrifo ?? null, editorial: !!a.tipoGrifo }).select('id').single()
  if (res.error && /tipo_grifo|editorial|column/i.test(String(res.error.message))) res = await svc.from('simulado_documento_anotacoes_base').insert(base).select('id').single()
  if (res.error) return { ok: false, error: res.error.message }
  return { ok: true, id: (res.data as any).id }
}

export async function atualizarAnotacaoBase(id: string, patch: { cor?: string; nota?: string | null; tipoGrifo?: string | null }): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const dados: Record<string, unknown> = {}
  if ('cor' in patch) dados.cor = patch.cor
  if ('nota' in patch) dados.nota = patch.nota || null
  if ('tipoGrifo' in patch) { dados.tipo_grifo = patch.tipoGrifo ?? null; dados.editorial = !!patch.tipoGrifo }
  let res = await svc.from('simulado_documento_anotacoes_base').update(dados).eq('id', id).eq('tenant_id', g.tenantId)
  if (res.error && /tipo_grifo|editorial|column/i.test(String(res.error.message))) { const { tipo_grifo, editorial, ...base } = dados as any; res = await svc.from('simulado_documento_anotacoes_base').update(base).eq('id', id).eq('tenant_id', g.tenantId) }
  if (res.error) return { ok: false, error: res.error.message }
  return { ok: true }
}

export async function excluirAnotacaoBase(id: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_documento_anotacoes_base').update({ deletado: true }).eq('id', id).eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// ── Questões no meio da leitura (Fase 2) ──

export type QuestaoDoc = { id: string; questaoId: string; enunciado: string; aposArtigo: number; obrigatoria: boolean }
export type QuestaoBuscaLeitura = { id: string; enunciado: string; codigo: string | null }

const snippet = (s: unknown) => String(s ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)

/** Questões já anexadas ao documento (versão vigente). */
export async function listarQuestoesDocumento(documentoId: string, versao: number): Promise<{ ok: boolean; itens?: QuestaoDoc[]; error?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const { data: dq, error } = await svc.from('simulado_documento_questoes')
    .select('id, questao_id, apos_artigo, obrigatoria').eq('tenant_id', g.tenantId).eq('documento_id', documentoId).eq('documento_versao', versao).eq('deletado', false).order('apos_artigo').order('ordem')
  if (error) return { ok: false, error: error.message }
  const ids = [...new Set((dq ?? []).map((x: any) => x.questao_id))]
  const enun = new Map<string, string>()
  if (ids.length) {
    const { data: qs } = await svc.from('simulado_questoes').select('id, enunciado').in('id', ids)
    for (const q of (qs ?? []) as any[]) enun.set(q.id, snippet(q.enunciado))
  }
  return { ok: true, itens: (dq ?? []).map((x: any) => ({ id: x.id, questaoId: x.questao_id, enunciado: enun.get(x.questao_id) || 'Questão', aposArtigo: x.apos_artigo, obrigatoria: !!x.obrigatoria })) }
}

/** Busca questões objetivas do banco (por enunciado ou código) para anexar. */
export async function buscarQuestoesLeitura(query: string): Promise<{ ok: boolean; itens?: QuestaoBuscaLeitura[]; error?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const q = (query ?? '').trim()
  const faixa = q ? faixaUuidDoCodigo(q) : null
  let sel = svc.from('simulado_questoes').select('id, enunciado, codigo').eq('tenant_id', g.tenantId).eq('deletado', false).eq('tipo', 'objetiva').limit(30)
  if (faixa) sel = sel.gte('id', faixa.lo).lte('id', faixa.hi)
  else if (q) sel = sel.ilike('enunciado', `%${q.replace(/[%,]/g, ' ')}%`)
  let res = await sel
  if (res.error && /codigo/i.test(res.error.message)) res = await svc.from('simulado_questoes').select('id, enunciado').eq('tenant_id', g.tenantId).eq('deletado', false).eq('tipo', 'objetiva').ilike('enunciado', `%${q}%`).limit(30) as any
  if (res.error) return { ok: false, error: res.error.message }
  return { ok: true, itens: (res.data ?? []).map((x: any) => ({ id: x.id, enunciado: snippet(x.enunciado) || 'Questão', codigo: x.codigo ?? null })) }
}

export async function adicionarQuestaoDocumento(documentoId: string, versao: number, questaoId: string, aposArtigo: number, obrigatoria: boolean): Promise<{ ok: boolean; id?: string; error?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const { data, error } = await svc.from('simulado_documento_questoes').upsert(
    { tenant_id: g.tenantId, documento_id: documentoId, documento_versao: versao, questao_id: questaoId, apos_artigo: aposArtigo, obrigatoria, ordem: aposArtigo, deletado: false },
    { onConflict: 'documento_id,documento_versao,questao_id' },
  ).select('id').single()
  if (error) return { ok: false, error: /duplicate|unique/i.test(error.message) ? 'Essa questão já está no documento.' : error.message }
  revalidatePath(`/admin/leitura/${documentoId}`)
  return { ok: true, id: (data as any).id }
}

export async function atualizarQuestaoDocumento(id: string, patch: { aposArtigo?: number; obrigatoria?: boolean }): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const dados: Record<string, unknown> = {}
  if ('aposArtigo' in patch) { dados.apos_artigo = patch.aposArtigo; dados.ordem = patch.aposArtigo }
  if ('obrigatoria' in patch) dados.obrigatoria = patch.obrigatoria
  const { error } = await svc.from('simulado_documento_questoes').update(dados).eq('id', id).eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function removerQuestaoDocumento(id: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_documento_questoes').update({ deletado: true }).eq('id', id).eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/**
 * Importa questões de um arquivo (linhas já parseadas) DIRETO na leitura: cria/dedup no sistema
 * (via confirmarImportQuestoes → questões avulsas) e ancora cada uma depois do artigo `aposArtigo`.
 */
export async function importarQuestoesLeitura(documentoId: string, versao: number, aposArtigo: number, rows: QuestaoImport[]): Promise<{ ok: boolean; count?: number; error?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  if (!rows?.length) return { ok: false, error: 'Nada para importar.' }
  const imp = await confirmarImportQuestoes(null, rows)
  if (!imp.ok) return { ok: false, error: imp.error ?? 'Falha ao importar as questões.' }
  const ids = imp.ids ?? []
  const svc = createAdminClient()
  let count = 0
  for (const questaoId of ids) {
    const { error } = await svc.from('simulado_documento_questoes').upsert(
      { tenant_id: g.tenantId, documento_id: documentoId, documento_versao: versao, questao_id: questaoId, apos_artigo: aposArtigo, obrigatoria: true, ordem: aposArtigo, deletado: false },
      { onConflict: 'documento_id,documento_versao,questao_id' },
    )
    if (!error) count++
  }
  revalidatePath(`/admin/leitura/${documentoId}`)
  return { ok: true, count }
}

/** Lista de documentos do admin (grade), com a contagem de artigos da versão vigente. */
export async function listarDocumentosAdmin(): Promise<{ ok: boolean; itens?: Documento[]; error?: string }> {
  const g = await guard('leitura:view'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const docs = await fetchAll<any>(() =>
    svc.from('simulado_documentos').select('*').eq('tenant_id', g.tenantId).eq('deletado', false).order('atualizado_em', { ascending: false }))
  const ids = docs.map((d) => d.id)
  const artigosPorDoc = new Map<string, number>()
  if (ids.length) {
    // Chunk no .in() (LANDMINE do proxy) — o acervo pode crescer para dezenas/centenas de leis.
    const cont = await fetchAllByIn<any>(ids, (chunk) =>
      svc.from('simulado_documento_conteudos').select('documento_id, versao, artigos').eq('tenant_id', g.tenantId).in('documento_id', chunk).order('documento_id'))
    const versaoDoc = new Map(docs.map((d) => [d.id, d.versao]))
    for (const c of cont) if (c.versao === versaoDoc.get(c.documento_id)) artigosPorDoc.set(c.documento_id, c.artigos ?? 0)
  }
  return { ok: true, itens: docs.map((d) => ({ ...d, artigos: artigosPorDoc.get(d.id) ?? 0 })) }
}

// ===================== Banco de Aulas (módulos = pastas folder_area='leitura') =====================

const AREA_LEITURA = 'leitura'
export type PublicacaoModulo = { status: 'rascunho' | 'publicado'; publicarEm: string | null; encerrarEm: string | null }
const PUBLICACAO_PADRAO: PublicacaoModulo = { status: 'rascunho', publicarEm: null, encerrarEm: null }
function normPublicacao(v: any): PublicacaoModulo {
  if (!v || typeof v !== 'object') return PUBLICACAO_PADRAO
  return { status: v.status === 'publicado' ? 'publicado' : 'rascunho', publicarEm: v.publicarEm ?? null, encerrarEm: v.encerrarEm ?? null }
}
export type ModuloLeitura = { id: string; nome: string; pai_id: string | null; cor: string | null; icone: string | null; capa_url: string | null; capa_card_url: string | null; ordem: number; subpastas: number; aulas: number; publicacao: PublicacaoModulo }
export type BancoAulas = { ok: boolean; error?: string; pastas?: ModuloLeitura[]; aulas?: (Documento & { questoes?: number })[]; breadcrumb?: { id: string; nome: string }[]; modulos?: { id: string; nome: string }[]; moduloAtual?: ModuloLeitura }

/** `.order('ordem')` tolerante: se a coluna `ordem` ainda não existir, refaz ordenando por nome. */
async function pastasLeitura(svc: any, tenantId: string): Promise<any[]> {
  const q = (cols: string, ordenado: boolean) => {
    const b = svc.from('simulado_pastas').select(cols).eq('tenant_id', tenantId).eq('is_folder', true).eq('folder_area', AREA_LEITURA)
    return ordenado ? b.order('ordem', { ascending: true }).order('nome', { ascending: true }) : b.order('nome', { ascending: true })
  }
  let r = await q('id, nome, pai_id, cor, icone, capa_url, capa_card_url, ordem, publicacao', true)
  if (r.error) r = await q('id, nome, pai_id, cor, icone, capa_url, capa_card_url, ordem', true) // publicacao pode não estar migrada
  if (r.error) r = await q('id, nome, pai_id, cor, icone, capa_url', false) // capa_card_url/ordem podem não estar migradas
  return (r.data as any[]) ?? []
}

/** Um nível do banco de aulas: módulos (pastas) + aulas (documentos) + trilha de breadcrumb. */
export async function listarBancoAulas(pastaId?: string | null, detalhes: boolean = true): Promise<BancoAulas> {
  const g = await guard('leitura:view'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const paiAtual = pastaId ?? null
  const todasPastas = await pastasLeitura(svc, g.tenantId)
  // Documentos: id+pasta_id de todos (p/ contar por pasta) e os do nível atual (detalhados).
  // Otimização: abas Acessos/Configurações NÃO usam a lista de aulas → pula o fetch de TODOS os docs.
  const docs = detalhes ? await fetchAll<any>(() => svc.from('simulado_documentos').select('*').eq('tenant_id', g.tenantId).eq('deletado', false)) : []
  const docsPorPasta = new Map<string, number>()
  for (const d of docs) { const k = d.pasta_id ?? '__root__'; docsPorPasta.set(k, (docsPorPasta.get(k) ?? 0) + 1) }
  const subPorPasta = new Map<string, number>()
  for (const p of todasPastas) { if (p.pai_id) subPorPasta.set(p.pai_id, (subPorPasta.get(p.pai_id) ?? 0) + 1) }

  const pastas: ModuloLeitura[] = todasPastas.filter((p) => (p.pai_id ?? null) === paiAtual).map((p) => ({
    id: p.id, nome: p.nome, pai_id: p.pai_id ?? null, cor: p.cor ?? null, icone: p.icone ?? null, capa_url: p.capa_url ?? null, capa_card_url: p.capa_card_url ?? null,
    ordem: p.ordem ?? 0, subpastas: subPorPasta.get(p.id) ?? 0, aulas: docsPorPasta.get(p.id) ?? 0, publicacao: normPublicacao(p.publicacao),
  }))

  const aulasNivel = docs.filter((d) => (d.pasta_id ?? null) === paiAtual)
    .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || String(b.atualizado_em).localeCompare(String(a.atualizado_em)))
  const ids = aulasNivel.map((d) => d.id)
  const artigosPorDoc = new Map<string, number>()
  const questoesPorDoc = new Map<string, number>()
  if (ids.length) {
    const cont = await fetchAllByIn<any>(ids, (chunk) => svc.from('simulado_documento_conteudos').select('documento_id, versao, artigos').eq('tenant_id', g.tenantId).in('documento_id', chunk).order('documento_id'))
    const versaoDoc = new Map(aulasNivel.map((d) => [d.id, d.versao]))
    for (const c of cont) if (c.versao === versaoDoc.get(c.documento_id)) artigosPorDoc.set(c.documento_id, c.artigos ?? 0)
    const qs = await fetchAllByIn<any>(ids, (chunk) => svc.from('simulado_documento_questoes').select('documento_id').eq('tenant_id', g.tenantId).eq('deletado', false).in('documento_id', chunk))
    for (const q of qs) questoesPorDoc.set(q.documento_id, (questoesPorDoc.get(q.documento_id) ?? 0) + 1)
  }
  const aulas = aulasNivel.map((d) => ({ ...d, artigos: artigosPorDoc.get(d.id) ?? 0, questoes: questoesPorDoc.get(d.id) ?? 0 }))

  // Breadcrumb subindo por pai_id.
  const mapa = new Map(todasPastas.map((p) => [p.id, p]))
  const breadcrumb: { id: string; nome: string }[] = []
  let cur = paiAtual
  while (cur && mapa.has(cur)) { const p = mapa.get(cur); breadcrumb.unshift({ id: p.id, nome: p.nome }); cur = p.pai_id ?? null }

  // Módulo atual (quando dentro de um) — dados completos p/ a aba Configurações (personalização).
  const raiz = paiAtual ? todasPastas.find((p) => p.id === paiAtual) : null
  const moduloAtual: ModuloLeitura | undefined = raiz ? {
    id: raiz.id, nome: raiz.nome, pai_id: raiz.pai_id ?? null, cor: raiz.cor ?? null, icone: raiz.icone ?? null,
    capa_url: raiz.capa_url ?? null, capa_card_url: raiz.capa_card_url ?? null,
    ordem: raiz.ordem ?? 0, subpastas: subPorPasta.get(raiz.id) ?? 0, aulas: docsPorPasta.get(raiz.id) ?? 0, publicacao: normPublicacao(raiz.publicacao),
  } : undefined

  return { ok: true, pastas, aulas, breadcrumb, modulos: todasPastas.map((p) => ({ id: p.id, nome: p.nome })), moduloAtual }
}

async function proximaOrdem(svc: any, tenantId: string, where: (q: any) => any): Promise<number> {
  const r = await where(svc.from('simulado_pastas').select('ordem').eq('tenant_id', tenantId)).order('ordem', { ascending: false }).limit(1).maybeSingle()
  return ((r.data as any)?.ordem ?? -1) + 1
}

export async function criarModuloLeitura(nome: string, paiId?: string | null): Promise<{ ok: boolean; id?: string; error?: string }> {
  const g = await guard('leitura:create'); if (!g.ok) return { ok: false, error: g.error }
  const n = (nome ?? '').trim() || 'Novo módulo'
  const svc = createAdminClient()
  let ordem = 0
  try { ordem = await proximaOrdem(svc, g.tenantId, (q) => q.eq('folder_area', AREA_LEITURA).eq('is_folder', true).is('pai_id', paiId ?? null)) } catch { /* coluna ordem ausente */ }
  const payload: Record<string, unknown> = { tenant_id: g.tenantId, nome: n, is_folder: true, folder_area: AREA_LEITURA, pai_id: paiId ?? null, ordem }
  let { data, error } = await svc.from('simulado_pastas').insert(payload).select('id').single()
  if (error && /ordem|column/i.test(error.message)) { delete payload.ordem; ({ data, error } = await svc.from('simulado_pastas').insert(payload).select('id').single()) }
  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/leitura')
  return { ok: true, id: (data as any).id }
}

export async function renomearModuloLeitura(id: string, nome: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  const n = (nome ?? '').trim(); if (!n) return { ok: false, error: 'Nome vazio.' }
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_pastas').update({ nome: n }).eq('id', id).eq('tenant_id', g.tenantId).eq('folder_area', AREA_LEITURA)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/leitura'); return { ok: true }
}

export async function atualizarModuloLeitura(id: string, patch: { cor?: string | null; icone?: string | null; capa_url?: string | null }): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const dados: Record<string, unknown> = {}
  for (const k of ['cor', 'icone', 'capa_url'] as const) if (k in patch) dados[k] = (patch as any)[k]
  const { error } = await svc.from('simulado_pastas').update(dados).eq('id', id).eq('tenant_id', g.tenantId).eq('folder_area', AREA_LEITURA)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/leitura'); return { ok: true }
}

export async function excluirModuloLeitura(id: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('leitura:delete'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const [{ count: subs }, { count: aulas }] = await Promise.all([
    svc.from('simulado_pastas').select('id', { count: 'exact', head: true }).eq('tenant_id', g.tenantId).eq('pai_id', id),
    svc.from('simulado_documentos').select('id', { count: 'exact', head: true }).eq('tenant_id', g.tenantId).eq('pasta_id', id).eq('deletado', false),
  ])
  if ((subs ?? 0) > 0 || (aulas ?? 0) > 0) return { ok: false, error: 'Esvazie o módulo antes de excluir (mova as aulas/submódulos).' }
  const { error } = await svc.from('simulado_pastas').delete().eq('id', id).eq('tenant_id', g.tenantId).eq('folder_area', AREA_LEITURA)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/leitura'); return { ok: true }
}

/** Publica/agenda/encerra o MÓDULO (jsonb publicacao). Estilo simulado: publicarEm agenda o início,
 * encerrarEm tira o acesso do aluno ao fim (nada é apagado). */
export async function salvarPublicacaoModulo(pastaId: string, pub: PublicacaoModulo): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const val: PublicacaoModulo = { status: pub.status === 'publicado' ? 'publicado' : 'rascunho', publicarEm: pub.publicarEm || null, encerrarEm: pub.encerrarEm || null }
  const { error } = await svc.from('simulado_pastas').update({ publicacao: val }).eq('id', pastaId).eq('tenant_id', g.tenantId).eq('folder_area', AREA_LEITURA)
  if (error) return { ok: false, error: /publicacao|column|schema cache/i.test(error.message) ? 'Rode a migração 20260910000002 (publicação do módulo).' : error.message }
  await registrarAudit({ operacao: val.status === 'publicado' ? 'LIBERAR' : 'BLOQUEAR', entidade: 'simulado_pastas', entidadeId: pastaId, depois: val, atorId: g.atorId, tenantId: g.tenantId })
  revalidatePath('/admin/leitura'); return { ok: true }
}

export async function moverAulaParaModulo(documentoId: string, pastaId: string | null): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_documentos').update({ pasta_id: pastaId, atualizado_em: new Date().toISOString() }).eq('id', documentoId).eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/leitura'); return { ok: true }
}

/** Reordena AULAS (documentos) dentro de um módulo — grava `ordem = índice`. */
export async function reordenarAulasLeitura(ids: string[]): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  for (let i = 0; i < ids.length; i++) await svc.from('simulado_documentos').update({ ordem: i }).eq('id', ids[i]).eq('tenant_id', g.tenantId)
  revalidatePath('/admin/leitura'); return { ok: true }
}

/** Reordena MÓDULOS (pastas) — grava `ordem = índice` (tolerante à coluna ausente). */
export async function reordenarModulosLeitura(ids: string[]): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  for (let i = 0; i < ids.length; i++) {
    const { error } = await svc.from('simulado_pastas').update({ ordem: i }).eq('id', ids[i]).eq('tenant_id', g.tenantId).eq('folder_area', AREA_LEITURA)
    if (error && /ordem|column/i.test(error.message)) return { ok: true } // coluna ainda não migrada — ignora silenciosamente
  }
  revalidatePath('/admin/leitura'); return { ok: true }
}

// ── Acesso do MÓDULO (pasta) — grupos + alunos. Vazio = liberado a todos; união dos dois. ──
// Tolerante: se as tabelas simulado_pasta_grupos/estudantes não migraram, o SELECT retorna vazio.
const SEM_TABELA = (m?: string) => /relation .* does not exist|simulado_pasta_(grupos|estudantes)|schema cache/i.test(m ?? '')

export async function carregarAtribuicaoPasta(pastaId: string): Promise<{ ok: boolean; grupos?: { id: string; nome: string; cor: string | null; atribuido: boolean }[]; error?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const { data: todos } = await svc.from('simulado_grupos').select('id, nome, cor').eq('tenant_id', g.tenantId).eq('deletado', false).order('nome')
  const { data: atrib } = await svc.from('simulado_pasta_grupos').select('grupo_id').eq('pasta_id', pastaId)
  const set = new Set((atrib ?? []).map((r: any) => r.grupo_id))
  return { ok: true, grupos: (todos ?? []).map((x: any) => ({ id: x.id, nome: x.nome, cor: x.cor ?? null, atribuido: set.has(x.id) })) }
}

export async function definirGruposPasta(pastaId: string, grupoIds: string[]): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const ids = [...new Set((grupoIds ?? []).filter(Boolean))]
  const del = await svc.from('simulado_pasta_grupos').delete().eq('pasta_id', pastaId).eq('tenant_id', g.tenantId)
  if (del.error && SEM_TABELA(del.error.message)) return { ok: false, error: 'Rode a migração de acesso do módulo (20260909000002).' }
  if (ids.length) {
    const { error } = await svc.from('simulado_pasta_grupos').insert(ids.map((grupo_id) => ({ tenant_id: g.tenantId, pasta_id: pastaId, grupo_id })))
    if (error) return { ok: false, error: error.message }
  }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_pasta_grupos', entidadeId: pastaId, depois: { grupos: ids.length }, atorId: g.atorId, tenantId: g.tenantId })
  revalidatePath('/admin/leitura'); return { ok: true }
}

export async function carregarEstudantesPasta(pastaId: string): Promise<{ ok: boolean; itens?: EstudanteAcessoLinha[]; error?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const { data: at } = await svc.from('simulado_pasta_estudantes').select('estudante_id').eq('pasta_id', pastaId).eq('tenant_id', g.tenantId)
  const ids = [...new Set((at ?? []).map((r: any) => r.estudante_id))]
  if (!ids.length) return { ok: true, itens: [] }
  const es = await fetchAllByIn<any>(ids, (chunk) => svc.from('simulado_estudantes').select('id, nome, email, cpf, classificacao, avatar, perfil_avatar_cor').in('id', chunk).order('nome', { ascending: true }))
  return { ok: true, itens: (es as any[]).map((e): EstudanteAcessoLinha => ({ id: e.id, nome: e.nome ?? 'Aluno', email: e.email ?? null, cpf: e.cpf ?? null, classificacao: e.classificacao ?? null, avatar: e.avatar ?? null, perfil_avatar_cor: e.perfil_avatar_cor ?? null })) }
}

export async function definirEstudantesPasta(pastaId: string, estudanteIds: string[]): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const ids = [...new Set((estudanteIds ?? []).filter(Boolean))]
  const del = await svc.from('simulado_pasta_estudantes').delete().eq('pasta_id', pastaId).eq('tenant_id', g.tenantId)
  if (del.error && SEM_TABELA(del.error.message)) return { ok: false, error: 'Rode a migração de acesso do módulo (20260909000002).' }
  if (ids.length) {
    const { error } = await svc.from('simulado_pasta_estudantes').insert(ids.map((estudante_id) => ({ tenant_id: g.tenantId, pasta_id: pastaId, estudante_id })))
    if (error) return { ok: false, error: error.message }
  }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_pasta_estudantes', entidadeId: pastaId, depois: { estudantes: ids.length }, atorId: g.atorId, tenantId: g.tenantId })
  revalidatePath('/admin/leitura'); return { ok: true }
}

// Lista de alunos do tenant PAGINADA SERVER-SIDE (busca + range no banco) p/ a aba Acessos —
// visual da aba Estudantes (avatar/badge). Evita puxar todos os ~18k alunos de uma vez.
export type EstudanteAcessoLinha = { id: string; nome: string; email: string | null; cpf: string | null; classificacao: string | null; avatar: string | null; perfil_avatar_cor: string | null }

/** Alunos (membros) dos grupos — p/ "Adicionar grupo" linkar os estudantes na tabela (como o banco).
 * Chunked no `.in()` (LANDMINE do proxy) e deduplicado por estudante; cada um marca o grupo de origem. */
export async function estudantesDosGrupos(grupoIds: string[]): Promise<{ ok: boolean; itens?: (EstudanteAcessoLinha & { grupoNome: string | null })[]; error?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  const ids = [...new Set((grupoIds ?? []).filter(Boolean))]
  if (!ids.length) return { ok: true, itens: [] }
  const svc = createAdminClient()
  const { data: gs } = await svc.from('simulado_grupos').select('id, nome').in('id', ids)
  const nomeGrupo = new Map<string, string>((gs ?? []).map((x: any) => [x.id, x.nome]))
  const mem = await fetchAllByIn<any>(ids, (chunk) => svc.from('simulado_grupo_membros').select('estudante_id, grupo_id').in('grupo_id', chunk).order('estudante_id', { ascending: true }))
  const grupoDe = new Map<string, string>()
  for (const m of mem) if (!grupoDe.has(m.estudante_id)) grupoDe.set(m.estudante_id, m.grupo_id)
  const estIds = [...grupoDe.keys()]
  if (!estIds.length) return { ok: true, itens: [] }
  const es = await fetchAllByIn<any>(estIds, (chunk) => svc.from('simulado_estudantes').select('id, nome, email, cpf, classificacao, avatar, perfil_avatar_cor').eq('tenant_id', g.tenantId).eq('deletado', false).in('id', chunk).order('nome', { ascending: true }))
  return { ok: true, itens: (es as any[]).map((e) => ({ id: e.id, nome: e.nome ?? 'Aluno', email: e.email ?? null, cpf: e.cpf ?? null, classificacao: e.classificacao ?? null, avatar: e.avatar ?? null, perfil_avatar_cor: e.perfil_avatar_cor ?? null, grupoNome: nomeGrupo.get(grupoDe.get(e.id)!) ?? null })) }
}

export async function listarEstudantesTenantPag(q: string, offset: number, limit: number): Promise<{ ok: boolean; itens?: EstudanteAcessoLinha[]; total?: number; error?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const query = (q ?? '').trim().replace(/[,%()]/g, ' ').trim()
  const map = (e: any): EstudanteAcessoLinha => ({ id: e.id, nome: e.nome ?? 'Aluno', email: e.email ?? null, cpf: e.cpf ?? null, classificacao: e.classificacao ?? null, avatar: e.avatar ?? null, perfil_avatar_cor: e.perfil_avatar_cor ?? null })
  const build = (cols: string) => {
    let s = svc.from('simulado_estudantes').select(cols, { count: 'exact' }).eq('tenant_id', g.tenantId).eq('deletado', false)
    if (query) s = s.or(`nome.ilike.%${query}%,email.ilike.%${query}%,cpf.ilike.%${query}%`)
    return s.order('nome', { ascending: true }).range(offset, offset + Math.max(1, limit) - 1)
  }
  let r = await build('id, nome, email, cpf, classificacao, avatar, perfil_avatar_cor')
  // Tolerante: se as colunas de perfil (avatar/classificacao) não existirem, refaz só com o básico.
  if (r.error && /classificacao|avatar|perfil_avatar_cor|column/i.test(r.error.message)) r = await build('id, nome, email, cpf') as any
  if (r.error) return { ok: false, error: r.error.message }
  return { ok: true, itens: (r.data ?? []).map(map), total: r.count ?? 0 }
}

// ── "Questões do conteúdo" = MINI-SIMULADO da aula (separado das questões inline da leitura) ──
// A tabela usa o MESMO formato de linha da aba Questões do banco (id = questao_id + disciplina/assunto/dif/status).
export type QuizLinha = { id: string; enunciado: string; tipo: string | null; formato: string | null; nivel_dificuldade: string | null; status: string | null; disciplina: string | null; assunto: string | null; assuntoDetalhe: string | null; banca: string | null; orgao: string | null; ano: number | null }
export type QuizConfig = { modo: 'imediato' | 'simulado'; embaralhar: boolean }
const QUIZ_PADRAO: QuizConfig = { modo: 'imediato', embaralhar: false }
const QUIZ_SEM_TABELA = (m?: string) => /relation .* does not exist|simulado_documento_quiz_questoes|quiz_config|schema cache/i.test(m ?? '')

/** Monta as linhas da tabela (na ordem de `ids`) — tolerante a bases sem `formato`/`assunto_detalhe`. */
async function montarQuizLinhas(svc: ReturnType<typeof createAdminClient>, tenantId: string, ids: string[]): Promise<QuizLinha[]> {
  if (!ids.length) return []
  const SEL = 'id, enunciado, tipo, formato, nivel_dificuldade, status, ano, assunto_detalhe, disciplinas:simulado_disciplinas(nome), assuntos:simulado_assuntos(nome), bancas:simulado_bancas(nome), orgaos:simulado_orgaos(nome)'
  let qs: any[] | null = null, qerr: any = null
  ;({ data: qs, error: qerr } = await svc.from('simulado_questoes').select(SEL).eq('tenant_id', tenantId).in('id', ids) as any)
  if (qerr && /(assunto_detalhe|formato)/i.test(qerr.message)) {
    ;({ data: qs } = await svc.from('simulado_questoes').select(SEL.replace(', formato', '').replace(', assunto_detalhe', '')).eq('tenant_id', tenantId).in('id', ids) as any)
  }
  const byId = new Map((qs ?? []).map((q: any) => [q.id, q]))
  return ids.map((id) => {
    const q: any = byId.get(id); if (!q) return null
    return {
      id: q.id, enunciado: q.enunciado ?? '', tipo: q.tipo ?? null, formato: q.formato ?? null, nivel_dificuldade: q.nivel_dificuldade ?? null, status: q.status ?? null,
      disciplina: q.disciplinas?.nome ?? null, assunto: q.assuntos?.nome ?? null, assuntoDetalhe: q.assunto_detalhe ?? null,
      banca: q.bancas?.nome ?? null, orgao: q.orgaos?.nome ?? null, ano: q.ano ?? null,
    } as QuizLinha
  }).filter(Boolean) as QuizLinha[]
}

export async function listarQuizConteudo(documentoId: string): Promise<{ ok: boolean; itens?: QuizLinha[]; config?: QuizConfig; error?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const { data: dq, error } = await svc.from('simulado_documento_quiz_questoes').select('questao_id, ordem').eq('tenant_id', g.tenantId).eq('documento_id', documentoId).eq('deletado', false).order('ordem', { ascending: true })
  if (error) return { ok: false, error: QUIZ_SEM_TABELA(error.message) ? 'Rode a migração 20260910000001 (Questões do conteúdo).' : error.message }
  let config = QUIZ_PADRAO
  const { data: doc } = await svc.from('simulado_documentos').select('quiz_config').eq('id', documentoId).eq('tenant_id', g.tenantId).maybeSingle()
  if ((doc as any)?.quiz_config) config = { ...QUIZ_PADRAO, ...(doc as any).quiz_config }
  const ordemIds = (dq ?? []).map((x: any) => x.questao_id)
  if (!ordemIds.length) return { ok: true, itens: [], config }
  const itens = await montarQuizLinhas(svc, g.tenantId, ordemIds)
  return { ok: true, itens, config }
}

export async function adicionarQuizQuestoes(documentoId: string, questaoIds: string[]): Promise<{ ok: boolean; error?: string; linhas?: QuizLinha[] }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  const ids = [...new Set((questaoIds ?? []).filter(Boolean))]
  if (!ids.length) return { ok: true, linhas: [] }
  const svc = createAdminClient()
  const { data: mx } = await svc.from('simulado_documento_quiz_questoes').select('ordem').eq('tenant_id', g.tenantId).eq('documento_id', documentoId).order('ordem', { ascending: false }).limit(1).maybeSingle()
  let ordem = ((mx as any)?.ordem ?? -1) + 1
  const { error } = await svc.from('simulado_documento_quiz_questoes').upsert(ids.map((questao_id) => ({ tenant_id: g.tenantId, documento_id: documentoId, questao_id, ordem: ordem++, deletado: false })), { onConflict: 'documento_id,questao_id' })
  if (error) return { ok: false, error: QUIZ_SEM_TABELA(error.message) ? 'Rode a migração 20260910000001 (Questões do conteúdo).' : error.message }
  revalidatePath(`/admin/leitura/${documentoId}/questoes`)
  // Retorna só as linhas ADICIONADAS (o cliente anexa sem refetch da lista inteira — evita a demora).
  return { ok: true, linhas: await montarQuizLinhas(svc, g.tenantId, ids) }
}

/** Remove do quiz por QUESTÃO (a tabela base seleciona por questao_id). */
export async function removerQuizQuestoes(documentoId: string, questaoIds: string[]): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  const ids = [...new Set((questaoIds ?? []).filter(Boolean))]
  if (!ids.length) return { ok: true }
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_documento_quiz_questoes').update({ deletado: true }).eq('tenant_id', g.tenantId).eq('documento_id', documentoId).in('questao_id', ids)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/admin/leitura/${documentoId}/questoes`); return { ok: true }
}

/** Reordena por QUESTÃO (grava ordem = índice conforme a lista de questao_id). */
export async function reordenarQuizQuestoes(documentoId: string, questaoIds: string[]): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  for (let i = 0; i < questaoIds.length; i++) await svc.from('simulado_documento_quiz_questoes').update({ ordem: i }).eq('tenant_id', g.tenantId).eq('documento_id', documentoId).eq('questao_id', questaoIds[i])
  return { ok: true }
}

export async function importarQuizQuestoes(documentoId: string, rows: QuestaoImport[]): Promise<{ ok: boolean; count?: number; error?: string; linhas?: QuizLinha[] }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  if (!rows?.length) return { ok: false, error: 'Nada para importar.' }
  const imp = await confirmarImportQuestoes(null, rows)
  if (!imp.ok) return { ok: false, error: imp.error ?? 'Falha ao importar as questões.' }
  const r = await adicionarQuizQuestoes(documentoId, imp.ids ?? [])
  if (!r.ok) return { ok: false, error: r.error }
  return { ok: true, count: (imp.ids ?? []).length, linhas: r.linhas }
}

export async function salvarQuizConfig(documentoId: string, config: Partial<QuizConfig>): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const { data: doc } = await svc.from('simulado_documentos').select('quiz_config').eq('id', documentoId).eq('tenant_id', g.tenantId).maybeSingle()
  const merged = { ...QUIZ_PADRAO, ...((doc as any)?.quiz_config ?? {}), ...config }
  const { error } = await svc.from('simulado_documentos').update({ quiz_config: merged, atualizado_em: new Date().toISOString() }).eq('id', documentoId).eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: QUIZ_SEM_TABELA(error.message) ? 'Rode a migração 20260910000001 (Questões do conteúdo).' : error.message }
  revalidatePath(`/admin/leitura/${documentoId}/questoes`); return { ok: true }
}
