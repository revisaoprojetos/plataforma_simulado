'use client'
// Ribbon no MOBILE (<768px), no padrão do LEITOR de materiais (public/leitura/leitor-jus.html):
//  - barra rápida de marcação = `.anbar` (linha 220/315: padding 4px 12px, borda inferior, ferramentas `.tl` em grupos `.tg` separados por
//    border-left, linhas 385-393) — aqui: desfazer/refazer | negrito/itálico/sublinhado | listas | título/realce, mais o botão "Ferramentas";
//  - "Ferramentas" abre uma gaveta de baixo (bottom sheet) = `.menu` do leitor no mobile (@media max-width:720px, linha 1044:
//    fixed bottom, raio 16px 16px 0 0, max-height 80vh, padding-bottom safe-area). Dentro: as MESMAS abas/grupos do ribbon
//    (ABAS_RIBBON) em seções verticais com alvos >=48px. Nenhuma função some; os ids de comando são os do ribbon.
import { useEffect, useState } from 'react'
import { Heading2, Redo2, SlidersHorizontal, Undo2, X, type LucideIcon } from 'lucide-react'
import { FaixaRolavel } from '../faixa-rolavel'
import { FONTE_UI } from '../tipos'
import { BotaoRibbon } from './botao-ribbon'
import { ABAS_RIBBON, type ItemRibbon } from './definicao'

const achar = (id: string): ItemRibbon | undefined => ABAS_RIBBON.flatMap((a) => a.grupos).flatMap((g) => g.itens).find((i) => i.id === id)
const custom = (id: string, rotulo: string, icone: LucideIcon, atalho?: string): ItemRibbon => ({ id, rotulo, icone, atalho })

/** Grupos da barra rápida (`.tg`). Itens inexistentes na definição são ignorados (a definição é a fonte de verdade). */
const GRUPOS_RAPIDOS: (ItemRibbon | undefined)[][] = [
  [custom('edicao.desfazer', 'Desfazer', Undo2, 'Ctrl+Z'), custom('edicao.refazer', 'Refazer', Redo2, 'Ctrl+Y')],
  [achar('fmt.negrito'), achar('fmt.italico'), achar('fmt.sublinhado')],
  [achar('fmt.marcadores'), achar('fmt.numeracao')],
  [{ ...custom('estilo.h2', 'Título', Heading2, 'Ctrl+Alt+2') }, achar('fmt.realce')],
]

export function RibbonMobile({ abaForcada, onAba, sinalRecolher = 0 }: { abaForcada?: string | null; onAba?: (id: string) => void; sinalRecolher?: number }) {
  const [aberta, setAberta] = useState(false)
  const [aba, setAba] = useState('inicio')
  useEffect(() => { if (sinalRecolher) setAberta(false) }, [sinalRecolher])
  useEffect(() => { if (abaForcada) { setAba(abaForcada); setAberta(true) } }, [abaForcada])
  useEffect(() => {
    if (!aberta) return
    const t = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberta(false) }
    document.addEventListener('keydown', t); return () => document.removeEventListener('keydown', t)
  }, [aberta])

  const grupos = ABAS_RIBBON.find((a) => a.id === aba)?.grupos ?? []
  return (
    <>
      <div role="toolbar" aria-label="Ferramentas rápidas de formatação"
        style={{ flexShrink: 0, display: 'flex', alignItems: 'center', background: 'var(--surface)', borderBottom: '1px solid var(--line)', fontFamily: FONTE_UI, color: 'var(--ink)' }}>
        <FaixaRolavel fundo="var(--surface)" dica wrapStyle={{ flex: 1 }} style={{ display: 'flex', alignItems: 'center', padding: '4px 8px' }}>
          {GRUPOS_RAPIDOS.map((g, gi) => (
            <div key={gi} role="group" style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0, padding: '0 4px', borderLeft: gi ? '1px solid var(--line)' : 0 }}>
              {g.filter((i): i is ItemRibbon => !!i).map((it) => <BotaoRibbon key={it.id} item={it} simples toque variante="leitor" />)}
            </div>
          ))}
        </FaixaRolavel>
        <button type="button" onClick={() => setAberta((v) => !v)} aria-label="Ferramentas" title="Todas as ferramentas" aria-haspopup="dialog" aria-expanded={aberta}
          onMouseDown={(e) => e.preventDefault()}
          style={{
            flexShrink: 0, width: 44, height: 42, margin: '0 0 0 2px', border: 0, borderLeft: '1px solid var(--line)', background: aberta ? 'var(--chip)' : 'transparent',
            color: aberta ? 'var(--brand)' : 'var(--ink)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}><SlidersHorizontal size={18} aria-hidden /></button>
      </div>

      {aberta ? (
        <>
          <div onClick={() => setAberta(false)} aria-hidden style={{ position: 'absolute', inset: 0, zIndex: 65, background: 'color-mix(in srgb, var(--ink) 40%, transparent)' }} />
          <div role="dialog" aria-modal="true" aria-label="Ferramentas" className="onenote-sheet"
            style={{
              position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 70, display: 'flex', flexDirection: 'column', maxHeight: '80%', background: 'var(--surface)', color: 'var(--ink)',
              border: '1px solid var(--line)', borderBottom: 0, borderRadius: '16px 16px 0 0', fontFamily: FONTE_UI,
              boxShadow: '0 -12px 32px -12px color-mix(in srgb, var(--ink) 45%, transparent)', paddingBottom: 'env(safe-area-inset-bottom, 0px)',
            }}>
            <div style={{ display: 'flex', alignItems: 'center', height: 46, padding: '0 6px 0 16px', flexShrink: 0 }}>
              <span style={{ flex: 1, fontSize: 14, fontWeight: 700 }}>Ferramentas</span>
              <button type="button" onClick={() => setAberta(false)} aria-label="Fechar ferramentas"
                style={{ width: 44, height: 44, border: 0, background: 'transparent', color: 'var(--ink)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><X size={18} aria-hidden /></button>
            </div>
            <FaixaRolavel role="tablist" ariaLabel="Abas das ferramentas" wrapStyle={{ flexShrink: 0, borderBottom: '1px solid var(--line)' }} style={{ display: 'flex' }}>
              {ABAS_RIBBON.map((a) => {
                const on = a.id === aba
                return (
                  <button key={a.id} type="button" role="tab" aria-selected={on} onClick={() => { setAba(a.id); onAba?.(a.id) }}
                    style={{
                      flexShrink: 0, height: 44, padding: '0 16px', border: 0, borderBottom: `2px solid ${on ? 'var(--brand)' : 'transparent'}`, marginBottom: -1, background: 'transparent',
                      fontFamily: 'inherit', fontSize: 13, fontWeight: on ? 700 : 500, color: on ? 'var(--brand)' : 'var(--ink)', cursor: 'pointer', whiteSpace: 'nowrap',
                    }}>{a.rotulo}</button>
                )
              })}
            </FaixaRolavel>
            <div role="tabpanel" style={{ overflowY: 'auto', overscrollBehavior: 'contain', padding: '4px 12px 14px', minHeight: 0 }}>
              {grupos.map((g, gi) => (
                <section key={g.id} aria-label={g.rotulo} style={{ paddingTop: gi ? 12 : 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)', padding: '4px 2px 8px' }}>{g.rotulo}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 150px), 1fr))', gap: 8 }}>
                    {g.itens.map((it) => <BotaoRibbon key={it.id} item={it} simples toque variante="folha" aoExecutar={() => setAberta(false)} />)}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </>
  )
}
