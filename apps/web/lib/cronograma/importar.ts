/**
 * Validação e prévia da importação do catálogo (spec §9).
 *
 * Módulo PURO: não toca no banco. Recebe o JSON cru e o estado atual, devolve o que
 * entra, o que sai, o que muda e a lista de erros por linha. Quem grava é a server
 * action, chamando a RPC atômica.
 *
 * A spec é explícita sobre o porquê da prévia: "sem isso, uma planilha com colunas
 * trocadas destrói 1.500 metas sem aviso".
 *
 * Três cuidados vêm dos dados reais e estão codificados aqui:
 *  · `aula` é TEXTO. Uma planilha que converta "01" em 1 quebra o casamento com os
 *    links, que é exato. Números são REJEITADOS, não coagidos.
 *  · `dia` é ÍNDICE em dias_curso, não o dia da semana. Quem exportar pensando
 *    "1 = segunda" desloca o cronograma inteiro.
 *  · A grafia da disciplina é a chave dos links — normalizada na entrada.
 *
 * A chave (disciplina, aula) vem de `chaveLink()` do motor, nunca remontada aqui: se
 * cada módulo normalizasse do seu jeito, a prévia mostraria "405 links novos" para um
 * arquivo que só atualiza os existentes.
 */

import { chaveLink } from './formato-meta'
import type { TipoMeta } from './tipos'

export type ErroLinha = { linha: number; campo: string; problema: string }

export type CronogramaImportado = {
  slug: string
  nome: string
  subtitulo: string | null
  total_semanas: number
  dias_curso: number[]
  dias_nome: string[]
  semanas_revisao: number[]
  carga_horaria: number
  categoria: string | null
  fonte: Record<string, unknown>
  ordem: number
}

export type MetaImportada = {
  cronograma_slug: string
  semana: number
  dia: number
  tipo: TipoMeta
  disciplina: string
  aula: string | null
  conteudo: string | null
  duracao: string | null
  ordem: number
}

export type LinkImportado = {
  disciplina: string
  aula: string
  tema: string | null
  /**
   * Links por plataforma, chaveados pelo SLUG dela. Os arquivos do gerador legado
   * trazem `url_qc` e `url_tec`, que viram os slugs `qc` e `tec`; um arquivo novo pode
   * trazer qualquer plataforma cadastrada, em `urls: { slug: url }`.
   */
  urls: Record<string, string>
}

/** Aparência canônica da disciplina: espaços colapsados, sem sobra nas pontas. */
export function normalizarDisciplina(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

/**
 * `aula` só pode chegar como texto. Se vier número, é sinal de que a planilha converteu
 * a coluna — e aceitar isso quebraria os links em silêncio. Rejeitar é o comportamento
 * correto: o erro aparece na prévia, não meses depois numa grade sem links.
 */
function lerAula(v: unknown): { ok: true; valor: string | null } | { ok: false; problema: string } {
  if (v === null || v === undefined || v === '') return { ok: true, valor: null }
  if (typeof v === 'number') {
    return { ok: false, problema: `veio como número (${v}). A aula é texto: "01", "1" e "1.1" são aulas diferentes. Formate a coluna como texto e reexporte.` }
  }
  if (typeof v !== 'string') return { ok: false, problema: `tipo inesperado (${typeof v})` }
  const t = v.trim()
  return { ok: true, valor: t || null }
}

function inteiro(v: unknown): number | null {
  if (typeof v === 'number' && Number.isInteger(v)) return v
  if (typeof v === 'string' && /^-?\d+$/.test(v.trim())) return Number(v.trim())
  return null
}

function texto(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const t = String(v).trim()
  return t || null
}

// ─────────────────────────────────────────────────────────────────────────────
// Cronogramas

export function validarCronogramas(bruto: unknown): { itens: CronogramaImportado[]; erros: ErroLinha[] } {
  const erros: ErroLinha[] = []
  const itens: CronogramaImportado[] = []
  if (!Array.isArray(bruto)) {
    return { itens, erros: [{ linha: 0, campo: 'arquivo', problema: 'O arquivo de cronogramas precisa ser uma lista.' }] }
  }

  const slugsVistos = new Set<string>()
  bruto.forEach((c: any, i) => {
    const linha = i + 1
    const slug = texto(c?.slug)
    const nome = texto(c?.nome)
    if (!slug) return erros.push({ linha, campo: 'slug', problema: 'obrigatório (é a chave natural da importação)' })
    if (!nome) return erros.push({ linha, campo: 'nome', problema: 'obrigatório' })
    if (slugsVistos.has(slug)) return erros.push({ linha, campo: 'slug', problema: `repetido no arquivo: "${slug}"` })
    slugsVistos.add(slug)

    const total = inteiro(c?.total_semanas)
    if (total === null || total < 1) return erros.push({ linha, campo: 'total_semanas', problema: 'precisa ser inteiro ≥ 1' })

    const dias = Array.isArray(c?.dias_curso) ? c.dias_curso.map(inteiro) : null
    const nomes = Array.isArray(c?.dias_nome) ? c.dias_nome.map(texto) : null
    if (!dias || dias.some((d: number | null) => d === null || d < 0 || d > 6)) {
      return erros.push({ linha, campo: 'dias_curso', problema: 'lista de inteiros 0–6 (1=segunda … 6=sábado, 0=domingo)' })
    }
    if (!nomes || nomes.length !== dias.length) {
      return erros.push({ linha, campo: 'dias_nome', problema: `precisa ter o mesmo tamanho de dias_curso (${dias.length})` })
    }

    const carga = typeof c?.carga_horaria === 'number' ? c.carga_horaria : Number(texto(c?.carga_horaria) ?? NaN)
    if (!Number.isFinite(carga) || carga <= 0) {
      return erros.push({ linha, campo: 'carga_horaria', problema: 'obrigatória e maior que zero (não é mais deduzida do nome)' })
    }

    const revisao = Array.isArray(c?.semanas_revisao) ? (c.semanas_revisao.map(inteiro).filter((n: number | null) => n !== null) as number[]) : []
    const fora = revisao.filter((s) => s < 1 || s > total)
    if (fora.length) return erros.push({ linha, campo: 'semanas_revisao', problema: `fora do intervalo 1–${total}: ${fora.join(', ')}` })

    itens.push({
      slug,
      nome,
      subtitulo: texto(c?.subtitulo),
      total_semanas: total,
      dias_curso: dias as number[],
      dias_nome: nomes as string[],
      semanas_revisao: revisao,
      carga_horaria: carga,
      categoria: texto(c?.categoria) ?? texto(c?.fonte?.categoria),
      fonte: (c?.fonte && typeof c.fonte === 'object' ? c.fonte : {}) as Record<string, unknown>,
      ordem: inteiro(c?.ordem) ?? inteiro(c?.ordem_original) ?? i,
    })
  })

  return { itens, erros }
}

// ─────────────────────────────────────────────────────────────────────────────
// Metas

/**
 * Valida as metas contra os cronogramas que as recebem — é aqui que os erros mais
 * caros aparecem: semana fora do intervalo, dia fora de dias_curso, tipo desconhecido,
 * cronograma inexistente (spec §9, item 1).
 */
export function validarMetas(
  bruto: unknown,
  cronogramas: Map<string, { total_semanas: number; dias_curso: number[] }>,
  /**
   * Slugs de tipo válidos, vindos do CADASTRO do tenant. Os tipos deixaram de ser uma
   * lista fixa no código, então quem valida precisa dizer quais existem. Omitido, aceita
   * qualquer slug não-vazio — usado em teste de unidade do parser.
   */
  tiposValidos?: Set<string>,
): { itens: MetaImportada[]; erros: ErroLinha[] } {
  const erros: ErroLinha[] = []
  const itens: MetaImportada[] = []
  if (!Array.isArray(bruto)) {
    return { itens, erros: [{ linha: 0, campo: 'arquivo', problema: 'O arquivo de metas precisa ser uma lista.' }] }
  }

  // Um cronograma inexistente costuma valer para milhares de linhas; agrupar evita
  // uma prévia com 5.000 erros idênticos.
  const slugsDesconhecidos = new Map<string, number>()

  bruto.forEach((m: any, i) => {
    const linha = i + 1
    const slug = texto(m?.cronograma_slug) ?? texto(m?.cronograma)
    if (!slug) return erros.push({ linha, campo: 'cronograma_slug', problema: 'obrigatório' })

    const cron = cronogramas.get(slug)
    if (!cron) {
      slugsDesconhecidos.set(slug, (slugsDesconhecidos.get(slug) ?? 0) + 1)
      return
    }

    const semana = inteiro(m?.semana)
    if (semana === null || semana < 1 || semana > cron.total_semanas) {
      return erros.push({ linha, campo: 'semana', problema: `precisa estar entre 1 e ${cron.total_semanas} (veio "${m?.semana}")` })
    }

    const dia = inteiro(m?.dia)
    if (dia === null || dia < 0 || dia >= cron.dias_curso.length) {
      return erros.push({
        linha,
        campo: 'dia',
        problema: `é o ÍNDICE dentro dos ${cron.dias_curso.length} dias de curso (0 a ${cron.dias_curso.length - 1}), não o dia da semana. Veio "${m?.dia}"`,
      })
    }

    const tipo = texto(m?.tipo)
    if (!tipo) return erros.push({ linha, campo: 'tipo', problema: 'obrigatório' })
    if (tiposValidos && tiposValidos.size && !tiposValidos.has(tipo)) {
      return erros.push({
        linha,
        campo: 'tipo',
        problema: `"${tipo}" não está cadastrado. Cadastre-o em Cronograma → Tipos de meta antes de importar, para o gerador saber como tratá-lo. Cadastrados: ${[...tiposValidos].join(', ')}`,
      })
    }

    const disciplina = texto(m?.disciplina)
    if (!disciplina) return erros.push({ linha, campo: 'disciplina', problema: 'obrigatória' })

    const aula = lerAula(m?.aula)
    if (!aula.ok) return erros.push({ linha, campo: 'aula', problema: aula.problema })

    itens.push({
      cronograma_slug: slug,
      semana,
      dia,
      tipo: tipo as TipoMeta,
      disciplina: normalizarDisciplina(disciplina),
      aula: aula.valor,
      conteudo: texto(m?.conteudo),
      duracao: texto(m?.duracao),
      ordem: inteiro(m?.ordem) ?? i,
    })
  })

  for (const [slug, n] of slugsDesconhecidos) {
    erros.push({ linha: 0, campo: 'cronograma_slug', problema: `cronograma "${slug}" não existe no catálogo nem no arquivo enviado — ${n} meta(s) ignorada(s)` })
  }

  return { itens, erros }
}

// ─────────────────────────────────────────────────────────────────────────────
// Links

export function validarLinks(bruto: unknown): { itens: LinkImportado[]; erros: ErroLinha[] } {
  const erros: ErroLinha[] = []
  const itens: LinkImportado[] = []
  if (!Array.isArray(bruto)) {
    return { itens, erros: [{ linha: 0, campo: 'arquivo', problema: 'O arquivo de links precisa ser uma lista.' }] }
  }

  const vistos = new Set<string>()
  bruto.forEach((l: any, i) => {
    const linha = i + 1
    const disciplina = texto(l?.disciplina)
    if (!disciplina) return erros.push({ linha, campo: 'disciplina', problema: 'obrigatória' })

    const aula = lerAula(l?.aula)
    if (!aula.ok) return erros.push({ linha, campo: 'aula', problema: aula.problema })
    if (!aula.valor) return erros.push({ linha, campo: 'aula', problema: 'obrigatória (é metade da chave)' })

    const chave = chaveLink(normalizarDisciplina(disciplina), aula.valor) as string
    if (vistos.has(chave)) return erros.push({ linha, campo: 'aula', problema: `par (disciplina, aula) repetido no arquivo: ${disciplina} · ${aula.valor}` })
    vistos.add(chave)

    // Aceita os dois formatos: as colunas fixas do legado e o mapa por plataforma.
    const urls: Record<string, string> = {}
    const qc = texto(l?.url_qc)
    const tec = texto(l?.url_tec)
    if (qc) urls.qc = qc
    if (tec) urls.tec = tec
    if (l?.urls && typeof l.urls === 'object') {
      for (const [slug, valor] of Object.entries(l.urls as Record<string, unknown>)) {
        const u = texto(valor)
        if (u) urls[slug.trim().toLowerCase()] = u
      }
    }

    itens.push({
      disciplina: normalizarDisciplina(disciplina),
      aula: aula.valor,
      tema: texto(l?.tema),
      urls,
    })
  })

  return { itens, erros }
}

// ─────────────────────────────────────────────────────────────────────────────
// Prévia

export type PreviaCronograma = {
  slug: string
  nome: string
  situacao: 'novo' | 'atualiza' | 'igual'
  metasAtuais: number
  metasNovas: number
  liberado: boolean
}

export type Previa = {
  cronogramas: PreviaCronograma[]
  totalMetas: number
  totalLinks: number
  linksNovos: number
  linksAtualizados: number
  /** Cronogramas que existem no catálogo e NÃO vêm no arquivo — ficam intocados. */
  naoMencionados: string[]
  erros: ErroLinha[]
}

/**
 * Monta o "quantas entram, quantas saem, quantas mudam" da spec §9, item 2.
 *
 * Cronogramas ausentes do arquivo NÃO são apagados: a importação substitui o conjunto
 * de metas dos cronogramas mencionados, e só deles.
 */
export function montarPrevia(
  novos: CronogramaImportado[],
  metas: MetaImportada[],
  links: LinkImportado[],
  atual: {
    cronogramas: { slug: string; nome: string; status: string; metas: number }[]
    linksChaves: Set<string>
  },
  erros: ErroLinha[],
): Previa {
  const porSlugAtual = new Map(atual.cronogramas.map((c) => [c.slug, c]))
  const metasPorSlug = new Map<string, number>()
  for (const m of metas) metasPorSlug.set(m.cronograma_slug, (metasPorSlug.get(m.cronograma_slug) ?? 0) + 1)

  const cronogramas: PreviaCronograma[] = novos.map((c) => {
    const existente = porSlugAtual.get(c.slug)
    const metasNovas = metasPorSlug.get(c.slug) ?? 0
    const metasAtuais = existente?.metas ?? 0
    return {
      slug: c.slug,
      nome: c.nome,
      situacao: !existente ? 'novo' : metasAtuais === metasNovas ? 'igual' : 'atualiza',
      metasAtuais,
      metasNovas,
      liberado: existente?.status === 'liberado',
    }
  })

  let linksNovos = 0
  let linksAtualizados = 0
  for (const l of links) {
    const k = chaveLink(l.disciplina, l.aula)
    if (!k) continue
    if (atual.linksChaves.has(k)) linksAtualizados++
    else linksNovos++
  }

  const mencionados = new Set(novos.map((c) => c.slug))
  const naoMencionados = atual.cronogramas.filter((c) => !mencionados.has(c.slug)).map((c) => c.nome)

  return {
    cronogramas,
    totalMetas: metas.length,
    totalLinks: links.length,
    linksNovos,
    linksAtualizados,
    naoMencionados,
    erros,
  }
}
