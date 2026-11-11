import 'server-only'
// "Meus cronogramas" (fonte única em /aluno/cronograma): une os planos ADAPTATIVOS e as emissões do
// cronograma REVISÃO (padrão/catálogo) numa lista só, já ordenada, filtrada, paginada e com datas
// formatadas. Só LÊ — a página e os componentes apenas renderizam (backend-first).
import { createAdminClient } from '@/lib/supabase/server'
import { resolverInterno } from '@/lib/aluno/interno-gate'
import { listarPlanosAdaptativo } from '@/lib/cronograma/adaptativo/dados'
import { cronogramasDoAluno, type CronogramaDoAluno } from '@/lib/cronograma/acesso'
import { listarEmissoesResumo, type EmissaoResumoLista } from '@/lib/cronograma/padrao-resumo'

export type TipoCronograma = 'adaptativo' | 'revisao'

export type ItemCronograma = {
  id: string
  tipo: TipoCronograma
  titulo: string
  criadoEm: string
  atualizadoEm: string
  /** Datas já formatadas (pt-BR, fuso do Brasil). */
  criadoEmFmt: string
  atualizadoEmFmt: string
  fixado?: boolean
  /** 0–100, quando o tipo expõe progresso. */
  progresso?: number
  /** Destino do "Abrir" quando não precisa de ação prévia (Revisão). Adaptativo abre via API (fixar) + ?ver=adaptativo. */
  href: string
}

export type ModeloCronograma = {
  id: string
  nome: string
  subtitulo: string | null
  cargaHoraria: number | null
  totalSemanas: number | null
}

export type TiposDisponiveis = { revisao: boolean; adaptativo: boolean }

export type OrdemMeus = 'recentes' | 'antigos' | 'nome'

export type MeusCronogramas = {
  itens: ItemCronograma[] // página atual
  total: number // no filtro
  totalGeral: number // sem filtro (para estado vazio × "nada encontrado")
  pagina: number
  porPagina: number
  modelos: ModeloCronograma[]
  /** Forma original do loader do A2 — é o que o <CronogramaClient/> espera em `modelos`. */
  modelosBrutos: CronogramaDoAluno[]
  tipos: TiposDisponiveis
}

export const POR_PAGINA_MEUS = 12

const fmtData = (iso: string | null | undefined): string => {
  if (!iso) return ''
  try {
    return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Fortaleza', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso))
  } catch {
    return ''
  }
}

export async function carregarMeusCronogramas(
  tenantId: string,
  estudanteId: string,
  opts: { q?: string; ord?: OrdemMeus; pagina?: number } = {},
): Promise<MeusCronogramas> {
  const svc = createAdminClient()
  const it = await resolverInterno()
  // Adaptativo existe hoje só na marca 'revisao' (visual interno ligado).
  const adaptativoOk = it.ativo && it.brand === 'revisao'

  const { data: cfg } = await svc.from('simulado_cronograma_config').select('ativo').eq('tenant_id', tenantId).maybeSingle()
  const moduloOn = !!(cfg as { ativo?: boolean } | null)?.ativo

  const [planos, modelosRaw, emissoesRaw] = await Promise.all([
    adaptativoOk ? listarPlanosAdaptativo(svc, tenantId, estudanteId).catch(() => []) : Promise.resolve([]),
    moduloOn ? cronogramasDoAluno(svc, tenantId, estudanteId).catch(() => [] as CronogramaDoAluno[]) : Promise.resolve([] as CronogramaDoAluno[]),
    moduloOn ? listarEmissoesResumo(tenantId, estudanteId).catch(() => [] as EmissaoResumoLista[]) : Promise.resolve([] as EmissaoResumoLista[]),
  ])

  const modelos: ModeloCronograma[] = modelosRaw.map((m) => ({
    id: m.id, nome: m.nome, subtitulo: m.subtitulo ?? null,
    cargaHoraria: m.carga_horaria ?? null, totalSemanas: m.total_semanas ?? null,
  }))

  const todos: ItemCronograma[] = []
  for (const p of planos) {
    todos.push({
      id: p.id, tipo: 'adaptativo', titulo: p.titulo?.trim() || 'Meu cronograma',
      criadoEm: p.criado_em, atualizadoEm: p.atualizado_em || p.criado_em,
      criadoEmFmt: fmtData(p.criado_em), atualizadoEmFmt: fmtData(p.atualizado_em || p.criado_em),
      fixado: !!p.fixado, href: '/aluno/cronograma?ver=adaptativo',
    })
  }
  for (const e of emissoesRaw) {
    todos.push({
      id: e.id, tipo: 'revisao', titulo: (e.titulo || 'Cronograma').trim(),
      criadoEm: e.criadoEm, atualizadoEm: e.atualizadoEm || e.criadoEm,
      criadoEmFmt: fmtData(e.criadoEm), atualizadoEmFmt: fmtData(e.atualizadoEm || e.criadoEm),
      fixado: !!e.fixado, href: `/aluno/cronograma/${e.id}`,
    })
  }

  // busca + ordenação (no servidor)
  const q = (opts.q ?? '').trim().toLowerCase()
  const ord: OrdemMeus = opts.ord ?? 'recentes'
  const filtrados = q ? todos.filter((i) => i.titulo.toLowerCase().includes(q)) : todos
  const porData = (a: ItemCronograma, b: ItemCronograma) => (b.atualizadoEm || '').localeCompare(a.atualizadoEm || '')
  filtrados.sort((a, b) => {
    if (a.fixado !== b.fixado) return a.fixado ? -1 : 1 // o fixado (principal) sempre primeiro
    if (ord === 'nome') return a.titulo.localeCompare(b.titulo, 'pt-BR')
    if (ord === 'antigos') return -porData(a, b)
    return porData(a, b)
  })

  const porPagina = POR_PAGINA_MEUS
  const paginas = Math.max(1, Math.ceil(filtrados.length / porPagina))
  const pagina = Math.min(Math.max(opts.pagina ?? 0, 0), paginas - 1)

  return {
    itens: filtrados.slice(pagina * porPagina, (pagina + 1) * porPagina),
    total: filtrados.length,
    totalGeral: todos.length,
    pagina,
    porPagina,
    modelos,
    modelosBrutos: modelosRaw,
    tipos: { revisao: moduloOn && modelos.length > 0, adaptativo: adaptativoOk },
  }
}
