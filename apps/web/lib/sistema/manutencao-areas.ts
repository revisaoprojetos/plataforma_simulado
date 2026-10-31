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
  href: string              // rota base da área — usada p/ esconder do menu e bloquear o acesso
  hrefs?: string[]          // rotas EXTRA da mesma área (ex.: Gamificação = trilha + ligas + recomendado)
  discursiva?: boolean      // área especial: além da rota, esconde as opções de discursiva espalhadas
  padraoBloqueado?: boolean // nasce BLOQUEADA (ON) quando não há config salva — p/ áreas restritas (ex.: Teste).
                            // O toggle continua significando "em manutenção"; só muda o default. Libere por allowlist.
  exact?: boolean           // casa só o pathname EXATO (não os subcaminhos). Necessário p/ rotas-raiz como
                            // `/aluno` (a Início legada), que senão casariam o portal inteiro.
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
  // Área de TESTE (spike dos editores Office). Nasce BLOQUEADA — só quem estiver no allowlist vê o
  // item no menu e acessa /admin/teste. Cobre também as sub-rotas (/admin/teste/onlyoffice|collabora/...).
  { key: 'teste', label: 'Teste — Editores Office', descricao: 'Área de avaliação dos editores Office (Collabora/OnlyOffice). Fica bloqueada por padrão; libere só quem precisa testar.', href: '/admin/teste', padraoBloqueado: true },
  // Biblioteca de Conteúdos (Drive jurídico + Modelos de caderno + editores OnlyOffice). Nasce BLOQUEADA
  // em TODOS os tenants — libere por allowlist. Cobre sub-rotas (/admin/biblioteca/editar/...).
  { key: 'biblioteca', label: 'Biblioteca de Conteúdos', descricao: 'Drive de documentos jurídicos versionados + Modelos de caderno, com edição no OnlyOffice. Bloqueada por padrão; libere só quem for operar.', href: '/admin/biblioteca', padraoBloqueado: true },
]

/**
 * Áreas do PORTAL DO ALUNO que podem ser colocadas em manutenção. Diferente do admin, aqui a
 * manutenção pode LIBERAR alguns alunos (allowlist) — guardado em `tema.manutencao_aluno` (ativos)
 * + `tema.manutencao_aluno_liberados` (ids de estudantes que ainda enxergam a área).
 */
export const AREAS_MANUTENCAO_ALUNO: AreaManutencao[] = [
  // ── Áreas consolidadas (todas as marcas) ──
  { key: 'simulados', label: 'Simulados', descricao: 'Lista e aplicação de simulados do aluno (/aluno/simulados).', href: '/aluno/simulados' },
  // Banco de Questões já engloba, na Revisão, a aba "Recomendados" (área unificada): bloquear aqui
  // cobre tanto /aluno/questoes quanto /aluno/recomendado.
  { key: 'questoes', label: 'Banco de Questões (Questões Revisão + Recomendados)', descricao: 'Banco de questões e, na Revisão, a aba unificada de Recomendados (/aluno/questoes + /aluno/recomendado).', href: '/aluno/questoes', hrefs: ['/aluno/recomendado'] },
  // Biblioteca do aluno (ler conteúdos liberados + grifar). Nasce BLOQUEADA — libere por allowlist.
  { key: 'biblioteca', label: 'Biblioteca', descricao: 'Leitura dos materiais liberados, com grifos salvos (/aluno/biblioteca).', href: '/aluno/biblioteca', padraoBloqueado: true },

  // ── Início — as 2 áreas (nova + legada). A legada usa match EXATO (/aluno é a raiz do portal). ──
  { key: 'nova_inicio', label: 'Início (nova)', descricao: 'Página inicial nova da Revisão (/aluno/nova/inicio).', href: '/aluno/nova/inicio' },
  { key: 'inicio', label: 'Início (legado)', descricao: 'Home antiga do aluno (/aluno). Na Revisão redireciona para a Início nova.', href: '/aluno', exact: true },

  // ── Demais áreas novas da Revisão (/aluno/nova/*) ──
  { key: 'nova_painel', label: 'Painel de estudos', descricao: 'Hub do cronograma adaptativo e painel de estudos (/aluno/nova/painel).', href: '/aluno/nova/painel' },
  { key: 'nova_desempenho', label: 'Meu Desempenho', descricao: 'Estatísticas e desempenho do aluno (/aluno/nova/desempenho).', href: '/aluno/nova/desempenho' },
  // Comunidade engloba /comunidade, /comunidade/ligas e /comunidade/perfil (bloquear aqui cobre toda a área).
  { key: 'nova_comunidade', label: 'Comunidade', descricao: 'Comunidade, perfil e Ligas (/aluno/nova/comunidade — inclui /ligas e /perfil).', href: '/aluno/nova/comunidade' },
  // Ligas (nova) — é a principal na Revisão; a antiga /aluno/ligas redireciona para cá.
  { key: 'nova_ligas', label: 'Ligas', descricao: 'Ranking por ligas, área principal da Revisão (/aluno/nova/comunidade/ligas). A antiga /aluno/ligas redireciona para cá.', href: '/aluno/nova/comunidade/ligas' },
  { key: 'nova_cursos', label: 'Cursos', descricao: 'Produtos e cursos do aluno (/aluno/nova/cursos).', href: '/aluno/nova/cursos' },
  // SUB-REGRA de Cursos: a Central de Estudos (ferramentas LegProc/JurisClub/Questões + Desafios) e tudo
  // sob /aluno/nova/cursos/central. Nasce BLOQUEADA — fica OCULTA p/ todos os alunos que não estão no
  // allowlist (a "regra"): some o botão/atalhos da Central na página de Cursos e bloqueia a rota.
  // NÃO esconde a área de Cursos em si (só a Central dentro dela). Libere os alunos certos no allowlist.
  { key: 'nova_cursos_central', label: 'Central de Estudos (dentro de Cursos)', descricao: 'Central de Estudos e ferramentas dentro de Cursos (/aluno/nova/cursos/central). Sub-regra de Cursos: nasce BLOQUEADA — só os alunos liberados (allowlist) veem a Central; para os demais o botão "Ir para a Central de Estudos" e os atalhos somem da página de Cursos.', href: '/aluno/nova/cursos/central', padraoBloqueado: true },
  { key: 'nova_como_estudar', label: 'Como Estudar', descricao: 'Guia "Como Estudar" (/aluno/nova/como-estudar).', href: '/aluno/nova/como-estudar' },
  // Meus Cadernos (área nova). Em construção — nasce BLOQUEADA até o conteúdo ser configurado; some do
  // menu e a rota mostra "em manutenção". Libere (toggle off no admin) quando estiver pronta.
  { key: 'cadernos', label: 'Meus Cadernos', descricao: 'Cadernos de estudo do aluno (/aluno/nova/cadernos). Ainda sem conteúdo configurado — bloqueada por padrão.', href: '/aluno/nova/cadernos', padraoBloqueado: true },
  { key: 'nova_duvidas', label: 'Central de Dúvidas e Requerimentos', descricao: 'Dúvidas e requerimentos (/aluno/nova/duvidas).', href: '/aluno/nova/duvidas' },
  { key: 'nova_ajuda', label: 'Ajuda com a Plataforma', descricao: 'FAQ e ajuda do aluno (/aluno/nova/ajuda).', href: '/aluno/nova/ajuda' },

  // ── Áreas legadas (MEQ/VND; na Revisão saíram do menu ou foram substituídas, mas as rotas seguem vivas) ──
  { key: 'leitura', label: 'Desafio de Lei Seca', descricao: 'Biblioteca e leitor de documentos (/aluno/leitura).', href: '/aluno/leitura' },
  { key: 'jurisprudencia', label: 'Desafio de Jurisprudência', descricao: 'Jogo/desafio de jurisprudência (/aluno/jurisprudencia).', href: '/aluno/jurisprudencia' },
  { key: 'cronograma', label: 'Cronograma (legado)', descricao: 'Gerar e acompanhar cronogramas (/aluno/cronograma). Na Revisão o acesso é pelo Painel de estudos.', href: '/aluno/cronograma' },
  { key: 'trilha', label: 'Trilha', descricao: 'Trilha de simulados/gamificação do aluno (/aluno/trilha).', href: '/aluno/trilha' },
  { key: 'ligas', label: 'Ligas (legado)', descricao: 'Ranking por ligas antigo (/aluno/ligas). Na Revisão redireciona para a Ligas nova.', href: '/aluno/ligas' },
]

export type ManutencaoAreas = Record<string, boolean>
/** Allowlist por área: quem (ids de usuário/estudante) ainda pode visualizar a área em manutenção. */
export type ManutencaoLiberados = Record<string, string[]>

/**
 * MODO de manutenção por área (só ALUNO):
 *  - 'bloqueio'   (padrão): quem não está liberado NÃO vê a área — ela some do menu e a rota mostra
 *                 a tela genérica "em manutenção".
 *  - 'construcao' ("criando ainda"): a área CONTINUA no menu e clicável; quem não está liberado vê o
 *                 card animado "Em breve"; só quem está no allowlist vê o conteúdo real.
 */
export type ModoManutencao = 'bloqueio' | 'construcao'
export type ManutencaoModos = Record<string, ModoManutencao>

/** Higieniza um mapa {key: boolean} para as chaves conhecidas de um conjunto de áreas. */
export function normalizarMapaAreas(raw: unknown, areas: AreaManutencao[]): Record<string, boolean> {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const out: Record<string, boolean> = {}
  // Sem config salva: usa o default da área (`padraoBloqueado`). Com config, respeita o valor salvo.
  for (const a of areas) out[a.key] = a.key in r ? !!r[a.key] : !!a.padraoBloqueado
  return out
}

/**
 * Higieniza o mapa de MODOS {key: 'bloqueio'|'construcao'} p/ as chaves conhecidas. Default 'bloqueio'
 * por área (só 'construcao' sobrescreve); valor inválido/ausente → 'bloqueio'.
 */
export function normalizarModos(raw: unknown, areas: AreaManutencao[]): ManutencaoModos {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const out: ManutencaoModos = {}
  for (const a of areas) out[a.key] = r[a.key] === 'construcao' ? 'construcao' : 'bloqueio'
  return out
}

/** Modo configurado para a área do aluno (default 'bloqueio' quando ausente). */
export function modoDaAreaAluno(area: AreaManutencao, modos?: ManutencaoModos): ModoManutencao {
  return modos?.[area.key] === 'construcao' ? 'construcao' : 'bloqueio'
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
  // `exact`: casa só o caminho idêntico (p/ rotas-raiz como `/aluno`). Senão, casa a rota e os subcaminhos.
  return alvos.some((h) => pathname === h || (!a.exact && pathname.startsWith(h + '/')))
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

/**
 * ALUNO: rotas a esconder do menu agora (áreas em manutenção onde ESTE aluno não está liberado).
 * `modos` (opcional): áreas no modo 'construcao' FICAM no menu (clicáveis → card "Em breve"), então
 * NÃO entram na lista de ocultos. Sem `modos`, comportamento legado = tudo escondido ('bloqueio').
 */
export function hrefsBloqueadosAluno(
  ativos: Record<string, boolean>, liberados: ManutencaoLiberados, estudanteId: string | null,
  modos?: ManutencaoModos,
): string[] {
  const out: string[] = []
  for (const a of AREAS_MANUTENCAO_ALUNO) {
    if (!ativos[a.key]) continue
    if (estudanteId && (liberados[a.key] ?? []).includes(estudanteId)) continue
    if (modos && modos[a.key] === 'construcao') continue // modo construção: segue visível no menu
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
