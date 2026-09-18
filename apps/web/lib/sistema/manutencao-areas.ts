import { OCULTAR_DISCURSIVA } from '@/lib/flags'

/**
 * Manutenção POR ÁREA (por-tenant). Diferente de `manutencao.ts` (que bloqueia a plataforma
 * inteira numa janela), aqui cada ÁREA do admin pode ser colocada em manutenção individualmente:
 * some do menu, a rota mostra "em manutenção" e — no caso da Correção discursiva — esconde TODAS
 * as opções de discursiva espalhadas (tipo, filtros, wizard, banco, relatórios). Guardado em
 * `simulado_tenants.tema.manutencao_areas` = { [key]: boolean }.
 *
 * Este arquivo é PURO/isomórfico (sem acesso a banco) para poder ser importado por client
 * components (o form de toggles). As leituras no banco ficam em `manutencao-areas-server.ts`.
 */

export type AreaManutencao = {
  key: string
  label: string
  descricao: string
  href: string          // rota base da área — usada p/ esconder do menu e bloquear o acesso
  hrefs?: string[]      // rotas EXTRA da mesma área (ex.: Gamificação = trilha + ligas + recomendado)
  discursiva?: boolean  // área especial: além da rota, esconde as opções de discursiva espalhadas
}

/** Áreas que podem ser colocadas em manutenção. (Não inclui configs sensíveis p/ não trancar o admin.) */
export const AREAS_MANUTENCAO: AreaManutencao[] = [
  { key: 'discursiva', label: 'Correção discursiva', descricao: 'Envio e correção de respostas discursivas (foto). Bloqueia /admin/correcao e esconde TODAS as opções de discursiva (tipo, filtros, wizard, banco, relatórios) — volta a ficar "como era antes".', href: '/admin/correcao', discursiva: true },
  { key: 'simulados', label: 'Aplicação de Simulado', descricao: 'Criação e gestão de simulados.', href: '/admin/simulados' },
  { key: 'questoes', label: 'Questões', descricao: 'Cadastro e edição de questões.', href: '/admin/questoes' },
  // "Banco de Simulado" foi consolidado dentro da Aplicação (editores internos em /admin/banco-questoes/[id]);
  // não é mais uma área navegável, então saiu da manutenção por área (o toggle bloquearia os editores do simulado).
  { key: 'relatorios', label: 'Relatórios', descricao: 'Relatórios e estatísticas.', href: '/admin/relatorios' },
  { key: 'gamificacao', label: 'Gamificação', descricao: 'XP, níveis, ligas, missões e conquistas.', href: '/admin/gamificacao' },
  { key: 'matriculas', label: 'Matrículas', descricao: 'Matrículas e planos dos alunos.', href: '/admin/matriculas' },
  { key: 'grupos', label: 'Grupos', descricao: 'Turmas e grupos de alunos.', href: '/admin/grupos' },
  { key: 'integracoes', label: 'Integrações', descricao: 'Curseduca, Guru e webhooks.', href: '/admin/integracoes' },
  { key: 'estudantes', label: 'Estudantes', descricao: 'Cadastro e gestão de alunos.', href: '/admin/estudantes' },
]

/**
 * Áreas do PORTAL DO ALUNO que podem ser colocadas em manutenção. Diferente do admin, aqui a
 * manutenção pode LIBERAR alguns alunos (allowlist) — guardado em `tema.manutencao_aluno` (ativos)
 * + `tema.manutencao_aluno_liberados` (ids de estudantes que ainda enxergam a área).
 */
export const AREAS_MANUTENCAO_ALUNO: AreaManutencao[] = [
  { key: 'questoes', label: 'Banco de Questões', descricao: 'Prática de questões avulsas (/aluno/questoes).', href: '/aluno/questoes' },
  { key: 'leitura', label: 'Desafio de Lei Seca', descricao: 'Biblioteca e leitor de documentos (/aluno/leitura).', href: '/aluno/leitura' },
  { key: 'cronograma', label: 'Cronograma', descricao: 'Gerar e acompanhar cronogramas (/aluno/cronograma).', href: '/aluno/cronograma' },
  { key: 'trilha', label: 'Trilha', descricao: 'Trilha de simulados/gamificação do aluno (/aluno/trilha).', href: '/aluno/trilha' },
  { key: 'ligas', label: 'Ligas', descricao: 'Ranking por ligas (/aluno/ligas).', href: '/aluno/ligas' },
  { key: 'recomendado', label: 'Recomendado', descricao: 'Questões recomendadas pelo desempenho do aluno (/aluno/recomendado).', href: '/aluno/recomendado' },
]

export type ManutencaoAreas = Record<string, boolean>
/** Allowlist por área: quem (ids de usuário/estudante) ainda pode visualizar a área em manutenção. */
export type ManutencaoLiberados = Record<string, string[]>

/** Higieniza um mapa {key: boolean} para as chaves conhecidas de um conjunto de áreas. */
export function normalizarMapaAreas(raw: unknown, areas: AreaManutencao[]): Record<string, boolean> {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const out: Record<string, boolean> = {}
  for (const a of areas) out[a.key] = !!r[a.key]
  return out
}

/** Higieniza o allowlist {key: string[]} para as chaves conhecidas de um conjunto de áreas. */
export function normalizarLiberados(raw: unknown, areas: AreaManutencao[]): ManutencaoLiberados {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const out: ManutencaoLiberados = {}
  for (const a of areas) {
    const v = r[a.key]
    out[a.key] = Array.isArray(v) ? (v as unknown[]).filter((x): x is string => typeof x === 'string') : []
  }
  return out
}

/** Higieniza o objeto cru do banco (áreas do ADMIN) para o formato canônico. */
export function normalizarManutencaoAreas(raw: unknown): ManutencaoAreas {
  return normalizarMapaAreas(raw, AREAS_MANUTENCAO)
}

/** true se o pathname pertence à área (rota base OU qualquer rota extra). */
function pathBateArea(pathname: string, a: AreaManutencao): boolean {
  const alvos = [a.href, ...(a.hrefs ?? [])]
  return alvos.some((h) => pathname === h || pathname.startsWith(h + '/'))
}

/**
 * ALUNO: retorna a área em manutenção que "possui" o caminho E na qual o aluno NÃO está liberado
 * (fora do allowlist) — ou null. Alunos no allowlist enxergam a área normalmente.
 */
export function areaAlunoBloqueadaDoPath(
  pathname: string, ativos: Record<string, boolean>, liberados: ManutencaoLiberados, estudanteId: string | null,
): AreaManutencao | null {
  for (const a of AREAS_MANUTENCAO_ALUNO) {
    if (!ativos[a.key]) continue
    if (estudanteId && (liberados[a.key] ?? []).includes(estudanteId)) continue // liberado individualmente
    if (pathBateArea(pathname, a)) return a
  }
  return null
}

/** ALUNO: rotas a esconder do menu agora (áreas em manutenção onde ESTE aluno não está liberado). */
export function hrefsBloqueadosAluno(
  ativos: Record<string, boolean>, liberados: ManutencaoLiberados, estudanteId: string | null,
): string[] {
  const out: string[] = []
  for (const a of AREAS_MANUTENCAO_ALUNO) {
    if (!ativos[a.key]) continue
    if (estudanteId && (liberados[a.key] ?? []).includes(estudanteId)) continue
    out.push(a.href, ...(a.hrefs ?? []))
  }
  return out
}

/**
 * A discursiva fica escondida por env (deploy global) OU pela manutenção por-tenant.
 * Une os dois: assim a página do admin liga/desliga sem redeploy e o "como era antes" continua valendo.
 */
export function ocultarDiscursivaDe(m: ManutencaoAreas): boolean {
  return OCULTAR_DISCURSIVA || !!m.discursiva
}

/**
 * ADMIN: retorna a área em manutenção que "possui" o caminho (ou null). Usado no gate de rota do
 * layout. `liberados` (opcional): se o admin atual estiver no allowlist da área, ela NÃO bloqueia.
 */
export function areaBloqueadaDoPath(
  pathname: string, m: ManutencaoAreas, liberados?: ManutencaoLiberados, userId?: string | null,
): AreaManutencao | null {
  for (const a of AREAS_MANUTENCAO) {
    const bloqueada = a.discursiva ? ocultarDiscursivaDe(m) : !!m[a.key]
    if (!bloqueada) continue
    if (userId && liberados && (liberados[a.key] ?? []).includes(userId)) continue // admin liberado
    if (pathBateArea(pathname, a)) return a
  }
  return null
}

/** Lista de rotas base bloqueadas agora — o menu lateral esconde os itens que casam. Respeita o allowlist. */
export function hrefsBloqueados(m: ManutencaoAreas, liberados?: ManutencaoLiberados, userId?: string | null): string[] {
  return AREAS_MANUTENCAO
    .filter((a) => (a.discursiva ? ocultarDiscursivaDe(m) : !!m[a.key]))
    .filter((a) => !(userId && liberados && (liberados[a.key] ?? []).includes(userId)))
    .map((a) => a.href)
}
