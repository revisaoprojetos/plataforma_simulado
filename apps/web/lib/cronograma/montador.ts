/**
 * Montador automático de cronograma a partir de CONTEÚDOS selecionados (Banco de Conteúdos).
 *
 * Módulo PURO (sem I/O) — roda igual no cliente (prévia ao vivo) e no servidor. Ele NÃO data
 * nem reprograma: produz as METAS "de catálogo" (semana/dia/tipo/…) que depois passam pelo
 * `gerarGrade` como qualquer cronograma montado à mão.
 *
 * Reproduz o padrão do cronograma-modelo (o PDF de referência):
 *  - Cada disciplina é ESPALHADA uniformemente na sua faixa de semanas (revezamento), com um
 *    teto de N lições por semana — disciplinas com mais aulas aparecem mais vezes, e todas
 *    terminam espalhadas até o fim (não "esvaziam" no começo).
 *  - As demais linhas (ex.: Resolução de Questões) são DERIVADAS por deslocamento de semanas:
 *    a linha de Resolução da semana W referencia as LIÇÕES colocadas na semana de conteúdo
 *    anterior (offset 1). Consequência automática: a **semana 1 tem só a linha de lição**
 *    (não há semana anterior para a Resolução referenciar).
 *  - Cada lição ocupa 2 dias (lição + "CONTINUAÇÃO AULA NN DISCIPLINA"); a Resolução senta no
 *    2º dia (mesma coluna da continuação), como no modelo.
 *
 * Editar a DURAÇÃO ou o TIPO de uma linha reflete em TODAS as semanas de uma vez — porque a
 * duração vem da configuração da linha, não de cada célula.
 */

import { SLUG_PDF, SLUG_VIDEO } from './tipos'

/** R11 — aula é TEXTO; "01" e "1" são a MESMA aula. Chave de casamento normalizada. */
export function chaveAulaMontador(aula: string): string {
  const t = (aula ?? '').trim()
  if (!t) return ''
  return /^\d+$/.test(t) ? String(Number(t)) : t.toLowerCase()
}

/** Conteúdo/links de uma aula, para um tipo específico, como está no banco. */
export type DadoAula = {
  /** A aula EXATA gravada no banco para este tipo ("01" na lição, "1" na resolução…). */
  aulaReal: string
  conteudo: string | null
  tema: string | null
  /** slug da plataforma → url. */
  urls: Record<string, string>
  /** IDs das questões anexadas a esta aula (viram meta_questoes). */
  questaoIds?: string[]
  /** Videoaula da aula — vira um link sob a plataforma "Vídeo". */
  videoUrl?: string | null
}

/** Uma disciplina selecionada para montar (com sua sequência de aulas e a faixa de semanas). */
export type ConteudoMontagem = {
  disciplina: string
  disciplina_id: string | null
  /** Faixa de semanas (1-based, inclusive) em que esta disciplina aparece. */
  semInicio: number
  semFim: number
  /** Sequência de aulas-lição, na ordem, já como CHAVE normalizada ("1","2","1.1"…). */
  aulas: string[]
  /** dados[chaveAula][tipoSlug] → conteúdo/links daquela aula naquele tipo. */
  dados: Record<string, Record<string, DadoAula>>
}

/** Uma "linha" da grade (um tipo de meta): duração + deslocamento + comportamento. */
export type LinhaMontagem = {
  tipo: string
  duracao: string | null
  /** 0 = lição (semana atual); 1 = referencia as lições da semana de conteúdo anterior. */
  offset: number
  /** Ocupa 2 dias (lição + continuação). */
  continuacao: boolean
  /** Usa os links de questões da aula (Resolução). */
  usaLinks: boolean
  /**
   * Só emite meta onde a aula TEM conteúdo deste tipo no banco (LegProc é esparso: "Aula 4 tem
   * legproc", as outras não). Sem isto, uma linha esparsa criaria linhas vazias em toda semana.
   */
  somenteComDado?: boolean
}

export type ConfigMontagem = {
  totalSemanas: number
  semanasRevisao: number[]
  /** Dias por semana (tamanho de `dias_nome`). */
  diasCount: number
  /** Teto de lições novas por semana (o modelo usa 3). */
  aulasPorSemana: number
  linhas: LinhaMontagem[]
}

export type MetaMontada = {
  semana: number
  dia: number
  tipo: string
  disciplina: string
  disciplina_id: string | null
  aula: string | null
  conteudo: string | null
  duracao: string | null
  ordem: number
  /** Questões anexadas à aula (só na meta principal) — viram meta_questoes ao salvar. */
  questaoIds?: string[]
}

export type LinkMontado = {
  disciplina: string
  disciplina_id: string | null
  aula: string
  tema: string
  urls: Record<string, string>
}

/** Uma lição colocada numa semana (para a prévia "de qual semana até qual semana"). */
export type LicaoColocada = { semana: number; disciplina: string; disciplina_id: string | null; aula: string }

export type ResultadoMontagem = {
  metas: MetaMontada[]
  links: LinkMontado[]
  avisos: string[]
  /** Lições por semana de conteúdo, na ordem (para desenhar a prévia). */
  colocacao: LicaoColocada[]
}

/** Semanas de conteúdo (1..total, exceto revisão), na ordem — cada uma é uma "coluna" da pauta. */
export function semanasDeConteudo(totalSemanas: number, semanasRevisao: number[]): number[] {
  const rev = new Set(semanasRevisao)
  const out: number[] = []
  for (let s = 1; s <= Math.max(0, totalSemanas); s++) if (!rev.has(s)) out.push(s)
  return out
}

type Evento = { disciplina: string; disciplina_id: string | null; aulaKey: string; ordemConteudo: number }

/**
 * Distribui as lições nas semanas de conteúdo: cada disciplina espalha suas aulas
 * uniformemente na sua faixa (alvo = início + ⌊k·W/n⌋), depois empacota por semana com
 * teto `aulasPorSemana`, empurrando o excedente para a próxima semana (overflow adiante).
 * Retorna, por índice de semana-de-conteúdo, a lista ordenada de lições daquela semana.
 */
function distribuirLicoes(config: ConfigMontagem, conteudos: ConteudoMontagem[], CW: number[]): { porSemana: Evento[][]; avisos: string[] } {
  const avisos: string[] = []
  const idxDe = new Map(CW.map((w, i) => [w, i]))
  const baldes: Evento[][] = CW.map(() => [])

  conteudos.forEach((c, ordemConteudo) => {
    const ativas = CW.filter((w) => w >= c.semInicio && w <= c.semFim)
    const n = c.aulas.length
    if (!ativas.length || !n) return
    for (let k = 0; k < n; k++) {
      const ti = Math.min(Math.floor((k * ativas.length) / n), ativas.length - 1)
      // `ordemConteudo` estabiliza o revezamento dentro da semana (mantém a ordem de seleção).
      baldes[idxDe.get(ativas[ti])!].push({ disciplina: c.disciplina, disciplina_id: c.disciplina_id, aulaKey: c.aulas[k], ordemConteudo })
    }
  })

  // Empacota com teto + overflow adiante; dentro da semana, ordena por ordem do conteúdo.
  const porSemana: Evento[][] = CW.map(() => [])
  let carry: Evento[] = []
  for (let i = 0; i < CW.length; i++) {
    const pool = [...carry, ...baldes[i]].sort((a, b) => a.ordemConteudo - b.ordemConteudo)
    porSemana[i] = pool.slice(0, config.aulasPorSemana)
    carry = pool.slice(config.aulasPorSemana)
  }
  if (carry.length) {
    // Não coube no horizonte: distribui o resto nas últimas semanas (acima do teto) e avisa.
    let i = CW.length - 1
    for (const ev of carry) {
      porSemana[i].push(ev)
      i = i > 0 ? i - 1 : CW.length - 1
    }
    avisos.push(
      `As disciplinas selecionadas somam mais aulas do que ${config.aulasPorSemana}×${CW.length} semanas comportam — ${carry.length} lição(ões) foram empurradas para as últimas semanas. Aumente as semanas ou reduza os conteúdos.`,
    )
  }
  return { porSemana, avisos }
}

/** Monta metas + links a partir dos conteúdos e da configuração de linhas. */
export function montarPorConteudos(config: ConfigMontagem, conteudos: ConteudoMontagem[]): ResultadoMontagem {
  const CW = semanasDeConteudo(config.totalSemanas, config.semanasRevisao)
  const metas: MetaMontada[] = []
  // (disciplina, aula) → link acumulado. Um Map (em vez de Set + push) para MESCLAR os links de
  // questões (QC/TEC) e a videoaula numa mesma entrada quando a lição e a resolução dividem a aula.
  const linkPorChave = new Map<string, LinkMontado>()
  const colocacao: LicaoColocada[] = []

  const linkDe = (disc: string, discId: string | null, aula: string, tema: string): LinkMontado => {
    const chave = `${disc}||${aula}`
    let l = linkPorChave.get(chave)
    if (!l) {
      l = { disciplina: disc, disciplina_id: discId, aula, tema, urls: {} }
      linkPorChave.set(chave, l)
    }
    if (!l.tema && tema) l.tema = tema
    return l
  }

  if (!CW.length || !conteudos.length) return { metas, links: [], avisos: [], colocacao }

  const { porSemana, avisos } = distribuirLicoes(config, conteudos, CW)
  // 1 aula por dia (passo=1) é o padrão: todos os dias ganham lição de verdade. Só quando alguma
  // linha usa "continuação" volta ao passo=2 (a lição ocupa 2 dias: aula + CONTINUAÇÃO).
  const passo = config.linhas.some((l) => l.continuacao) ? 2 : 1
  const porDisciplina = new Map(conteudos.map((c) => [c.disciplina, c]))
  const dadoDe = (disc: string, aulaKey: string, tipo: string): DadoAula | null =>
    porDisciplina.get(disc)?.dados[aulaKey]?.[tipo] ?? null
  // A 1ª linha é a LIÇÃO base — é a aula "de verdade". As linhas derivadas (PDFlash, Resolução)
  // reexibem essa mesma aula em semanas seguintes (offset), então caem no conteúdo dela.
  const baseTipo = config.linhas[0]?.tipo

  // Prévia: lições na ordem em que caíram.
  porSemana.forEach((licoes, i) =>
    licoes.forEach((ev) => colocacao.push({ semana: CW[i], disciplina: ev.disciplina, disciplina_id: ev.disciplina_id, aula: ev.aulaKey })),
  )

  for (const linha of config.linhas) {
    for (let i = 0; i < CW.length; i++) {
      const iFonte = i - linha.offset
      if (iFonte < 0) continue // semana 1 (offset 1) não tem fonte → Resolução não aparece
      const semana = CW[i]
      porSemana[iFonte].forEach((ev, j) => {
        const col = j * passo
        // Dado próprio da linha; se não houver (ex.: PDFlash sem conteúdo de flash), reexibe a
        // lição base. LegProc (somenteComDado) é sequência à parte e NÃO cai na lição.
        const proprio = dadoDe(ev.disciplina, ev.aulaKey, linha.tipo)
        const dado = proprio ?? (linha.somenteComDado ? null : dadoDe(ev.disciplina, ev.aulaKey, baseTipo))
        // Linha esparsa (LegProc): só entra onde a aula realmente tem esse conteúdo no banco.
        if (linha.somenteComDado && !dado) return
        const aulaReal = dado?.aulaReal ?? ev.aulaKey
        // Passo 1: todas as linhas caem na coluna da lição (dia = j). Passo 2 (continuação): a lição
        // fica na 1ª coluna do par e as demais linhas na 2ª.
        metas.push({
          semana,
          dia: linha.continuacao ? col : passo === 2 ? col + 1 : col,
          tipo: linha.tipo,
          disciplina: ev.disciplina,
          disciplina_id: ev.disciplina_id,
          aula: aulaReal,
          conteudo: linha.usaLinks ? null : dado?.conteudo ?? null,
          duracao: linha.duracao,
          ordem: 0,
          questaoIds: dado?.questaoIds?.length ? [...dado.questaoIds] : undefined,
        })
        // Continuação (2º dia) — só no modo passo=2 (alguma linha com continuação ligada).
        if (linha.continuacao && col + 1 < config.diasCount) {
          metas.push({
            semana,
            dia: col + 1,
            tipo: linha.tipo,
            disciplina: ev.disciplina,
            disciplina_id: ev.disciplina_id,
            aula: aulaReal,
            conteudo: `CONTINUAÇÃO AULA ${aulaReal} ${ev.disciplina.toUpperCase()}`,
            duracao: linha.duracao,
            ordem: 1,
          })
        }
        // Links de questões (Resolução): (disciplina, aula) → tema + urls QC/TEC.
        if (linha.usaLinks && dado && Object.keys(dado.urls).length) {
          const l = linkDe(ev.disciplina, ev.disciplina_id, aulaReal, dado.tema ?? '')
          Object.assign(l.urls, dado.urls)
        }
        // Videoaula (Lição): entra como mais um link, sob a plataforma "Vídeo".
        if (dado?.videoUrl) {
          const l = linkDe(ev.disciplina, ev.disciplina_id, aulaReal, dado.tema ?? '')
          l.urls[SLUG_VIDEO] = dado.videoUrl
        }
        // PDF da aula: mais um link, sob a plataforma "PDF" (vem das urls do banco, como QC/TEC).
        if (dado?.urls?.[SLUG_PDF]) {
          const l = linkDe(ev.disciplina, ev.disciplina_id, aulaReal, dado.tema ?? '')
          l.urls[SLUG_PDF] = dado.urls[SLUG_PDF]
        }
      })
    }
  }

  return { metas, links: [...linkPorChave.values()], avisos, colocacao }
}
