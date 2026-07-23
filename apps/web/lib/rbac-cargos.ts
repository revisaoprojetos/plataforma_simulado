// Rótulos amigáveis para cargos/perfis (slug → nome legível), compartilhado entre
// a tela de Administradores e o RBAC. Mantém coerência com o mapa de rbac-perfis.

const ROTULOS: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'Administrador',
  admin_geral: 'Admin Geral',
  admin_conteudo: 'Conteúdo',
  admin_correcao: 'Correção',
  admin_relatorio: 'Relatórios',
  admin_comercial: 'Comercial',
  estudante: 'Estudante',
  testador: 'Testador',
}

export function rotuloCargo(nome: string): string {
  return ROTULOS[nome] ?? nome.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

// Cargos que dão acesso TOTAL ao painel (não dependem da matriz de permissões).
export const CARGOS_ACESSO_TOTAL = new Set(['admin', 'super_admin', 'admin_geral'])
