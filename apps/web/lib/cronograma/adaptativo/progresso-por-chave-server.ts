import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ConteudoBanco } from './conteudo-banco'
import type { PlanoRow, MetaRow } from './dados'
import { chavesAtuais } from './remap-as-server'
import { assinaturaDoCfg, hashAS } from './remap-as'
import { corrigirProgressoPorChave } from './progresso-por-chave'
import { registrarGeracao } from './log-geracao'

// Camada SERVER da cura "progresso preso ao documento" (regra e testes: progresso-por-chave.ts).
// Chamada em carregarDocs logo após garantirAS. Idempotente e conservadora:
//  · só age quando o plano está alinhado ao AS atual (sigAS == hash do AS atual) e há linhas com aula_key fora da posição da sua chave;
//  · lock otimista no plano (atualizado_em); destinos gravados por UPSERT (preserva concluido_em/tempo/notas, que viajam na própria linha)
//    e só depois apaga os ids sem dono — nunca "apaga e recria"; falha → desfaz;
//  · rastreio em simulado_audit_logs (RECORRIGIR) com estudante, plano e antes×depois.

const T_PLANO = 'simulado_cronograma_adaptativo_plano'
const T_META = 'simulado_cronograma_adaptativo_meta'

export interface ResCura { aplicou: boolean; metas: MetaRow[]; atualizadoEm?: string; movidas: number }

export async function curarProgressoPorChave(
  svc: SupabaseClient, tenantId: string, row: PlanoRow, metas: MetaRow[], pre?: ConteudoBanco | Promise<ConteudoBanco> | null,
): Promise<ResCura> {
  const nada: ResCura = { aplicou: false, metas, movidas: 0 }
  const guardada = assinaturaDoCfg(row.cfg as unknown as Record<string, unknown>)
  if (!guardada) return nada
  const atual = await chavesAtuais(svc, tenantId, pre)
  if (atual.vazio || !atual.chaves.length) return nada
  // o plano precisa estar no MESMO referencial do AS atual (senão é caso do remap por assinatura, não desta cura)
  if ((row.cfg as unknown as { sigAS?: string }).sigAS !== hashAS(atual.chaves, atual.discs)) return nada

  const { correcoes, ignoradas } = corrigirProgressoPorChave(metas, atual.chaves)
  if (!correcoes.length) return nada
  // queda de segurança: mexer em mais da metade das linhas de uma vez indica AS suspeito, não deslocamento real
  if (metas.length >= 20 && correcoes.length > metas.length * 0.5) {
    registrarGeracao(svc, { tenantId, estudanteId: row.estudante_id ?? '', planoId: row.id, acao: 'remap_as', origem: 'migracao', ok: false, erro: `progresso_por_chave_recusado: ${correcoes.length}/${metas.length} linhas`, nMetas: 0 })
    return nada
  }

  const agora = new Date().toISOString()
  // lock otimista: só quem ainda vê o mesmo atualizado_em consegue seguir
  const q = svc.from(T_PLANO).update({ atualizado_em: agora }).eq('id', row.id)
  const { data: lock, error: eLock } = await (row.atualizado_em ? q.eq('atualizado_em', row.atualizado_em) : q).select('id')
  if (eLock || !lock?.length) return nada

  const porId = new Map(metas.map((m) => [m.meta_id, m]))
  const origem = correcoes.map((c) => porId.get(c.de)!).filter(Boolean)
  const novas = correcoes.filter((c) => porId.get(c.de)).map((c) => ({ ...porId.get(c.de)!, tenant_id: tenantId, estudante_id: row.estudante_id, plano_id: row.id, meta_id: c.para }))
  const destinos = new Set(correcoes.map((c) => c.para))
  const sobraram = correcoes.map((c) => c.de).filter((id) => !destinos.has(id))
  const antigas = origem.map((m) => ({ ...m, tenant_id: tenantId, estudante_id: row.estudante_id, plano_id: row.id }))

  const gravar = async (rows: Array<Record<string, unknown>>): Promise<string | null> => {
    for (let k = 0; k < rows.length; k += 400) {
      const { error } = await svc.from(T_META).upsert(rows.slice(k, k + 400), { onConflict: 'plano_id,meta_id' })
      if (error) return error.message
    }
    return null
  }
  const apagar = async (ids: string[]): Promise<string | null> => {
    for (let k = 0; k < ids.length; k += 80) {
      const { error } = await svc.from(T_META).delete().eq('tenant_id', tenantId).eq('plano_id', row.id).in('meta_id', ids.slice(k, k + 80))
      if (error) return error.message
    }
    return null
  }
  let erro = await gravar(novas)
  if (!erro) erro = await apagar(sobraram)
  if (erro) {
    await gravar(antigas)
    await apagar([...destinos].filter((id) => !porId.has(id)))
    registrarGeracao(svc, { tenantId, estudanteId: row.estudante_id ?? '', planoId: row.id, acao: 'remap_as', origem: 'migracao', ok: false, erro: `progresso_por_chave_falhou: ${erro}`.slice(0, 500), nMetas: 0 })
    return nada
  }

  const resumo = `progresso_por_chave: ${correcoes.length} linha(s) acompanharam o documento (${correcoes.slice(0, 6).map((c) => `${c.de}->${c.para}`).join(', ')})`
  registrarGeracao(svc, { tenantId, estudanteId: row.estudante_id ?? '', planoId: row.id, acao: 'remap_as', origem: 'migracao', ok: true, erro: resumo.slice(0, 500), nMetas: correcoes.length })
  try {
    await svc.from('simulado_audit_logs').insert({
      tenant_id: tenantId, ator_tipo: 'sistema', tabela: T_META, entidade: T_PLANO, entidade_id: row.id, operacao: 'RECORRIGIR',
      dados_anteriores: { estudante_id: row.estudante_id ?? null, plano_id: row.id, motivo: 'progresso fora da posicao do documento (aula_key)', linhas: correcoes.map((c) => ({ meta_id: c.de, chave: c.chave, estado: porId.get(c.de)?.estado ?? null })) },
      dados_novos: { estudante_id: row.estudante_id ?? null, plano_id: row.id, linhas: correcoes.map((c) => ({ meta_id: c.para, chave: c.chave })), ignoradas: ignoradas.slice(0, 50) },
      detalhes: { origem: 'progresso_por_chave', movidas: correcoes.length, ignoradas: ignoradas.length }, criado_em: new Date().toISOString(),
    })
  } catch { /* rastreio best-effort */ }

  const troca = new Map(correcoes.map((c) => [c.de, c.para]))
  const resultado = metas.map((m) => (troca.has(m.meta_id) ? { ...m, meta_id: troca.get(m.meta_id)! } : m))
  return { aplicou: true, metas: resultado, atualizadoEm: agora, movidas: correcoes.length }
}
