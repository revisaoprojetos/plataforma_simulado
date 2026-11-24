// FONTE ÚNICA da navegação do /admin: SETORES › ABAS (= CLUSTERS) › ITENS. Alimenta a sidebar (acordeão: cada
// ABA é UMA entrada da lateral — só clusters MUITO diferentes entre si), a BARRA DE SETOR (os ITENS da aba ativa,
// como abas internas acima do conteúdo; some se a aba tem 1 item ou `abasProprias`) e o editor de rótulos.
// Client-safe: sem I/O (só ícones lucide e flags NEXT_PUBLIC inlinadas no build).
//
// REGRAS
//  - NENHUM href mudou em relação ao menu antigo (as rotas são as mesmas; só o agrupamento mudou).
//  - Rótulos/ícones por tenant: chave de ITEM = href completo (inclui ?tab=/?tipo=); chave de SETOR = `label`
//    do setor (aproveita overrides antigos de GRUPO com o mesmo nome: "Alunos", "Análise", "Engajamento",
//    "Atendimento", "Pedagógico"). Ver docs/REORGANIZACAO-MENU.md.
//  - `superOnly` (setor/aba/item) = só super-admin GLOBAL. A trava real é em 3 camadas (ver SUPER_ONLY_PREFIXOS
//    + app/admin/layout.tsx + server actions/rotas de API). Aqui é só a camada de exibição.
import type { ComponentType } from 'react'
import {
  LayoutDashboard, BookOpen, ClipboardList, Users, UsersRound, BarChart3, MessageSquare, KeyRound, GraduationCap,
  Boxes, SlidersHorizontal, Flag, PenLine, LogIn, FilePen, FlaskConical, Trash2, PieChart, Trophy,
  Star, HelpCircle, Webhook, Plug, Zap, ServerCog, UserCog, ShieldCheck, ShieldAlert, Megaphone, Library,
  CalendarDays, Upload, LayoutTemplate, Eye, Scale, CreditCard, MessageCircle, FileText, Newspaper, FolderTree,
  PlayCircle, Route, Lock, Send, Gavel, History, ListChecks, Building2, Palette,
} from 'lucide-react'
import {
  LEITURA_ATIVA, JURISPRUDENCIA_ATIVA, MODELOS_CADERNO_ATIVO, LIBERACAO_REGRAS_ATIVO,
} from '@/lib/flags'

export type IconeSetor = ComponentType<{ className?: string; style?: React.CSSProperties }>

export interface ItemSetor {
  label: string
  href: string
  icone: IconeSetor
  perm?: string // permissão (resource:action) necessária para ver o item
  exact?: boolean
  matchPrefix?: string // acende para qualquer rota sob este prefixo
  superOnly?: boolean // só super-admin GLOBAL
  oculto?: boolean // escondido por flag (feature em construção)
  /**
   * ALIAS = rota antiga (ou variante sem query) que CONTINUA resolvendo (resolverRota) para a aba/entrada correta —
   * mantém o destaque da sidebar e o mapeamento de setor/teste — mas NÃO aparece na sidebar, na barra de abas
   * nem no editor de rótulos (setoresVisiveis os remove). Nunca é o 1º item da aba (o 1º é o destino da entrada).
   */
  alias?: boolean
  /**
   * Só para ALIAS: href do item VISÍVEL da mesma aba que este alias acende na barra de abas (BarraSetor) — ex.: as
   * rotas /admin/cronogramas/** acendem "Gerador". Ausente = o próprio href. Ver `hrefAtivoDaRota`.
   */
  alvo?: string
}

export interface AbaSetor {
  id: string
  label: string
  superOnly?: boolean
  oculto?: boolean
  perm?: string
  /** Ícone da entrada na sidebar; ausente = ícone do 1º item. */
  icone?: IconeSetor
  /**
   * A TELA já mostra abas próprias com estes mesmos irmãos → a barra central (BarraSetor) não aparece
   * (nunca duplicar). Ver docs/REORGANIZACAO-MENU.md (tabela "tem abas próprias?").
   */
  abasProprias?: boolean
  itens: ItemSetor[]
}

export interface Setor {
  id: string
  label: string
  icone: IconeSetor
  superOnly?: boolean
  abas: AbaSetor[]
}

/**
 * Rotas reservadas ao SUPER-ADMIN GLOBAL (camada 2: gate de rota em app/admin/layout.tsx; vale também para
 * cargos de acesso total do tenant). Casamento por prefixo + '/' (então '/admin/acessos' ≠ '/admin/acessos-equipe').
 * `/admin/biblioteca?tab=modelos` NÃO entra aqui (query não é gateável por path) — a página e as actions recusam.
 */
export const SUPER_ONLY_PREFIXOS = [
  '/admin/sistema',
  '/admin/transcricao',
  '/admin/api-keys',
  '/admin/conexoes/webhooks',
  '/admin/conexoes/n8n',
  '/admin/liberacao',
  '/admin/seguranca',
  '/admin/auditoria/problemas',
  '/admin/acessos-equipe',
  '/admin/teste',
] as const

/** O path cai numa rota super-only? (prefixo exato OU prefixo + '/') */
export function rotaSuperOnly(pathname: string): boolean {
  return SUPER_ONLY_PREFIXOS.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

export const SETORES: Setor[] = [
  // ───────────────────────────── 1. INÍCIO ─────────────────────────────
  {
    id: 'inicio', label: 'Início', icone: LayoutDashboard,
    abas: [
      {
        id: 'dashboard', label: 'Dashboard', icone: LayoutDashboard,
        itens: [
          { label: 'Dashboard', href: '/admin', icone: LayoutDashboard, exact: true },
          { label: 'Visão Revisão', href: '/admin/revisao/inicio', icone: LayoutDashboard, perm: 'relatorios:view' },
        ],
      },
    ],
  },
  // ───────────────────────────── 2. PEDAGÓGICO ─────────────────────────────
  {
    id: 'pedagogico', label: 'Pedagógico', icone: GraduationCap,
    abas: [
      {
        id: 'cursos-produtos', label: 'Cursos e Produtos',
        itens: [
          // Estúdio de Conteúdo: UMA entrada; a navegação interna é pelas abas do próprio Estúdio.
          { label: 'Produtos Estúdio', href: '/admin/conteudos/produtos', icone: FolderTree, perm: 'produtos:view', matchPrefix: '/admin/conteudos' },
          { label: 'Produtos / Extensivos', href: '/admin/produtos', icone: Boxes, perm: 'produtos:view' },
          { label: 'Cursos Revisão', href: '/admin/revisao/cursos', icone: BookOpen, perm: 'produtos:view' },
        ],
      },
      {
        id: 'simulados', label: 'Simulados', icone: ClipboardList,
        itens: [
          { label: 'Aplicação de Simulado', href: '/admin/simulados', icone: ClipboardList, perm: 'simulados:view' },
          { label: 'Simulados Revisão', href: '/admin/revisao/simulados', icone: ClipboardList, perm: 'simulados:view' },
          { label: 'Correção (discursivas)', href: '/admin/correcao', icone: PenLine, perm: 'questoes:view' },
        ],
      },
      {
        id: 'lei-seca-juris', label: 'Lei Seca e Jurisprudência', icone: Library,
        itens: [
          { label: 'Lei Seca', href: '/admin/leitura', icone: Library, perm: 'leitura:view', oculto: !LEITURA_ATIVA },
          { label: 'Análise', href: '/admin/leitura/analise', icone: BarChart3, perm: 'relatorios:view', oculto: !LEITURA_ATIVA },
          { label: 'Jurisprudência', href: '/admin/jurisprudencia', icone: Scale, perm: 'leitura:view', oculto: !JURISPRUDENCIA_ATIVA },
        ],
      },
      {
        // UMA entrada ("Cronogramas") com 2 modalidades: Gerador e Adaptativo. A 1ª fileira de abas (BarraSetor) mostra
        // [Gerador | Adaptativo]; a navegação interna (5 abas por modalidade; as telas de cada aba = abas internas ?v=, sem 3ª fileira) vive em lib/admin/cronogramas-nav.ts +
        // components/admin/cronograma/{cronogramas-nav,vistas-cronograma}.tsx. Gate = o da PÁGINA (cronogramas:view).
        // Os ALIAS são as rotas atuais (continuam abrindo) e acendem o item visível indicado em `alvo`:
        // /admin/cronogramas/** (catálogo, [id], criar, conteudos, pacotes, links, tipos, metas, relatorios, importar) → Gerador;
        // /admin/cronogramas/adaptativo/** e /lei-seca → Adaptativo; shell sem ?aba= → Gerador.
        id: 'cronogramas', label: 'Cronogramas', icone: CalendarDays,
        itens: [
          { label: 'Gerador de cronograma', href: '/admin/revisao/cronograma?aba=gerador', icone: CalendarDays, perm: 'cronogramas:view' },
          { label: 'Cronograma adaptativo', href: '/admin/revisao/cronograma?aba=adaptativo', icone: Route, perm: 'cronogramas:view' },
          { label: 'Cronograma (rota padrão)', href: '/admin/revisao/cronograma', icone: Route, alias: true, alvo: '/admin/revisao/cronograma?aba=gerador' },
          { label: 'Catálogo (antigo)', href: '/admin/cronogramas', icone: CalendarDays, alias: true, alvo: '/admin/revisao/cronograma?aba=gerador' },
          { label: 'Relatórios (antigo)', href: '/admin/cronogramas/relatorios', icone: BarChart3, alias: true, alvo: '/admin/revisao/cronograma?aba=gerador' },
          { label: 'Importar (antigo)', href: '/admin/cronogramas/importar', icone: Upload, alias: true, alvo: '/admin/revisao/cronograma?aba=gerador' },
          { label: 'Adaptativo · Liberação (antigo)', href: '/admin/cronogramas/adaptativo', icone: Lock, alias: true, alvo: '/admin/revisao/cronograma?aba=adaptativo' },
          { label: 'Lei seca (adaptativo)', href: '/admin/cronogramas/lei-seca', icone: FileText, alias: true, alvo: '/admin/revisao/cronograma?aba=adaptativo' },
        ],
      },
      {
        id: 'biblioteca', label: 'Biblioteca',
        itens: [
          { label: 'Conteúdos', href: '/admin/biblioteca', icone: BookOpen, perm: 'configuracoes:view' },
          { label: 'Biblioteca Revisão', href: '/admin/revisao/biblioteca', icone: BookOpen, perm: 'configuracoes:view' },
          { label: 'Biblioteca Lei Seca', href: '/admin/leitura/biblioteca', icone: LayoutTemplate, perm: 'leitura:view', oculto: !LEITURA_ATIVA },
          { label: 'JurisClub', href: '/admin/revisao/jurisclub', icone: Gavel, perm: 'configuracoes:view' },
        ],
      },
      {
        id: 'questoes', label: 'Questões', icone: BookOpen,
        itens: [
          { label: 'Questões', href: '/admin/questoes', icone: BookOpen, perm: 'questoes:view' },
          { label: 'Modelos de Caderno', href: '/admin/modelos-caderno', icone: LayoutTemplate, perm: 'questoes:view', oculto: !MODELOS_CADERNO_ATIVO },
        ],
      },
      { id: 'videoteca', label: 'Videoteca', itens: [{ label: 'Videoteca', href: '/admin/revisao/videoteca', icone: PlayCircle, perm: 'configuracoes:view' }] },
      { id: 'atualizacoes', label: 'Atualizações', itens: [{ label: 'Central de Atualizações', href: '/admin/revisao/atualizacoes', icone: History, perm: 'configuracoes:view' }] },
      { id: 'duvidas', label: 'Dúvidas', itens: [{ label: 'Central de Dúvidas', href: '/admin/revisao/duvidas', icone: MessageCircle, perm: 'estudantes:view' }] },
    ],
  },
  // ───────────────────────────── 3. ALUNOS ─────────────────────────────
  {
    id: 'alunos', label: 'Alunos', icone: Users,
    abas: [
      {
        id: 'estudantes', label: 'Estudantes',
        itens: [
          { label: 'Estudantes', href: '/admin/estudantes', icone: Users, perm: 'estudantes:view' },
          { label: 'Membros', href: '/admin/revisao/membros', icone: Users, perm: 'estudantes:view' },
          { label: 'Visualizações de aluno', href: '/admin/impersonation', icone: Eye, perm: 'estudantes:view' },
        ],
      },
      {
        id: 'grupos', label: 'Grupos',
        itens: [
          { label: 'Grupos', href: '/admin/grupos', icone: UsersRound, perm: 'grupos:view' },
          { label: 'Grupos de acesso', href: '/admin/revisao/grupos', icone: KeyRound, perm: 'grupos:view' },
        ],
      },
      {
        id: 'comunicacao', label: 'Comunicação', icone: Megaphone,
        itens: [
          { label: 'Calendário', href: '/admin/revisao/calendario', icone: CalendarDays, perm: 'estudantes:view' },
          { label: 'Campanhas', href: '/admin/revisao/campanhas', icone: Send, perm: 'estudantes:view' },
          { label: 'Avisos e pop-ups', href: '/admin/revisao/avisos', icone: Megaphone, perm: 'configuracoes:view' },
        ],
      },
      { id: 'engajamento', label: 'Engajamento', icone: Trophy, itens: [{ label: 'Gamificação', href: '/admin/gamificacao', icone: Trophy, perm: 'gamificacao:view' }] },
    ],
  },
  // ───────────────────────────── 5. ATENDIMENTO ─────────────────────────────
  {
    id: 'atendimento', label: 'Atendimento', icone: MessageCircle,
    abas: [
      {
        // Gate por `estudantes:view` (suporte/gestão do aluno; mesmo resource de LGPD e Visualizações).
        // A tela JÁ tem abas próprias (Dúvidas | Requerimentos | Demandas, por ?tab=) → sem barra central.
        id: 'atendimento', label: 'Atendimento', icone: MessageCircle, abasProprias: true,
        itens: [
          { label: 'Dúvidas', href: '/admin/atendimento?tab=duvidas', icone: MessageCircle, perm: 'estudantes:view' },
          { label: 'Requerimentos', href: '/admin/atendimento?tab=requerimentos', icone: FileText, perm: 'estudantes:view' },
        ],
      },
      {
        id: 'feedback', label: 'Feedback', icone: MessageSquare,
        itens: [
          { label: 'Comentários', href: '/admin/comentarios', icone: MessageSquare, perm: 'questoes:view' },
          { label: 'Reports', href: '/admin/feedbacks', icone: Flag, perm: 'questoes:view' },
        ],
      },
    ],
  },
  // ───────────────────────────── 6. ANÁLISE ─────────────────────────────
  {
    id: 'analise', label: 'Análise', icone: BarChart3,
    abas: [
      {
        id: 'relatorios', label: 'Relatórios', icone: BarChart3,
        itens: [
          { label: 'Central de relatórios', href: '/admin/relatorios', icone: BarChart3, perm: 'relatorios:view', exact: true },
          { label: 'Gráfico', href: '/admin/relatorios/graficos', icone: PieChart, perm: 'relatorios:view' },
          { label: 'Simulado', href: '/admin/relatorios/simulados', icone: ClipboardList, perm: 'relatorios:view' },
          { label: 'Disciplina', href: '/admin/relatorios/disciplinas', icone: BookOpen, perm: 'relatorios:view' },
          { label: 'Relatórios Revisão', href: '/admin/revisao/relatorios', icone: PieChart, perm: 'relatorios:view' },
        ],
      },
      {
        id: 'alunos-engajamento', label: 'Alunos e engajamento', icone: GraduationCap,
        itens: [
          { label: 'Estudantes', href: '/admin/relatorios/estudantes', icone: GraduationCap, perm: 'relatorios:view' },
          { label: 'Grupos por aluno', href: '/admin/relatorios/grupos', icone: Users, perm: 'relatorios:view' },
          { label: 'Ranking', href: '/admin/relatorios/ranking', icone: Trophy, perm: 'relatorios:view' },
          { label: 'Assinaturas & Engajamento', href: '/admin/relatorios/engajamento', icone: CreditCard, perm: 'relatorios:view' },
          { label: 'NPS / Satisfação', href: '/admin/relatorios/nps', icone: Star, perm: 'relatorios:view' },
        ],
      },
    ],
  },
  // ───────────────────────────── 7. ADMIN (configuração e acessos do tenant) ─────────────────────────────
  {
    id: 'admin', label: 'Admin', icone: SlidersHorizontal,
    abas: [
      {
        id: 'equipe-permissoes', label: 'Equipe e permissões', icone: UserCog,
        itens: [
          { label: 'Administradores', href: '/admin/administradores', icone: UserCog, perm: 'rbac:view' },
          { label: 'Permissões da equipe (Revisão)', href: '/admin/revisao/equipe', icone: UserCog, perm: 'rbac:view' },
        ],
      },
      {
        id: 'configuracao', label: 'Configuração', icone: SlidersHorizontal,
        itens: [
          { label: 'Mensagens', href: '/admin/configuracoes/mensagens', icone: MessageSquare, perm: 'configuracoes:view' },
          { label: 'Ajuda / FAQ', href: '/admin/configuracoes/ajuda', icone: HelpCircle, perm: 'configuracoes:view' },
          { label: 'Banners & Pop-ups', href: '/admin/configuracoes/banners', icone: Megaphone, perm: 'configuracoes:view' },
          { label: 'Novidades', href: '/admin/configuracoes/novidades', icone: Newspaper, perm: 'configuracoes:view' },
          { label: 'Aparência (Revisão)', href: '/admin/revisao/aparencia', icone: Palette, perm: 'configuracoes:view' },
          { label: 'Ajuda', href: '/admin/ajuda', icone: HelpCircle },
        ],
      },
      { id: 'integracoes', label: 'Integrações', itens: [{ label: 'Integrações', href: '/admin/integracoes', icone: Plug, perm: 'integracoes:view' }] },
      {
        // Os tipos (?tipo=) só são navegáveis por aqui (a página não tem abas de tipo) → barra central.
        id: 'auditoria', label: 'Auditoria', icone: ShieldCheck,
        itens: [
          { label: 'Acessos', href: '/admin/auditoria?tipo=acessos', icone: LogIn, perm: 'auditoria:view' },
          { label: 'Modificações', href: '/admin/auditoria?tipo=modificacoes', icone: FilePen, perm: 'auditoria:view' },
          { label: 'Automações', href: '/admin/auditoria?tipo=automacoes', icone: Zap, perm: 'auditoria:view' },
          { label: 'Visualizações', href: '/admin/auditoria?tipo=visualizacoes', icone: Eye, perm: 'auditoria:view' },
          { label: 'Acessos de alunos', href: '/admin/acessos', icone: ShieldCheck, perm: 'acessos:view' },
        ],
      },
      {
        id: 'lgpd-lixeira', label: 'LGPD e lixeira', icone: Trash2,
        itens: [
          { label: 'LGPD', href: '/admin/lgpd', icone: ShieldCheck, perm: 'estudantes:view' },
          { label: 'Lixeira', href: '/admin/lixeira', icone: Trash2, perm: 'questoes:view' },
        ],
      },
    ],
  },
  // ───────────────────────────── 8. SUPER ADMIN (SÓ super-admin global) ─────────────────────────────
  {
    id: 'super', label: 'Super Admin', icone: ShieldAlert, superOnly: true,
    abas: [
      {
        id: 'sistema', label: 'Sistema', superOnly: true,
        itens: [{ label: 'Sistema (manutenção e testadores)', href: '/admin/sistema', icone: ServerCog, perm: 'configuracoes:view', superOnly: true }],
      },
      {
        id: 'chaves-tecnicas', label: 'Chaves e integrações técnicas', superOnly: true,
        itens: [
          { label: 'Chaves de API', href: '/admin/transcricao', icone: KeyRound, perm: 'configuracoes:view', superOnly: true },
          { label: 'API Keys (acesso público)', href: '/admin/api-keys', icone: KeyRound, perm: 'api_keys:manage', superOnly: true },
          { label: 'Webhooks & n8n', href: '/admin/conexoes/webhooks', icone: Webhook, perm: 'integracoes:view', superOnly: true },
          { label: 'Regras de liberação', href: '/admin/liberacao', icone: ShieldCheck, perm: 'liberacao:view', superOnly: true, oculto: !LIBERACAO_REGRAS_ATIVO },
        ],
      },
      {
        id: 'seguranca-tecnica', label: 'Segurança e auditoria técnica', superOnly: true,
        itens: [
          { label: 'Segurança', href: '/admin/seguranca', icone: ShieldAlert, perm: 'seguranca:view', superOnly: true, matchPrefix: '/admin/seguranca' },
          { label: 'Problemas', href: '/admin/auditoria/problemas', icone: ListChecks, perm: 'problemas:view', superOnly: true, matchPrefix: '/admin/auditoria/problemas' },
          { label: 'Equipe online', href: '/admin/acessos-equipe', icone: Users, perm: 'acessos:view', superOnly: true, matchPrefix: '/admin/acessos-equipe' },
        ],
      },
      {
        id: 'teste-office', label: 'Teste e editores Office', superOnly: true,
        itens: [
          { label: 'Editores', href: '/admin/teste', icone: FlaskConical, perm: 'configuracoes:view', superOnly: true },
          { label: 'Modelos de Caderno (OnlyOffice)', href: '/admin/biblioteca?tab=modelos', icone: LayoutTemplate, perm: 'configuracoes:view', superOnly: true },
        ],
      },
      {
        // Atalho para o Console global (área SEPARADA, fora do /admin): não participa do "item ativo".
        id: 'console', label: 'Console global', superOnly: true,
        itens: [{ label: 'Console (todas as plataformas)', href: '/super', icone: Building2, superOnly: true, exact: true }],
      },
    ],
  },
]

// ───────────────────────────── helpers puros ─────────────────────────────

/** Todos os itens (com setor/aba de origem), na ordem de declaração. */
export function itensPlanos(setores: Setor[] = SETORES): { setor: Setor; aba: AbaSetor; item: ItemSetor }[] {
  return setores.flatMap((setor) => setor.abas.flatMap((aba) => aba.itens.map((item) => ({ setor, aba, item }))))
}

export function setorPorId(id: string): Setor | undefined {
  return SETORES.find((s) => s.id === id)
}

interface Consulta { get(nome: string): string | null }

/** O item casa com a rota atual? (pode casar mais de um — a escolha é do `resolverRota`) */
export function itemCasa(item: ItemSetor, pathname: string, search: Consulta): boolean {
  const [path, qs] = item.href.split('?')
  if (item.exact) return pathname === path
  if (item.matchPrefix) return pathname === item.matchPrefix || pathname.startsWith(item.matchPrefix + '/')
  if (qs) {
    // Itens que compartilham a mesma rota e diferem só pela query (Auditoria, Atendimento, Biblioteca ?tab=).
    if (pathname !== path) return false
    for (const [k, v] of new URLSearchParams(qs)) if (search.get(k) !== v) return false
    return true
  }
  return pathname === path || pathname.startsWith(path + '/')
}

/** Casamento ignorando a query (fallback: /admin/auditoria sem ?tipo, /admin/atendimento sem ?tab…). */
function itemCasaPath(item: ItemSetor, pathname: string): boolean {
  const path = item.href.split('?')[0]
  if (item.matchPrefix) return pathname === item.matchPrefix || pathname.startsWith(item.matchPrefix + '/')
  if (item.exact) return pathname === path
  return pathname === path || pathname.startsWith(path + '/')
}

export interface RotaResolvida { setor: Setor; aba: AbaSetor; item: ItemSetor }

/**
 * Qual setor/aba/item corresponde à rota — o item MAIS ESPECÍFICO (href mais longo) entre os que casam,
 * IGUAL à regra antiga da sidebar (`?query` só vale com pathname exato). Se nada casa pela query, tenta só
 * pelo path. Rotas sem setor → null (a barra some). Considera TODOS os itens (visíveis ou não): a barra
 * continua coerente mesmo em rota aberta por link direto.
 */
export function resolverRota(pathname: string, search: Consulta, setores: Setor[] = SETORES): RotaResolvida | null {
  const planos = itensPlanos(setores)
  const pior = (a: RotaResolvida, b: RotaResolvida) => (b.item.href.length > a.item.href.length ? b : a)
  const exatos = planos.filter((p) => itemCasa(p.item, pathname, search))
  if (exatos.length) return exatos.reduce(pior)
  const porPath = planos.filter((p) => itemCasaPath(p.item, pathname))
  return porPath.length ? porPath.reduce((a, b) => (b.item.href.split('?')[0].length > a.item.href.split('?')[0].length ? b : a)) : null
}

/** href do item da barra/rótulo que a rota acende: o `alvo` do alias, ou o próprio href. */
export function hrefAtivoDaRota(rota: RotaResolvida): string {
  return rota.item.alvo ?? rota.item.href
}

export interface OpcoesVisibilidade {
  /** `can(perm)` do CanProvider (perm vazio = livre). */
  can: (perm?: string) => boolean
  isSuperAdmin: boolean
  /** hrefs de áreas em manutenção por tenant (areasBloqueadas). */
  areasBloqueadas?: string[]
}

/**
 * Setores/abas/itens VISÍVEIS para o usuário: permissão, flags `oculto`, `superOnly` (só super) e manutenção
 * por área. Aba sem item visível some; setor sem aba visível some. Setor/aba `superOnly` somem p/ não-super.
 */
export function setoresVisiveis(op: OpcoesVisibilidade, setores: Setor[] = SETORES): Setor[] {
  const bloq = op.areasBloqueadas ?? []
  const emManutencao = (href: string) => bloq.some((h) => href === h || href.startsWith(h + '/'))
  // Manutenção vale pelo PATH também (hrefs com ?aba=/?tipo= são bloqueados pela área-mãe).
  const itemOk = (i: ItemSetor) =>
    !i.alias && op.can(i.perm) && !i.oculto && !(i.superOnly && !op.isSuperAdmin) && !emManutencao(i.href) && !emManutencao(i.href.split('?')[0])
  return setores
    .filter((s) => !(s.superOnly && !op.isSuperAdmin))
    .map((s) => ({
      ...s,
      abas: s.abas
        .filter((a) => !(a.superOnly && !op.isSuperAdmin) && !a.oculto && op.can(a.perm))
        .map((a) => ({ ...a, itens: a.itens.filter(itemOk) }))
        .filter((a) => a.itens.length > 0),
    }))
    .filter((s) => s.abas.length > 0)
}

/** Primeiro destino (href do 1º item da 1ª aba) de um setor já filtrado — alvo do clique na sidebar. */
export function hrefInicialSetor(setor: Setor): string {
  return setor.abas[0]?.itens[0]?.href ?? '/admin'
}

/** Destino de uma aba já filtrada (1º item visível). */
export function hrefInicialAba(aba: AbaSetor): string {
  return aba.itens[0]?.href ?? '/admin'
}

/** Ícone da entrada da sidebar para a aba (próprio, senão o do 1º item). */
export function iconeDaAba(aba: AbaSetor): IconeSetor {
  return aba.icone ?? aba.itens[0].icone
}

/**
 * Chave do override de rótulo/ícone por tenant (`tema.sidebar_rotulos.admin.itens`) da aba. Aba de 1 item
 * mantém a chave ANTIGA do item (href → overrides já salvos continuam valendo); aba com vários itens usa
 * `aba:<id>`. Calculada pela DEFINIÇÃO (não pelo filtro de permissão), então é estável por usuário.
 */
export function chaveRotuloAba(aba: AbaSetor): string {
  const def = SETORES.flatMap((s) => s.abas).find((a) => a.id === aba.id)
  const reais = (def ?? aba).itens.filter((i) => !i.alias) // aliases não contam (não aparecem no menu)
  return reais.length === 1 ? reais[0].href : `aba:${aba.id}`
}

/**
 * Itens da BARRA de abas internas para a rota atual: os itens (já filtrados) da aba ativa. `null` = sem barra
 * (rota sem setor/aba, aba com <2 itens visíveis, ou `abasProprias`: a tela já tem as suas).
 */
export function itensDaBarra(rota: RotaResolvida | null, visiveis: Setor[]): ItemSetor[] | null {
  if (!rota) return null
  const aba = visiveis.find((s) => s.id === rota.setor.id)?.abas.find((a) => a.id === rota.aba.id)
  if (!aba || aba.abasProprias || aba.itens.length < 2) return null
  return aba.itens
}
