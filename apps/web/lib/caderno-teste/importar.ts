import 'server-only'
import { parse, type HTMLElement } from 'node-html-parser'
import { DIAG_PADRAO, type DiagConteudo, type DiagPilar, type DiagDisciplina, type DiagSugestao } from './diagnostico'

/**
 * Mapeia um Diagnóstico (Word→HTML ou HTML) para a estrutura DiagConteudo. Heurístico e tolerante:
 * o que não reconhece fica com o default. Word/HTML mantêm a ordem/estrutura (o que torna o mapeamento
 * confiável); PDF, por perder as colunas, não é mapeado por aqui.
 */
const RE_FAIXA = /^(\d{1,3})\s*[-–]\s*(\d{1,3})$/
const RE_NOTA = /acertos de\s+(\d+)\s+quest/i
const UP = (s: string) => s.length > 0 && s === s.toUpperCase() && /[A-ZÀ-Ú]/.test(s)
const lim = (s: string) => s.replace(/ /g, ' ').replace(/\s+/g, ' ').trim()

/** Linhas de texto (parágrafos/células/itens) em ordem de documento. */
function extrairLinhas(html: string): string[] {
  const root = parse(html)
  const out: string[] = []
  for (const el of root.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li') as HTMLElement[]) {
    const t = lim(el.text)
    if (t) out.push(t)
  }
  return out
}

function idxDe(linhas: string[], re: RegExp, from = 0): number {
  for (let i = from; i < linhas.length; i++) if (re.test(linhas[i])) return i
  return -1
}

function parsePilares(reg: string[]): DiagPilar[] {
  const pilares: DiagPilar[] = []
  const ehNome = (t: string) => UP(t) && t.length <= 30 && /[A-ZÀ-Ú]{3,}/.test(t) && !/TEXTO MODULADO|DESEMPENHO|QUEST|PILAR|DISCIPLINA/i.test(t) && !/\d/.test(t.replace(/%/g, ''))
  for (let i = 0; i < reg.length; i++) {
    if (!ehNome(reg[i])) continue
    const nome = reg[i]
    const jan = reg.slice(i + 1, i + 40)
    const totalTxt = jan.find((l) => /de\s+\d+\s+quest/i.test(l)) ?? 'X de N questões'
    const bandas: { faixa: string; texto: string }[] = []
    for (let k = 0; k < jan.length; k++) {
      const m = jan[k].match(RE_FAIXA)
      if (!m) continue
      // texto da banda = próxima linha "longa" que não seja outra faixa/rótulo
      const txt = jan.slice(k + 1).find((l) => !RE_FAIXA.test(l) && !/TEXTO MODULADO/i.test(l) && l.length > 30) ?? ''
      bandas.push({ faixa: `${m[1]}-${m[2]}`, texto: txt })
    }
    if (bandas.length) pilares.push({ nome, totalTxt: totalTxt.replace(/^X\s+/i, 'X '), bandas })
  }
  return pilares
}

function parseDisciplinas(reg: string[]): DiagDisciplina[] {
  const out: DiagDisciplina[] = []
  let cur: DiagDisciplina | null = null
  const ehScore = (t: string) => /[xX\d]+\s*\/\s*\d+/.test(t) && t.length < 20
  for (const t of reg) {
    if (/^[-–]\s*Categoria/i.test(t)) { if (cur) cur.categoria = lim(t.replace(/^[-–]\s*Categoria:?\s*/i, '')) || 'Assunto'; continue }
    if (ehScore(t)) { if (cur) cur.total = (t.match(/[xX\d]+\s*\/\s*\d+/)?.[0] ?? cur.total).replace(/\s+/g, ''); continue }
    if (t.length >= 3 && !/^TEXTO|^\d+%$/i.test(t)) { if (cur) out.push(cur); cur = { nome: t, total: 'x/N', categoria: 'Assunto' } }
  }
  if (cur) out.push(cur)
  return out
}

function parseSugestoes(reg: string[]): DiagSugestao[] {
  const out: DiagSugestao[] = []
  let cur: DiagSugestao | null = null
  for (const t of reg) {
    if (UP(t) && t.length < 40 && !/PRIORIDADE/i.test(t) && !t.startsWith('>')) { if (cur) out.push(cur); cur = { titulo: t, prioridade: 'Prioridade Alta', intro: '', itens: [] }; continue }
    if (!cur) continue
    if (/PRIORIDADE/i.test(t)) { cur.prioridade = lim(t.replace(/^\[!\]\s*/, '')); continue }
    if (t.startsWith('>>') || t.startsWith('>')) { const forte = t.startsWith('>>'); cur.itens.push({ forte, texto: lim(t.replace(/^>+\s*/, '')) }); continue }
    if (!cur.intro && t.length > 40) { cur.intro = t; continue }
  }
  if (cur) out.push(cur)
  return out
}

export function htmlParaDiagnostico(html: string): { conteudo: DiagConteudo; avisos: string[] } {
  const linhas = extrairLinhas(html)
  const avisos: string[] = []
  const conteudo: DiagConteudo = structuredClone(DIAG_PADRAO)

  const iPilar = idxDe(linhas, /DESEMPENHO POR PILAR/i)
  const iDisc = idxDe(linhas, /DESEMPENHO POR (DISCIPLINA|ASSUNTO)/i)
  const iSug = idxDe(linhas, /SUGEST[ÕO]ES DE ESTUDO/i)
  const iGab = idxDe(linhas, /GABARITO OFICIAL DESATUALIZADO/i)

  // Subtítulo: linha logo após "Diagnóstico de Desempenho".
  const iTit = idxDe(linhas, /Diagn[óo]stico de Desempenho/i)
  if (iTit >= 0 && linhas[iTit + 1]) conteudo.subtitulo = linhas[iTit + 1]

  // Nota.
  const iNota = idxDe(linhas, RE_NOTA)
  if (iNota >= 0) { conteudo.notaTexto = linhas[iNota]; const m = linhas[iNota].match(RE_NOTA); if (m) conteudo.notaTotal = m[1] }

  // Intro: parágrafos entre a nota e o 1º bloco de seção.
  const fimIntro = iPilar >= 0 ? iPilar : (iDisc >= 0 ? iDisc : linhas.length)
  const iniIntro = iNota >= 0 ? iNota + 1 : (iTit >= 0 ? iTit + 2 : 0)
  const intro = linhas.slice(iniIntro, fimIntro).filter((l) => l.length > 60 && !/^\[NOME|^NOME:/i.test(l))
  if (intro.length) conteudo.intro = intro

  if (iPilar >= 0) { const p = parsePilares(linhas.slice(iPilar + 1, iDisc >= 0 ? iDisc : undefined)); if (p.length) conteudo.pilares = p; else avisos.push('Não reconheci os pilares.') }
  if (iDisc >= 0) { const d = parseDisciplinas(linhas.slice(iDisc + 1, iSug >= 0 ? iSug : (iGab >= 0 ? iGab : undefined))); if (d.length) conteudo.disciplinas = d; else avisos.push('Não reconheci as disciplinas.') }
  if (iSug >= 0) { const s = parseSugestoes(linhas.slice(iSug + 1, iGab >= 0 ? iGab : undefined)); if (s.length) conteudo.sugestoes = s }
  if (iGab >= 0) {
    const reg = linhas.slice(iGab + 1)
    conteudo.gabaritoIntro = reg.filter((l) => l.length > 40 && !/^Quest[ãa]o\s+\d+/i.test(l)).slice(0, 3)
    conteudo.gabaritoObs = reg.filter((l) => /^Quest[ãa]o\s+\d+/i.test(l))
  }

  return { conteudo, avisos }
}
