// Edição de TEXTO por bloco do diagnóstico — casa com as "partes" clicáveis da prévia (previa.tsx).
// O popover de cor (builder) também mostra estes campos para o bloco selecionado.

import type { ItemCaderno } from './tipos'
import { DIAG_PADRAO, slugDiag, topicosParaTexto, type DiagConteudo } from './diagnostico'

/** alvo 'titulo' edita ajustes.titulo; os demais editam item.conteudo. */
export type CampoTexto = { id: string; label: string; valor: string; multiline?: boolean; alvo?: 'conteudo' | 'titulo' }

/** Índice da disciplina (por slug) em conteudo. */
function idxDisc(c: DiagConteudo, chave: string): number {
  return c.disciplinas.findIndex((d) => (d.chave || slugDiag(d.nome)) === chave)
}

/** Campos de texto editáveis do bloco `parte` do item. [] quando o bloco não tem texto editável. */
export function camposDoBloco(item: ItemCaderno, parte: string, nomeFallback?: string): CampoTexto[] {
  if (item.modalidade !== 'diagnostico') {
    if (parte === 'cab_titulo') return [{ id: 'titulo', label: 'Título', valor: item.ajustes.titulo, alvo: 'titulo' }]
    return []
  }
  const c = item.conteudo ?? DIAG_PADRAO
  if (parte === 'diag_cab') return [
    { id: 'tituloCab', label: 'Título', valor: c.tituloCabecalho ?? 'Diagnóstico de Desempenho' },
    { id: 'subtitulo', label: 'Subtítulo', valor: c.subtitulo, multiline: true },
  ]
  if (parte === 'diag_nome_rot') return [{ id: 'rotuloNome', label: 'Texto', valor: c.rotuloNome ?? 'NOME:' }]
  if (parte === 'diag_nota_num') return [{ id: 'notaTotal', label: 'Total (denominador)', valor: c.notaTotal }]
  if (parte === 'diag_nota_faixa') return [{ id: 'notaTexto', label: 'Texto da nota', valor: c.notaTexto, multiline: true }]
  if (parte.startsWith('intro:')) { const i = Number(parte.slice('intro:'.length)); if (c.intro[i] == null) return []; return [{ id: 'intro', label: 'Parágrafo', valor: c.intro[i], multiline: true }] }
  if (parte.startsWith('fechamento:')) { const i = Number(parte.slice('fechamento:'.length)); if (c.fechamento?.[i] == null) return []; return [{ id: 'fechamento', label: 'Parágrafo', valor: c.fechamento[i], multiline: true }] }
  if (parte.startsWith('gabIntro:')) { const i = Number(parte.slice('gabIntro:'.length)); if (c.gabaritoIntro[i] == null) return []; return [{ id: 'texto', label: 'Parágrafo', valor: c.gabaritoIntro[i], multiline: true }] }
  if (parte === 'gab_obs') return [{ id: 'obs', label: 'Observações (uma por linha)', valor: c.gabaritoObs.join('\n'), multiline: true }]
  if (parte === 'disc_intro') return [{ id: 'disciplinasIntro', label: 'Introdução das disciplinas', valor: c.disciplinasIntro, multiline: true }]
  if (parte.startsWith('pilar:')) {
    const i = Number(parte.slice('pilar:'.length)); const pl = c.pilares[i]; if (!pl) return []
    return [
      { id: 'nome', label: 'Nome do pilar', valor: pl.nome },
      { id: 'totalTxt', label: 'Legenda (x de N questões)', valor: pl.totalTxt, multiline: true },
      ...pl.bandas.map((b, j) => ({ id: `banda:${j}`, label: `Texto ${b.faixa}`, valor: b.texto, multiline: true })),
    ]
  }
  if (parte.startsWith('sug:')) {
    const i = Number(parte.slice('sug:'.length)); const s = c.sugestoes[i]; if (!s) return []
    return [
      { id: 'titulo', label: 'Título', valor: s.titulo },
      { id: 'prioridade', label: 'Prioridade', valor: s.prioridade },
      { id: 'intro', label: 'Introdução', valor: s.intro, multiline: true },
      { id: 'itens', label: 'Tópicos (use > ou >> no início da linha)', valor: topicosParaTexto(s.itens), multiline: true },
    ]
  }
  if (parte.startsWith('disc:')) {
    const chave = parte.slice('disc:'.length)
    const i = idxDisc(c, chave)
    const nome = i >= 0 ? c.disciplinas[i].nome : (c.discNomes?.[chave] ?? nomeFallback ?? '')
    return [{ id: 'nome', label: 'Nome da disciplina', valor: nome }]
  }
  if (parte === 'sec_pilares') return [{ id: 'tituloPilares', label: 'Título da seção', valor: c.tituloPilares ?? 'Desempenho por pilar' }]
  if (parte === 'sec_disciplinas') return [{ id: 'tituloDisciplinas', label: 'Título da seção', valor: c.tituloDisciplinas ?? 'Desempenho por disciplina' }]
  if (parte === 'sec_sugestoes') return [{ id: 'tituloSugestoes', label: 'Título da seção', valor: c.tituloSugestoes ?? 'Sugestões de estudo' }]
  if (parte === 'sec_gabarito') return [{ id: 'gabaritoTitulo', label: 'Título da seção', valor: c.gabaritoTitulo }]
  if (parte === 'sec_lingua') return [{ id: 'lpSecTitulo', label: 'Título da seção', valor: c.linguaPortuguesa?.secTitulo ?? 'Desempenho em Língua Portuguesa' }]
  if (parte === 'lingua_intro') return [{ id: 'lpSecIntro', label: 'Introdução', valor: c.linguaPortuguesa?.secIntro ?? '', multiline: true }]
  if (parte === 'lingua_card') {
    const lp = c.linguaPortuguesa; if (!lp) return []
    return [
      { id: 'lpTitulo', label: 'Nome', valor: lp.titulo },
      { id: 'lpTotal', label: 'Legenda (x de N questões)', valor: lp.totalTxt, multiline: true },
      ...lp.bandas.map((b, j) => ({ id: `lpBanda:${j}`, label: `Texto ${b.faixa}`, valor: b.texto, multiline: true })),
    ]
  }
  if (parte === 'diag_gab_obs') return [
    { id: 'titulo', label: 'Título da seção', valor: c.gabaritoTitulo },
    ...c.gabaritoIntro.map((t, k) => ({ id: `intro:${k}`, label: `Parágrafo ${k + 1}`, valor: t, multiline: true })),
    ...c.gabaritoObs.map((t, k) => ({ id: `obs:${k}`, label: `Observação ${k + 1}`, valor: t, multiline: true })),
  ]
  return []
}

/** Blocos ESTRUTURAIS ocultáveis: parte clicada → chave canônica do bloco (nota/nome/seção). */
const OCULTAVEIS: Record<string, string> = {
  diag_nota_num: 'nota', diag_nota_faixa: 'nota',
  diag_nome_rot: 'nome', diag_nome_val: 'nome',
  sec_pilares: 'pilares', sec_disciplinas: 'disciplinas', sec_sugestoes: 'sugestoes',
  sec_gabarito: 'gabarito', diag_gab_obs: 'gabarito',
  sec_lingua: 'lingua', lingua_intro: 'lingua', lingua_card: 'lingua',
}
export function chaveOcultavel(parte: string): string | null { return OCULTAVEIS[parte] ?? null }

/** Partes do diagnóstico que podem ser REMOVIDAS: itens de lista OU blocos estruturais (ocultar). */
export function podeRemoverParte(parte: string): boolean {
  return parte.startsWith('intro:') || parte.startsWith('fechamento:') || parte.startsWith('pilar:') || parte.startsWith('sug:') || parte.startsWith('disc:') || parte.startsWith('gabIntro:') || parte === 'gab_obs' || chaveOcultavel(parte) !== null
}

/** Remove (retorna novo conteúdo): itens de lista somem; blocos estruturais entram em partesOcultas. */
export function removerParteDiag(conteudo: DiagConteudo | undefined, parte: string): DiagConteudo {
  const c = clonar(conteudo ?? DIAG_PADRAO)
  if (parte.startsWith('intro:')) { const i = Number(parte.slice('intro:'.length)); if (c.intro[i] != null) c.intro.splice(i, 1) }
  else if (parte.startsWith('fechamento:')) { const i = Number(parte.slice('fechamento:'.length)); if (c.fechamento?.[i] != null) c.fechamento.splice(i, 1) }
  else if (parte.startsWith('pilar:')) { const i = Number(parte.slice('pilar:'.length)); if (c.pilares[i]) c.pilares.splice(i, 1) }
  else if (parte.startsWith('sug:')) { const i = Number(parte.slice('sug:'.length)); if (c.sugestoes[i]) c.sugestoes.splice(i, 1) }
  else if (parte.startsWith('disc:')) { const chave = parte.slice('disc:'.length); const i = idxDisc(c, chave); if (i >= 0) c.disciplinas.splice(i, 1); else c.discOcultas = [...(c.discOcultas ?? []), chave] }
  else if (parte === 'disc_intro') { c.disciplinasIntro = '' }
  else if (parte === 'lingua_intro') { if (c.linguaPortuguesa) c.linguaPortuguesa.secIntro = '' }
  else if (parte.startsWith('gabIntro:')) { const i = Number(parte.slice('gabIntro:'.length)); if (c.gabaritoIntro[i] != null) c.gabaritoIntro.splice(i, 1) }
  else if (parte === 'gab_obs') { c.gabaritoObs = [] }
  else { const oc = chaveOcultavel(parte); if (oc) c.partesOcultas = [...new Set([...(c.partesOcultas ?? []), oc])] }
  return c
}

function clonar(c: DiagConteudo): DiagConteudo { try { return structuredClone(c) } catch { return JSON.parse(JSON.stringify(c)) } }

/** Aplica a edição de um campo ao conteúdo (retorna um novo DiagConteudo). */
export function aplicarCampoBloco(conteudo: DiagConteudo | undefined, parte: string, campoId: string, valor: string): DiagConteudo {
  const c = clonar(conteudo ?? DIAG_PADRAO)
  if (parte === 'diag_cab') { if (campoId === 'subtitulo') c.subtitulo = valor; else if (campoId === 'tituloCab') c.tituloCabecalho = valor }
  else if (parte === 'diag_nome_rot') { if (campoId === 'rotuloNome') c.rotuloNome = valor }
  else if (parte === 'diag_nota_num') { if (campoId === 'notaTotal') c.notaTotal = valor }
  else if (parte === 'diag_nota_faixa') { if (campoId === 'notaTexto') c.notaTexto = valor }
  else if (parte.startsWith('intro:')) { const i = Number(parte.slice('intro:'.length)); if (c.intro[i] != null) c.intro[i] = valor }
  else if (parte.startsWith('fechamento:')) { const i = Number(parte.slice('fechamento:'.length)); if (c.fechamento?.[i] != null) c.fechamento[i] = valor }
  else if (parte.startsWith('gabIntro:')) { const i = Number(parte.slice('gabIntro:'.length)); if (c.gabaritoIntro[i] != null) c.gabaritoIntro[i] = valor }
  else if (parte === 'gab_obs') { if (campoId === 'obs') c.gabaritoObs = valor.split('\n').filter((l) => l.trim().length > 0) }
  else if (parte === 'disc_intro') { c.disciplinasIntro = valor }
  else if (parte.startsWith('pilar:')) {
    const i = Number(parte.slice('pilar:'.length)); if (c.pilares[i]) {
      const pl = c.pilares[i]
      if (campoId === 'nome') pl.nome = valor
      else if (campoId === 'totalTxt') pl.totalTxt = valor
      else if (campoId.startsWith('banda:')) { const j = Number(campoId.slice('banda:'.length)); if (pl.bandas[j]) pl.bandas[j].texto = valor }
    }
  } else if (parte.startsWith('sug:')) {
    const i = Number(parte.slice('sug:'.length)); const s = c.sugestoes[i]; if (s) {
      if (campoId === 'titulo') s.titulo = valor
      else if (campoId === 'prioridade') s.prioridade = valor
      else if (campoId === 'intro') s.intro = valor
      else if (campoId === 'itens') s.itens = valor ? [{ forte: false, texto: valor }] : []
    }
  } else if (parte.startsWith('disc:')) {
    const chave = parte.slice('disc:'.length); const i = idxDisc(c, chave)
    if (campoId === 'nome') { if (i >= 0) c.disciplinas[i].nome = valor; else c.discNomes = { ...(c.discNomes ?? {}), [chave]: valor } }
  } else if (parte === 'sec_pilares') { c.tituloPilares = valor }
  else if (parte === 'sec_disciplinas') { c.tituloDisciplinas = valor }
  else if (parte === 'sec_sugestoes') { c.tituloSugestoes = valor }
  else if (parte === 'sec_gabarito') { c.gabaritoTitulo = valor }
  else if (parte === 'sec_lingua') { if (c.linguaPortuguesa) c.linguaPortuguesa.secTitulo = valor }
  else if (parte === 'lingua_intro') { if (c.linguaPortuguesa) c.linguaPortuguesa.secIntro = valor }
  else if (parte === 'lingua_card') {
    const lp = c.linguaPortuguesa
    if (lp) {
      if (campoId === 'lpTitulo') lp.titulo = valor
      else if (campoId === 'lpTotal') lp.totalTxt = valor
      else if (campoId.startsWith('lpBanda:')) { const j = Number(campoId.slice('lpBanda:'.length)); if (lp.bandas[j]) lp.bandas[j].texto = valor }
    }
  }
  else if (parte === 'diag_gab_obs') {
    if (campoId === 'titulo') c.gabaritoTitulo = valor
    else if (campoId.startsWith('intro:')) { const k = Number(campoId.slice('intro:'.length)); if (c.gabaritoIntro[k] != null) c.gabaritoIntro[k] = valor }
    else if (campoId.startsWith('obs:')) { const k = Number(campoId.slice('obs:'.length)); if (c.gabaritoObs[k] != null) c.gabaritoObs[k] = valor }
  }
  return c
}
