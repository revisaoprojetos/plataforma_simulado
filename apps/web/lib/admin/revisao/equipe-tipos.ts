// Permissões da equipe (Plataforma Revisão) — tipos + catálogo PUROS (client-safe).
// Cada coluna da matriz do protótipo ("área do admin") liga a UM recurso do RBAC real (`resource:action`).
// Níveis: 0 = não vê · 1 = vê (`<recurso>:view`) · 2 = edita (view + todas as demais ações do recurso).
// Quando duas áreas usam o mesmo recurso (ex.: Membros e Calendário), elas andam juntas — o cabeçalho avisa.

export type AreaEquipe = { id: string; nome: string; recurso: string }

export const AREAS_EQUIPE: AreaEquipe[] = [
  { id: 'biblioteca', nome: 'Biblioteca', recurso: 'biblioteca' },
  { id: 'jurisclub', nome: 'JurisClub', recurso: 'leitura' },
  { id: 'cronograma', nome: 'Cronograma', recurso: 'cronogramas' },
  { id: 'videoteca', nome: 'Videoteca', recurso: 'video' },
  { id: 'duvidas', nome: 'Central de Dúvidas', recurso: 'estudantes' },
  { id: 'atualizacoes', nome: 'Central de Atualizações', recurso: 'biblioteca' },
  { id: 'membros', nome: 'Membros e grupos', recurso: 'estudantes' },
  { id: 'calendario', nome: 'Calendário', recurso: 'estudantes' },
  { id: 'campanhas', nome: 'Disparo de Campanha', recurso: 'estudantes' },
  { id: 'avisos', nome: 'Avisos e pop-ups', recurso: 'configuracoes' },
  { id: 'cursos', nome: 'Cursos', recurso: 'produtos' },
  { id: 'simulados', nome: 'Simulados', recurso: 'simulados' },
  { id: 'relatorios', nome: 'Relatórios', recurso: 'relatorios' },
  { id: 'aparencia', nome: 'Aparência', recurso: 'configuracoes' },
  { id: 'permissoes', nome: 'Permissões', recurso: 'rbac' },
]

export type Nivel = 0 | 1 | 2

export type PapelEquipe = {
  id: string
  nome: string // slug (valor gravado em tenant_acessos.role)
  rotulo: string
  acessoTotal: boolean // admin/admin_geral/super_admin: não dependem da matriz
  editavel: boolean // papel do próprio tenant (os de sistema/outros tenants são só leitura)
  pessoas: number
  niveis: Record<string, Nivel> // areaId → nível
}

export type PessoaEquipe = {
  userId: string
  nome: string | null
  emailMascarado: string
  cargo: string
  ativo: boolean
  ultimoAcesso: string
  ehVoce: boolean
}

export type HistoricoEquipe = { id: string; texto: string; quando: string; ator: string }

export type EquipeDados = {
  papeis: PapelEquipe[]
  pessoas: PessoaEquipe[]
  historico: HistoricoEquipe[]
  indisponivel: boolean
  /** áreas cujo recurso ainda não tem permissões cadastradas no banco (migration pendente) — célula travada. */
  areasSemPermissao: string[]
}

export const NIVEL_ROTULO = ['não vê', 'vê', 'edita'] as const

/** "coordenacao_tech" → "Coordenacao tech". */
export function rotuloPapel(slug: string): string {
  const s = slug.replace(/_/g, ' ').trim()
  return s ? s[0].toUpperCase() + s.slice(1) : slug
}

/** tec***@dominio.com.br (como no protótipo: 3 primeiras letras + ***). */
export function mascararEmail(email: string | null | undefined): string {
  const [u, d] = (email ?? '').split('@')
  if (!u || !d) return email ?? '—'
  return `${u.slice(0, 3)}***@${d}`
}
