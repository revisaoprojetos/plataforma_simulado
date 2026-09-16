'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Mascote, type ReacaoMascote } from '@/components/mascote/mascote'

export type PontoTrilha = { x: number; y: number; estado: 'concluido' | 'atual' | 'disponivel'; intro?: boolean }

type Fala = { pose: ReacaoMascote; msg: string }
// Incentivo geral (frases curtas — o balão é estreito, evita quebrar em várias linhas).
const INCENTIVOS: Fala[] = [
  { pose: 'ideia', msg: 'Bora pra próxima!' },
  { pose: 'estudante', msg: 'Tô de olho em você!' },
  { pose: 'satisfeita', msg: 'Cada aula conta.' },
  { pose: 'joinha', msg: 'Mandou bem!' },
  { pose: 'feliz', msg: 'Segue firme! 💪' },
  { pose: 'estudante', msg: 'Você chega lá!' },
]
// Dicas de estudo / no que focar.
const DICAS: Fala[] = [
  { pose: 'ideia', msg: 'Grifa o que mais cai.' },
  { pose: 'pensando', msg: 'Foca nos artigos-chave.' },
  { pose: 'balanca', msg: 'Cuidado com as exceções.' },
  { pose: 'ideia', msg: 'Decora prazos e competências.' },
  { pose: 'estudante', msg: 'Errou? Revisa o artigo.' },
  { pose: 'meditando', msg: 'Uma aula por dia já vale.' },
  { pose: 'escrevendo', msg: 'Anota as dúvidas.' },
  { pose: 'pensando', msg: 'Testa no quiz pra fixar.' },
  { pose: 'ideia', msg: 'Revisa os grifos antes.' },
  { pose: 'estudante', msg: 'Ler em voz alta ajuda.' },
]
// Comemorações (nó concluído).
const CELEBRA: Fala[] = [
  { pose: 'joinha', msg: 'Aula concluída! 🎉' },
  { pose: 'satisfeita', msg: 'Essa você fechou!' },
  { pose: 'joinha', msg: 'Mais uma! 👏' },
  { pose: 'coracao', msg: 'Tá voando! ✨' },
  { pose: 'feliz', msg: 'Chave de ouro! 🏆' },
]
// Anúncios direcionais (próxima aula abaixo / do outro lado).
const DIRECIONAIS: Fala[] = [
  { pose: 'ideia', msg: 'Próxima ali embaixo 👇' },
  { pose: 'ideia', msg: 'Tem mais abaixo 👇' },
  { pose: 'ideia', msg: 'Continua descendo 👇' },
  { pose: 'feliz', msg: 'Tô do outro lado 👋' },
  { pose: 'ideia', msg: 'A próxima te espera!' },
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
    const atual = reais.find((p) => p.estado === 'atual') ?? reais[0]
    const concluidos = reais.filter((p) => p.estado === 'concluido')
    // Destino: fica no ATUAL (onde o aluno está) e só às vezes sobe a um CONCLUÍDO p/ comemorar.
    // NUNCA desce a aulas futuras/bloqueadas (o aluno ainda não chegou lá).
    const ponto = concluidos.length && Math.random() < 0.3 ? rnd(concluidos) : atual
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

  const mascote = <Mascote reacao={passo.pose} tamanho={74} mensagem={passo.msg} flutua={!reduzir.current} entra={false} className="[&_img]:mt-3" />

  return (
    <>
      {temGeo && passo.x != null && passo.y != null ? (
        // Fica SEMPRE à esquerda da trilha (nunca em cima, nem atrás do card, que abre à direita) e
        // acompanha só a ALTURA do nó atual — desliza suave por top (sem remontar → sem teleporte). O
        // -translate-x-full deixa a borda direita ~70px à esquerda do nó. Fade só se um card abrir no
        // MESMO lado (esquerda) — raro; com card à direita ela continua visível.
        <div className="pointer-events-none absolute z-[3] w-max -translate-x-full" aria-hidden
          style={{ left: passo.x - 110, top: passo.y + passo.dy, opacity: ladoCard === 'left' ? 0 : 1, transition: 'left 1.1s ease-in-out, top 1.1s ease-in-out, opacity .3s ease' }}>
          {mascote}
        </div>
      ) : (
        // Modo canto (formatos lista/mapa, sem geometria de nós): fixa flutuando.
        <div className="pointer-events-none fixed bottom-28 left-4 z-30 w-max md:bottom-8" aria-hidden>{mascote}</div>
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
