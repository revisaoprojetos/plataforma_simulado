'use client'

// Prévia A4 PAGINADA do construtor de teste. Monta o conteúdo do grupo em blocos, mede as alturas
// num passe escondido e distribui em folhas A4 (794×1123) de verdade — capa como página própria,
// páginas separadas por espaço, cada uma com imagem de folha (fundo), cabeçalho e rodapé.

import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ItemCaderno, PreviewQuestao } from './tipos'
import { DIAG_PADRAO, slugDiag, topicosParaTexto, prefFonte, type DiagPilar } from './diagnostico'
import { CORES_PILAR_PADRAO } from './tipos'
import { formatarInline, formatarMarcadores } from './formato'
import { cssDaFonte } from '@/lib/caderno-designer/theme'

const A4_W = 794
const A4_H = 1123
const LETRAS = ['A', 'B', 'C', 'D', 'E', 'F']

export type DiscBanco = { nome: string; chave: string; pilar?: string }
/** Tipo de bloco (p/ ícone no painel de estrutura). */
export type TipoBloco = 'cabecalho' | 'nome' | 'nota' | 'texto' | 'secao' | 'card' | 'desempenho'
/** Uma entrada da estrutura (outline) do diagnóstico: nó renderizado + metadados p/ o painel.
 * `parte` = alvo da edição; `apagar` = alvo da remoção (às vezes diferente, ex.: parágrafos do gabarito). */
export type DiagEntrada = { key: string; node: ReactNode; label: string; tipo: TipoBloco; parte: string; removivel: boolean; apagar: string }
/** Cor de um pilar: config do grupo → padrão → cor secundária. */
function corDoPilar(slug: string | undefined, coresPilar: Record<string, string>, fallback: string): string {
  if (!slug) return fallback
  return coresPilar?.[slug] || CORES_PILAR_PADRAO[slug] || fallback
}

/** Troca {token} pelos valores do aluno/banco. */
function applyVars(t: string, vars: Record<string, string>): string {
  return (t || '').replace(/\{\s*([\w-]+)\s*\}/g, (m, k) => (k in vars ? vars[k] : m))
}
/** applyVars + placeholders para variáveis ainda sem dado (modelo sem aluno mostra X/N). */
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
/** Banda de texto que casa com o % do pilar (0-49/50-80/81-100). null quando não há dado (mostra todas). */
function bandaAdaptativa(pilar: DiagPilar, vars: Record<string, string>): { faixa: string; texto: string } | null {
  const raw = pilar.chave ? vars[`pct_${prefFonte(pilar.tipoFonte)}${pilar.chave}`] : undefined
  if (raw == null) return null
  const n = parseFloat(String(raw).replace('%', '').replace(',', '.'))
  if (isNaN(n)) return null
  const faixa = n <= 49 ? '0-49' : n <= 80 ? '50-80' : '81-100'
  return pilar.bandas.find((b) => b.faixa === faixa) ?? pilar.bandas[0] ?? null
}

const QUESTOES_EXEMPLO: PreviewQuestao[] = [
  { id: 'ex1', numero: 1, tipo: 'objetiva', enunciado: 'Exemplo: assinale a alternativa correta sobre o princípio da legalidade na Administração Pública.', alternativas: [
    { letra: 'A', texto: 'O administrador pode fazer tudo que a lei não proíbe.', correta: false, comentario: '' },
    { letra: 'B', texto: 'O administrador só pode fazer o que a lei autoriza.', correta: true, comentario: 'A legalidade estrita rege a Administração (art. 37, CF).' },
    { letra: 'C', texto: 'A legalidade não se aplica aos atos discricionários.', correta: false, comentario: '' },
    { letra: 'D', texto: 'A moralidade substitui a legalidade.', correta: false, comentario: '' },
    { letra: 'E', texto: 'Nenhuma das anteriores.', correta: false, comentario: '' },
  ] },
  { id: 'ex2', numero: 2, tipo: 'objetiva', enunciado: 'Exemplo: sobre controle de constitucionalidade, é correto afirmar que…', alternativas: [
    { letra: 'A', texto: 'O controle difuso é exercido apenas pelo STF.', correta: false, comentario: '' },
    { letra: 'B', texto: 'O controle concentrado pode ser feito por qualquer juiz.', correta: false, comentario: '' },
    { letra: 'C', texto: 'A ADI é instrumento do controle concentrado.', correta: true, comentario: 'A ADI é julgada originariamente pelo STF.' },
    { letra: 'D', texto: 'Não existe controle preventivo no Brasil.', correta: false, comentario: '' },
    { letra: 'E', texto: 'O efeito é sempre inter partes.', correta: false, comentario: '' },
  ] },
]

type Interativo = { selParte?: string; onPick?: (parte: string, label: string, cor: string, anchor: DOMRect) => void }

/** Monta os blocos (nós) do conteúdo do grupo, em ordem — a paginação distribui isso em folhas. */
function blocosDoItem(item: ItemCaderno, qs: PreviewQuestao[], vars: Record<string, string>, discBanco: DiscBanco[], inter?: Interativo, sink?: { entradas?: DiagEntrada[] }): ReactNode[] {
  const a = item.ajustes
  const base = a.compacto ? 10 : 12
  const corpo = a.compacto ? 9 : 10 // tamanho ÚNICO do CORPO do texto (todos os blocos/cards); título/% seguem em destaque
  // Texto com formatação inline (**negrito**, *itálico*, <u>sublinhado</u>) já com variáveis aplicadas.
  const V = (t: string): ReactNode => <span dangerouslySetInnerHTML={{ __html: formatarInline(preencher(t, vars)) }} />
  // Vm = como V, mas colore os marcadores `>`/`>>` no início de cada linha (tópicos).
  const corMk = item.conteudo?.corMarcador ?? '#3b5bdb', corMkF = item.conteudo?.corMarcadorForte ?? '#e8850c'
  const Vm = (t: string): ReactNode => <span dangerouslySetInnerHTML={{ __html: formatarMarcadores(preencher(t, vars), corMk, corMkF) }} />
  const out: ReactNode[] = []

  // Cor individual por PARTE (clique na prévia): coresParte[parte] sobrepõe a cor padrão do bloco.
  const corP = (parte: string, def: string) => (a.coresParte ?? {})[parte] || def
  // Alinhamento por PARTE (override sobre o padrão do bloco).
  const alignP = (parte: string, def: any) => ((a.alinhamentoParte ?? {})[parte] as any) || def
  // Cor do TEXTO por PARTE (cascata para os filhos que não têm cor própria — ex.: "0/100").
  const corTextoP = (parte: string, def: any) => (a.coresTextoParte ?? {})[parte] || def
  // Multiplicador de TAMANHO do texto por PARTE (1 = padrão). Usado no atr e nos textos internos dos cards.
  const escP = (parte: string) => (a.tamanhoParte ?? {})[parte] ?? 1
  const fs = (parte: string, px: number) => Math.round(px * escP(parte) * 10) / 10
  // Props (style + clique) para tornar qualquer bloco selecionável na prévia e destacá-lo quando ativo.
  // Aplica também o alinhamento por parte (herdado pelos textos filhos).
  const atr = (parte: string, label: string, cor: string, baseStyle: any): { style: any; onClick?: (e: any) => void; title?: string } => {
    const est = (a.estiloParte ?? {})[parte] ?? {}
    const fonte = cssDaFonte((a.fonteParte ?? {})[parte])
    const esc = escP(parte); const fsBase = (baseStyle as any)?.fontSize
    const style = { ...baseStyle, textAlign: alignP(parte, baseStyle?.textAlign), color: corTextoP(parte, baseStyle?.color),
      ...(fonte ? { fontFamily: fonte } : {}),
      ...(typeof fsBase === 'number' && esc !== 1 ? { fontSize: Math.round(fsBase * esc * 10) / 10 } : {}),
      ...(est.b ? { fontWeight: 700 } : {}), ...(est.i ? { fontStyle: 'italic' } : {}), ...(est.u ? { textDecoration: 'underline' } : {}) }
    if (!inter?.onPick) return { style }
    return {
      style: { ...style, cursor: 'pointer', ...(inter.selParte === parte ? { outline: `2px solid ${cor}`, outlineOffset: -1 } : {}) },
      onClick: (e) => inter!.onPick!(parte, label, cor, (e.currentTarget as HTMLElement).getBoundingClientRect()),
      title: 'Clique para mudar a cor deste bloco',
    }
  }

  const Cabecalho = () => {
    const corT = corP('cab_titulo', a.corPrimaria), corL = corP('cab_linha', a.corSecundaria)
    return (
      <div style={{ marginBottom: 14 }}>
        <div {...atr('cab_titulo', 'Título', corT, { fontSize: a.compacto ? 20 : 26, fontWeight: 800, color: corT, letterSpacing: 0.3 })}>{a.titulo || 'Simulado'}</div>
        <div {...atr('cab_linha', 'Linha do título', corL, { height: 3, background: corL, borderRadius: 2, marginTop: 6, width: 120 })} />
      </div>
    )
  }
  const Dados = () => {
    const corB = corP('dados_borda', a.corPrimaria)
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', border: `1px solid ${corB}33`, overflow: 'hidden', marginBottom: 14 }}>
        {[['Nome', 'João da Silva'], ['CPF', '000.000.000-00'], ['Data', '__/__/____']].map(([r, v], i) => (
          <div key={r} {...atr('dados_borda', 'Dados do aluno', corB, { padding: '8px 12px', borderLeft: i ? `1px solid ${corB}22` : 'none' })}>
            <div style={{ fontSize: 8.5, textTransform: 'uppercase', letterSpacing: 0.5, color: '#94a3b8' }}>{r}</div>
            <div style={{ fontSize: 12, fontWeight: 600 }}>{v}</div>
          </div>
        ))}
      </div>
    )
  }

  if (item.modalidade === 'caderno_questoes') {
    if (a.mostrarCabecalho) out.push(<Cabecalho />)
    if (a.mostrarDadosAluno) out.push(<Dados />)
    for (const q of qs) {
      out.push(
        <div style={{ marginBottom: a.compacto ? 10 : 16 }}>
          <div style={{ fontSize: base + 1, lineHeight: 1.5, marginBottom: 6 }}><strong>{q.numero}.</strong> {q.enunciado}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: a.compacto ? 2 : 4, marginLeft: 14 }}>
            {q.alternativas.slice(0, a.numAlternativas).map((alt) => {
              const g = a.mostrarGabarito && alt.correta
              return <div key={alt.letra} style={{ fontSize: base, lineHeight: 1.45, fontWeight: g ? 700 : 400, color: g ? a.corPrimaria : '#1a202c' }}>{g ? '☑' : '○'} {alt.letra}) {alt.texto}</div>
            })}
          </div>
          {a.mostrarComentarios && q.alternativas.find((x) => x.correta)?.comentario && (
            <div style={{ marginTop: 6, marginLeft: 14, padding: '6px 10px', background: `${a.corPrimaria}0d`, border: `1px solid ${a.corPrimaria}33`, fontSize: base - 1, color: '#334155' }}>
              <strong style={{ color: a.corPrimaria }}>Comentário:</strong> {q.alternativas.find((x) => x.correta)?.comentario}
            </div>
          )}
        </div>,
      )
    }
    return out
  }

  if (item.modalidade === 'folha_respostas') {
    if (a.mostrarCabecalho) out.push(<Cabecalho />)
    if (a.mostrarDadosAluno) out.push(<Dados />)
    const total = qs.length || 20
    const cols = Math.max(1, Math.min(6, a.colunas))
    const linhas = Math.ceil(total / cols)
    for (let r = 0; r < linhas; r++) {
      out.push(
        <div style={{ display: 'flex', gap: 18, marginBottom: a.compacto ? 4 : 7 }}>
          {Array.from({ length: cols }, (_, c) => { const n = r * cols + c + 1; return (
            <div key={c} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, visibility: n <= total ? 'visible' : 'hidden' }}>
              <span style={{ width: 22, fontSize: base - 1, fontWeight: 700, color: '#64748b', textAlign: 'right' }}>{String(n).padStart(2, '0')}</span>
              {LETRAS.slice(0, a.numAlternativas).map((l) => (
                <span key={l} style={{ width: 18, height: 18, borderRadius: '50%', border: `1.5px solid ${a.corPrimaria}88`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: `${a.corPrimaria}cc`, fontWeight: 600 }}>{l}</span>
              ))}
            </div>
          ) })}
        </div>,
      )
    }
    return out
  }

  // Diagnóstico
  const c = item.conteudo ?? DIAG_PADRAO
  const ocultasP = new Set(c.partesOcultas ?? []) // blocos estruturais ocultados (nota/nome/seções)
  const prim = a.corPrimaria, amar = a.corSecundaria
  // Cada faixa de seção é uma parte própria (sec:<t>) — dá para colorir cada uma individualmente.
  // `parte` estável (sec_pilares/sec_disciplinas/…) → cor e TEXTO editáveis (o texto muda sem perder a seleção/cor).
  const Sec = ({ parte, t }: { parte: string; t: string }) => {
    const cor = corP(parte, prim)
    return <div {...atr(parte, t, cor, { background: cor, color: '#fff', fontWeight: 700, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', padding: '6px 12px', borderRadius: 2, margin: '3px 0 7px' })}>{V(t)}</div>
  }
  // Coleta as entradas (blocos) com CHAVE — depois aplica a ordem salva (c.ordem) e alimenta o outline.
  const entradas: DiagEntrada[] = []
  const add = (key: string, node: ReactNode, label: string, tipo: TipoBloco, parte: string, removivel = true, apagar = parte) => entradas.push({ key, node, label, tipo, parte, removivel, apagar })
  if (a.mostrarCabecalho) { const cor = corP('diag_cab', prim); add('diag_cab', (
    <div {...atr('diag_cab', 'Cabeçalho', cor, { background: cor, color: '#fff', padding: '12px 16px' })}>
      <div style={{ fontSize: fs('diag_cab', 20), fontWeight: 800 }}>{V(c.tituloCabecalho ?? 'Diagnóstico de Desempenho')}</div>
      {c.subtitulo && <div style={{ fontSize: fs('diag_cab', 11), opacity: 0.85, marginTop: 2 }}>{V(c.subtitulo)}</div>}
    </div>
  ), 'Cabeçalho', 'cabecalho', 'diag_cab', true) }
  if (a.mostrarDadosAluno && !ocultasP.has('nome')) { const corN = corP('diag_nome_rot', prim), corV = corP('diag_nome_val', amar); add('diag_nome', (
    <div style={{ display: 'flex', overflow: 'hidden' }}>
      <div {...atr('diag_nome_rot', 'Rótulo NOME', corN, { background: corN, color: '#fff', fontWeight: 800, fontSize: 14, padding: '8px 14px', whiteSpace: 'nowrap' })}>{V(c.rotuloNome ?? 'NOME:')}</div>
      <div {...atr('diag_nome_val', 'Faixa do nome', corV, { background: corV, color: '#3b2f00', flex: 1, padding: '8px 14px', fontSize: corpo, fontWeight: 600 })}>{V('{nome}')}</div>
    </div>
  ), 'Dados do aluno', 'nome', 'diag_nome_rot', true) }
  if (!ocultasP.has('nota')) { const corNum = corP('diag_nota_num', '#9b6800'), corFx = corP('diag_nota_faixa', amar); add('diag_nota', (
    <div style={{ display: 'flex', border: `1px solid ${prim}33`, overflow: 'hidden' }}>
      <div {...atr('diag_nota_num', 'Bloco da nota', corNum, { background: corNum, color: '#fff', padding: '10px 20px', display: 'flex', alignItems: 'baseline' })}><span style={{ fontSize: fs('diag_nota_num', 32), fontWeight: 800 }}>{V('{acertos}')}</span><span style={{ fontSize: fs('diag_nota_num', 16), fontWeight: 700 }}>/{V(c.notaTotal)}</span></div>
      <div {...atr('diag_nota_faixa', 'Faixa da nota', corFx, { background: corFx, color: '#3b2f00', flex: 1, display: 'flex', alignItems: 'center', padding: '10px 16px', fontSize: corpo, fontWeight: 600 })}>{V(c.notaTexto)}</div>
    </div>
  ), 'Nota', 'nota', 'diag_nota_num', true) }
  c.intro.forEach((p, i) => { const cor = corP(`intro:${i}`, '#1a202c'); add(`intro:${i}`, <p key={`intro${i}`} {...atr(`intro:${i}`, `Parágrafo de abertura ${i + 1}`, cor, { fontSize: corpo, lineHeight: 1.4, textAlign: 'justify', margin: '0 0 3px', color: cor })}>{V(p)}</p>, `Introdução ${i + 1}`, 'texto', `intro:${i}`, true) })
  if (c.linguaPortuguesa && !ocultasP.has('lingua')) {
    const lp = c.linguaPortuguesa
    add('sec_lingua', <Sec parte="sec_lingua" t={lp.secTitulo || 'Desempenho em Língua Portuguesa'} />, `Seção: ${lp.secTitulo || 'Língua Portuguesa'}`, 'secao', 'sec_lingua', true)
    if (lp.secIntro) { const cor = corP('lingua_intro', '#5a5570'); add('lingua_intro', <p key="lpintro" {...atr('lingua_intro', 'Introdução (Língua Portuguesa)', cor, { fontSize: corpo, color: cor, margin: '0 0 5px', lineHeight: 1.4 })}>{V(lp.secIntro)}</p>, 'Introdução (Língua Portuguesa)', 'texto', 'lingua_intro', true) }
    const banda = bandaAdaptativa({ nome: lp.titulo, chave: lp.chave, tipoFonte: lp.tipoFonte, totalTxt: lp.totalTxt, bandas: lp.bandas }, vars)
    const bandas = banda ? [banda] : lp.bandas
    const cor = corP('lingua_card', corDoPilar(lp.chave, a.coresPilar ?? {}, prim))
    add('lingua_card', (
      <div key="lpcard" {...atr('lingua_card', lp.titulo, cor, { background: '#fff2cc', border: `1px solid ${cor}22`, padding: 8, marginBottom: 4 })}>
        <div style={{ fontSize: fs('lingua_card', 9), fontWeight: 700, color: cor, letterSpacing: 0.5 }}>{V(lp.titulo)}</div>
        <div style={{ fontSize: fs('lingua_card', 22), fontWeight: 800, color: cor, lineHeight: 1.1 }}>{V(`{pct_${prefFonte(lp.tipoFonte)}${lp.chave}}`)}</div>
        <div style={{ fontSize: fs('lingua_card', corpo), color: '#5a5570', marginBottom: 6 }}>{V(lp.totalTxt)}</div>
        {bandas.map((b, j) => (
          <div key={j} style={{ marginBottom: 6 }}>
            {!banda && <div style={{ fontSize: fs('lingua_card', corpo), fontWeight: 700, color: cor }}>{b.faixa}</div>}
            {b.texto && <div style={{ fontSize: fs('lingua_card', corpo), color: '#243b53', lineHeight: 1.4, textAlign: alignP('lingua_card', 'justify') }}>{V(b.texto)}</div>}
          </div>
        ))}
      </div>
    ), `Card: ${lp.titulo}`, 'card', 'lingua_card', true)
  }
  if (c.pilares.length && !ocultasP.has('pilares')) {
    add('sec_pilares', <Sec parte="sec_pilares" t={c.tituloPilares ?? 'Desempenho por pilar'} />, `Seção: ${c.tituloPilares ?? 'Desempenho por pilar'}`, 'secao', 'sec_pilares', true)
    add('pilares', (
      <div style={{ display: 'flex', gap: 14, alignItems: 'stretch', marginBottom: 4 }}>
        {c.pilares.map((pl, i) => {
          const banda = bandaAdaptativa(pl, vars)
          const bandas = banda ? [banda] : pl.bandas // com dado do aluno mostra só a faixa; sem dado, todas (modelo)
          const parte = `pilar:${i}` // ÍNDICE (único) — não a chave, que pode repetir e causar conflito entre cards
          const cor = corP(parte, prim) // destaque do card (nome + %)
          return (
            <div key={i} {...atr(parte, pl.nome, cor, { flex: 1, minWidth: 0, background: '#fff2cc', border: `1px solid ${cor}22`, padding: 8 })}>
              <div style={{ fontSize: fs(parte, 9), fontWeight: 700, color: cor, letterSpacing: 0.5 }}>{V(pl.nome)}</div>
              <div style={{ fontSize: fs(parte, 22), fontWeight: 800, color: cor, lineHeight: 1.1 }}>{pl.chave ? V(`{pct_${prefFonte(pl.tipoFonte)}${pl.chave}}`) : 'X%'}</div>
              <div style={{ fontSize: fs(parte, corpo), color: '#5a5570', marginBottom: 6 }}>{V(pl.totalTxt)}</div>
              {bandas.map((b, j) => (
                <div key={j} style={{ marginBottom: 6 }}>
                  {!banda && <div style={{ fontSize: fs(parte, corpo), fontWeight: 700, color: cor }}>{b.faixa}</div>}
                  {b.texto && <div style={{ fontSize: fs(parte, corpo), color: '#243b53', lineHeight: 1.4, textAlign: alignP(parte, 'justify') }}>{V(b.texto)}</div>}
                </div>
              ))}
            </div>
          )
        })}
      </div>
    ), 'Cards de pilar', 'desempenho', '', true, 'sec_pilares')
  }
  // Disciplinas: do BANCO quando houver (nome+chave reais); senão as do modelo. Assuntos/nº/pct vêm das variáveis.
  const ocultas = new Set(c.discOcultas ?? [])
  const discs: DiscBanco[] = (discBanco.length ? discBanco : c.disciplinas.map((d) => ({ nome: d.nome, chave: d.chave || slugDiag(d.nome) }))).filter((d) => !ocultas.has(d.chave))
  if (discs.length && !ocultasP.has('disciplinas')) {
    add('sec_disciplinas', <Sec parte="sec_disciplinas" t={c.tituloDisciplinas ?? 'Desempenho por disciplina'} />, `Seção: ${c.tituloDisciplinas ?? 'Desempenho por disciplina'}`, 'secao', 'sec_disciplinas', true)
    if (c.disciplinasIntro) { const cor = corP('disc_intro', '#5a5570'); add('disc_intro', <p {...atr('disc_intro', 'Introdução das disciplinas', cor, { fontSize: corpo, color: cor, margin: '0 0 8px', lineHeight: 1.4 })}>{V(c.disciplinasIntro)}</p>, 'Introdução (disciplinas)', 'texto', 'disc_intro') }
    for (const d of discs) {
      const fonte = c.discFonte?.[d.chave] ?? d.chave // disciplina cujos assuntos/estatísticas o card exibe
      const assuntos = (vars[`assuntos_${fonte}`] ?? '').split('\n').map((s) => s.trim()).filter(Boolean)
      // cor da disciplina: parte (coresParte) → individual legado (coresDisc) → cor do pilar → secundária.
      const corDisc = corP(`disc:${d.chave}`, (a.coresDisc ?? {})[d.chave] || corDoPilar(d.pilar, a.coresPilar ?? {}, amar))
      const corTxt = c.discCorTexto?.[d.chave] ?? prim
      add(`disc:${d.chave}`, (
        <div {...atr(`disc:${d.chave}`, d.nome, corDisc, { background: '#f5f3ff', borderTop: `3px solid ${corDisc}`, padding: '6px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 5 })}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: fs(`disc:${d.chave}`, 11), fontWeight: 700, color: corTxt }}>{V(c.discNomes?.[d.chave] ?? d.nome)}</div>
            {assuntos.length
              ? assuntos.map((as, k) => <div key={k} style={{ fontSize: fs(`disc:${d.chave}`, corpo), color: '#5a5570', fontStyle: 'italic' }}>- {V(as)}</div>)
              : <div style={{ fontSize: fs(`disc:${d.chave}`, corpo), color: '#5a5570', fontStyle: 'italic' }}>- Assuntos das questões erradas</div>}
          </div>
          <div style={{ fontSize: fs(`disc:${d.chave}`, 11), whiteSpace: 'nowrap' }}><span style={{ color: '#9590b0' }}>{V(`{acerto_${fonte}}`)}/{V(`{total_${fonte}}`)}</span> <span style={{ fontWeight: 800, color: corDisc }}>{V(`{pct_${fonte}}`)}</span></div>
        </div>
      ), c.discNomes?.[d.chave] ?? d.nome, 'card', `disc:${d.chave}`, true)
    }
  }
  if (c.sugestoes.length && !ocultasP.has('sugestoes')) {
    add('sec_sugestoes', <Sec parte="sec_sugestoes" t={c.tituloSugestoes ?? 'Sugestões de estudo'} />, `Seção: ${c.tituloSugestoes ?? 'Sugestões de estudo'}`, 'secao', 'sec_sugestoes', true)
    c.sugestoes.forEach((s, si) => { const cor = corP(`sug:${si}`, '#fdf3d0'); add(`sug:${si}`, (
      <div key={`sug${si}`} {...atr(`sug:${si}`, `Sugestão · ${s.titulo}`, cor, { marginBottom: 10 })}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: cor, padding: '5px 12px' }}>
          <span style={{ fontWeight: 800, fontSize: fs(`sug:${si}`, 11), color: s.corTitulo || '#9a6e00' }}>{V(s.titulo)}</span>
          {s.prioridade && <span style={{ fontWeight: 700, fontSize: fs(`sug:${si}`, 9), color: '#9a6e00' }}>[!] {V(s.prioridade)}</span>}
        </div>
        <div style={{ background: '#f0eeff', padding: '8px 12px' }}>
          {s.intro && <p style={{ fontSize: fs(`sug:${si}`, corpo), margin: '0 0 6px', lineHeight: 1.4, textAlign: alignP(`sug:${si}`, 'justify') }}>{V(s.intro)}</p>}
          {s.itens.length > 0 && <div style={{ fontSize: fs(`sug:${si}`, corpo), lineHeight: 1.5, textAlign: alignP(`sug:${si}`, 'justify') }}>{Vm(topicosParaTexto(s.itens))}</div>}
        </div>
      </div>
    ), `Sugestão · ${s.titulo}`, 'card', `sug:${si}`, true) })
  }
  if ((c.fechamento?.length ?? 0) > 0 && !ocultasP.has('fechamento')) {
    (c.fechamento ?? []).forEach((p, i) => { const cor = corP(`fechamento:${i}`, '#1a202c'); add(`fechamento:${i}`, <p key={`fech${i}`} {...atr(`fechamento:${i}`, `Parágrafo de fechamento ${i + 1}`, cor, { fontSize: corpo, lineHeight: 1.4, textAlign: 'justify', margin: '0 0 3px', color: cor })}>{V(p)}</p>, `Fechamento ${i + 1}`, 'texto', `fechamento:${i}`, true) })
  }
  if ((c.gabaritoObs.length || c.gabaritoIntro.length) && !ocultasP.has('gabarito')) {
    add('sec_gabarito', <Sec parte="sec_gabarito" t={c.gabaritoTitulo || 'Gabarito oficial desatualizado'} />, `Seção: ${c.gabaritoTitulo || 'Gabarito'}`, 'secao', 'sec_gabarito', true)
    c.gabaritoIntro.forEach((p, i) => { const cor = corP(`gabIntro:${i}`, '#243b53'); add(`gab:${i}`, <p key={`gabi${i}`} {...atr(`gabIntro:${i}`, `Gabarito — parágrafo ${i + 1}`, cor, { fontSize: corpo, margin: '0 0 6px', lineHeight: 1.4, textAlign: 'justify', color: cor })}>{V(p)}</p>, `Gabarito — parágrafo ${i + 1}`, 'texto', `gabIntro:${i}`, true, `gabIntro:${i}`) })
    if (c.gabaritoObs.length) { const cor = corP('gab_obs', '#a32d2d'); add('gab_obs', <div {...atr('gab_obs', 'Gabarito — observações', cor, { background: '#f5f3ff', borderTop: `3px solid ${cor}`, padding: '6px 10px' })}>{c.gabaritoObs.map((o, i) => <div key={i} style={{ fontSize: fs('gab_obs', corpo), color: '#5a5570' }}>{V(o)}</div>)}</div>, 'Gabarito — observações', 'card', 'gab_obs', true, 'gab_obs') }
  }
  // Aplica a ordem salva (c.ordem): chaves listadas primeiro (na ordem), o resto mantém a ordem natural.
  const ordemSalva = c.ordem ?? []
  const mapaE = new Map(entradas.map((e) => [e.key, e]))
  const vistos = new Set<string>()
  const ordenadas: DiagEntrada[] = []
  for (const k of ordemSalva) { const e = mapaE.get(k); if (e && !vistos.has(k)) { ordenadas.push(e); vistos.add(k) } }
  for (const e of entradas) if (!vistos.has(e.key)) ordenadas.push(e)
  if (sink) sink.entradas = ordenadas
  return ordenadas.map((e) => e.node)
}

/** Estrutura (outline) do diagnóstico na ordem atual — usado pelo painel de estrutura do builder. */
export function outlineDoItem(item: ItemCaderno, questoes: PreviewQuestao[], vars: Record<string, string>, discBanco: DiscBanco[]): DiagEntrada[] {
  if (item.modalidade !== 'diagnostico') return []
  const sink: { entradas?: DiagEntrada[] } = {}
  blocosDoItem(item, questoes.length ? questoes : QUESTOES_EXEMPLO, vars, discBanco, undefined, sink)
  return sink.entradas ?? []
}

/** Uma folha A4 (fundo + cabeçalho + conteúdo + rodapé) ou a capa (página inteira). */
function Folha({ item, num, total, pad, Ht, Hf, capa, children }: { item: ItemCaderno; num: number; total: number; pad: number; Ht: number; Hf: number; capa?: boolean; children?: ReactNode }) {
  const a = item.ajustes
  return (
    <div style={{ width: A4_W, height: A4_H, position: 'relative', overflow: 'hidden', background: '#fff', color: '#1a202c', boxShadow: '0 2px 20px rgba(0,0,0,.16)', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {a.folhaUrl && <img src={a.folhaUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
      {capa ? (
        a.capaUrl && <img src={a.capaUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 1 }} />
      ) : (
        <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', flexDirection: 'column' }}>
          <div style={{ height: Ht, flexShrink: 0, overflow: 'hidden' }}>
            {a.cabecalhoUrl && <img src={a.cabecalhoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
          </div>
          <div style={{ flex: 1, minHeight: 0, padding: `8px ${pad}px`, overflow: 'hidden' }}>{children}</div>
          <div style={{ height: Hf, flexShrink: 0, position: 'relative', overflow: 'hidden' }}>
            {a.rodapeUrl && <img src={a.rodapeUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
          </div>
        </div>
      )}
    </div>
  )
}

export function Previa({ item, questoes, vars = {}, discBanco = [], onPick, selParte }: { item: ItemCaderno; questoes: PreviewQuestao[]; vars?: Record<string, string>; discBanco?: DiscBanco[]; onPick?: (parte: string, label: string, cor: string, anchor: DOMRect) => void; selParte?: string }) {
  const a = item.ajustes
  const qs = questoes.length ? questoes : QUESTOES_EXEMPLO
  const pad = a.compacto ? 40 : 56
  const GAP = a.compacto ? 8 : 12 // espaço entre blocos (contado na paginação, fielmente)
  const Ht = a.cabecalhoUrl ? 96 : pad + 16 // um pouco mais de respiro no topo
  const Hf = a.rodapeUrl ? 84 : 34
  const contentW = A4_W - 2 * pad
  const availH = A4_H - Ht - Hf - 16

  const onPickRef = useRef(onPick); onPickRef.current = onPick
  const varsKey = useMemo(() => JSON.stringify(vars), [vars])
  const discKey = useMemo(() => JSON.stringify(discBanco), [discBanco])
  const blocos = useMemo(() => blocosDoItem(item, qs, vars, discBanco, { selParte, onPick: (p, n, cor, an) => onPickRef.current?.(p, n, cor, an) }), [item, qs, varsKey, discKey, selParte]) // eslint-disable-line react-hooks/exhaustive-deps
  const medRef = useRef<HTMLDivElement>(null)
  const [paginas, setPaginas] = useState<number[][] | null>(null)
  // A chave deve mudar sempre que a ALTURA renderizada muda: qtd de blocos, ajustes (fontes/compacto),
  // conteúdo dos textos, variáveis (nome/estatísticas) e disciplinas do banco. Sem isso, editar um texto
  // maior não re-pagina e o último bloco vaza atrás do rodapé.
  const chave = useMemo(() => JSON.stringify({ n: blocos.length, a, c: item.conteudo, v: varsKey, d: discKey }), [blocos.length, a, item.conteudo, varsKey, discKey])

  useLayoutEffect(() => {
    const cont = medRef.current; if (!cont) return
    let cancel = false
    const medir = () => {
      if (cancel || !medRef.current) return
      const kids = Array.from(medRef.current.children) as HTMLElement[]
      if (!kids.length) { setPaginas([[]]); return }
      // O div de medição espelha a folha (mesmos wrappers com marginBottom: GAP). Medimos o TOPO de
      // cada bloco: o delta até o próximo é a altura REAL + espaçamento real (com colapso de margens),
      // idêntico à renderização. Assim nada é empurrado com espaço sobrando nem cortado.
      const tops = kids.map((el) => el.getBoundingClientRect().top)
      const hs = kids.map((el, i) => (i < kids.length - 1 ? tops[i + 1] : el.getBoundingClientRect().bottom) - tops[i])
      const BUF = 10 // folga p/ sub-pixel/diferenças de render — melhor sobrar espaço do que vazar no rodapé
      const pages: number[][] = []; let cur: number[] = []; let h = 0
      for (let i = 0; i < hs.length; i++) {
        if (cur.length && h + hs[i] > availH - BUF) { pages.push(cur); cur = [i]; h = hs[i] }
        else { cur.push(i); h += hs[i] }
      }
      if (cur.length) pages.push(cur)
      setPaginas(pages.length ? pages : [[]])
    }
    medir() // 1ª medição imediata (evita flash)
    // Remede DEPOIS que as fontes carregam — antes disso o texto mede menor e um card "cabe"
    // na conta mas renderiza mais alto e é cortado no fim da folha.
    ;(async () => { try { await (document as any).fonts?.ready } catch { /* noop */ } medir() })()
    return () => { cancel = true }
  }, [chave, availH]) // eslint-disable-line react-hooks/exhaustive-deps

  const pages = paginas ?? [blocos.map((_, i) => i)]
  const temCapa = !!a.capaUrl
  const total = (temCapa ? 1 : 0) + pages.length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22 }}>
      {/* passe de medição (escondido) */}
      <div ref={medRef} aria-hidden style={{ position: 'absolute', left: -99999, top: 0, width: contentW }}>
        {blocos.map((b, i) => <div key={i} style={{ marginBottom: GAP }}>{b}</div>)}
      </div>
      {temCapa && <Folha item={item} num={1} total={total} pad={pad} Ht={Ht} Hf={Hf} capa />}
      {pages.map((idxs, pi) => (
        <Folha key={pi} item={item} num={(temCapa ? 1 : 0) + pi + 1} total={total} pad={pad} Ht={Ht} Hf={Hf}>
          {idxs.map((i) => <div key={i} style={{ marginBottom: GAP }}>{blocos[i]}</div>)}
        </Folha>
      ))}
    </div>
  )
}
