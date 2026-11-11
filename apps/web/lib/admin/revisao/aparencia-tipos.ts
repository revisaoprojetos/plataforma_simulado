// Aparência da plataforma (Plataforma Revisão) — tipos + catálogos PUROS (client-safe). I/O em ./aparencia.
// Tudo mora em `simulado_tenants.tema` (jsonb): logo_url, favicon, cor_primaria, cor_accent, login.fundoImagem,
// menu_aluno.ocultos (hrefs) e home_blocos (ordem). Zero tabela nova.

/** Itens do menu do aluno (Revisão). `href` = chave estável (a mesma do shell do aluno). */
export type ItemMenuAluno = { href: string; nome: string; grupo: string }

export const MENU_ALUNO: ItemMenuAluno[] = [
  { href: '/aluno/nova/inicio', nome: 'Início', grupo: '' },
  { href: '/aluno/nova/painel', nome: 'Meu painel de estudos', grupo: '' },
  { href: '/aluno/nova/desempenho', nome: 'Meu desempenho', grupo: '' },
  { href: '/aluno/nova/cursos', nome: 'Meus cursos', grupo: 'CURSOS' },
  { href: '/aluno/simulados', nome: 'Simulados', grupo: 'ESTUDAR' },
  { href: '/aluno/questoes', nome: 'Banco de Questões', grupo: 'ESTUDAR' },
  { href: '/aluno/biblioteca', nome: 'Biblioteca', grupo: 'ESTUDAR' },
  { href: '/aluno/nova/como-estudar', nome: 'Como estudar', grupo: 'ESTUDAR' },
  { href: '/aluno/nova/cadernos', nome: 'Meus cadernos', grupo: 'ORGANIZAR' },
  { href: '/aluno/nova/duvidas', nome: 'Central de dúvidas', grupo: 'AJUDA' },
  { href: '/aluno/nova/ajuda', nome: 'Ajuda', grupo: 'AJUDA' },
  { href: '/aluno/nova/comunidade/ligas', nome: 'Ligas', grupo: 'AJUDA' },
  { href: '/aluno/nova/comunidade', nome: 'Comunidade', grupo: 'AJUDA' },
]

export const BLOCOS_HOME_PADRAO = [
  { id: 'avisos', nome: 'Faixa de avisos' },
  { id: 'calendario', nome: 'Calendário de compromissos' },
  { id: 'destaques', nome: 'Destaques da semana' },
  { id: 'vitrine', nome: 'Vitrine de cursos' },
  { id: 'simulado', nome: 'Próximo simulado' },
  { id: 'novidades', nome: 'Novidades' },
] as const

export type AparenciaDados = {
  logoUrl: string | null
  faviconUrl: string | null
  loginImagemUrl: string | null
  corPrimaria: string | null
  corAccent: string | null
  fonte: string | null
  nomeSite: string | null
  subtituloSite: string | null
  /** hrefs escondidos do menu do aluno. */
  ocultos: string[]
  /** ids dos blocos da Início, na ordem salva. */
  blocos: string[]
}

export type AparenciaInput = {
  logoUrl: string | null
  faviconUrl: string | null
  loginImagemUrl: string | null
  corPrimaria: string | null
  corAccent: string | null
  ocultos: string[]
  blocos: string[]
}

/** Texto legível sobre um fundo hex (branco em fundo escuro, quase-preto em claro). */
export function contrasteHex(hex: string | null | undefined): string {
  const h = (hex ?? '').replace('#', '')
  if (h.length < 6) return '#ffffff'
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? '#1f1830' : '#ffffff'
}
