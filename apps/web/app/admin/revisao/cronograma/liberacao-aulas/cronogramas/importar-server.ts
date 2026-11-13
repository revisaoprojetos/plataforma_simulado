import { registrarAudit } from '@/lib/audit'
import { fetchAll } from '@/lib/supabase/fetch-all'
import {
  lerPlanilhaTrilhas, planejarImportacaoTrilhas, OFFSET_NOVA_TRILHA,
  type AulaExistente, type CelulaExistente, type LeituraTrilhas, type PlanoImportacao, type TrilhaExistente,
} from '@/lib/produtos/liberacao-trilhas-import'
import { semTabela } from '../dados'
import { lerTodasCelulas } from '../dados-trilhas'
import { logarLiberacao, type GuardTrilhas as G } from '../guard-trilhas'
import { AVISO_MIGRACAO, CORES_TRILHA, type PreviaImportTrilhas, type PreviaLinhaImport } from '../tipos-trilhas'

// Núcleo SERVER da importação da 2ª aba (usado pela rota de API; arquivo SEM 'use server'). Lê o .xlsx, casa com as aulas
// já importadas pela 1ª aba (Nº = ordem) e monta a PRÉVIA. Só ao confirmar grava: upsert por (trilha, aula), sem tocar data_manual.

export interface Preparada { leitura: LeituraTrilhas; plano: PlanoImportacao }

export async function prepararTrilhas(g: G, produtoId: string, arquivo: ArrayBuffer, descontoDias: number): Promise<{ ok: true; p: Preparada } | { ok: false; error: string }> {
  const leitura = await lerPlanilhaTrilhas(arquivo)
  if (!leitura.linhas.length) return { ok: false, error: leitura.invalidas[0]?.motivo ?? 'A planilha não tem linhas válidas.' }
  const { data: ts, error: eT } = await g.svc.from('simulado_liberacao_trilhas').select('id, nome, offset_dias, inicio_cronograma').eq('tenant_id', g.tenantId).eq('produto_id', produtoId)
  if (semTabela(eT)) return { ok: false, error: AVISO_MIGRACAO }
  const trilhas: TrilhaExistente[] = ((ts ?? []) as any[]).map((t) => ({ id: t.id, nome: t.nome, offsetDias: t.offset_dias, inicio: t.inicio_cronograma ?? null }))
  const aulas = await fetchAll<AulaExistente>(() => g.svc.from('simulado_produto_liberacao_aulas').select('id, ordem, disciplina, titulo').eq('tenant_id', g.tenantId).eq('produto_id', produtoId).order('id', { ascending: true }) as any)
  if (!aulas.length) return { ok: false, error: 'Importe antes a 1ª aba (aba “Aulas (data-base)”): ela cria as aulas às quais as datas dos cronogramas se ligam.' }
  const cels = (await lerTodasCelulas(g.svc, g.tenantId, trilhas.map((t) => t.id))).map((c): CelulaExistente => ({ trilhaId: c.trilha_id, aulaId: c.liberacao_aula_id, dataCronograma: c.data_cronograma, dataManual: c.data_manual }))
  return { ok: true, p: { leitura, plano: planejarImportacaoTrilhas({ leitura, descontoDias, aulas, trilhas, celulas: cels }) } }
}

export function previaDoPlano(p: Preparada): PreviaImportTrilhas {
  const { leitura, plano } = p
  const mapLinha = (l: (typeof plano.linhas)[number]): PreviaLinhaImport => ({
    ordem: l.linha.ordem ?? 0, disciplina: l.linha.disciplina, titulo: l.linha.titulo, casou: l.casou, aulaTitulo: l.aulaTitulo, datas: { ...l.linha.datas },
  })
  const r = plano.resumo
  return {
    abaLida: leitura.aba, linhasLidas: r.linhasLidas, linhasCasadas: r.linhasCasadas, linhasSemAula: r.linhasSemAula,
    celulasComData: r.celulasComData, celulasVazias: r.celulasVazias, celulasNovas: r.novas, celulasAlteradas: r.alteradas, celulasIguais: r.iguais, manuaisPreservadas: r.manuaisPreservadas,
    trilhas: plano.trilhas.map((t) => ({ nome: t.nome, existente: !!t.existenteId, inicio: t.inicio, offsetDias: t.offsetDias, celulasComData: t.celulasComData })),
    invalidas: leitura.invalidas.slice(0, 50),
    semAula: plano.linhas.filter((l) => !l.aulaId).slice(0, 100).map(mapLinha),
    amostra: plano.linhas.filter((l) => l.aulaId).slice(0, 30).map(mapLinha),
    descontoDias: plano.descontoDias,
  }
}

export async function gravarTrilhas(g: G, produtoId: string, p: Preparada, nomeArquivo: string): Promise<{ ok: true; trilhasCriadas: number; celulas: number } | { ok: false; error: string }> {
  const { plano } = p
  const agora = new Date().toISOString()
  const { data: ult } = await g.svc.from('simulado_liberacao_trilhas').select('ordem').eq('tenant_id', g.tenantId).eq('produto_id', produtoId).order('ordem', { ascending: false }).limit(1)
  let ordem = ((ult ?? []) as any[])[0]?.ordem ?? 0
  const ids = new Map<string, string>()
  let criadas = 0
  for (const [i, t] of plano.trilhas.entries()) {
    if (t.existenteId) { ids.set(t.nome, t.existenteId); continue }
    ordem++
    const { data, error } = await g.svc.from('simulado_liberacao_trilhas').insert({
      tenant_id: g.tenantId, produto_id: produtoId, nome: t.nome, ordem, inicio_cronograma: t.inicio, offset_dias: OFFSET_NOVA_TRILHA, cor: CORES_TRILHA[i % CORES_TRILHA.length], ativo: true, criado_por: g.atorId,
    }).select('id').single()
    if (error || !data) return { ok: false, error: semTabela(error) ? AVISO_MIGRACAO : `Não foi possível criar a trilha “${t.nome}”: ${error?.message ?? 'erro'}` }
    ids.set(t.nome, (data as any).id); criadas++
  }
  const upserts = plano.celulas.filter((c) => c.situacao === 'nova' || c.situacao === 'alterada').map((c) => ({
    tenant_id: g.tenantId, trilha_id: ids.get(c.trilhaNome)!, liberacao_aula_id: c.aulaId, data_cronograma: c.dataCronograma, atualizado_por: g.atorId, atualizado_em: agora,
  }))
  for (let i = 0; i < upserts.length; i += 200) {
    const { error } = await g.svc.from('simulado_liberacao_trilha_aulas').upsert(upserts.slice(i, i + 200), { onConflict: 'trilha_id,liberacao_aula_id' })
    if (error) return { ok: false, error: `Não foi possível gravar as datas: ${error.message}` }
  }
  // células que ficaram vazias na planilha: tira a data do cronograma (a data manual, se houver, é preservada)
  const removidas = plano.celulas.filter((c) => c.situacao === 'removida')
  for (const c of removidas) {
    await g.svc.from('simulado_liberacao_trilha_aulas').update({ data_cronograma: null, atualizado_em: agora }).eq('tenant_id', g.tenantId).eq('trilha_id', ids.get(c.trilhaNome)!).eq('liberacao_aula_id', c.aulaId)
  }
  const r = plano.resumo
  const detalhe = { arquivo: nomeArquivo, aba: p.leitura.aba, desconto_dias: plano.descontoDias, trilhas_criadas: criadas, linhas_casadas: r.linhasCasadas, linhas_sem_aula: r.linhasSemAula, novas: r.novas, alteradas: r.alteradas, iguais: r.iguais, removidas: removidas.length, manuais_preservadas: r.manuaisPreservadas }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_liberacao_trilha_aulas', entidadeId: produtoId, depois: { importacao: true, ...detalhe }, atorId: g.atorId, tenantId: g.tenantId })
  await logarLiberacao(g, produtoId, { origem: 'importacao', acao: 'importacao_cronogramas', alvoTipo: 'produto', alvoId: produtoId, detalhe })
  return { ok: true, trilhasCriadas: criadas, celulas: upserts.length + removidas.length }
}
