'use server'

// Metas por pasta (Cronograma › Adaptativo › Conteúdo): GRAVAÇÃO da config de cronograma (disciplina/classe/tipo de material)
// com confirmação de impacto, auditoria e invalidação de cache. A LEITURA vive em lib/admin/metas-pasta-servidor.ts e é
// servida por rotas GET (app/api/admin/revisao/cronograma/metas-pasta/*): server actions rodam serializadas por cliente.
// Só `async function` exportada (regra 'use server'); tipos vêm de lib/admin/metas-pasta-tipos.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { registrarAudit } from '@/lib/audit'
import { resolverTaxonomiaPorNome } from '@/lib/taxonomia/resolver-nome'
import { descendentes } from '@/lib/admin/metas-pasta-heranca'
import { guardCronograma, lerPastas, planosPorPasta, slugsDoCatalogo, listarNosMetasPasta, listarDocsDaPasta } from '@/lib/admin/metas-pasta-servidor'
import type { DocMetaPasta, NoMetaPasta, ResultadoSalvarConfigPasta, SalvarConfigPastaInput } from '@/lib/admin/metas-pasta-tipos'

const ROTA = '/admin/revisao/cronograma'
const CLASSES = ['essencial', 'complementar', 'especifica']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SLUG_FORMATO = /^[a-z0-9][a-z0-9_-]{1,39}$/

const guard = guardCronograma
const colunaAusente = (m?: string) => /column .* does not exist|cronograma_tipo_material|schema cache/i.test(m ?? '')

/** Compat: a UI usa as rotas GET; estas actions só delegam ao mesmo módulo de leitura. */
export async function carregarMetasPasta(): Promise<{ ok: boolean; error?: string; nos?: NoMetaPasta[] }> {
  const g = await guard('cronogramas:view'); if (!g) return { ok: false, error: 'Sem permissão.' }
  try { return { ok: true, nos: await listarNosMetasPasta(g.tenantId) } }
  catch (e) { return { ok: false, error: (e as Error)?.message || 'Falha ao carregar as pastas.' } }
}

export async function carregarDocsDaPasta(
  pastaId: string, opts?: { page?: number; q?: string; sub?: boolean },
): Promise<{ ok: boolean; error?: string; docs?: DocMetaPasta[]; total?: number }> {
  const g = await guard('cronogramas:view'); if (!g) return { ok: false, error: 'Sem permissão.' }
  if (!UUID.test(pastaId ?? '')) return { ok: false, error: 'Pasta inválida.' }
  try { return await listarDocsDaPasta(g.tenantId, pastaId, opts ?? {}) }
  catch (e) { return { ok: false, error: (e as Error)?.message || 'Falha ao carregar os documentos.' } }
}

/** Invalida tudo que lê disciplina/tipo por pasta: cfg do cronograma (30 s), índice da Biblioteca (5 min) e conteúdo por meta. */
async function invalidarCronograma(tenantId: string) {
  const { esquecer, esquecerPrefixo } = await import('@/lib/cache/relatorio-cache')
  await Promise.all([
    esquecer(`crono-metas:discsem:${tenantId}`), esquecer(`revisao-cron:aulas2:${tenantId}`),
    esquecer(`crono-rev:bib:${tenantId}`), esquecerPrefixo(tenantId, 'crono-rev:conteudo:'), esquecer(`crono-tipos:uso:${tenantId}`),
  ].map((p) => p.catch(() => {})))
  revalidatePath(ROTA); revalidatePath('/admin/biblioteca'); revalidatePath('/admin/cronogramas/adaptativo/metas')
}

export async function salvarConfigPasta(input: SalvarConfigPastaInput): Promise<ResultadoSalvarConfigPasta> {
  const g = await guard('cronogramas:update'); if (!g) return { ok: false, error: 'Sem permissão.' }
  const pastaId = input?.pastaId
  if (!UUID.test(pastaId ?? '')) return { ok: false, error: 'Pasta ausente.' }
  if (input.disciplina && !CLASSES.includes(input.disciplina.classe)) return { ok: false, error: 'Classe inválida.' }
  if (input.tipoMaterial != null && !SLUG_FORMATO.test(input.tipoMaterial)) return { ok: false, error: 'Tipo de material inválido.' }
  if (input.disciplina === undefined && input.tipoMaterial === undefined) return { ok: false, error: 'Nada a alterar.' }
  try {
    const svc = createAdminClient()
    if (input.tipoMaterial != null && !(await slugsDoCatalogo(svc, g.tenantId)).has(input.tipoMaterial)) return { ok: false, error: 'Tipo de material inválido.' }
    const pastas = await lerPastas(svc, g.tenantId)
    const pasta = pastas.find((p) => p.id === pastaId)
    if (!pasta) return { ok: false, error: 'Pasta inválida.' }

    // Impacto: planos ativos que usam documentos da subárvore.
    const planos = (await planosPorPasta(svc, g.tenantId, pastas)).get(pastaId) ?? 0
    if (planos > 0 && !input.confirmarImpacto) {
      return { ok: false, precisaConfirmar: true, planosAtivos: planos,
        error: `${planos} plano(s) ativo(s) de alunos usam documentos desta pasta. Confirme para aplicar; valem nas próximas gerações/recálculos.` }
    }

    const antes: Record<string, unknown> = { disciplina_id: pasta.disciplina_id, cronograma_tipo_material: pasta.cronograma_tipo_material }
    const depois: Record<string, unknown> = {}
    let pastasAlteradas = 0

    // 1) Disciplina/classe (mesma regra de definirPastaDisciplinaCronograma / removerPastaDisciplinaCronograma).
    if (input.disciplina !== undefined) {
      if (input.disciplina === null) {
        const { error } = await svc.from('simulado_pastas').update({ disciplina_id: null }).eq('tenant_id', g.tenantId).eq('id', pastaId)
        if (error) return { ok: false, error: error.message }
        depois.disciplina_id = null
      } else {
        let discId = pasta.disciplina_id
        if (!discId) {
          discId = await resolverTaxonomiaPorNome(svc, 'simulado_disciplinas', g.tenantId, String(pasta.nome || '').trim() || 'Disciplina')
          if (!discId) return { ok: false, error: 'Falha ao criar disciplina.' }
        }
        const { error: eC } = await svc.from('simulado_disciplinas').update({ classificacao: input.disciplina.classe }).eq('tenant_id', g.tenantId).eq('id', discId)
        if (eC) return { ok: false, error: eC.message }
        const { error } = await svc.from('simulado_pastas').update({ disciplina_id: discId }).eq('tenant_id', g.tenantId).eq('id', pastaId)
        if (error) return { ok: false, error: error.message }
        depois.disciplina_id = discId; depois.classificacao = input.disciplina.classe
      }
    }

    // 2) Tipo de material: a pasta e (opcional) todas as descendentes que não sejam disciplina, em lotes de 80.
    if (input.tipoMaterial !== undefined) {
      const valor = input.tipoMaterial ?? null
      const alvo = [pastaId]
      if (input.aplicarSubpastas) {
        const desc = new Set(descendentes(pastas.map((p) => ({ id: p.id, paiId: p.pai_id })), pastaId))
        for (const p of pastas) if (desc.has(p.id) && !p.disciplina_id) alvo.push(p.id)
      }
      for (let i = 0; i < alvo.length; i += 80) {
        const { error } = await svc.from('simulado_pastas').update({ cronograma_tipo_material: valor })
          .eq('tenant_id', g.tenantId).in('id', alvo.slice(i, i + 80))
        if (error) return { ok: false, error: colunaAusente(error.message) ? 'Rode a migração do cronograma por pasta (coluna cronograma_tipo_material).' : error.message }
      }
      pastasAlteradas = alvo.length
      depois.cronograma_tipo_material = valor
      if (alvo.length > 1) depois.subpastas_alteradas = alvo.length - 1
    }

    await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_pastas', entidadeId: pastaId, tenantId: g.tenantId, atorId: g.userId,
      antes, depois: { ...depois, confirmouImpacto: planos > 0, planosAtivos: planos } }).catch(() => {})
    await invalidarCronograma(g.tenantId)
    return { ok: true, planosAtivos: planos, pastasAlteradas }
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || 'Falha ao salvar.' }
  }
}
