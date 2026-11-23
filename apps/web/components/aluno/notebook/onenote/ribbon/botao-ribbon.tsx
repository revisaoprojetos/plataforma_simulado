'use client'
// Botões do ribbon: grande/pequeno, com dropdown, paleta de cores ou seletor (fonte/tamanho). Habilitados só se há handler (useOneNoteCmd().tem).
import { memo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { useEstadoCmd, useOneNoteCmd, useTemCmd } from '../contexto-cmd'
import { MenuFlutuante, Popover, useMenuAncorado } from '../menu-flutuante'
import { tokenFundo } from '../tipos'
import type { ItemRibbon } from './definicao'

const base: React.CSSProperties = {
  border: '1px solid transparent', borderRadius: 4, background: 'transparent', color: 'var(--ink)', cursor: 'pointer',
  fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
}
const titulo = (it: ItemRibbon, habilitado = true) => (it.emBreve && !habilitado ? `${it.rotulo} — Em breve` : it.atalho ? `${it.rotulo} (${it.atalho})` : it.rotulo)

/** variante: 'ribbon' (padrão, desktop/tablet) | 'leitor' (ícone 38px da barra rápida, igual `.tl` do leitor) | 'folha' (bloco com rótulo >=48px da gaveta Ferramentas). */
export type VarianteBotao = 'ribbon' | 'leitor' | 'folha'

export const BotaoRibbon = memo(function BotaoRibbon({ item, simples, toque = false, variante = 'ribbon', aoExecutar }: { item: ItemRibbon; simples: boolean; toque?: boolean; variante?: VarianteBotao; aoExecutar?: () => void }) {
  const cmd = useOneNoteCmd()
  const { abrir, menu } = useMenuAncorado()
  const [paleta, setPaleta] = useState<{ x: number; y: number } | null>(null)
  // assina SÓ os ids deste botão (não re-renderiza quando outro botão muda de estado)
  const habilitado = useTemCmd(item.id, ...(item.menu ?? []).map((o) => o.id))
  const estadoItem = useEstadoCmd(item.id)
  const corCanetaEstado = useEstadoCmd<string>(`${item.id}.cor`)
  const ativo = !!item.alternar && estadoItem === true
  const I = item.icone
  const folha = variante === 'folha', leitor = variante === 'leitor'
  const grande = !!item.grande && !simples && !folha && !leitor
  const comRotulo = folha || grande || (!simples && !leitor && item.mostrarRotulo)

  if (item.seletor) return <Seletor item={item} habilitado={habilitado} toque={toque} folha={folha} />

  const abrirMenu = (el: HTMLElement) => {
    abrir(el, (item.menu ?? []).map((o) => ({
      rotulo: o.rotulo,
      desabilitado: !cmd.tem(o.id ?? item.id),
      onClick: () => { cmd.executar(o.id ?? item.id, o.payload); aoExecutar?.() },
    })))
  }
  // Canetas/marca-texto (aba Desenhar): 1º clique seleciona; clicar na ATIVA abre o popover de cor + espessura.
  const caneta = !!item.alternar && !!item.paleta && item.id.startsWith('desenho.')
  const corCaneta = caneta ? corCanetaEstado : undefined
  const principal = (el: HTMLElement) => {
    if (caneta && !ativo) { cmd.executar(item.id); aoExecutar?.(); return }
    if (item.paleta) { const r = el.getBoundingClientRect(); setPaleta({ x: r.left, y: r.bottom + 2 }); return }
    if (item.soMenu) { abrirMenu(el); return }
    cmd.executar(item.id)
    if (!item.alternar) aoExecutar?.()
  }

  const mostrarSeta = !!item.menu && !item.soMenu && !item.paleta
  const estilo: React.CSSProperties = {
    ...base,
    flexDirection: grande ? 'column' : 'row', gap: grande ? 1 : 4,
    minWidth: grande ? 54 : toque ? 40 : 27, height: grande ? (mostrarSeta ? 42 : 56) : toque ? 40 : 27, padding: grande ? '2px 6px' : '0 5px',
    fontSize: grande ? 11 : 11.5, lineHeight: 1.15, overflow: grande ? 'hidden' : undefined, textAlign: 'center',
    background: ativo ? 'var(--chip)' : 'transparent', borderColor: ativo ? 'var(--brandLine)' : 'transparent',
    opacity: habilitado ? 1 : 0.4, cursor: habilitado ? 'pointer' : 'default',
    ...(leitor ? { minWidth: 38, width: 38, height: 38, padding: 0, borderRadius: 7, boxShadow: ativo ? 'inset 0 0 0 1px var(--brandLine)' : undefined, borderColor: 'transparent' } : null),
    ...(folha ? { flex: 1, minWidth: 0, width: '100%', height: 'auto', minHeight: 48, padding: '0 12px', justifyContent: 'flex-start', gap: 10, fontSize: 13, textAlign: 'left' as const, borderRadius: 10, borderColor: ativo ? 'var(--brandLine)' : 'var(--line)' } : null),
  }

  return (
    <span style={{ display: 'inline-flex', flexDirection: grande ? 'column' : 'row', alignItems: 'center', ...(folha ? { display: 'flex', width: '100%', gap: 4 } : null) }}>
      <button type="button" className={`onenote-hover${grande || !item.rotuloCurto ? '' : ' rb-hc'}${comRotulo && !grande && !folha ? ' rb-b' : ''}`} disabled={!habilitado} title={titulo(item, habilitado)} aria-label={item.rotulo} aria-pressed={item.alternar ? !!ativo : undefined}
        onMouseDown={(e) => e.preventDefault()} onClick={(e) => principal(e.currentTarget)} style={estilo}>
        <I size={grande ? 22 : folha ? 20 : leitor ? 18 : 16} aria-hidden style={{ flexShrink: 0, color: !habilitado ? 'var(--muted)' : leitor && !ativo ? 'var(--ink)' : 'var(--brand)' }} />
        {corCaneta ? <span aria-hidden style={{ width: grande ? 26 : 16, height: 4, borderRadius: 2, background: corCaneta === 'tinta' ? 'var(--ink)' : corCaneta, border: '1px solid var(--line2)' }} /> : null}
        {comRotulo ? (folha ? <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{item.rotulo}</span>
          : grande ? <span style={{ maxWidth: 76, overflowWrap: 'anywhere', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{item.rotuloCurto ?? item.rotulo}</span>
          : <><span className="rb-l" style={{ whiteSpace: 'nowrap' }}>{item.rotulo}</span>{item.rotuloCurto ? <span className="rb-c" style={{ whiteSpace: 'nowrap' }}>{item.rotuloCurto}</span> : null}</>) : null}
        {(item.soMenu || item.paleta) ? <ChevronDown size={11} aria-hidden style={{ color: 'var(--muted)' }} /> : null}
      </button>
      {mostrarSeta ? (
        <button type="button" className="onenote-hover" disabled={!habilitado} aria-label={`Opções de ${item.rotulo}`} onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => abrirMenu(e.currentTarget)}
          style={{ ...base, width: grande ? 54 : folha ? 44 : leitor ? 20 : toque ? 22 : 14, height: grande ? 14 : folha ? 48 : leitor ? 38 : toque ? 40 : 27, opacity: habilitado ? 1 : 0.4, ...(folha ? { border: '1px solid var(--line)', borderRadius: 10 } : null) }}><ChevronDown size={11} aria-hidden /></button>
      ) : null}
      {menu}
      {paleta ? (
        <Popover x={paleta.x} y={paleta.y} onFechar={() => setPaleta(null)} minWidth={150}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, padding: 4 }}>
            {item.paleta!.map((c) => (
              <button key={c.nome} type="button" title={c.nome} aria-label={c.nome} onClick={() => { setPaleta(null); cmd.executar(item.id, c.valor); if (!caneta) aoExecutar?.() }}
                style={{
                  width: 36, height: 32, borderRadius: 3, border: '1px solid var(--line2)', cursor: 'pointer',
                  // cor-dado da paleta; chave de cor de página ('branco', 'padrao'...) vem de CORES_PAGINA
                  background: c.valor && c.valor.startsWith('#') ? c.valor : c.valor === 'tinta' ? 'var(--ink)' : swatchPagina(c.valor),
                  outline: caneta && c.valor === corCaneta ? '2px solid var(--brand)' : undefined, outlineOffset: 1,
                }} />
            ))}
          </div>
          {caneta ? <EspessuraCaneta id={item.id} /> : null}
        </Popover>
      ) : null}
    </span>
  )
})

/** Controle de espessura do popover da caneta (estado em `<id>.largura`; muda via comando `<id>.largura`). */
function EspessuraCaneta({ id }: { id: string }) {
  const cmd = useOneNoteCmd()
  const marca = id === 'desenho.marca_texto'
  const [min, max] = marca ? [8, 40] : [1, 12]
  const v = Number(useEstadoCmd(`${id}.largura`) ?? min)
  const cor = useEstadoCmd<string>(`${id}.cor`) ?? 'tinta'
  return (
    <div style={{ padding: '6px 6px 8px', borderTop: '1px solid var(--line)', marginTop: 4, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--muted)' }}>
        Espessura
        <input type="range" min={min} max={max} step={1} value={v} aria-label="Espessura da caneta" onChange={(e) => cmd.executar(`${id}.largura`, Number(e.target.value))} style={{ flex: 1 }} />
        <span style={{ width: 22, textAlign: 'right', color: 'var(--ink)' }}>{v}</span>
      </label>
      <div aria-hidden style={{ height: Math.max(2, Math.min(v, 28)), borderRadius: 999, background: cor === 'tinta' ? 'var(--ink)' : cor, opacity: marca ? 0.45 : 1, margin: '0 4px' }} />
    </div>
  )
}

function swatchPagina(chave: string | null): string {
  return tokenFundo(chave) ?? 'repeating-linear-gradient(45deg, var(--surface2) 0 4px, var(--line) 4px 8px)'
}

function Seletor({ item, habilitado, toque = false, folha = false }: { item: ItemRibbon; habilitado: boolean; toque?: boolean; folha?: boolean }) {
  const cmd = useOneNoteCmd()
  const [m, setM] = useState<{ x: number; y: number } | null>(null)
  const atual = useEstadoCmd<string>(item.id) ?? item.seletor!.padrao
  return (
    <>
      <button type="button" disabled={!habilitado} title={item.rotulo} aria-label={item.rotulo} aria-haspopup="menu" onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setM({ x: r.left, y: r.bottom + 2 }) }}
        style={{ ...base, justifyContent: 'space-between', gap: 4, width: folha ? '100%' : item.seletor!.largura, height: folha ? 48 : toque ? 40 : 26, borderRadius: folha ? 10 : 4, padding: '0 6px', fontSize: 12.5, border: '1px solid var(--line2)', background: 'var(--surface)', opacity: habilitado ? 1 : 0.45, cursor: habilitado ? 'pointer' : 'default' }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{atual}</span><ChevronDown size={11} aria-hidden />
      </button>
      {m ? <MenuFlutuante x={m.x} y={m.y} onFechar={() => setM(null)} minWidth={item.seletor!.largura}
        itens={item.seletor!.opcoes.map((o) => ({ rotulo: o, marcado: o === atual, onClick: () => cmd.executar(item.id, o) }))} /> : null}
    </>
  )
}
