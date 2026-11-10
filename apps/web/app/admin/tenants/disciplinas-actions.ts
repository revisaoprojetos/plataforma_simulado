'use server'
import type { DisciplinaAtual, DisciplinaDisponivel, PlataformaCol, DisciplinaTodas } from './disciplinas-actions-tipos'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { resolverTaxonomiaPorNome } from '@/lib/taxonomia/resolver-nome'
import { chaveSemantica } from '@/lib/taxonomia/disciplina-semantica'

// Console › Plataforma › Disciplinas: cada plataforma (tenant) tem as SUAS disciplinas, independentes (classificação, cor e ordem próprias).
// Aqui o super-admin adiciona à plataforma as disciplinas que existem nas OUTRAS e ela ainda não tem. "Ainda não tem" usa o mesmo
// cruzamento do importador (nome igual, alias ou mesma matéria escrita de outro jeito) — então não cria a duplicada com outro nome.

const CLASS_OK = ['essencial', 'complementar', 'especifica']


export async function listarDisciplinasPlataforma(tenantId: string): Promise<{ ok: boolean; error?: string; atuais?: DisciplinaAtual[]; disponiveis?: DisciplinaDisponivel[]; plataformas?: PlataformaCol[]; todas?: DisciplinaTodas[] }> {
  if (!(await isSuperAdmin())) return { ok: false, error: 'Ação exclusiva do super-administrador global.' }
  const svc = createAdminClient()
  const [{ data: discs, error }, { data: tenants }] = await Promise.all([
    svc.from('simulado_disciplinas').select('id, tenant_id, nome, classificacao, cor, ordem').order('nome'),
    svc.from('simulado_tenants').select('id, nome, slug'),
  ])
  if (error) return { ok: false, error: error.message }
  const nomeTenant = new Map((tenants ?? []).map((t: any) => [t.id, t.nome || t.slug]))
  const todas = (discs ?? []) as Array<DisciplinaAtual & { tenant_id: string }>
  const atuais: DisciplinaAtual[] = todas.filter((d) => d.tenant_id === tenantId).map((d) => ({ id: d.id, nome: d.nome, classificacao: d.classificacao, cor: d.cor, ordem: d.ordem }))

  // candidatas das OUTRAS plataformas, agrupadas por "mesma matéria" (chave semântica)
  const grupos = new Map<string, Array<DisciplinaAtual & { tenant_id: string }>>()
  for (const d of todas) {
    if (d.tenant_id === tenantId) continue
    const k = chaveSemantica(d.nome) || d.nome.toLowerCase()
    grupos.set(k, [...(grupos.get(k) ?? []), d])
  }
  const disponiveis: DisciplinaDisponivel[] = []
  for (const [chave, g] of grupos) {
    // a plataforma já tem? (nome igual, alias ou mesma matéria) — usa o cruzamento do importador, sem criar
    const ja = await resolverTaxonomiaPorNome(svc, 'simulado_disciplinas', tenantId, g[0].nome, { criar: false })
    if (ja) continue
    // representante: o nome mais frequente entre as origens; classificação/cor da 1ª que tiver
    const cont = new Map<string, number>()
    for (const d of g) cont.set(d.nome, (cont.get(d.nome) ?? 0) + 1)
    const nome = [...cont.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0][0]
    const base = g.find((d) => d.classificacao) ?? g[0]
    disponiveis.push({
      chave, nome, classificacao: base.classificacao ?? null, cor: g.find((d) => d.cor)?.cor ?? null, ordem: base.ordem ?? null,
      origens: [...new Set(g.map((d) => String(nomeTenant.get(d.tenant_id) ?? '?')))],
    })
  }
  disponiveis.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  const plataformas: PlataformaCol[] = (tenants ?? []).map((t: any) => ({ id: t.id, nome: String(t.nome || t.slug) }))
  plataformas.sort((a, b) => (a.id === tenantId ? -1 : b.id === tenantId ? 1 : a.nome.localeCompare(b.nome, 'pt-BR')))
  const todasOut: DisciplinaTodas[] = todas.map((d) => ({ id: d.id, tenant_id: d.tenant_id, nome: d.nome, classificacao: d.classificacao ?? null }))
  return { ok: true, atuais, disponiveis, plataformas, todas: todasOut }
}

/** Cria na plataforma as disciplinas escolhidas (linhas PRÓPRIAS dela). `herdar` copia classificação/cor/ordem da origem. */
export async function adicionarDisciplinasPlataforma(
  tenantId: string,
  itens: Array<{ nome: string; classificacao?: string | null; cor?: string | null; ordem?: number | null }>,
  herdar: boolean,
): Promise<{ ok: boolean; error?: string; criadas?: number; jaExistiam?: number }> {
  if (!(await isSuperAdmin())) return { ok: false, error: 'Ação exclusiva do super-administrador global.' }
  if (!tenantId || !Array.isArray(itens) || !itens.length) return { ok: false, error: 'Nada selecionado.' }
  const svc = createAdminClient()
  const { data: t } = await svc.from('simulado_tenants').select('id').eq('id', tenantId).maybeSingle()
  if (!t) return { ok: false, error: 'Plataforma não encontrada.' }

  let criadas = 0
  let jaExistiam = 0
  const nomes: string[] = []
  for (const it of itens.slice(0, 200)) {
    const nome = String(it.nome ?? '').replace(/\s+/g, ' ').trim()
    if (nome.length < 2) continue
    // existe (nome igual / alias / mesma matéria)? então NÃO cria — nunca gera a duplicada
    if (await resolverTaxonomiaPorNome(svc, 'simulado_disciplinas', tenantId, nome, { criar: false })) { jaExistiam++; continue }
    const row: Record<string, unknown> = { tenant_id: tenantId, nome }
    if (herdar) {
      if (it.classificacao && CLASS_OK.includes(it.classificacao)) row.classificacao = it.classificacao
      if (it.cor && /^#[0-9a-fA-F]{6}$/.test(it.cor)) row.cor = it.cor
      if (typeof it.ordem === 'number' && Number.isFinite(it.ordem)) row.ordem = it.ordem
    }
    const { error } = await svc.from('simulado_disciplinas').insert(row)
    if (error) {
      if (/duplicate|unique|23505/i.test(error.message)) { jaExistiam++; continue } // trava do banco: já existe
      return { ok: false, error: error.message, criadas, jaExistiam }
    }
    criadas++
    nomes.push(nome)
  }
  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_disciplinas', entidadeId: tenantId, tenantId, depois: { adicionadas: nomes, origem: 'console_copiar_de_outras_plataformas', herdou: herdar } }).catch(() => {})
  revalidatePath(`/super/plataformas/${tenantId}`)
  return { ok: true, criadas, jaExistiam }
}
