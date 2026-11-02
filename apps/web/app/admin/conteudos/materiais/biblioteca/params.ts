// Querystring → filtros de Aulas/Arquivos (compartilhado entre as pages e a rota de export XLSX).
// Fica FORA de 'use server' (exporta função síncrona).

export type ModoMateriais = 'aulas' | 'arquivos'

export function paramsMateriais(sp: Record<string, string | undefined>, modo: ModoMateriais) {
  return {
    modo,
    q: sp.q,
    tipos: sp.tipo ? [sp.tipo] : [],
    page: Number(sp.page ?? 1),
    perPage: Number(sp.pp),
    sort: sp.sort ?? 'criado_em',
    dir: (sp.sort ? (sp.dir === 'asc' ? 'asc' : 'desc') : 'desc') as 'asc' | 'desc',
    situacao: (sp.situacao === 'com' || sp.situacao === 'sem' ? sp.situacao : undefined) as 'com' | 'sem' | undefined,
    etiquetaId: sp.tag || undefined,
  }
}
