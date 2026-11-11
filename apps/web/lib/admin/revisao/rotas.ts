// Destinos das telas vizinhas da "Plataforma Revisão". Centralizado: quando as rotas definitivas existirem
// (ou a sidebar for reajustada), troque APENAS aqui.
export const RR = {
  inicio: '/admin/revisao/inicio',
  relatorios: '/admin/revisao/relatorios',
  aparencia: '/admin/revisao/aparencia',
  equipe: '/admin/revisao/equipe',
  calendario: '/admin/revisao/calendario',
  cursos: '/admin/revisao/cursos',
  cursosAtivos: '/admin/revisao/cursos?f=ativos',
  biblioteca: '/admin/revisao/biblioteca',
  membros: '/admin/revisao/membros',
  banco: '/admin/questoes',
  duvidas: '/admin/revisao/duvidas',
  avaliacoes: '/admin/revisao/duvidas?aba=aval',
  problemas: '/admin/revisao/duvidas?aba=rep',
  atualizacoes: '/admin/revisao/atualizacoes',
  relatorioDisciplinas: '/admin/relatorios/disciplinas',
  auditoria: '/admin/auditoria?tipo=modificacoes',
} as const
