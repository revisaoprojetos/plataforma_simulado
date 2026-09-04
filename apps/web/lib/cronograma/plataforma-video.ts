import { SLUG_PDF, SLUG_VIDEO } from './tipos'

/**
 * Garante uma plataforma "sintética" (Vídeo, PDF) do tenant e devolve o id.
 *
 * Vídeo/PDF do banco de conteúdos são gravados como mais um link de aula, sob estas plataformas —
 * assim a grade os mostra sem precisar de coluna nova em `simulado_cronograma_metas`. Idempotente:
 * cria só na primeira vez e reativa se alguém tiver desativado.
 */
async function garantirPlataforma(svc: any, tenantId: string, slug: string, nome: string, ordem: number): Promise<string | null> {
  const { data: existente } = await svc
    .from('simulado_cronograma_plataformas')
    .select('id, ativo')
    .eq('tenant_id', tenantId)
    .eq('slug', slug)
    .maybeSingle()
  if (existente?.id) {
    if (existente.ativo === false) await svc.from('simulado_cronograma_plataformas').update({ ativo: true }).eq('id', existente.id)
    return existente.id
  }
  const { data: nova } = await svc
    .from('simulado_cronograma_plataformas')
    .insert({ tenant_id: tenantId, nome, slug, ativo: true, ordem })
    .select('id')
    .maybeSingle()
  return nova?.id ?? null
}

export const garantirPlataformaVideo = (svc: any, tenantId: string) => garantirPlataforma(svc, tenantId, SLUG_VIDEO, 'Vídeo', 900)
export const garantirPlataformaPdf = (svc: any, tenantId: string) => garantirPlataforma(svc, tenantId, SLUG_PDF, 'PDF', 901)
