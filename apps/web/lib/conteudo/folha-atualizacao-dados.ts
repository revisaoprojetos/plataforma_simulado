import type { SupabaseClient } from '@supabase/supabase-js'
import { NOME_TIPO_ATUALIZACAO, type TipoAtualizacao } from '@/lib/admin-revisao/biblioteca-tipos'
import { comFallbackFlags, montarTagAtualizacao, normalizarItens } from './atualizacoes-tipos'
import type { DadosFolhaAtualizacao } from './folha-atualizacao'

const T = 'simulado_conteudo_atualizacoes'
const COLS = 'id, tipo, rotulo, texto, itens, ocorrida_em, criado_em'

/**
 * Dados da FOLHA DE ATUALIZAÇÃO = a ÚLTIMA atualização PUBLICADA do documento (por data da ocorrência), com as mesmas
 * regras de exibição que o aluno vê (data/hora/rótulo ocultos não saem). `soVisivelAluno` (aluno) exige também `visivel_aluno`.
 * Sem registro / sem tabela → null (o download sai sem a folha, com aviso). Nunca lança.
 */
export async function dadosFolhaDoDocumento(
  svc: SupabaseClient, tenantId: string, documentoId: string, titulo: string, o: { soVisivelAluno: boolean },
): Promise<DadosFolhaAtualizacao | null> {
  try {
    const { data, error } = await comFallbackFlags((f) => {
      let q = svc.from(T).select(f ? `${COLS}, exibir_data, exibir_hora, exibir_rotulo` : COLS)
        .eq('tenant_id', tenantId).eq('documento_id', documentoId).eq('deletado', false).eq('status', 'publicado')
      if (o.soVisivelAluno) q = q.eq('visivel_aluno', true)
      return q.order('ocorrida_em', { ascending: false, nullsFirst: false }).order('id', { ascending: true }).limit(1)
    })
    if (error) return null
    const r = ((data ?? []) as any[])[0]
    if (!r) return null
    const t = montarTagAtualizacao({ ocorridaEm: r.ocorrida_em ?? r.criado_em, exibirData: r.exibir_data !== false, exibirHora: r.exibir_hora !== false, exibirRotulo: r.exibir_rotulo !== false, rotulo: r.rotulo })
    const nomeTipo = NOME_TIPO_ATUALIZACAO[r.tipo as TipoAtualizacao] ?? null
    return {
      material: titulo, tag: t.tag, rotulo: t.rotulo, tipoNome: nomeTipo, texto: String(r.texto ?? ''),
      itens: normalizarItens(r.itens).map((i) => ({ texto: i.texto, local: i.local ?? null, tipoNome: i.tipo ? NOME_TIPO_ATUALIZACAO[i.tipo] ?? null : null })),
    }
  } catch { return null }
}
