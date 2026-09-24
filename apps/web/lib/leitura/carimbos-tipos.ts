// Tipos + helpers PUROS dos carimbos (client-safe — sem server-only). A lógica de banco fica em
// carimbos.ts (server-only).
export type CarimboCondicaoTipo = 'concluir_modulo' | 'gabaritar_modulo' | 'concluir_aulas' | 'gabaritar_aulas' | 'concluir_aula' | 'gabaritar_aula'
/**
 * Onde o carimbo aparece:
 *  'no'    = grudado no NÓ (balão/dia) da aula na trilha — x/y = deslocamento (px) do centro do nó.
 *  'card'  = no BALÃO DE CONTEÚDO (pop-up que abre ao clicar na aula) — x/y = desloc. (px) do canto sup. direito.
 *  'livre' = flutuando num ponto da trilha — x/y = % do contêiner.
 */
export type CarimboAlvo = 'no' | 'card' | 'livre'
export interface CarimboDef {
  id: string
  url: string | null          // imagem (PNG transparente)
  titulo: string              // ex.: "Concluiu o desafio"
  texto: string               // ex.: "Participou do Desafio de Lei Seca"
  // Condição: para "aula(s) específica(s)" o escopo é um multi-select (todas menos as ocultas, ou específicas).
  condicao: { tipo: CarimboCondicaoTipo; meta: number; aulaModo?: 'todas' | 'especificas'; aulaIds?: string[] }
  alvo: CarimboAlvo           // no nó/dia, no balão de conteúdo ou local livre na trilha
  // Em quais aulas aparece (alvo 'no'/'card'): 'todas' as aulas (padrão) ou 'especificas'.
  //   'todas'       → `alvoAulaIds` = aulas a OCULTAR (filtro).
  //   'especificas' → `alvoAulaIds` = aulas onde aparece.
  alvoModo: 'todas' | 'especificas'
  alvoAulaIds: string[]
  // Sobreposição (nó/card): na FRENTE do texto/botões (padrão) ou ATRÁS deles.
  sobreposicao: 'frente' | 'atras'
  // Recortar dentro da área (nó/card): se true, o que passar da borda do balão/nó fica cortado.
  recortar: boolean
  // Posição/rotação/tamanho. livre: x/y = % do container. no/card: x/y = deslocamento (px).
  x: number
  y: number
  rotacao: number             // graus
  tamanho: number             // px (aresta do carimbo)
}

export const CONDICAO_LABEL: Record<CarimboCondicaoTipo, string> = {
  concluir_modulo: 'Concluir o módulo (todas as aulas)',
  gabaritar_modulo: 'Gabaritar o módulo (100% em todas)',
  concluir_aulas: 'Concluir N aulas',
  gabaritar_aulas: 'Gabaritar N aulas',
  concluir_aula: 'Concluir aula(s) (leitura + questões)',
  gabaritar_aula: 'Gabaritar aula(s) (100% do quiz)',
}
export const CONDICAO_TIPOS: CarimboCondicaoTipo[] = ['concluir_modulo', 'gabaritar_modulo', 'concluir_aulas', 'gabaritar_aulas', 'concluir_aula', 'gabaritar_aula']
export const usaMeta = (t: CarimboCondicaoTipo) => t === 'concluir_aulas' || t === 'gabaritar_aulas'
export const usaAula = (t: CarimboCondicaoTipo) => t === 'concluir_aula' || t === 'gabaritar_aula'

/** Resolve o conjunto de aulas de um escopo (condição por aula ou placement): 'todas' menos as marcadas,
 *  ou apenas as marcadas ('especificas'). `allIds` = todas as aulas do módulo. */
export function resolverEscopoAulas(modo: 'todas' | 'especificas' | undefined, ids: string[] | undefined, allIds: string[]): string[] {
  const marcados = ids ?? []
  if (modo === 'especificas') return marcados.filter((id) => allIds.includes(id))
  return allIds.filter((id) => !marcados.includes(id))
}

/** Normaliza o par (aulaModo, aulaIds) — usado na condição por aula. */
export function normEscopo(rawModo: any, rawIds: any, rawSingle: any): { modo: 'todas' | 'especificas'; ids: string[] } {
  const modo: 'todas' | 'especificas' = rawModo === 'especificas' ? 'especificas' : rawModo === 'todas' ? 'todas' : (typeof rawSingle === 'string' && rawSingle ? 'especificas' : 'todas')
  const ids = Array.isArray(rawIds) ? rawIds.filter((x: any) => typeof x === 'string' && x) : (typeof rawSingle === 'string' && rawSingle ? [rawSingle] : [])
  return { modo, ids }
}

const uid = () => 'c_' + Math.random().toString(36).slice(2, 9)
function clamp(v: number, min: number, max: number, def: number): number {
  return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def
}

/** Normaliza a lista de carimbos do jsonb (tolerante a formatos parciais). */
export function normalizarCarimbos(raw: unknown): CarimboDef[] {
  if (!Array.isArray(raw)) return []
  return raw.slice(0, 30).map((r: any) => {
    const tipo: CarimboCondicaoTipo = CONDICAO_TIPOS.includes(r?.condicao?.tipo) ? r.condicao.tipo : 'concluir_modulo'
    // Compat: 'balao' (versão anterior) → 'no'. Carimbos antigos (sem `alvo`) eram posicionados por % → 'livre'.
    const alvo: CarimboAlvo = r?.alvo === 'card' ? 'card' : (r?.alvo === 'no' || r?.alvo === 'balao') ? 'no' : 'livre'
    const defX = alvo === 'no' ? 26 : alvo === 'card' ? 0 : 78
    const defY = alvo === 'no' ? -26 : alvo === 'card' ? 0 : 8
    const esc = normEscopo(r?.condicao?.aulaModo, r?.condicao?.aulaIds, r?.condicao?.aulaId)
    return {
      id: typeof r?.id === 'string' && r.id ? r.id : uid(),
      url: typeof r?.url === 'string' && r.url ? r.url : null,
      titulo: typeof r?.titulo === 'string' ? r.titulo.slice(0, 80) : 'Carimbo',
      texto: typeof r?.texto === 'string' ? r.texto.slice(0, 200) : '',
      condicao: { tipo, meta: Math.max(1, Math.round(Number(r?.condicao?.meta) || 1)), aulaModo: esc.modo, aulaIds: esc.ids },
      alvo,
      // Migração: 'alvoAulaId' (única, versão anterior) → 'especificas' [aquela aula]. Padrão novo = 'todas'.
      alvoModo: r?.alvoModo === 'especificas' ? 'especificas' : r?.alvoModo === 'todas' ? 'todas' : (typeof r?.alvoAulaId === 'string' && r.alvoAulaId ? 'especificas' : 'todas'),
      alvoAulaIds: Array.isArray(r?.alvoAulaIds) ? r.alvoAulaIds.filter((x: any) => typeof x === 'string' && x) : (typeof r?.alvoAulaId === 'string' && r.alvoAulaId ? [r.alvoAulaId] : []),
      sobreposicao: r?.sobreposicao === 'atras' ? 'atras' : 'frente',
      recortar: r?.recortar === true,
      x: clamp(Number(r?.x), -150, 200, defX),
      y: clamp(Number(r?.y), -150, 200, defY),
      rotacao: clamp(Number(r?.rotacao), -180, 180, -12),
      tamanho: clamp(Number(r?.tamanho), 24, 160, 56),
    }
  })
}

export function carimboNovo(): CarimboDef {
  return { id: uid(), url: null, titulo: 'Novo carimbo', texto: '', condicao: { tipo: 'concluir_modulo', meta: 1, aulaModo: 'todas', aulaIds: [] }, alvo: 'no', alvoModo: 'todas', alvoAulaIds: [], sobreposicao: 'frente', recortar: false, x: 26, y: -26, rotacao: -12, tamanho: 56 }
}

/** Estampa resolvida (carimbo GANHO ancorado a uma aula concreta) — passada à trilha para desenhar no
 *  nó/dia ('no') ou no balão de conteúdo ('card'). */
export interface CarimboEstampa { id: string; aulaId: string; url: string; alvo: 'no' | 'card'; sobreposicao: 'frente' | 'atras'; recortar: boolean; x: number; y: number; rotacao: number; tamanho: number }

// ── Conquistas PRÓPRIAS do módulo ─────────────────────────────────────────────
// Irmãs dos carimbos, mas no formato "conquista" (ícone + cor, sem imagem/posição). São ganhas pela
// mesma condição de progresso do módulo e aparecem na coleção de conquistas do aluno + na gamificação.
export interface ModuloConquistaDef {
  id: string
  titulo: string
  descricao: string           // texto exibido (ex.: "Participou do Desafio de Lei Seca")
  icone: string               // chave do catálogo ICONES_CONQUISTA (ex.: 'trophy')
  cor?: string                // hex opcional (fallback determinístico por id)
  xp: number                  // XP concedido ao desbloquear (só com a gamificação ativa)
  condicao: { tipo: CarimboCondicaoTipo; meta: number; aulaModo?: 'todas' | 'especificas'; aulaIds?: string[] }
}

const uidC = () => 'mc_' + Math.random().toString(36).slice(2, 9)

/** Normaliza a lista de conquistas do módulo (tolerante a formatos parciais). */
export function normalizarConquistasModulo(raw: unknown): ModuloConquistaDef[] {
  if (!Array.isArray(raw)) return []
  return raw.slice(0, 40).map((r: any) => {
    const tipo: CarimboCondicaoTipo = CONDICAO_TIPOS.includes(r?.condicao?.tipo) ? r.condicao.tipo : 'concluir_modulo'
    return {
      id: typeof r?.id === 'string' && r.id ? r.id : uidC(),
      titulo: typeof r?.titulo === 'string' ? r.titulo.slice(0, 80) : 'Nova conquista',
      descricao: typeof r?.descricao === 'string' ? r.descricao.slice(0, 200) : '',
      icone: typeof r?.icone === 'string' && r.icone ? r.icone : 'trophy',
      cor: typeof r?.cor === 'string' && r.cor ? r.cor : undefined,
      xp: Math.max(0, Math.round(Number(r?.xp) || 0)),
      condicao: (() => { const e = normEscopo(r?.condicao?.aulaModo, r?.condicao?.aulaIds, r?.condicao?.aulaId); return { tipo, meta: Math.max(1, Math.round(Number(r?.condicao?.meta) || 1)), aulaModo: e.modo, aulaIds: e.ids } })(),
    }
  })
}

export function conquistaModuloNova(): ModuloConquistaDef {
  return { id: uidC(), titulo: 'Nova conquista', descricao: '', icone: 'trophy', cor: undefined, xp: 20, condicao: { tipo: 'concluir_modulo', meta: 1, aulaModo: 'todas', aulaIds: [] } }
}
