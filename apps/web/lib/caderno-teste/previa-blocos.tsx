'use client'

// Prévia dos MODELOS PRONTOS do v2 reusando o render de blocos do v1 (BlockRender) — para ficar
// IDÊNTICA ao Caderno de Prova v1 e à impressão (/imprimir/caderno). Cada página do doc vira uma
// folha A4; o BlockRender expande o `repeticao` sobre as questões do banco. Espelha o render de
// tela de app/imprimir/caderno/[id]/page.tsx (ramo não-rawImg).

import { BlockRender, dataComQuestao } from '@/lib/caderno-designer/blocks'
import { resolveTheme, cssDaFonte, type CadernoTheme } from '@/lib/caderno-designer/theme'
import { PRESETS_CADERNO } from '@/lib/caderno-designer/presets'
import { faixaNaPagina, RUNNING_PADRAO, type CadernoData, type CadernoDoc, type QuestaoData } from '@/lib/caderno-designer/types'
import { CAPA_PADRAO, type CapaConfig, type PreviewQuestao } from './tipos'
import { formatarInline } from './formato'

const A4_W = 794
const A4_H = 1123

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

/** Uma folha A4 (fundo + cabeçalho + conteúdo + rodapé) — mesma estrutura da impressão. */
function Folha({ page, pi, data, theme, doc }: { page: CadernoDoc['pages'][number]; pi: number; data: CadernoData; theme: CadernoTheme; doc: CadernoDoc }) {
  const running = doc.running ?? RUNNING_PADRAO
  const cabecalho = (doc.cabecalho ?? []) as any[]
  const rodape = (doc.rodape ?? []) as any[]
  const bg = page.blocks.find((b: any) => b.type === 'plano-fundo') as any
  const conteudo = page.blocks.filter((b: any) => b.type !== 'plano-fundo')
  const mostraCab = running.cabecalhoAtivo && cabecalho.length > 0 && faixaNaPagina(running.cabecalhoPaginas, pi, page.kind)
  const mostraRod = running.rodapeAtivo && rodape.length > 0 && faixaNaPagina(running.rodapePaginas, pi, page.kind)
  return (
    <div style={{ width: A4_W, minHeight: A4_H, position: 'relative', overflow: 'hidden', background: theme.cores.fundo, color: theme.cores.texto, boxShadow: '0 2px 20px rgba(0,0,0,.16)', fontFamily: theme.tipografia.familia }}>
      {bg?.attributes?.url && (
        <div style={{ position: 'absolute', inset: 0, backgroundImage: `url(${bg.attributes.url})`, backgroundSize: '210mm 297mm', backgroundRepeat: 'no-repeat', backgroundPosition: 'top center', opacity: (bg.attributes.opacidade ?? 100) / 100 }} />
      )}
      <div style={{ position: 'relative', display: 'flex', minHeight: A4_H, flexDirection: 'column' }}>
        {mostraCab && (
          <div style={{ borderBottom: `1px solid ${theme.cores.secundaria}33`, paddingTop: '10mm', paddingBottom: 8, marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 6, ...(running.cabecalhoAltura ? { minHeight: running.cabecalhoAltura } : {}) }}>
            {cabecalho.map((b) => <BlockRender key={b.id} block={b} theme={theme} data={data} />)}
          </div>
        )}
        <div style={{ flex: 1, display: 'block', paddingLeft: '16mm', paddingRight: '16mm', paddingTop: mostraCab ? 0 : '14mm', paddingBottom: mostraRod ? 0 : '14mm' }}>
          {conteudo.map((block: any) => <div key={block.id} style={{ marginBottom: 6 }}><BlockRender block={block} theme={theme} data={data} /></div>)}
        </div>
        {mostraRod && (
          <div style={{ borderTop: `1px solid ${theme.cores.secundaria}33`, paddingTop: 8, paddingBottom: '10mm', marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6, ...(running.rodapeAltura ? { minHeight: running.rodapeAltura } : {}) }}>
            {rodape.map((b) => <BlockRender key={b.id} block={b} theme={theme} data={data} />)}
          </div>
        )}
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
          position: 'absolute', left: `${capa.posH}%`, top: `${capa.posV}%`, transform: 'translate(-50%, -50%)', maxWidth: '84%',
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
export function PreviaBlocos({ presetId, questoes, vars = {}, titulo, cores, capaUrl, capa, onPickCapa, selCapa }: {
  presetId: string
  questoes: PreviewQuestao[]
  vars?: Record<string, string>
  titulo: string
  cores?: Partial<CadernoTheme['cores']> | null
  /** Imagem de capa: quando vazia, a página de capa NÃO aparece; quando definida, entra como capa. */
  capaUrl?: string
  /** Config do título da capa (sobrepõe o default do preset). */
  capa?: CapaConfig
  /** Clique no título da capa → abre o editor lateral. */
  onPickCapa?: () => void
  /** Título da capa selecionado (destaque). */
  selCapa?: boolean
}) {
  const doc = docDoPreset(presetId)
  if (!doc) return null
  const theme = resolveTheme(cores)
  const data = montarCadernoData(questoes, vars, titulo)
  const capaEfetiva: CapaConfig = { ...capaPadraoDoPreset(presetId), ...(capa ?? {}) }
  // Sem imagem de capa → omite a página de capa (evita capa em branco). Com imagem → capa interativa.
  const pages = capaUrl ? doc.pages : doc.pages.filter((p) => p.kind !== 'capa')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22 }}>
      {pages.map((page, pi) => page.kind === 'capa'
        ? <FolhaCapa key={page.id} capaUrl={capaUrl!} capa={capaEfetiva} theme={theme} onPick={onPickCapa} sel={selCapa} />
        : <Folha key={page.id} page={page} pi={pi} data={data} theme={theme} doc={doc} />)}
    </div>
  )
}
