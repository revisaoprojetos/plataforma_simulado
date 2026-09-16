'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Mascote, type ReacaoMascote } from '@/components/mascote/mascote'

export type PontoTrilha = { x: number; y: number; estado: 'concluido' | 'atual' | 'disponivel'; intro?: boolean }

type Fala = { pose: ReacaoMascote; msg: string }
// Incentivo geral.
const INCENTIVOS: Fala[] = [
  { pose: 'ideia', msg: 'Bora pra próxima aula?' },
  { pose: 'estudante', msg: 'Tô de olho no seu progresso!' },
  { pose: 'satisfeita', msg: 'Cada aula te deixa mais afiado.' },
  { pose: 'joinha', msg: 'Mandou bem até aqui!' },
  { pose: 'feliz', msg: 'Constância vence — segue firme!' },
  { pose: 'estudante', msg: 'Passo a passo você chega lá.' },
]
// Dicas de estudo / no que focar.
const DICAS: Fala[] = [
  { pose: 'ideia', msg: 'Grifa o que for mais cobrado enquanto lê.' },
  { pose: 'pensando', msg: 'Foca nos artigos que mais caem em prova.' },
  { pose: 'balanca', msg: 'Atenção às exceções — elas caem muito.' },
  { pose: 'ideia', msg: 'Prazos e competências: decora esses!' },
  { pose: 'estudante', msg: 'Errou no quiz? Volta no artigo e revisa.' },
  { pose: 'meditando', msg: 'Uma aula por dia já te leva longe.' },
  { pose: 'escrevendo', msg: 'Anota as dúvidas pra revisar depois.' },
  { pose: 'pensando', msg: 'Leu? Testa no quiz pra fixar de vez.' },
  { pose: 'ideia', msg: 'Revisa os grifos antes de responder.' },
  { pose: 'estudante', msg: 'Reler em voz alta ajuda a memorizar.' },
]
// Comemorações (nó concluído).
const CELEBRA: Fala[] = [
  { pose: 'joinha', msg: 'Aula concluída! 🎉' },
  { pose: 'satisfeita', msg: 'Boa, essa você fechou!' },
  { pose: 'joinha', msg: 'Mais uma na conta! 👏' },
  { pose: 'coracao', msg: 'Tá voando! ✨' },
  { pose: 'feliz', msg: 'Fechou com chave de ouro!' },
]
// Anúncios direcionais (próxima aula abaixo / do outro lado).
const DIRECIONAIS: Fala[] = [
  { pose: 'ideia', msg: 'Próxima aula logo abaixo 👇' },
  { pose: 'ideia', msg: 'Tem mais ali embaixo 👇' },
  { pose: 'ideia', msg: 'Continua descendo 👇' },
  { pose: 'feliz', msg: 'Tô do outro lado agora 👋' },
  { pose: 'ideia', msg: 'Bora que a próxima te espera!' },
]

function rnd<T>(a: T[]): T { return a[Math.floor(Math.random() * a.length)] }

type Passo = { x?: number; y?: number; naDireita: boolean; dy: number; pose: ReacaoMascote; msg: string }

/**
 * Capivara ajudante AUTÔNOMA do LegProc. Com geometria de nós (serpentina/reta) ela "voa" em arco
 * (mergulha e sobe) entre pontos aleatórios da trilha — cima, lados, comemorando concluídos e anunciando
 * a próxima. Sem geometria (lista/mapa) fica num canto flutuando e trocando de fala. Reusa o <Mascote>,
 * liga/desliga por aluno (localStorage) e respeita prefers-reduced-motion.
 */
export function CapiAjudanteTrilha({ pontos = [], ladoCard = null }: { pontos?: PontoTrilha[]; ladoCard?: 'left' | 'right' | null }) {
  const [ligado, setLigado] = useState(true)
  const [montado, setMontado] = useState(false)
  const [passo, setPasso] = useState<Passo | null>(null)
  const reduzir = useRef(false)
  const pontosRef = useRef(pontos)
  pontosRef.current = pontos
  const temGeo = pontos.length > 0

  useEffect(() => {
    setMontado(true)
    try { const v = localStorage.getItem('legproc:capi-ajudante'); if (v != null) setLigado(v === '1') } catch { /* sem storage */ }
    reduzir.current = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  }, [])
  function toggle() { setLigado((v) => { const n = !v; try { localStorage.setItem('legproc:capi-ajudante', n ? '1' : '0') } catch { /* ignore */ }; return n }) }

  // Inteligência anti-repetição: guarda as últimas falas e evita repetir as recentes.
  const usadasRef = useRef<string[]>([])
  const semRepetir = useCallback((pool: Fala[]): Fala => {
    const recentes = usadasRef.current
    const livres = pool.filter((p) => !recentes.includes(p.msg))
    const escolha = rnd(livres.length ? livres : pool)
    usadasRef.current = [escolha.msg, ...recentes].slice(0, 7)
    return escolha
  }, [])

  // Escolhe o próximo destino/pose/fala — ALEATÓRIO (só no cliente, após montar), sem repetir mensagem.
  const proximoPasso = useCallback((): Passo => {
    const naDireita = Math.random() < 0.4 // viés à esquerda (troca de lado com menos frequência)
    const dy = Math.round(Math.random() * 56 - 24) // -24..+32 → às vezes acima, às vezes ao lado/abaixo
    const reais = pontosRef.current.filter((p) => !p.intro)
    if (!reais.length) { const f = semRepetir([...INCENTIVOS, ...DICAS]); return { naDireita, dy, pose: f.pose, msg: f.msg } }
    const iAt = reais.findIndex((p) => p.estado === 'atual')
    const atual = reais[iAt] ?? reais[0]
    const concl = [...reais].reverse().find((p) => p.estado === 'concluido')
    const prox = iAt >= 0 ? reais[iAt + 1] : undefined
    // Destino: geralmente o atual; às vezes um concluído (comemora), a próxima, ou um nó qualquer.
    const r = Math.random()
    let ponto = atual
    if (concl && r < 0.28) ponto = concl
    else if (prox && r < 0.5) ponto = prox
    else if (r < 0.62) ponto = rnd(reais)
    // Fala: comemora se concluído; senão sorteia entre DICAS (foco) / INCENTIVOS / DIRECIONAIS.
    let fala: Fala
    if (ponto.estado === 'concluido') fala = semRepetir(CELEBRA)
    else { const cat = Math.random(); fala = semRepetir(cat < 0.42 ? DICAS : cat < 0.76 ? INCENTIVOS : DIRECIONAIS) }
    return { x: ponto.x, y: ponto.y, naDireita, dy, pose: fala.pose, msg: fala.msg }
  }, [semRepetir])

  // Troca a cada 8s (mais devagar). Sem reduce-motion → só o 1º passo, sem intervalo.
  useEffect(() => {
    if (!montado || !ligado) return
    setPasso(proximoPasso())
    if (reduzir.current) return
    const t = setInterval(() => setPasso(proximoPasso()), 8000)
    return () => clearInterval(t)
  }, [montado, ligado, proximoPasso])

  if (!montado || !ligado || !passo) return <BotaoAjudante ligado={ligado} onToggle={toggle} />

  const naDireita = passo.naDireita
  const mascote = <Mascote reacao={passo.pose} tamanho={74} mensagem={passo.msg} flutua={!reduzir.current} entra={false} espelhar={naDireita} className="[&_img]:mt-3" />

  return (
    <>
      {temGeo && passo.x != null && passo.y != null ? (
        // UM só elemento persistente: desliza suave por left/top (sem remontar → sem teleporte). O lado
        // já entra no `left` (nunca fica "em cima" da trilha). Com um card de dia ABERTO, ela dá um FADE
        // (sai de cena discretamente, sem ficar atrás do card) e reaparece ao fechar.
        <div className="pointer-events-none absolute z-[3]" aria-hidden
          style={{ left: passo.x + (naDireita ? 215 : -215), top: passo.y + passo.dy, transform: 'translate(-50%, -60%)', opacity: ladoCard ? 0 : 1, transition: 'left 1.1s ease-in-out, top 1.1s ease-in-out, opacity .3s ease' }}>
          {mascote}
        </div>
      ) : (
        // Modo canto (formatos lista/mapa, sem geometria de nós): fixa flutuando.
        <div className="pointer-events-none fixed bottom-28 left-4 z-30 md:bottom-8" aria-hidden>{mascote}</div>
      )}
      <BotaoAjudante ligado={ligado} onToggle={toggle} />
    </>
  )
}

function BotaoAjudante({ ligado, onToggle }: { ligado: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} title={ligado ? 'Desligar a ajudante' : 'Ligar a ajudante'}
      className="fixed bottom-24 right-4 z-30 inline-flex items-center gap-1.5 rounded-full border bg-card/90 px-3 py-1.5 text-xs font-medium shadow-md backdrop-blur transition-colors hover:bg-card md:bottom-6">
      <span className="text-base leading-none">🦫</span> {ligado ? 'Ajudante' : 'Ajudante off'}
    </button>
  )
}
