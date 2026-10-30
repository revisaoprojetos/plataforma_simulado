// Mapa de rotas da NOVA plataforma do aluno (Revisão) — pacote de spec `revisao-plataforma-aluno`.
// Tudo sob o prefixo /nova para isolar de produção (migração tela a tela). Centralizar aqui
// evita hrefs soltos nas telas e facilita trocar o namespace depois.

export const BASE = '/aluno/nova'

export const R = {
  inicio: `${BASE}/inicio`,

  painel: `${BASE}/painel`,
  painelLeitor: (materialId: string) => `${BASE}/painel/leitor/${materialId}`,
  painelFlashcards: `${BASE}/painel/flashcards`,
  painelGrifos: `${BASE}/painel/grifos`,
  cronograma: `${BASE}/painel/cronograma`,
  cronogramaPrimeiro: `${BASE}/painel/cronograma/primeiro-acesso`,
  cronogramaMontar: `${BASE}/painel/cronograma/montar`,
  cronogramaHoje: `${BASE}/painel/cronograma/hoje`,

  desempenho: `${BASE}/desempenho`,

  comunidade: `${BASE}/comunidade`,
  ligas: `${BASE}/comunidade/ligas`,
  perfil: `${BASE}/comunidade/perfil`,

  cursos: `${BASE}/cursos`,
  curso: (cursoId: string) => `${BASE}/cursos/${cursoId}`,
  cursoEdital: (cursoId: string) => `${BASE}/cursos/${cursoId}/edital`,
  cursoAula: (cursoId: string, aulaId: string) => `${BASE}/cursos/${cursoId}/aula/${aulaId}`,
  cursoAvulso: (cursoId: string) => `${BASE}/cursos/avulso/${cursoId}`,
  extensivo: `${BASE}/cursos/extensivo`,
  central: `${BASE}/cursos/central`,
  legproc: `${BASE}/cursos/central/legproc`,
  jurisclub: `${BASE}/cursos/central/jurisclub`,

  questoes: `${BASE}/cursos/central/questoes`,
  banco: `${BASE}/cursos/central/questoes/banco`,
  realizados: `${BASE}/cursos/central/questoes/realizados`,
  recomendado: `${BASE}/cursos/central/questoes/recomendado`,
  resultado: `${BASE}/cursos/central/questoes/resultado`,

  desafioLeiSeca: `${BASE}/cursos/central/desafios/lei-seca`,
  desafioLeiSecaArea: `${BASE}/cursos/central/desafios/lei-seca/area`,
  desafioJuris: `${BASE}/cursos/central/desafios/jurisprudencia`,

  comoEstudar: `${BASE}/como-estudar`,
  cadernos: `${BASE}/cadernos`,
  duvidas: `${BASE}/duvidas`,
  requerimentos: `${BASE}/duvidas/requerimentos`,
  ajuda: `${BASE}/ajuda`,

  admin: `${BASE}/admin`,
} as const

export type NavKey =
  | 'inicio' | 'painel' | 'desempenho' | 'comunidade' | 'cursos'
  | 'como' | 'cadernos' | 'duvidas' | 'ajuda'

export type NavItem = { key: NavKey; label: string; icon: string; href: string; badge?: number }

// Menu lateral: exatamente 9 itens, na ordem de COMPONENTES.md.
export const NAV: NavItem[] = [
  { key: 'inicio', label: 'Início', icon: 'home', href: R.inicio },
  { key: 'painel', label: 'Painel de estudos', icon: 'target', href: R.painel },
  { key: 'desempenho', label: 'Meu desempenho', icon: 'chart', href: R.desempenho },
  { key: 'comunidade', label: 'Ligas e Comunidade', icon: 'users', href: R.comunidade },
  { key: 'cursos', label: 'Cursos', icon: 'book', href: R.cursos },
  { key: 'como', label: 'Como Estudar', icon: 'spark', href: R.comoEstudar },
  { key: 'cadernos', label: 'Meus Cadernos', icon: 'bookmark', href: R.cadernos },
  { key: 'duvidas', label: 'Central de Dúvidas e Requerimentos', icon: 'info', href: R.duvidas },
  { key: 'ajuda', label: 'Ajuda com a Plataforma', icon: 'chat', href: R.ajuda },
]

// Qual item do menu acende para um dado pathname (subtelas acendem a área-mãe).
export function navAtivo(pathname: string): NavKey {
  const p = pathname
  if (p.startsWith(`${BASE}/painel`)) return 'painel'
  if (p.startsWith(`${BASE}/desempenho`)) return 'desempenho'
  if (p.startsWith(`${BASE}/comunidade`)) return 'comunidade'
  if (p.startsWith(`${BASE}/cursos`)) return 'cursos'
  if (p.startsWith(`${BASE}/como-estudar`)) return 'como'
  if (p.startsWith(`${BASE}/cadernos`)) return 'cadernos'
  if (p.startsWith(`${BASE}/duvidas`)) return 'duvidas'
  if (p.startsWith(`${BASE}/ajuda`)) return 'ajuda'
  return 'inicio'
}
