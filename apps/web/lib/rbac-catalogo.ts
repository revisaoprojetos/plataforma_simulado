// Catálogo de PERMISSÕES do RBAC. Contém exatamente as permissões que o app realmente
// verifica (checkPermission / accessCan / useCan) — assim a matriz mostra uma tabela
// COMPLETA e útil (marcar/desmarcar tem efeito real). Áreas ainda não “gateadas” por
// permissão (ex.: cadernos, integrações) não entram aqui até o app passar a exigi-las.

export const RBAC_CATALOGO: { resource: string; action: string }[] = [
  { resource: 'questoes', action: 'view' }, { resource: 'questoes', action: 'create' }, { resource: 'questoes', action: 'update' },
  { resource: 'simulados', action: 'view' }, { resource: 'simulados', action: 'create' }, { resource: 'simulados', action: 'update' }, { resource: 'simulados', action: 'delete' },
  { resource: 'estudantes', action: 'view' }, { resource: 'estudantes', action: 'create' }, { resource: 'estudantes', action: 'update' }, { resource: 'estudantes', action: 'delete' },
  { resource: 'matriculas', action: 'create' }, { resource: 'matriculas', action: 'update' }, { resource: 'matriculas', action: 'delete' },
  { resource: 'configuracoes', action: 'manage' },
  { resource: 'api_keys', action: 'manage' },
  { resource: 'rbac', action: 'view' }, { resource: 'rbac', action: 'manage' },
  { resource: 'console', action: 'view' },
]

// Rótulos amigáveis (a matriz usa quando disponíveis; senão cai no valor cru).
export const RBAC_RECURSO_LABEL: Record<string, string> = {
  questoes: 'Questões',
  simulados: 'Simulados',
  estudantes: 'Estudantes',
  matriculas: 'Matrículas',
  configuracoes: 'Configurações',
  api_keys: 'Chaves de API',
  rbac: 'Administração (RBAC)',
  console: 'Console (administração global)',
  auditoria: 'Auditoria',
  relatorios: 'Relatórios',
  tenants: 'Plataformas',
}

export const RBAC_ACAO_LABEL: Record<string, string> = {
  view: 'Ver / acessar',
  create: 'Adicionar',
  update: 'Editar',
  delete: 'Excluir',
  manage: 'Gerenciar (tudo)',
  export: 'Exportar',
}
