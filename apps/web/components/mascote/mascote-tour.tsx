'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { ArrowRight, Check } from 'lucide-react'
import { Mascote, type ReacaoMascote } from './mascote'
import { TourDashboard } from './tour-dashboard'
import { TourIcones } from './tour-icones'

// Bump a versão quando quiser reexibir o tour após uma atualização (mostra 1x por versão/aluno-navegador).
const VERSAO = 1
const KEY = `mascote-tour-gam:v${VERSAO}`
// Fase de continuação entre páginas: ao terminar a Início, o tour segue na página de Trilha.
const RESUME = `mascote-tour-gam:fase:v${VERSAO}`

type Area = { pose: ReacaoMascote; titulo: string; texto: string; alvo: string; topo?: boolean }
// `topo`: destaca só a PARTE DE CIMA do alvo (altura limitada), na largura cheia do elemento.
type Passo = { tipo: 'welcome' | 'dashboard' | 'area' | 'icones'; pose: ReacaoMascote; titulo: string; texto: string; alvo?: string; topo?: boolean }

// Capítulos do tour, um por página. Cada instância do MascoteTour (montada na sua página) roda o
// capítulo quando a fase salva bate e, ao terminar, leva para a próxima página (ou encerra).
// Ordem: Início → Trilha → Ligas → Perfil (com sinal p/ a Ajuda no fim).
type Cap = { fase: string; proxFase?: string; proxRota?: string; proxLabel?: string }
const CAPS: Record<string, Cap> = {
  '/aluno':        { fase: '',       proxFase: 'trilha', proxRota: '/aluno/trilha', proxLabel: 'Ir para a Trilha' },
  '/aluno/trilha': { fase: 'trilha', proxFase: 'ligas',  proxRota: '/aluno/ligas',  proxLabel: 'Ir para as Ligas' },
  '/aluno/ligas':  { fase: 'ligas',  proxFase: 'perfil', proxRota: '/aluno/perfil', proxLabel: 'Ir para o Perfil' },
  '/aluno/perfil': { fase: 'perfil' },
}

// Boas-vindas + áreas de spotlight de cada capítulo pós-Início (a Início é montada à parte, por ter
// dashboard e level-up). Passos cujo alvo não existe são pulados automaticamente.
const WELCOME_CAP: Record<string, { pose: ReacaoMascote; titulo: string; texto: string }> = {
  // A Trilha começa direto na área (2 partes), sem card de boas-vindas centralizado.
  '/aluno/ligas':  { pose: 'balanca', titulo: 'Bem-vindo às Ligas! 🏆',  texto: 'Essa é a arena da competição. Vem ver como funciona.' },
  '/aluno/perfil': { pose: 'coracao', titulo: 'Seu perfil 💜',           texto: 'Aqui fica tudo reunido sobre você — deixa eu te mostrar as novidades da gamificação.' },
}
const AREAS_CAP: Record<string, Area[]> = {
  '/aluno/trilha': [
    // Parte 1 — explicação rápida de como é (destaca a parte de cima da trilha).
    { pose: 'feliz',  titulo: 'Chegamos na Trilha!', texto: 'Rapidão: essa é a sua trilha de simulados, organizada por grupos — é só seguir de um pro outro. 🗺️', alvo: '[data-tour="trilha-pagina"]', topo: true },
    // Parte 2 — seguindo em frente.
    { pose: 'joinha', titulo: 'Bora avançar',        texto: 'Complete um grupo pra liberar o baú e seguir em frente. É só clicar num simulado pra começar! ✨', alvo: '[data-tour="trilha-pagina"]', topo: true },
  ],
  '/aluno/ligas': [
    { pose: 'balanca',   titulo: 'Escada de ligas', texto: 'Do Bronze até o topo — você sobe de divisão acumulando XP. Sua liga atual fica destacada. 🏆', alvo: '[data-tour="liga-escada"]' },
    { pose: 'estudante', titulo: 'Ranking',         texto: 'E aqui o ranking da sua liga: quem tem mais XP fica no topo. Bora subir de posição! 📊', alvo: '[data-tour="liga-ranking"]' },
  ],
  '/aluno/perfil': [
    { pose: 'satisfeita', titulo: 'Nível & XP',         texto: 'Seu nível, a barra de XP e o progresso agora aparecem aqui no perfil, com anel e tudo. ⚡', alvo: '[data-tour="perfil-nivel"]' },
    { pose: 'balanca',    titulo: 'Ranking & divisões', texto: 'Um mapa das divisões e o quanto falta pra próxima liga — novidade aqui no perfil. 🏆', alvo: '[data-tour="perfil-ranking"]' },
    { pose: 'coracao',    titulo: 'Conquistas',         texto: 'E todas as suas conquistas reunidas — cada medalha é uma meta batida. 🏅', alvo: '[data-tour="perfil-conquistas"]' },
    { pose: 'joinha',     titulo: 'Qualquer dúvida...', texto: 'Precisou de algo? É só tocar aqui na Ajuda que eu te explico o passo a passo. Bons estudos! ✨', alvo: '[data-tour="ajuda"]' },
  ],
}

/** Texto em "máquina de escrever" — revela caractere a caractere. */
function Maquina({ texto }: { texto: string }) {
  const [n, setN] = useState(0)
  useEffect(() => {
    setN(0)
    let x = 0
    const id = setInterval(() => { x++; setN(x); if (x >= texto.length) clearInterval(id) }, 15)
    return () => clearInterval(id)
  }, [texto])
  return <>{texto.slice(0, n)}{n < texto.length && <span className="ml-0.5 inline-block w-[2px] animate-pulse bg-primary align-middle" style={{ height: '1em' }} />}</>
}

/**
 * Tour guiado da MASCOTE apresentando a gamificação (uma vez, após a atualização).
 * Fluxo: boas-vindas → dashboard de novidades (níveis/sequência/ligas/trilha) → [level-up, se o
 * aluno já fez simulado e vai subir de nível — a capivara acompanha] → áreas passo a passo
 * (nível/painel → trilha → ligas → perfil → ajuda). Pose muda por etapa, texto animado, spotlight.
 */
export function MascoteTour({ nome = 'Capi', ativo = true, temSimulado = false, nivel = 1 }: { nome?: string; ativo?: boolean; temSimulado?: boolean; nivel?: number }) {
  const pathname = usePathname()
  const router = useRouter()
  const cap = CAPS[pathname]
  const vaiUparNivel = temSimulado && nivel > 1

  const [passos, setPassos] = useState<Passo[]>([])
  const [etapa, setEtapa] = useState(0)
  const [rodando, setRodando] = useState(false)
  const [saindo, setSaindo] = useState(false)
  const [aguardandoLevelup, setAguardandoLevelup] = useState(false)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const levelupFeito = useRef(false)

  // Monta os passos e inicia UMA vez. Capítulos: INÍCIO (boas-vindas → dashboard → [level-up] →
  // cards laterais, um a um) e, ao terminar, a capivara leva o aluno para a página de TRILHA,
  // onde uma nova instância (montada naquela página) retoma pela fase salva e explica ali.
  useEffect(() => {
    if (!ativo || !cap) return
    try { if (localStorage.getItem(KEY)) return } catch { /* ignore */ }
    let resume = ''
    try { resume = localStorage.getItem(RESUME) || '' } catch { /* ignore */ }
    if (resume !== cap.fase) return // não é a vez desta página
    const ehInicio = pathname === '/aluno'
    let cancel = false
    let tentativas = 0
    const comecar = () => {
      if (cancel) return
      let lista: Passo[] = []
      if (ehInicio) {
        const AREAS: Area[] = [
          // "Seu nível" só entra como spotlight quando NÃO houve level-up (senão o modal já mostrou).
          ...(vaiUparNivel ? [] : [{ pose: 'satisfeita' as ReacaoMascote, titulo: 'Seu nível', texto: 'A cada simulado e prática você ganha XP e sobe de nível. Seu progresso fica aqui!', alvo: '[data-tour="nivel"]' }]),
          // Coluna direita da Início — todos os cards, um de cada vez, na ordem da tela.
          { pose: 'cafe', titulo: 'Meta do dia', texto: 'Comece por aqui: bata a meta diária de XP pra manter o ritmo todo dia. ☕', alvo: '[data-tour="meta"]' },
          { pose: 'atencao', titulo: 'Sequência', texto: 'Faça seu check-in todo dia pra não perder a chama — a semana completa libera um baú! 🔥', alvo: '[data-tour="sequencia"]' },
          { pose: 'concluido', titulo: 'Missões', texto: 'Missões diárias com XP extra — cumpra e volte amanhã, elas renovam à meia-noite. ✅', alvo: '[data-tour="missoes"]' },
          { pose: 'balanca', titulo: 'Ligas', texto: 'Acumule XP e suba de liga: Bronze, Prata, Ouro... quem chega no topo? 🏆', alvo: '[data-tour="liga"]' },
          { pose: 'estudante', titulo: 'Ranking', texto: 'Veja como você está na sua liga — dá pra comparar por semana e por mês. Bora subir! 📊', alvo: '[data-tour="ranking"]' },
          { pose: 'coracao', titulo: 'Conquistas', texto: 'Acompanhe suas conquistas em progresso — cada meta batida vira uma medalha. 🏅', alvo: '[data-tour="conquistas"]' },
          // Fecho da Início: destaca o botão TRILHA do menu; ao pressionar "Ir para a Trilha", continua lá.
          { pose: 'ideia', titulo: 'Vamos pra Trilha!', texto: 'Agora bora ver a sua Trilha de simulados — é este item aqui do menu. Toca em "Ir para a Trilha" que eu sigo com você lá! 🗺️', alvo: '[data-tour="nav-trilha"]' },
        ]
        const areasValidas = AREAS.filter((a) => document.querySelector(a.alvo))
        if (!areasValidas.length) return
        lista = [
          { tipo: 'welcome', pose: 'feliz', titulo: `Oi! Eu sou ${nome} 🐾`, texto: 'Novidade: o portal agora é gamificado — deixei tudo mais divertido! Vem que eu te mostro rapidinho.' },
          { tipo: 'dashboard', pose: 'ideia', titulo: 'O que há de novo', texto: 'Preparei um resumão do que chegou. Dá uma olhada:' },
          ...areasValidas.map((a) => ({ tipo: 'area' as const, ...a })),
        ]
      } else {
        // Capítulos pós-Início (Trilha, Ligas, Perfil): boas-vindas + spotlights, montados na página.
        const welcome = WELCOME_CAP[pathname]
        const areas = AREAS_CAP[pathname] ?? []
        const areasValidas = areas.filter((a) => document.querySelector(a.alvo))
        // Passos que NÃO dependem de alvo (ex.: dashboard dos ícones da trilha) — sempre entram.
        const extra: Passo[] = pathname === '/aluno/trilha' ? [{ tipo: 'icones', pose: 'ideia', titulo: 'Os ícones da trilha', texto: '' }] : []
        // Dá um tempo p/ a página montar e os alvos aparecerem antes de desistir do spotlight.
        if (!areasValidas.length && tentativas++ < 12) { setTimeout(comecar, 250); return }
        lista = [
          ...(welcome ? [{ tipo: 'welcome' as const, ...welcome }] : []),
          ...areasValidas.map((a) => ({ tipo: 'area' as const, ...a })),
          ...extra,
        ]
        if (!lista.length) {
          // Nada pra mostrar aqui → segue para a próxima página (ou encerra).
          if (cap.proxFase && cap.proxRota) { try { localStorage.setItem(RESUME, cap.proxFase) } catch { /* ignore */ }; router.push(cap.proxRota) }
          else { try { localStorage.setItem(KEY, '1'); localStorage.removeItem(RESUME) } catch { /* ignore */ } }
          return
        }
      }
      if (!lista.length) return
      setPassos(lista)
      setEtapa(0)
      setTimeout(() => { if (!cancel) setRodando(true) }, 500)
    }
    // Só a Início espera o pop-up de entrada (banner pós-login); os demais capítulos são diretos.
    if (ehInicio && typeof document !== 'undefined' && document.querySelector('[data-portal-popup]')) {
      const fim = () => { window.removeEventListener('portal:popup-fechado', fim); clearTimeout(t); comecar() }
      window.addEventListener('portal:popup-fechado', fim)
      const t = setTimeout(() => { window.removeEventListener('portal:popup-fechado', fim); comecar() }, 15000)
      return () => { cancel = true; window.removeEventListener('portal:popup-fechado', fim); clearTimeout(t) }
    }
    const d = setTimeout(comecar, ehInicio ? 900 : 700)
    return () => { cancel = true; clearTimeout(d) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativo])

  const passo = passos[etapa]

  // Rola até o alvo e mede a posição (recalcula em resize/scroll).
  useEffect(() => {
    if (!rodando || aguardandoLevelup || passo?.tipo !== 'area' || !passo.alvo) { setRect(null); return }
    const el = document.querySelector(passo.alvo) as HTMLElement | null
    if (!el) { setRect(null); return }
    el.scrollIntoView({ behavior: 'smooth', block: passo.topo ? 'start' : 'center' })
    const medir = () => {
      const r = el.getBoundingClientRect()
      // `topo`: destaca só a faixa de cima (altura ~metade da tela), na largura cheia do elemento.
      if (passo.topo) { const h = Math.min(r.height, Math.round(window.innerHeight * 0.5)); setRect(new DOMRect(r.left, Math.max(8, r.top), r.width, h)) }
      else setRect(r)
    }
    const t = setTimeout(medir, 380)
    window.addEventListener('resize', medir)
    window.addEventListener('scroll', medir, true)
    return () => { clearTimeout(t); window.removeEventListener('resize', medir); window.removeEventListener('scroll', medir, true) }
  }, [rodando, etapa, passo, aguardandoLevelup])

  // Quando a celebração (level-up) disparada pelo tour termina → segue para as áreas.
  useEffect(() => {
    if (!aguardandoLevelup) return
    const fim = () => { setAguardandoLevelup(false); setEtapa((v) => v + 1) }
    window.addEventListener('tour:celebrar-fim', fim)
    return () => window.removeEventListener('tour:celebrar-fim', fim)
  }, [aguardandoLevelup])

  function fechar() {
    setSaindo(true)
    try { localStorage.setItem(KEY, '1'); localStorage.removeItem(RESUME) } catch { /* ignore */ }
    setTimeout(() => { setRodando(false); setSaindo(false) }, 380)
  }
  function proximo() {
    // Depois do dashboard, se o aluno vai subir de nível, dispara o level-up (a capivara acompanha).
    if (passo?.tipo === 'dashboard' && vaiUparNivel && !levelupFeito.current) {
      levelupFeito.current = true
      setAguardandoLevelup(true)
      window.dispatchEvent(new CustomEvent('tour:celebrar'))
      return
    }
    if (etapa >= passos.length - 1) {
      // Fim do capítulo: leva para a próxima página (se houver) ou encerra o tour.
      if (cap?.proxFase && cap.proxRota) {
        try { localStorage.setItem(RESUME, cap.proxFase) } catch { /* ignore */ }
        setSaindo(true)
        setTimeout(() => { router.push(cap.proxRota!) }, 360)
        return
      }
      fechar()
      return
    }
    setEtapa((v) => v + 1)
  }

  if (!rodando || typeof document === 'undefined') return null

  // Level-up aberto (CelebracaoXp/LevelUpModal): a própria tela de level-up já mostra a capivara
  // (sobre o cargo/Continuar). Aqui o tour só aguarda o `tour:celebrar-fim` para seguir.
  if (aguardandoLevelup) return null

  if (!passo) return null
  const ultimo = etapa === passos.length - 1
  const centrado = passo.tipo !== 'area' || !rect

  const controles = (
    <div className="mt-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-1">
        {passos.map((_, k) => <span key={k} className={cn('h-1.5 rounded-full transition-all', k === etapa ? 'w-4 bg-primary' : 'w-1.5 bg-muted-foreground/30')} />)}
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={fechar} className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">Pular</button>
        <button type="button" onClick={proximo} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90">
          {ultimo ? (cap?.proxLabel ? <>{cap.proxLabel} <ArrowRight className="h-4 w-4" /></> : <><Check className="h-4 w-4" /> Entendi!</>) : <>Próximo <ArrowRight className="h-4 w-4" /></>}
        </button>
      </div>
    </div>
  )

  return createPortal(
    <div className="fixed inset-0 z-[140]" aria-live="polite">
      <div className={cn('absolute inset-0 transition-colors', centrado ? 'bg-black/60 backdrop-blur-[1px]' : 'bg-transparent')} />

      {!centrado && rect && (
        <div className="pointer-events-none absolute rounded-2xl transition-all duration-500 ease-out"
          style={{ left: rect.left - 8, top: rect.top - 8, width: rect.width + 16, height: rect.height + 16, boxShadow: '0 0 0 9999px rgba(0,0,0,.62)', outline: '2px solid var(--brand-primary, var(--primary))', outlineOffset: 2 }} />
      )}

      {passo.tipo === 'dashboard' ? (
        // ── Dashboard de novidades: a capivara fora sinaliza cada card (sub-passos internos). ──
        <TourDashboard onConcluir={proximo} onPular={fechar} saindo={saindo} />
      ) : passo.tipo === 'icones' ? (
        // ── Mini-dashboard: os 3 estados dos ícones da trilha (estrela → check) ──
        <div className="absolute inset-0 flex items-center justify-center p-4">
          <div className={cn('w-full max-w-md rounded-3xl border bg-card p-6 shadow-2xl', saindo ? 'motion-safe:animate-[tour-out_.38s_ease-in_both]' : 'motion-safe:animate-[tour-in_.45s_cubic-bezier(.34,1.56,.64,1)_both]')}>
            <div className="mb-3 flex items-center gap-3">
              <Mascote key={etapa} reacao={passo.pose} tamanho={64} entra flutua />
              <div>
                <div className="text-lg font-extrabold text-primary">{passo.titulo}</div>
                <p className="text-xs text-muted-foreground">Assim você lê a trilha num olhar:</p>
              </div>
            </div>
            <TourIcones />
            {controles}
          </div>
        </div>
      ) : centrado ? (
        // ── Boas-vindas (card central) ──
        <div className="absolute inset-0 flex items-center justify-center p-4">
          <div className={cn('w-full max-w-sm rounded-3xl border bg-card p-6 text-center shadow-2xl', saindo ? 'motion-safe:animate-[tour-out_.38s_ease-in_both]' : 'motion-safe:animate-[tour-in_.45s_cubic-bezier(.34,1.56,.64,1)_both]')}>
            <div className="flex justify-center"><Mascote key={etapa} reacao={passo.pose} tamanho={150} entra flutua={false} /></div>
            <div className="mt-1 text-lg font-extrabold text-primary">{passo.titulo}</div>
            <p className="mx-auto mt-1.5 min-h-[3.5rem] max-w-[19rem] text-sm leading-snug text-foreground"><Maquina key={etapa} texto={passo.texto} /></p>
            {controles}
          </div>
        </div>
      ) : (
        // ── Etapas com alvo: card no rodapé + mascote ──
        <div className={cn('absolute inset-x-0 bottom-5 z-[1] flex justify-center px-4', saindo ? 'motion-safe:animate-[tour-out_.38s_ease-in_both]' : 'motion-safe:animate-[tour-in_.4s_cubic-bezier(.34,1.56,.64,1)_both]')}>
          <div className="flex w-full max-w-md items-end gap-2">
            <Mascote key={`m${etapa}`} reacao={passo.pose} tamanho={92} entra flutua className="shrink-0" />
            <div className="min-w-0 flex-1 rounded-2xl border bg-card p-4 shadow-2xl">
              <div className="text-sm font-bold text-primary">{passo.titulo}</div>
              <p className="mt-1 min-h-[2.5rem] text-sm leading-snug text-foreground"><Maquina key={etapa} texto={passo.texto} /></p>
              {controles}
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  )
}
