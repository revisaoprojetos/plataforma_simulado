// Mapeia os dados REAIS do portal (/aluno) para o contrato `HomeData` da home redesenhada.
// Primeira passada do wiring: preenche o que já existe na home atual (nome, nível/XP, sequência,
// missões, recentes, pastas, destaques). Campos ainda não disponíveis nesta página (desempenho por
// matéria, agenda do cronograma, stats de resumo completas) ficam vazios/0 — serão ligados depois.

import type { HomeData, HomeSimuladoCard, HomePasta, HomeDestaque } from '@/components/brand/interna/home/types'

function iniciaisDe(nome: string): string {
  const ps = (nome || '').trim().split(/\s+/).filter(Boolean)
  if (!ps.length) return '—'
  return (ps[0][0] + (ps.length > 1 ? ps[ps.length - 1][0] : '')).toUpperCase()
}

export function montarHomeData(args: {
  nomeCompleto: string
  gamResumo: any | null
  gamMissoes: any[]
  gamSemana: any[]
  recentes: any[]
  grupos: any[]
  progresso: Record<string, { done: number; total: number }>
  /** Destaques REAIS da plataforma (banners de imagem + banners de simulado), já ordenados. */
  destaquesReais: HomeDestaque[]
  feitos: number
  /** KPIs reais do resumo: total de questões objetivas respondidas e taxa de acerto (%) do aluno. */
  questoesResolvidas?: number
  taxaAcerto?: number
  chest?: { xp?: number; cada_n_dias?: number } | null
  /** Posição do aluno na sua liga (1-based). 0 = sem posição. */
  posicaoLiga?: number
  /** Cargos/áreas p/ o texto rotativo "Rumo a …" (configurável por tenant em tema.hero_rotativo). */
  rotativo?: string[]
  /** Marca do tenant — ajusta o slide de boas-vindas (Revisão = redesign; demais = plataforma nova). */
  brand?: string
  /** Gamificação ligada p/ este aluno (false → home esconde XP/nível/sequência/missões/liga). */
  gamAtivo?: boolean
  /** Cronograma ativo no tenant (false → home esconde o card "Sua semana"). */
  cronogramaAtivo?: boolean
}): HomeData {
  const { nomeCompleto, gamResumo, gamMissoes, gamSemana, recentes, grupos, progresso, destaquesReais, feitos, questoesResolvidas, taxaAcerto, chest, posicaoLiga, rotativo, gamAtivo, cronogramaAtivo, brand } = args
  const rotativoLimpo = (rotativo ?? []).map((r) => (r ?? '').trim()).filter(Boolean)
  const primeiro = (nomeCompleto || 'Aluno').split(' ')[0]
  const prog = gamResumo?.progresso ?? null

  const recentesCards: HomeSimuladoCard[] = (recentes ?? []).map((i: any) => ({
    id: String(i.id),
    titulo: i.titulo ?? 'Simulado',
    // Imagem REAL do simulado (capa do card). Fallback p/ o banner largo; sem imagem → gradiente+texto.
    capa: { rotulo: (i.titulo ?? 'Simulado').slice(0, 18), sub: i.banca ?? '', cores: i.vis?.cor ?? undefined, capa: i.vis?.capa ?? i.vis?.capaBanner ?? null },
    tipo: i.refazer ? 'Prova real' : 'Inédito',
    banca: i.banca ?? '',
    status: i.statusLabel ?? (i.emAndamento ? 'Em andamento' : i.refazer ? 'Concluído' : 'Não iniciado'),
    progresso: typeof i.progresso === 'number' ? i.progresso : 0,
    cadernoUrl: i.enunciadoUrl ?? undefined,
    fazerUrl: i.embed_token ? `/simulado/${i.embed_token}` : null,
  }))

  const pastas: HomePasta[] = (grupos ?? []).map((g: any) => ({
    id: String(g.id),
    nome: g.nome ?? 'Pasta',
    rotuloCapa: (g.nome ?? 'Pasta').slice(0, 14),
    subCapa: '',
    qtdSimulados: progresso[g.id]?.total ?? 0,
    concluidos: progresso[g.id]?.done ?? 0,
    categoria: 'todas',
    capa: g.capaCard ?? g.capa ?? null,
    cor: g.cor ?? null,
  }))

  // Slide de boas-vindas + os banners REAIS da plataforma (imagem/simulado).
  // Revisão JÁ existia → "de cara nova" (redesign). Demais marcas (VND/MEQ) são plataformas NOVAS
  // (não existiam antes) → texto de lançamento, sem sugerir que houve uma versão anterior.
  const plataformaNova = brand !== 'revisao'
  const caraNova: HomeDestaque = {
    eyebrow: 'NOVIDADE',
    titulo: plataformaNova ? 'Plataforma nova!' : 'A plataforma está de cara nova!',
    subtitulo: plataformaNova
      ? 'Sua nova plataforma de estudos para a aprovação. Explore à vontade.'
      : 'Um novo visual para você estudar melhor. Explore à vontade.',
    chips: [plataformaNova ? 'Novidade' : 'Novo visual'],
    cta: { rotulo: 'Explorar', url: '/aluno' },
    cores: 'linear-gradient(135deg,#2E1F7A,#4A31B8 55%,#7356E6)',
    // Slide institucional: sem botões, visual limpo (só título/animação).
    semAcoes: true,
  }
  // Boas-vindas: VND e MEQ usam um BANNER REAL (admin → Banners & Pop-ups), editável/removível —
  // não injeta o hardcoded aqui (senão duplicaria com o banner semeado). Só a Revisão mantém o
  // slide de boas-vindas vindo do código.
  const destaques: HomeDestaque[] = brand === 'revisao'
    ? [caraNova, ...(destaquesReais ?? [])]
    : [...(destaquesReais ?? [])]

  const emAndamento = (recentes ?? []).find((i: any) => i.emAndamento)
  const continuar = emAndamento
    ? {
        simuladoId: String(emAndamento.id),
        titulo: emAndamento.titulo ?? 'Simulado',
        capa: { rotulo: (emAndamento.titulo ?? 'Simulado').slice(0, 18), sub: emAndamento.banca ?? '' },
        questaoAtual: emAndamento.questaoAtual ?? 0,
        totalQuestoes: emAndamento.totalQuestoes ?? 0,
        tempoRestante: emAndamento.quando ?? '',
        ultimaAtividade: '',
        cadernoUrl: emAndamento.enunciadoUrl ?? undefined,
      }
    : null

  return {
    ...(rotativoLimpo.length ? { rotativo: rotativoLimpo } : {}),
    gamAtivo: gamAtivo !== false,
    cronogramaAtivo: cronogramaAtivo !== false,
    usuario: {
      nome: primeiro,
      iniciais: iniciaisDe(nomeCompleto),
      nivel: gamResumo?.nivel ?? 1,
      tituloNivel: prog?.titulo ?? '',
      proximoTitulo: '',
      xpNivelAtual: prog?.xpNoNivel ?? 0,
      xpNivelMax: prog?.xpDoNivel ?? 0,
      xpTotal: gamResumo?.xpTotal ?? 0,
      liga: gamResumo?.liga?.nome ?? '',
      posicaoLiga: posicaoLiga ?? 0,
      xpParaProximaLiga: gamResumo?.proxima ? Math.max(0, (gamResumo.proxima.xp_min ?? 0) - (gamResumo.xpTotal ?? 0)) : 0,
      plano: '',
    },
    sequenciaMeta: {
      diasSeguidos: gamResumo?.streakAtual ?? 0,
      recordeDias: gamResumo?.streakMaior ?? 0,
      semana: (gamSemana ?? []).map((d: any) => ({ dia: d.label ?? '', estudou: !!d.ativo })),
      checkinHoje: !!gamResumo?.feitoHoje,
      metaDiariaXp: gamResumo?.metaDiaXp ?? 0,
      xpHoje: gamResumo?.xpHoje ?? 0,
      bauDias: chest?.cada_n_dias ?? 0,
      bauXp: chest?.xp ?? 0,
    },
    missoes: (gamMissoes ?? []).map((m: any) => ({
      titulo: m.def?.titulo ?? 'Missão',
      xp: m.def?.xp ?? 0,
      progresso: m.progresso ?? 0,
      total: m.def?.meta ?? 0,
    })),
    renovaEm: 'meia-noite',
    continuar,
    resumo: { simuladosFeitos: feitos ?? 0, questoesResolvidas: questoesResolvidas ?? 0, taxaAcerto: taxaAcerto ?? 0, pendentes: 0 },
    desempenho: [],
    pontoAtencao: '',
    agenda: [],
    destaques,
    recentes: recentesCards,
    pastas,
    outros: [],
    outrosDisponiveis: 0,
  }
}
