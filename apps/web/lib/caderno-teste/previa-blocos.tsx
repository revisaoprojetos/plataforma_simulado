'use client'

// Prévia dos MODELOS PRONTOS do v2 reusando o render de blocos do v1 (BlockRender) — para ficar
// IDÊNTICA ao Caderno de Prova v1 e à impressão (/imprimir/caderno). O BlockRender expande o
// `repeticao` sobre as questões do banco; a prévia MEDE cada item e distribui em folhas A4 de
// verdade (paginação como no `Previa`), aplicando o fundo de página (letterhead) em cada folha.

import { useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { BlockRender, dataComQuestao } from '@/lib/caderno-designer/blocks'
import { resolveTheme, cssDaFonte, type CadernoTheme } from '@/lib/caderno-designer/theme'
import { PRESETS_CADERNO } from '@/lib/caderno-designer/presets'
import { PAD_H, PAD_V, RUNNING_PADRAO, type CadernoData, type CadernoDoc, type QuestaoData } from '@/lib/caderno-designer/types'
import { CAPA_PADRAO, type CapaConfig, type PreviewQuestao } from './tipos'
import { formatarInline } from './formato'

const A4_W = 794
const A4_H = 1123

type Item = { key: string; gapTop: number; quebra?: boolean; node: ReactNode }

/** Reatribui ids determinísticos (por posição) a páginas/blocos — o preset gera ids aleatórios a cada
 * build(), o que faria o id clicado na prévia não bater com a busca no builder. Ids estáveis permitem
 * casar seleção↔edição entre instâncias e persistir o docEdit de forma consistente. */
export function idsDeterministicos(doc: CadernoDoc): CadernoDoc {
  const walk = (bs: any[] | undefined, prefix: string): any[] => (bs ?? []).map((b, i) => ({
    ...b, id: `${prefix}b${i}`, innerBlocks: b.innerBlocks ? walk(b.innerBlocks, `${prefix}b${i}-`) : b.innerBlocks,
  }))
  return {
    ...doc,
    pages: doc.pages.map((p, pi) => ({ ...p, id: `p${pi}`, blocks: walk(p.blocks as any[], `p${pi}-`) })),
    cabecalho: walk(doc.cabecalho as any[], 'cab-'),
    rodape: walk(doc.rodape as any[], 'rod-'),
  }
}

/** Doc pronto do v1 pelo id do preset (caderno-perguntas / caderno-completo / caderno-objetivo…). */
export function docDoPreset(presetId: string): CadernoDoc | null {
  const p = PRESETS_CADERNO.find((x) => x.id === presetId)
  return p ? idsDeterministicos(p.build()) : null
}

/** Texto do título que o preset traz na capa (usado como default da CapaConfig). */
function tituloCapaDoDoc(doc: CadernoDoc): string {
  const capa = doc.pages.find((p) => p.kind === 'capa')
  const t = capa?.blocks.find((b: any) => b.type === 'texto-livre') as any
  return (t?.attributes?.texto as string) || CAPA_PADRAO.titulo
}

/** CapaConfig padrão de um modelo pronto (título vindo do preset). */
export function capaPadraoDoPreset(presetId: string): CapaConfig {
  const doc = docDoPreset(presetId)
  return { ...CAPA_PADRAO, titulo: doc ? tituloCapaDoDoc(doc) : CAPA_PADRAO.titulo }
}

/** Questões do banco (PreviewQuestao) + variáveis do aluno → CadernoData que os blocos consomem.
 *  `opts.respostas` (questaoId → letra marcada) alimenta a folha "como fez" / correção; `opts.gabaritoLiberado`
 *  controla a revelação do gabarito oficial (false = só as marcações do aluno). */
export function montarCadernoData(questoes: PreviewQuestao[], vars: Record<string, string>, titulo: string, opts?: { respostas?: Record<string, string>; gabaritoLiberado?: boolean }): CadernoData {
  const qs: QuestaoData[] = questoes.map((q, i) => ({
    id: q.id, numero: q.numero || i + 1, enunciado: q.enunciado ?? '', tipo: q.tipo, comentario: '',
    alternativas: (q.alternativas ?? []).map((a) => ({ letra: a.letra, texto: a.texto, correta: a.correta, comentario: a.comentario ?? '', lei: '' })),
  }))
  const data: CadernoData = {
    questoes: qs, numQuestoes: qs.length || 20, numAlternativas: 5, gabaritoLiberado: opts?.gabaritoLiberado ?? true,
    respostas: opts?.respostas,
    vars: { nome: '', simulado: titulo, acertos: '', erros: '', total_questoes: String(qs.length || 20), nota: '', percentual: '', ...vars },
  }
  if (qs[0]) { const base = dataComQuestao(data, qs[0]); data.vars = base.vars; data.questaoAtual = base.questaoAtual }
  return data
}

/** Itens (nós medíveis) de UMA página do doc — expande o `repeticao` questão a questão. */
function itensDaPagina(page: CadernoDoc['pages'][number], data: CadernoData, theme: CadernoTheme, selectable?: boolean): Item[] {
  return (page.blocks as any[]).filter((b) => b.type !== 'plano-fundo').flatMap((block): Item[] => {
    if (block.type === 'quebra-pagina') return [{ key: `${page.id}-${block.id}`, gapTop: 0, quebra: true, node: null }]
    if (block.type === 'repeticao') {
      const qtd = block.attributes?.quantidade as number | null | undefined
      const gapQ = (block.attributes?.gap as number | undefined) ?? 16
      const qs = qtd ? data.questoes.slice(0, qtd) : data.questoes
      const inner = (block.innerBlocks ?? []) as any[]
      // "Cabeça" da questão = do início até o 1º texto (número + enunciado juntos, nunca órfãos);
      // o resto (alternativas, correção, comentário) vira item solto → enche as folhas.
      let corte = inner.findIndex((ib) => ib.type === 'texto-livre'); if (corte < 0) corte = 0
      const head = inner.slice(0, corte + 1); const resto = inner.slice(corte + 1)
      // Edita a 1ª questão como amostra (selectable só no head/resto da primeira) — muda o bloco no doc.
      return qs.flatMap((q, qi) => {
        const dq = dataComQuestao(data, q)
        const sel = selectable && qi === 0 // seleção só na 1ª questão (o bloco é o mesmo p/ todas)
        const itens: Item[] = [{
          key: `${page.id}-${q.id}-head`, gapTop: gapQ,
          node: <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{head.map((ib: any) => <BlockRender key={ib.id} block={ib} theme={theme} data={dq} selectable={sel} />)}</div>,
        }]
        for (const ib of resto) itens.push({ key: `${page.id}-${q.id}-${ib.id}`, gapTop: 6, node: <BlockRender block={ib} theme={theme} data={dq} selectable={sel} /> })
        return itens
      })
    }
    return [{ key: `${page.id}-${block.id}`, gapTop: 0, node: <BlockRender block={block} theme={theme} data={data} selectable={selectable} /> }]
  })
}

/** Uma folha A4 de CONTEÚDO: fundo de página (letterhead) + área segura (reserva cabeçalho/rodapé). */
function FolhaConteudo({ theme, folhaUrl, cabH, rodH, children }: { theme: CadernoTheme; folhaUrl?: string; cabH: number; rodH: number; children: ReactNode }) {
  return (
    <div style={{ width: A4_W, minHeight: A4_H, position: 'relative', overflow: 'hidden', background: theme.cores.fundo, color: theme.cores.texto, boxShadow: '0 2px 20px rgba(0,0,0,.16)', fontFamily: theme.tipografia.familia }}>
      {folhaUrl && <div style={{ position: 'absolute', inset: 0, backgroundImage: `url(${folhaUrl})`, backgroundSize: '210mm 297mm', backgroundRepeat: 'no-repeat', backgroundPosition: 'top center' }} />}
      <div style={{ position: 'relative', paddingTop: cabH, paddingBottom: rodH, paddingLeft: PAD_H, paddingRight: PAD_H }}>
        {children}
      </div>
    </div>
  )
}

/** Folha de CAPA: imagem full-bleed + título sobreposto, posicionável (x/y) e clicável (abre o editor). */
function FolhaCapa({ capaUrl, capa, theme, onPick, sel }: { capaUrl: string; capa: CapaConfig; theme: CadernoTheme; onPick?: () => void; sel?: boolean }) {
  return (
    <div style={{ width: A4_W, minHeight: A4_H, position: 'relative', overflow: 'hidden', background: theme.cores.fundo, boxShadow: '0 2px 20px rgba(0,0,0,.16)', fontFamily: theme.tipografia.familia }}>
      <img src={capaUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      <div
        onClick={onPick ? (e) => { e.stopPropagation(); onPick() } : undefined}
        title={onPick ? 'Clique para editar o título da capa' : undefined}
        style={{
          // width:max-content fixa a largura ao CONTEÚDO (não ao espaço restante à direita), senão a
          // quebra de linha mudaria conforme a posição horizontal. maxWidth mantém um teto estável.
          position: 'absolute', left: `${capa.posH}%`, top: `${capa.posV}%`, transform: 'translate(-50%, -50%)',
          width: 'max-content', maxWidth: '84%',
          cursor: onPick ? 'pointer' : 'default', color: capa.cor, fontSize: capa.tamanho,
          fontFamily: cssDaFonte(capa.fonte) || theme.tipografia.familia,
          fontWeight: capa.negrito ? 800 : 400, fontStyle: capa.italico ? 'italic' : 'normal',
          textDecoration: capa.sublinhado ? 'underline' : 'none', textAlign: capa.alinhamento,
          lineHeight: 1.1, whiteSpace: 'pre-wrap', padding: '6px 10px',
          ...(sel ? { outline: `2px solid ${capa.cor}`, outlineOffset: 4 } : {}),
        }}
        dangerouslySetInnerHTML={{ __html: formatarInline(capa.titulo) }}
      />
    </div>
  )
}

/** Prévia A4 de um modelo pronto (doc v1) com as questões do banco + variáveis do aluno. */
export function PreviaBlocos({ presetId, questoes, vars = {}, titulo, cores, capaUrl, ultimaUrl, folhaUrl, capa, onPickCapa, selCapa, docOverride, onPickBloco, selBlocoId, respostas, gabaritoLiberado, margemTopo, margemBase }: {
  presetId: string
  questoes: PreviewQuestao[]
  vars?: Record<string, string>
  titulo: string
  /** Reserva de topo (px) até onde os blocos descem — 0/indefinido = automático (do doc). */
  margemTopo?: number
  /** Reserva de base (px) até onde os blocos sobem — 0/indefinido = automático (do doc). */
  margemBase?: number
  /** Respostas do aluno (questaoId → letra marcada) — pinta a folha "como fez"/correção. */
  respostas?: Record<string, string>
  /** Revela o gabarito oficial (false = só marcações do aluno). Default true (prévia do modelo). */
  gabaritoLiberado?: boolean
  cores?: Partial<CadernoTheme['cores']> | null
  /** Imagem de capa: quando vazia, a página de capa NÃO aparece; quando definida, entra como capa. */
  capaUrl?: string
  /** Imagem da ÚLTIMA folha (capa de fundo/contracapa): página inteira no fim, quando definida. */
  ultimaUrl?: string
  /** Fundo (letterhead) aplicado em cada folha de conteúdo. */
  folhaUrl?: string
  /** Config do título da capa (sobrepõe o default do preset). */
  capa?: CapaConfig
  /** Clique no título da capa → abre o editor lateral. */
  onPickCapa?: () => void
  /** Título da capa selecionado (destaque). */
  selCapa?: boolean
  /** Doc editado (sobrepõe o preset) — edição por bloco. */
  docOverride?: CadernoDoc | null
  /** Clique num bloco do conteúdo → abre o editor lateral (habilita a seleção). */
  onPickBloco?: (id: string) => void
  /** Bloco selecionado (destaque). */
  selBlocoId?: string | null
}) {
  // docOverride (docEdit/variantes) pode vir SEM ids → keys `undefined-undefined` e nós
  // duplicados/embaralhados no BlockRender. Normaliza os ids (posição) sempre.
  const doc = useMemo(() => docOverride ? idsDeterministicos(docOverride) : docDoPreset(presetId), [docOverride, presetId])
  const theme = useMemo(() => resolveTheme(cores), [cores])
  const respostasKey = useMemo(() => JSON.stringify(respostas ?? null), [respostas])
  const data = useMemo(() => montarCadernoData(questoes, vars, titulo, { respostas, gabaritoLiberado }), [questoes, vars, titulo, respostasKey, gabaritoLiberado]) // eslint-disable-line react-hooks/exhaustive-deps
  const selectable = !!onPickBloco
  const running = doc?.running ?? RUNNING_PADRAO
  // Reserva de área segura (cabeçalho/rodapé) — a arte do letterhead já traz cabeçalho/rodapé.
  // `margemTopo`/`margemBase` (px, dos ajustes) sobrepõem o padrão do doc quando definidos (>0).
  const cabH = margemTopo ? margemTopo : (running.cabecalhoAtivo ? (running.cabecalhoAltura || PAD_V) : PAD_V)
  const rodH = margemBase ? margemBase : (running.rodapeAtivo ? (running.rodapeAltura || PAD_V) : PAD_V)
  const contentW = A4_W - 2 * PAD_H
  const availH = A4_H - cabH - rodH - 8

  // Itens medíveis de TODAS as páginas de conteúdo (quebra entre páginas do doc).
  const itens = useMemo<Item[]>(() => {
    if (!doc) return []
    const contentPages = doc.pages.filter((p) => p.kind !== 'capa')
    return contentPages.flatMap((page, i) => [
      ...(i > 0 ? [{ key: `brk-${page.id}`, gapTop: 0, quebra: true, node: null } as Item] : []),
      ...itensDaPagina(page, data, theme, selectable),
    ])
  }, [doc, data, theme, selectable])

  const medRef = useRef<HTMLDivElement>(null)
  const [paginas, setPaginas] = useState<number[][] | null>(null)
  useLayoutEffect(() => {
    const cont = medRef.current; if (!cont) return
    const alturas = (Array.from(cont.children) as HTMLElement[]).map((el) => el.getBoundingClientRect().height)
    const BUF = 4
    const grupos: number[][] = []; let atual: number[] = []; let h = 0
    for (let i = 0; i < alturas.length; i++) {
      const it = itens[i]; if (!it) continue
      if (it.quebra) { if (atual.length) { grupos.push(atual); atual = []; h = 0 } continue }
      const alt = alturas[i]; const gap = atual.length ? (it.gapTop || 0) : 0
      if (atual.length && h + gap + alt > availH - BUF) { grupos.push(atual); atual = []; h = 0 }
      const gap2 = atual.length ? (it.gapTop || 0) : 0
      atual.push(i); h += gap2 + alt
    }
    if (atual.length) grupos.push(atual)
    const next = grupos.length ? grupos : [[]]
    // Só atualiza se a distribuição REALMENTE mudou — evita loop de render caso as props
    // (questoes/vars) venham como referência nova a cada render do pai.
    setPaginas((prev) => (prev && JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
  }, [itens, availH])

  if (!doc) return null
  const capaEfetiva: CapaConfig = { ...capaPadraoDoPreset(presetId), ...(capa ?? {}) }
  const capaPage = capaUrl ? doc.pages.find((p) => p.kind === 'capa') : null
  // Descarta uma paginação obsoleta (índices além dos itens atuais) — evita crash ao trocar de doc/caderno.
  const paginasOk = paginas && paginas.every((g) => g.every((i) => itens[i])) ? paginas : null
  const pages = paginasOk ?? [itens.map((_, i) => i)]

  // Delegação: clique em qualquer bloco (data-block-id) abre o editor daquele bloco.
  const onClick = selectable ? (e: ReactMouseEvent) => {
    const el = (e.target as HTMLElement).closest('[data-block-id]') as HTMLElement | null
    if (el?.dataset.blockId) onPickBloco!(el.dataset.blockId)
  } : undefined

  return (
    <div className={paginasOk ? 'caderno-pronto' : undefined} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22 }} onClick={onClick}>
      {/* destaque do bloco selecionado (CSS, sem rebake dos nós) */}
      {selectable && selBlocoId && <style>{`[data-block-id="${selBlocoId}"] > *{outline:2px solid #6d28d9!important;outline-offset:2px;border-radius:2px}`}</style>}
      {selectable && <style>{`[data-block-id]{cursor:pointer}[data-block-id]:hover > *{outline:1.5px dashed #6d28d966;outline-offset:2px}`}</style>}
      {/* passe de medição (escondido) */}
      <div ref={medRef} aria-hidden style={{ position: 'absolute', left: -99999, top: 0, width: contentW, display: 'flex', flexDirection: 'column' }}>
        {itens.map((it, i) => <div key={it.key} style={{ marginTop: i === 0 ? 0 : (it.gapTop || 0) }}>{it.node}</div>)}
      </div>
      {capaPage && <FolhaCapa key="capa" capaUrl={capaUrl!} capa={capaEfetiva} theme={theme} onPick={onPickCapa} sel={selCapa} />}
      {pages.map((idxs, pi) => (
        <FolhaConteudo key={pi} theme={theme} folhaUrl={folhaUrl} cabH={cabH} rodH={rodH}>
          {idxs.map((i, gi) => itens[i] && <div key={itens[i].key} style={{ marginTop: gi === 0 ? 0 : (itens[i].gapTop || 0) }}>{itens[i].node}</div>)}
        </FolhaConteudo>
      ))}
      {ultimaUrl && (
        <div key="ultima" style={{ width: A4_W, minHeight: A4_H, position: 'relative', overflow: 'hidden', background: theme.cores.fundo, boxShadow: '0 2px 20px rgba(0,0,0,.16)' }}>
          <img src={ultimaUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      )}
    </div>
  )
}
