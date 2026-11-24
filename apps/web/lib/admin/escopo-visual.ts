// Escopo visual do admin (`.estudio-scope`: tokens do design-system do Estúdio + fundo + gold-ink).
// Aplicado ao <main> de app/admin/layout.tsx em TODAS as rotas, exceto as listadas aqui (telas full-bleed/editores
// externos que preferem os tokens padrão). Função pura (testável).
export const ROTAS_SEM_ESCOPO_VISUAL: string[] = [
  '/admin/teste', // editores OnlyOffice de teste (full-bleed/iframe)
  '/admin/biblioteca/editar', // editor/prévia de conteúdo (full-bleed)
  '/admin/cadernos-teste',
]

export function adminUsaEscopoVisual(pathname: string): boolean {
  return !ROTAS_SEM_ESCOPO_VISUAL.some((p) => pathname === p || pathname.startsWith(p + '/'))
}
