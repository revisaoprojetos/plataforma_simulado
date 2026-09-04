'use client'

// Prévia A4 PAGINADA do construtor de teste. Monta o conteúdo do grupo em blocos, mede as alturas
// num passe escondido e distribui em folhas A4 (794×1123) de verdade — capa como página própria,
// páginas separadas por espaço, cada uma com imagem de folha (fundo), cabeçalho e rodapé.

import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ItemCaderno, PreviewQuestao, CapaConfig } from './tipos'
import { DIAG_PADRAO, slugDiag, topicosParaTexto, prefFonte, type DiagPilar, type DiagSugestao } from './diagnostico'
import { CORES_PILAR_PADRAO, CAPA_PADRAO } from './tipos'
import { formatarInline, formatarMarcadores } from './formato'
import { cssDaFonte, resolveTheme } from '@/lib/caderno-designer/theme'
import { BlockRender, createBlock } from '@/lib/caderno-designer/blocks'
import { montarCadernoData, docDoPreset } from './previa-blocos'

const A4_W = 794
const A4_H = 1123
const LETRAS = ['A', 'B', 'C', 'D', 'E', 'F']

// Bloco "Dados do estudante" = o MESMO bloco `identificacao` da Folha de Respostas — EXTRAÍDO do preset
// (não uma cópia). Procura no caderno-objetivo (folha); cai em outros presets / no default se não achar.
function acharIdentificacao(bs: any[]): any { for (const b of (bs ?? [])) { if (b?.type === 'identificacao') return b; const d = b?.innerBlocks ? acharIdentificacao(b.innerBlocks) : null; if (d) return d } return null }
function blocoDadosEstudante(): any {
  for (const pid of ['caderno-objetivo', 'caderno-perguntas', 'caderno-completo']) {
    const doc = docDoPreset(pid); if (!doc) continue
    for (const p of doc.pages) { const b = acharIdentificacao(p.blocks as any[]); if (b) return b }
  }
  return createBlock('identificacao')
}

export type DiscBanco = { nome: string; chave: string; pilar?: string }
/** Tipo de bloco (p/ ícone no painel de estrutura). */
export type TipoBloco = 'cabecalho' | 'nome' | 'nota' | 'texto' | 'secao' | 'card' | 'desempenho'
/** Uma entrada da estrutura (outline) do diagnóstico: nó renderizado + metadados p/ o painel.
 * `parte` = alvo da edição; `apagar` = alvo da remoção (às vezes diferente, ex.: parágrafos do gabarito). */
export type DiagEntrada = { key: string; node: ReactNode; label: string; tipo: TipoBloco; parte: string; removivel: boolean; apagar: string; juntar?: boolean; outlineOculto?: boolean }
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
    if (k === 'email') return 'aluno@email.com'
    if (k === 'tempo_total' || k === 'tempo') return '—'
    if (k === 'data' || k === 'inicio' || k === 'termino' || k === 'respondidas' || k === 'em_branco') return '—'
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
  // Cor de FUNDO por PARTE (cards com fundo editável — disciplina/sugestão individual).
  const corFundoP = (parte: string, def: any) => (a.coresFundoParte ?? {})[parte] || def
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
      onClick: (e) => { e.stopPropagation(); inter!.onPick!(parte, label, cor, (e.currentTarget as HTMLElement).getBoundingClientRect()) },
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

  if (item.modalidade === 'caderno_questoes' || item.modalidade === 'caderno_completo') {
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
    const cor = a.corPrimaria, corSec = a.corSecundaria
    // Card de título/subtítulo (formato AGU) — barra colorida com o nome do simulado.
    const corHead = corP('folha_head', cor)
    out.push(
      <div {...atr('folha_head', 'Cabeçalho (título/subtítulo)', corHead, { background: corHead, color: '#fff', padding: a.compacto ? '10px 16px' : '14px 18px', borderRadius: 6, marginBottom: 12 })}>
        <div style={{ fontSize: fs('folha_head', a.compacto ? 18 : 22), fontWeight: 800, letterSpacing: 0.3 }}>{a.titulo || 'Folha de Respostas'}</div>
        <div style={{ fontSize: 11, opacity: 0.9, marginTop: 2 }}>{V('{simulado}')}</div>
      </div>,
    )
    // Card "Dados do estudante" — faixa + tabela com as variáveis do aluno.
    const corDados = corP('folha_dados', cor)
    out.push(
      <div {...atr('folha_dados', 'Dados do estudante', corDados, { border: `1px solid ${corDados}44`, borderRadius: 6, overflow: 'hidden', marginBottom: 12 })}>
        <div style={{ background: corDados, color: '#fff', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', padding: '5px 12px' }}>Dados do estudante</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1.6fr 1fr 1fr' }}>
          {[['Nome', V('{nome}') || 'Nome do aluno'], ['E-mail', V('{email}') || 'email@exemplo.com'], ['CPF', V('{cpf}') || '000.000.000-00'], ['Data', '__/__/____']].map(([r, v], i) => (
            <div key={r as string} style={{ padding: '7px 12px', borderLeft: i ? `1px solid ${corDados}22` : 'none' }}>
              <div style={{ fontSize: 8.5, textTransform: 'uppercase', letterSpacing: 0.5, color: '#94a3b8' }}>{r}</div>
              <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v}</div>
            </div>
          ))}
        </div>
      </div>,
    )

    const total = qs.length || 20
    const cols = Math.max(1, Math.min(6, a.colunas))
    const linhas = Math.ceil(total / cols)
    const comGab = a.mostrarGabarito // preenche a bolha da alternativa OFICIAL (gabarito)
    const letraCorretaDe = (n: number): string | undefined => qs[n - 1]?.alternativas.find((x) => x.correta)?.letra
    const bolha = (l: string, correta: boolean) => (
      <span key={l} style={{
        width: 18, height: 18, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700,
        border: `1.5px solid ${correta ? cor : cor + '88'}`,
        background: correta ? cor : 'transparent', color: correta ? '#fff' : `${cor}cc`,
      }}>{l}</span>
    )
    // Faixa de seção (Gabarito oficial × grade em branco).
    const corSecao = corP('folha_secao', comGab ? cor : corSec)
    out.push(
      <div {...atr('folha_secao', 'Faixa da seção', corSecao, { background: corSecao, color: '#fff', textAlign: 'center', fontSize: 10.5, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', padding: '5px', borderRadius: 4, marginBottom: 10 })}>
        {comGab ? 'Gabarito oficial' : 'Gabarito de alternativas'}
      </div>,
    )
    for (let r = 0; r < linhas; r++) {
      out.push(
        <div style={{ display: 'flex', gap: 18, marginBottom: a.compacto ? 4 : 7 }}>
          {Array.from({ length: cols }, (_, c) => { const n = r * cols + c + 1; const corr = comGab ? letraCorretaDe(n) : undefined; return (
            <div key={c} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, visibility: n <= total ? 'visible' : 'hidden' }}>
              <span style={{ width: 22, fontSize: base - 1, fontWeight: 700, color: '#64748b', textAlign: 'right' }}>{String(n).padStart(2, '0')}</span>
              {LETRAS.slice(0, a.numAlternativas).map((l) => bolha(l, l === corr))}
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
  // Sub-bloco "colado" (continuação de um card): sem gap acima e oculto no outline. Permite que
  // cards grandes (muitos assuntos/itens) QUEBREM entre páginas em vez de vazarem atrás do rodapé.
  const addCont = (key: string, node: ReactNode, parte: string) => entradas.push({ key, node, label: '', tipo: 'card', parte, removivel: false, apagar: parte, juntar: true, outlineOculto: true })
  if (a.mostrarCabecalho) { const cor = corP('diag_cab', prim); add('diag_cab', (
    <div {...atr('diag_cab', 'Cabeçalho (fundo)', cor, { background: cor, color: '#fff', padding: '12px 16px' })}>
      <div {...atr('diag_cab_titulo', 'Título do cabeçalho', corP('diag_cab_titulo', '#fff'), { fontSize: fs('diag_cab_titulo', 20), fontWeight: 800, color: corP('diag_cab_titulo', '#fff') })}>{V(c.tituloCabecalho ?? 'Diagnóstico de Desempenho')}</div>
      {c.subtitulo && <div {...atr('diag_cab_sub', 'Subtítulo do cabeçalho', corP('diag_cab_sub', '#fff'), { fontSize: fs('diag_cab_sub', 11), opacity: 0.85, marginTop: 2, color: corP('diag_cab_sub', '#fff') })}>{V(c.subtitulo)}</div>}
    </div>
  ), 'Cabeçalho', 'cabecalho', 'diag_cab', true) }
  if (a.mostrarDadosAluno && !ocultasP.has('nome')) { const corN = corP('diag_nome_rot', prim), corV = corP('diag_nome_val', amar); add('diag_nome', (
    <div style={{ display: 'flex', overflow: 'hidden' }}>
      <div {...atr('diag_nome_rot', 'Rótulo NOME', corN, { background: corN, color: '#fff', fontWeight: 800, fontSize: 14, padding: '8px 14px', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center' })}>{V(c.rotuloNome ?? 'NOME:')}</div>
      <div {...atr('diag_nome_val', 'Faixa do nome', corV, { background: corV, color: '#3b2f00', flex: 1, display: 'flex', alignItems: 'center', padding: '8px 14px', fontSize: corpo, fontWeight: 600 })}>{V(c.nomeTexto ?? '{nome}')}</div>
    </div>
  ), 'Nome do aluno', 'nome', 'diag_nome_rot', true) }
  // Card "Dados do estudante" — o MESMO bloco `identificacao` da folha (extraído do preset, sem cópia).
  if (c.dadosCard) {
    const identData = montarCadernoData([], vars, a.titulo || 'Simulado', { gabaritoLiberado: true })
    const bloco = blocoDadosEstudante()
    // Overrides de cor (letra/fundo/topo/acertos/erros/média…) — aplicados sobre os atributos do bloco.
    const attrs: any = { ...bloco.attributes }
    for (const [k, v] of Object.entries(c.dadosCardCores ?? {})) {
      if (!v) continue
      if (k === 'corMedia') { attrs.corMediaBaixa = v; attrs.corMediaMedia = v; attrs.corMediaAlta = v; attrs.corMediaMax = v }
      else attrs[k] = v
    }
    add('dados_card', (
      <div {...atr('dados_card', 'Dados do estudante', corP('dados_card', prim), {})}>
        <BlockRender block={{ ...bloco, attributes: attrs }} theme={resolveTheme({ primaria: prim, secundaria: amar, acento: amar })} data={identData} />
      </div>
    ), 'Dados do estudante', 'card', 'dados_card', true)
  }
  if (!ocultasP.has('nota')) { const corNum = corP('diag_nota_num', '#9b6800'), corFx = corP('diag_nota_faixa', amar); add('diag_nota', (
    <div style={{ display: 'flex', border: `1px solid ${prim}33`, overflow: 'hidden' }}>
      <div {...atr('diag_nota_num', 'Bloco da nota', corNum, { background: corNum, color: '#fff', padding: '10px 20px', display: 'flex', alignItems: 'baseline' })}><span style={{ fontSize: fs('diag_nota_num', 32), fontWeight: 800 }}>{V('{acertos}')}</span><span style={{ fontSize: fs('diag_nota_num', 16), fontWeight: 700 }}>/{V(c.notaTotal)}</span></div>
      <div {...atr('diag_nota_faixa', 'Faixa da nota', corFx, { background: corFx, color: '#3b2f00', flex: 1, display: 'flex', alignItems: 'center', padding: '10px 16px', fontSize: corpo, fontWeight: 600 })}>{V(c.notaTexto)}</div>
    </div>
  ), 'Nota', 'nota', 'diag_nota_num', true) }
  c.intro.forEach((p, i) => { const cor = corP(`intro:${i}`, '#1a202c'); add(`intro:${i}`, <p key={`intro${i}`} {...atr(`intro:${i}`, `Parágrafo de abertura ${i + 1}`, cor, { fontSize: corpo, lineHeight: 1.4, textAlign: 'justify', margin: '0 0 3px', color: cor })}>{V(p)}</p>, `Introdução ${i + 1}`, 'texto', `intro:${i}`, true) })
  // Faixa de seção (título) — mesmo estilo das seções do diagnóstico (ex.: "GABARITO OFICIAL DESATUALIZADO").
  ;(c.cards ?? []).forEach((cd, i) => { const cor = corP(`card:${i}`, prim); add(`card:${i}`, (
    <div key={`card${i}`} {...atr(`card:${i}`, `Seção ${i + 1}`, cor, { background: cor, color: '#fff', fontWeight: 700, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', padding: '6px 12px', borderRadius: 2, margin: '3px 0 7px' })}>{V(cd.texto)}</div>
  ), `Seção ${i + 1}`, 'secao', `card:${i}`, true) })
  // Card com fita: fundo claro + faixa colorida (lateral OU topo) + uma linha de texto por observação.
  ;(c.fitas ?? []).forEach((ft, i) => { const cor = corP(`fita:${i}`, prim); const borda = ft.pos === 'top' ? { borderTop: `4px solid ${cor}` } : { borderLeft: `4px solid ${cor}` }; add(`fita:${i}`, (
    <div key={`fita${i}`} {...atr(`fita:${i}`, `Card com fita ${i + 1}`, cor, { background: '#f5f3ff', ...borda, padding: '8px 12px' })}>
      {(ft.texto || '').split('\n').map((linha, j) => <div key={j} style={{ fontSize: fs(`fita:${i}`, corpo), color: '#5a5570', lineHeight: 1.5, textAlign: alignP(`fita:${i}`, 'left') }}>{V(linha)}</div>)}
    </div>
  ), `Card com fita ${i + 1}`, 'card', `fita:${i}`, true) })
  // Card com texto: caixa com borda + N parágrafos (cada um adicionado/editado no painel do bloco).
  ;(c.cardsTexto ?? []).forEach((cd, i) => { const cor = corP(`cardTx:${i}`, prim); add(`cardTx:${i}`, (
    <div key={`cardTx${i}`} {...atr(`cardTx:${i}`, `Card com texto ${i + 1}`, cor, { background: '#ffffff', border: `1px solid ${cor}`, borderRadius: cd.raio ?? 0, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 5 })}>
      {(cd.textos ?? []).map((t, j) => <div key={j} style={{ fontSize: fs(`cardTx:${i}`, corpo), color: '#333', lineHeight: 1.5, textAlign: alignP(`cardTx:${i}`, 'left') }}>{V(t)}</div>)}
    </div>
  ), `Card com texto ${i + 1}`, 'card', `cardTx:${i}`, true) })
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
  // Renderiza UM grupo de cards de pilar. keyBase = prefixo das partes (pilar:i na seção; pilarG:gi:j nos grupos).
  const emitirPilares = (pilares: DiagPilar[], keyBase: string, blockKey: string) => {
    // Esconde o card de um pilar SEM questões (var `total_pilar_<chave>` ausente) — evita o card
    // "X%/X de N" quebrado. SÓ esconde quando ALGUM outro pilar TEM questões (garante que a análise
    // do banco rodou neste contexto); se NENHUMA variável de pilar estiver presente (modo modelo ou
    // contexto sem os totais), NÃO esconde nada — mostra todos com placeholder. Retorna null no map
    // p/ preservar os índices de cor/formatação (`${keyBase}:${i}`).
    const temPilar = (pl: DiagPilar) => !!pl.chave && vars[`total_${prefFonte(pl.tipoFonte)}${pl.chave}`] !== undefined
    const algumComQuestoes = pilares.some(temPilar)
    const semQuestoes = (pl: DiagPilar) => algumComQuestoes && !!pl.chave && !temPilar(pl)
    add(blockKey, (
      <div style={{ display: 'flex', gap: 14, alignItems: 'stretch', marginBottom: 4 }}>
        {pilares.map((pl, i) => {
          if (semQuestoes(pl)) return null
          const banda = bandaAdaptativa(pl, vars)
          const bandas = banda ? [banda] : pl.bandas // com dado do aluno mostra só a faixa; sem dado, todas (modelo)
          const parte = `${keyBase}:${i}`
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
    ), 'Desempenho por pilar', 'desempenho', '', true, blockKey)
  }
  if (c.pilares.length && !ocultasP.has('sec_pilares')) add('sec_pilares', <Sec parte="sec_pilares" t={c.tituloPilares ?? 'Desempenho por pilar'} />, `Faixa de seção · ${c.tituloPilares ?? 'Desempenho por pilar'}`, 'secao', 'sec_pilares', true, 'sec_pilares')
  if (c.pilares.length && !ocultasP.has('pilares')) emitirPilares(c.pilares, 'pilar', 'pilares')
  // Grupos de pilar SEPARADOS: cada "Desempenho por pilar" adicionado vira um bloco próprio (não junta no mesmo).
  ;(c.pilaresGrupos ?? []).forEach((grupo, gi) => { if (grupo.length) emitirPilares(grupo, `pilarG:${gi}`, `pilaresG:${gi}`) })
  // Disciplinas: do BANCO quando houver (nome+chave reais); senão as do modelo. Assuntos/nº/pct vêm das variáveis.
  const ocultas = new Set(c.discOcultas ?? [])
  const discs: DiscBanco[] = (discBanco.length ? discBanco : c.disciplinas.map((d) => ({ nome: d.nome, chave: d.chave || slugDiag(d.nome) }))).filter((d) => !ocultas.has(d.chave))
  // Emite UM card de disciplina: cabeçalho (nome + acerto/total/%) com a "fita" no topo + assuntos abaixo.
  // `dk` = chave do bloco (disc:<slug> na seção; discInd:<i> quando é um card avulso individual).
  const emitirCardDisc = (d: DiscBanco, dk: string, pos: 'top' | 'left' = 'top') => {
    const fonte = c.discFonte?.[d.chave] ?? d.chave // disciplina cujos assuntos/estatísticas o card exibe
    const assuntos = (vars[`assuntos_${fonte}`] ?? '').split('\n').map((s) => s.trim()).filter(Boolean)
    // cor da disciplina: parte (coresParte) → individual legado (coresDisc) → cor do pilar → secundária.
    const corDisc = corP(dk, (a.coresDisc ?? {})[d.chave] || corDoPilar(d.pilar, a.coresPilar ?? {}, amar))
    const corTxt = c.discCorTexto?.[d.chave] ?? prim
    // Acertou tudo (sem assuntos errados) com dados reais → não mostra nada; sem dados → rótulo placeholder.
    const temDadosAluno = Object.keys(vars).length > 0
    const lista = assuntos.length ? assuntos : (temDadosAluno ? [] : ['Assuntos das questões erradas'])
    const fita = pos === 'left' ? { borderLeft: `3px solid ${corDisc}` } : { borderTop: `3px solid ${corDisc}` }
    const bg = corFundoP(dk, '#f5f3ff') // fundo editável do card
    const corNome = corTextoP(dk, corTxt) // cor do texto (nome/assuntos) editável
    add(dk, (
      <div {...atr(dk, d.nome, corDisc, { background: bg, ...fita, padding: lista.length ? '6px 10px 2px' : '6px 10px 6px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 })}>
        <div style={{ fontSize: fs(dk, 11), fontWeight: 700, color: corNome }}>{V(c.discNomes?.[d.chave] ?? d.nome)}</div>
        <div style={{ fontSize: fs(dk, 11), whiteSpace: 'nowrap' }}><span style={{ color: '#9590b0' }}>{V(`{acerto_${fonte}}`)}/{V(`{total_${fonte}}`)}</span> <span style={{ fontWeight: 800, color: corDisc }}>{V(`{pct_${fonte}}`)}</span></div>
      </div>
    ), c.discNomes?.[d.chave] ?? d.nome, 'card', dk, true)
    lista.forEach((as, k) => addCont(`${dk}:a${k}`, (
      <div {...atr(dk, d.nome, corDisc, { background: bg, ...(pos === 'left' ? { borderLeft: `3px solid ${corDisc}` } : {}), padding: `0 10px ${k === lista.length - 1 ? 6 : 1}px`, marginBottom: k === lista.length - 1 ? 5 : 0 })}>
        <div style={{ fontSize: fs(dk, corpo), color: corNome, fontStyle: 'italic', opacity: 0.85 }}>- {V(as)}</div>
      </div>
    ), dk))
  }
  if (discs.length && !ocultasP.has('sec_disciplinas')) add('sec_disciplinas', <Sec parte="sec_disciplinas" t={c.tituloDisciplinas ?? 'Desempenho por disciplina'} />, `Faixa de seção · ${c.tituloDisciplinas ?? 'Desempenho por disciplina'}`, 'secao', 'sec_disciplinas', true, 'sec_disciplinas')
  if (discs.length && !ocultasP.has('disciplinas')) {
    if (c.disciplinasIntro) { const cor = corP('disc_intro', '#5a5570'); add('disc_intro', <p {...atr('disc_intro', 'Introdução das disciplinas', cor, { fontSize: corpo, color: cor, margin: '0 0 8px', lineHeight: 1.4 })}>{V(c.disciplinasIntro)}</p>, 'Introdução (disciplinas)', 'texto', 'disc_intro') }
    for (const d of discs) emitirCardDisc(d, `disc:${d.chave}`)
  }
  // Cards de disciplina INDIVIDUAIS: só o card com a fita (topo OU lateral), SEM faixa de seção nem introdução.
  ;(c.discsIndividuais ?? []).forEach((di, i) => {
    const db = discBanco.find((x) => x.chave === di.chave)
    const d: DiscBanco = db ?? { nome: c.discNomes?.[di.chave] ?? 'Disciplina', chave: di.chave }
    emitirCardDisc(d, `discInd:${i}`, di.pos ?? 'top')
  })
  // Renderiza UM card de sugestão (cabeçalho + intro + tópicos). sk = chave (sug:i na seção; sugInd:i individual).
  const emitirCardSugestao = (s: DiagSugestao, sk: string) => {
    const cor = corP(sk, '#fdf3d0') // fundo do TOPO
    const corTopoTxt = corTextoP(`${sk}:topo`, s.corTitulo || '#9a6e00') // texto do topo
    const bgInfo = corFundoP(sk, '#f0eeff') // fundo das INFORMAÇÕES
    const corInfoTxt = corTextoP(`${sk}:info`, '#243b53') // texto das informações
    add(sk, (
      <div {...atr(sk, `Sugestão · ${s.titulo}`, cor, { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: cor, padding: '5px 12px' })}>
        <span style={{ fontWeight: 800, fontSize: fs(sk, 11), color: corTopoTxt }}>{V(s.titulo)}</span>
        {s.prioridade && <span style={{ fontWeight: 700, fontSize: fs(sk, 9), color: corTopoTxt }}>[!] {V(s.prioridade)}</span>}
      </div>
    ), `Sugestão · ${s.titulo}`, 'card', sk, true)
    const nItens = s.itens.length
    if (s.intro) addCont(`${sk}:intro`, (
      <div {...atr(sk, `Sugestão · ${s.titulo}`, cor, { background: bgInfo, padding: `8px 12px ${nItens ? 4 : 8}px` })}>
        <p style={{ fontSize: fs(sk, corpo), margin: 0, lineHeight: 1.4, color: corInfoTxt, textAlign: alignP(sk, 'justify') }}>{V(s.intro)}</p>
      </div>
    ), sk)
    s.itens.forEach((it, ii) => addCont(`${sk}:i${ii}`, (
      <div {...atr(sk, `Sugestão · ${s.titulo}`, cor, { background: bgInfo, padding: `${!s.intro && ii === 0 ? 8 : 0}px 12px ${ii === nItens - 1 ? 8 : 2}px` })}>
        <div style={{ fontSize: fs(sk, corpo), lineHeight: 1.5, color: corInfoTxt, textAlign: alignP(sk, 'justify') }}>{Vm(topicosParaTexto([it]))}</div>
      </div>
    ), sk))
  }
  if (c.sugestoes.length && !ocultasP.has('sec_sugestoes')) add('sec_sugestoes', <Sec parte="sec_sugestoes" t={c.tituloSugestoes ?? 'Sugestões de estudo'} />, `Faixa de seção · ${c.tituloSugestoes ?? 'Sugestões de estudo'}`, 'secao', 'sec_sugestoes', true, 'sec_sugestoes')
  if (c.sugestoes.length && !ocultasP.has('sugestoes')) c.sugestoes.forEach((s, si) => emitirCardSugestao(s, `sug:${si}`))
  // Cards de sugestão INDIVIDUAIS (só o card, sem faixa de seção).
  ;(c.sugsIndividuais ?? []).forEach((s, i) => emitirCardSugestao(s, `sugInd:${i}`))
  if ((c.fechamento?.length ?? 0) > 0 && !ocultasP.has('fechamento')) {
    (c.fechamento ?? []).forEach((p, i) => { const cor = corP(`fechamento:${i}`, '#1a202c'); add(`fechamento:${i}`, <p key={`fech${i}`} {...atr(`fechamento:${i}`, `Parágrafo de fechamento ${i + 1}`, cor, { fontSize: corpo, lineHeight: 1.4, textAlign: 'justify', margin: '0 0 3px', color: cor })}>{V(p)}</p>, `Fechamento ${i + 1}`, 'texto', `fechamento:${i}`, true) })
  }
  if ((c.gabaritoObs.length || c.gabaritoIntro.length) && !ocultasP.has('sec_gabarito')) add('sec_gabarito', <Sec parte="sec_gabarito" t={c.gabaritoTitulo || 'Gabarito oficial desatualizado'} />, `Faixa de seção · ${c.gabaritoTitulo || 'Gabarito'}`, 'secao', 'sec_gabarito', true, 'sec_gabarito')
  if ((c.gabaritoObs.length || c.gabaritoIntro.length) && !ocultasP.has('gabarito')) {
    c.gabaritoIntro.forEach((p, i) => { const cor = corP(`gabIntro:${i}`, '#243b53'); add(`gab:${i}`, <p key={`gabi${i}`} {...atr(`gabIntro:${i}`, `Gabarito — parágrafo ${i + 1}`, cor, { fontSize: corpo, margin: '0 0 6px', lineHeight: 1.4, textAlign: 'justify', color: cor })}>{V(p)}</p>, `Gabarito — parágrafo ${i + 1}`, 'texto', `gabIntro:${i}`, true, `gabIntro:${i}`) })
    if (c.gabaritoObs.length) { const cor = corP('gab_obs', '#a32d2d'); add('gab_obs', <div {...atr('gab_obs', 'Gabarito — observações', cor, { background: '#f5f3ff', borderTop: `3px solid ${cor}`, padding: '6px 10px' })}>{c.gabaritoObs.map((o, i) => <div key={i} style={{ fontSize: fs('gab_obs', corpo), color: '#5a5570' }}>{V(o)}</div>)}</div>, 'Gabarito — observações', 'card', 'gab_obs', true, 'gab_obs') }
  }
  // Aplica a ordem salva (c.ordem): chaves listadas primeiro (na ordem), o resto mantém a ordem natural.
  // Agrupa cada bloco ÂNCORA (juntar=false) com suas CONTINUAÇÕES (juntar=true) seguintes, para que a
  // ordem salva (c.ordem, que só lista âncoras) nunca separe um card dos seus sub-blocos.
  const grupos: { ancora: DiagEntrada; conts: DiagEntrada[] }[] = []
  for (const e of entradas) {
    if (e.juntar && grupos.length) grupos[grupos.length - 1].conts.push(e)
    else grupos.push({ ancora: e, conts: [] })
  }
  const ordemSalva = c.ordem ?? []
  const mapaG = new Map(grupos.map((g) => [g.ancora.key, g]))
  const vistos = new Set<string>()
  const ordenadas: DiagEntrada[] = []
  const pushG = (g: { ancora: DiagEntrada; conts: DiagEntrada[] }) => { ordenadas.push(g.ancora, ...g.conts); vistos.add(g.ancora.key) }
  for (const k of ordemSalva) { const g = mapaG.get(k); if (g && !vistos.has(k)) pushG(g) }
  for (const g of grupos) if (!vistos.has(g.ancora.key)) pushG(g)
  if (sink) sink.entradas = ordenadas
  return ordenadas.map((e) => e.node)
}

/** Estrutura (outline) do diagnóstico na ordem atual — usado pelo painel de estrutura do builder. */
export function outlineDoItem(item: ItemCaderno, questoes: PreviewQuestao[], vars: Record<string, string>, discBanco: DiscBanco[]): DiagEntrada[] {
  if (item.modalidade !== 'diagnostico') return []
  const sink: { entradas?: DiagEntrada[] } = {}
  blocosDoItem(item, questoes.length ? questoes : QUESTOES_EXEMPLO, vars, discBanco, undefined, sink)
  return (sink.entradas ?? []).filter((e) => !e.outlineOculto)
}

/** Uma folha A4 (fundo + cabeçalho + conteúdo + rodapé) ou a capa (página inteira). */
function Folha({ item, num, total, pad, Ht, Hf, ehCapa, ehUltima, capaCfg, onPickCapa, selCapa, children }: { item: ItemCaderno; num: number; total: number; pad: number; Ht: number; Hf: number; ehCapa?: boolean; ehUltima?: boolean; capaCfg?: CapaConfig; onPickCapa?: () => void; selCapa?: boolean; children?: ReactNode }) {
  const a = item.ajustes
  const cfg = capaCfg ?? CAPA_PADRAO
  return (
    <div style={{ width: A4_W, minHeight: A4_H, position: 'relative', overflow: 'visible', background: '#fff', color: '#1a202c', boxShadow: '0 2px 20px rgba(0,0,0,.16)', fontFamily: 'var(--font-inter), system-ui, sans-serif' }}>
      {a.folhaUrl && <img src={a.folhaUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
      {ehCapa ? (
        a.capaUrl && (
          <>
            <img src={a.capaUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 1 }} />
            {/* Título automático sobre a capa (editável): mesma lógica dos modelos doc-backed. */}
            <div
              onClick={onPickCapa ? (e) => { e.stopPropagation(); onPickCapa() } : undefined}
              title={onPickCapa ? 'Clique para editar o título da capa' : undefined}
              style={{
                position: 'absolute', left: `${cfg.posH}%`, top: `${cfg.posV}%`, transform: 'translate(-50%, -50%)',
                width: 'max-content', maxWidth: '84%', zIndex: 2,
                cursor: onPickCapa ? 'pointer' : 'default', color: cfg.cor, fontSize: cfg.tamanho,
                fontFamily: cssDaFonte(cfg.fonte) || 'var(--font-inter), system-ui, sans-serif',
                fontWeight: cfg.negrito ? 800 : 400, fontStyle: cfg.italico ? 'italic' : 'normal',
                textDecoration: cfg.sublinhado ? 'underline' : 'none', textAlign: cfg.alinhamento,
                lineHeight: 1.1, whiteSpace: 'pre-wrap', padding: '6px 10px',
                ...(selCapa ? { outline: `2px solid ${cfg.cor}`, outlineOffset: 4 } : {}),
              }}
              dangerouslySetInnerHTML={{ __html: formatarInline(cfg.titulo) }}
            />
          </>
        )
      ) : ehUltima ? (
        a.ultimaUrl && <img src={a.ultimaUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 1 }} />
      ) : (
        <div style={{ position: 'relative', zIndex: 1, minHeight: A4_H, display: 'flex', flexDirection: 'column' }}>
          <div style={{ height: Ht, flexShrink: 0, overflow: 'hidden' }}>
            {a.cabecalhoUrl && <img src={a.cabecalhoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
          </div>
          {/* flex "1 0 auto" = preenche a folha (páginas curtas) mas NÃO encolhe (páginas cheias):
              se um bloco passar do limite, a folha CRESCE em vez de cortar/esconder — nada some. */}
          <div style={{ flex: '1 0 auto', padding: `8px ${pad}px`, overflow: 'visible' }}>{children}</div>
          <div style={{ height: Hf, flexShrink: 0, position: 'relative', overflow: 'hidden' }}>
            {a.rodapeUrl && <img src={a.rodapeUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
          </div>
        </div>
      )}
    </div>
  )
}

export function Previa({ item, questoes, vars = {}, discBanco = [], onPick, selParte, onPickCapa, selCapa, estatico }: { item: ItemCaderno; questoes: PreviewQuestao[]; vars?: Record<string, string>; discBanco?: DiscBanco[]; onPick?: (parte: string, label: string, cor: string, anchor: DOMRect) => void; selParte?: string; onPickCapa?: () => void; selCapa?: boolean; estatico?: boolean }) {
  const a = item.ajustes
  const qs = questoes.length ? questoes : QUESTOES_EXEMPLO
  const pad = a.compacto ? 40 : 56
  const GAP = a.compacto ? 8 : 12 // espaço entre blocos (contado na paginação, fielmente)
  // Quando há imagem de FUNDO da página (folhaUrl), ela costuma trazer faixas de cabeçalho/rodapé
  // embutidas — reserva margem p/ o conteúdo não ficar por cima delas. `margemTopo`/`margemBase`
  // (px) permitem ajustar manualmente até onde os blocos vão (0 = automático).
  const Ht = a.margemTopo ? a.margemTopo : (a.cabecalhoUrl ? 96 : a.folhaUrl ? 72 : pad + 16)
  const Hf = a.margemBase ? a.margemBase : (a.rodapeUrl ? 84 : a.folhaUrl ? 72 : 16)
  const contentW = A4_W - 2 * pad
  const availH = A4_H - Ht - Hf - 16

  const onPickRef = useRef(onPick); onPickRef.current = onPick
  const varsKey = useMemo(() => JSON.stringify(vars), [vars])
  const discKey = useMemo(() => JSON.stringify(discBanco), [discBanco])
  const blocos = useMemo(() => {
    const sink: { entradas?: DiagEntrada[] } = {}
    const nodes = blocosDoItem(item, qs, vars, discBanco, { selParte, onPick: (p, n, cor, an) => onPickRef.current?.(p, n, cor, an) }, sink)
    // `juntar` = sub-bloco colado (sem gap acima); `secao` = faixa de título (não pode ficar órfã no rodapé).
    return sink.entradas ? sink.entradas.map((e) => ({ node: e.node, juntar: !!e.juntar, secao: e.tipo === 'secao' })) : nodes.map((n) => ({ node: n, juntar: false, secao: false }))
  }, [item, qs, varsKey, discKey, selParte]) // eslint-disable-line react-hooks/exhaustive-deps
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
      const BUF = 26 // folga p/ sub-pixel/diferenças de render — evita card cortado/sliver colorido no fim da folha
      // Quanto o bloco ÂNCORA em `idx` precisa caber p/ ficar na página: o CARD INTEIRO (âncora + todas as
      // continuações coladas) quando ele cabe numa página em branco; senão (card gigante) só a âncora + a
      // 1ª continuação (evita cabeçalho órfão do próprio card e deixa o resto quebrar).
      const necessarioDe = (idx: number): number => {
        let g = hs[idx]
        for (let j = idx + 1; j < hs.length && blocos[j]?.juntar; j++) g += hs[j]
        if (g <= availH - BUF) return g
        const cont = (idx + 1 < hs.length && blocos[idx + 1]?.juntar) ? hs[idx + 1] : 0
        return hs[idx] + cont
      }
      const pages: number[][] = []; let cur: number[] = []; let h = 0
      for (let i = 0; i < hs.length; i++) {
        if (blocos[i]?.juntar) {
          // Continuação (sub-bloco colado): normalmente já cabe (o card foi validado inteiro na âncora).
          // Só chega a quebrar aqui quando o card é MAIOR que uma página inteira.
          if (cur.length && h + hs[i] > availH - BUF) { pages.push(cur); cur = [i]; h = hs[i] }
          else { cur.push(i); h += hs[i] }
        } else {
          // ÂNCORA: tenta manter o card inteiro numa só página (não parte assuntos entre páginas).
          let necessario = necessarioDe(i)
          // Faixa de SEÇÃO: anti-órfão INTELIGENTE. Mantém a faixa junto do conteúdo seguinte SÓ quando
          // esse conteúdo é pequeno (cabe em até ~metade da folha). Se for GRANDE (ex.: a linha de pilares,
          // que é um bloco atômico alto), NÃO arrasta a faixa junto — a faixa preenche a folha atual e o
          // conteúdo desce para a próxima, em vez de os dois pularem juntos deixando a folha quase vazia.
          if (blocos[i]?.secao && i + 1 < hs.length && !blocos[i + 1]?.juntar) {
            const prox = necessarioDe(i + 1)
            necessario = prox <= availH * 0.5 ? hs[i] + prox : hs[i]
          }
          if (cur.length && h + necessario > availH - BUF) { pages.push(cur); cur = []; h = 0 }
          cur.push(i); h += hs[i]
        }
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

  const pagesRaw = paginas ?? [blocos.map((_, i) => i)]
  // Descarta índices DEFASADOS: logo após adicionar/remover um bloco (ou trocar o grupo por um em
  // branco), `paginas` ainda aponta para blocos que já não existem → blocos[i] indefinido → crash
  // "Cannot read properties of undefined (reading 'node')". Filtramos até o re-cálculo da paginação.
  const pages = pagesRaw.map((idxs) => idxs.filter((i) => i >= 0 && i < blocos.length))
  const temCapa = !!a.capaUrl
  const temUltima = !!a.ultimaUrl
  const total = (temCapa ? 1 : 0) + pages.length + (temUltima ? 1 : 0)

  return (
    <div className={paginas != null ? 'caderno-pronto' : undefined} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22 }}>
      {/* passe de medição (escondido) — ESPELHA a caixa de conteúdo da folha: mesma largura A4 +
          padding + border-box + fonte/cor. Assim o texto quebra no MESMO nº de linhas e as alturas
          batem (senão um bloco "cabe" na conta mas renderiza mais alto e é cortado). */}
      {!estatico && (
        <div ref={medRef} aria-hidden style={{ position: 'absolute', left: -99999, top: 0, width: A4_W, padding: `8px ${pad}px`, boxSizing: 'border-box', fontFamily: 'var(--font-inter), system-ui, sans-serif', color: '#1a202c' }}>
          {blocos.map((b, i) => <div key={i} style={{ marginTop: i === 0 ? 0 : (b.juntar ? 0 : GAP) }}>{b.node}</div>)}
        </div>
      )}
      {temCapa && <Folha item={item} num={1} total={total} pad={pad} Ht={Ht} Hf={Hf} ehCapa capaCfg={item.capa ?? CAPA_PADRAO} onPickCapa={onPickCapa} selCapa={selCapa} />}
      {pages.map((idxs, pi) => (
        <Folha key={pi} item={item} num={(temCapa ? 1 : 0) + pi + 1} total={total} pad={pad} Ht={Ht} Hf={Hf}>
          {idxs.map((i, gi) => <div key={i} style={{ marginTop: gi === 0 ? 0 : (blocos[i].juntar ? 0 : GAP) }}>{blocos[i].node}</div>)}
        </Folha>
      ))}
      {temUltima && <Folha item={item} num={total} total={total} pad={pad} Ht={Ht} Hf={Hf} ehUltima />}
    </div>
  )
}
