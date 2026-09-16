'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Mascote, type ReacaoMascote } from '@/components/mascote/mascote'

export type PontoTrilha = { x: number; y: number; estado: 'concluido' | 'atual' | 'disponivel'; intro?: boolean }

const FALAS: { pose: ReacaoMascote; msg: string }[] = [
  { pose: 'ideia', msg: 'Bora pra próxima aula?' },
  { pose: 'estudante', msg: 'Tô de olho no seu progresso!' },
  { pose: 'pensando', msg: 'Foca no que falta — você consegue.' },
  { pose: 'satisfeita', msg: 'Cada aula te deixa mais afiado.' },
  { pose: 'joinha', msg: 'Mandou bem até aqui!' },
]
const CELEBRA = ['Aula concluída! 🎉', 'Boa, essa você fechou!', 'Mais uma na conta! 👏', 'Tá voando! ✨']
// Anúncios direcionais (próxima aula abaixo / do outro lado).
const DIRECIONAIS = ['Próxima aula logo abaixo 👇', 'Tem mais ali embaixo 👇', 'Continua descendo 👇', 'Tô do outro lado agora 👋', 'Bora que a próxima te espera!']

function rnd<T>(a: T[]): T { return a[Math.floor(Math.random() * a.length)] }

type Passo = { x?: number; y?: number; naDireita: boolean; dy: number; pose: ReacaoMascote; msg: string }

/**
 * Capivara ajudante AUTÔNOMA do LegProc. Com geometria de nós (serpentina/reta) ela "voa" em arco
 * (mergulha e sobe) entre pontos aleatórios da trilha — cima, lados, comemorando concluídos e anunciando
 * a próxima. Sem geometria (lista/mapa) fica num canto flutuando e trocando de fala. Reusa o <Mascote>,
 * liga/desliga por aluno (localStorage) e respeita prefers-reduced-motion.
 */
export function CapiAjudanteTrilha({ pontos = [] }: { pontos?: PontoTrilha[] }) {
  const [ligado, setLigado] = useState(true)
  const [montado, setMontado] = useState(false)
  const [passo, setPasso] = useState<Passo | null>(null)
  const [ciclo, setCiclo] = useState(0)
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

  // Escolhe o próximo destino/pose/fala — ALEATÓRIO (só no cliente, após montar).
  const proximoPasso = useCallback((): Passo => {
    const naDireita = Math.random() < 0.5
    const dy = Math.round(Math.random() * 56 - 24) // -24..+32 → às vezes acima, às vezes ao lado/abaixo
    const reais = pontosRef.current.filter((p) => !p.intro)
    if (!reais.length) { const f = rnd(FALAS); return { naDireita, dy, pose: f.pose, msg: f.msg } }
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
    let pose: ReacaoMascote, msg: string
    if (ponto.estado === 'concluido') { pose = 'joinha'; msg = rnd(CELEBRA) }
    else if (Math.random() < 0.45) { pose = 'ideia'; msg = rnd(DIRECIONAIS) }
    else { const f = rnd(FALAS); pose = f.pose; msg = f.msg }
    return { x: ponto.x, y: ponto.y, naDireita, dy, pose, msg }
  }, [])

  // Troca a cada 8s (mais devagar). Sem reduce-motion → só o 1º passo, sem intervalo.
  useEffect(() => {
    if (!montado || !ligado) return
    setPasso(proximoPasso()); setCiclo((c) => c + 1)
    if (reduzir.current) return
    const t = setInterval(() => { setPasso(proximoPasso()); setCiclo((c) => c + 1) }, 8000)
    return () => clearInterval(t)
  }, [montado, ligado, proximoPasso])

  if (!montado || !ligado || !passo) return <BotaoAjudante ligado={ligado} onToggle={toggle} />

  // key={ciclo} reinicia o arco de "voo" (mergulha e sobe) a cada troca.
  const mascote = (
    <div key={ciclo} className="motion-safe:animate-[capi-mergulho_1.2s_ease-in-out]">
      <Mascote reacao={passo.pose} tamanho={74} mensagem={passo.msg} flutua={!reduzir.current} entra={false} espelhar={passo.naDireita} className="[&_img]:mt-3" />
    </div>
  )

  return (
    <>
      {temGeo && passo.x != null && passo.y != null ? (
        // Voo pela trilha: camada 1 (ancora no nó, transita) → camada 2 (deslize lateral distante) → arco.
        <div className="pointer-events-none absolute z-[3] transition-[left,top] duration-[900ms] ease-in-out" style={{ left: passo.x, top: passo.y + passo.dy }} aria-hidden>
          <div className="transition-transform duration-[1400ms] ease-in-out" style={{ transform: `translate(-50%, -66%) translateX(${passo.naDireita ? 150 : -150}px)` }}>
            {mascote}
          </div>
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
