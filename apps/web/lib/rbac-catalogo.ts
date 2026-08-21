// Catálogo de PERMISSÕES do RBAC. Contém exatamente as permissões que o app realmente
// verifica (checkPermission / accessCan / useCan) — assim a matriz mostra uma tabela
// COMPLETA e útil (marcar/desmarcar tem efeito real). Áreas ainda não “gateadas” por
// permissão (ex.: cadernos, integrações) não entram aqui até o app passar a exigi-las.

export const RBAC_CATALOGO: { resource: string; action: string }[] = [
  { resource: 'questoes', action: 'view' }, { resource: 'questoes', action: 'create' }, { resource: 'questoes', action: 'update' },
  { resource: 'leitura', action: 'view' }, { resource: 'leitura', action: 'create' }, { resource: 'leitura', action: 'update' }, { resource: 'leitura', action: 'delete' },
  { resource: 'correcao', action: 'view' }, { resource: 'correcao', action: 'corrigir' },
  { resource: 'simulados', action: 'view' }, { resource: 'simulados', action: 'create' }, { resource: 'simulados', action: 'update' }, { resource: 'simulados', action: 'delete' },
  { resource: 'estudantes', action: 'view' }, { resource: 'estudantes', action: 'create' }, { resource: 'estudantes', action: 'update' }, { resource: 'estudantes', action: 'delete' },
  { resource: 'grupos', action: 'view' },
  { resource: 'matriculas', action: 'view' }, { resource: 'matriculas', action: 'create' }, { resource: 'matriculas', action: 'update' }, { resource: 'matriculas', action: 'delete' },
  { resource: 'integracoes', action: 'view' }, { resource: 'integracoes', action: 'manage' },
  { resource: 'relatorios', action: 'view' }, { resource: 'relatorios', action: 'export' },
  { resource: 'gamificacao', action: 'view' }, { resource: 'gamificacao', action: 'manage' },
  { resource: 'auditoria', action: 'view' }, { resource: 'auditoria', action: 'export' },
  { resource: 'configuracoes', action: 'view' }, { resource: 'configuracoes', action: 'manage' },
  { resource: 'api_keys', action: 'manage' },
  { resource: 'rbac', action: 'view' }, { resource: 'rbac', action: 'manage' },
  { resource: 'console', action: 'view' },
]

// Rótulos amigáveis (a matriz usa quando disponíveis; senão cai no valor cru).
export const RBAC_RECURSO_LABEL: Record<string, string> = {
  questoes: 'Questões',
  leitura: 'Área de Leitura',
  correcao: 'Correção de discursivas',
  simulados: 'Simulados',
  estudantes: 'Estudantes',
  grupos: 'Grupos',
  matriculas: 'Matrículas',
  integracoes: 'Integrações / Conexões',
  configuracoes: 'Configurações',
  api_keys: 'Chaves de API',
  rbac: 'Administração (RBAC)',
  console: 'Console (administração global)',
  auditoria: 'Auditoria',
  relatorios: 'Relatórios',
  gamificacao: 'Gamificação',
  tenants: 'Plataformas',
}

export const RBAC_ACAO_LABEL: Record<string, string> = {
  view: 'Ver / acessar',
  create: 'Adicionar',
  update: 'Editar',
  delete: 'Excluir',
  manage: 'Gerenciar (tudo)',
  export: 'Exportar',
  corrigir: 'Corrigir',
}
