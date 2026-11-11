'use client'

// Cronograma Adaptativo 2.0 — PORTE FIEL do modelo, embutido em IFRAME (mesmo padrão
// do leitor Juris / arcade). HTML em public/cronograma/adaptativo/index.html (modo "embed").
// Persistência via /api/aluno/cronograma/adaptativo (backend real).
// Aqui: (1) altura disponível sem scroll duplo; (2) injeta as CORES DA MARCA do portal
// (tokens resolvidos, claro/escuro) no iframe, que remapeia a paleta do modelo.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { InternaTheme } from '../interna-tokens'
import { APP_VERSION } from '@/lib/version'

// Resolve um token CSS do portal para uma cor usável (rgb), seguindo cadeias de var().
function resolverCor(varName: string): string {
  try {
    const probe = document.createElement('span')
    probe.style.cssText = `position:absolute;left:-9999px;color:var(${varName})`
    document.body.appendChild(probe)
    const c = getComputedStyle(probe).color
    probe.remove()
    return c || ''
  } catch { return '' }
}

// modo 'ver' (default): plano FIXADO do aluno. modo 'criar': novo cronograma — o iframe abre direto em
// "configurar" com estado limpo e só grava no clique de Gerar/Salvar (ver public/cronograma/adaptativo/index.html).
// `novo` (legado) equivale a modo 'criar'.
// modo 'revisao-fixo': plano do cronograma REVISÃO (emissão, grade congelada) nas MESMAS telas Hoje/Semana, somente leitura do plano
// (dados de /api/aluno/cronograma/revisao-iframe; ver lib/cronograma/revisao-iframe.ts). Exige `emissaoId`. `iframeRef` expõe o
// <iframe> ao portal (ele responde ao iframe: título novo / PDF em andamento).
export function CronogramaAdaptativoEmbed({ theme, modo = 'ver', novo, emissaoId, abaInicial, iframeRef }: {
  theme: InternaTheme
  modo?: 'ver' | 'criar' | 'revisao-fixo'
  novo?: boolean
  emissaoId?: string
  abaInicial?: 'hoje' | 'semana' | 'configurar'
  iframeRef?: { current: HTMLIFrameElement | null }
}) {
  const revisaoFixo = modo === 'revisao-fixo' && !!emissaoId
  const criar = !revisaoFixo && (modo === 'criar' || !!novo)
  const router = useRouter()
  // Erro de carga visível + "Tentar de novo": se o iframe não sinalizar "pronto" a tempo, mostra aviso e permite remontar.
  const [tentativa, setTentativa] = useState(0)
  const [semSinal, setSemSinal] = useState(false)
  const ref = useRef<HTMLIFrameElement | null>(null)
  const [altura, setAltura] = useState<number>(720)
  // Cache-bust em DEV: o navegador cacheia o index.html do iframe por URL (o `v` só muda a cada deploy),
  // então mudanças no iframe não apareciam em dev. Um nonce por MONTAGEM força o fetch fresco sem recarregar
  // a cada re-render (useState roda uma vez). Em produção fica vazio (usa só o `v` do APP_VERSION).
  const [bust] = useState(() => (process.env.NODE_ENV === 'development' ? `&cb=${Date.now()}` : ''))
  // Animação de entrada: enquanto o iframe não terminou de carregar, mostramos um loader; ao ficar
  // pronto, o cronograma entra com fade + leve subida. (O iframe já se auto-oculta até estar estilizado.)
  const [pronto, setPronto] = useState(false)
  // Modo criar já na 1ª montagem do src (query `modo=criar` + hash `#configurar`): o iframe carrega UMA vez.
  const query = criar ? '&modo=criar' : revisaoFixo ? `&modo=revisao-fixo&emissao=${encodeURIComponent(emissaoId!)}` : ''
  const hash = criar ? '#configurar' : revisaoFixo && abaInicial ? `#${abaInicial}` : ''

  const enviarTema = useCallback(() => {
    const win = ref.current?.contentWindow
    if (!win) return
    const dark = typeof document !== 'undefined' && (document.documentElement.classList.contains('dark') || document.documentElement.getAttribute('data-theme') === 'dark')
    const vars = {
      theme: dark ? 'dark' : 'light',
      background: resolverCor('--background'),
      card: resolverCor('--card'),
      muted: resolverCor('--muted'),
      foreground: resolverCor('--foreground'),
      mutedForeground: resolverCor('--muted-foreground'),
      border: resolverCor('--border'),
      brandPrimary: resolverCor('--brand-primary') || resolverCor('--primary'),
      primary: resolverCor('--primary'),
      brandAccent: resolverCor('--brand-accent') || resolverCor('--primary'),
      contentTitle: resolverCor('--content-title') || resolverCor('--foreground'),
    }
    try { win.postMessage({ type: 'rej-crono-tema', vars }, '*') } catch { /* ignore */ }
  }, [])

  // Ao SAIR do cronograma, marca o painel como "sujo": o aluno pode ter criado/alterado um plano aqui,
  // então a próxima visita ao "Meu painel de estudos" relê o servidor (o Router Cache do Next poderia
  // servir uma versão anterior à criação, deixando o card do cronograma sem aparecer).
  useEffect(() => () => { try { sessionStorage.setItem('rej-crono-dirty', '1') } catch { /* ignore */ } }, [])

  // Altura = viewport disponível (sem scroll duplo). O iframe ROLA INTERNAMENTE — assim os elementos
  // sticky do modelo (ex.: card "Resumo") acompanham a rolagem e não sobra espaço no rodapé. O breadcrumb
  // vive DENTRO do iframe (topo do conteúdo), então rola junto com o conteúdo sem ficar fixo por cima.
  useEffect(() => {
    function medir() {
      const el = ref.current
      if (!el) return
      const top = el.getBoundingClientRect().top
      setAltura(Math.max(520, Math.round(window.innerHeight - top)))
    }
    medir()
    window.addEventListener('resize', medir)
    const t = setTimeout(medir, 200)
    return () => { window.removeEventListener('resize', medir); clearTimeout(t) }
  }, [])

  // Re-envia as cores quando o portal troca claro/escuro (muda classe/data-theme no <html>).
  useEffect(() => {
    const obs = new MutationObserver(() => enviarTema())
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] })
    return () => obs.disconnect()
  }, [enviarTema])

  // "Iniciar meta" / "Abrir material" no iframe → abre o conteúdo no leitor v2 na MESMA aba, via
  // router (mostra a barra de carregamento). Só aceita rotas internas /aluno/ (segurança).
  useEffect(() => {
    function onAbrir(e: MessageEvent) {
      const d = (e?.data || {}) as { type?: string; url?: string }
      if (d.type === 'rej-crono-abrir' && typeof d.url === 'string' && d.url.startsWith('/aluno/')) {
        try { window.dispatchEvent(new Event('navprogress:start')) } catch { /* ignore */ } // acende a linha de carregamento
        router.push(d.url)
      }
    }
    window.addEventListener('message', onAbrir)
    return () => window.removeEventListener('message', onAbrir)
  }, [router])

  // Handshake: o iframe avisa quando está pronto (boot assíncrono troca de tela depois do onLoad);
  // respondemos reenviando o tema para que o roxo da marca entre mesmo se o 1º envio chegou cedo demais.
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      const d = (e?.data || {}) as { type?: string }
      // O iframe avisando "pronto" libera o loader (não depende só do onLoad do React).
      if (d.type === 'rej-crono-ready') { recebeuReady.current = true; setSemSinal(false); enviarTema(); setPronto(true) }
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [enviarTema])

  // O loader NUNCA pode ficar preso: o <iframe> é renderizado no SSR e pode terminar de carregar ANTES da
  // hidratação → o `onLoad` do React não dispara. O sinal certo é o postMessage 'rej-crono-ready' do iframe;
  // fallbacks: (1) iframe já completo ao montar; (2) teto de 4s só para o loader (o iframe fica visível);
  // (3) sem sinal em 20s → aviso visível com "Tentar de novo" (remonta o iframe).
  const recebeuReady = useRef(false)
  useEffect(() => {
    recebeuReady.current = false
    setSemSinal(false)
    try {
      const doc = ref.current?.contentDocument
      if (doc && doc.readyState === 'complete' && doc.location.href !== 'about:blank') { enviarTema(); setPronto(true) }
    } catch { /* ignore */ }
    const t = setTimeout(() => setPronto(true), 4000)
    const t2 = setTimeout(() => { if (!recebeuReady.current) setSemSinal(true) }, 20000) // 20s (era 10s): o HTML do iframe tem ~2MB e o servidor pode estar ocupado
    return () => { clearTimeout(t); clearTimeout(t2) }
  }, [enviarTema, tentativa])

  const tema = theme === 'escuro' ? 'dark' : 'light'
  return (
    <div style={{ position: 'relative', width: '100%', margin: 0, minHeight: altura }}>
      <style>{`@keyframes cr-spin{to{transform:rotate(360deg)}}@keyframes cr-pulse{0%,100%{opacity:.55}50%{opacity:1}}`}</style>
      {!pronto && (
        <div aria-hidden="true" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, zIndex: 2, pointerEvents: 'none' }}>
          <div style={{ width: 46, height: 46, borderRadius: '50%', border: '3px solid color-mix(in srgb, var(--primary, #6d28d9) 22%, transparent)', borderTopColor: 'var(--primary, #6d28d9)', animation: 'cr-spin .8s linear infinite' }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--muted-foreground, #6b7280)', animation: 'cr-pulse 1.4s ease-in-out infinite' }}>Carregando seu cronograma…</div>
        </div>
      )}
      {semSinal && (
        <div role="alert" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, zIndex: 3, padding: 16, textAlign: 'center', background: 'color-mix(in srgb, var(--background, transparent) 90%, transparent)' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--foreground, inherit)' }}>O cronograma está demorando mais que o normal para abrir.</div>
          <div style={{ fontSize: 13, color: 'var(--muted-foreground, #6b7280)' }}>Pode ser a conexão ou o servidor ocupado. Aguarde um instante ou tente de novo.</div>
          <button type="button" onClick={() => { setPronto(false); setTentativa((n) => n + 1) }} style={{ padding: '9px 18px', borderRadius: 10, border: 0, fontWeight: 700, cursor: 'pointer', background: 'var(--primary, #6d28d9)', color: 'var(--primary-foreground, #fff)' }}>Tentar de novo</button>
        </div>
      )}
      <iframe
        key={tentativa}
        ref={(el) => { ref.current = el; if (iframeRef) iframeRef.current = el }}
        src={`/cronograma/adaptativo/index.html?theme=${tema}&v=${APP_VERSION}${bust}${query}${hash}`}
        title={revisaoFixo ? 'Cronograma Revisão' : 'Cronograma Adaptativo'}
        onLoad={() => { recebeuReady.current = true; setSemSinal(false); enviarTema(); setTimeout(enviarTema, 120); setTimeout(enviarTema, 400); setTimeout(enviarTema, 1000); setPronto(true) }}
        style={{ width: '100%', height: altura, border: 0, display: 'block', background: 'transparent', opacity: pronto ? 1 : 0, transform: pronto ? 'none' : 'translateY(10px)', transition: 'opacity .45s ease, transform .45s ease' }}
        allow="clipboard-write"
        suppressHydrationWarning /* o `cb=Date.now()` do dev difere entre SSR e cliente (só atributo `src`) */
      />
    </div>
  )
}
