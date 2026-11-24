// FONTE ÚNICA da navegação interna de "Cronogramas" (admin). Client-safe, sem I/O.
//
// Estrutura (v4.30): UMA entrada "Cronogramas" na sidebar; 1ª fileira (BarraSetor) = modalidades [Gerador | Adaptativo];
// 2ª fileira = as 5 ABAS (grupos) da modalidade ativa. NÃO há 3ª fileira: as telas de cada aba (`subs`) viram ABAS INTERNAS
// (AbasLinha) dentro do conteúdo — componente <VistasCronograma/>, escolhidas por `?v=`.
// Canônico (shell): /admin/revisao/cronograma?aba=gerador|adaptativo&sub=<aba>&v=<vista>. Vista que ainda vive numa rota
// legada (/admin/cronogramas/**) tem `href` legado e o shell redireciona o alias `?sub=&v=` para ela. TODA rota antiga
// acende a aba + vista certas (`rotas`), e os links antigos `?sub=conteudos|mat|ver…` são normalizados (`normalizarShell`).
//
// `grupoDaRota(pathname, search)` diz onde a rota está (modalidade › aba › vista) — usada por <CronogramasNav /> e <VistasCronograma />.
// Ver docs/modelo-inicio-de-area.md.

export const EYEBROW_CRONOGRAMAS = 'Cronogramas'
export const BASE_SHELL_CRONOGRAMAS = '/admin/revisao/cronograma'
const PERM = 'cronogramas:view'

export type ModalidadeId = 'gerador' | 'adaptativo'

interface Consulta { get(nome: string): string | null }

/** Uma TELA da aba (vista interna). */
export interface SubAba {
  id: string
  label: string
  /** Destino do link (rota real: shell com ?sub=&v= ou rota legada). */
  href: string
  perm?: string
  /** Prefixos de rotas legadas que pertencem a esta vista (vence o MAIS LONGO). */
  rotas?: string[]
  /** Alias canônico no shell: `sub` = id da aba (grupo), `v` = vista (null = a única/primeira). */
  shell: { aba: ModalidadeId; sub: string; v: string | null }
  /** A página do shell RENDERIZA esta vista mesmo com `href` legado (ex.: tabela de faixas lida no shell). */
  noShell?: boolean
  /** Query params levados de uma vista para outra dentro da aba (busca de aluno compartilhada). */
  carrega?: string[]
  /** Uma frase: que pergunta esta vista responde (tooltip da aba + subtítulo sob as abas). */
  dica?: string
}

export interface Grupo { id: string; label: string; subs: SubAba[] }
export interface Modalidade { id: ModalidadeId; label: string; href: string; subPadrao: string; grupos: Grupo[] }

const sh = (aba: ModalidadeId, sub: string, v?: string | null) => `${BASE_SHELL_CRONOGRAMAS}?aba=${aba}&sub=${sub}${v ? `&v=${v}` : ''}`
const ADA = '/admin/cronogramas/adaptativo'
const GER = '/admin/cronogramas'

/** Vista renderizada no shell (href = alias canônico do shell). */
const naShell = (aba: ModalidadeId, grupo: string, id: string, label: string, extra: Partial<SubAba> = {}): SubAba =>
  ({ id, label, href: sh(aba, grupo, id), perm: PERM, shell: { aba, sub: grupo, v: id }, ...extra })
/** Vista que ainda vive numa rota legada (o alias do shell redireciona para `href`). */
const legada = (aba: ModalidadeId, grupo: string, id: string, label: string, href: string, extra: Partial<SubAba> = {}): SubAba =>
  ({ id, label, href, perm: PERM, rotas: [href], shell: { aba, sub: grupo, v: id }, ...extra })

const VISTAS_AUDITORIA = ['aula', 'duracao', 'buscar']
const BUSCA_ALUNO = ['q']

export const MODALIDADES: Modalidade[] = [
  {
    id: 'gerador', label: 'Gerador de cronograma', href: `${BASE_SHELL_CRONOGRAMAS}?aba=gerador`, subPadrao: 'visao',
    grupos: [
      { id: 'visao', label: 'Visão geral', subs: [
        { id: 'visao', label: 'Visão geral', href: sh('gerador', 'visao'), perm: PERM, shell: { aba: 'gerador', sub: 'visao', v: null } },
      ] },
      { id: 'cronogramas', label: 'Cronogramas', subs: [
        // Catch-all de /admin/cronogramas/** (catálogo, [id], criar, conteudo…): prefixos mais longos vencem.
        naShell('gerador', 'cronogramas', 'catalogo', 'Catálogo', { rotas: [GER] }),
        naShell('gerador', 'cronogramas', 'conjuntos', 'Conjuntos', { rotas: [`${GER}/conteudos`] }),
        naShell('gerador', 'cronogramas', 'links', 'Links de aula', { rotas: [`${GER}/links`] }),
      ] },
      { id: 'metas', label: 'Metas', subs: [
        naShell('gerador', 'metas', 'tipos', 'Tipos de meta', { rotas: [`${GER}/tipos`] }),
        naShell('gerador', 'metas', 'auditoria-metas', 'Auditoria de metas', { rotas: [`${GER}/metas`] }),
        legada('gerador', 'metas', 'fluxo-gerador', 'Fluxo', `${GER}/fluxo`),
      ] },
      { id: 'acesso', label: 'Acesso e liberação', subs: [
        naShell('gerador', 'acesso', 'acessos', 'Acessos', { rotas: [`${GER}/pacotes`] }),
        naShell('gerador', 'acesso', 'liberacao', 'Liberação'),
        naShell('gerador', 'acesso', 'liberacao-aulas', 'Liberação de aulas'),
      ] },
      { id: 'dados', label: 'Dados', subs: [
        naShell('gerador', 'dados', 'relatorios', 'Relatórios', { rotas: [`${GER}/relatorios`] }),
        naShell('gerador', 'dados', 'importacao', 'Importação', { rotas: [`${GER}/importar`] }),
      ] },
    ],
  },
  {
    id: 'adaptativo', label: 'Cronograma adaptativo', href: `${BASE_SHELL_CRONOGRAMAS}?aba=adaptativo`, subPadrao: 'visao',
    grupos: [
      { id: 'visao', label: 'Visão geral', subs: [
        // Análise | Rastro | Integridade: a busca de aluno (`q`) segue de uma vista para a outra.
        legada('adaptativo', 'visao', 'analise', 'Análise de uso', `${ADA}/analise`, { carrega: BUSCA_ALUNO }),
        legada('adaptativo', 'visao', 'rastro', 'Rastro', `${ADA}/rastro`, { carrega: BUSCA_ALUNO }),
        legada('adaptativo', 'visao', 'integridade', 'Integridade', `${ADA}/integridade`, { carrega: BUSCA_ALUNO }),
      ] },
      { id: 'conteudo', label: 'Conteúdo', subs: [
        naShell('adaptativo', 'conteudo', 'cobertura', 'Aulas e materiais', { dica: 'Cada aula tem todos os materiais? Veja o que falta e quanto tempo a aula ocupa.' }),
        naShell('adaptativo', 'conteudo', 'disciplinas', 'Disciplinas', { dica: 'Quais disciplinas entram no cronograma e quais materiais cada uma recebe.' }),
        legada('adaptativo', 'conteudo', 'catalogo-metas', 'Catálogo de metas', `${ADA}/catalogo`, { dica: 'Edite títulos, páginas e links de questões das aulas e das metas de LegProc.' }),
        legada('adaptativo', 'conteudo', 'paginas', 'Páginas divergentes', `${ADA}/catalogo/paginas`, { dica: 'Onde o número de páginas da planilha difere da Biblioteca.' }),
        legada('adaptativo', 'conteudo', 'definicoes', 'Análise das metas', `${ADA}/definicoes`, { dica: 'Cada meta do catálogo cruzada com o que os alunos têm nos planos e já fizeram.' }),
        legada('adaptativo', 'conteudo', 'lei-seca', 'Lei seca', '/admin/cronogramas/lei-seca', { dica: 'Metas de lei seca por disciplina.' }),
      ] },
      { id: 'regras', label: 'Regras do motor', subs: [
        naShell('adaptativo', 'regras', 'regras', 'Regras do cronograma'),
        legada('adaptativo', 'regras', 'metas', 'Metas e inteligência', `${ADA}/metas`),
        // O editor (legado) e a tabela de "Faixas de horas" do shell (?v=faixas) acendem a MESMA vista.
        legada('adaptativo', 'regras', 'faixas', 'Faixas e limites', `${ADA}/faixas`, { noShell: true }),
        legada('adaptativo', 'regras', 'restricoes', 'Restrições', `${ADA}/restricoes`),
        naShell('adaptativo', 'regras', 'especial', 'Semana especial'),
        legada('adaptativo', 'regras', 'personagens', 'Personagens', `${ADA}/personagens`),
      ] },
      { id: 'fluxo', label: 'Fluxo e simulação', subs: [
        legada('adaptativo', 'fluxo', 'fluxo', 'Fluxo', `${ADA}/fluxo`),
        legada('adaptativo', 'fluxo', 'mapa', 'Mapa', `${ADA}/mapa`),
        legada('adaptativo', 'fluxo', 'simulacao', 'Simulação', `${ADA}/simulacao`),
        legada('adaptativo', 'fluxo', 'inteligencia', 'Inteligência', `${ADA}/inteligencia`),
      ] },
      { id: 'versoes', label: 'Versões e entrega', subs: [
        // "Versões" e "Versões e exportação" UNIFICADAS: o shell mostra versões salvas + exportação + histórico das regras.
        naShell('adaptativo', 'versoes', 'versoes', 'Versões', { rotas: [`${ADA}/versoes`] }),
        // Prefixo curto = catch-all de /admin/cronogramas/adaptativo/** (os mais longos vencem).
        legada('adaptativo', 'versoes', 'liberacao', 'Liberação', ADA),
        legada('adaptativo', 'versoes', 'downloads', 'Downloads', `${ADA}/downloads`),
        naShell('adaptativo', 'versoes', 'sprint', 'Sprints'),
      ] },
    ],
  },
]

type Leg = { sub: string; v: string }
const LEGADO: Record<ModalidadeId, Record<string, Leg | ((q: Consulta) => Leg)>> = {
  gerador: {
    catalogo: { sub: 'cronogramas', v: 'catalogo' },
    conteudos: (q) => ({ sub: 'cronogramas', v: q.get('painel') === 'links' ? 'links' : 'conjuntos' }),
    metas: (q) => ({ sub: 'metas', v: VISTAS_AUDITORIA.includes(q.get('vista') ?? '') ? 'auditoria-metas' : 'tipos' }),
    acessos: { sub: 'acesso', v: 'acessos' },
    liberacao: { sub: 'acesso', v: 'liberacao' },
    'liberacao-aulas': { sub: 'acesso', v: 'liberacao-aulas' },
    relatorios: { sub: 'dados', v: 'relatorios' },
    importacao: { sub: 'dados', v: 'importacao' },
  },
  adaptativo: {
    mat: { sub: 'conteudo', v: 'cobertura' },
    disc: { sub: 'conteudo', v: 'disciplinas' },
    regras: { sub: 'regras', v: 'regras' },
    faixas: { sub: 'regras', v: 'faixas' },
    especial: { sub: 'regras', v: 'especial' },
    sprint: { sub: 'versoes', v: 'sprint' },
    ver: { sub: 'versoes', v: 'versoes' },
  },
}

/**
 * Normaliza `?sub=`/`?v=` do shell. Formato novo = `v` presente (ou `sub` só com o id da aba). Formato ANTIGO
 * (`?sub=conteudos`, `?sub=mat`, `?sub=ver`, `?sub=metas&vista=aula`…) vira (aba, vista). `legado` = a URL precisa ser reescrita.
 */
export function normalizarShell(aba: ModalidadeId, sub: string | null, q: Consulta): { sub: string | null; v: string | null; legado: boolean } {
  if (q.get('v')) return { sub, v: q.get('v'), legado: false }
  const l = sub ? LEGADO[aba][sub] : undefined
  if (!l) return { sub, v: null, legado: false }
  const r = typeof l === 'function' ? l(q) : l
  return { sub: r.sub, v: r.v, legado: true }
}

export function modalidadePorId(id: ModalidadeId): Modalidade {
  return MODALIDADES.find((m) => m.id === id)!
}

export interface RotaCronograma { modalidade: Modalidade; grupo: Grupo; subaba: SubAba }

const PAIS: { m: Modalidade; g: Grupo; s: SubAba }[] = MODALIDADES.flatMap((m) => m.grupos.flatMap((g) => g.subs.map((s) => ({ m, g, s }))))

/** O `href` da vista é do próprio shell (renderiza aqui) — senão é uma rota legada. */
export const hrefNoShell = (s: SubAba): boolean => s.href.startsWith(BASE_SHELL_CRONOGRAMAS)

/**
 * Onde a rota está na navegação de Cronogramas: modalidade › aba › vista. `null` = fora de Cronogramas.
 *  - Shell (/admin/revisao/cronograma): `?aba=` (sem aba = Gerador) + `?sub=` (aba) + `?v=` (vista); links antigos são normalizados.
 *  - Legadas (/admin/cronogramas/**): prefixo mais longo vence; /admin/cronogramas/adaptativo/** → Adaptativo;
 *    qualquer outra sob /admin/cronogramas (inclui [id], criar, conteudos/[id], pacotes/[id]) → Gerador.
 */
export function grupoDaRota(pathname: string, search: Consulta): RotaCronograma | null {
  if (pathname === BASE_SHELL_CRONOGRAMAS || pathname.startsWith(BASE_SHELL_CRONOGRAMAS + '/')) {
    const aba: ModalidadeId = search.get('aba') === 'adaptativo' ? 'adaptativo' : 'gerador'
    const mod = modalidadePorId(aba)
    const n = normalizarShell(aba, search.get('sub'), search)
    const grupo = mod.grupos.find((g) => g.id === n.sub) ?? mod.grupos.find((g) => g.id === mod.subPadrao) ?? mod.grupos[0]
    const subaba = grupo.subs.find((s) => s.shell.v === n.v) ?? grupo.subs[0]
    return { modalidade: mod, grupo, subaba }
  }
  let melhor: { p: (typeof PAIS)[number]; n: number } | null = null
  for (const p of PAIS) {
    for (const r of p.s.rotas ?? []) {
      if (pathname === r || pathname.startsWith(r + '/')) {
        if (!melhor || r.length > melhor.n) melhor = { p, n: r.length }
      }
    }
  }
  return melhor ? { modalidade: melhor.p.m, grupo: melhor.p.g, subaba: melhor.p.s } : null
}

/** Abas da modalidade só com as vistas permitidas (`can`); aba sem vista visível some. */
export function gruposVisiveis(modalidade: Modalidade, can: (perm?: string) => boolean): Grupo[] {
  return modalidade.grupos
    .map((g) => ({ ...g, subs: g.subs.filter((s) => can(s.perm)) }))
    .filter((g) => g.subs.length > 0)
}

/** href da aba = o da 1ª vista visível. */
export function hrefDoGrupo(grupo: Grupo): string {
  return grupo.subs[0].href
}

/** As abas internas (vistas) só aparecem quando a aba tem 2+ telas visíveis. */
export function mostraSubabas(grupo: Grupo): boolean {
  return grupo.subs.length >= 2
}

/** href da vista levando os params compartilhados (`carrega`, ex.: busca de aluno) da URL atual. */
export function hrefDaVista(s: SubAba, search: Consulta): string {
  const levar = (s.carrega ?? []).map((k) => [k, search.get(k)] as const).filter(([, v]) => !!v)
  if (!levar.length) return s.href
  const [path, qs = ''] = s.href.split('?')
  const p = new URLSearchParams(qs)
  for (const [k, v] of levar) p.set(k, v as string)
  return `${path}?${p.toString()}`
}

// ───────────────────────────── "Voltar" determinístico (?voltar=) ─────────────────────────────

/**
 * Valida o destino do `?voltar=`: SÓ caminho interno do admin (`/admin…`). Recusa URL absoluta, `//host`, `\`,
 * esquemas (`javascript:`), caracteres de controle e qualquer coisa fora de /admin → open redirect impossível.
 */
export function voltarSeguro(valor: string | null | undefined): string | null {
  if (!valor || valor.length > 2000) return null
  const v = valor // o Next já entrega searchParams decodificados: NÃO decodificar de novo
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(v)) return null
  if (v !== '/admin' && !v.startsWith('/admin/') && !v.startsWith('/admin?')) return null
  if (v.startsWith('//') || v.includes('://')) return null
  return v
}

/** Anexa `?voltar=<origem>` (origem = caminho+query atuais) ao href do link de entrada na tela de edição. */
export function comVoltar(href: string, origem: string): string {
  const o = voltarSeguro(origem)
  if (!o) return href
  return `${href}${href.includes('?') ? '&' : '?'}voltar=${encodeURIComponent(o)}`
}

export type TelaVoltar = 'cronograma' | 'criar' | 'conteudo' | 'pacote'

const FALLBACK_VOLTAR: Record<TelaVoltar, string> = {
  cronograma: sh('gerador', 'cronogramas', 'catalogo'),
  criar: sh('gerador', 'cronogramas', 'catalogo'),
  conteudo: sh('gerador', 'cronogramas', 'conjuntos'),
  pacote: sh('gerador', 'acesso', 'acessos'),
}

const ROTULO_POR_SUBABA: Record<string, string> = {
  catalogo: 'Voltar ao Catálogo',
  conjuntos: 'Voltar aos Conteúdos',
  links: 'Voltar aos Conteúdos',
  acessos: 'Voltar aos Acessos',
}

/** Destino + rótulo do "Voltar": `?voltar=` (validado) ou o fallback fixo da tela; rótulo contextual pelo destino. */
export function destinoVoltar(tela: TelaVoltar, voltar: string | null | undefined): { href: string; rotulo: string } {
  const href = voltarSeguro(voltar) ?? FALLBACK_VOLTAR[tela]
  const [path, qs = ''] = href.split('?')
  const rota = grupoDaRota(path, new URLSearchParams(qs))
  const rotulo = rota ? (ROTULO_POR_SUBABA[rota.subaba.id] ?? `Voltar para ${rota.subaba.label}`) : 'Voltar'
  return { href, rotulo }
}

// ───────────────────────────── cabeçalho: quem posiciona a nav ─────────────────────────────

/** Páginas de /admin/cronogramas/** que JÁ renderizam <CabecalhoArea> (a nav entra no cabeçalho delas, abaixo do H1). */
const COM_CABECALHO = [
  '/admin/cronogramas', '/admin/cronogramas/conteudos', '/admin/cronogramas/pacotes', '/admin/cronogramas/links',
  '/admin/cronogramas/tipos', '/admin/cronogramas/metas', '/admin/cronogramas/relatorios', '/admin/cronogramas/importar',
  '/admin/cronogramas/lei-seca', '/admin/cronogramas/fluxo',
]

/**
 * A rota NÃO tem cabeçalho próprio (edição: [id], criar, conteudos/[id], pacotes/[id]…): o shell desenha eyebrow + nav
 * no topo. Nas demais, o CabecalhoArea da página posiciona a nav (abaixo do título). Nunca os dois.
 */
export function rotaSemCabecalho(pathname: string): boolean {
  if (pathname === BASE_SHELL_CRONOGRAMAS || pathname.startsWith(BASE_SHELL_CRONOGRAMAS + '/')) return false
  if (pathname === '/admin/cronogramas/adaptativo' || pathname.startsWith('/admin/cronogramas/adaptativo/')) return false
  return !COM_CABECALHO.includes(pathname)
}
