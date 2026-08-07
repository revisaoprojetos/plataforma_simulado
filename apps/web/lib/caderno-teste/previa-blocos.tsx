'use client'

// Prévia dos MODELOS PRONTOS do v2 reusando o render de blocos do v1 (BlockRender) — para ficar
// IDÊNTICA ao Caderno de Prova v1 e à impressão (/imprimir/caderno). O BlockRender expande o
// `repeticao` sobre as questões do banco; a prévia MEDE cada item e distribui em folhas A4 de
// verdade (paginação como no `Previa`), aplicando o fundo de página (letterhead) em cada folha.

import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { BlockRender, dataComQuestao } from '@/lib/caderno-designer/blocks'
import { resolveTheme, cssDaFonte, type CadernoTheme } from '@/lib/caderno-designer/theme'
import { PRESETS_CADERNO } from '@/lib/caderno-designer/presets'
import { PAD_H, PAD_V, RUNNING_PADRAO, type CadernoData, type CadernoDoc, type QuestaoData } from '@/lib/caderno-designer/types'
import { CAPA_PADRAO, type CapaConfig, type PreviewQuestao } from './tipos'
import { formatarInline } from './formato'

const A4_W = 794
const A4_H = 1123

type Item = { key: string; gapTop: number; quebra?: boolean; node: ReactNode }

/** Doc pronto do v1 pelo id do preset (caderno-perguntas / caderno-completo / caderno-objetivo…). */
export function docDoPreset(presetId: string): CadernoDoc | null {
  const p = PRESETS_CADERNO.find((x) => x.id === presetId)
  return p ? p.build() : null
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

/** Questões do banco (PreviewQuestao) + variáveis do aluno → CadernoData que os blocos consomem. */
export function montarCadernoData(questoes: PreviewQuestao[], vars: Record<string, string>, titulo: string): CadernoData {
  const qs: QuestaoData[] = questoes.map((q, i) => ({
    id: q.id, numero: q.numero || i + 1, enunciado: q.enunciado ?? '', tipo: q.tipo, comentario: '',
    alternativas: (q.alternativas ?? []).map((a) => ({ letra: a.letra, texto: a.texto, correta: a.correta, comentario: a.comentario ?? '', lei: '' })),
  }))
  const data: CadernoData = {
    questoes: qs, numQuestoes: qs.length || 20, numAlternativas: 5, gabaritoLiberado: true,
    vars: { nome: '', simulado: titulo, acertos: '', erros: '', total_questoes: String(qs.length || 20), nota: '', percentual: '', ...vars },
  }
  if (qs[0]) { const base = dataComQuestao(data, qs[0]); data.vars = base.vars; data.questaoAtual = base.questaoAtual }
  return data
}

/** Itens (nós medíveis) de UMA página do doc — expande o `repeticao` questão a questão. */
function itensDaPagina(page: CadernoDoc['pages'][number], data: CadernoData, theme: CadernoTheme): Item[] {
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
      return qs.flatMap((q) => {
        const dq = dataComQuestao(data, q)
        const itens: Item[] = [{
          key: `${page.id}-${q.id}-head`, gapTop: gapQ,
          node: <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{head.map((ib: any) => <BlockRender key={ib.id} block={ib} theme={theme} data={dq} />)}</div>,
        }]
        for (const ib of resto) itens.push({ key: `${page.id}-${q.id}-${ib.id}`, gapTop: 6, node: <BlockRender block={ib} theme={theme} data={dq} /> })
        return itens
      })
    }
    return [{ key: `${page.id}-${block.id}`, gapTop: 0, node: <BlockRender block={block} theme={theme} data={data} /> }]
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
export function PreviaBlocos({ presetId, questoes, vars = {}, titulo, cores, capaUrl, folhaUrl, capa, onPickCapa, selCapa }: {
  presetId: string
  questoes: PreviewQuestao[]
  vars?: Record<string, string>
  titulo: string
  cores?: Partial<CadernoTheme['cores']> | null
  /** Imagem de capa: quando vazia, a página de capa NÃO aparece; quando definida, entra como capa. */
  capaUrl?: string
  /** Fundo (letterhead) aplicado em cada folha de conteúdo. */
  folhaUrl?: string
  /** Config do título da capa (sobrepõe o default do preset). */
  capa?: CapaConfig
  /** Clique no título da capa → abre o editor lateral. */
  onPickCapa?: () => void
  /** Título da capa selecionado (destaque). */
  selCapa?: boolean
}) {
  const doc = useMemo(() => docDoPreset(presetId), [presetId])
  const theme = useMemo(() => resolveTheme(cores), [cores])
  const data = useMemo(() => montarCadernoData(questoes, vars, titulo), [questoes, vars, titulo])
  const running = doc?.running ?? RUNNING_PADRAO
  // Reserva de área segura (cabeçalho/rodapé) — a arte do letterhead já traz cabeçalho/rodapé.
  const cabH = running.cabecalhoAtivo ? (running.cabecalhoAltura || PAD_V) : PAD_V
  const rodH = running.rodapeAtivo ? (running.rodapeAltura || PAD_V) : PAD_V
  const contentW = A4_W - 2 * PAD_H
  const availH = A4_H - cabH - rodH - 8

  // Itens medíveis de TODAS as páginas de conteúdo (quebra entre páginas do doc).
  const itens = useMemo<Item[]>(() => {
    if (!doc) return []
    const contentPages = doc.pages.filter((p) => p.kind !== 'capa')
    return contentPages.flatMap((page, i) => [
      ...(i > 0 ? [{ key: `brk-${page.id}`, gapTop: 0, quebra: true, node: null } as Item] : []),
      ...itensDaPagina(page, data, theme),
    ])
  }, [doc, data, theme])

  const medRef = useRef<HTMLDivElement>(null)
  const [paginas, setPaginas] = useState<number[][] | null>(null)
  useLayoutEffect(() => {
    const cont = medRef.current; if (!cont) return
    const alturas = (Array.from(cont.children) as HTMLElement[]).map((el) => el.getBoundingClientRect().height)
    const BUF = 4
    const grupos: number[][] = []; let atual: number[] = []; let h = 0
    for (let i = 0; i < alturas.length; i++) {
      if (itens[i].quebra) { if (atual.length) { grupos.push(atual); atual = []; h = 0 } continue }
      const alt = alturas[i]; const gap = atual.length ? (itens[i].gapTop || 0) : 0
      if (atual.length && h + gap + alt > availH - BUF) { grupos.push(atual); atual = []; h = 0 }
      const gap2 = atual.length ? (itens[i].gapTop || 0) : 0
      atual.push(i); h += gap2 + alt
    }
    if (atual.length) grupos.push(atual)
    setPaginas(grupos.length ? grupos : [[]])
  }, [itens, availH])

  if (!doc) return null
  const capaEfetiva: CapaConfig = { ...capaPadraoDoPreset(presetId), ...(capa ?? {}) }
  const capaPage = capaUrl ? doc.pages.find((p) => p.kind === 'capa') : null
  const pages = paginas ?? [itens.map((_, i) => i)]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22 }}>
      {/* passe de medição (escondido) */}
      <div ref={medRef} aria-hidden style={{ position: 'absolute', left: -99999, top: 0, width: contentW, display: 'flex', flexDirection: 'column' }}>
        {itens.map((it, i) => <div key={it.key} style={{ marginTop: i === 0 ? 0 : (it.gapTop || 0) }}>{it.node}</div>)}
      </div>
      {capaPage && <FolhaCapa key="capa" capaUrl={capaUrl!} capa={capaEfetiva} theme={theme} onPick={onPickCapa} sel={selCapa} />}
      {pages.map((idxs, pi) => (
        <FolhaConteudo key={pi} theme={theme} folhaUrl={folhaUrl} cabH={cabH} rodH={rodH}>
          {idxs.map((i, gi) => <div key={itens[i].key} style={{ marginTop: gi === 0 ? 0 : (itens[i].gapTop || 0) }}>{itens[i].node}</div>)}
        </FolhaConteudo>
      ))}
    </div>
  )
}
