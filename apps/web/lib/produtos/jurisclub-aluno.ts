import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { remember } from '@/lib/cache/relatorio-cache'
import { produtosDoAluno } from './aluno'
import { curriculoDoAluno, type AulaAluno, type ModuloAluno } from './curriculo-aluno'

/**
 * Materiais do JurisClub entregues POR PRODUTO: aulas do currículo (subtipo 'jurisclub') dos produtos a que o
 * aluno tem acesso. A regra de liberação (disponibilidade, segmentos, cadeado) vem do próprio currículo do aluno.
 *
 * Backend-first: (1) triagem barata por TENANT — se nenhum produto tem item JurisClub, devolve [] sem resolver
 * produtos nem currículo (caso comum); (2) só então resolve os produtos do aluno que estão na triagem e monta o
 * currículo só desses; (3) resultado em cache curto por aluno (a página só LÊ).
 */
export interface MaterialJurisclub extends AulaAluno { produtoNome: string; modulo: string }

function achatar(mods: ModuloAluno[], produtoNome: string, trilha: string[], out: MaterialJurisclub[]) {
  for (const m of mods) {
    const caminho = [...trilha, m.titulo]
    for (const a of m.aulas) if (a.subtipo === 'jurisclub') out.push({ ...a, produtoNome, modulo: caminho.join(' › ') })
    achatar(m.submodulos, produtoNome, caminho, out)
  }
}

async function calcular(tenantId: string, estudanteId: string, voltar: string): Promise<MaterialJurisclub[]> {
  const svc = createAdminClient()
  // Triagem por tenant: produtos que têm ao menos 1 item JurisClub ativo.
  const { data } = await svc.from('simulado_produto_modulo_itens').select('produto_id')
    .eq('tenant_id', tenantId).eq('subtipo', 'jurisclub').eq('deletado', false).eq('situacao', 'ativo').limit(2000)
  const comJurisclub = new Set(((data ?? []) as any[]).map((r) => r.produto_id as string))
  if (!comJurisclub.size) return []
  const produtos = (await produtosDoAluno(tenantId, estudanteId).catch(() => [])).filter((p) => comJurisclub.has(p.id))
  if (!produtos.length) return []
  const porProduto = await Promise.all(produtos.map(async (p) => {
    const mods = await curriculoDoAluno(svc, tenantId, estudanteId, p.id, voltar).catch(() => [] as ModuloAluno[])
    const out: MaterialJurisclub[] = []
    achatar(mods, p.nome, [], out)
    return out
  }))
  return porProduto.flat()
}

export function materiaisJurisclubDoAluno(tenantId: string, estudanteId: string, voltar: string): Promise<MaterialJurisclub[]> {
  return remember(`jurisclub:materiais:${tenantId}:${estudanteId}`, 60, () => calcular(tenantId, estudanteId, voltar))
}
