'use server'

// Catálogo de tipos de conteúdo (Cronograma › Adaptativo › Conteúdo): CRUD por tenant com confirmação de impacto,
// concorrência otimista (`versao`), auditoria e invalidação de cache. Só `async function` exportada (regra 'use server');
// tipos vêm de lib/cronograma/tipos-conteudo-tipos.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { checkPermission, getCurrentAccess } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { validarTipo, type LinhaTipoConteudo } from '@/lib/cronograma/tipos-conteudo'
import { SLUG_RE, SLUGS_SISTEMA, TIPOS_SISTEMA, type PapelTipo, type ResultadoTipoConteudo, type TipoConteudo, type UsoTipoConteudo } from '@/lib/cronograma/tipos-conteudo-tipos'
import { esquecerCatalogoTipos, lerLinhasTipos, listarCatalogoTipos, tabelaTiposAusente, usoDosTipos } from '@/lib/cronograma/tipos-conteudo-server'

const ROTA = '/admin/revisao/cronograma'
const T = 'simulado_conteudo_tipos'

async function guard(perm: 'cronogramas:view' | 'cronogramas:update') {
  if (!(await checkPermission(perm))) return null
  const a = await getCurrentAccess()
  if (!a.tenantId) return null
  return { tenantId: a.tenantId, userId: a.userId ?? null }
}

async function invalidar(tenantId: string) {
  const { esquecer, esquecerPrefixo } = await import('@/lib/cache/relatorio-cache')
  await Promise.all([
    esquecerCatalogoTipos(tenantId),
    esquecer(`crono-metas:discsem:${tenantId}`), esquecer(`revisao-cron:aulas2:${tenantId}`),
    esquecer(`crono-rev:bib:${tenantId}`), esquecerPrefixo(tenantId, 'crono-rev:conteudo:'),
  ].map((p) => p.catch(() => {})))
  revalidatePath(ROTA); revalidatePath('/admin/biblioteca'); revalidatePath('/admin/cronogramas/adaptativo/metas')
}

const msgTabela = 'Rode a migração 20261202000000_conteudo_tipos (tabela simulado_conteudo_tipos).'
const erroDb = (e: { message?: string; code?: string }) => /gera_meta/i.test(e.message ?? '') ? 'Rode a migração 20261126010000_cronograma_adaptativo_tipo_gx (coluna gera_meta).' : tabelaTiposAusente(e) ? msgTabela : (e.code === '23505' ? 'Já existe um tipo com esse identificador.' : (e.message || 'Falha ao gravar.'))

function doBanco(l: LinhaTipoConteudo): Record<string, unknown> { return { ...l } }

/** Campos editáveis (camelCase) → colunas, só os presentes no patch. */
function colunas(p: Record<string, unknown>, incluirPapel: boolean): Record<string, unknown> {
  const c: Record<string, unknown> = {}
  if (p.nome !== undefined) c.nome = String(p.nome).trim()
  if (p.nomeAluno !== undefined) c.nome_aluno = typeof p.nomeAluno === 'string' && p.nomeAluno.trim() ? p.nomeAluno.trim() : null
  if (p.cor !== undefined) c.cor = typeof p.cor === 'string' && p.cor.trim() ? p.cor.trim().slice(0, 40) : null
  if (p.duracaoPadraoMin !== undefined) c.duracao_padrao_min = p.duracaoPadraoMin
  if (p.prioridade !== undefined) c.prioridade = p.prioridade
  if (p.ordem !== undefined) c.ordem = p.ordem
  if (p.ativo !== undefined) c.ativo = !!p.ativo
  if (p.descricao !== undefined) c.descricao = typeof p.descricao === 'string' && p.descricao.trim() ? p.descricao.trim() : null
  if (incluirPapel && p.papel !== undefined) c.papel = p.papel
  if (incluirPapel && p.geraMeta !== undefined) { if (p.geraMeta === true) c.gera_meta = true } // false só no salvar (quando difere do atual): não exige a coluna
  return c
}

export async function listarTiposConteudo(): Promise<{ ok: boolean; error?: string; tipos?: TipoConteudo[]; usos?: UsoTipoConteudo[] }> {
  const g = await guard('cronogramas:view'); if (!g) return { ok: false, error: 'Sem permissão.' }
  try {
    const svc = createAdminClient()
    const [tipos, usos] = await Promise.all([listarCatalogoTipos(svc, g.tenantId), usoDosTipos(svc, g.tenantId).catch(() => [] as UsoTipoConteudo[])])
    return { ok: true, tipos, usos }
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || 'Falha ao carregar os tipos.' }
  }
}

export async function criarTipoConteudo(input: {
  slug: string; nome: string; nomeAluno?: string | null; cor?: string | null; papel: PapelTipo
  duracaoPadraoMin?: number | null; prioridade?: number; ordem?: number; descricao?: string | null; geraMeta?: boolean
}): Promise<ResultadoTipoConteudo> {
  const g = await guard('cronogramas:update'); if (!g) return { ok: false, error: 'Sem permissão.' }
  const v = validarTipo(input ?? {}, { criando: true }); if (!v.ok) return { ok: false, error: v.error }
  try {
    const svc = createAdminClient()
    const row = { tenant_id: g.tenantId, slug: input.slug, sistema: false, ativo: true, ...colunas(input as unknown as Record<string, unknown>, true) }
    const { error } = await svc.from(T).insert(row)
    if (error) return { ok: false, error: erroDb(error) }
    await registrarAudit({ operacao: 'INSERT', entidade: T, entidadeId: input.slug, tenantId: g.tenantId, atorId: g.userId, antes: null, depois: row }).catch(() => {})
    await invalidar(g.tenantId)
    const tipo = (await listarCatalogoTipos(svc, g.tenantId)).find((t) => t.slug === input.slug)
    return { ok: true, tipo }
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || 'Falha ao criar o tipo.' }
  }
}

export async function salvarTipoConteudo(
  slug: string,
  patch: {
    nome?: string; nomeAluno?: string | null; cor?: string | null; papel?: PapelTipo; duracaoPadraoMin?: number | null
    prioridade?: number; ordem?: number; ativo?: boolean; descricao?: string | null; geraMeta?: boolean
  },
  opts?: { versaoEsperada?: number; confirmarImpacto?: boolean },
): Promise<ResultadoTipoConteudo> {
  const g = await guard('cronogramas:update'); if (!g) return { ok: false, error: 'Sem permissão.' }
  if (typeof slug !== 'string' || !SLUG_RE.test(slug)) return { ok: false, error: 'Tipo inválido.' }
  const p = (patch ?? {}) as Record<string, unknown>
  const base = TIPOS_SISTEMA.find((t) => t.slug === slug)
  if (base && p.papel !== undefined && p.papel !== base.papel) return { ok: false, error: 'O papel de um tipo do sistema não pode ser alterado.' }
  if (base && p.geraMeta === true) return { ok: false, error: 'Tipos do sistema não geram meta própria.' }
  const v = validarTipo(p, { criando: false }); if (!v.ok) return { ok: false, error: v.error }
  try {
    const svc = createAdminClient()
    const linhas = await lerLinhasTipos(svc, g.tenantId)
    const atual = linhas.find((l) => l.slug === slug)
    if (!base && !atual) return { ok: false, error: 'Tipo não encontrado.' }
    const versaoAtual = atual?.versao ?? 0
    if (opts?.versaoEsperada != null && opts.versaoEsperada !== versaoAtual) {
      return { ok: false, error: 'Este tipo foi alterado por outra pessoa. Recarregue e tente de novo.' }
    }
    const col = colunas(p, !base)
    // geraMeta só para personalizado de papel 'generico'; sair de 'generico' desliga a meta própria.
    const papelFinal = (col.papel as string | undefined) ?? atual?.papel ?? base?.papel
    if (col.gera_meta === true && papelFinal !== 'generico') return { ok: false, error: 'Só tipos de papel "Genérico" podem gerar meta própria.' }
    if (!base && papelFinal !== 'generico' && atual?.gera_meta && col.gera_meta === undefined) col.gera_meta = false
    if (p.geraMeta === false && atual?.gera_meta) col.gera_meta = false
    if (!Object.keys(col).length) return { ok: false, error: 'Nada a alterar.' }

    // Impacto: desativar ou trocar o papel de um tipo em uso.
    const geraAntes = !!atual?.gera_meta
    const geraMuda = col.gera_meta !== undefined && col.gera_meta !== geraAntes
    const muda = (col.ativo === false && (atual?.ativo ?? true)) || (col.papel !== undefined && col.papel !== atual?.papel) || geraMuda || (col.ativo !== undefined && col.ativo !== (atual?.ativo ?? true) && geraAntes)
    let pastasUsando = 0, planos = 0
    if (muda) {
      const uso = (await usoDosTipos(svc, g.tenantId).catch(() => [])).find((u) => u.slug === slug)
      pastasUsando = uso?.pastas ?? 0; planos = uso?.planosAtivos ?? 0
      if ((pastasUsando > 0 || planos > 0) && !opts?.confirmarImpacto) {
        return { ok: false, precisaConfirmar: true, pastasUsando, planosAtivos: planos,
          error: `${pastasUsando} pasta(s) e ${planos} plano(s) ativo(s) usam este tipo. Confirme para aplicar; vale nas próximas gerações/recálculos.${geraMuda ? ' Mudar "gera meta própria" só afeta planos gerados ou regenerados depois; os planos já gerados não mudam.' : ''}` }
      }
    }

    let gravado: Record<string, unknown> | null = null
    if (atual) {
      const { data, error } = await svc.from(T).update({ ...col, versao: versaoAtual + 1 })
        .eq('tenant_id', g.tenantId).eq('slug', slug).eq('versao', versaoAtual).select('*')
      if (error) return { ok: false, error: erroDb(error) }
      if (!data?.length) return { ok: false, error: 'Este tipo foi alterado por outra pessoa. Recarregue e tente de novo.' }
      gravado = data[0] as Record<string, unknown>
    } else {
      // Override de tipo de sistema ainda inexistente: cria a linha (papel fixo do sistema).
      const ins = { tenant_id: g.tenantId, slug, sistema: true, nome: base!.nome, papel: base!.papel, prioridade: base!.prioridade, ordem: base!.ordem, ...col, versao: 1 }
      const { data, error } = await svc.from(T).insert(ins).select('*')
      if (error) return { ok: false, error: erroDb(error) }
      gravado = (data?.[0] ?? ins) as Record<string, unknown>
    }
    await registrarAudit({ operacao: 'UPDATE', entidade: T, entidadeId: slug, tenantId: g.tenantId, atorId: g.userId,
      antes: atual ? doBanco(atual) : null, depois: { ...gravado, confirmouImpacto: muda && (pastasUsando > 0 || planos > 0) } }).catch(() => {})
    await invalidar(g.tenantId)
    const tipo = (await listarCatalogoTipos(svc, g.tenantId)).find((t) => t.slug === slug)
    return { ok: true, tipo, pastasUsando, planosAtivos: planos }
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || 'Falha ao salvar o tipo.' }
  }
}

export async function removerTipoConteudo(slug: string, opts?: { confirmarImpacto?: boolean }): Promise<ResultadoTipoConteudo> {
  const g = await guard('cronogramas:update'); if (!g) return { ok: false, error: 'Sem permissão.' }
  if (typeof slug !== 'string' || !SLUG_RE.test(slug)) return { ok: false, error: 'Tipo inválido.' }
  if (SLUGS_SISTEMA.includes(slug)) return { ok: false, error: 'Tipos do sistema não podem ser removidos (apenas desativados).' }
  try {
    const svc = createAdminClient()
    const atual = (await lerLinhasTipos(svc, g.tenantId)).find((l) => l.slug === slug)
    if (!atual || atual.sistema) return { ok: false, error: 'Tipo não encontrado.' }
    const uso = (await usoDosTipos(svc, g.tenantId).catch(() => [])).find((u) => u.slug === slug)
    const pastasUsando = uso?.pastas ?? 0, planos = uso?.planosAtivos ?? 0
    if (pastasUsando > 0 && !opts?.confirmarImpacto) {
      return { ok: false, precisaConfirmar: true, pastasUsando, planosAtivos: planos,
        error: `${pastasUsando} pasta(s) usam este tipo e voltarão a "sem tipo" (herdam da pasta acima). Nenhum documento é apagado. Confirme para remover.` }
    }
    // Solta as pastas que usavam o slug (volta a null = herda), em lotes de 80.
    if (pastasUsando > 0) {
      const ids = (await fetchAll<{ id: string }>(() => svc.from('simulado_pastas').select('id')
        .eq('tenant_id', g.tenantId).eq('cronograma_tipo_material', slug).order('id') as never)).map((r) => r.id)
      for (let i = 0; i < ids.length; i += 80) {
        const { error } = await svc.from('simulado_pastas').update({ cronograma_tipo_material: null }).eq('tenant_id', g.tenantId).in('id', ids.slice(i, i + 80))
        if (error) return { ok: false, error: error.message }
      }
    }
    const { error } = await svc.from(T).delete().eq('tenant_id', g.tenantId).eq('slug', slug).eq('sistema', false)
    if (error) return { ok: false, error: erroDb(error) }
    await registrarAudit({ operacao: 'DELETE', entidade: T, entidadeId: slug, tenantId: g.tenantId, atorId: g.userId,
      antes: doBanco(atual), depois: { pastasLiberadas: pastasUsando, planosAtivos: planos, confirmouImpacto: pastasUsando > 0 } }).catch(() => {})
    await invalidar(g.tenantId)
    return { ok: true, pastasUsando, planosAtivos: planos }
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || 'Falha ao remover o tipo.' }
  }
}
