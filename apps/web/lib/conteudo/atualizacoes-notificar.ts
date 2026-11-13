import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllByIn } from '@/lib/supabase/fetch-all'
import { criarNotificacoesEmMassa } from '@/lib/notificacoes/criar'
import { NOME_TIPO_ATUALIZACAO, type TipoAtualizacao } from '@/lib/admin-revisao/biblioteca-tipos'
import { montarTagAtualizacao, prefixarTag } from './atualizacoes-tipos'

/** Alunos que "têm" o material: acesso direto + membros de grupos (do doc e das pastas ancestrais) + quem já leu/anotou. */
export async function destinatariosDoMaterial(svc: SupabaseClient, tenantId: string, documentoId: string, pastaId: string | null): Promise<string[]> {
  const est = new Set<string>()
  const grupos = new Set<string>()
  const q = async (fn: () => PromiseLike<{ data: any[] | null }>) => { try { return ((await fn()).data ?? []) as any[] } catch { return [] as any[] } }
  // pasta do doc + ancestrais
  const pastas: string[] = []
  let atual = pastaId
  for (let i = 0; atual && i < 30; i++) {
    pastas.push(atual)
    const r = await q(() => svc.from('simulado_pastas').select('pai_id').eq('tenant_id', tenantId).eq('id', atual!).limit(1))
    atual = r[0]?.pai_id ?? null
  }
  const [dg, de, pg, pe, lp, an] = await Promise.all([
    q(() => svc.from('simulado_conteudo_documento_grupos').select('grupo_id').eq('tenant_id', tenantId).eq('documento_id', documentoId).limit(2000)),
    q(() => svc.from('simulado_conteudo_documento_estudantes').select('estudante_id').eq('tenant_id', tenantId).eq('documento_id', documentoId).limit(5000)),
    pastas.length ? q(() => svc.from('simulado_pasta_grupos').select('grupo_id').eq('tenant_id', tenantId).in('pasta_id', pastas).limit(2000)) : Promise.resolve([]),
    pastas.length ? q(() => svc.from('simulado_pasta_estudantes').select('estudante_id').eq('tenant_id', tenantId).in('pasta_id', pastas).limit(5000)) : Promise.resolve([]),
    q(() => svc.from('simulado_conteudo_leitura_progresso').select('aluno_id').eq('tenant_id', tenantId).eq('documento_id', documentoId).limit(5000)),
    q(() => svc.from('simulado_conteudo_anotacoes').select('aluno_id').eq('tenant_id', tenantId).eq('documento_id', documentoId).limit(5000)),
  ])
  for (const r of [...de, ...pe]) if (r.estudante_id) est.add(r.estudante_id)
  for (const r of [...lp, ...an]) if (r.aluno_id) est.add(r.aluno_id)
  for (const r of [...dg, ...pg]) if (r.grupo_id) grupos.add(r.grupo_id)
  if (grupos.size) {
    try {
      const m = await fetchAllByIn<any>([...grupos], (c) => svc.from('simulado_grupo_membros').select('estudante_id').in('grupo_id', c).order('estudante_id', { ascending: true }))
      for (const r of m) if (r.estudante_id) est.add(r.estudante_id)
    } catch { /* sem membros */ }
  }
  return [...est].slice(0, 20000)
}

/** Aviso in-app (sino do aluno) + "Novidades do Início" de um ponto de versão PUBLICADO. Best-effort, nunca lança. */
export async function notificarPontoDeVersao(
  svc: SupabaseClient, tenantId: string,
  o: { documentoId: string; pastaId: string | null; titulo: string; tipo: TipoAtualizacao; rotulo: string | null; resumo: string; primeiroItem: string | null; avisarAlunos: boolean; mostrarInicio: boolean; ocorridaEm?: string | null; exibirData?: boolean; exibirHora?: boolean; exibirRotulo?: boolean },
): Promise<number> {
  let avisados = 0
  const detalhe = (o.resumo || o.primeiroItem || '').slice(0, 200)
  const nomeTipo = NOME_TIPO_ATUALIZACAO[o.tipo]
  // Mesma regra de exibição do aluno (helper compartilhado): "10/11/2026: texto"; sem tag -> "Tipo: texto" (ou só o texto se o rótulo está oculto).
  const t = montarTagAtualizacao({ ocorridaEm: o.ocorridaEm, exibirData: o.exibirData, exibirHora: o.exibirHora, exibirRotulo: o.exibirRotulo, rotulo: o.rotulo })
  const msg = o.ocorridaEm && t.tag ? prefixarTag(t.tag, detalhe) : o.exibirRotulo === false ? detalhe : `${nomeTipo}: ${detalhe}`
  const sufixo = t.rotulo ? ` (${t.rotulo})` : ''
  const link = `/aluno/nova/painel/leitor/${o.documentoId}`
  try {
    if (o.avisarAlunos) {
      const dest = await destinatariosDoMaterial(svc, tenantId, o.documentoId, o.pastaId)
      avisados = await criarNotificacoesEmMassa(svc, tenantId, dest, {
        tipo: 'material_atualizado', titulo: `Material atualizado: ${o.titulo}${sufixo}`,
        mensagem: msg, link,
      })
    }
    if (o.mostrarInicio) {
      await svc.from('simulado_novidades').insert({
        tenant_id: tenantId, categoria: 'materiais', titulo: `Material atualizado: ${o.titulo}${sufixo}`,
        descricao: msg.slice(0, 400), destaque: false, ativo: true,
        cta_label: 'Abrir o material', cta_url: link, publicado_em: new Date().toISOString(),
      })
    }
  } catch { /* best-effort */ }
  return avisados
}
