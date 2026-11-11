'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { getCurso, listarAulasParaEdital, migracaoAusente, coresDoTenant } from '@/lib/revisao/cursos'
import { getCurrentTenant } from '@/lib/tenant'
import {
  TIPOS_CURSO, TIPOS_NOVO, MODELOS, MODELO_PADRAO_TIPO, ETAPAS_PAD_PADRAO, MSG_AUTO, MAIL_AUTO, POP_QUANDO, POP_FREQ, MSG_PROVEDORES,
  mesclarCfg, mesclarEdital, type EtapasData, type ModeloId,
} from '@/lib/revisao/cursos-defs'

// Mutações de Montagem de curso › Cursos. Toda escrita: permissão (produtos:manage) + isolamento por tenant_id +
// registrarAudit. Resultado { ok } | { error } — nunca lança para a tela.
// Depende da migração 20261112020000 (simulado_cursos e filhas); sem ela devolve aviso claro.

type R<T = object> = ({ ok: true } & T) | { error: string }

async function guard() {
  const access = await getCurrentAccess()
  if (!(accessCan(access, 'produtos:manage') || accessCan(access, 'produtos:update'))) return { ok: false as const, error: 'Sem permissão.' }
  if (!access.tenantId) return { ok: false as const, error: 'Tenant não resolvido — recarregue a página.' }
  return { ok: true as const, tenantId: access.tenantId, userId: access.userId }
}
const SEM_MIGRACAO = 'Montagem de curso indisponível no banco. Aplique a migração 20261112020000_revisao_cursos.sql.'
const erro = (m?: string | null) => (migracaoAusente(m) ? SEM_MIGRACAO : m || 'Falha ao salvar.')
const BASE = '/admin/revisao/cursos'
function revalidar(id?: string) { revalidatePath(BASE); if (id) revalidatePath(`${BASE}/${id}`) }
const HEX = /^#[0-9a-fA-F]{6}$/
const URL_OK = (u: unknown) => typeof u === 'string' && /^https?:\/\//i.test(u.trim())
const DATA_OK = (d: unknown) => (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null)
const hoje = () => new Date().toISOString()

async function produtosDoCurso(svc: ReturnType<typeof createAdminClient>, tenantId: string, cursoId: string): Promise<string[]> {
  const { data } = await svc.from('simulado_curso_produtos').select('produto_id').eq('tenant_id', tenantId).eq('curso_id', cursoId).limit(200)
  return (data ?? []).map((r: any) => r.produto_id as string)
}

async function patchCurso(svc: ReturnType<typeof createAdminClient>, tenantId: string, id: string, patch: Record<string, unknown>) {
  return svc.from('simulado_cursos').update({ ...patch, atualizado_em: hoje() }).eq('id', id).eq('tenant_id', tenantId).eq('deletado', false)
}

function tipoProduto(tipo: string) { return tipo === 'Extensivo' ? 'extensivo' : tipo === 'Sprint' ? 'sprint' : 'outro' }
function slugDe(nome: string) {
  return (nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'curso') + '-' + Math.random().toString(16).slice(2, 8)
}
async function criarProduto(svc: ReturnType<typeof createAdminClient>, tenantId: string, userId: string | null, nome: string, tipo: string, pastaId: string | null, c1: string, c2: string) {
  const base = { tenant_id: tenantId, nome, slug: slugDe(nome), tipo: tipoProduto(tipo), ativo: false, cor: c1, cor_secundaria: c2, criado_por: userId }
  let r: any = await svc.from('simulado_produtos').insert({ ...base, pasta_id: pastaId }).select('id').single()
  if (r.error && /pasta_id/.test(r.error.message)) r = await svc.from('simulado_produtos').insert(base).select('id').single()
  return r as { data: { id: string } | null; error: { message: string } | null }
}

// ═════════ CRIAR (#novocurso) ═════════
export async function criarCursoAction(input: { nome: string; tipo: string; modelo: string; cfg: unknown }): Promise<R<{ id: string }>> {
  const g = await guard(); if (!g.ok) return { error: g.error }
  const nome = (input.nome ?? '').trim()
  if (!nome) return { error: 'Dê um nome ao curso.' }
  const cores = coresDoTenant((await getCurrentTenant())?.tema)
  const tipo = (TIPOS_NOVO as readonly string[]).includes(input.tipo) ? input.tipo : 'Curso'
  const modelo = (MODELOS.some((m) => m.id === input.modelo) ? input.modelo : MODELO_PADRAO_TIPO[tipo] ?? 'trilha') as ModeloId
  const cfg = mesclarCfg(input.cfg)
  const svc = createAdminClient()

  // Etapa 1: pasta própria, com o nome do curso (área de produtos do Estúdio).
  const pasta = await svc.from('simulado_pastas').insert({ tenant_id: g.tenantId, nome, is_folder: true, pai_id: null, folder_area: 'produto' }).select('id').single()
  if (pasta.error || !pasta.data) return { error: pasta.error?.message || 'Falha ao criar a pasta do curso.' }
  const pastaId = (pasta.data as any).id as string
  // Etapa 2: produto principal (os demais produtos entram na tela do passo a passo).
  const prod = await criarProduto(svc, g.tenantId, g.userId, nome, tipo, pastaId, cores.c1 ?? '#2E2150', cores.c2 ?? '#E5B230')
  if (prod.error || !prod.data) { await svc.from('simulado_pastas').delete().eq('id', pastaId).eq('tenant_id', g.tenantId); return { error: prod.error?.message || 'Falha ao criar o produto do curso.' } }
  const produtoId = prod.data.id

  const etapas: EtapasData = { prodOk: false, pad: { ...ETAPAS_PAD_PADRAO }, sprint: tipo === 'Sprint', pastaPass: false, gOk: false, vitrine: '', sem1: false, guia: false, wa: '', pub: false }
  const ins = await svc.from('simulado_cursos').insert({
    tenant_id: g.tenantId, nome, tipo, modelo, cfg, ativo: false, ...(cores.c1 ? { cor_principal: cores.c1 } : {}), ...(cores.c2 ? { cor_destaque: cores.c2 } : {}), pasta_id: pastaId, produto_id: produtoId, etapas, criado_por: g.userId,
  }).select('id').single()
  if (ins.error || !ins.data) {
    await svc.from('simulado_produtos').delete().eq('id', produtoId).eq('tenant_id', g.tenantId)
    await svc.from('simulado_pastas').delete().eq('id', pastaId).eq('tenant_id', g.tenantId)
    return { error: erro(ins.error?.message) }
  }
  const cursoId = (ins.data as any).id as string
  await svc.from('simulado_curso_produtos').insert({ tenant_id: g.tenantId, curso_id: cursoId, produto_id: produtoId, ordem: 0 })

  // Etapa 4: trilha criada automaticamente com o(s) produto(s) (tabela do Estúdio; best-effort).
  try {
    const tr = await svc.from('simulado_trilhas').insert({ tenant_id: g.tenantId, nome: `Trilha ${nome}`, visibilidade: 'publica', criado_por: g.userId }).select('id').single()
    if (tr.data) {
      await svc.from('simulado_trilha_itens').insert({ tenant_id: g.tenantId, trilha_id: (tr.data as any).id, produto_id: produtoId, ordem: 0 })
      await patchCurso(svc, g.tenantId, cursoId, { trilha_id: (tr.data as any).id })
    }
  } catch { /* trilhas ausentes: o passo 4 segue pela vitrine */ }

  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_cursos', entidadeId: cursoId, depois: { nome, tipo, modelo, pasta_id: pastaId, produto_id: produtoId }, tenantId: g.tenantId })
  revalidar(); return { ok: true, id: cursoId }
}

// ═════════ ATIVAR / DESATIVAR (#cursos e cabeçalho do curso) ═════════
export async function alternarAtivoAction(id: string, ativo: boolean): Promise<R> {
  const g = await guard(); if (!g.ok) return { error: g.error }
  const svc = createAdminClient()
  const { error } = await patchCurso(svc, g.tenantId, id, { ativo: !!ativo })
  if (error) return { error: erro(error.message) }
  // Curso desativado some para o aluno (o progresso fica guardado): espelha nos produtos do curso.
  const pids = await produtosDoCurso(svc, g.tenantId, id)
  for (let i = 0; i < pids.length; i += 80) await svc.from('simulado_produtos').update({ ativo: !!ativo, atualizado_em: hoje() }).eq('tenant_id', g.tenantId).in('id', pids.slice(i, i + 80))
  await registrarAudit({ operacao: ativo ? 'LIBERAR' : 'BLOQUEAR', entidade: 'simulado_cursos', entidadeId: id, depois: { ativo: !!ativo }, tenantId: g.tenantId })
  revalidar(id); return { ok: true }
}

// ═════════ INFORMAÇÕES ═════════
export async function salvarInfoAction(id: string, d: { nome: string; tipo: string; sub: string; abre_em: string; fecha_em: string; cronograma_adaptativo: boolean }): Promise<R> {
  const g = await guard(); if (!g.ok) return { error: g.error }
  const nome = (d.nome ?? '').trim(); if (!nome) return { error: 'Informe o nome do curso.' }
  const tipo = (TIPOS_CURSO as readonly string[]).includes(d.tipo) ? d.tipo : 'Curso'
  const abre = DATA_OK(d.abre_em), fecha = DATA_OK(d.fecha_em)
  if (abre && fecha && fecha < abre) return { error: 'A data de fechamento não pode ser antes da abertura.' }
  const svc = createAdminClient()
  const { data: atual } = await svc.from('simulado_cursos').select('pasta_id').eq('id', id).eq('tenant_id', g.tenantId).maybeSingle()
  const { error } = await patchCurso(svc, g.tenantId, id, { nome, tipo, sub: (d.sub ?? '').trim() || null, abre_em: abre, fecha_em: fecha, cronograma_adaptativo: !!d.cronograma_adaptativo })
  if (error) return { error: erro(error.message) }
  // "Mudou o nome em Informações, a pasta muda junto."
  if ((atual as any)?.pasta_id) await svc.from('simulado_pastas').update({ nome }).eq('id', (atual as any).pasta_id).eq('tenant_id', g.tenantId).eq('folder_area', 'produto')
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_cursos', entidadeId: id, depois: { nome, tipo, abre_em: abre, fecha_em: fecha }, tenantId: g.tenantId })
  revalidar(id); return { ok: true }
}

// ═════════ MODELO ("Como o aluno vê") ═════════
export async function salvarModeloAction(id: string, d: { modelo: string; cfg: unknown; blk: string[] }): Promise<R> {
  const g = await guard(); if (!g.ok) return { error: g.error }
  if (!MODELOS.some((m) => m.id === d.modelo)) return { error: 'Modelo inválido.' }
  const svc = createAdminClient()
  const { error } = await patchCurso(svc, g.tenantId, id, { modelo: d.modelo, cfg: mesclarCfg(d.cfg), blk: (d.blk ?? []).filter((x) => typeof x === 'string').slice(0, 12) })
  if (error) return { error: erro(error.message) }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_cursos', entidadeId: id, depois: { modelo: d.modelo }, tenantId: g.tenantId })
  revalidar(id); return { ok: true }
}

// ═════════ PASSO A PASSO ═════════
export async function salvarEtapaAction(id: string, patch: Partial<EtapasData>): Promise<R> {
  const g = await guard(); if (!g.ok) return { error: g.error }
  const svc = createAdminClient()
  const { data, error: e0 } = await svc.from('simulado_cursos').select('etapas').eq('id', id).eq('tenant_id', g.tenantId).maybeSingle()
  if (e0) return { error: erro(e0.message) }
  const atual: EtapasData = ((data as any)?.etapas ?? {}) as EtapasData
  const prox: EtapasData = { ...atual }
  for (const k of ['prodOk', 'sprint', 'pastaPass', 'gOk', 'sem1', 'guia'] as const) if (typeof patch[k] === 'boolean') prox[k] = patch[k]
  if (typeof patch.vitrine === 'string') prox.vitrine = patch.vitrine.slice(0, 120)
  if (typeof patch.wa === 'string') {
    const wa = patch.wa.trim()
    if (wa && !URL_OK(wa)) return { error: 'O link do grupo do WhatsApp precisa começar com https://' }
    prox.wa = wa
  }
  if (patch.pad) prox.pad = { ...ETAPAS_PAD_PADRAO, ...(atual.pad ?? {}), ...Object.fromEntries(Object.entries(patch.pad).filter(([, v]) => typeof v === 'boolean')) }
  const { error } = await patchCurso(svc, g.tenantId, id, { etapas: prox })
  if (error) return { error: erro(error.message) }
  // Vitrine = formato de exibição do conteúdo (simulado_produtos.vitrine_layout) em todos os produtos do curso.
  if (typeof patch.vitrine === 'string' && ['netflix', 'grade', 'trilha', 'trilha_imagem', 'lista'].includes(patch.vitrine)) {
    const pids = await produtosDoCurso(svc, g.tenantId, id)
    for (let i = 0; i < pids.length; i += 80) await svc.from('simulado_produtos').update({ vitrine_layout: patch.vitrine }).eq('tenant_id', g.tenantId).in('id', pids.slice(i, i + 80))
  }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_cursos', entidadeId: id, antes: atual as Record<string, unknown>, depois: prox as Record<string, unknown>, tenantId: g.tenantId })
  revalidar(id); return { ok: true }
}

export async function publicarCursoAction(id: string): Promise<R> {
  const g = await guard(); if (!g.ok) return { error: g.error }
  const det = await getCurso(g.tenantId, id)
  if (det === 'migracao') return { error: SEM_MIGRACAO }
  if (!det) return { error: 'Curso não encontrado.' }
  const falta = det.etapasOk.slice(0, 5).map((v, i) => (v ? '' : `etapa ${i + 1}`)).filter(Boolean)
  if (falta.length) return { error: `Falta concluir: ${falta.join(', ')}.` }
  const svc = createAdminClient()
  const { error } = await patchCurso(svc, g.tenantId, id, { etapas: { ...det.curso.etapas, pub: true }, ativo: true })
  if (error) return { error: erro(error.message) }
  const pids = await produtosDoCurso(svc, g.tenantId, id)
  for (let i = 0; i < pids.length; i += 80) await svc.from('simulado_produtos').update({ ativo: true, atualizado_em: hoje() }).eq('tenant_id', g.tenantId).in('id', pids.slice(i, i + 80))
  await registrarAudit({ operacao: 'LIBERAR', entidade: 'simulado_cursos', entidadeId: id, depois: { publicado: true, vitrine: det.curso.etapas.vitrine ?? null }, tenantId: g.tenantId })
  revalidar(id); return { ok: true }
}

// ── Etapa 2: produtos do curso ──
export async function adicionarProdutoCursoAction(cursoId: string): Promise<R> {
  const g = await guard(); if (!g.ok) return { error: g.error }
  const svc = createAdminClient()
  const { data: c } = await svc.from('simulado_cursos').select('tipo, pasta_id, cor_principal, cor_destaque, ativo').eq('id', cursoId).eq('tenant_id', g.tenantId).maybeSingle()
  if (!c) return { error: 'Curso não encontrado.' }
  const p = await criarProduto(svc, g.tenantId, g.userId, 'Novo produto', (c as any).tipo, (c as any).pasta_id ?? null, (c as any).cor_principal, (c as any).cor_destaque)
  if (p.error || !p.data) return { error: p.error?.message || 'Falha ao criar o produto.' }
  const { count } = await svc.from('simulado_curso_produtos').select('id', { count: 'exact', head: true }).eq('tenant_id', g.tenantId).eq('curso_id', cursoId)
  await svc.from('simulado_curso_produtos').insert({ tenant_id: g.tenantId, curso_id: cursoId, produto_id: p.data.id, ordem: count ?? 0 })
  // Passo 3 depende dos produtos: precisa conferir de novo.
  const { data: ex } = await svc.from('simulado_cursos').select('etapas').eq('id', cursoId).eq('tenant_id', g.tenantId).maybeSingle()
  await patchCurso(svc, g.tenantId, cursoId, { etapas: { ...((ex as any)?.etapas ?? {}), prodOk: false, gOk: false } })
  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_produtos', entidadeId: p.data.id, depois: { curso_id: cursoId, nome: 'Novo produto' }, tenantId: g.tenantId })
  revalidar(cursoId); return { ok: true }
}

export async function renomearProdutoCursoAction(cursoId: string, produtoId: string, nome: string): Promise<R> {
  const g = await guard(); if (!g.ok) return { error: g.error }
  const n = (nome ?? '').trim(); if (!n) return { error: 'Informe o nome do produto.' }
  const svc = createAdminClient()
  const pids = await produtosDoCurso(svc, g.tenantId, cursoId)
  if (!pids.includes(produtoId)) return { error: 'Produto não pertence a este curso.' }
  const { error } = await svc.from('simulado_produtos').update({ nome: n, atualizado_em: hoje() }).eq('id', produtoId).eq('tenant_id', g.tenantId)
  if (error) return { error: error.message }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_produtos', entidadeId: produtoId, depois: { nome: n }, tenantId: g.tenantId })
  revalidar(cursoId); return { ok: true }
}

export async function removerProdutoCursoAction(cursoId: string, produtoId: string): Promise<R> {
  const g = await guard(); if (!g.ok) return { error: g.error }
  const svc = createAdminClient()
  const { data: c } = await svc.from('simulado_cursos').select('produto_id').eq('id', cursoId).eq('tenant_id', g.tenantId).maybeSingle()
  if (!c) return { error: 'Curso não encontrado.' }
  if ((c as any).produto_id === produtoId) return { error: 'O produto principal não sai do curso (ele guarda as aulas e os grupos).' }
  await svc.from('simulado_curso_produtos').delete().eq('curso_id', cursoId).eq('produto_id', produtoId).eq('tenant_id', g.tenantId)
  // Só apaga o produto de vez se ninguém usa; com alunos ele fica no Estúdio, apenas desligado do curso.
  const { count } = await svc.from('simulado_assinaturas').select('id', { count: 'exact', head: true }).eq('tenant_id', g.tenantId).eq('produto_id', produtoId)
  if (!count) await svc.from('simulado_produtos').delete().eq('id', produtoId).eq('tenant_id', g.tenantId)
  await registrarAudit({ operacao: 'DELETE', entidade: 'simulado_curso_produtos', entidadeId: produtoId, antes: { curso_id: cursoId }, tenantId: g.tenantId })
  revalidar(cursoId); return { ok: true }
}

// ═════════ GRUPOS DE ACESSO (etapa 3 e aba "Quem acessa") ═════════
// Grupo marcado = item tipo 'grupo' em TODOS os produtos do curso ("os grupos marcados recebem todos os produtos").
export async function alternarGrupoCursoAction(cursoId: string, grupoId: string, marcado: boolean): Promise<R> {
  const g = await guard(); if (!g.ok) return { error: g.error }
  const svc = createAdminClient()
  const { data: gr } = await svc.from('simulado_grupos').select('id, nome').eq('id', grupoId).eq('tenant_id', g.tenantId).maybeSingle()
  if (!gr) return { error: 'Grupo não encontrado.' }
  const pids = await produtosDoCurso(svc, g.tenantId, cursoId)
  if (!pids.length) return { error: 'O curso ainda não tem produto.' }
  if (marcado) {
    const { error } = await svc.from('simulado_produto_itens').upsert(pids.map((produto_id) => ({ tenant_id: g.tenantId, produto_id, tipo_item: 'grupo', item_id: grupoId, ativo: true })), { onConflict: 'produto_id,tipo_item,item_id', ignoreDuplicates: true })
    if (error) return { error: error.message }
  } else {
    for (let i = 0; i < pids.length; i += 80) await svc.from('simulado_produto_itens').delete().eq('tenant_id', g.tenantId).eq('tipo_item', 'grupo').eq('item_id', grupoId).in('produto_id', pids.slice(i, i + 80))
  }
  await registrarAudit({ operacao: marcado ? 'INSERT' : 'DELETE', entidade: 'simulado_produto_itens', entidadeId: cursoId, depois: { tipo_item: 'grupo', grupo: (gr as any).nome, produtos: pids.length }, tenantId: g.tenantId })
  revalidar(cursoId); return { ok: true }
}

// ═════════ IMAGENS E CORES ═════════
export async function salvarArteAction(id: string, d: { img_horizontal: string | null; img_vertical: string | null; img_banner: string | null; galeria: string[]; cor_principal: string; cor_destaque: string }): Promise<R> {
  const g = await guard(); if (!g.ok) return { error: g.error }
  if (!HEX.test(d.cor_principal) || !HEX.test(d.cor_destaque)) return { error: 'Cor inválida.' }
  const url = (u: string | null) => (u && URL_OK(u) ? u.trim() : null)
  const galeria = (d.galeria ?? []).filter(URL_OK).slice(0, 60)
  const svc = createAdminClient()
  const { data: c } = await svc.from('simulado_cursos').select('etapas').eq('id', id).eq('tenant_id', g.tenantId).maybeSingle()
  if (!c) return { error: 'Curso não encontrado.' }
  const campos = { img_horizontal: url(d.img_horizontal), img_vertical: url(d.img_vertical), img_banner: url(d.img_banner), galeria, cor_principal: d.cor_principal, cor_destaque: d.cor_destaque }
  const { error } = await patchCurso(svc, g.tenantId, id, campos)
  if (error) return { error: erro(error.message) }
  // Etapa 3: com "Capa" ligada, os produtos do curso nascem com a capa/cores do curso.
  if (((c as any).etapas?.pad?.capa ?? true) !== false) {
    const pids = await produtosDoCurso(svc, g.tenantId, id)
    for (let i = 0; i < pids.length; i += 80) {
      await svc.from('simulado_produtos').update({ capa_url: campos.img_horizontal, banner_url: campos.img_banner, cor: d.cor_principal, cor_secundaria: d.cor_destaque, atualizado_em: hoje() }).eq('tenant_id', g.tenantId).in('id', pids.slice(i, i + 80))
    }
  }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_cursos', entidadeId: id, depois: { ...campos, galeria: galeria.length }, tenantId: g.tenantId })
  revalidar(id); return { ok: true }
}

// ═════════ PASSAPORTE E EDITAL ═════════
export async function salvarEditalAction(id: string, d: unknown): Promise<R> {
  const g = await guard(); if (!g.ok) return { error: g.error }
  const e = mesclarEdital(d)
  const modos = e.modos.filter((m) => ['conciliar', 'seguir', 'curso'].includes(m))
  if (!modos.length) return { error: 'Deixe pelo menos uma opção para o aluno.' }
  const ed = { ...e, modos, orgao: e.orgao.trim().slice(0, 200), pub: DATA_OK(e.pub) ?? '', prova: DATA_OK(e.prova) ?? '', min: 30, max: 80, peso: Math.min(80, Math.max(30, Math.round(Number(e.peso) / 10) * 10 || 50)) }
  const svc = createAdminClient()
  const { error } = await patchCurso(svc, g.tenantId, id, { edital: ed })
  if (error) return { error: erro(error.message) }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_cursos', entidadeId: id, depois: { edital: ed }, tenantId: g.tenantId })
  revalidar(id); return { ok: true }
}

export async function listarAulasEditalAction(cursoId: string, moduloId: string): Promise<R<{ aulas: { id: string; titulo: string; ligada: boolean }[] }>> {
  const g = await guard(); if (!g.ok) return { error: g.error }
  return { ok: true, aulas: await listarAulasParaEdital(g.tenantId, cursoId, moduloId) }
}

export async function ligarAulaEditalAction(cursoId: string, aulaId: string, ligada: boolean): Promise<R> {
  const g = await guard(); if (!g.ok) return { error: g.error }
  const svc = createAdminClient()
  if (ligada) {
    const { error } = await svc.from('simulado_curso_edital_aulas').upsert({ tenant_id: g.tenantId, curso_id: cursoId, modulo_id: aulaId }, { onConflict: 'curso_id,modulo_id', ignoreDuplicates: true })
    if (error) return { error: erro(error.message) }
  } else {
    await svc.from('simulado_curso_edital_aulas').delete().eq('tenant_id', g.tenantId).eq('curso_id', cursoId).eq('modulo_id', aulaId)
  }
  await registrarAudit({ operacao: ligada ? 'INSERT' : 'DELETE', entidade: 'simulado_curso_edital_aulas', entidadeId: cursoId, depois: { aula: aulaId }, tenantId: g.tenantId })
  revalidar(cursoId); return { ok: true }
}

// ═════════ POP-UPS ═════════
export async function criarPopupAction(cursoId: string, d: { titulo: string; texto: string; botao_texto: string; botao_link: string; quando: string; frequencia: string; no_ar_de: string; no_ar_ate: string; imagem_url: string | null }): Promise<R> {
  const g = await guard(); if (!g.ok) return { error: g.error }
  const titulo = (d.titulo ?? '').trim(); if (!titulo) return { error: 'Dê um título ao pop-up.' }
  if (d.botao_link?.trim() && !URL_OK(d.botao_link)) return { error: 'O link do botão precisa começar com https://' }
  const de = DATA_OK(d.no_ar_de), ate = DATA_OK(d.no_ar_ate)
  if (de && ate && ate < de) return { error: 'A data final não pode ser antes da inicial.' }
  const svc = createAdminClient()
  const { data, error } = await svc.from('simulado_curso_popups').insert({
    tenant_id: g.tenantId, curso_id: cursoId, titulo: titulo.slice(0, 160), texto: (d.texto ?? '').slice(0, 1000) || null,
    botao_texto: (d.botao_texto ?? '').trim().slice(0, 60) || null, botao_link: d.botao_link?.trim() || null,
    quando: POP_QUANDO.includes(d.quando) ? d.quando : POP_QUANDO[0], frequencia: POP_FREQ.includes(d.frequencia) ? d.frequencia : POP_FREQ[0],
    no_ar_de: de, no_ar_ate: ate, imagem_url: d.imagem_url && URL_OK(d.imagem_url) ? d.imagem_url : null, ativo: true, criado_por: g.userId,
  }).select('id').single()
  if (error) return { error: erro(error.message) }
  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_curso_popups', entidadeId: (data as any).id, depois: { curso_id: cursoId, titulo }, tenantId: g.tenantId })
  revalidar(cursoId); return { ok: true }
}

export async function alternarPopupAction(cursoId: string, id: string, ativo: boolean): Promise<R> {
  const g = await guard(); if (!g.ok) return { error: g.error }
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_curso_popups').update({ ativo: !!ativo }).eq('id', id).eq('curso_id', cursoId).eq('tenant_id', g.tenantId)
  if (error) return { error: erro(error.message) }
  await registrarAudit({ operacao: ativo ? 'LIBERAR' : 'BLOQUEAR', entidade: 'simulado_curso_popups', entidadeId: id, depois: { ativo: !!ativo }, tenantId: g.tenantId })
  revalidar(cursoId); return { ok: true }
}

export async function excluirPopupAction(cursoId: string, id: string): Promise<R> {
  const g = await guard(); if (!g.ok) return { error: g.error }
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_curso_popups').delete().eq('id', id).eq('curso_id', cursoId).eq('tenant_id', g.tenantId)
  if (error) return { error: erro(error.message) }
  await registrarAudit({ operacao: 'DELETE', entidade: 'simulado_curso_popups', entidadeId: id, tenantId: g.tenantId })
  revalidar(cursoId); return { ok: true }
}

// ═════════ MENSAGENS (WhatsApp) e E-MAILS automáticos ═════════
export async function salvarConexaoMensagensAction(cursoId: string, d: { prov: string; num: string; con: boolean }): Promise<R> {
  const g = await guard(); if (!g.ok) return { error: g.error }
  const svc = createAdminClient()
  const cfg = { prov: MSG_PROVEDORES.includes(d.prov) ? d.prov : MSG_PROVEDORES[0], num: (d.num ?? '').trim().slice(0, 30), con: !!d.con }
  const { error } = await patchCurso(svc, g.tenantId, cursoId, { msg_cfg: cfg })
  if (error) return { error: erro(error.message) }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_cursos', entidadeId: cursoId, depois: { msg_cfg: cfg }, tenantId: g.tenantId })
  revalidar(cursoId); return { ok: true }
}

export async function salvarAutomacaoAction(cursoId: string, canal: 'whatsapp' | 'email', chave: string, patch: { ativo?: boolean; assunto?: string; texto?: string }): Promise<R> {
  const g = await guard(); if (!g.ok) return { error: g.error }
  const lista = canal === 'whatsapp' ? MSG_AUTO : MAIL_AUTO
  if (!lista.some((a) => a[0] === chave)) return { error: 'Automação inválida.' }
  const svc = createAdminClient()
  const { data: atual } = await svc.from('simulado_curso_automacoes').select('ativo, assunto, texto').eq('tenant_id', g.tenantId).eq('curso_id', cursoId).eq('canal', canal).eq('chave', chave).maybeSingle()
  const row = {
    tenant_id: g.tenantId, curso_id: cursoId, canal, chave,
    ativo: typeof patch.ativo === 'boolean' ? patch.ativo : (atual as any)?.ativo ?? null,
    assunto: typeof patch.assunto === 'string' ? patch.assunto.slice(0, 200) : (atual as any)?.assunto ?? null,
    texto: typeof patch.texto === 'string' ? patch.texto.slice(0, 4000) : (atual as any)?.texto ?? null,
    atualizado_em: hoje(),
  }
  const { error } = await svc.from('simulado_curso_automacoes').upsert(row, { onConflict: 'curso_id,canal,chave' })
  if (error) return { error: erro(error.message) }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_curso_automacoes', entidadeId: cursoId, antes: (atual as Record<string, unknown> | null) ?? null, depois: { canal, chave, ...patch }, tenantId: g.tenantId })
  revalidar(cursoId); return { ok: true }
}
