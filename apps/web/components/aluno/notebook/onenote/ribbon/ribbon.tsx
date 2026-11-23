'use client'
// Faixa de opções (ribbon) do Caderno OneNote: linha de abas + painel de grupos. Clássico (compacto, 2 linhas) e simplificado (uma linha).
// Opções de exibição: mostrar sempre / só abas / ocultar automaticamente. Preferências em localStorage.
import { memo, useEffect, useState } from 'react'
import { ChevronUp } from 'lucide-react'
import { useMenuAncorado } from '../menu-flutuante'
import { FONTE_UI, type ModoTela } from '../tipos'
import { FaixaRolavel } from '../faixa-rolavel'
import { BotaoRibbon } from './botao-ribbon'
import { RibbonMobile } from './ribbon-mobile'
import { ABAS_RIBBON, type GrupoRibbon, type ItemRibbon } from './definicao'

// Estilos do ribbon compacto: barra de rolagem fina nos tokens do tema + colapso progressivo dos rótulos (container query).
const CSS_RIBBON = [
  '.rb-c{display:none}',
  '.onenote-barra{scrollbar-width:thin;scrollbar-color:var(--line2) transparent;overflow-y:hidden}',
  '.onenote-barra::-webkit-scrollbar{height:8px}',
  '.onenote-barra::-webkit-scrollbar-track{background:color-mix(in srgb, var(--line) 35%, transparent);border-radius:999px}',
  '.onenote-barra::-webkit-scrollbar-thumb{background:var(--line2);border-radius:999px;border:1px solid transparent;background-clip:padding-box}',
  '.onenote-barra::-webkit-scrollbar-thumb:hover{background:var(--muted);background-clip:padding-box}',
  '@container rb (max-width:1400px){.rb-hc .rb-l{display:none}.rb-hc .rb-c{display:inline}}',
  '@container rb (max-width:1100px){.rb-b .rb-l,.rb-b .rb-c{display:none}.rb-b{padding:0 4px!important}}',
].join('')

type Segmento = { grande: ItemRibbon } | { itens: ItemRibbon[] }
/** Agrupa itens consecutivos pequenos em blocos de 2 linhas; botões grandes ocupam as 2 linhas sozinhos. */
function segmentar(itens: ItemRibbon[]): Segmento[] {
  const out: Segmento[] = []
  for (const it of itens) {
    if (it.grande) out.push({ grande: it })
    else { const u = out[out.length - 1]; if (u && 'itens' in u) u.itens.push(it); else out.push({ itens: [it] }) }
  }
  return out
}

const GrupoCompacto = memo(function GrupoCompacto({ g, primeiro }: { g: GrupoRibbon; primeiro: boolean }) {
  const segs = segmentar(g.itens)
  return (
    <div role="group" aria-label={g.rotulo} style={{ display: 'flex', flexDirection: 'column', flex: '0 0 auto', padding: '0 8px', borderLeft: primeiro ? 0 : '1px solid var(--line)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4, height: 56 }}>
        {segs.map((sg, i) => 'grande' in sg ? <BotaoRibbon key={sg.grande.id} item={sg.grande} simples={false} /> : (
          sg.itens.some((x) => x.linha) ? (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {[1, 2].map((l) => (
                <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 1, height: 27 }}>
                  {sg.itens.filter((x) => (x.linha ?? 1) === l).map((it) => <BotaoRibbon key={it.id} item={it} simples={false} />)}
                </div>
              ))}
            </div>
          ) : (
            <div key={i} style={{ display: 'grid', gridAutoFlow: 'column', gridTemplateRows: 'repeat(2, 27px)', gap: '2px 4px', alignItems: 'center', justifyItems: 'start' }}>
              {sg.itens.map((it) => <BotaoRibbon key={it.id} item={it} simples={false} />)}
            </div>
          )
        ))}
      </div>
      <div style={{ textAlign: 'center', fontSize: 10.5, lineHeight: '13px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{g.rotulo}</div>
    </div>
  )
})

type Exibicao = 'sempre' | 'abas' | 'auto'
const CHAVE = 'onenote:ribbon'

export const Ribbon = memo(function Ribbon({ abaForcada, onAba, modo = 'desktop', sinalRecolher = 0 }: { abaForcada?: string | null; onAba?: (id: string) => void; modo?: ModoTela; sinalRecolher?: number }) {
  const [aba, setAba] = useState('inicio')
  const [simplesPref, setSimples] = useState(false)
  const [exibicaoPref, setExibicao] = useState<Exibicao>('sempre')
  const [aberto, setAberto] = useState(false) // painel temporário em 'abas'/'auto'
  const { abrir, menu } = useMenuAncorado()
  // Mobile: simplificado + corpo recolhido (abre ao tocar na aba). Tablet: simplificado de uma linha, sempre visível. Desktop: preferências.
  const compacto = modo !== 'desktop'
  const simples = compacto || simplesPref
  const exibicao: Exibicao = modo === 'mobile' ? 'abas' : modo === 'tablet' ? 'sempre' : exibicaoPref
  const toque = compacto

  useEffect(() => {
    try {
      const j = JSON.parse(localStorage.getItem(CHAVE) ?? 'null')
      if (j?.simples) setSimples(true)
      if (j?.exibicao === 'abas' || j?.exibicao === 'auto') setExibicao(j.exibicao)
    } catch { /* sem storage */ }
  }, [])
  const salvar = (s: boolean, e: Exibicao) => { try { localStorage.setItem(CHAVE, JSON.stringify({ simples: s, exibicao: e })) } catch { /* ignora */ } }
  useEffect(() => { if (modo === 'mobile' && sinalRecolher) setAberto(false) }, [sinalRecolher, modo]) // começou a editar: recolhe
  useEffect(() => { if (abaForcada) { setAba(abaForcada); setAberto(true) } }, [abaForcada])

  const painelVisivel = exibicao === 'sempre' || aberto
  const abrirOpcoes = (el: HTMLElement) => abrir(el, [
    { titulo: 'Opções de exibição da faixa' },
    { rotulo: 'Mostrar faixa de opções', marcado: exibicao === 'sempre', onClick: () => { setExibicao('sempre'); salvar(simples, 'sempre') } },
    { rotulo: 'Mostrar somente guias', marcado: exibicao === 'abas', onClick: () => { setExibicao('abas'); setAberto(false); salvar(simples, 'abas') } },
    { rotulo: 'Ocultar automaticamente', marcado: exibicao === 'auto', onClick: () => { setExibicao('auto'); setAberto(false); salvar(simples, 'auto') } },
    { separador: true },
    { rotulo: 'Faixa de opções clássica', marcado: !simples, onClick: () => { setSimples(false); salvar(false, exibicao) } },
    { rotulo: 'Faixa de opções simplificada', marcado: simples, onClick: () => { setSimples(true); salvar(true, exibicao) } },
  ])

  // Mobile: barra rápida + gaveta "Ferramentas" (padrão do leitor). Hooks acima já rodaram; sem hooks condicionais.
  if (modo === 'mobile') return <RibbonMobile abaForcada={abaForcada} onAba={onAba} sinalRecolher={sinalRecolher} />

  if (exibicao === 'auto' && !aberto) {
    return (
      <div style={{ height: 6, background: 'var(--surface2)', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
        <button type="button" aria-label="Mostrar faixa de opções" title="Mostrar faixa de opções" onClick={() => setAberto(true)} onMouseEnter={() => setAberto(true)}
          style={{ display: 'block', width: '100%', height: 6, border: 0, background: 'transparent', cursor: 'pointer' }} />
        {menu}
      </div>
    )
  }

  const grupos = ABAS_RIBBON.find((a) => a.id === aba)?.grupos ?? []
  return (
    <div role="region" aria-label="Faixa de opções" style={{ flexShrink: 0, containerType: 'inline-size', containerName: 'rb', background: 'var(--surface)', borderBottom: '1px solid var(--line2)', fontFamily: FONTE_UI, color: 'var(--ink)' }}
      onMouseLeave={() => { if (exibicao === 'auto') setAberto(false) }}>
      <div style={{ display: 'flex', alignItems: 'stretch', height: toque ? 42 : 30, background: 'var(--surface2)', borderBottom: '1px solid var(--line)' }}>
      <FaixaRolavel role="tablist" ariaLabel="Abas da faixa de opções" fundo="var(--surface2)" wrapStyle={{ flex: 1 }}
        style={{ display: 'flex', alignItems: 'stretch', scrollSnapType: toque ? 'x proximity' : undefined }}>
        {ABAS_RIBBON.map((a) => {
          const on = a.id === aba && painelVisivel
          return (
            <button key={a.id} type="button" role="tab" aria-selected={a.id === aba} onClick={() => { setAba(a.id); onAba?.(a.id); if (exibicao !== 'sempre') setAberto((v) => (a.id === aba ? !v : true)) }}
              style={{
                position: 'relative', padding: toque ? '0 16px' : '0 14px', scrollSnapAlign: 'start', border: 0, background: on ? 'var(--surface)' : 'transparent', cursor: 'pointer', flexShrink: 0,
                fontFamily: 'inherit', fontSize: 13, fontWeight: on ? 700 : 500, color: on ? 'var(--brand)' : 'var(--ink)',
              }}>
              {a.rotulo}
              {on ? <span aria-hidden style={{ position: 'absolute', left: 8, right: 8, bottom: 0, height: 2, background: 'var(--brand)' }} /> : null}
            </button>
          )
        })}
      </FaixaRolavel>
        <button type="button" title="Opções de exibição da faixa de opções" aria-label="Opções de exibição da faixa de opções" aria-haspopup="menu"
          onClick={(e) => abrirOpcoes(e.currentTarget)}
          style={{ width: 34, border: 0, background: 'transparent', color: 'var(--muted)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <ChevronUp size={16} aria-hidden style={{ transform: exibicao === 'sempre' ? undefined : 'rotate(180deg)' }} />
        </button>
        {menu}
      </div>

      {painelVisivel ? (
        simples ? (
          <FaixaRolavel role="tabpanel" chave={aba + 's'} dica={toque} wrapStyle={{ display: 'flex' }}
            style={{ display: 'flex', alignItems: 'stretch', gap: 0, padding: '4px 8px', minHeight: toque ? 50 : 38, scrollSnapType: toque ? 'x proximity' : undefined }}>
            {grupos.map((g, gi) => (
              <div key={g.id} role="group" aria-label={g.rotulo} style={{ display: 'flex', flexDirection: 'column', flexShrink: 0, scrollSnapAlign: 'start', padding: '0 6px', borderLeft: gi ? '1px solid var(--line)' : 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'nowrap', gap: 2, flex: 1 }}>
                  {g.itens.map((it) => <BotaoRibbon key={it.id} item={it} simples toque={toque} />)}
                </div>
              </div>
            ))}
          </FaixaRolavel>
        ) : (
          <FaixaRolavel role="tabpanel" chave={aba} barra wrapStyle={{ display: 'flex', height: 80 }}
            style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-start', gap: 0, padding: '3px 6px 0', boxSizing: 'border-box' }}>
            {grupos.map((g, gi) => <GrupoCompacto key={g.id} g={g} primeiro={gi === 0} />)}
          </FaixaRolavel>
        )
      ) : null}
      <style>{CSS_RIBBON}</style>
    </div>
  )
})
