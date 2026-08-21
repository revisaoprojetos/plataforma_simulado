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
  discursiva?: boolean  // área especial: além da rota, esconde as opções de discursiva espalhadas
}

/** Áreas que podem ser colocadas em manutenção. (Não inclui configs sensíveis p/ não trancar o admin.) */
export const AREAS_MANUTENCAO: AreaManutencao[] = [
  { key: 'discursiva', label: 'Correção discursiva', descricao: 'Envio e correção de respostas discursivas (foto). Bloqueia /admin/correcao e esconde TODAS as opções de discursiva (tipo, filtros, wizard, banco, relatórios) — volta a ficar "como era antes".', href: '/admin/correcao', discursiva: true },
  { key: 'simulados', label: 'Aplicação de Simulado', descricao: 'Criação e gestão de simulados.', href: '/admin/simulados' },
  { key: 'questoes', label: 'Questões', descricao: 'Cadastro e edição de questões.', href: '/admin/questoes' },
  { key: 'banco', label: 'Banco de Simulado', descricao: 'Bancos de questões e cadernos.', href: '/admin/banco-questoes' },
  { key: 'relatorios', label: 'Relatórios', descricao: 'Relatórios e estatísticas.', href: '/admin/relatorios' },
  { key: 'gamificacao', label: 'Gamificação', descricao: 'XP, níveis, ligas, missões e conquistas.', href: '/admin/gamificacao' },
  { key: 'matriculas', label: 'Matrículas', descricao: 'Matrículas e planos dos alunos.', href: '/admin/matriculas' },
  { key: 'grupos', label: 'Grupos', descricao: 'Turmas e grupos de alunos.', href: '/admin/grupos' },
  { key: 'integracoes', label: 'Integrações', descricao: 'Curseduca, Guru e webhooks.', href: '/admin/integracoes' },
  { key: 'estudantes', label: 'Estudantes', descricao: 'Cadastro e gestão de alunos.', href: '/admin/estudantes' },
]

export type ManutencaoAreas = Record<string, boolean>

/** Higieniza o objeto cru do banco para o formato canônico (só as chaves conhecidas). */
export function normalizarManutencaoAreas(raw: unknown): ManutencaoAreas {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const out: ManutencaoAreas = {}
  for (const a of AREAS_MANUTENCAO) out[a.key] = !!r[a.key]
  return out
}

/**
 * A discursiva fica escondida por env (deploy global) OU pela manutenção por-tenant.
 * Une os dois: assim a página do admin liga/desliga sem redeploy e o "como era antes" continua valendo.
 */
export function ocultarDiscursivaDe(m: ManutencaoAreas): boolean {
  return OCULTAR_DISCURSIVA || !!m.discursiva
}

/** Retorna a área em manutenção que "possui" o caminho (ou null). Usado no gate de rota do layout. */
export function areaBloqueadaDoPath(pathname: string, m: ManutencaoAreas): AreaManutencao | null {
  for (const a of AREAS_MANUTENCAO) {
    const bloqueada = a.discursiva ? ocultarDiscursivaDe(m) : !!m[a.key]
    if (!bloqueada) continue
    if (pathname === a.href || pathname.startsWith(a.href + '/')) return a
  }
  return null
}

/** Lista de rotas base bloqueadas agora — o menu lateral esconde os itens que casam. */
export function hrefsBloqueados(m: ManutencaoAreas): string[] {
  return AREAS_MANUTENCAO.filter((a) => (a.discursiva ? ocultarDiscursivaDe(m) : !!m[a.key])).map((a) => a.href)
}
