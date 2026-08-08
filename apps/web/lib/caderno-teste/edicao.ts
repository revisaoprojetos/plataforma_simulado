// Edição de TEXTO por bloco do diagnóstico — casa com as "partes" clicáveis da prévia (previa.tsx).
// O popover de cor (builder) também mostra estes campos para o bloco selecionado.

import type { ItemCaderno } from './tipos'
import { DIAG_PADRAO, slugDiag, type DiagConteudo } from './diagnostico'

/** alvo 'titulo' edita ajustes.titulo; os demais editam item.conteudo. */
export type CampoTexto = { id: string; label: string; valor: string; multiline?: boolean; alvo?: 'conteudo' | 'titulo' }

/** Índice do pilar cuja chave/posição casa com `pilar:<x>`. */
function idxPilar(c: DiagConteudo, x: string): number {
  return c.pilares.findIndex((pl, i) => (pl.chave || String(i)) === x)
}
/** Índice da disciplina (por slug) em conteudo. */
function idxDisc(c: DiagConteudo, chave: string): number {
  return c.disciplinas.findIndex((d) => (d.chave || slugDiag(d.nome)) === chave)
}

/** Campos de texto editáveis do bloco `parte` do item. [] quando o bloco não tem texto editável. */
export function camposDoBloco(item: ItemCaderno, parte: string): CampoTexto[] {
  if (item.modalidade !== 'diagnostico') {
    if (parte === 'cab_titulo') return [{ id: 'titulo', label: 'Título', valor: item.ajustes.titulo, alvo: 'titulo' }]
    return []
  }
  const c = item.conteudo ?? DIAG_PADRAO
  if (parte === 'diag_cab') return [
    { id: 'titulo', label: 'Título', valor: item.ajustes.titulo, alvo: 'titulo' },
    { id: 'subtitulo', label: 'Subtítulo', valor: c.subtitulo, multiline: true },
  ]
  if (parte === 'diag_nota_num') return [{ id: 'notaTotal', label: 'Total (denominador)', valor: c.notaTotal }]
  if (parte === 'diag_nota_faixa') return [{ id: 'notaTexto', label: 'Texto da nota', valor: c.notaTexto, multiline: true }]
  if (parte.startsWith('intro:')) { const i = Number(parte.slice('intro:'.length)); if (c.intro[i] == null) return []; return [{ id: 'intro', label: 'Parágrafo', valor: c.intro[i], multiline: true }] }
  if (parte === 'disc_intro') return [{ id: 'disciplinasIntro', label: 'Introdução das disciplinas', valor: c.disciplinasIntro, multiline: true }]
  if (parte.startsWith('pilar:')) {
    const i = idxPilar(c, parte.slice('pilar:'.length)); if (i < 0) return []
    const pl = c.pilares[i]
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
      ...s.itens.map((it, j) => ({ id: `item:${j}`, label: `Tópico ${j + 1}`, valor: it.texto, multiline: true })),
    ]
  }
  if (parte.startsWith('disc:')) {
    const i = idxDisc(c, parte.slice('disc:'.length)); if (i < 0) return []
    return [{ id: 'nome', label: 'Nome da disciplina', valor: c.disciplinas[i].nome }]
  }
  if (parte === 'sec_pilares') return [{ id: 'tituloPilares', label: 'Título da seção', valor: c.tituloPilares ?? 'Desempenho por pilar' }]
  if (parte === 'sec_disciplinas') return [{ id: 'tituloDisciplinas', label: 'Título da seção', valor: c.tituloDisciplinas ?? 'Desempenho por disciplina' }]
  if (parte === 'sec_sugestoes') return [{ id: 'tituloSugestoes', label: 'Título da seção', valor: c.tituloSugestoes ?? 'Sugestões de estudo' }]
  if (parte === 'sec_gabarito') return [{ id: 'gabaritoTitulo', label: 'Título da seção', valor: c.gabaritoTitulo }]
  if (parte === 'diag_gab_obs') return [
    { id: 'titulo', label: 'Título da seção', valor: c.gabaritoTitulo },
    ...c.gabaritoIntro.map((t, k) => ({ id: `intro:${k}`, label: `Parágrafo ${k + 1}`, valor: t, multiline: true })),
    ...c.gabaritoObs.map((t, k) => ({ id: `obs:${k}`, label: `Observação ${k + 1}`, valor: t, multiline: true })),
  ]
  return []
}

/** Partes do diagnóstico que podem ser REMOVIDAS (itens de lista). */
export function podeRemoverParte(parte: string): boolean {
  return parte.startsWith('intro:') || parte.startsWith('pilar:') || parte.startsWith('sug:') || parte.startsWith('disc:')
}

/** Remove (retorna novo conteúdo) a parte de lista indicada. */
export function removerParteDiag(conteudo: DiagConteudo | undefined, parte: string): DiagConteudo {
  const c = clonar(conteudo ?? DIAG_PADRAO)
  if (parte.startsWith('intro:')) { const i = Number(parte.slice('intro:'.length)); if (c.intro[i] != null) c.intro.splice(i, 1) }
  else if (parte.startsWith('pilar:')) { const i = idxPilar(c, parte.slice('pilar:'.length)); if (i >= 0) c.pilares.splice(i, 1) }
  else if (parte.startsWith('sug:')) { const i = Number(parte.slice('sug:'.length)); if (c.sugestoes[i]) c.sugestoes.splice(i, 1) }
  else if (parte.startsWith('disc:')) { const i = idxDisc(c, parte.slice('disc:'.length)); if (i >= 0) c.disciplinas.splice(i, 1) }
  return c
}

function clonar(c: DiagConteudo): DiagConteudo { try { return structuredClone(c) } catch { return JSON.parse(JSON.stringify(c)) } }

/** Aplica a edição de um campo ao conteúdo (retorna um novo DiagConteudo). */
export function aplicarCampoBloco(conteudo: DiagConteudo | undefined, parte: string, campoId: string, valor: string): DiagConteudo {
  const c = clonar(conteudo ?? DIAG_PADRAO)
  if (parte === 'diag_cab') { if (campoId === 'subtitulo') c.subtitulo = valor }
  else if (parte === 'diag_nota_num') { if (campoId === 'notaTotal') c.notaTotal = valor }
  else if (parte === 'diag_nota_faixa') { if (campoId === 'notaTexto') c.notaTexto = valor }
  else if (parte.startsWith('intro:')) { const i = Number(parte.slice('intro:'.length)); if (c.intro[i] != null) c.intro[i] = valor }
  else if (parte === 'disc_intro') { c.disciplinasIntro = valor }
  else if (parte.startsWith('pilar:')) {
    const i = idxPilar(c, parte.slice('pilar:'.length)); if (i >= 0) {
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
      else if (campoId.startsWith('item:')) { const j = Number(campoId.slice('item:'.length)); if (s.itens[j]) s.itens[j].texto = valor }
    }
  } else if (parte.startsWith('disc:')) {
    const i = idxDisc(c, parte.slice('disc:'.length)); if (i >= 0 && campoId === 'nome') c.disciplinas[i].nome = valor
  } else if (parte === 'sec_pilares') { c.tituloPilares = valor }
  else if (parte === 'sec_disciplinas') { c.tituloDisciplinas = valor }
  else if (parte === 'sec_sugestoes') { c.tituloSugestoes = valor }
  else if (parte === 'sec_gabarito') { c.gabaritoTitulo = valor }
  else if (parte === 'diag_gab_obs') {
    if (campoId === 'titulo') c.gabaritoTitulo = valor
    else if (campoId.startsWith('intro:')) { const k = Number(campoId.slice('intro:'.length)); if (c.gabaritoIntro[k] != null) c.gabaritoIntro[k] = valor }
    else if (campoId.startsWith('obs:')) { const k = Number(campoId.slice('obs:'.length)); if (c.gabaritoObs[k] != null) c.gabaritoObs[k] = valor }
  }
  return c
}
