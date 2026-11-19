'use client'
// FOLHA LIVRE + CANETA (Caderno beta, fase 3) — componente controlado, sem fetch/server actions.
//   <FolhaLivre valor={folha} onChange={(nova) => ...} />   (o chamador faz o debounce/PATCH de `tinta`)
// Desfazer/refazer ficam internos (pilha limitada em lib/aluno/notebook-folha.ts).
// Funciona em iframe (nada de window.top) e rola com o dedo; só a camada de tinta usa touch-action:none.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import {
  adicionarCaixa, adicionarTraco, atualizarTextoCaixa, confirmarDesde, criarHistorico, desfazer, expandirSeNecessario, gerarId,
  moverCaixa, podeDesfazer, podeRefazer, redimensionarCaixa, refazer, registrar, removerCaixa, removerTracos, substituirPresente,
  trazerParaFrente, type CorFolha, type Folha, type Historico, type TracoFolha,
} from '@/lib/aluno/notebook-folha'
import { BarraFerramentasFolha, type FerramentaFolha } from './barra-ferramentas-folha'
import { CamadaTinta } from './camada-tinta'
import { CaixaTextoFolha } from './caixa-texto-folha'

const ZOOM_MIN = 0.4
const ZOOM_MAX = 3

// Cores semânticas da paleta (nomes fixos -> CSS vars). tinta/primaria seguem o tema/marca; as demais são cores de caneta
// (oklch, ajustadas para legibilidade em claro e escuro).
const VARS_COR: CSSProperties = {
  ['--folha-cor-tinta' as string]: 'var(--foreground)',
  ['--folha-cor-primaria' as string]: 'var(--brand-primary)',
  ['--folha-cor-vermelho' as string]: 'var(--destructive, oklch(0.6 0.22 27))',
  ['--folha-cor-laranja' as string]: 'oklch(0.72 0.17 55)',
  ['--folha-cor-amarelo' as string]: 'oklch(0.88 0.17 95)',
  ['--folha-cor-verde' as string]: 'oklch(0.68 0.17 150)',
  ['--folha-cor-azul' as string]: 'oklch(0.62 0.18 250)',
  ['--folha-cor-rosa' as string]: 'oklch(0.72 0.2 350)',
}

interface Props {
  valor: Folha
  onChange: (nova: Folha) => void
  somenteLeitura?: boolean
  /** Altura do componente (padrão: 100% do pai, mínimo 480px). */
  altura?: number | string
}

export function FolhaLivre({ valor, onChange, somenteLeitura = false, altura = '100%' }: Props) {
  const [hist, setHist] = useState<Historico>(() => criarHistorico(valor))
  const histRef = useRef(hist)
  const ultimoEmitido = useRef<Folha>(valor)
  const snapshot = useRef<Folha | null>(null)
  const [ferramenta, setFerramenta] = useState<FerramentaFolha>(somenteLeitura ? 'mao' : 'caneta')
  const [cor, setCor] = useState<CorFolha>('tinta')
  const [espessura, setEspessura] = useState(4)
  const [soCaneta, setSoCaneta] = useState(false)
  const [zoom, setZoomState] = useState(1)
  const [selId, setSelId] = useState<string | null>(null)
  const [focoId, setFocoId] = useState<string | null>(null)
  const [aviso, setAviso] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const palcoRef = useRef<HTMLDivElement>(null)
  const zoomRef = useRef(1)
  const ancora = useRef<{ fx: number; fy: number; cx: number; cy: number } | null>(null)

  const folha = hist.presente

  // Valor trocado de fora (ex.: outra página carregada): reinicia o histórico.
  useEffect(() => {
    if (valor === ultimoEmitido.current || valor === histRef.current.presente) return
    ultimoEmitido.current = valor
    const h = criarHistorico(valor)
    histRef.current = h
    setHist(h)
    setSelId(null)
  }, [valor])

  const aplicar = useCallback((fn: (h: Historico) => Historico) => {
    if (somenteLeitura) return
    const antes = histRef.current
    const prox = fn(antes)
    if (prox === antes) return
    histRef.current = prox
    setHist(prox)
    if (prox.presente !== antes.presente) {
      ultimoEmitido.current = prox.presente
      onChange(prox.presente)
    }
  }, [onChange, somenteLeitura])

  // ---- zoom (mantém o ponto sob o dedo/cursor) ----
  const setZoom = useCallback((novo: number, cx?: number, cy?: number) => {
    const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, novo))
    if (Math.abs(z - zoomRef.current) < 0.001) return
    const sc = scrollRef.current, palco = palcoRef.current
    if (sc && palco) {
      const sr = sc.getBoundingClientRect(), pr = palco.getBoundingClientRect()
      const x = cx ?? sr.left + sr.width / 2, y = cy ?? sr.top + sr.height / 2
      ancora.current = { fx: (x - pr.left) / zoomRef.current, fy: (y - pr.top) / zoomRef.current, cx: x, cy: y }
    }
    zoomRef.current = z
    setZoomState(z)
  }, [])
  useLayoutEffect(() => {
    const a = ancora.current, sc = scrollRef.current, palco = palcoRef.current
    if (!a || !sc || !palco) return
    ancora.current = null
    const pr = palco.getBoundingClientRect()
    sc.scrollLeft += pr.left + a.fx * zoom - a.cx
    sc.scrollTop += pr.top + a.fy * zoom - a.cy
  }, [zoom])

  // Ajuste inicial à largura disponível (celular/iframe estreito).
  useEffect(() => {
    const sc = scrollRef.current
    if (!sc) return
    const w = sc.clientWidth
    if (w > 0 && w < valor.largura) {
      const z = Math.min(1, Math.max(ZOOM_MIN, (w - 8) / valor.largura))
      zoomRef.current = z
      setZoomState(z)
    }
    // só na montagem
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Ctrl + roda = zoom (listener não-passivo para poder impedir o zoom do navegador).
  useEffect(() => {
    const sc = scrollRef.current
    if (!sc) return
    const h = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      setZoom(zoomRef.current * (e.deltaY < 0 ? 1.1 : 1 / 1.1), e.clientX, e.clientY)
    }
    sc.addEventListener('wheel', h, { passive: false })
    return () => sc.removeEventListener('wheel', h)
  }, [setZoom])

  // ---- ações ----
  const aoTraco = (t: TracoFolha) => {
    setAviso('')
    aplicar((h) => {
      const f = adicionarTraco(h.presente, t)
      if (f === h.presente) { setAviso('Limite da folha atingido: apague algo ou use outra folha.'); return h }
      return registrar(h, expandirSeNecessario(f))
    })
  }
  const aoApagar = (ids: string[]) => aplicar((h) => registrar(h, removerTracos(h.presente, ids)))

  const inicioGesto = () => { if (!snapshot.current) snapshot.current = histRef.current.presente }
  const fimGesto = () => {
    const s = snapshot.current
    snapshot.current = null
    if (!s) return
    aplicar((h) => confirmarDesde({ ...h, presente: h.presente }, s))
  }
  const viva = (fn: (f: Folha) => Folha) => aplicar((h) => substituirPresente(h, fn(h.presente)))

  const criarCaixaEm = (e: React.PointerEvent<HTMLDivElement>) => {
    if (somenteLeitura || ferramenta !== 'caixa' || e.target !== e.currentTarget) return
    const r = e.currentTarget.getBoundingClientRect()
    const id = gerarId()
    const x = (e.clientX - r.left) / zoom, y = (e.clientY - r.top) / zoom
    aplicar((h) => {
      const f = adicionarCaixa(h.presente, { id, x, y })
      if (f === h.presente) { setAviso('Limite de caixas atingido.'); return h }
      return registrar(h, expandirSeNecessario(f))
    })
    setSelId(id)
    setFocoId(id)
    setFerramenta('selecionar')
  }

  const desselecionar = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && ferramenta === 'selecionar') { setSelId(null); setFocoId(null) }
  }

  const trocarFerramenta = (f: FerramentaFolha) => {
    setFerramenta(f)
    if (f !== 'selecionar' && f !== 'caixa') { setSelId(null); setFocoId(null) }
  }

  const tinta = ferramenta === 'caneta' || ferramenta === 'marca-texto' || ferramenta === 'borracha'
  const interativas = ferramenta === 'selecionar'

  const raiz: CSSProperties = {
    ...VARS_COR, display: 'flex', flexDirection: 'column', width: '100%', height: altura, minHeight: 480,
    background: 'var(--background)', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden',
  }

  return (
    <div style={raiz} data-folha-livre>
      {!somenteLeitura && (
        <BarraFerramentasFolha
          ferramenta={ferramenta}
          aoFerramenta={trocarFerramenta}
          cor={cor}
          aoCor={(c) => { setCor(c); if (ferramenta === 'borracha' || ferramenta === 'mao' || ferramenta === 'selecionar' || ferramenta === 'caixa') setFerramenta('caneta') }}
          espessura={espessura}
          aoEspessura={setEspessura}
          podeDesfazer={podeDesfazer(hist)}
          podeRefazer={podeRefazer(hist)}
          aoDesfazer={() => aplicar(desfazer)}
          aoRefazer={() => aplicar(refazer)}
          soCaneta={soCaneta}
          aoSoCaneta={setSoCaneta}
          zoom={zoom}
          aoZoom={(z) => setZoom(z)}
          temSelecao={!!selId}
          aoExcluirSelecao={() => { if (selId) { const id = selId; setSelId(null); aplicar((h) => registrar(h, removerCaixa(h.presente, id))) } }}
        />
      )}
      {aviso && <div role="status" style={{ padding: '6px 12px', fontSize: 13, background: 'var(--muted)', color: 'var(--foreground)', borderBottom: '1px solid var(--border)' }}>{aviso}</div>}
      <div
        ref={scrollRef}
        style={{ flex: 1, minHeight: 0, overflow: 'auto', background: 'var(--muted)', overscrollBehavior: 'contain', touchAction: tinta ? undefined : 'pan-x pan-y pinch-zoom' }}
      >
        <div style={{ width: folha.largura * zoom, height: folha.altura * zoom, margin: '0 auto', position: 'relative', flex: '0 0 auto' }}>
          <div
            ref={palcoRef}
            onPointerDown={(e) => { criarCaixaEm(e); desselecionar(e) }}
            style={{
              position: 'absolute', left: 0, top: 0, width: folha.largura, height: folha.altura, transform: `scale(${zoom})`, transformOrigin: '0 0',
              background: 'var(--card)', backgroundImage: 'radial-gradient(var(--border) 1px, transparent 1px)', backgroundSize: '28px 28px',
              boxShadow: '0 0 0 1px var(--border)', cursor: ferramenta === 'caixa' ? 'text' : undefined,
            }}
          >
            {folha.caixas.map((c) => (
              <CaixaTextoFolha
                key={c.id}
                caixa={c}
                zoom={zoom}
                selecionada={selId === c.id}
                interativa={interativas && !somenteLeitura}
                somenteLeitura={somenteLeitura}
                autoFoco={focoId === c.id}
                aoSelecionar={(id) => { setSelId(id); aplicar((h) => { const f = trazerParaFrente(h.presente, id); return f === h.presente ? h : substituirPresente(h, f) }) }}
                aoInicioGesto={inicioGesto}
                aoFimGesto={fimGesto}
                aoMover={(id, x, y) => viva((f) => expandirSeNecessario(moverCaixa(f, id, x, y)))}
                aoRedimensionar={(id, w, h2) => viva((f) => expandirSeNecessario(redimensionarCaixa(f, id, w, h2)))}
                aoTexto={(id, t) => viva((f) => atualizarTextoCaixa(f, id, t))}
                aoExcluir={(id) => { setSelId(null); aplicar((h) => registrar(h, removerCaixa(h.presente, id))) }}
              />
            ))}
            <CamadaTinta
              tracos={folha.tracos}
              largura={folha.largura}
              altura={folha.altura}
              ferramenta={ferramenta === 'marca-texto' || ferramenta === 'borracha' ? ferramenta : 'caneta'}
              cor={cor}
              espessura={espessura}
              ativa={tinta && !somenteLeitura}
              soCaneta={soCaneta}
              zoom={zoom}
              scrollRef={scrollRef}
              palcoRef={palcoRef}
              aoTraco={aoTraco}
              aoApagar={aoApagar}
              aoZoom={(z, cx, cy) => setZoom(z, cx, cy)}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
