// Acesso efetivo da Biblioteca — FUNÇÃO PURA (sem I/O, sem server-only), implementando EXATAMENTE o
// algoritmo do handoff §3 (01-conceitos-e-regras.md). Um módulo de dados separado monta `ItemAcesso`
// (item + cadeia de ancestrais + atribuições) a partir do banco e chama `acessoEfetivo`.
//
// Regras (§3), nesta ordem:
//   1. BLOQUEIO vence tudo, subindo a árvore: qualquer ancestral (incluindo o item) com modo 'bloquear'
//      → NEGADO (só equipe).
//   2. VISIBILIDADE: item.oculto === true → NEGADO.
//   3. REGRA que vale: o próprio item se modo 'propria'; senão o 1º ancestral com modo 'propria' ou
//      'principal' (fallback = raiz). Avalia atribuições (grupos/alunos) dentro da janela de datas.
//   4. PACOTES: gancho/stub (pacotes são fase posterior) — origens 'via_pacote' já resolvidas fora.
//   5. ENTREGAS DIRETAS do item (aba "Quem tem acesso"): atribuições do próprio item válidas agora.
//   PERMISSÕES = UNIÃO das permissões de todas as origens (se uma permite baixar, pode baixar).
//
// TOLERÂNCIA (preserva o comportamento atual): um nó/árvore SEM configuração (sem modo, sem
// atribuições, acessoGeral null/ausente) degrada para LIBERADO — exatamente como o gate atual
// (lib/conteudo/leitor.ts), onde "sem linhas = liberado a todos".

export type ModoAcesso = 'principal' | 'herdar' | 'propria' | 'bloquear'
export type Origem = 'via_pacote' | 'avulsa' | 'individual'
export type AcessoGeral = 'todos' | 'restrito' | null | undefined

export interface Permissoes {
  ler: boolean
  baixar: boolean
  grifar: boolean
}

/** Uma linha de atribuição (grupo OU aluno) com sua origem, janela e permissões. */
export interface Atribuicao {
  /** 'grupo' casa contra `aluno.grupos`; 'aluno' casa contra `aluno.estudanteId`. */
  tipo: 'grupo' | 'aluno'
  grupoId?: string | null
  estudanteId?: string | null
  /** Pacote entra como gancho; entregas diretas do app são 'avulsa'/'individual'. */
  origem?: Origem
  /** Janela de validade (inclusiva). null/ausente = aberto desse lado. */
  liberadoDe?: Date | string | null
  liberadoAte?: Date | string | null
  podeLer?: boolean | null
  podeBaixar?: boolean | null
  podeGrifar?: boolean | null
}

/** Nó da árvore de acesso (pasta OU documento). `ancestrais` vai do pai imediato até a raiz. */
export interface ItemAcesso {
  id: string
  /** null/undefined → tratado como 'herdar' (ou 'principal' se for raiz, i.e. sem ancestrais). */
  modo?: ModoAcesso | null
  /** Visibilidade desligada = negado. */
  oculto?: boolean | null
  /** acesso_geral do nível: 'todos' libera a todos; 'restrito' só atribuídos; null = padrão. */
  acessoGeral?: AcessoGeral
  /** Atribuições (grupos/alunos) deste nível. */
  atribuicoes?: Atribuicao[]
  /** Pai imediato → ... → raiz. */
  ancestrais?: ItemAcesso[]
}

export interface Aluno {
  estudanteId: string
  /** ids dos grupos do aluno. */
  grupos: string[]
}

/** Origem 'via_pacote' já resolvida externamente (pacotes = fase posterior). */
export interface OrigemPacote {
  origem: 'via_pacote'
  liberadoDe?: Date | string | null
  liberadoAte?: Date | string | null
  permissoes?: Partial<Permissoes>
}

export interface Contexto {
  /** Instante de referência (default = agora). */
  agora?: Date
  /** Gancho de pacotes: origens via_pacote já calculadas pelo módulo de pacotes. */
  origensPacote?: OrigemPacote[]
}

export type MotivoNegado = 'bloqueado' | 'oculto' | 'sem_origem'

export interface ResultadoAcesso {
  permitido: boolean
  origens: Origem[]
  permissoes: Permissoes
  motivo?: MotivoNegado
}

const PERM_ZERO: Permissoes = { ler: false, baixar: false, grifar: false }
const PERM_FULL: Permissoes = { ler: true, baixar: true, grifar: true }

function negar(motivo: MotivoNegado): ResultadoAcesso {
  return { permitido: false, origens: [], permissoes: { ...PERM_ZERO }, motivo }
}

function toDate(v: Date | string | null | undefined): Date | null {
  if (v == null) return null
  const d = v instanceof Date ? v : new Date(v)
  return isNaN(d.getTime()) ? null : d
}

/** agora ∈ [liberadoDe, liberadoAte] (bounds nulos = abertos). */
function dentroDaJanela(a: Atribuicao | OrigemPacote, agora: Date): boolean {
  const de = toDate(a.liberadoDe)
  const ate = toDate(a.liberadoAte)
  if (de && agora < de) return false
  if (ate && agora > ate) return false
  return true
}

function alunoCasa(a: Atribuicao, aluno: Aluno): boolean {
  if (a.tipo === 'grupo') return a.grupoId != null && aluno.grupos.includes(a.grupoId)
  if (a.tipo === 'aluno') return a.estudanteId != null && a.estudanteId === aluno.estudanteId
  return false
}

/** Permissões de uma atribuição (default = tudo liberado, como o gate atual sem restrição por linha). */
function permsDa(a: Atribuicao): Permissoes {
  return {
    ler: a.podeLer !== false,
    baixar: a.podeBaixar !== false,
    grifar: a.podeGrifar !== false,
  }
}

function unirPerms(acc: Permissoes, p: Permissoes): Permissoes {
  return { ler: acc.ler || p.ler, baixar: acc.baixar || p.baixar, grifar: acc.grifar || p.grifar }
}

/** modo normalizado: null/undefined → 'principal' se raiz (sem ancestrais), senão 'herdar'. */
function modoDe(item: ItemAcesso): ModoAcesso {
  if (item.modo) return item.modo
  return (item.ancestrais?.length ?? 0) === 0 ? 'principal' : 'herdar'
}

interface Grant { origem: Origem; permissoes: Permissoes }

/**
 * Avalia UM nível (pasta/doc) para o aluno, espelhando `nivelLibera` do gate atual + extraindo grants:
 *   - acessoGeral='todos'           → liberado a todos (grant base full).
 *   - acessoGeral=null + sem linhas → liberado a todos (padrão atual).
 *   - acessoGeral='restrito'        → só atribuições que casam (dentro da janela).
 *   - acessoGeral=null + com linhas → só atribuições que casam (dentro da janela).
 */
/** Grants das atribuições do nó que CASAM com o aluno e estão na janela (entregas explícitas, §5). */
function grantsCasados(node: ItemAcesso, aluno: Aluno, agora: Date): Grant[] {
  const grants: Grant[] = []
  for (const a of node.atribuicoes ?? []) {
    if (!alunoCasa(a, aluno)) continue
    if (!dentroDaJanela(a, agora)) continue
    grants.push({ origem: a.origem ?? 'avulsa', permissoes: permsDa(a) })
  }
  return grants
}

function avaliarNivel(node: ItemAcesso, aluno: Aluno, agora: Date): { liberado: boolean; grants: Grant[] } {
  const atribs = node.atribuicoes ?? []
  const geral = node.acessoGeral ?? null
  const grants = grantsCasados(node, aluno, agora)

  if (geral === 'todos') {
    // Liberado a todos: grant base full (além de quaisquer grants específicos já coletados).
    return { liberado: true, grants: grants.length ? grants : [{ origem: 'avulsa', permissoes: { ...PERM_FULL } }] }
  }
  if (geral === 'restrito') {
    return { liberado: grants.length > 0, grants }
  }
  // geral null: sem linhas → liberado a todos (padrão); com linhas → só quem casa.
  if (atribs.length === 0) {
    return { liberado: true, grants: [{ origem: 'avulsa', permissoes: { ...PERM_FULL } }] }
  }
  return { liberado: grants.length > 0, grants }
}

/** Seleciona o nó cuja regra vale: o item se 'propria', senão o 1º ancestral 'propria'|'principal' (fallback=raiz). */
function nodeDaRegra(item: ItemAcesso): ItemAcesso {
  if (modoDe(item) === 'propria') return item
  const anc = item.ancestrais ?? []
  for (const a of anc) {
    const m = modoDe(a)
    if (m === 'propria' || m === 'principal') return a
  }
  return anc.length ? anc[anc.length - 1] : item
}

/**
 * Acesso efetivo de um item para um aluno (handoff §3). Função pura e determinística.
 */
export function acessoEfetivo(item: ItemAcesso, aluno: Aluno, contexto: Contexto = {}): ResultadoAcesso {
  const agora = contexto.agora ?? new Date()

  // 1. Bloqueio vence tudo, subindo a árvore (item + ancestrais).
  const cadeia = [item, ...(item.ancestrais ?? [])]
  for (const n of cadeia) {
    if (modoDe(n) === 'bloquear') return negar('bloqueado')
  }

  // 2. Visibilidade do item.
  if (item.oculto === true) return negar('oculto')

  // 3. Regra que vale (própria do item ou herdada do 1º ancestral propria/principal).
  const regra = nodeDaRegra(item)
  const nivelRegra = avaliarNivel(regra, aluno, agora)

  const origensSet = new Set<Origem>()
  let perms: Permissoes = { ...PERM_ZERO }
  for (const g of nivelRegra.grants) {
    origensSet.add(g.origem)
    perms = unirPerms(perms, g.permissoes)
  }

  // 4. Pacotes (gancho/stub): origens via_pacote já resolvidas fora, validadas por janela aqui.
  for (const p of contexto.origensPacote ?? []) {
    if (!dentroDaJanela(p, agora)) continue
    origensSet.add('via_pacote')
    perms = unirPerms(perms, {
      ler: p.permissoes?.ler ?? true,
      baixar: p.permissoes?.baixar ?? true,
      grifar: p.permissoes?.grifar ?? true,
    })
  }

  // 5. Entregas diretas do próprio item (quando o item não é a regra, ex.: doc herdando mas com entrega
  //    própria). SÓ atribuições casadas EXPLÍCITAS — nunca o "liberado por padrão" do item, que já foi
  //    decidido pela regra herdada (senão um item herdando negado seria re-liberado indevidamente).
  if (regra !== item) {
    for (const g of grantsCasados(item, aluno, agora)) {
      origensSet.add(g.origem)
      perms = unirPerms(perms, g.permissoes)
    }
  }

  const permitido = nivelRegra.liberado || origensSet.size > 0
  if (!permitido) return negar('sem_origem')

  // Se liberado "por padrão/todos" sem nenhuma origem específica, origem canônica = 'avulsa' c/ perms cheias.
  if (origensSet.size === 0) {
    origensSet.add('avulsa')
    perms = unirPerms(perms, { ...PERM_FULL })
  }

  return { permitido: true, origens: [...origensSet], permissoes: perms }
}
