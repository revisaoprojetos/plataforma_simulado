// Catálogo de PERMISSÕES do RBAC. Contém exatamente as permissões que o app realmente
// verifica (checkPermission / accessCan / useCan) — assim a matriz mostra uma tabela
// COMPLETA e útil (marcar/desmarcar tem efeito real). Áreas ainda não “gateadas” por
// permissão (ex.: cadernos, integrações) não entram aqui até o app passar a exigi-las.

export const RBAC_CATALOGO: { resource: string; action: string }[] = [
  { resource: 'questoes', action: 'view' }, { resource: 'questoes', action: 'create' }, { resource: 'questoes', action: 'update' },
  { resource: 'leitura', action: 'view' }, { resource: 'leitura', action: 'create' }, { resource: 'leitura', action: 'update' }, { resource: 'leitura', action: 'delete' }, { resource: 'leitura', action: 'publicar' },
  { resource: 'correcao', action: 'view' }, { resource: 'correcao', action: 'corrigir' },
  { resource: 'simulados', action: 'view' }, { resource: 'simulados', action: 'create' }, { resource: 'simulados', action: 'update' }, { resource: 'simulados', action: 'delete' },
  { resource: 'estudantes', action: 'view' }, { resource: 'estudantes', action: 'create' }, { resource: 'estudantes', action: 'update' }, { resource: 'estudantes', action: 'delete' },
  { resource: 'grupos', action: 'view' },
  { resource: 'matriculas', action: 'view' }, { resource: 'matriculas', action: 'create' }, { resource: 'matriculas', action: 'update' }, { resource: 'matriculas', action: 'delete' },
  { resource: 'produtos', action: 'view' }, { resource: 'produtos', action: 'create' }, { resource: 'produtos', action: 'update' }, { resource: 'produtos', action: 'manage' },
  { resource: 'liberacao', action: 'view' }, { resource: 'liberacao', action: 'manage' },
  // Área de Conteúdos (Estúdio de Conteúdo): materiais/biblioteca, flashcards, trilhas e classificação.
  // Gateamento no app chega com os builders; semeadas aqui p/ o papel `professor` (self-service).
  { resource: 'biblioteca', action: 'view' }, { resource: 'biblioteca', action: 'create' }, { resource: 'biblioteca', action: 'update' }, { resource: 'biblioteca', action: 'publicar' },
  { resource: 'flashcards', action: 'view' }, { resource: 'flashcards', action: 'create' }, { resource: 'flashcards', action: 'update' }, { resource: 'flashcards', action: 'manage' },
  { resource: 'trilhas', action: 'view' }, { resource: 'trilhas', action: 'create' }, { resource: 'trilhas', action: 'update' }, { resource: 'trilhas', action: 'manage' },
  { resource: 'classificacao', action: 'view' }, { resource: 'classificacao', action: 'manage' },
  { resource: 'integracoes', action: 'view' }, { resource: 'integracoes', action: 'manage' },
  { resource: 'relatorios', action: 'view' }, { resource: 'relatorios', action: 'export' },
  { resource: 'gamificacao', action: 'view' }, { resource: 'gamificacao', action: 'manage' },
  { resource: 'auditoria', action: 'view' }, { resource: 'auditoria', action: 'export' },
  { resource: 'configuracoes', action: 'view' }, { resource: 'configuracoes', action: 'manage' },
  { resource: 'api_keys', action: 'manage' },
  { resource: 'rbac', action: 'view' }, { resource: 'rbac', action: 'manage' },
  { resource: 'console', action: 'view' },
  { resource: 'armazenamento', action: 'view' }, { resource: 'armazenamento', action: 'manage' },
  // Cronogramas de estudo. `liberar` é separado de `update` porque decide se o ALUNO enxerga;
  // `emitir` permite gerar um cronograma em nome de um aluno (atendimento/suporte).
  { resource: 'cronogramas', action: 'view' }, { resource: 'cronogramas', action: 'create' }, { resource: 'cronogramas', action: 'update' },
  { resource: 'cronogramas', action: 'delete' }, { resource: 'cronogramas', action: 'liberar' }, { resource: 'cronogramas', action: 'emitir' },
]

// Rótulos amigáveis (a matriz usa quando disponíveis; senão cai no valor cru).
export const RBAC_RECURSO_LABEL: Record<string, string> = {
  questoes: 'Questões',
  leitura: 'Desafio de Lei Seca',
  correcao: 'Correção de discursivas',
  simulados: 'Simulados',
  estudantes: 'Estudantes',
  grupos: 'Grupos',
  matriculas: 'Matrículas',
  produtos: 'Produtos / Extensivos',
  liberacao: 'Regras de liberação',
  biblioteca: 'Biblioteca / Materiais',
  flashcards: 'Flashcards',
  trilhas: 'Trilhas',
  classificacao: 'Classificação / Taxonomia',
  integracoes: 'Integrações / Conexões',
  configuracoes: 'Configurações',
  api_keys: 'Chaves de API',
  rbac: 'Administração (RBAC)',
  console: 'Console (administração global)',
  armazenamento: 'Armazenamento',
  auditoria: 'Auditoria',
  relatorios: 'Relatórios',
  gamificacao: 'Gamificação',
  tenants: 'Plataformas',
  cronogramas: 'Cronogramas de estudo',
}

export const RBAC_ACAO_LABEL: Record<string, string> = {
  view: 'Ver / acessar',
  create: 'Adicionar',
  update: 'Editar',
  delete: 'Excluir',
  manage: 'Gerenciar (tudo)',
  export: 'Exportar',
  corrigir: 'Corrigir',
  liberar: 'Liberar para alunos',
  emitir: 'Emitir em nome de aluno',
}
