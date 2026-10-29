'use client'

// Cronograma Adaptativo 2.0 — PORTE FIEL do modelo, embutido em IFRAME (mesmo padrão
// do leitor Juris / arcade). HTML em public/cronograma/adaptativo/index.html (modo "embed").
// Persistência via /api/aluno/cronograma/adaptativo (backend real).
// Aqui: (1) altura disponível sem scroll duplo; (2) injeta as CORES DA MARCA do portal
// (tokens resolvidos, claro/escuro) no iframe, que remapeia a paleta do modelo.

import { useCallback, useEffect, useRef, useState } from 'react'
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

export function CronogramaAdaptativoEmbed({ theme, novo }: { theme: InternaTheme; novo?: boolean }) {
  const ref = useRef<HTMLIFrameElement | null>(null)
  const [altura, setAltura] = useState<number>(720)
  // Cache-bust em DEV: o navegador cacheia o index.html do iframe por URL (o `v` só muda a cada deploy),
  // então mudanças no iframe não apareciam em dev. Um nonce por MONTAGEM força o fetch fresco sem recarregar
  // a cada re-render (useState roda uma vez). Em produção fica vazio (usa só o `v` do APP_VERSION).
  const [bust] = useState(() => (process.env.NODE_ENV === 'development' ? `&cb=${Date.now()}` : ''))
  // "+ Novo cronograma" (vindo do HUB do painel via /aluno/cronograma?novo=1): abre o embed direto na
  // tela CONFIGURAR/MONTAR. Usa o hash `#configurar` (tela válida que o boot do iframe respeita e NÃO
  // sobrescreve para "hoje" — ver public/cronograma/adaptativo/index.html). Definido só após montar,
  // para não quebrar a hidratação (SSR renderiza sem hash; o cliente ajusta e recarrega uma vez).
  const [hash, setHash] = useState('')
  useEffect(() => {
    const querNovo = novo || (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('novo') === '1')
    if (querNovo) setHash('#configurar')
  }, [novo])

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

  // Handshake: o iframe avisa quando está pronto (boot assíncrono troca de tela depois do onLoad);
  // respondemos reenviando o tema para que o roxo da marca entre mesmo se o 1º envio chegou cedo demais.
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      const d = (e?.data || {}) as { type?: string }
      if (d.type === 'rej-crono-ready') enviarTema()
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [enviarTema])

  const modo = theme === 'escuro' ? 'dark' : 'light'
  return (
    <div style={{ width: '100%', margin: 0 }}>
      <iframe
        ref={ref}
        src={`/cronograma/adaptativo/index.html?theme=${modo}&v=${APP_VERSION}${hash}`}
        title="Cronograma Adaptativo"
        onLoad={() => { enviarTema(); setTimeout(enviarTema, 120); setTimeout(enviarTema, 400); setTimeout(enviarTema, 1000) }}
        style={{ width: '100%', height: altura, border: 0, display: 'block', background: 'transparent' }}
        allow="clipboard-write"
      />
    </div>
  )
}
