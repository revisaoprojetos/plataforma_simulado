'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Mascote, type ReacaoMascote } from '@/components/mascote/mascote'

export type PontoTrilha = { x: number; y: number; estado: 'concluido' | 'atual' | 'disponivel'; intro?: boolean }

// Falas de incentivo (determinísticas por índice — sem Math.random p/ não "piscar" a cada render).
const FALAS: { pose: ReacaoMascote; msg: string }[] = [
  { pose: 'ideia', msg: 'Bora pra próxima aula?' },
  { pose: 'estudante', msg: 'Tô de olho no seu progresso!' },
  { pose: 'pensando', msg: 'Foca no que falta — você consegue.' },
  { pose: 'satisfeita', msg: 'Cada aula te deixa mais afiado.' },
  { pose: 'joinha', msg: 'Mandou bem até aqui!' },
]
// Comemorações (variam a cada visita a um nó concluído — sem repetir sempre a mesma).
const CELEBRA = ['Aula concluída! 🎉', 'Boa, essa você fechou!', 'Mais uma na conta! 👏', 'Tá voando! ✨']

/**
 * Capivara ajudante AUTÔNOMA da trilha do LegProc: fica ao lado do nó atual, "anda" até um nó concluído
 * pra comemorar e volta, trocando de pose/fala. Reusa o <Mascote> (poses + balão) e as animações CSS.
 * Liga/desliga por aluno (localStorage). Respeita prefers-reduced-motion (fica parada, sem andar).
 * Renderizada DENTRO do container da trilha (posições vêm prontas — não mede o DOM nem altera o layout).
 */
export function CapiAjudanteTrilha({ pontos }: { pontos: PontoTrilha[] }) {
  const [ligado, setLigado] = useState(true)
  const [i, setI] = useState(0)
  const [montado, setMontado] = useState(false)
  const reduzir = useRef(false)

  useEffect(() => {
    setMontado(true)
    try { const v = localStorage.getItem('legproc:capi-ajudante'); if (v != null) setLigado(v === '1') } catch { /* sem storage */ }
    reduzir.current = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  }, [])
  function toggle() { setLigado((v) => { const n = !v; try { localStorage.setItem('legproc:capi-ajudante', n ? '1' : '0') } catch { /* ignore */ }; return n }) }

  // Nó BASE (onde a Capi fica): o atual; + o último CONCLUÍDO (p/ comemorar de vez em quando).
  const { base, concl } = useMemo(() => {
    const reais = pontos.filter((p) => !p.intro)
    const atual = reais.find((p) => p.estado === 'atual')
    return { base: atual ?? reais[0] ?? pontos[0] ?? null, concl: [...reais].reverse().find((p) => p.estado === 'concluido') ?? null }
  }, [pontos])

  // Voa/troca de lado + pose a cada 5s (sem reduce-motion → fica parada).
  useEffect(() => {
    if (!ligado || reduzir.current) return
    const t = setInterval(() => setI((v) => v + 1), 5000)
    return () => clearInterval(t)
  }, [ligado])

  if (!montado) return null
  if (!ligado || !base) return <BotaoAjudante ligado={ligado} onToggle={toggle} />

  // Fica no ATUAL incentivando; só 1 a cada 3 ciclos hopa até o concluído p/ comemorar (msg varia).
  const noConcluido = !!concl && i % 3 === 2
  const parada = noConcluido ? concl! : base
  const fala = noConcluido
    ? { pose: 'joinha' as ReacaoMascote, msg: CELEBRA[Math.floor(i / 3) % CELEBRA.length] }
    : FALAS[i % FALAS.length]
  // Alterna o LADO a cada ciclo → a Capi "voa" da direita p/ a esquerda cruzando o nó, longe do card
  // do dia (que abre bem à direita). Sem movimento no reduce-motion (fica à esquerda, estática).
  const naDireita = !reduzir.current && i % 2 === 1

  return (
    <>
      {/* Camada 1: ancorada no nó (transita suave entre nós). */}
      <div className="pointer-events-none absolute z-[3] transition-[left,top] duration-700 ease-in-out" style={{ left: parada.x, top: parada.y }} aria-hidden>
        {/* Camada 2: deslize lateral esquerda↔direita cruzando o nó (transição do transform). */}
        <div className="transition-transform duration-[1100ms] ease-in-out" style={{ transform: `translate(-50%, -64%) translateX(${naDireita ? 108 : -108}px)` }}>
          {/* Camada 3: arco de "voo" (mergulha e sobe) a cada travessia — key={i} reinicia a animação. */}
          <div key={i} className="motion-safe:animate-[capi-mergulho_1.1s_ease-in-out]">
            {/* [&_img]:mt-3 → afasta a imagem do bico do balão (a flutuação não cobre a ponta). */}
            <Mascote reacao={fala.pose} tamanho={76} mensagem={fala.msg} flutua={!reduzir.current} entra={false} espelhar={naDireita} className="[&_img]:mt-3" />
          </div>
        </div>
      </div>
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
