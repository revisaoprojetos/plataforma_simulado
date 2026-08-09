import 'server-only'
import { DIAG_PADRAO, slugDiag, topicosParaTexto, prefFonte, type DiagPilar } from './diagnostico'
import { CORES_PILAR_PADRAO, type ItemCaderno, type PreviewQuestao } from './tipos'
import { formatarInline, formatarMarcadores } from './formato'
import { cssDaFonte } from '@/lib/caderno-designer/theme'

// Gera HTML do grupo (diagnóstico/caderno/folha) com as variáveis já aplicadas — usado no download
// em HTML e em Word (.doc abre HTML com estilos/tabelas). Espelha a prévia, em layout fluido.

export type DiscBanco = { nome: string; chave: string; pilar?: string }
function corDoPilar(slug: string | undefined, coresPilar: Record<string, string>, fallback: string): string {
  if (!slug) return fallback
  return coresPilar?.[slug] || CORES_PILAR_PADRAO[slug] || fallback
}

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function applyVars(t: string, vars: Record<string, string>): string {
  return (t || '').replace(/\{\s*([\w-]+)\s*\}/g, (m, k) => (k in vars ? vars[k] : m))
}
function preencher(t: string, vars: Record<string, string>): string {
  return applyVars(t, vars).replace(/\{\s*([\w-]+)\s*\}/g, (m, k) => {
    if (k === 'total_questoes') return '100'
    if (k === 'nome') return '[NOME COMPLETO ALUNO]'
    if (k === 'simulado') return 'Simulado'
    if (k === 'nota') return 'X,X'
    if (/^pct/.test(k) || k === 'percentual') return 'X%'
    if (/^total/.test(k)) return 'N'
    if (/^acerto/.test(k) || k === 'acertos' || k === 'erros') return 'X'
    if (/^assuntos/.test(k)) return ''
    return m
  })
}
function bandaAdaptativa(pilar: DiagPilar, vars: Record<string, string>): { faixa: string; texto: string } | null {
  const raw = pilar.chave ? vars[`pct_${prefFonte(pilar.tipoFonte)}${pilar.chave}`] : undefined
  if (raw == null) return null
  const n = parseFloat(String(raw).replace('%', '').replace(',', '.'))
  if (isNaN(n)) return null
  const f = n <= 49 ? '0-49' : n <= 80 ? '50-80' : '81-100'
  return pilar.bandas.find((b) => b.faixa === f) ?? pilar.bandas[0] ?? null
}

function htmlDiagnostico(item: ItemCaderno, vars: Record<string, string>, disc: DiscBanco[]): string {
  const a = item.ajustes
  const c = item.conteudo ?? DIAG_PADRAO
  const V = (t: string) => formatarInline(preencher(t, vars)) // prose com **negrito**/*itálico*/<u>sublinhado</u>
  const prim = a.corPrimaria, amar = a.corSecundaria
  const corpo = a.compacto ? 9 : 10 // tamanho ÚNICO do CORPO do texto (igual à prévia); título/% em destaque
  const corP = (parte: string, def: string) => (a.coresParte ?? {})[parte] || def // cor individual por bloco (clique na prévia)
  const alignP = (parte: string, def: string) => (a.alinhamentoParte ?? {})[parte] || def // alinhamento por bloco
  const corTextoP = (parte: string, def: string) => (a.coresTextoParte ?? {})[parte] || def // cor do texto por bloco
  const estCss = (parte: string) => { const e = (a.estiloParte ?? {})[parte]; return `${e?.b ? 'font-weight:700;' : ''}${e?.i ? 'font-style:italic;' : ''}${e?.u ? 'text-decoration:underline;' : ''}` } // negrito/itálico/sublinhado por bloco
  const fonteCss = (parte: string) => { const f = cssDaFonte((a.fonteParte ?? {})[parte]); return f ? `font-family:${f};` : '' } // fonte por bloco
  const escl = (parte: string) => (a.tamanhoParte ?? {})[parte] ?? 1 // multiplicador de tamanho por bloco
  const fsz = (parte: string, px: number) => `${Math.round(px * escl(parte) * 10) / 10}px` // font-size escalado por bloco
  // Faixa de seção como TABELA (o Word renderiza bg de célula de tabela com fidelidade; div nem sempre).
  const sec = (t: string) => { const cor = corP(`sec:${t}`, prim); return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:18px 0 10px"><tr><td style="background:${cor};color:#fff;font-weight:700;font-size:12px;letter-spacing:1px;text-transform:uppercase;padding:7px 12px">${esc(t)}</td></tr></table>` }
  let h = ''
  if (a.mostrarCabecalho) { const cor = corP('diag_cab', prim); h += `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:12px"><tr><td style="background:${cor};color:${corTextoP('diag_cab', '#fff')};padding:14px 18px;${fonteCss('diag_cab')}"><div style="font-size:${fsz('diag_cab_titulo', 22)};font-weight:800;text-align:${alignP('diag_cab_titulo', 'left')};color:${corTextoP('diag_cab_titulo', '#fff')};${estCss('diag_cab_titulo')}${fonteCss('diag_cab_titulo')}">${V(c.tituloCabecalho ?? 'Diagnóstico de Desempenho')}</div>${c.subtitulo ? `<div style="font-size:${fsz('diag_cab_sub', 12)};opacity:.85;margin-top:2px;text-align:${alignP('diag_cab_sub', 'left')};color:${corTextoP('diag_cab_sub', '#fff')};${estCss('diag_cab_sub')}${fonteCss('diag_cab_sub')}">${V(c.subtitulo)}</div>` : ''}</td></tr></table>` }
  if (a.mostrarDadosAluno) { const cN = corP('diag_nome_rot', prim), cV = corP('diag_nome_val', amar); h += `<table style="width:100%;border-collapse:collapse;margin-bottom:12px"><tr><td style="background:${cN};color:${corTextoP('diag_nome_rot', '#fff')};font-weight:800;font-size:${fsz('diag_nome_rot', 15)};padding:8px 14px;width:90px;vertical-align:middle;${estCss('diag_nome_rot')}${fonteCss('diag_nome_rot')}">${V(c.rotuloNome ?? 'NOME:')}</td><td style="background:${cV};color:${corTextoP('diag_nome_val', '#3b2f00')};padding:8px 14px;vertical-align:middle;font-size:${fsz('diag_nome_val', corpo)};font-weight:600;${estCss('diag_nome_val')}${fonteCss('diag_nome_val')}">${V('{nome}')}</td></tr></table>` }
  { const cNum = corP('diag_nota_num', '#9b6800'), cFx = corP('diag_nota_faixa', amar); h += `<table style="width:100%;border-collapse:collapse;margin-bottom:14px;border:1px solid ${prim}33"><tr><td style="background:${cNum};color:${corTextoP('diag_nota_num', '#fff')};padding:12px 22px;font-weight:800;width:120px;font-size:${fsz('diag_nota_num', 26)};${fonteCss('diag_nota_num')}">${V('{acertos}')}<span style="font-size:${fsz('diag_nota_num', 16)}">/${V(c.notaTotal)}</span></td><td style="background:${cFx};color:${corTextoP('diag_nota_faixa', '#3b2f00')};padding:12px 18px;font-size:${fsz('diag_nota_faixa', corpo)};font-weight:600;${fonteCss('diag_nota_faixa')}">${V(c.notaTexto)}</td></tr></table>` }
  c.intro.forEach((p, i) => { const cor = corP(`intro:${i}`, '#1a202c'); h += `<p style="font-size:${fsz(`intro:${i}`, corpo)};line-height:1.5;text-align:${alignP(`intro:${i}`, 'justify')};margin:0 0 8px;color:${cor}">${V(p)}</p>` })

  if (c.linguaPortuguesa) {
    const lp = c.linguaPortuguesa
    h += sec(lp.secTitulo || 'Desempenho em Língua Portuguesa')
    if (lp.secIntro) h += `<p style="font-size:${fsz('lingua_intro', corpo)};color:${corP('lingua_intro', '#5a5570')};margin:0 0 8px;line-height:1.4;${fonteCss('lingua_intro')}">${V(lp.secIntro)}</p>`
    const banda = bandaAdaptativa({ nome: lp.titulo, chave: lp.chave, tipoFonte: lp.tipoFonte, totalTxt: lp.totalTxt, bandas: lp.bandas }, vars)
    const bandas = banda ? [banda] : lp.bandas
    const cor = corP('lingua_card', corDoPilar(lp.chave, a.coresPilar ?? {}, prim))
    let card = `<div style="font-size:${fsz('lingua_card', 10)};font-weight:700;color:${cor};letter-spacing:.5px">${esc(lp.titulo)}</div><div style="font-size:${fsz('lingua_card', 24)};font-weight:800;color:${cor}">${V(`{pct_${prefFonte(lp.tipoFonte)}${lp.chave}}`)}</div><div style="font-size:${fsz('lingua_card', corpo)};color:#5a5570;margin-bottom:6px">${V(lp.totalTxt)}</div>`
    for (const b of bandas) card += `${!banda ? `<div style="font-size:${fsz('lingua_card', corpo)};font-weight:700;color:${cor}">${esc(b.faixa)}</div>` : ''}${b.texto ? `<div style="font-size:${fsz('lingua_card', corpo)};color:#243b53;line-height:1.4;text-align:${alignP('lingua_card', 'justify')};margin-bottom:6px">${V(b.texto)}</div>` : ''}`
    h += `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:10px"><tr><td style="background:#fff2cc;border:1px solid ${cor}22;padding:10px">${card}</td></tr></table>`
  }
  if (c.pilares.length) {
    h += sec('Desempenho por pilar')
    h += '<table style="width:100%;border-collapse:separate;border-spacing:10px 0"><tr style="vertical-align:top">'
    c.pilares.forEach((pl, i) => {
      const banda = bandaAdaptativa(pl, vars)
      const bandas = banda ? [banda] : pl.bandas
      const pk = `pilar:${i}`
      const cor = corP(pk, prim)
      let card = `<div style="font-size:${fsz(pk, 10)};font-weight:700;color:${cor};letter-spacing:.5px">${esc(pl.nome)}</div><div style="font-size:${fsz(pk, 24)};font-weight:800;color:${cor}">${pl.chave ? V(`{pct_${prefFonte(pl.tipoFonte)}${pl.chave}}`) : 'X%'}</div><div style="font-size:${fsz(pk, corpo)};color:#5a5570;margin-bottom:6px">${V(pl.totalTxt)}</div>`
      for (const b of bandas) card += `${!banda ? `<div style="font-size:${fsz(pk, corpo)};font-weight:700;color:${cor}">${esc(b.faixa)}</div>` : ''}${b.texto ? `<div style="font-size:${fsz(pk, corpo)};color:#243b53;line-height:1.4;text-align:${alignP(pk, 'justify')};margin-bottom:6px">${V(b.texto)}</div>` : ''}`
      h += `<td style="width:33%;background:#fff2cc;border:1px solid ${cor}22;padding:10px">${card}</td>`
    })
    h += '</tr></table>'
  }

  const discs: DiscBanco[] = disc.length ? disc : c.disciplinas.map((d) => ({ nome: d.nome, chave: d.chave || slugDiag(d.nome) }))
  if (discs.length) {
    h += sec('Desempenho por disciplina')
    if (c.disciplinasIntro) h += `<p style="font-size:${fsz('disc_intro', corpo)};color:${corP('disc_intro', '#5a5570')};margin:0 0 8px;line-height:1.4">${V(c.disciplinasIntro)}</p>`
    for (const d of discs) {
      const assuntos = (vars[`assuntos_${d.chave}`] ?? '').split('\n').map((s) => s.trim()).filter(Boolean)
      const asHtml = assuntos.length ? assuntos.map((x) => `<div style="font-size:${fsz(`disc:${d.chave}`, corpo)};color:#5a5570;font-style:italic">- ${esc(x)}</div>`).join('') : `<div style="font-size:${fsz(`disc:${d.chave}`, corpo)};color:#5a5570;font-style:italic">- Assuntos das questões erradas</div>`
      const corDisc = corP(`disc:${d.chave}`, (a.coresDisc ?? {})[d.chave] || corDoPilar(d.pilar, a.coresPilar ?? {}, amar))
      h += `<table style="width:100%;border-collapse:collapse;margin-bottom:5px;border-top:3px solid ${corDisc};background:#f5f3ff;break-inside:avoid;page-break-inside:avoid"><tr><td style="padding:6px 10px"><div style="font-size:${fsz(`disc:${d.chave}`, 11)};font-weight:700;color:${prim}">${esc(d.nome)}</div>${asHtml}</td><td style="padding:6px 10px;text-align:right;white-space:nowrap;font-size:${fsz(`disc:${d.chave}`, 11)}"><span style="color:#9590b0">${V(`{acerto_${d.chave}}`)}/${V(`{total_${d.chave}}`)}</span> <span style="font-weight:800;color:#9a6e00">${V(`{pct_${d.chave}}`)}</span></td></tr></table>`
    }
  }

  if (c.sugestoes.length) {
    h += sec('Sugestões de estudo')
    c.sugestoes.forEach((s, si) => {
      // Todos os tópicos num só bloco (introdução separada); marcadores `>`/`>>` coloridos.
      const it = s.itens.length ? `<div style="font-size:${fsz(`sug:${si}`, corpo)};line-height:1.5;text-align:${alignP(`sug:${si}`, 'justify')}">${formatarMarcadores(preencher(topicosParaTexto(s.itens), vars), c.corMarcador, c.corMarcadorForte)}</div>` : ''
      const cor = corP(`sug:${si}`, '#fdf3d0')
      h += `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:10px"><tr><td style="background:${cor};padding:5px 12px;font-weight:800;font-size:${fsz(`sug:${si}`, 11)};color:${s.corTitulo || '#9a6e00'}">${V(s.titulo)}</td><td style="background:${cor};padding:5px 12px;text-align:right;font-weight:700;font-size:${fsz(`sug:${si}`, 10)};color:#9a6e00">${s.prioridade ? '[!] ' + V(s.prioridade) : ''}</td></tr><tr><td colspan="2" style="background:#f0eeff;padding:8px 12px">${s.intro ? `<p style="font-size:${fsz(`sug:${si}`, corpo)};margin:0 0 6px;line-height:1.4;text-align:${alignP(`sug:${si}`, 'justify')}">${V(s.intro)}</p>` : ''}${it}</td></tr></table>`
    })
  }
  if ((c.fechamento?.length ?? 0) > 0) {
    (c.fechamento ?? []).forEach((p, i) => { const cor = corP(`fechamento:${i}`, '#1a202c'); h += `<p style="font-size:${fsz(`fechamento:${i}`, corpo)};line-height:1.5;text-align:${alignP(`fechamento:${i}`, 'justify')};margin:0 0 8px;color:${cor}">${V(p)}</p>` })
  }
  if (c.gabaritoObs.length || c.gabaritoIntro.length) {
    h += sec(c.gabaritoTitulo || 'Gabarito oficial desatualizado')
    c.gabaritoIntro.forEach((p, i) => { const cor = corP(`gabIntro:${i}`, '#243b53'); h += `<p style="font-size:${fsz(`gabIntro:${i}`, corpo)};margin:0 0 6px;line-height:1.4;text-align:${alignP(`gabIntro:${i}`, 'justify')};color:${cor}">${V(p)}</p>` })
    if (c.gabaritoObs.length) { const cor = corP('gab_obs', '#a32d2d'); h += `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr><td style="background:#f5f3ff;border-top:3px solid ${cor};padding:6px 10px">${c.gabaritoObs.map((o) => `<div style="font-size:${fsz('gab_obs', corpo)};color:#5a5570">${V(o)}</div>`).join('')}</td></tr></table>` }
  }
  return h
}

function htmlCaderno(item: ItemCaderno, qs: PreviewQuestao[]): string {
  const a = item.ajustes
  const corP = (parte: string, def: string) => (a.coresParte ?? {})[parte] || def
  let h = ''
  if (a.mostrarCabecalho) h += `<div style="font-size:24px;font-weight:800;color:${corP('cab_titulo', a.corPrimaria)}">${esc(a.titulo || 'Simulado')}</div><div style="height:3px;width:120px;background:${corP('cab_linha', a.corSecundaria)};margin:6px 0 16px"></div>`
  for (const q of qs) {
    h += `<div style="margin-bottom:14px"><div style="font-size:13px;line-height:1.5;margin-bottom:6px"><b>${q.numero}.</b> ${esc(q.enunciado)}</div><div style="margin-left:16px">`
    for (const alt of q.alternativas.slice(0, a.numAlternativas)) {
      const g = a.mostrarGabarito && alt.correta
      h += `<div style="font-size:12px;line-height:1.5;${g ? `font-weight:700;color:${a.corPrimaria}` : ''}">${g ? '&#9745;' : '&#9675;'} ${esc(alt.letra)}) ${esc(alt.texto)}</div>`
    }
    h += '</div>'
    const cm = q.alternativas.find((x) => x.correta)?.comentario
    if (a.mostrarComentarios && cm) h += `<div style="margin:6px 0 0 16px;padding:6px 10px;background:${a.corPrimaria}0d;border:1px solid ${a.corPrimaria}33;border-radius:6px;font-size:11px"><b style="color:${a.corPrimaria}">Comentário:</b> ${esc(cm)}</div>`
    h += '</div>'
  }
  return h
}

function htmlFolha(item: ItemCaderno, qs: PreviewQuestao[]): string {
  const a = item.ajustes
  const corP = (parte: string, def: string) => (a.coresParte ?? {})[parte] || def
  const L = ['A', 'B', 'C', 'D', 'E', 'F']
  const total = qs.length || 20
  let h = ''
  if (a.mostrarCabecalho) h += `<div style="font-size:24px;font-weight:800;color:${corP('cab_titulo', a.corPrimaria)}">${esc(a.titulo || 'Simulado')}</div><div style="height:3px;width:120px;background:${corP('cab_linha', a.corSecundaria)};margin:6px 0 16px"></div>`
  h += '<table style="border-collapse:collapse"><tr>'
  for (let n = 1; n <= total; n++) {
    const bolhas = L.slice(0, a.numAlternativas).map((l) => `<span style="display:inline-block;width:18px;height:18px;line-height:16px;text-align:center;border:1.5px solid ${a.corPrimaria}88;border-radius:50%;font-size:9px;color:${a.corPrimaria};margin-right:2px">${l}</span>`).join('')
    h += `<td style="padding:3px 10px;white-space:nowrap"><b style="font-size:11px;color:#64748b">${String(n).padStart(2, '0')}</b> ${bolhas}</td>`
    if (n % a.colunas === 0) h += '</tr><tr>'
  }
  h += '</tr></table>'
  return h
}

export function gerarHtmlItem(item: ItemCaderno, opts: { vars?: Record<string, string>; questoes?: PreviewQuestao[]; disciplinas?: DiscBanco[] }): string {
  const a = item.ajustes
  const vars = opts.vars ?? {}
  const corpo = item.modalidade === 'diagnostico'
    ? htmlDiagnostico(item, vars, opts.disciplinas ?? [])
    : item.modalidade === 'folha_respostas'
      ? htmlFolha(item, opts.questoes ?? [])
      : htmlCaderno(item, opts.questoes ?? [])
  const titulo = esc(a.titulo || 'Caderno')
  const capa = a.capaUrl ? `<div style="margin-bottom:16px"><img src="${esc(a.capaUrl)}" style="width:100%;display:block" /></div>` : ''
  const cab = a.cabecalhoUrl ? `<img src="${esc(a.cabecalhoUrl)}" style="width:100%;display:block;margin-bottom:12px" />` : ''
  const rod = a.rodapeUrl ? `<img src="${esc(a.rodapeUrl)}" style="width:100%;display:block;margin-top:16px" />` : ''
  const bg = a.folhaUrl ? `background-image:url('${esc(a.folhaUrl)}');background-size:cover;` : ''
  // Conteúdo numa TABELA centralizada de largura fixa (o Word ignora max-width/margin:auto de div, mas
  // respeita largura de tabela) + página A4 com margens via @page/mso → download fiel à prévia.
  return `<!doctype html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${titulo}</title>`
    + `<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom><w:DoNotOptimizeForBrowser/></w:WordDocument></xml><![endif]-->`
    + `<style>@page{size:A4;margin:1.4cm}body{font-family:Arial,Helvetica,sans-serif;color:#1a202c}img{max-width:100%}</style></head>`
    + `<body>${bg ? `<div style="${bg}padding:1px">` : ''}<table role="presentation" align="center" width="720" cellpadding="0" cellspacing="0" style="width:720px;margin:0 auto;border-collapse:collapse"><tr><td>${cab}${capa}${corpo}${rod}</td></tr></table>${bg ? '</div>' : ''}</body></html>`
}
