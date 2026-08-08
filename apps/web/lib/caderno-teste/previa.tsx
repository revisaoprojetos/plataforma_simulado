'use client'

// Prévia A4 PAGINADA do construtor de teste. Monta o conteúdo do grupo em blocos, mede as alturas
// num passe escondido e distribui em folhas A4 (794×1123) de verdade — capa como página própria,
// páginas separadas por espaço, cada uma com imagem de folha (fundo), cabeçalho e rodapé.

import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ItemCaderno, PreviewQuestao } from './tipos'
import { DIAG_PADRAO, slugDiag, type DiagPilar } from './diagnostico'
import { CORES_PILAR_PADRAO } from './tipos'
import { formatarInline } from './formato'

const A4_W = 794
const A4_H = 1123
const LETRAS = ['A', 'B', 'C', 'D', 'E', 'F']

export type DiscBanco = { nome: string; chave: string; pilar?: string }
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
  const raw = pilar.chave ? vars[`pct_pilar_${pilar.chave}`] : undefined
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
function blocosDoItem(item: ItemCaderno, qs: PreviewQuestao[], vars: Record<string, string>, discBanco: DiscBanco[], inter?: Interativo): ReactNode[] {
  const a = item.ajustes
  const base = a.compacto ? 10 : 12
  // Texto com formatação inline (**negrito**, *itálico*, <u>sublinhado</u>) já com variáveis aplicadas.
  const V = (t: string): ReactNode => <span dangerouslySetInnerHTML={{ __html: formatarInline(preencher(t, vars)) }} />
  const out: ReactNode[] = []

  // Cor individual por PARTE (clique na prévia): coresParte[parte] sobrepõe a cor padrão do bloco.
  const corP = (parte: string, def: string) => (a.coresParte ?? {})[parte] || def
  // Props (style + clique) para tornar qualquer bloco selecionável na prévia e destacá-lo quando ativo.
  const atr = (parte: string, label: string, cor: string, baseStyle: any): { style: any; onClick?: (e: any) => void; title?: string } => {
    if (!inter?.onPick) return { style: baseStyle }
    return {
      style: { ...baseStyle, cursor: 'pointer', ...(inter.selParte === parte ? { outline: `2px solid ${cor}`, outlineOffset: -1 } : {}) },
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
  const prim = a.corPrimaria, amar = a.corSecundaria
  // Cada faixa de seção é uma parte própria (sec:<t>) — dá para colorir cada uma individualmente.
  // `parte` estável (sec_pilares/sec_disciplinas/…) → cor e TEXTO editáveis (o texto muda sem perder a seleção/cor).
  const Sec = ({ parte, t }: { parte: string; t: string }) => {
    const cor = corP(parte, prim)
    return <div {...atr(parte, t, cor, { background: cor, color: '#fff', fontWeight: 700, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', padding: '6px 12px', borderRadius: 2, margin: '4px 0 10px' })}>{V(t)}</div>
  }
  if (a.mostrarCabecalho) { const cor = corP('diag_cab', prim); out.push(
    <div {...atr('diag_cab', 'Cabeçalho', cor, { background: cor, color: '#fff', padding: '12px 16px', marginBottom: 12 })}>
      <div style={{ fontSize: 20, fontWeight: 800 }}>{V(a.titulo || 'Diagnóstico de Desempenho')}</div>
      {c.subtitulo && <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>{V(c.subtitulo)}</div>}
    </div>,
  ) }
  if (a.mostrarDadosAluno) { const corN = corP('diag_nome_rot', prim), corV = corP('diag_nome_val', amar); out.push(
    <div style={{ display: 'flex', border: `1px solid ${corN}`, overflow: 'hidden', marginBottom: 12 }}>
      <div {...atr('diag_nome_rot', 'Rótulo NOME', corN, { background: corN, color: '#fff', fontWeight: 800, fontSize: 14, padding: '8px 14px' })}>NOME:</div>
      <div {...atr('diag_nome_val', 'Faixa do nome', corV, { background: corV, color: '#3b2f00', flex: 1, padding: '8px 14px', fontSize: 12, fontWeight: 600 })}>{V('{nome}')}</div>
    </div>,
  ) }
  { const corNum = corP('diag_nota_num', '#9b6800'), corFx = corP('diag_nota_faixa', amar); out.push(
    <div style={{ display: 'flex', border: `1px solid ${prim}33`, overflow: 'hidden', marginBottom: 12 }}>
      <div {...atr('diag_nota_num', 'Bloco da nota', corNum, { background: corNum, color: '#fff', padding: '10px 20px', display: 'flex', alignItems: 'baseline' })}><span style={{ fontSize: 32, fontWeight: 800 }}>{V('{acertos}')}</span><span style={{ fontSize: 16, fontWeight: 700 }}>/{V(c.notaTotal)}</span></div>
      <div {...atr('diag_nota_faixa', 'Faixa da nota', corFx, { background: corFx, color: '#3b2f00', flex: 1, display: 'flex', alignItems: 'center', padding: '10px 16px', fontSize: 12, fontWeight: 600 })}>{V(c.notaTexto)}</div>
    </div>,
  ) }
  c.intro.forEach((p, i) => { const cor = corP(`intro:${i}`, '#1a202c'); out.push(<p key={`intro${i}`} {...atr(`intro:${i}`, `Parágrafo de abertura ${i + 1}`, cor, { fontSize: base, lineHeight: 1.5, textAlign: 'justify', margin: '0 0 8px', color: cor })}>{V(p)}</p>) })
  if (c.pilares.length) {
    out.push(<Sec parte="sec_pilares" t={c.tituloPilares ?? 'Desempenho por pilar'} />)
    out.push(
      <div style={{ display: 'flex', gap: 10, alignItems: 'stretch', marginBottom: 4 }}>
        {c.pilares.map((pl, i) => {
          const banda = bandaAdaptativa(pl, vars)
          const bandas = banda ? [banda] : pl.bandas // com dado do aluno mostra só a faixa; sem dado, todas (modelo)
          const parte = `pilar:${pl.chave || i}`
          const cor = corP(parte, prim) // destaque do card (nome + %)
          return (
            <div key={i} {...atr(parte, pl.nome, cor, { flex: 1, minWidth: 0, background: '#fff2cc', border: `1px solid ${cor}22`, padding: 10 })}>
              <div style={{ fontSize: 9, fontWeight: 700, color: cor, letterSpacing: 0.5 }}>{V(pl.nome)}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: cor, lineHeight: 1.1 }}>{pl.chave ? V(`{pct_pilar_${pl.chave}}`) : 'X%'}</div>
              <div style={{ fontSize: 9, color: '#5a5570', marginBottom: 6 }}>{V(pl.totalTxt)}</div>
              {bandas.map((b, j) => (
                <div key={j} style={{ marginBottom: 6 }}>
                  {!banda && <div style={{ fontSize: 9, fontWeight: 700, color: cor }}>{b.faixa}</div>}
                  {b.texto && <div style={{ fontSize: 8.5, color: '#243b53', lineHeight: 1.4, textAlign: 'justify' }}>{V(b.texto)}</div>}
                </div>
              ))}
            </div>
          )
        })}
      </div>,
    )
  }
  // Disciplinas: do BANCO quando houver (nome+chave reais); senão as do modelo. Assuntos/nº/pct vêm das variáveis.
  const discs: DiscBanco[] = discBanco.length ? discBanco : c.disciplinas.map((d) => ({ nome: d.nome, chave: d.chave || slugDiag(d.nome) }))
  if (discs.length) {
    out.push(<Sec parte="sec_disciplinas" t={c.tituloDisciplinas ?? 'Desempenho por disciplina'} />)
    if (c.disciplinasIntro) { const cor = corP('disc_intro', '#5a5570'); out.push(<p {...atr('disc_intro', 'Introdução das disciplinas', cor, { fontSize: base - 1, color: cor, margin: '0 0 8px', lineHeight: 1.4 })}>{V(c.disciplinasIntro)}</p>) }
    for (const d of discs) {
      const assuntos = (vars[`assuntos_${d.chave}`] ?? '').split('\n').map((s) => s.trim()).filter(Boolean)
      // cor da disciplina: parte (coresParte) → individual legado (coresDisc) → cor do pilar → secundária.
      const corDisc = corP(`disc:${d.chave}`, (a.coresDisc ?? {})[d.chave] || corDoPilar(d.pilar, a.coresPilar ?? {}, amar))
      out.push(
        <div {...atr(`disc:${d.chave}`, d.nome, corDisc, { background: '#f5f3ff', borderTop: `3px solid ${corDisc}`, padding: '6px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 5 })}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: prim }}>{V(d.nome)}</div>
            {assuntos.length
              ? assuntos.map((as, k) => <div key={k} style={{ fontSize: 9, color: '#5a5570', fontStyle: 'italic' }}>- {V(as)}</div>)
              : <div style={{ fontSize: 9, color: '#5a5570', fontStyle: 'italic' }}>- Assuntos das questões erradas</div>}
          </div>
          <div style={{ fontSize: 11, whiteSpace: 'nowrap' }}><span style={{ color: '#9590b0' }}>{V(`{acerto_${d.chave}}`)}/{V(`{total_${d.chave}}`)}</span> <span style={{ fontWeight: 800, color: '#9a6e00' }}>{V(`{pct_${d.chave}}`)}</span></div>
        </div>,
      )
    }
  }
  if (c.sugestoes.length) {
    out.push(<Sec parte="sec_sugestoes" t={c.tituloSugestoes ?? 'Sugestões de estudo'} />)
    c.sugestoes.forEach((s, si) => { const cor = corP(`sug:${si}`, '#fdf3d0'); out.push(
      <div key={`sug${si}`} style={{ marginBottom: 10 }}>
        <div {...atr(`sug:${si}`, `Sugestão · ${s.titulo}`, cor, { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: cor, padding: '5px 12px' })}>
          <span style={{ fontWeight: 800, fontSize: 11, color: '#9a6e00' }}>{V(s.titulo)}</span>
          {s.prioridade && <span style={{ fontWeight: 700, fontSize: 9, color: '#9a6e00' }}>[!] {V(s.prioridade)}</span>}
        </div>
        <div style={{ background: '#f0eeff', padding: '8px 12px' }}>
          {s.intro && <p style={{ fontSize: base - 1, margin: '0 0 6px', lineHeight: 1.4, textAlign: 'justify' }}>{V(s.intro)}</p>}
          {s.itens.map((it, j) => (
            <div key={j} style={{ fontSize: base - 1, lineHeight: 1.4, marginBottom: 2, display: 'flex', gap: 5 }}>
              <span style={{ fontWeight: 700, color: it.forte ? '#e8850c' : '#3b5bdb' }}>{it.forte ? '>>' : '>'}</span><span>{V(it.texto)}</span>
            </div>
          ))}
        </div>
      </div>,
    ) })
  }
  if (c.gabaritoObs.length || c.gabaritoIntro.length) {
    out.push(<Sec parte="sec_gabarito" t={c.gabaritoTitulo || 'Gabarito oficial desatualizado'} />)
    c.gabaritoIntro.forEach((p, i) => { const cor = corP('diag_gab_obs', '#243b53'); out.push(<p key={`gabi${i}`} {...atr('diag_gab_obs', 'Observações do gabarito', cor, { fontSize: base - 1, margin: '0 0 6px', lineHeight: 1.4, textAlign: 'justify', color: cor })}>{V(p)}</p>) })
    if (c.gabaritoObs.length) { const cor = corP('diag_gab_obs', '#a32d2d'); out.push(<div {...atr('diag_gab_obs', 'Observação do gabarito', cor, { background: '#f5f3ff', borderTop: `2px solid ${cor}`, padding: '8px 12px' })}>{c.gabaritoObs.map((o, i) => <div key={i} style={{ fontSize: 9, color: '#5a5570' }}>{V(o)}</div>)}</div>) }
  }
  return out
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
            <span style={{ position: 'absolute', right: pad, bottom: 8, fontSize: 9, color: a.rodapeUrl ? '#fff' : '#94a3b8' }}>pág. {num}/{total}</span>
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
  const Ht = a.cabecalhoUrl ? 84 : pad
  const Hf = a.rodapeUrl ? 84 : 34
  const contentW = A4_W - 2 * pad
  const availH = A4_H - Ht - Hf - 16

  const onPickRef = useRef(onPick); onPickRef.current = onPick
  const varsKey = useMemo(() => JSON.stringify(vars), [vars])
  const discKey = useMemo(() => JSON.stringify(discBanco), [discBanco])
  const blocos = useMemo(() => blocosDoItem(item, qs, vars, discBanco, { selParte, onPick: (p, n, cor, an) => onPickRef.current?.(p, n, cor, an) }), [item, qs, varsKey, discKey, selParte]) // eslint-disable-line react-hooks/exhaustive-deps
  const medRef = useRef<HTMLDivElement>(null)
  const [paginas, setPaginas] = useState<number[][] | null>(null)
  const chave = useMemo(() => JSON.stringify({ n: blocos.length, a }), [blocos, a])

  useLayoutEffect(() => {
    const cont = medRef.current; if (!cont) return
    const hs = (Array.from(cont.children) as HTMLElement[]).map((el) => el.getBoundingClientRect().height)
    const pages: number[][] = []; let cur: number[] = []; let h = 0
    for (let i = 0; i < hs.length; i++) {
      const bh = hs[i]
      if (cur.length && h + bh > availH) { pages.push(cur); cur = []; h = 0 }
      cur.push(i); h += bh
    }
    if (cur.length) pages.push(cur)
    setPaginas(pages.length ? pages : [[]])
  }, [chave, availH]) // eslint-disable-line react-hooks/exhaustive-deps

  const pages = paginas ?? [blocos.map((_, i) => i)]
  const temCapa = !!a.capaUrl
  const total = (temCapa ? 1 : 0) + pages.length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22 }}>
      {/* passe de medição (escondido) */}
      <div ref={medRef} aria-hidden style={{ position: 'absolute', left: -99999, top: 0, width: contentW, display: 'flex', flexDirection: 'column' }}>
        {blocos.map((b, i) => <div key={i}>{b}</div>)}
      </div>
      {temCapa && <Folha item={item} num={1} total={total} pad={pad} Ht={Ht} Hf={Hf} capa />}
      {pages.map((idxs, pi) => (
        <Folha key={pi} item={item} num={(temCapa ? 1 : 0) + pi + 1} total={total} pad={pad} Ht={Ht} Hf={Hf}>
          {idxs.map((i) => <div key={i}>{blocos[i]}</div>)}
        </Folha>
      ))}
    </div>
  )
}
